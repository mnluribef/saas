// functions/api/health.ts
// Endpoint de Monitoreo de Salud de la API y Latencia de Base de Datos D1 (U-05)
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env } = context;
    let dbStatus = "ok";
    let dbLatencyMs = -1;

    try {
        const db = getDB(env);
        const start = Date.now();
        await db.prepare('SELECT 1 as ping').first();
        dbLatencyMs = Date.now() - start;
    } catch (e: any) {
        dbStatus = "error";
        console.error("Fallo de salud en base de datos D1:", e);
    }

    const isHealthy = dbStatus === "ok";

    return jsonResponse({
        status: isHealthy ? 'healthy' : 'degraded',
        version: '2.0.0',
        environment: env.ENVIRONMENT || 'production',
        database: {
            status: dbStatus,
            latencyMs: dbLatencyMs
        },
        timestamp: new Date().toISOString()
    }, isHealthy ? 200 : 503, {
        "Cache-Control": "no-store, no-cache, must-revalidate"
    });
};
