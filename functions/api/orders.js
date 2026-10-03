// functions/api/orders.js
// Controlador de Pedidos y Ventas - Vendly SaaS (Multi-Tenant)
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth.js";
import { resolveTenant } from "./_tenant.js";
import { checkOrderLimit } from "./_plans.js";
import { z } from "zod";

function generateOrderId(prefix = "VEN") {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${ts}${rand}`;
}

const orderItemSchema = z.object({
    id: z.string().optional(),
    key: z.string().optional(),
    name: z.string().optional(),
    price: z.number().or(z.string().transform(v => parseFloat(v))),
    qty: z.number().int().min(1).default(1),
    options: z.record(z.any()).optional()
}).refine(data => data.id || data.key || data.name, {
    message: "Debe proveer un id, key o nombre del producto"
});

const createOrderSchema = z.object({
    clientName: z.string().min(2).max(100),
    clientPhone: z.string().min(6).max(30),
    deliveryType: z.enum(['delivery', 'retiro']).default('retiro'),
    deliveryAddress: z.string().max(300).optional().default(""),
    deliveryNotes: z.string().max(500).optional().default(""),
    paymentMethod: z.string().max(50).optional().default(""),
    paymentReference: z.string().max(100).optional().default(""),
    paymentReceipt: z.string().max(2000000).optional().nullable(),
    paymentReceiptUrl: z.string().max(2000).optional().nullable(),
    bcvRate: z.number().optional().nullable(),
    storePrefix: z.string().max(5).optional().default("VEN"),
    template: z.string().default("restaurant"),
    items: z.array(orderItemSchema).min(1),
    turnstileToken: z.string().optional()
});

async function verifyTurnstile(token, secret, ip) {
    if (!secret || !token) return false;
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData, method: 'POST'
        });
        const outcome = await result.json();
        return outcome.success;
    } catch {
        return false;
    }
}

/**
 * GET /api/orders - Admin only, filtrado por tenant
 */
export async function onRequestGet(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");

    try {
        if (orderId) {
            const order = await db.prepare(
                "SELECT * FROM orders WHERE id = ? AND tenant_id = ?"
            ).bind(orderId, tenantId).first();

            if (!order) {
                return new Response(JSON.stringify({ error: "Pedido no encontrado." }), { status: 404 });
            }
            const { results: items } = await db.prepare(
                "SELECT * FROM order_items WHERE order_id = ?"
            ).bind(orderId).all();
            return new Response(JSON.stringify({ ...order, items }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Listado paginado
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const offset = (page - 1) * limit;
        const statusFilter = url.searchParams.get("status");

        const conditions = ["tenant_id = ?"];
        const params = [tenantId];

        if (statusFilter && statusFilter !== "all") {
            conditions.push("status = ?");
            params.push(statusFilter);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");
        const { total } = await db.prepare(`SELECT COUNT(*) as total FROM orders ${whereClause}`).bind(...params).first();
        const { results: orders } = await db.prepare(
            `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all();

        return new Response(JSON.stringify({
            data: orders,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
    }
}

/**
 * POST /api/orders - Público, pero siempre ligado al tenant resuelto
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // Verificación de Límite de Pedidos Mensuales
    const limitCheck = await checkOrderLimit(db, tenant);
    if (!limitCheck.allowed) {
        return new Response(JSON.stringify({ 
            error: `El negocio ha alcanzado su límite de ${limitCheck.limit} pedidos permitidos este mes. Por favor, comunícate con el administrador.` 
        }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    try {
        const rawData = await request.json();
        const result = createOrderSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), { status: 400 });
        }

        const data = result.data;

        if (env.TURNSTILE_SECRET_KEY) {
            if (!data.turnstileToken) {
                return new Response(JSON.stringify({ error: "Verificación de seguridad requerida." }), { status: 400 });
            }
            const isHuman = await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
            if (!isHuman) {
                return new Response(JSON.stringify({ error: "No se pudo verificar que eres humano." }), { status: 403 });
            }
        }

        if (data.deliveryType === 'delivery' && !data.deliveryAddress) {
            return new Response(JSON.stringify({ error: "La dirección es requerida para el delivery." }), { status: 400 });
        }

        const prefix = data.storePrefix.toUpperCase();
        let orderId = generateOrderId(prefix);
        let isUnique = false, attempts = 0;
        while (!isUnique && attempts < 5) {
            const existing = await db.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
            if (!existing) isUnique = true;
            else { orderId = generateOrderId(prefix); attempts++; }
        }

        // Productos solo del tenant actual
        const { results: dbProducts } = await db.prepare(
            "SELECT id, name, price FROM products WHERE tenant_id = ?"
        ).bind(tenantId).all();
        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        // Leer tasa BCV del tenant
        let finalBcvRate = 36.50;
        try {
            const bcvSetting = await db.prepare(
                "SELECT value FROM settings WHERE key = 'bcv_rate' AND tenant_id = ?"
            ).bind(tenantId).first();
            if (bcvSetting && parseFloat(bcvSetting.value) > 0) finalBcvRate = parseFloat(bcvSetting.value);
            else if (data.bcvRate && data.bcvRate > 0) finalBcvRate = data.bcvRate;
        } catch {
            if (data.bcvRate && data.bcvRate > 0) finalBcvRate = data.bcvRate;
        }

        let totalItems = 0, totalPrice = 0.0;
        const statements = [];

        statements.push(
            db.prepare(
                "INSERT INTO orders (id, client_name, client_phone, delivery_type, delivery_address, delivery_notes, payment_method, payment_reference, payment_receipt_url, bcv_rate, total_bs, status, total_items, total_price, template, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
                orderId, data.clientName, data.clientPhone, data.deliveryType,
                data.deliveryAddress, data.deliveryNotes, data.paymentMethod,
                data.paymentReference, data.paymentReceiptUrl || data.paymentReceipt || null,
                finalBcvRate, 0.0, "pendiente", 0, 0.0, data.template, tenantId
            )
        );

        for (const item of data.items) {
            let matchedProduct = null;
            if (item.id && productMap.has(item.id)) matchedProduct = productMap.get(item.id);
            else if (item.key && productMap.has(item.key)) matchedProduct = productMap.get(item.key);
            else matchedProduct = dbProducts.find(p => p.name === item.name);

            const prodId = (matchedProduct ? matchedProduct.id : (item.id || item.key || 'item')).slice(0, 50);
            const price = matchedProduct ? parseFloat(matchedProduct.price) : item.price;
            const qty = item.qty;
            const prodName = (matchedProduct ? matchedProduct.name : (item.name || 'Producto')).slice(0, 150);

            let size = null;
            if (item.options) {
                const entries = Object.entries(item.options).filter(([_, v]) => v);
                if (entries.length === 1 && entries[0][0] === 'size') size = String(entries[0][1]).slice(0, 100);
                else if (entries.length > 0) size = entries.map(([k, v]) => `${k}: ${v}`).join(', ').slice(0, 200);
            }

            totalItems += qty;
            totalPrice += price * qty;

            statements.push(
                db.prepare("INSERT INTO order_items (order_id, product_id, product_name, size, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(orderId, prodId, prodName, size, qty, price)
            );
        }

        if (data.deliveryType === 'delivery') totalPrice += 5.0;
        const totalBs = Math.round((totalPrice * finalBcvRate) * 100) / 100;

        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ? WHERE id = ?")
            .bind(totalItems, totalPrice, totalBs, orderId)
        );

        await db.batch(statements);

        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'new_order_created', orderId, tenantId, clientName: data.clientName, totalPrice })
                }));
            } catch (e) { console.error("Webhook error:", e); }
        }

        return new Response(JSON.stringify({ success: true, orderId, totalItems, totalPrice, totalBs, bcvRate: finalBcvRate }), {
            status: 201, headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno al procesar el pedido." }), { status: 500 });
    }
}

/**
 * PUT /api/orders - Admin only, scoped por tenant
 */
export async function onRequestPut(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const { id, status, paymentMethod } = await request.json();
        if (!id || !status) return new Response(JSON.stringify({ error: "ID y Estado requeridos." }), { status: 400 });

        const validStatuses = ['pendiente', 'en_produccion', 'listo_entrega', 'completado', 'cancelado'];
        if (!validStatuses.includes(status)) return new Response(JSON.stringify({ error: "Estado no válido." }), { status: 400 });

        const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first();
        if (!order) return new Response(JSON.stringify({ error: "Pedido no encontrado." }), { status: 404 });

        const statements = [
            db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").bind(status, id, tenantId)
        ];

        if (status === "completado") {
            const existingSale = await db.prepare("SELECT id FROM sales WHERE order_id = ?").bind(id).first();
            if (!existingSale) {
                statements.push(
                    db.prepare("INSERT INTO sales (order_id, monto, metodo_pago, fecha, tenant_id) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)")
                    .bind(id, order.total_price, paymentMethod || order.payment_method || "WhatsApp / Por acordar", tenantId)
                );
            }
        }

        await db.batch(statements);

        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'order_status_updated', orderId: id, newStatus: status, tenantId, order })
                }));
            } catch (e) { console.error("Webhook error:", e); }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Error interno." }), { status: 500 });
    }
}

/**
 * DELETE /api/orders - Admin only, scoped por tenant
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return new Response(JSON.stringify({ error: "ID requerido." }), { status: 400 });

        await db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id).run();
        await db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: "Error interno." }), { status: 500 });
    }
}
