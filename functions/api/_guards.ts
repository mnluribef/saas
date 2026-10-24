// functions/api/_guards.ts
// Fix #7: Helper centralizado de autenticación/autorización para eliminar boilerplate duplicado en endpoints
// Encapsula el patrón repetido: validateCsrf → verifySession → role check
import { validateCsrf, verifySession, unauthorizedResponse, forbiddenResponse } from './_auth';
import { resolveTenant } from './_tenant';
import { getDB } from './_helpers';
import type { UserSession, TenantRow, PagesContext, Env } from '../types';

export type GuardResult =
    | { ok: true; user: UserSession; tenantId: string; tenant: TenantRow | null }
    | { ok: false; response: Response };

/**
 * Verifica que la petición proviene de un admin autenticado del tenant correcto.
 * Agrupa: resolución de tenant + validación CSRF + verificación de sesión + chequeo de rol.
 *
 * Uso:
 * ```ts
 * const guard = await requireAdmin(context);
 * if (!guard.ok) return guard.response;
 * const { user, tenantId, tenant } = guard;
 * ```
 */
export async function requireAdmin(context: PagesContext<Env>): Promise<GuardResult> {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return { ok: false, response: forbiddenResponse('Verificación de seguridad CSRF fallida.') };
    }

    const user = await verifySession(context, tenantId);
    if (!user) {
        return { ok: false, response: unauthorizedResponse() };
    }

    if (user.role !== 'admin') {
        return { ok: false, response: forbiddenResponse() };
    }

    return { ok: true, user, tenantId, tenant: tenant ?? null };
}

/**
 * Verifica que la petición proviene de un usuario autenticado (admin o staff) del tenant correcto.
 * Misma lógica que requireAdmin pero acepta el rol 'staff'.
 */
export async function requireStaffOrAdmin(context: PagesContext<Env>): Promise<GuardResult> {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return { ok: false, response: forbiddenResponse('Verificación de seguridad CSRF fallida.') };
    }

    const user = await verifySession(context, tenantId);
    if (!user) {
        return { ok: false, response: unauthorizedResponse() };
    }

    if (!['admin', 'staff'].includes(user.role)) {
        return { ok: false, response: forbiddenResponse() };
    }

    return { ok: true, user, tenantId, tenant: tenant ?? null };
}
