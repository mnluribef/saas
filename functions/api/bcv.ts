// functions/api/bcv.ts
// Controlador de Tasa Oficial BCV - Vendly SaaS (Multi-Tenant)
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

const DEFAULT_FALLBACK_RATE = 853.50;
const EXTERNAL_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial";

export const updateBcvSchema = z.object({
    rate: z.union([z.number().positive(), z.string().transform(v => parseFloat(v))]).optional(),
    autoUpdate: z.boolean().optional(),
});

export type UpdateBcvInput = z.infer<typeof updateBcvSchema>;

interface SettingRow {
    key: string;
    value: string;
}

/**
 * GET /api/bcv - Obtener la tasa oficial del día (scoped por tenant)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);

    // Resolver el tenant para aislar la tasa BCV correctamente
    const { id: tenantId } = await resolveTenant(request, db);

    try {
        const url = new URL(request.url);
        const forceFetch = url.searchParams.get("force") === "true";

        // Leer configuración actual de la base de datos FILTRADA por tenant
        const { results: rows } = await db.prepare(
            "SELECT key, value FROM settings WHERE key LIKE 'bcv_%' AND tenant_id = ?"
        ).bind(tenantId).all<SettingRow>();

        const settings: Record<string, string> = {};
        for (const row of rows || []) {
            settings[row.key] = row.value;
        }

        const autoUpdate = settings.bcv_auto_update !== '0';
        let currentRate = parseFloat(settings.bcv_rate) || DEFAULT_FALLBACK_RATE;
        let lastUpdated = settings.bcv_updated_at || new Date().toISOString();
        let source = autoUpdate ? 'cached' : 'manual';

        const lastUpdatedMs = new Date(lastUpdated).getTime();
        const nowMs = Date.now();
        const isOutdated = isNaN(lastUpdatedMs) || (nowMs - lastUpdatedMs > 30 * 60 * 1000);
        const isOldSeed = currentRate <= 50;

        if (autoUpdate && (forceFetch || isOldSeed || isOutdated)) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const res = await fetch(EXTERNAL_API_URL, {
                    headers: { 
                        'Accept': 'application/json',
                        'User-Agent': 'VendlySaaS/1.0'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json() as { promedio?: number; price?: number; fechaActualizacion?: string };
                    const fetchedRate = parseFloat(String(data.promedio || data.price || 0));

                    if (fetchedRate > 0) {
                        currentRate = Math.round(fetchedRate * 100) / 100;
                        lastUpdated = data.fechaActualizacion || new Date().toISOString();
                        source = 'bcv_api';

                        // Guardar en base de datos con tenant_id correcto
                        await db.batch([
                            db.prepare(
                                "INSERT OR REPLACE INTO settings (key, value, updated_at, tenant_id) VALUES ('bcv_rate', ?, CURRENT_TIMESTAMP, ?)"
                            ).bind(String(currentRate), tenantId),
                            db.prepare(
                                "INSERT OR REPLACE INTO settings (key, value, updated_at, tenant_id) VALUES ('bcv_updated_at', ?, CURRENT_TIMESTAMP, ?)"
                            ).bind(lastUpdated, tenantId),
                        ]);
                    }
                }
            } catch (fetchErr: any) {
                console.warn("Fallo al consultar API BCV externa, usando caché:", fetchErr?.message || fetchErr);
            }
        }

        return jsonResponse({
            rate: currentRate,
            lastUpdated,
            autoUpdate,
            source
        }, 200, { "Cache-Control": "no-cache" });
    } catch (err) {
        console.error("Error en GET /api/bcv:", err);
        return jsonResponse({
            rate: DEFAULT_FALLBACK_RATE,
            lastUpdated: new Date().toISOString(),
            autoUpdate: true,
            source: 'fallback'
        }, 200);
    }
};

/**
 * PUT /api/bcv - Actualizar manualmente la tasa o el modo de actualización
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);

    const { id: tenantId } = await resolveTenant(request, db);
    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const bodyJson = await request.json();
        const parseResult = updateBcvSchema.safeParse(bodyJson);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos de tasa BCV inválidos", issues: parseResult.error.issues }, 400);
        }

        const { rate, autoUpdate } = parseResult.data;
        const statements: D1PreparedStatement[] = [];

        if (rate !== undefined) {
            const numericRate = typeof rate === 'number' ? rate : parseFloat(rate);
            if (isNaN(numericRate) || numericRate <= 0) {
                return jsonResponse({ error: "La tasa debe ser un número positivo." }, 400);
            }
            statements.push(
                db.prepare(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at, tenant_id) VALUES ('bcv_rate', ?, CURRENT_TIMESTAMP, ?)"
                ).bind(numericRate.toFixed(2), tenantId)
            );
        }

        if (autoUpdate !== undefined) {
            const autoVal = autoUpdate ? '1' : '0';
            statements.push(
                db.prepare(
                    "INSERT OR REPLACE INTO settings (key, value, updated_at, tenant_id) VALUES ('bcv_auto_update', ?, CURRENT_TIMESTAMP, ?)"
                ).bind(autoVal, tenantId)
            );
        }

        const now = new Date().toISOString();
        statements.push(
            db.prepare(
                "INSERT OR REPLACE INTO settings (key, value, updated_at, tenant_id) VALUES ('bcv_updated_at', ?, CURRENT_TIMESTAMP, ?)"
            ).bind(now, tenantId)
        );

        await db.batch(statements);

        return jsonResponse({
            success: true,
            message: "Configuración de tasa BCV actualizada exitosamente."
        });
    } catch (err) {
        console.error("Error en PUT /api/bcv:", err);
        return jsonResponse({ error: "Error al actualizar configuración BCV." }, 500);
    }
};
