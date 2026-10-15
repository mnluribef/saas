// functions/api/sales.ts
// Controlador de Registro de Ventas - Vendly SaaS
import { verifySession, unauthorizedResponse } from "./_auth";
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
 * GET /api/sales - Listar ventas registradas (con Paginación o Stats)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = getDB(env);

    const url = new URL(request.url);
    const statsOnly = url.searchParams.get("stats") === "true";
    
    try {
        if (statsOnly) {
            // Obtener ingresos de hoy
            const rowToday = await db.prepare(
                "SELECT SUM(monto) as total_ingresos FROM sales WHERE tenant_id = ? AND DATE(fecha) = DATE('now')"
            ).bind(user.tenant_id).first<{ total_ingresos: number | null }>();
            
            // Obtener datos para la gráfica (últimos 7 días)
            const { results: chartData } = await db.prepare(`
                SELECT DATE(fecha) as date, SUM(monto) as total 
                FROM sales 
                WHERE tenant_id = ? AND fecha >= date('now', '-7 days') 
                GROUP BY DATE(fecha) 
                ORDER BY date ASC
            `).bind(user.tenant_id).all<SaleChartRow>();

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

        const conditions: string[] = ["s.tenant_id = ?"];
        const params: (string | number)[] = [user.tenant_id];

        if (dateFrom) {
            conditions.push("DATE(s.fecha) >= ?");
            params.push(dateFrom);
        }
        if (dateTo) {
            conditions.push("DATE(s.fecha) <= ?");
            params.push(dateTo);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        const countQuery = `SELECT COUNT(*) as total FROM sales s ${whereClause}`;
        const countRow = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const dataQuery = `
            SELECT s.*, COALESCE(o.client_name, 'Cliente Vendly') as client_name, COALESCE(o.client_phone, '') as client_phone 
            FROM sales s 
            LEFT JOIN orders o ON s.order_id = o.id 
            ${whereClause}
            ORDER BY s.fecha DESC
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
