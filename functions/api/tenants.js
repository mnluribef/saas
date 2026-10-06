// functions/api/tenants.js
// Gestión de Tenants - Super-Admin Only
// Protegido por variable de entorno SUPERADMIN_KEY (no usa el sistema de sesiones de tenant)
import { z } from "zod";

function secureCompare(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

/**
 * Verifica que el request tenga la clave de super-admin
 * La clave se configura en Cloudflare como variable de entorno: SUPERADMIN_KEY
 */
function verifySuperAdmin(request, env) {
    const key = request.headers.get('X-Superadmin-Key');
    if (!key || !env.SUPERADMIN_KEY) return false;
    return secureCompare(key, env.SUPERADMIN_KEY);
}

function superadminRequired() {
    return new Response(JSON.stringify({ error: 'Acceso denegado. Se requiere clave de super-admin.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
    });
}

const tenantSchema = z.object({
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

/**
 * GET /api/tenants - Listar todos los tenants (Super-Admin)
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    if (!verifySuperAdmin(request, env)) return superadminRequired();

    const db = env.DB || env.vendly;
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('id');

    try {
        if (tenantId) {
            const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first();
            if (!tenant) return new Response(JSON.stringify({ error: 'Tenant no encontrado.' }), { status: 404 });

            // Stats del tenant
            const [products, orders, users] = await Promise.all([
                db.prepare('SELECT COUNT(*) as total FROM products WHERE tenant_id = ?').bind(tenantId).first(),
                db.prepare('SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?').bind(tenantId).first(),
                db.prepare('SELECT COUNT(*) as total FROM users WHERE tenant_id = ?').bind(tenantId).first(),
            ]);

            return new Response(JSON.stringify({
                ...tenant,
                stats: {
                    products: products?.total ?? 0,
                    orders: orders?.total ?? 0,
                    users: users?.total ?? 0,
                }
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        const { results: tenants } = await db.prepare(
            'SELECT id, name, plan, template, domain, active, created_at FROM tenants ORDER BY created_at DESC'
        ).all();

        return new Response(JSON.stringify({ data: tenants }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.error('Error en GET /api/tenants:', err);
        return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500 });
    }
}

/**
 * POST /api/tenants - Crear un nuevo tenant (Super-Admin)
 * También crea el primer usuario admin del tenant automáticamente
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    if (!verifySuperAdmin(request, env)) return superadminRequired();

    const db = env.DB || env.vendly;

    try {
        const rawData = await request.json();
        const result = tenantSchema.safeParse(rawData);

        if (!result.success) {
            return new Response(JSON.stringify({ error: 'Datos inválidos', details: result.error.issues }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const { id, name, plan, template, config_json, domain, whatsapp, active } = result.data;

        // Verificar que el slug no exista
        const existing = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(id).first();
        if (existing) {
            return new Response(JSON.stringify({ error: `El tenant "${id}" ya existe.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validar JSON de config
        try {
            JSON.parse(config_json);
        } catch {
            return new Response(JSON.stringify({ error: 'config_json no es un JSON válido.' }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        await db.prepare(
            'INSERT INTO tenants (id, name, plan, template, config_json, domain, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, name, plan, template, config_json, domain || null, whatsapp || null, active).run();

        // Insertar settings base del tenant
        await db.prepare(
            "INSERT OR IGNORE INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '36.50', ?)"
        ).bind(id).run();

        return new Response(JSON.stringify({
            success: true,
            message: `Tenant "${name}" creado exitosamente.`,
            tenantId: id,
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('Error en POST /api/tenants:', err);
        return new Response(JSON.stringify({ error: 'Error interno al crear tenant.' }), { status: 500 });
    }
}

/**
 * PUT /api/tenants - Actualizar tenant (Super-Admin)
 */
export async function onRequestPut(context) {
    const { request, env } = context;
    if (!verifySuperAdmin(request, env)) return superadminRequired();

    const db = env.DB || env.vendly;

    try {
        const rawData = await request.json();
        const result = tenantSchema.safeParse(rawData);

        if (!result.success) {
            return new Response(JSON.stringify({ error: 'Datos inválidos', details: result.error.issues }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const { id, name, plan, template, config_json, domain, whatsapp, active } = result.data;

        const existing = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(id).first();
        if (!existing) {
            return new Response(JSON.stringify({ error: 'Tenant no encontrado.' }), { status: 404 });
        }

        await db.prepare(
            'UPDATE tenants SET name = ?, plan = ?, template = ?, config_json = ?, domain = ?, whatsapp = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(name, plan, template, config_json, domain || null, whatsapp || null, active, id).run();

        return new Response(JSON.stringify({ success: true, message: 'Tenant actualizado.' }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Error en PUT /api/tenants:', err);
        return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500 });
    }
}

/**
 * DELETE /api/tenants - Suspender (no borrar) un tenant (Super-Admin)
 * Los datos del tenant se conservan. Para borrar físicamente usar ?hard=true
 */
export async function onRequestDelete(context) {
    const { request, env } = context;
    if (!verifySuperAdmin(request, env)) return superadminRequired();

    const db = env.DB || env.vendly;

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        const hardDelete = url.searchParams.get('hard') === 'true';

        if (!id) return new Response(JSON.stringify({ error: 'ID requerido.' }), { status: 400 });
        if (id === 'demo') return new Response(JSON.stringify({ error: 'El tenant demo no puede eliminarse.' }), { status: 400 });

        if (hardDelete) {
            // Eliminación física en cascada
            await db.batch([
                db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)').bind(id),
                db.prepare('DELETE FROM orders WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM sales WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM product_attributes WHERE product_id IN (SELECT id FROM products WHERE tenant_id = ?)').bind(id),
                db.prepare('DELETE FROM products WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM sessions WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM users WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM settings WHERE tenant_id = ?').bind(id),
                db.prepare('DELETE FROM tenants WHERE id = ?').bind(id),
            ]);
            return new Response(JSON.stringify({ success: true, message: `Tenant "${id}" eliminado permanentemente.` }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Soft delete: solo desactivar
        await db.prepare('UPDATE tenants SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
        return new Response(JSON.stringify({ success: true, message: `Tenant "${id}" suspendido.` }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Error en DELETE /api/tenants:', err);
        return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500 });
    }
}
