// functions/api/superadmin/tenants.ts
// Gestión de Tenants desde el panel Super-Admin integrado
import { z } from 'zod';
import { getDB, jsonResponse } from "../_helpers";
import type { Env, PagesHandler, TenantRow } from '../../types';

export const superadminTenantActionSchema = z.object({
    tenantId: z.string().min(1),
    action: z.enum(['change_plan', 'toggle_status']),
    value: z.union([z.string(), z.number()]),
});

export type SuperadminTenantActionInput = z.infer<typeof superadminTenantActionSchema>;

export const onRequest: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    // Autenticación via SUPERADMIN_KEY
    const authHeader = request.headers.get('Authorization') || '';
    const superadminKey = env.SUPERADMIN_KEY;

    if (!superadminKey) {
        return jsonResponse({
            error: 'Super-admin no configurado. Define SUPERADMIN_KEY en las variables de entorno.'
        }, 503);
    }

    if (authHeader !== `Bearer ${superadminKey}`) {
        return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    if (request.method === 'GET') {
        try {
            const { results } = await db.prepare(`
                SELECT id, name, plan, active, created_at, template 
                FROM tenants 
                ORDER BY created_at DESC
            `).all<TenantRow>();

            return jsonResponse(results);
        } catch (err) {
            console.error('Error en GET superadmin/tenants:', err);
            return jsonResponse({ error: 'Error interno.' }, 500);
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

            if (action === 'change_plan') {
                const validPlans = ['basic', 'pro', 'enterprise'];
                const planValue = String(value);
                if (!validPlans.includes(planValue)) {
                    return jsonResponse({ error: 'Plan inválido.' }, 400);
                }
                await db.prepare('UPDATE tenants SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(planValue, tenantId).run();
                return jsonResponse({ success: true, message: `Plan actualizado a ${planValue}.` });
            }

            if (action === 'toggle_status') {
                const newStatus = Number(value) === 1 ? 1 : 0;
                await db.prepare('UPDATE tenants SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(newStatus, tenantId).run();
                return jsonResponse({ success: true, message: `Estado actualizado a ${newStatus === 1 ? 'Activo' : 'Suspendido'}.` });
            }

            return jsonResponse({ error: 'Acción no válida.' }, 400);

        } catch (err) {
            console.error('Error en PUT superadmin/tenants:', err);
            return jsonResponse({ error: 'Error interno al actualizar.' }, 500);
        }
    }

    return jsonResponse({ error: 'Método no permitido' }, 405);
};
