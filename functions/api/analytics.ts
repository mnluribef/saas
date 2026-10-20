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
 * GET /api/analytics - Retorna métricas analíticas del negocio en paralelo y con caché (Fix #6, #16, #17)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const url = new URL(request.url);
        const planKey = tenant?.plan || 'basic';

        // F-02: Las analíticas avanzadas están restringidas a planes Pro y Enterprise
        const hasAnalyticsFeature = ['pro', 'enterprise', 'demo'].includes(planKey);
        if (!hasAnalyticsFeature) {
            return jsonResponse({
                error: 'Las analíticas avanzadas requieren plan Pro o Enterprise.',
                upgradeRequired: true,
                currentPlan: planKey
            }, 403);
        }

        // Fix #16: Soporte para rangos de fecha personalizados
        const fromDate = url.searchParams.get("from"); // formato YYYY-MM-DD
        const toDate = url.searchParams.get("to");     // formato YYYY-MM-DD
        const hasDateRange = Boolean(fromDate && toDate);

        // Fix #17: Límite configurable para top productos (default 5, min 1, max 50)
        const limitParam = parseInt(url.searchParams.get("limit") || "5", 10);
        const topLimit = Math.max(1, Math.min(50, isNaN(limitParam) ? 5 : limitParam));

        // Fix #6: Ejecución en paralelo con Promise.all()
        if (hasDateRange) {
            const [
                revRangeRow,
                topProductsResult,
                statusCountsResult,
                paymentMethodsResult,
                deliveryTypesResult
            ] = await Promise.all([
                db.prepare(`
                    SELECT COALESCE(SUM(monto), 0) as total, COUNT(*) as count 
                    FROM sales 
                    WHERE tenant_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
                `).bind(tenantId, fromDate, toDate).first<{ total: number; count: number }>(),

                db.prepare(`
                    SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.quantity * oi.unit_price) as total_revenue
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    WHERE o.tenant_id = ? AND date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
                    GROUP BY oi.product_name
                    ORDER BY total_qty DESC
                    LIMIT ?
                `).bind(tenantId, fromDate, toDate, topLimit).all<TopProductRow>(),

                db.prepare(`
                    SELECT status, COUNT(*) as count
                    FROM orders
                    WHERE tenant_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
                    GROUP BY status
                `).bind(tenantId, fromDate, toDate).all<StatusCountRow>(),

                db.prepare(`
                    SELECT COALESCE(payment_method, 'No especificado') as payment_method, COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
                    FROM orders
                    WHERE tenant_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
                    GROUP BY payment_method
                `).bind(tenantId, fromDate, toDate).all<PaymentBreakdownRow>(),

                db.prepare(`
                    SELECT delivery_type, COUNT(*) as count
                    FROM orders
                    WHERE tenant_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
                    GROUP BY delivery_type
                `).bind(tenantId, fromDate, toDate).all<DeliveryBreakdownRow>()
            ]);

            const revRange = revRangeRow?.total ?? 0;
            const salesCount = revRangeRow?.count ?? 0;
            const averageTicket = salesCount > 0 ? Math.round((revRange / salesCount) * 100) / 100 : 0;

            return jsonResponse({
                plan: planKey,
                range: { from: fromDate, to: toDate },
                summary: {
                    totalRevenue: revRange,
                    salesCount,
                    averageTicket
                },
                topProducts: topProductsResult.results || [],
                ordersByStatus: statusCountsResult.results || [],
                paymentMethods: paymentMethodsResult.results || [],
                deliveryTypes: deliveryTypesResult.results || []
            }, 200, {
                // Fix #6: Caché privada de 5 minutos en borde y navegador
                "Cache-Control": "private, max-age=300, stale-while-revalidate=60"
            });
        }

        // Modo predeterminado (mes actual vs mes anterior) optimizado en una sola query agregada (P-03)
        const [
            salesComparisonRow,
            topProductsResult,
            statusCountsResult,
            paymentMethodsResult,
            deliveryTypesResult
        ] = await Promise.all([
            db.prepare(`
                SELECT 
                    COALESCE(SUM(CASE WHEN strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now') THEN monto ELSE 0 END), 0) as total_this_month,
                    COUNT(CASE WHEN strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now') THEN 1 END) as count_this_month,
                    COALESCE(SUM(CASE WHEN strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', '-1 month') THEN monto ELSE 0 END), 0) as total_last_month,
                    COUNT(CASE WHEN strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', '-1 month') THEN 1 END) as count_last_month
                FROM sales 
                WHERE tenant_id = ?
            `).bind(tenantId).first<{
                total_this_month: number;
                count_this_month: number;
                total_last_month: number;
                count_last_month: number;
            }>(),

            db.prepare(`
                SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.quantity * oi.unit_price) as total_revenue
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.tenant_id = ?
                GROUP BY oi.product_name
                ORDER BY total_qty DESC
                LIMIT ?
            `).bind(tenantId, topLimit).all<TopProductRow>(),

            db.prepare(`
                SELECT status, COUNT(*) as count
                FROM orders
                WHERE tenant_id = ?
                GROUP BY status
            `).bind(tenantId).all<StatusCountRow>(),

            db.prepare(`
                SELECT COALESCE(payment_method, 'No especificado') as payment_method, COUNT(*) as count, COALESCE(SUM(total_price), 0) as total
                FROM orders
                WHERE tenant_id = ?
                GROUP BY payment_method
            `).bind(tenantId).all<PaymentBreakdownRow>(),

            db.prepare(`
                SELECT delivery_type, COUNT(*) as count
                FROM orders
                WHERE tenant_id = ?
                GROUP BY delivery_type
            `).bind(tenantId).all<DeliveryBreakdownRow>()
        ]);

        const revThisMonth = salesComparisonRow?.total_this_month ?? 0;
        const revLastMonth = salesComparisonRow?.total_last_month ?? 0;
        const salesCountThisMonth = salesComparisonRow?.count_this_month ?? 0;

        let growthPercentage = 0;
        if (revLastMonth > 0) {
            growthPercentage = Math.round(((revThisMonth - revLastMonth) / revLastMonth) * 100);
        } else if (revThisMonth > 0) {
            growthPercentage = 100;
        }

        const averageTicket = salesCountThisMonth > 0 ? Math.round((revThisMonth / salesCountThisMonth) * 100) / 100 : 0;

        return jsonResponse({
            plan: planKey,
            summary: {
                revenueThisMonth: revThisMonth,
                revenueLastMonth: revLastMonth,
                monthlyGrowthPercentage: growthPercentage,
                salesCountThisMonth,
                averageTicket
            },
            topProducts: topProductsResult.results || [],
            ordersByStatus: statusCountsResult.results || [],
            paymentMethods: paymentMethodsResult.results || [],
            deliveryTypes: deliveryTypesResult.results || []
        }, 200, {
            // Fix #6: Caché de 5 minutos
            "Cache-Control": "private, max-age=300, stale-while-revalidate=60"
        });

    } catch (err) {
        console.error("Error en GET /api/analytics:", err);
        return jsonResponse({ error: "Error interno al calcular analíticas." }, 500);
    }
};
