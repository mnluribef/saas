// functions/api/sales.ts
// Controlador de Registro de Ventas - Ventrina SaaS (Fix #20: Derivado de orders completados)
import { requireStaffOrAdmin } from "./_guards";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

interface SaleChartRow {
    date: string;
    total: number;
}

interface SaleRow {
    id: string;
    order_id: string;
    tenant_id: string;
    monto: number;
    fecha: string;
    metodo_pago?: string;
    client_name?: string;
    client_phone?: string;
}

/**
 * GET /api/sales - Listar ventas registradas derivadas de órdenes con status 'completado'
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const guard = await requireStaffOrAdmin(context);
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { env, request } = context;
    const db = getDB(env);

    const url = new URL(request.url);
    const statsOnly = url.searchParams.get("stats") === "true";
    
    try {
        if (statsOnly) {
            // Ingresos de hoy derivados de órdenes completadas
            const rowToday = await db.prepare(
                "SELECT COALESCE(SUM(total_price), 0) as total_ingresos FROM orders WHERE tenant_id = ? AND status = 'completado' AND DATE(created_at) = DATE('now')"
            ).bind(tenantId).first<{ total_ingresos: number | null }>();
            
            // Datos para la gráfica (últimos 7 días)
            const { results: chartData } = await db.prepare(`
                SELECT DATE(created_at) as date, SUM(total_price) as total 
                FROM orders 
                WHERE tenant_id = ? AND status = 'completado' AND created_at >= date('now', '-7 days') 
                GROUP BY DATE(created_at) 
                ORDER BY date ASC
            `).bind(tenantId).all<SaleChartRow>();

            return jsonResponse({
                revenueToday: rowToday?.total_ingresos || 0,
                chartData: chartData || []
            }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate" });
        }

        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const offset = (page - 1) * limit;

        const dateFrom = url.searchParams.get("date_from");
        const dateTo = url.searchParams.get("date_to");

        const conditions: string[] = ["o.tenant_id = ?", "o.status = 'completado'"];
        const params: (string | number)[] = [tenantId];

        if (dateFrom) {
            conditions.push("DATE(o.created_at) >= ?");
            params.push(dateFrom);
        }
        if (dateTo) {
            conditions.push("DATE(o.created_at) <= ?");
            params.push(dateTo);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereClause}`;
        const countRow = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const dataQuery = `
            SELECT 
                o.id as id,
                o.id as order_id,
                o.tenant_id,
                o.total_price as monto,
                o.created_at as fecha,
                o.payment_method as metodo_pago,
                COALESCE(o.client_name, 'Cliente Ventrina') as client_name, 
                COALESCE(o.client_phone, '') as client_phone 
            FROM orders o 
            ${whereClause}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...params, limit, offset];
        const { results } = await db.prepare(dataQuery).bind(...dataParams).all<SaleRow>();

        return jsonResponse({
            data: results,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate" });
    } catch (err) {
        console.error("Error en GET /api/sales:", err);
        return jsonResponse({ error: "Error al consultar registro de ventas." }, 500);
    }
};
