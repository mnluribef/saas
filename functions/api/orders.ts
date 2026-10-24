// functions/api/orders.ts
// Controlador HTTP de Pedidos - Ventrina SaaS (M-01: Capa Controller)
import { z } from "zod";
import { verifySession, unauthorizedResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse, compressedJsonResponse } from "./_helpers";
import { requireAdmin, requireStaffOrAdmin } from "./_guards";
import { OrderService, generateWebhookSignature } from "./_services/order.service";
import type { Env, PagesHandler, OrderRow } from '../types';


export const createOrderSchema = z.object({
    clientName: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
    clientPhone: z.string().min(7, "El teléfono debe ser válido").max(25),
    deliveryType: z.enum(['delivery', 'pickup']),
    deliveryAddress: z.string().max(250).optional().nullable(),
    deliveryNotes: z.string().max(250).optional().nullable(),
    paymentMethod: z.string().max(50).optional().nullable(),
    paymentReference: z.string().max(100).optional().nullable(),
    paymentReceipt: z.string().max(500).optional().nullable(),
    paymentReceiptUrl: z.string().max(500).optional().nullable(),
    bcvRate: z.number().positive().optional().nullable(),
    couponCode: z.string().max(50).optional().nullable(),
    storePrefix: z.string().max(10).optional().nullable(),
    template: z.string().max(50).default("restaurant"),
    turnstileToken: z.string().optional().nullable(),
    items: z.array(z.object({
        id: z.string().optional(),
        key: z.string().optional(),
        name: z.string().min(1).max(150),
        price: z.number().min(0),
        qty: z.number().int().positive(),
        options: z.record(z.string(), z.unknown()).optional().nullable(),
    })).min(1, "El pedido debe contener al menos un producto")
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

export type { OrderRow };
export interface OrderItemRow {
    id?: number;
    order_id: string;
    product_id: string;
    product_name: string;
    size: string | null;
    quantity: number;
    unit_price: number;
}

/**
 * GET /api/orders - Admin only, consulta individual o paginada de pedidos
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db, env.KV);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");
    const orderService = new OrderService(db);

    try {
        if (orderId) {
            const detailRes = await orderService.getOrderDetails(orderId, tenantId);
            if (!detailRes.ok) {
                return jsonResponse({ error: detailRes.error }, detailRes.code || 404);
            }
            return jsonResponse(detailRes.data);
        }

        const after = url.searchParams.get("after");
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const status = url.searchParams.get("status");
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));

        const listResult = await orderService.listOrders({ tenantId, status, limit, after, page });

        if ('hasMore' in listResult) {
            return compressedJsonResponse({
                data: listResult.orders,
                meta: { limit, hasMore: listResult.hasMore, nextCursor: listResult.nextCursor }
            });
        }

        return compressedJsonResponse({
            data: listResult.orders,
            meta: { total: listResult.total, page: listResult.page, limit: listResult.limit, totalPages: listResult.totalPages }
        });
    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return jsonResponse({ error: "Error interno al consultar pedidos." }, 500);
    }
};

/**
 * POST /api/orders - Checkout público con validación Zod, Turnstile y stock atómico
 * Fix #5: Soporta el header Idempotency-Key para evitar pedidos duplicados por doble click.
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    // Fix #5: Idempotencia — si viene Idempotency-Key, verificar si ya existe un pedido reciente con esa clave
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey && env.KV) {
        try {
            const existingOrderId = await env.KV.get(`idem:${tenantId}:${idempotencyKey}`);
            if (existingOrderId) {
                const orderService = new OrderService(db);
                const existing = await orderService.getOrderDetails(existingOrderId, tenantId);
                if (existing.ok) {
                    return jsonResponse({ success: true, orderId: existingOrderId, idempotent: true }, 200);
                }
            }
        } catch {}
    }

    try {
        const rawData = await request.json();
        const result = createOrderSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const data = result.data;
        const orderService = new OrderService(db);

        const createRes = await orderService.createOrder({
            tenant,
            tenantId,
            clientIp,
            isTestEnv: env.ENVIRONMENT === 'test',
            turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
            turnstileToken: data.turnstileToken || undefined,
            storePrefix: data.storePrefix || undefined,
            clientName: data.clientName,
            clientPhone: data.clientPhone,
            deliveryType: data.deliveryType,
            deliveryAddress: data.deliveryAddress,
            deliveryNotes: data.deliveryNotes,
            paymentMethod: data.paymentMethod,
            paymentReference: data.paymentReference,
            paymentReceiptUrl: data.paymentReceiptUrl || data.paymentReceipt,
            template: data.template,
            couponCode: data.couponCode,
            clientRate: data.bcvRate ?? undefined,
            items: data.items
        });

        if (!createRes.ok) {
            return jsonResponse({ error: createRes.error }, createRes.code || 400);
        }

        const orderData = createRes.data;

        // Fix #5: Guardar clave de idempotencia en KV con TTL de 24h
        if (idempotencyKey && env.KV) {
            try {
                await env.KV.put(`idem:${tenantId}:${idempotencyKey}`, orderData.orderId, { expirationTtl: 86400 });
            } catch {}
        }

        // Disparo asíncrono de webhook si está configurado
        if (env.WEBHOOK_URL && env.WEBHOOK_SECRET) {
            try {
                const webhookPayload = JSON.stringify({
                    event: 'new_order_created',
                    orderId: orderData.orderId,
                    tenantId,
                    clientName: data.clientName,
                    totalPrice: orderData.totalPrice,
                    totalBs: orderData.totalBs,
                    discountAmount: orderData.discountAmount,
                    appliedCoupon: orderData.appliedCoupon,
                    timestamp: new Date().toISOString()
                });
                const signature = await generateWebhookSignature(webhookPayload, env.WEBHOOK_SECRET);

                context.waitUntil?.(
                    fetch(env.WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Ventrina-Signature': `sha256=${signature}`
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
            orderId: orderData.orderId,
            totalItems: orderData.totalItems,
            itemsTotal: orderData.itemsTotal,
            discountAmount: orderData.discountAmount,
            appliedCoupon: orderData.appliedCoupon,
            totalPrice: orderData.totalPrice,
            totalBs: orderData.totalBs,
            bcvRate: orderData.bcvRate
        }, 201);

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return jsonResponse({ error: "Error interno al procesar pedido." }, 500);
    }
};


/**
 * PUT /api/orders - Actualización de estado de pedido (Admin / Staff)
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env } = context;
    // Fix #7: Usar guard centralizado para admin/staff
    const guard = await requireStaffOrAdmin(context);
    if (!guard.ok) return guard.response;
    const { user, tenantId } = guard;

    try {
        const bodyJson = await context.request.json();
        const parseResult = updateOrderStatusSchema.safeParse(bodyJson);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos de estado inválidos", details: parseResult.error.issues }, 400);
        }

        const { id, status, paymentMethod, paymentAmount, note } = parseResult.data;
        const orderService = new OrderService(getDB(env));

        const updateRes = await orderService.updateOrderStatus(
            id,
            tenantId,
            status,
            user.username,
            note,
            paymentMethod,
            paymentAmount !== undefined ? Number(paymentAmount) : undefined
        );

        if (!updateRes.ok) {
            return jsonResponse({ error: updateRes.error }, updateRes.code || 404);
        }

        // Fix #16: Webhook solo si WEBHOOK_SECRET está configurado explícitamente
        if (env.WEBHOOK_URL && env.WEBHOOK_SECRET) {
            try {
                const webhookPayload = JSON.stringify({
                    event: 'order_status_updated',
                    orderId: id,
                    newStatus: status,
                    tenantId,
                    timestamp: new Date().toISOString()
                });
                const signature = await generateWebhookSignature(webhookPayload, env.WEBHOOK_SECRET);

                context.waitUntil?.(
                    fetch(env.WEBHOOK_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Ventrina-Signature': `sha256=${signature}`
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
            whatsappNotificationUrl: updateRes.data.whatsappNotificationUrl
        });

    } catch (err) {
        console.error("Error en PUT /api/orders:", err);
        return jsonResponse({ error: "Error interno al actualizar pedido." }, 500);
    }
};


/**
 * PATCH /api/orders - Alias para actualizar estado
 */
export const onRequestPatch: PagesHandler<Env> = onRequestPut;

/**
 * DELETE /api/orders - Cancelación y borrado de pedido (Admin only)
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    // Fix #7: Usar guard centralizado
    const guard = await requireAdmin(context);
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    try {
        const id = new URL(context.request.url).searchParams.get("id");
        if (!id) return jsonResponse({ error: "ID requerido." }, 400);

        const orderService = new OrderService(getDB(context.env));
        const deleteRes = await orderService.deleteOrder(id, tenantId);

        if (!deleteRes.ok) {
            return jsonResponse({ error: deleteRes.error }, deleteRes.code || 404);
        }

        return jsonResponse({ success: true });
    } catch (err) {
        console.error("Error en DELETE /api/orders:", err);
        return jsonResponse({ error: "Error interno al eliminar pedido." }, 500);
    }
};

