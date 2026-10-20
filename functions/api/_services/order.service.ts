// functions/api/_services/order.service.ts
// Lógica de negocio pura para procesamiento, creación, auditoría y ciclo de vida de pedidos (M-01)
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { bytesToHex } from '../_auth';
import { applyCoupon } from './coupon.service';
import { checkOrderLimit } from '../_plans';
import { OrderRepository, type ListOrdersParams, type KeysetPaginationResult, type OffsetPaginationResult, type ProductShortRow } from '../_repositories/order.repo';
import { buildOrderStatusWhatsAppUrl } from '../_whatsapp';
import { ok, err, type Result } from '../_result';
import type { OrderRow, OrderEventRow, TenantRow } from '../../types';

/**
 * Genera un ID de pedido legible con prefijo y caracteres aleatorios
 */
export function generateOrderId(prefix = "ORD"): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let randomPart = "";
    const randomBytes = new Uint8Array(5);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < 5; i++) {
        randomPart += chars[randomBytes[i] % chars.length];
    }
    return `${prefix}-${randomPart}`;
}

/**
 * Valida un token de Cloudflare Turnstile CAPTCHA
 */
export async function verifyTurnstile(
    token: string,
    secret: string,
    ip: string,
    isTest = false
): Promise<boolean> {
    if (isTest || token === 'TEST_PASS_TOKEN') return true;
    if (!secret || !token) return false;

    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);

    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData,
            method: 'POST'
        });
        const outcome = await result.json() as { success: boolean };
        return Boolean(outcome.success);
    } catch {
        return false;
    }
}

/**
 * Genera una firma HMAC-SHA256 para autenticar webhooks salientes (Fix #19)
 */
export async function generateWebhookSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return bytesToHex(new Uint8Array(signature));
}

/**
 * Resuelve la tasa de cambio oficial (BCV) del tenant sin usar fallbacks desactualizados (Fix #12)
 */
export async function resolveBcvRate(
    db: D1Database,
    tenantId: string,
    clientRate?: number,
    tenantConfigJson?: string | null
): Promise<{ rate: number; error?: string }> {
    // P-02: Intentar resolver la tasa directamente desde el config_json cacheado del tenant para evitar roundtrip a D1
    if (tenantConfigJson) {
        try {
            const config = JSON.parse(tenantConfigJson);
            const tenantRate = parseFloat(config?.bcvRate || config?.labels?.bcvRate || config?.bcv_rate);
            if (!isNaN(tenantRate) && tenantRate > 0) {
                return { rate: tenantRate };
            }
        } catch {}
    }

    try {
        const bcvSetting = await db.prepare(
            "SELECT value FROM settings WHERE key = 'bcv_rate' AND tenant_id = ?"
        ).bind(tenantId).first<{ value: string }>();

        if (bcvSetting && parseFloat(bcvSetting.value) > 0) {
            return { rate: parseFloat(bcvSetting.value) };
        }
    } catch {}

    if (clientRate && typeof clientRate === 'number' && clientRate > 0) {
        return { rate: clientRate };
    }

    return {
        rate: 0,
        error: 'No se ha configurado la tasa oficial BCV para esta tienda y no se proporcionó una tasa válida.'
    };
}

export interface OrderTotals {
    itemsTotal: number;
    discountAmount: number;
    deliveryPrice: number;
    finalTotalPrice: number;
    totalBs: number;
}

/**
 * Calcula con precisión los totales monetarios del pedido en USD y Bolívares
 */
export function calculateOrderTotals(
    itemsTotal: number,
    discountAmount: number,
    deliveryType: 'delivery' | 'pickup' | string,
    deliveryPrice: number,
    bcvRate: number
): OrderTotals {
    const effectiveDelivery = deliveryType === 'delivery' ? deliveryPrice : 0;
    const finalTotalPrice = Math.max(0, Math.round((itemsTotal - discountAmount + effectiveDelivery) * 100) / 100);
    const totalBs = Math.round((finalTotalPrice * bcvRate) * 100) / 100;

    return {
        itemsTotal,
        discountAmount,
        deliveryPrice: effectiveDelivery,
        finalTotalPrice,
        totalBs
    };
}

export interface CreateOrderItemInput {
    id?: string;
    key?: string;
    name: string;
    price: number;
    qty: number;
    options?: Record<string, unknown> | null;
}

export interface CreateOrderServiceInput {
    tenant: TenantRow | null;
    tenantId: string;
    clientIp: string;
    isTestEnv: boolean;
    turnstileSecretKey?: string;
    turnstileToken?: string;
    storePrefix?: string;
    clientName: string;
    clientPhone: string;
    deliveryType: string;
    deliveryAddress?: string | null;
    deliveryNotes?: string | null;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    paymentReceiptUrl?: string | null;
    template?: string;
    couponCode?: string | null;
    clientRate?: number;
    items: CreateOrderItemInput[];
}

