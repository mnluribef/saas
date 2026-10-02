// Controlador de Registro de Ventas - Vendly SaaS
import { verifySession, unauthorizedResponse } from "./_auth.js";

/**
 * GET /api/sales - Listar ventas registradas (con Paginación)
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    const url = new URL(request.url);
    const statsOnly = url.searchParams.get("stats") === "true";
    
    try {
        if (statsOnly) {
            // Obtener ingresos de hoy
            const { total_ingresos } = await db.prepare("SELECT SUM(monto) as total_ingresos FROM sales WHERE DATE(fecha) = DATE('now')").first();
            
            // Obtener datos para la gráfica (últimos 7 días)
            const { results: chartData } = await db.prepare(`
                SELECT DATE(fecha) as date, SUM(monto) as total 
                FROM sales 
                WHERE fecha >= date('now', '-7 days') 
                GROUP BY DATE(fecha) 
                ORDER BY date ASC
            `).all();

            return new Response(JSON.stringify({
                revenueToday: total_ingresos || 0,
                chartData: chartData
            }), {
                headers: { 
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store, no-cache, must-revalidate"
                }
            });
        }

        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
        const offset = (page - 1) * limit;

        const dateFrom = url.searchParams.get("date_from");
        const dateTo = url.searchParams.get("date_to");

        let conditions = [];
        let params = [];

        if (dateFrom) {
            conditions.push("DATE(s.fecha) >= ?");
            params.push(dateFrom);
        }
        if (dateTo) {
            conditions.push("DATE(s.fecha) <= ?");
            params.push(dateTo);
        }

        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

        const countQuery = `SELECT COUNT(*) as total FROM sales s ${whereClause}`;
        const { total } = await (params.length ? db.prepare(countQuery).bind(...params) : db.prepare(countQuery)).first();

        const dataQuery = `
            SELECT s.*, COALESCE(o.client_name, 'Cliente Vendly') as client_name, COALESCE(o.client_phone, '') as client_phone 
            FROM sales s 
            LEFT JOIN orders o ON s.order_id = o.id 
            ${whereClause}
            ORDER BY s.fecha DESC
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...params, limit, offset];
        const { results } = await db.prepare(dataQuery).bind(...dataParams).all();

        return new Response(JSON.stringify({
            data: results,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (err) {
        console.error("Error en GET /api/sales:", err);
        return new Response(JSON.stringify({ error: "Error al consultar registro de ventas." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
