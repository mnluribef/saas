// functions/api/orders.ts
// Controlador de Pedidos y Ventas - Vendly SaaS (Multi-Tenant)
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf } from "./_auth";
import { resolveTenant } from "./_tenant";
import { checkOrderLimit } from "./_plans";
import { getDB, jsonResponse, compressedJsonResponse } from "./_helpers";
import {
    generateOrderId,
    verifyTurnstile,
    generateWebhookSignature,
    resolveBcvRate,
    calculateOrderTotals
} from "./_order-service";
import { applyCoupon } from "./_coupon-service";
import { buildOrderStatusWhatsAppUrl } from "./_whatsapp";
import type { Env, PagesHandler, OrderEventRow } from '../types';

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
    paymentAmount: z.number().min(0).or(z.string().transform(v => parseFloat(v))).optional(),
    note: z.string().max(500).optional()
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
    coupon_code?: string | null;
    discount_amount?: number;
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

            // F-03: Incluir auditoría de eventos de cambio de estado
            const { results: events } = await db.prepare(
                "SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC"
            ).bind(orderId).all<OrderEventRow>();

            return jsonResponse({ ...order, items, events: events || [] });
        }

        // F-01: Soporte para paginación cursor-based (?after=order_id) y offset-based tradicional
        const after = url.searchParams.get("after");
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const statusFilter = url.searchParams.get("status");

        const conditions: string[] = ["tenant_id = ?"];
        const params: (string | number)[] = [tenantId];

        if (statusFilter && statusFilter !== "all") {
            conditions.push("status = ?");
            params.push(statusFilter);
        }

        if (after) {
            // E-01: Paginación keyset con índice compuesto (created_at DESC, id DESC)
            const cursorRow = await db.prepare(
                "SELECT created_at, id FROM orders WHERE id = ? AND tenant_id = ?"
            ).bind(after, tenantId).first<{ created_at: string; id: string }>();

            if (cursorRow) {
                conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
                params.push(cursorRow.created_at, cursorRow.created_at, cursorRow.id);
            } else {
                conditions.push("created_at < (SELECT created_at FROM orders WHERE id = ?)");
                params.push(after);
            }

            const whereClause = "WHERE " + conditions.join(" AND ");
            const { results: rawOrders } = await db.prepare(
                `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ?`
            ).bind(...params, limit + 1).all<OrderRow>();

            const hasMore = Boolean(rawOrders && rawOrders.length > limit);
            const orders = hasMore ? rawOrders.slice(0, limit) : (rawOrders || []);
            const nextCursor = (hasMore && orders.length > 0) ? orders[orders.length - 1].id : null;

            return compressedJsonResponse({
                data: orders,
                meta: { limit, hasMore, nextCursor }
            });
        }

        // Paginación por página/offset (compatibilidad retroactiva)
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const offset = (page - 1) * limit;

        const whereClause = "WHERE " + conditions.join(" AND ");
        const countRow = await db.prepare(`SELECT COUNT(*) as total FROM orders ${whereClause}`).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const { results: orders } = await db.prepare(
            `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all<OrderRow>();

        return compressedJsonResponse({
            data: orders || [],
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        });

    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return jsonResponse({ error: "Error interno" }, 500);
    }
};

/**
 * POST /api/orders - Checkout público, ligado al tenant resuelto
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // 1. Verificación de Límite de Pedidos Mensuales
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

        // 2. Validación de Turnstile CAPTCHA (Fix #1: Requerido obligatoriamente en producción)
        const isTestEnv = env.ENVIRONMENT === 'test';
        if (!env.TURNSTILE_SECRET_KEY && !isTestEnv) {
            console.error("Configuración de seguridad incompleta: TURNSTILE_SECRET_KEY no definida.");
            return jsonResponse({ error: "Error de configuración del servidor (seguridad)." }, 500);
        }

        if (!data.turnstileToken && !isTestEnv) {
            return jsonResponse({ error: "Verificación de seguridad requerida." }, 400);
        }

        const isHuman = await verifyTurnstile(
            data.turnstileToken || '',
            env.TURNSTILE_SECRET_KEY || '',
            clientIp,
            isTestEnv
        );
        if (!isHuman) {
            return jsonResponse({ error: "No se pudo verificar que eres humano." }, 403);
        }

        if (data.deliveryType === 'delivery' && !data.deliveryAddress) {
            return jsonResponse({ error: "La dirección es requerida para el delivery." }, 400);
        }

        // 3. Generación de Order ID único
        const prefix = (data.storePrefix || "ORD").toUpperCase();
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

        // 4. Cargar productos scoped al tenant actual
        const { results: rawDbProducts } = await db.prepare(
            "SELECT id, name, price, stock FROM products WHERE tenant_id = ?"
        ).bind(tenantId).all<ProductShortRow>();
        const dbProducts = rawDbProducts || [];
        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        // Pre-validación de stock disponible antes de estructurar el batch
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

        // 5. Resolución de tasa BCV segura (Fix #12)
        const bcvResolution = await resolveBcvRate(db, tenantId, data.bcvRate ?? undefined);
        if (bcvResolution.error || bcvResolution.rate <= 0) {
            return jsonResponse({ error: bcvResolution.error || "Tasa BCV inválida o no configurada." }, 400);
        }
        const finalBcvRate = bcvResolution.rate;

        // 6. Armado de sentencias y seguimiento de índices de actualización de stock (Fix #2)
        let totalItems = 0;
        let itemsTotal = 0.0;
        const statements: D1PreparedStatement[] = [];
        const stockUpdateIndices: { statementIdx: number; productName: string }[] = [];

        // Insert inicial del pedido (con totales temporales que se actualizarán)
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
            itemsTotal += price * qty;

            // Descontar inventario de forma atómica condicionada con WHERE stock >= ?
            if (matchedProduct && matchedProduct.stock !== null && matchedProduct.stock !== -1) {
                stockUpdateIndices.push({
                    statementIdx: statements.length,
                    productName: matchedProduct.name
                });
                statements.push(
                    db.prepare(
                        "UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND stock >= ?"
                    ).bind(qty, matchedProduct.id, tenantId, qty)
                );
            }

            statements.push(
                db.prepare("INSERT INTO order_items (order_id, product_id, product_name, size, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(orderId, prodId, prodName, size, qty, price)
            );
        }

        // 7. Validación y aplicación de cupón (Fix #10)
        let discountAmount = 0.0;
        let appliedCouponCode: string | null = null;

        if (data.couponCode) {
            const couponResult = await applyCoupon(db, tenantId, data.couponCode, itemsTotal);
            if (couponResult.isValid && couponResult.updateStatement) {
                discountAmount = couponResult.discountAmount;
                appliedCouponCode = couponResult.appliedCouponCode;
                statements.push(couponResult.updateStatement);
            }
        }

        // 8. Costo de delivery desde la configuración del tenant
        let deliveryPrice = 5.0;
        try {
            const configJson = tenant?.config_json ? JSON.parse(tenant.config_json) : {};
            if (configJson?.labels?.deliveryOptionPrice !== undefined) {
                deliveryPrice = parseFloat(configJson.labels.deliveryOptionPrice);
            }
        } catch {}

        // 9. Cálculo exacto de totales monetarios y persistencia de cupón (F-02)
        const totals = calculateOrderTotals(itemsTotal, discountAmount, data.deliveryType, deliveryPrice, finalBcvRate);

        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ?, coupon_code = ?, discount_amount = ? WHERE id = ?")
            .bind(totalItems, totals.finalTotalPrice, totals.totalBs, appliedCouponCode, discountAmount, orderId)
        );

        // F-03: Registrar evento inicial de creación de la orden
        statements.push(
            db.prepare("INSERT INTO order_events (order_id, tenant_id, from_status, to_status, actor, note) VALUES (?, ?, NULL, 'pendiente', 'cliente', 'Pedido creado en storefront')")
            .bind(orderId, tenantId)
        );

        // 10. Ejecución del lote DB y verificación atómica de stock (Fix #2: Race Condition Protection)
        const batchResults = await db.batch(statements);

        let stockExhaustedProduct: string | null = null;
        for (const updateCheck of stockUpdateIndices) {
            const res = batchResults[updateCheck.statementIdx];
            if (res && res.meta && res.meta.changes === 0) {
                stockExhaustedProduct = updateCheck.productName;
                break;
            }
        }

        if (stockExhaustedProduct) {
            // Revertir el pedido y detalles insertados
            await db.batch([
                db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
                db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").bind(orderId, tenantId)
            ]);
            return jsonResponse({
                error: `No se pudo completar el pedido: El stock para "${stockExhaustedProduct}" se agotó en un pedido concurrente.`
            }, 409);
        }

        // 11. Disparo de Webhook con firma HMAC-SHA256 (Fix #19)
        if (env.WEBHOOK_URL) {
            try {
                const webhookSecret = env.JWT_SECRET || env.SUPERADMIN_KEY || 'vendly-webhook-key';
                const webhookPayload = JSON.stringify({
                    event: 'new_order_created',
                    orderId,
                    tenantId,
                    clientName: data.clientName,
                    totalPrice: totals.finalTotalPrice,
                    totalBs: totals.totalBs,
                    discountAmount,
                    appliedCoupon: appliedCouponCode,
                    timestamp: new Date().toISOString()
                });
                const signature = await generateWebhookSignature(webhookPayload, webhookSecret);

                context.waitUntil(
                    fetch(env.WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Vendly-Signature': `sha256=${signature}`
                        },
                        body: webhookPayload
                    }).catch(e => console.error("Error en webhook de nuevo pedido:", e))
                );
            } catch (whErr) {
                console.error("Fallo al preparar webhook:", whErr);
            }
        }

        return jsonResponse({
            success: true,
            orderId,
            totalItems,
            itemsTotal,
            discountAmount,
            appliedCoupon: appliedCouponCode,
            totalPrice: totals.finalTotalPrice,
            totalBs: totals.totalBs,
            bcvRate: finalBcvRate
        }, 201);

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return jsonResponse({ error: "Error interno al procesar pedido." }, 500);
    }
};

/**
 * PUT /api/orders - Admin only, actualización de estado scoped por tenant
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    // F-04: Soporte para rol staff y admin en gestión de pedidos
    if (!['admin', 'staff'].includes(user.role)) return forbiddenResponse();

    try {
        const bodyJson = await request.json();
        const parseResult = updateOrderStatusSchema.safeParse(bodyJson);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos de estado inválidos", details: parseResult.error.issues }, 400);
        }

        const { id, status, paymentMethod, paymentAmount, note } = parseResult.data;

        const order = await db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<OrderRow>();
        if (!order) return jsonResponse({ error: "Pedido no encontrado." }, 404);

        const statements: D1PreparedStatement[] = [
            db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").bind(status, id, tenantId)
        ];

        // F-03: Auditoría y trazabilidad histórica de cambios de estado en order_events
        statements.push(
            db.prepare(
                "INSERT INTO order_events (order_id, tenant_id, from_status, to_status, actor, note) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(id, tenantId, order.status, status, user.username, note || `Cambio de estado a ${status}`)
        );

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

        // Generar enlace WhatsApp para notificar al cliente con un clic (Fix #10)
        const whatsappNotificationUrl = buildOrderStatusWhatsAppUrl(order);

        // Webhook con firma HMAC (Fix #19)
        if (env.WEBHOOK_URL) {
            try {
                const webhookSecret = env.JWT_SECRET || env.SUPERADMIN_KEY || 'vendly-webhook-key';
                const webhookPayload = JSON.stringify({
                    event: 'order_status_updated',
                    orderId: id,
                    newStatus: status,
                    tenantId,
                    timestamp: new Date().toISOString()
                });
                const signature = await generateWebhookSignature(webhookPayload, webhookSecret);

                context.waitUntil(
                    fetch(env.WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Vendly-Signature': `sha256=${signature}`
                        },
                        body: webhookPayload
                    }).catch(e => console.error("Error en webhook de cambio de estado:", e))
                );
            } catch (whErr) {
                console.error("Fallo al preparar webhook de actualización:", whErr);
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
 * PATCH /api/orders - Alias para actualizar estado de pedidos (F-03)
 */
export const onRequestPatch: PagesHandler<Env> = onRequestPut;

/**
 * DELETE /api/orders - Admin only, scoped por tenant
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

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
