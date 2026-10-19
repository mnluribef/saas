// functions/api/health.ts
// O-03: Health Check extendido con latencias de subsistemas (D1, KV, Storage)
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export interface SubsystemCheck {
    status: 'ok' | 'degraded' | 'error' | 'not_configured';
    latencyMs: number;
}

export interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    environment: string;
    timestamp: string;
    checks: {
        database: SubsystemCheck;
        kv: SubsystemCheck;
        storage: SubsystemCheck;
    };
    // Retrocompatibilidad con consumidores v2.0
    database: SubsystemCheck;
}

export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env } = context;

    // 1. Chequeo de Base de Datos D1 (Crítico)
    let dbStatus: 'ok' | 'degraded' | 'error' = 'ok';
    let dbLatencyMs = -1;

    try {
        const db = getDB(env);
        const start = performance.now();
        await db.prepare('SELECT 1 as ping').first();
        dbLatencyMs = Math.round(performance.now() - start);
        if (dbLatencyMs > 500) {
            dbStatus = 'degraded';
        }
    } catch (e: unknown) {
        dbStatus = 'error';
        console.error("Fallo de salud en base de datos D1:", e);
    }

    // 2. Chequeo de Cloudflare KV (Caché de tenants y sesiones)
    let kvStatus: 'ok' | 'degraded' | 'error' | 'not_configured' = 'not_configured';
    let kvLatencyMs = -1;

    if (env.KV) {
        try {
            const start = performance.now();
            await env.KV.get('__health_ping__');
            kvLatencyMs = Math.round(performance.now() - start);
            kvStatus = kvLatencyMs > 500 ? 'degraded' : 'ok';
        } catch (e: unknown) {
            kvStatus = 'error';
            console.error("Fallo de salud en Cloudflare KV:", e);
        }
    }

    // 3. Chequeo de Cloudflare R2 Storage (Comprobantes y assets)
    const storage = env.STORAGE || env.BUCKET;
    let storageStatus: 'ok' | 'degraded' | 'error' | 'not_configured' = 'not_configured';
    let storageLatencyMs = -1;

    if (storage) {
        try {
            const start = performance.now();
            await storage.list({ limit: 1 });
            storageLatencyMs = Math.round(performance.now() - start);
            storageStatus = storageLatencyMs > 500 ? 'degraded' : 'ok';
        } catch (e: unknown) {
            storageStatus = 'error';
            console.error("Fallo de salud en almacenamiento R2:", e);
        }
    }

    // Determinación del estado global
    // Base de datos caída = unhealthy (503 Service Unavailable)
    // Latencia elevada o fallos en servicios auxiliares = degraded (200 OK para no disparar alertas de caída total)
    const isUnhealthy = dbStatus === 'error';
    const isDegraded = !isUnhealthy && (
        dbStatus === 'degraded' ||
        kvStatus === 'degraded' ||
        kvStatus === 'error' ||
        storageStatus === 'degraded' ||
        storageStatus === 'error'
    );

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' = isUnhealthy 
        ? 'unhealthy' 
        : isDegraded 
            ? 'degraded' 
            : 'healthy';

    const httpStatusCode = isUnhealthy ? 503 : 200;

    const payload: HealthCheckResponse = {
        status: overallStatus,
        version: '2.1.0',
        environment: env.ENVIRONMENT || 'production',
        timestamp: new Date().toISOString(),
        checks: {
            database: { status: dbStatus, latencyMs: dbLatencyMs },
            kv: { status: kvStatus, latencyMs: kvLatencyMs },
            storage: { status: storageStatus, latencyMs: storageLatencyMs }
        },
        database: { status: dbStatus, latencyMs: dbLatencyMs }
    };

    return jsonResponse(payload, httpStatusCode, {
        "Cache-Control": "no-store, no-cache, must-revalidate"
    });
};
