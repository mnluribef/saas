// functions/api/analytics.ts
// Panel de Análisis y Métricas Avanzadas para Tenants (Planes Pro & Enterprise)
import { verifySession, unauthorizedResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

interface TopProductRow {
    product_name: string;
    total_qty: number;
    total_revenue: number;
}

interface StatusCountRow {
    status: string;
    count: number;
}

interface PaymentBreakdownRow {
    payment_method: string;
    count: number;
    total: number;
}

interface DeliveryBreakdownRow {
    delivery_type: string;
    count: number;
}

/**
 * GET /api/analytics - Retorna métricas avanzadas del negocio
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const planKey = tenant?.plan || 'basic';

        // 1. Ingresos del mes actual
        const revThisMonthRow = await db.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total, COUNT(*) as count 
            FROM sales 
            WHERE tenant_id = ? AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now')
        `).bind(tenantId).first<{ total: number; count: number }>();

        // 2. Ingresos del mes anterior
        const revLastMonthRow = await db.prepare(`
            SELECT COALESCE(SUM(monto), 0) as total, COUNT(*) as count 
            FROM sales 
            WHERE tenant_id = ? AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', '-1 month')
        `).bind(tenantId).first<{ total: number; count: number }>();

        const revThisMonth = revThisMonthRow?.total ?? 0;
        const revLastMonth = revLastMonthRow?.total ?? 0;
        const salesCountThisMonth = revThisMonthRow?.count ?? 0;

        // Calcular porcentaje de crecimiento mensual
        let growthPercentage = 0;
        if (revLastMonth > 0) {
            growthPercentage = Math.round(((revThisMonth - revLastMonth) / revLastMonth) * 100);
        } else if (revThisMonth > 0) {
            growthPercentage = 100;
        }

        // Ticket promedio
        const averageTicket = salesCountThisMonth > 0 ? Math.round((revThisMonth / salesCountThisMonth) * 100) / 100 : 0;

        // 3. Top 5 productos más vendidos
        const { results: rawTopProducts } = await db.prepare(`
            SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.quantity * oi.unit_price) as total_revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.tenant_id = ?
            GROUP BY oi.product_name
            ORDER BY total_qty DESC
            LIMIT 5
        `).bind(tenantId).all<TopProductRow>();

        // 4. Conteo de pedidos por estado
        const { results: rawStatusCounts } = await db.prepare(`
            SELECT status, COUNT(*) as count
            FROM orders
            WHERE tenant_id = ?
            GROUP BY status
        `).bind(tenantId).all<StatusCountRow>();

        // 5. Desglose por método de pago
        const { results: rawPaymentMethods } = await db.prepare(`
            SELECT COALESCE(payment_method, 'No especificado') as payment_method, COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
            FROM orders
            WHERE tenant_id = ?
            GROUP BY payment_method
        `).bind(tenantId).all<PaymentBreakdownRow>();

        // 6. Desglose por tipo de entrega
        const { results: rawDeliveryTypes } = await db.prepare(`
            SELECT delivery_type, COUNT(*) as count
            FROM orders
            WHERE tenant_id = ?
            GROUP BY delivery_type
        `).bind(tenantId).all<DeliveryBreakdownRow>();

        return jsonResponse({
            plan: planKey,
            summary: {
                revenueThisMonth: revThisMonth,
                revenueLastMonth: revLastMonth,
                monthlyGrowthPercentage: growthPercentage,
                salesCountThisMonth,
                averageTicket
            },
            topProducts: rawTopProducts || [],
            ordersByStatus: rawStatusCounts || [],
            paymentMethods: rawPaymentMethods || [],
            deliveryTypes: rawDeliveryTypes || []
        }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate" });

    } catch (err) {
        console.error("Error en GET /api/analytics:", err);
        return jsonResponse({ error: "Error interno al calcular analíticas." }, 500);
    }
};
