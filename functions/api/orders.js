// Controlador de Pedidos y Ventas - Vendly SaaS
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth.js";
import { z } from "zod";

/**
 * Genera un ID de pedido único y legible (ej: VEN-X9F4E)
 */
function generateOrderId(prefix = "VEN") {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${ts}${rand}`;
}

// Esquemas Zod para Validación
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
    clientName: z.string().min(2, "Nombre requerido").max(100),
    clientPhone: z.string().min(6, "Teléfono requerido").max(30),
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
    items: z.array(orderItemSchema).min(1, "Debe incluir al menos un producto"),
    turnstileToken: z.string().optional() // Token de captcha
});

async function verifyTurnstile(token, secret, ip) {
    if (!secret || !token) return false;
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    
    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData,
            method: 'POST',
        });
        const outcome = await result.json();
        return outcome.success;
    } catch (e) {
        return false;
    }
}

/**
 * GET /api/orders - Listar pedidos (Paginado) o ver detalle (Admin Only)
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;
    
    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");
    const template = url.searchParams.get("template");

    try {
        if (orderId) {
            const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
            if (!order) {
                return new Response(JSON.stringify({ error: "Pedido no encontrado." }), { status: 404 });
            }
            const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all();
            return new Response(JSON.stringify({ ...order, items }), { headers: { "Content-Type": "application/json" } });
        } else {
            // Listado paginado
            const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
            const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
            const offset = (page - 1) * limit;

            let conditions = [];
            let params = [];
            
            if (template && template !== "all") {
                conditions.push("template = ?");
                params.push(template);
            }

            const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
            
            const countQuery = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
            const { total } = await (params.length ? db.prepare(countQuery).bind(...params) : db.prepare(countQuery)).first();

            const dataQuery = `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            const { results: orders } = await db.prepare(dataQuery).bind(...params, limit, offset).all();
            
            return new Response(JSON.stringify({
                data: orders,
                meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
            }), { headers: { "Content-Type": "application/json" } });
        }
    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno" }), { status: 500 });
    }
}

/**
 * POST /api/orders - Crear un nuevo pedido (Público)
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    try {
        const rawData = await request.json();
        
        // Validación Zod
        const result = createOrderSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), { status: 400 });
        }

        const data = result.data;

        // Validación Turnstile (solo si está configurado en env)
        if (env.TURNSTILE_SECRET_KEY) {
            if (!data.turnstileToken) {
                return new Response(JSON.stringify({ error: "Verificación de seguridad requerida (Captcha)." }), { status: 400 });
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

        const { results: dbProducts } = await db.prepare("SELECT id, name, price FROM products").all();
        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        let finalBcvRate = 36.50;
        try {
            const bcvSetting = await db.prepare("SELECT value FROM settings WHERE key = 'bcv_rate'").first();
            if (bcvSetting && parseFloat(bcvSetting.value) > 0) finalBcvRate = parseFloat(bcvSetting.value);
            else if (data.bcvRate && data.bcvRate > 0) finalBcvRate = data.bcvRate;
        } catch (e) {
            if (data.bcvRate && data.bcvRate > 0) finalBcvRate = data.bcvRate;
        }

        let totalItems = 0, totalPrice = 0.0;
        const statements = [];

        statements.push(
            db.prepare(
                "INSERT INTO orders (id, client_name, client_phone, delivery_type, delivery_address, delivery_notes, payment_method, payment_reference, payment_receipt_url, bcv_rate, total_bs, status, total_items, total_price, template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
                orderId, data.clientName, data.clientPhone, data.deliveryType, data.deliveryAddress, data.deliveryNotes,
                data.paymentMethod, data.paymentReference, data.paymentReceiptUrl || data.paymentReceipt || null, finalBcvRate, 0.0, "pendiente", 0, 0.0, data.template
            )
        );

        for (const item of data.items) {
            let matchedProduct = null;
            if (item.id && productMap.has(item.id)) matchedProduct = productMap.get(item.id);
            else if (item.key && productMap.has(item.key)) matchedProduct = productMap.get(item.key);
            else matchedProduct = dbProducts.find(p => (item.key && p.id === item.key) || p.name === item.name);

            const prodId = matchedProduct ? matchedProduct.id : (item.id || item.key || 'item').slice(0, 50);
            const price = matchedProduct ? parseFloat(matchedProduct.price) : item.price;
            const qty = item.qty;
            const prodName = (matchedProduct ? matchedProduct.name : (item.name || 'Plato')).slice(0, 150);
            
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

        if (data.deliveryType === 'delivery') totalPrice += 5.0; // Costo de envío estático por ahora
        const totalBs = Math.round((totalPrice * finalBcvRate) * 100) / 100;

        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ? WHERE id = ?")
            .bind(totalItems, totalPrice, totalBs, orderId)
        );

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, orderId, totalItems, totalPrice, totalBs, bcvRate: finalBcvRate }), {
            status: 201, headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno al procesar el pedido." }), { status: 500 });
    }
}

/**
 * PUT /api/orders - Actualizar estado
 */
export async function onRequestPut(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    try {
        const { id, status, paymentMethod } = await request.json();

        if (!id || !status) return new Response(JSON.stringify({ error: "ID y Estado requeridos." }), { status: 400 });

        const validStatuses = ['pendiente', 'en_produccion', 'listo_entrega', 'completado', 'cancelado'];
        if (!validStatuses.includes(status)) return new Response(JSON.stringify({ error: "Estado no válido." }), { status: 400 });

        const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
        if (!order) return new Response(JSON.stringify({ error: "Pedido no encontrado." }), { status: 404 });

        const statements = [
            db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id)
        ];

        if (status === "completado") {
            const existingSale = await db.prepare("SELECT id FROM sales WHERE order_id = ?").bind(id).first();
            if (!existingSale) {
                statements.push(
                    db.prepare("INSERT INTO sales (order_id, monto, metodo_pago, fecha) VALUES (?, ?, ?, CURRENT_TIMESTAMP)")
                    .bind(id, order.total_price, paymentMethod || order.payment_method || "WhatsApp / Por acordar")
                );
            }
        }

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: "Error interno." }), { status: 500 });
    }
}

/**
 * DELETE /api/orders - Eliminar un pedido
 */
export async function onRequestDelete(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    try {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return new Response(JSON.stringify({ error: "ID requerido." }), { status: 400 });

        await db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id).run();
        await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: "Error interno." }), { status: 500 });
    }
}
