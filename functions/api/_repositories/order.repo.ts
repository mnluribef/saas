// functions/api/_repositories/order.repo.ts
// Acceso a datos y consultas D1 para pedidos, items, eventos de auditoría y ventas (M-01)
import type { D1Database, D1PreparedStatement, D1Response } from '@cloudflare/workers-types';
import type { OrderRow, OrderEventRow } from '../../types';

export interface OrderItemRow {
    id?: number;
    order_id: string;
    product_id: string;
    product_name: string;
    size?: string | null;
    quantity: number;
    unit_price: number;
}

export interface ListOrdersParams {
    tenantId: string;
    status?: string | null;
    limit: number;
    after?: string | null;
    page?: number;
}

export interface KeysetPaginationResult {
    orders: OrderRow[];
    hasMore: boolean;
    nextCursor: string | null;
}

export interface OffsetPaginationResult {
    orders: OrderRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ProductShortRow {
    id: string;
    name: string;
    price: number | string;
    stock: number;
}

export class OrderRepository {
    constructor(private db: D1Database) {}

    /**
     * Obtiene los datos del pedido cursor para paginación keyset determinista
     */
    async findCursorRow(afterId: string, tenantId: string): Promise<{ created_at: string; id: string } | null> {
        try {
            return await this.db.prepare(
                "SELECT created_at, id FROM orders WHERE id = ? AND tenant_id = ?"
            ).bind(afterId, tenantId).first<{ created_at: string; id: string }>();
        } catch {
            return null;
        }
    }

