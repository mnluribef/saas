// functions/api/orders.ts
// Controlador de Pedidos y Ventas - Vendly SaaS (Multi-Tenant)
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { checkOrderLimit } from "./_plans";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

function generateOrderId(prefix = "VEN"): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${ts}${rand}`;
}

export const orderItemSchema = z.object({
    id: z.string().optional(),
    key: z.string().optional(),
    name: z.string().optional(),
    price: z.number().or(z.string().transform(v => parseFloat(v))),
    qty: z.number().int().min(1).default(1),
    options: z.record(z.string(), z.any()).optional()
}).refine(data => data.id || data.key || data.name, {
    message: "Debe proveer un id, key o nombre del producto"
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const createOrderSchema = z.object({
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
    turnstileToken: z.string().optional(),
    couponCode: z.string().max(30).optional().nullable()
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['pendiente', 'en_produccion', 'listo_entrega', 'completado', 'cancelado']),
    paymentMethod: z.string().optional(),
    paymentAmount: z.number().min(0).or(z.string().transform(v => parseFloat(v))).optional()
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export interface OrderRow {
    id: string;
    client_name: string;
    client_phone: string;
    delivery_type: string;
    delivery_address: string;
    delivery_notes: string;
    payment_method: string;
    payment_reference: string;
    payment_receipt_url: string | null;
    bcv_rate: number;
    total_bs: number;
    status: string;
    total_items: number;
    total_price: number;
    template: string;
    tenant_id: string;
    created_at: string;
    updated_at?: string;
}

export interface OrderItemRow {
    id?: number;
    order_id: string;
    product_id: string;
    product_name: string;
    size: string | null;
    quantity: number;
    unit_price: number;
}

interface ProductShortRow {
    id: string;
    name: string;
    price: number | string;
    stock: number;
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
    if (!secret || !token) return false;
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData, method: 'POST'
        });
        const outcome = await result.json() as { success: boolean };
        return outcome.success;
    } catch {
        return false;
    }
}

/**
 * GET /api/orders - Admin only, filtrado por tenant
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");

    try {
        if (orderId) {
            const order = await db.prepare(
                "SELECT * FROM orders WHERE id = ? AND tenant_id = ?"
            ).bind(orderId, tenantId).first<OrderRow>();

            if (!order) {
                return jsonResponse({ error: "Pedido no encontrado." }, 404);
            }
            const { results: items } = await db.prepare(
                "SELECT * FROM order_items WHERE order_id = ?"
            ).bind(orderId).all<OrderItemRow>();
            return jsonResponse({ ...order, items });
        }

        // Listado paginado
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const offset = (page - 1) * limit;
        const statusFilter = url.searchParams.get("status");

        const conditions: string[] = ["tenant_id = ?"];
        const params: (string | number)[] = [tenantId];

        if (statusFilter && statusFilter !== "all") {
            conditions.push("status = ?");
            params.push(statusFilter);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");
        const countRow = await db.prepare(`SELECT COUNT(*) as total FROM orders ${whereClause}`).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const { results: orders } = await db.prepare(
            `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all<OrderRow>();

        return jsonResponse({
            data: orders || [],
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        });

    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return jsonResponse({ error: "Error interno" }, 500);
    }
};