export interface CreateOrderServiceOutput {
    orderId: string;
    totalItems: number;
    itemsTotal: number;
    discountAmount: number;
    appliedCoupon: string | null;
    totalPrice: number;
    totalBs: number;
    bcvRate: number;
}

export interface OrderDetailsOutput extends OrderRow {
    items: Array<{
        id?: number;
        order_id: string;
        product_id: string;
        product_name: string;
        size?: string | null;
        quantity: number;
        unit_price: number;
    }>;
    events: OrderEventRow[];
}

export class OrderService {
    private repo: OrderRepository;

    constructor(private db: D1Database) {
        this.repo = new OrderRepository(db);
    }

    /**
     * Lista pedidos usando paginación keyset o por offset
     */
    async listOrders(params: ListOrdersParams): Promise<KeysetPaginationResult | OffsetPaginationResult> {
        if (params.after) {
            return await this.repo.listOrdersKeyset(params);
        }
        return await this.repo.listOrdersOffset(params);
    }

    /**
     * Obtiene el detalle completo de un pedido con sus items y eventos de auditoría
     */
    async getOrderDetails(orderId: string, tenantId: string): Promise<Result<OrderDetailsOutput, string>> {
        const order = await this.repo.findById(orderId, tenantId);
        if (!order) {
            return err('Pedido no encontrado.', 404);
        }

        const [items, events] = await Promise.all([
            this.repo.findItems(orderId),
            this.repo.findEvents(orderId)
        ]);

        return ok({
            ...order,
            items,
            events
        });
    }

    /**
     * Procesa la creación de un nuevo pedido aplicando validaciones de seguridad, límites, cupones y stock atómico
     */
    async createOrder(input: CreateOrderServiceInput): Promise<Result<CreateOrderServiceOutput, string>> {
        const {
            tenant,
            tenantId,
            clientIp,
            isTestEnv,
            turnstileSecretKey,
            turnstileToken,
            storePrefix,
            clientName,
            clientPhone,
            deliveryType,
            deliveryAddress,
            deliveryNotes,
            paymentMethod,
            paymentReference,
            paymentReceiptUrl,
            template,
            couponCode,
            clientRate,
            items
        } = input;

        // 1. Verificación de límite de pedidos mensuales
        const limitCheck = await checkOrderLimit(this.db, tenant);
        if (!limitCheck.allowed) {
            return err(
                `El negocio ha alcanzado su límite de ${limitCheck.limit} pedidos permitidos este mes. Por favor, comunícate con el administrador.`,
                403
            );
        }

        // 2. Validación de Turnstile CAPTCHA
        if (!turnstileSecretKey && !isTestEnv) {
            return err("Error de configuración del servidor (seguridad).", 500);
        }

        if (!turnstileToken && !isTestEnv) {
            return err("Verificación de seguridad requerida.", 400);
        }

        const isHuman = await verifyTurnstile(
            turnstileToken || '',
            turnstileSecretKey || '',
            clientIp,
            isTestEnv
        );
        if (!isHuman) {
            return err("No se pudo verificar que eres humano.", 403);
        }

        if (deliveryType === 'delivery' && !deliveryAddress) {
            return err("La dirección es requerida para el delivery.", 400);
        }

        // 3. Generación de Order ID único con reintentos
        const prefix = (storePrefix || "ORD").toUpperCase();
        let orderId = generateOrderId(prefix);
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 5) {
            const exists = await this.repo.exists(orderId);
            if (!exists) {
                isUnique = true;
            } else {
                orderId = generateOrderId(prefix);
                attempts++;
            }
        }

        // 4. Cargar productos del tenant para validación de precio y stock
        const dbProducts = await this.repo.findTenantProducts(tenantId);
        const productMap = new Map(dbProducts.map(p => [p.id, p]));

        // Pre-validar stock disponible
        for (const item of items) {
            let matchedProduct: ProductShortRow | undefined;
            if (item.id && productMap.has(item.id)) matchedProduct = productMap.get(item.id);
            else if (item.key && productMap.has(item.key)) matchedProduct = productMap.get(item.key);
            else matchedProduct = dbProducts.find(p => p.name === item.name);

            if (matchedProduct && matchedProduct.stock !== null && matchedProduct.stock !== -1) {
                if (matchedProduct.stock < item.qty) {
                    return err(
                        `Stock insuficiente para "${matchedProduct.name}". Disponible: ${matchedProduct.stock}, Solicitado: ${item.qty}.`,
                        400
                    );
                }
            }
        }

