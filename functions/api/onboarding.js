// functions/api/onboarding.js
// Registro de nuevos clientes (Creación de Tenant + Admin)
import { z } from "zod";
import { generateSalt, hashPasswordPBKDF2 } from "./_auth.js";

const onboardingSchema = z.object({
    tenantName: z.string().min(2, "El nombre del negocio es muy corto").max(100),
    tenantSlug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, "El slug solo puede contener minúsculas, números y guiones."),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts']).default('restaurant'),
    username: z.string().min(4, "El usuario debe tener al menos 4 caracteres").max(50),
    passwordHash: z.string().min(1, "La contraseña es requerida"), // Viene hasheada en SHA-256 desde el cliente
    email: z.string().email("Correo electrónico inválido").optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
});

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;

    try {
        const rawData = await request.json();
        const result = onboardingSchema.safeParse(rawData);

        if (!result.success) {
            return new Response(JSON.stringify({ error: 'Datos inválidos', details: result.error.issues }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const { tenantName, tenantSlug, template, username, passwordHash, email, whatsapp } = result.data;
        
        // 1. Verificar disponibilidad de Slug y Username global
        const existingTenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantSlug).first();
        if (existingTenant) {
            return new Response(JSON.stringify({ error: `El subdominio "${tenantSlug}" ya está en uso.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ?')
            .bind(username.toLowerCase().trim(), tenantSlug).first();
        if (existingUser) {
            return new Response(JSON.stringify({ error: `El nombre de usuario "${username}" ya está registrado en esta tienda.` }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. Hash de contraseña
        const salt = generateSalt();
        const finalHash = await hashPasswordPBKDF2(passwordHash, salt);

        // 3. Crear Tenant y Usuario en una transacción Batch
        const statements = [
            db.prepare(
                'INSERT INTO tenants (id, name, plan, template, config_json, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(tenantSlug, tenantName, 'basic', template, '{}', whatsapp || null, 1),
            
            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '36.50', ?)"
            ).bind(tenantSlug),

            db.prepare(
                'INSERT INTO users (username, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
            ).bind(username.toLowerCase().trim(), finalHash, salt, 'admin', tenantSlug)
        ];

        await db.batch(statements);

        // En un entorno de producción, aquí se enviaría un correo de bienvenida.
        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'new_tenant_registered', tenantSlug, tenantName, username, email })
                }));
            } catch (e) { console.error("Webhook error:", e); }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `¡Registro exitoso! Tu tienda está disponible en ${tenantSlug}.vendly.app`,
            tenantId: tenantSlug
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('Error en POST /api/onboarding:', err);
        return new Response(JSON.stringify({ error: 'Error interno al registrar el negocio.' }), { status: 500 });
    }
}