/**
 * POST /api/orders - Público, pero siempre ligado al tenant resuelto
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // Verificación de Límite de Pedidos Mensuales
    const limitCheck = await checkOrderLimit(db, tenant);
    if (!limitCheck.allowed) {
        return jsonResponse({ 
            error: `El negocio ha alcanzado su límite de ${limitCheck.limit} pedidos permitidos este mes. Por favor, comunícate con el administrador.` 
        }, 403);
    }

    try {
        const rawData = await request.json();
        const result = createOrderSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const data = result.data;

        if (env.TURNSTILE_SECRET_KEY) {
            if (!data.turnstileToken) {
                return jsonResponse({ error: "Verificación de seguridad requerida." }, 400);
            }
            const isHuman = await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
            if (!isHuman) {
                return jsonResponse({ error: "No se pudo verificar que eres humano." }, 403);
            }
        }

        if (data.deliveryType === 'delivery' && !data.deliveryAddress) {
            return jsonResponse({ error: "La dirección es requerida para el delivery." }, 400);
        }

        const prefix = data.storePrefix.toUpperCase();
        let orderId = generateOrderId(prefix);
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 5) {
            const existing = await db.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
            if (!existing) {
                isUnique = true;
            } else {
                orderId = generateOrderId(prefix);
                attempts++;
            }
        }

        // Productos solo del tenant actual
        const { results: rawDbProducts } = await db.prepare(
            "SELECT id, name, price, stock FROM products WHERE tenant_id = ?"
        ).bind(tenantId).all<ProductShortRow>();
        const dbProducts = rawDbProducts || [];
        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        // Validación previa de stock disponible
        for (const item of data.items) {
            let matchedProduct: ProductShortRow | undefined;
            if (item.id && productMap.has(item.id)) matchedProduct = productMap.get(item.id);
            else if (item.key && productMap.has(item.key)) matchedProduct = productMap.get(item.key);
            else matchedProduct = dbProducts.find(p => p.name === item.name);

            if (matchedProduct && matchedProduct.stock !== null && matchedProduct.stock !== -1) {
                if (matchedProduct.stock < item.qty) {
                    return jsonResponse({
                        error: `Stock insuficiente para "${matchedProduct.name}". Disponible: ${matchedProduct.stock}, Solicitado: ${item.qty}.`
                    }, 400);
                }
            }
        }

        // Leer tasa BCV del tenant
        let finalBcvRate = 36.50;
        try {
            const bcvSetting = await db.prepare(
                "SELECT value FROM settings WHERE key = 'bcv_rate' AND tenant_id = ?"
            ).bind(tenantId).first<{ value: string }>();
            if (bcvSetting && parseFloat(bcvSetting.value) > 0) {
                finalBcvRate = parseFloat(bcvSetting.value);
            } else if (data.bcvRate && data.bcvRate > 0) {
                finalBcvRate = data.bcvRate;
            }
        } catch {
            if (data.bcvRate && data.bcvRate > 0) finalBcvRate = data.bcvRate;
        }

        let totalItems = 0;
        let totalPrice = 0.0;
        const statements: D1PreparedStatement[] = [];

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
            let matchedProduct: ProductShortRow | undefined;
            if (item.id && productMap.has(item.id)) matchedProduct = productMap.get(item.id);
            else if (item.key && productMap.has(item.key)) matchedProduct = productMap.get(item.key);
            else matchedProduct = dbProducts.find(p => p.name === item.name);

            const prodId = (matchedProduct ? matchedProduct.id : (item.id || item.key || 'item')).slice(0, 50);
            const price = matchedProduct ? parseFloat(String(matchedProduct.price)) : item.price;
            const qty = item.qty;
            const prodName = (matchedProduct ? matchedProduct.name : (item.name || 'Producto')).slice(0, 150);

            let size: string | null = null;
            if (item.options) {
                const entries = Object.entries(item.options).filter(([_, v]) => v);
                if (entries.length === 1 && entries[0][0] === 'size') {
                    size = String(entries[0][1]).slice(0, 100);
                } else if (entries.length > 0) {
                    size = entries.map(([k, v]) => `${k}: ${v}`).join(', ').slice(0, 200);
                }
            }

            totalItems += qty;
            totalPrice += price * qty;

            // Descontar inventario de forma atómica si el producto tiene stock controlado
            if (matchedProduct && matchedProduct.stock !== null && matchedProduct.stock !== -1) {
                statements.push(
                    db.prepare(
                        "UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND stock >= ?"
                    ).bind(qty, matchedProduct.id, tenantId, qty)
                );
                matchedProduct.stock -= qty;
            }

            statements.push(
                db.prepare("INSERT INTO order_items (order_id, product_id, product_name, size, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(orderId, prodId, prodName, size, qty, price)
            );
        }

        const itemsTotal = totalPrice;
        let discountAmount = 0.0;
        let appliedCouponCode: string | null = null;

        // Validación y aplicación de cupón si fue proporcionado
        if (data.couponCode && data.couponCode.trim()) {
            const code = data.couponCode.trim().toUpperCase();
            const coupon = await db.prepare(
                "SELECT * FROM coupons WHERE code = ? AND tenant_id = ? AND active = 1"
            ).bind(code, tenantId).first<{
                id: number;
                code: string;
                discount_type: 'percentage' | 'fixed';
                discount_value: number;
                min_order_amount: number;
                max_uses: number;
                uses_count: number;
                expires_at: string | null;
            }>();

            if (coupon) {
                const isExpired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
                const reachedLimit = coupon.max_uses > 0 && coupon.uses_count >= coupon.max_uses;
                const meetsMinAmount = itemsTotal >= (coupon.min_order_amount || 0);

                if (!isExpired && !reachedLimit && meetsMinAmount) {
                    appliedCouponCode = coupon.code;
                    if (coupon.discount_type === 'percentage') {
                        discountAmount = Math.round((itemsTotal * (coupon.discount_value / 100)) * 100) / 100;
                    } else {
                        discountAmount = Math.min(itemsTotal, coupon.discount_value);
                    }
                    statements.push(
                        db.prepare("UPDATE coupons SET uses_count = uses_count + 1 WHERE id = ? AND tenant_id = ?")
                        .bind(coupon.id, tenantId)
                    );
                }
            }
        }

        let deliveryPrice = 5.0;
        try {
            const configJson = tenant?.config_json ? JSON.parse(tenant.config_json) : {};
            if (configJson?.labels?.deliveryOptionPrice !== undefined) {
                deliveryPrice = parseFloat(configJson.labels.deliveryOptionPrice);
            }
        } catch {}

        let finalTotalPrice = Math.max(0, itemsTotal - discountAmount);
        if (data.deliveryType === 'delivery') finalTotalPrice += deliveryPrice;
        finalTotalPrice = Math.round(finalTotalPrice * 100) / 100;
        const totalBs = Math.round((finalTotalPrice * finalBcvRate) * 100) / 100;

        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ? WHERE id = ?")
            .bind(totalItems, finalTotalPrice, totalBs, orderId)
        );

        await db.batch(statements);

        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        event: 'new_order_created', 
                        orderId, 
                        tenantId, 
                        clientName: data.clientName, 
                        totalPrice: finalTotalPrice,
                        discountAmount,
                        appliedCoupon: appliedCouponCode 
                    })
                }));
            } catch (e) {
                console.error("Webhook error:", e);
            }
        }

        return jsonResponse({
            success: true,
            orderId,
            totalItems,
            itemsTotal,
            discountAmount,
            appliedCoupon: appliedCouponCode,
            totalPrice: finalTotalPrice,
            totalBs,
            bcvRate: finalBcvRate
        }, 201);

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return jsonResponse({ error: "Error interno al procesar el pedido." }, 500);
    }
};

/**
 * PUT /api/orders - Admin only, scoped por tenant
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const bodyJson = await request.json();
        const parseResult = updateOrderStatusSchema.safeParse(bodyJson);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos de estado inválidos", details: parseResult.error.issues }, 400);
        }

        const { id, status, paymentMethod, paymentAmount } = parseResult.data;

        const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<OrderRow>();
        if (!order) return jsonResponse({ error: "Pedido no encontrado." }, 404);

        const statements = [
            db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").bind(status, id, tenantId)
        ];

        if (status === "completado") {
            const existingSale = await db.prepare("SELECT id FROM sales WHERE order_id = ?").bind(id).first();
            if (!existingSale) {
                const finalMonto = (paymentAmount !== undefined && !isNaN(Number(paymentAmount)) && Number(paymentAmount) >= 0)
                    ? Number(paymentAmount)
                    : order.total_price;
                statements.push(
                    db.prepare("INSERT INTO sales (order_id, monto, metodo_pago, fecha, tenant_id) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)")
                    .bind(id, finalMonto, paymentMethod || order.payment_method || "WhatsApp / Por acordar", tenantId)
                );
            }
        } else if (status === "cancelado" && order.status !== "cancelado") {
            // Restituir stock de los productos asociados a la orden
            const { results: items } = await db.prepare(
                "SELECT product_id, quantity FROM order_items WHERE order_id = ?"
            ).bind(id).all<{ product_id: string; quantity: number }>();

            for (const item of items || []) {
                statements.push(
                    db.prepare(
                        "UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND stock != -1"
                    ).bind(item.quantity, item.product_id, tenantId)
                );
            }
        }

        await db.batch(statements);

        // Generar enlace WhatsApp para notificar al cliente el cambio de estado con 1 clic
        let whatsappNotificationUrl: string | null = null;
        if (order.client_phone) {
            const cleanPhone = order.client_phone.replace(/\D/g, '');
            const formattedPhone = cleanPhone.startsWith('0') 
                ? '58' + cleanPhone.slice(1) 
                : (cleanPhone.length === 10 ? '58' + cleanPhone : cleanPhone);
            
            let messageText = `Hola ${order.client_name}, el estado de tu pedido #${order.id} es: ${status}.`;
            if (status === 'en_produccion') {
                messageText = `¡Hola ${order.client_name}! 👩‍🍳 Tu pedido #${order.id} ya está en preparación. Te avisaremos apenas esté listo.`;
            } else if (status === 'listo_entrega') {
                messageText = order.delivery_type === 'delivery'
                    ? `¡Hola ${order.client_name}! 🛵 Tu pedido #${order.id} ya está listo y va en camino a tu dirección: ${order.delivery_address || ''}.`
                    : `¡Hola ${order.client_name}! 🛍️ Tu pedido #${order.id} ya está listo para ser retirado en tienda.`;
            } else if (status === 'completado') {
                messageText = `¡Hola ${order.client_name}! 🎉 Tu pedido #${order.id} ha sido completado con éxito. ¡Muchas gracias por tu compra!`;
            } else if (status === 'cancelado') {
                messageText = `Hola ${order.client_name}. Te informamos que tu pedido #${order.id} ha sido cancelado. Si tienes alguna duda, estamos a la orden.`;
            }

            whatsappNotificationUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageText)}`;
        }

        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'order_status_updated', orderId: id, newStatus: status, tenantId, order })
                }));
            } catch (e) {
                console.error("Webhook error:", e);
            }
        }

        return jsonResponse({ 
            success: true,
            whatsappNotificationUrl
        });

    } catch (err) {
        console.error("Error en PUT /api/orders:", err);
        return jsonResponse({ error: "Error interno." }, 500);
    }
};

/**
 * DELETE /api/orders - Admin only, scoped por tenant
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return jsonResponse({ error: "ID requerido." }, 400);

        const order = await db.prepare(
            "SELECT id FROM orders WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).first();
        if (!order) return jsonResponse({ error: "Pedido no encontrado." }, 404);

        await db.batch([
            db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
            db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").bind(id, tenantId),
        ]);

        return jsonResponse({ success: true });
    } catch (err) {
        console.error("Error en DELETE /api/orders:", err);
        return jsonResponse({ error: "Error interno." }, 500);
    }
};
