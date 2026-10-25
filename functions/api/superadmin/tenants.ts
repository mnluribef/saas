// functions/api/superadmin/tenants.ts
// Gestión de Tenants desde el panel Super-Admin integrado
import { z } from 'zod';
import type { Env, PagesHandler } from '../../types';
import { buildSessionCookie, generateSessionToken, hashSHA256 } from '../_auth';
import { getDB, jsonResponse } from '../_helpers';
import { PLANS } from '../_plans';
import { invalidateTenantCache } from '../_tenant';

export const superadminTenantActionSchema = z.object({
    tenantId: z.string().min(1),
    action: z.enum(['change_plan', 'toggle_status', 'impersonate', 'update_billing', 'update_whatsapp']),
    value: z.any().optional(),
});

export type SuperadminTenantActionInput = z.infer<typeof superadminTenantActionSchema>;

export const onRequest: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    // Autenticación via SUPERADMIN_KEY
    const authHeader = request.headers.get('Authorization') || '';
    const superadminKey = env.SUPERADMIN_KEY;

    if (!superadminKey) {
        return jsonResponse(
            {
                error: 'Super-admin no configurado. Define SUPERADMIN_KEY en las variables de entorno.',
            },
            503,
        );
    }

    if (authHeader !== `Bearer ${superadminKey}`) {
        return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    if (request.method === 'GET') {
        try {
            const { results } = await db
                .prepare(`
                SELECT 
                    t.id, t.name, t.plan, t.active, t.created_at, t.template, t.whatsapp, t.domain, t.config_json,
                    (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id) as product_count,
                    (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')) as order_count_month,
                    (SELECT COALESCE(SUM(o.total_price), 0) FROM orders o WHERE o.tenant_id = t.id AND o.status = 'completado' AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')) as revenue_month,
                    (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'admin' LIMIT 1) as owner_email
                FROM tenants t
                ORDER BY t.created_at DESC
            `)
                .all();

            const rows = (results || []) as any[];
            let mrr = 0;
            let totalRevenueMonth = 0;
            let totalOrdersMonth = 0;
            const templateBreakdown: Record<string, number> = {};

            const tenants = rows.map((row) => {
                let billing = null;
                try {
                    const parsedConfig = JSON.parse(row.config_json || '{}');
                    billing = parsedConfig.billing || null;
                } catch {}

                if (row.active === 1) {
                    const planPrice = PLANS[row.plan]?.monthlyPriceUsd ?? 15;
                    mrr += planPrice;
                }
                totalRevenueMonth += Number(row.revenue_month || 0);
                totalOrdersMonth += Number(row.order_count_month || 0);
                const tpl = row.template || 'restaurant';
                templateBreakdown[tpl] = (templateBreakdown[tpl] || 0) + 1;

                return {
                    ...row,
                    billing,
                };
            });

            const summary = {
                totalTenants: tenants.length,
                activeTenants: tenants.filter((t) => t.active === 1).length,
                suspendedTenants: tenants.filter((t) => t.active !== 1).length,
                mrr,
                totalRevenueMonth,
                totalOrdersMonth,
                templateBreakdown,
            };

            return jsonResponse({ tenants, summary });
        } catch (err) {
            console.error('Error en GET superadmin/tenants:', err);
            return jsonResponse({ error: 'Error interno al consultar tiendas.' }, 500);
        }
    }

    if (request.method === 'PUT') {
        try {
            const bodyJson = await request.json();
            const parseResult = superadminTenantActionSchema.safeParse(bodyJson);

            if (!parseResult.success) {
                return jsonResponse({ error: 'Datos de acción inválidos', details: parseResult.error.issues }, 400);
            }

            const { tenantId, action, value } = parseResult.data;

            // 1. Cambiar plan de suscripción
            if (action === 'change_plan') {
                const validPlans = ['basic', 'pro', 'enterprise'];
                const planValue = String(value);
                if (!validPlans.includes(planValue)) {
                    return jsonResponse({ error: 'Plan inválido.' }, 400);
                }
                await db
                    .prepare('UPDATE tenants SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(planValue, tenantId)
                    .run();
                await invalidateTenantCache(env.KV, tenantId);
                return jsonResponse({ success: true, message: `Plan actualizado a ${planValue}.` });
            }

            // 2. Suspender o Activar tienda
            if (action === 'toggle_status') {
                const newStatus = Number(value) === 1 ? 1 : 0;
                await db
                    .prepare(
                        'UPDATE tenants SET active = ?, deleted_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    )
                    .bind(newStatus, newStatus, tenantId)
                    .run();
                await invalidateTenantCache(env.KV, tenantId);
                return jsonResponse({
                    success: true,
                    message: `Estado actualizado a ${newStatus === 1 ? 'Activo' : 'Suspendido'}.`,
                });
            }

            // 3. Impersonar (Entrar como Administrador de Tienda)
            if (action === 'impersonate') {
                const tenant = await db
                    .prepare('SELECT id, name, domain FROM tenants WHERE id = ?')
                    .bind(tenantId)
                    .first<{ id: string; name: string; domain: string | null }>();
                if (!tenant) {
                    return jsonResponse({ error: 'Tienda no encontrada.' }, 404);
                }

                const adminUser = await db
                    .prepare("SELECT username, email, role FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1")
                    .bind(tenantId)
                    .first<{ username: string; email: string; role: string }>();

                const effectiveEmail = adminUser?.email || adminUser?.username || `admin@${tenantId}`;
                const sessionToken = generateSessionToken();
                const maxAge = 24 * 60 * 60; // 24 horas de acceso de soporte
                const expiresAt = Math.floor(Date.now() / 1000) + maxAge;
                const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
                const clientUa = request.headers.get('User-Agent') || 'ventrina-superadmin-impersonate';
                const uaHash = (await hashSHA256(clientUa)).slice(0, 32);

                try {
                    await db
                        .prepare(
                            'INSERT INTO sessions (token, username, expires_at, tenant_id, ip, ua_hash) VALUES (?, ?, ?, ?, ?, ?)',
                        )
                        .bind(sessionToken, effectiveEmail, expiresAt, tenantId, clientIp, uaHash)
                        .run();
                } catch {
                    await db
                        .prepare('INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)')
                        .bind(sessionToken, effectiveEmail, expiresAt, tenantId)
                        .run();
                }

                const cookie = buildSessionCookie(sessionToken, request, maxAge);
                const host = (request.headers.get('x-forwarded-host') || new URL(request.url).hostname).toLowerCase();
                let redirectUrl = `/admin?tenant=${tenantId}`;
                if (host.includes('ventrina.app')) {
                    redirectUrl = `https://${tenantId}.ventrina.app/admin`;
                }

                return jsonResponse(
                    {
                        success: true,
                        token: sessionToken,
                        tenantId,
                        redirectUrl,
                    },
                    200,
                    {
                        'Set-Cookie': cookie,
                    },
                );
            }

            // 4. Actualizar facturación / vencimiento
            if (action === 'update_billing') {
                const billingInput = (value || {}) as {
                    expiresAt?: string | null;
                    paymentStatus?: string;
                    notes?: string;
                };
                const tenantRow = await db
                    .prepare('SELECT id, config_json FROM tenants WHERE id = ?')
                    .bind(tenantId)
                    .first<{ id: string; config_json: string }>();
                if (!tenantRow) {
                    return jsonResponse({ error: 'Tienda no encontrada.' }, 404);
                }

                let config: Record<string, any> = {};
                try {
                    config = JSON.parse(tenantRow.config_json || '{}');
                } catch {}

                config.billing = {
                    ...(config.billing || {}),
                    expiresAt: billingInput.expiresAt || null,
                    paymentStatus: billingInput.paymentStatus || 'active',
                    notes: (billingInput.notes || '').slice(0, 500),
                    updatedAt: new Date().toISOString(),
                };

                const newConfigJson = JSON.stringify(config);
                await db
                    .prepare('UPDATE tenants SET config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(newConfigJson, tenantId)
                    .run();

                await invalidateTenantCache(env.KV, tenantId);
                return jsonResponse({ success: true, message: 'Facturación actualizada exitosamente.' });
            }

            // 5. Actualizar número de WhatsApp
            if (action === 'update_whatsapp') {
                const newWhatsapp = String(value || '').trim();
                await db
                    .prepare('UPDATE tenants SET whatsapp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(newWhatsapp, tenantId)
                    .run();
                await invalidateTenantCache(env.KV, tenantId);
                return jsonResponse({ success: true, message: 'WhatsApp de la tienda actualizado.' });
            }

            return jsonResponse({ error: 'Acción no válida.' }, 400);
        } catch (err) {
            console.error('Error en PUT superadmin/tenants:', err);
            return jsonResponse({ error: 'Error interno al actualizar.' }, 500);
        }
    }

    return jsonResponse({ error: 'Método no permitido' }, 405);
};