    /**
     * Lista pedidos usando paginación keyset (cursor-based) optimizada con idx_orders_cursor
     */
    async listOrdersKeyset(params: ListOrdersParams): Promise<KeysetPaginationResult> {
        const { tenantId, status, limit, after } = params;
        const conditions: string[] = ["tenant_id = ?"];
        const bindParams: (string | number)[] = [tenantId];

        if (status && status !== "all") {
            conditions.push("status = ?");
            bindParams.push(status);
        }

        if (after) {
            const cursorRow = await this.findCursorRow(after, tenantId);
            if (cursorRow) {
                conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
                bindParams.push(cursorRow.created_at, cursorRow.created_at, cursorRow.id);
            } else {
                conditions.push("created_at < (SELECT created_at FROM orders WHERE id = ?)");
                bindParams.push(after);
            }
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const { results: rawOrders } = await this.db.prepare(
            `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ?`
        ).bind(...bindParams, limit + 1).all<OrderRow>();

        const hasMore = Boolean(rawOrders && rawOrders.length > limit);
        const orders = hasMore ? rawOrders.slice(0, limit) : (rawOrders || []);
        const nextCursor = (hasMore && orders.length > 0) ? orders[orders.length - 1].id : null;

        return { orders, hasMore, nextCursor };
    }

    /**
     * Lista pedidos usando paginación offset tradicional (para dashboards con número de página)
     */
    async listOrdersOffset(params: ListOrdersParams): Promise<OffsetPaginationResult> {
        const { tenantId, status, limit, page = 1 } = params;
        const offset = (page - 1) * limit;

        const conditions: string[] = ["tenant_id = ?"];
        const bindParams: (string | number)[] = [tenantId];

        if (status && status !== "all") {
            conditions.push("status = ?");
            bindParams.push(status);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const countRow = await this.db.prepare(
            `SELECT COUNT(*) as total FROM orders ${whereClause}`
        ).bind(...bindParams).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const { results: orders } = await this.db.prepare(
            `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...bindParams, limit, offset).all<OrderRow>();

        return {
            orders: orders || [],
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Busca un pedido individual por ID y tenant_id
     */
    async findById(orderId: string, tenantId: string): Promise<OrderRow | null> {
        return await this.db.prepare(
            "SELECT * FROM orders WHERE id = ? AND tenant_id = ?"
        ).bind(orderId, tenantId).first<OrderRow>();
    }

    /**
     * Verifica si existe un pedido con el ID especificado
     */
    async exists(orderId: string): Promise<boolean> {
        const row = await this.db.prepare(
            "SELECT id FROM orders WHERE id = ?"
        ).bind(orderId).first<{ id: string }>();
        return Boolean(row);
    }

    /**
     * Obtiene los productos básicos del tenant filtrando solo los IDs referenciados en un pedido (Fix #10)
     * Evita cargar todo el catálogo en memoria al procesar cada pedido.
     */
    async findTenantProductsByIds(tenantId: string, ids: string[]): Promise<ProductShortRow[]> {
        if (ids.length === 0) return [];
        // D1 no soporta arrays nativos en bind; usamos placeholders dinámicos
        const placeholders = ids.map(() => '?').join(',');
        const { results } = await this.db.prepare(
            `SELECT id, name, price, stock FROM products WHERE tenant_id = ? AND id IN (${placeholders})`
        ).bind(tenantId, ...ids).all<ProductShortRow>();
        return results || [];
    }

    /**
     * Obtiene todos los productos básicos del tenant (uso legado/admin).
     * Preferir findTenantProductsByIds en el flujo de checkout.
     */
    async findTenantProducts(tenantId: string): Promise<ProductShortRow[]> {
        const { results } = await this.db.prepare(
            "SELECT id, name, price, stock FROM products WHERE tenant_id = ?"
        ).bind(tenantId).all<ProductShortRow>();
        return results || [];
    }

    /**
     * Obtiene los items asociados a un pedido
     */
    async findItems(orderId: string): Promise<OrderItemRow[]> {
        const { results } = await this.db.prepare(
            "SELECT * FROM order_items WHERE order_id = ?"
        ).bind(orderId).all<OrderItemRow>();
        return results || [];
    }

    /**
     * Obtiene los eventos de auditoría de un pedido ordenados cronológicamente
     */
    async findEvents(orderId: string): Promise<OrderEventRow[]> {
        const { results } = await this.db.prepare(
            "SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC"
        ).bind(orderId).all<OrderEventRow>();
        return results || [];
    }

    /**
     * Ejecuta el lote de creación del pedido y verifica atómicamente si el stock se agotó
     */
    async executeOrderBatch(
        orderId: string,
        tenantId: string,
        statements: D1PreparedStatement[],
        stockUpdateIndices: Array<{ statementIdx: number; productName: string }>
    ): Promise<{ success: boolean; stockExhaustedProduct?: string }> {
        const batchResults: D1Response[] = await this.db.batch(statements);

        let stockExhaustedProduct: string | null = null;
        for (const updateCheck of stockUpdateIndices) {
            const res = batchResults[updateCheck.statementIdx];
            if (res && res.meta && res.meta.changes === 0) {
                stockExhaustedProduct = updateCheck.productName;
                break;
            }
        }

        if (stockExhaustedProduct) {
            // Revertir atómicamente el pedido insertado
            await this.db.batch([
                this.db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
                this.db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").bind(orderId, tenantId)
            ]);
            return { success: false, stockExhaustedProduct };
        }

        return { success: true };
    }

    /**
     * Actualiza el estado de un pedido y aplica efectos secundarios (ventas, stock, auditoría)
     */
    async updateStatusWithEffects(
        orderId: string,
        tenantId: string,
        order: OrderRow,
        newStatus: string,
        actor: string,
        note?: string,
        paymentMethod?: string,
        paymentAmount?: number
    ): Promise<void> {
        const statements: D1PreparedStatement[] = [
            this.db.prepare(
                "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?"
            ).bind(newStatus, orderId, tenantId),
            this.db.prepare(
                "INSERT INTO order_events (order_id, tenant_id, from_status, to_status, actor, note) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(orderId, tenantId, order.status, newStatus, actor, note || `Cambio de estado a ${newStatus}`)
        ];

        // Efecto secundario: cuando se completa, registrar venta si no existe
        if (newStatus === "completado") {
            const existingSale = await this.db.prepare(
                "SELECT id FROM sales WHERE order_id = ?"
            ).bind(orderId).first();

            if (!existingSale) {
                const finalMonto = (paymentAmount !== undefined && !Number.isNaN(Number(paymentAmount)) && Number(paymentAmount) >= 0)
                    ? Number(paymentAmount)
                    : order.total_price;

                statements.push(
                    this.db.prepare(
                        "INSERT INTO sales (order_id, monto, metodo_pago, fecha, tenant_id) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)"
                    ).bind(orderId, finalMonto, paymentMethod || order.payment_method || "WhatsApp / Por acordar", tenantId)
                );
            }
        } else if (newStatus === "cancelado" && order.status !== "cancelado") {
            // Efecto secundario: restituir stock de los productos asociados al pedido cancelado
            const items = await this.findItems(orderId);
            for (const item of items) {
                statements.push(
                    this.db.prepare(
                        "UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND stock != -1"
                    ).bind(item.quantity, item.product_id, tenantId)
                );
            }
        }

        await this.db.batch(statements);
    }

    /**
     * Elimina un pedido y sus items en cascada
     */
    async delete(orderId: string, tenantId: string): Promise<boolean> {
        const order = await this.findById(orderId, tenantId);
        if (!order) return false;

        await this.db.batch([
            this.db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
            this.db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").bind(orderId, tenantId)
        ]);
        return true;
    }
}