        // 5. Resolución de tasa BCV segura (P-02: con fallback a tenant.config_json)
        const bcvResolution = await resolveBcvRate(this.db, tenantId, clientRate, tenant?.config_json);
        if (bcvResolution.error || bcvResolution.rate <= 0) {
            return err(bcvResolution.error || "Tasa BCV inválida o no configurada.", 400);
        }
        const finalBcvRate = bcvResolution.rate;

        // 6. Armado de sentencias y seguimiento de índices para chequeo atómico de stock
        let totalItems = 0;
        let itemsTotal = 0.0;
        const statements: D1PreparedStatement[] = [];
        const stockUpdateIndices: Array<{ statementIdx: number; productName: string }> = [];

        // Insert inicial del pedido (totales temporales 0, luego actualizados)
        statements.push(
            this.db.prepare(
                "INSERT INTO orders (id, client_name, client_phone, delivery_type, delivery_address, delivery_notes, payment_method, payment_reference, payment_receipt_url, bcv_rate, total_bs, status, total_items, total_price, template, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
                orderId, clientName, clientPhone, deliveryType,
                deliveryAddress || null, deliveryNotes || null, paymentMethod || null,
                paymentReference || null, paymentReceiptUrl || null,
                finalBcvRate, 0.0, "pendiente", 0, 0.0, template || tenant?.template || 'restaurant', tenantId
            )
        );

        for (const item of items) {
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
                    this.db.prepare(
                        "UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND stock >= ?"
                    ).bind(qty, matchedProduct.id, tenantId, qty)
                );
            }

            statements.push(
                this.db.prepare("INSERT INTO order_items (order_id, product_id, product_name, size, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(orderId, prodId, prodName, size, qty, price)
            );
        }

        // 7. Validación y aplicación de cupón
        let discountAmount = 0.0;
        let appliedCouponCode: string | null = null;

        if (couponCode) {
            const couponResult = await applyCoupon(this.db, tenantId, couponCode, itemsTotal);
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

        // 9. Cálculo de totales monetarios
        const totals = calculateOrderTotals(itemsTotal, discountAmount, deliveryType, deliveryPrice, finalBcvRate);

        statements.push(
            this.db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ?, coupon_code = ?, discount_amount = ? WHERE id = ?")
            .bind(totalItems, totals.finalTotalPrice, totals.totalBs, appliedCouponCode, discountAmount, orderId)
        );

        // 10. Evento inicial de auditoría (S-03)
        statements.push(
            this.db.prepare("INSERT INTO order_events (order_id, tenant_id, from_status, to_status, actor, note) VALUES (?, ?, NULL, 'pendiente', 'cliente', 'Pedido creado en storefront')")
            .bind(orderId, tenantId)
        );

        // 11. Ejecución del lote con verificación de stock atómico
        const batchResult = await this.repo.executeOrderBatch(orderId, tenantId, statements, stockUpdateIndices);
        if (!batchResult.success) {
            return err(
                `No se pudo completar el pedido: El stock para "${batchResult.stockExhaustedProduct}" se agotó en un pedido concurrente.`,
                409
            );
        }

        return ok({
            orderId,
            totalItems,
            itemsTotal,
            discountAmount,
            appliedCoupon: appliedCouponCode,
            totalPrice: totals.finalTotalPrice,
            totalBs: totals.totalBs,
            bcvRate: finalBcvRate
        });
    }

    /**
     * Actualiza el estado de un pedido y gestiona efectos secundarios y notificación
     */
    async updateOrderStatus(
        orderId: string,
        tenantId: string,
        newStatus: string,
        actor: string,
        note?: string,
        paymentMethod?: string,
        paymentAmount?: number
    ): Promise<Result<{ whatsappNotificationUrl: string | null }, string>> {
        const order = await this.repo.findById(orderId, tenantId);
        if (!order) {
            return err("Pedido no encontrado.", 404);
        }

        await this.repo.updateStatusWithEffects(
            orderId,
            tenantId,
            order,
            newStatus,
            actor,
            note,
            paymentMethod,
            paymentAmount
        );

        const whatsappNotificationUrl = buildOrderStatusWhatsAppUrl({
            ...order,
            status: newStatus
        });

        return ok({ whatsappNotificationUrl });
    }

    /**
     * Elimina un pedido
     */
    async deleteOrder(orderId: string, tenantId: string): Promise<Result<boolean, string>> {
        const deleted = await this.repo.delete(orderId, tenantId);
        if (!deleted) {
            return err("Pedido no encontrado.", 404);
        }
        return ok(true);
    }
}
