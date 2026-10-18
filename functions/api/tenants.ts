// functions/api/tenants.ts
// Gestión de Tenants - Super-Admin Only
// Protegido por variable de entorno SUPERADMIN_KEY (no usa el sistema de sesiones de tenant)
import { z } from "zod";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler, TenantRow } from '../types';

/**
 * Comparación criptográficamente segura en tiempo constante.
 * Hashea ambos inputs a SHA-256 (32 bytes fijos) antes de comparar
 * con XOR, eliminando el timing oracle de longitud del string original.
 */
async function secureCompare(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(a)),
        crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const viewA = new Uint8Array(hashA);
    const viewB = new Uint8Array(hashB);
    let result = 0;
    for (let i = 0; i < viewA.length; i++) {
        result |= viewA[i] ^ viewB[i];
    }
    return result === 0;
}

/**
 * Verifica que el request tenga la clave de super-admin
 */
async function verifySuperAdmin(request: Request, env: Env): Promise<boolean> {
    const key = request.headers.get('X-Superadmin-Key');
    if (!key || !env.SUPERADMIN_KEY) return false;
    return await secureCompare(key, env.SUPERADMIN_KEY);
}

function superadminRequired(): Response {
    return jsonResponse({ error: 'Acceso denegado. Se requiere clave de super-admin.' }, 403);
}

export const tenantSchema = z.object({
    id: z.string()
        .min(2).max(60)
        .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
    name: z.string().min(2).max(100),
    plan: z.enum(['basic', 'pro', 'enterprise']).default('basic'),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts']).default('restaurant'),
    config_json: z.string().optional().default('{}'),
    domain: z.string().max(200).optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
    active: z.number().int().min(0).max(1).default(1),
});

export type TenantInput = z.infer<typeof tenantSchema>;

/**
 * GET /api/tenants - Listar todos los tenants (Super-Admin)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    if (!await verifySuperAdmin(request, env)) return superadminRequired();

    const db = getDB(env);
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('id');

    try {
        if (tenantId) {
            const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first<TenantRow>();
            if (!tenant) return jsonResponse({ error: 'Tenant no encontrado.' }, 404);

            // Stats del tenant
            const [products, orders, users] = await Promise.all([
                db.prepare('SELECT COUNT(*) as total FROM products WHERE tenant_id = ?').bind(tenantId).first<{ total: number }>(),
                db.prepare('SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?').bind(tenantId).first<{ total: number }>(),
                db.prepare('SELECT COUNT(*) as total FROM users WHERE tenant_id = ?').bind(tenantId).first<{ total: number }>(),
            ]);

            return jsonResponse({
                ...tenant,
                stats: {
                    products: products?.total ?? 0,
                    orders: orders?.total ?? 0,
                    users: users?.total ?? 0,
                }
            });
        }

        const { results: tenants } = await db.prepare(
            'SELECT id, name, plan, template, domain, active, created_at FROM tenants ORDER BY created_at DESC'
        ).all<TenantRow>();

        return jsonResponse({ data: tenants });
    } catch (err) {
        console.error('Error en GET /api/tenants:', err);
        return jsonResponse({ error: 'Error interno.' }, 500);
    }
};

/**
 * POST /api/tenants - Crear un nuevo tenant (Super-Admin)
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    if (!await verifySuperAdmin(request, env)) return superadminRequired();

    const db = getDB(env);

    try {
        const rawData = await request.json();
        const result = tenantSchema.safeParse(rawData);

        if (!result.success) {
            return jsonResponse({ error: 'Datos inválidos', details: result.error.issues }, 400);
        }

        const { id, name, plan, template, config_json, domain, whatsapp, active } = result.data;

        // Verificar que el slug no exista
        const existing = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(id).first();
        if (existing) {
            return jsonResponse({ error: `El tenant "${id}" ya existe.` }, 400);
        }

        // Validar JSON de config
        try {
            JSON.parse(config_json);
        } catch {
            return jsonResponse({ error: 'config_json no es un JSON válido.' }, 400);
        }

        await db.prepare(
            'INSERT INTO tenants (id, name, plan, template, config_json, domain, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, name, plan, template, config_json, domain || null, whatsapp || null, active).run();

        // Insertar settings base del tenant
        await db.prepare(
            "INSERT OR IGNORE INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '36.50', ?)"
        ).bind(id).run();

        return jsonResponse({
            success: true,
            message: `Tenant "${name}" creado exitosamente.`,
            tenantId: id,
        }, 201);

    } catch (err) {
        console.error('Error en POST /api/tenants:', err);
        return jsonResponse({ error: 'Error interno al crear tenant.' }, 500);
    }
};

/**
 * PUT /api/tenants - Actualizar tenant (Super-Admin)
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    if (!await verifySuperAdmin(request, env)) return superadminRequired();

    const db = getDB(env);

    try {
        const rawData = await request.json();
        const result = tenantSchema.safeParse(rawData);

        if (!result.success) {
            return jsonResponse({ error: 'Datos inválidos', details: result.error.issues }, 400);
        }

        const { id, name, plan, template, config_json, domain, whatsapp, active } = result.data;

        const existing = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(id).first();
        if (!existing) {
            return jsonResponse({ error: 'Tenant no encontrado.' }, 404);
        }

        await db.prepare(
            'UPDATE tenants SET name = ?, plan = ?, template = ?, config_json = ?, domain = ?, whatsapp = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(name, plan, template, config_json, domain || null, whatsapp || null, active, id).run();

        return jsonResponse({ success: true, message: 'Tenant actualizado.' });

    } catch (err) {
        console.error('Error en PUT /api/tenants:', err);
        return jsonResponse({ error: 'Error interno.' }, 500);
    }
};

/**
 * DELETE /api/tenants - Suspender o eliminar tenant (Super-Admin)
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    if (!await verifySuperAdmin(request, env)) return superadminRequired();

    const db = getDB(env);

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        const hardDelete = url.searchParams.get('hard') === 'true';

        if (!id) return jsonResponse({ error: 'ID requerido.' }, 400);
        if (id === 'demo') return jsonResponse({ error: 'El tenant demo no puede eliminarse.' }, 400);

        if (hardDelete) {
            await db.batch([
                db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)').bind(id),
                db.prepare('DELETE FROM orders WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM sales WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM product_attributes WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM product_variants WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM products WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM sessions WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM users WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM settings WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM tenants WHERE id = ?').bind(id),
            ]);
            return jsonResponse({ success: true, message: `Tenant "${id}" eliminado permanentemente.` });
        }

        // Soft delete: solo desactivar
        await db.prepare('UPDATE tenants SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, message: `Tenant "${id}" suspendido.` });

    } catch (err) {
        console.error('Error en DELETE /api/tenants:', err);
        return jsonResponse({ error: 'Error interno.' }, 500);
    }
};
