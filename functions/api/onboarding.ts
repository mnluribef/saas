// functions/api/onboarding.ts
// Registro de nuevos clientes (Creación de Tenant + Admin)
import type { D1Database } from '@cloudflare/workers-types';
import { z } from "zod";
import { generateSalt, hashPasswordPBKDF2, hashSHA256 } from "./_auth";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const onboardingSchema = z.object({
    tenantName: z.string().min(2, "El nombre del negocio es muy corto").max(100),
    tenantSlug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, "El slug solo puede contener minúsculas, números y guiones."),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts']).default('restaurant'),
    username: z.string().min(4, "El usuario debe tener al menos 4 caracteres").max(50),
    password: z.string().min(1, "La contraseña es requerida"),
    email: z.email().optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
    acceptTerms: z.boolean().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

const MAX_REGISTRATIONS_PER_HOUR = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hora

interface RateLimitRow {
    ip: string;
    count: number;
    first_attempt: number;
    lockout_until: number;
}

/**
 * Verifica el rate limit de registros por IP.
 */
async function checkRegistrationRateLimit(
    db: D1Database,
    ip: string
): Promise<{ allowed: boolean; remaining: number; resetInMinutes?: number }> {
    const key = `reg_${ip}`;
    const now = Date.now();

    try {
        const record = await db.prepare(
            "SELECT * FROM rate_limits WHERE ip = ?"
        ).bind(key).first<RateLimitRow>();

        if (!record) return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - 1 };

        // Ventana expirada → limpiar y permitir
        if (now - record.first_attempt > REGISTRATION_WINDOW_MS) {
            await db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(key).run();
            return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - 1 };
        }

        if (record.count >= MAX_REGISTRATIONS_PER_HOUR) {
            const resetInMinutes = Math.ceil((REGISTRATION_WINDOW_MS - (now - record.first_attempt)) / 60000);
            return { allowed: false, remaining: 0, resetInMinutes };
        }

        return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - record.count - 1 };
    } catch {
        return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR };
    }
}

/**
 * Registra un intento de registro para calcular el rate limit.
 */
async function recordRegistrationAttempt(db: D1Database, ip: string): Promise<void> {
    const key = `reg_${ip}`;
    const now = Date.now();
    try {
        const record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(key).first<RateLimitRow>();
        if (!record) {
            await db.prepare(
                "INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)"
            ).bind(key, now).run();
        } else {
            await db.prepare(
                "UPDATE rate_limits SET count = count + 1 WHERE ip = ?"
            ).bind(key).run();
        }
    } catch {
        // Ignorar fallas secundarias de registro de rate limit
    }
}

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // 1. Verificar rate limit antes de procesar el registro
    const rateCheck = await checkRegistrationRateLimit(db, clientIp);
    if (!rateCheck.allowed) {
        return jsonResponse({
            error: `Demasiados registros desde esta IP. Por favor espera ${rateCheck.resetInMinutes} minuto(s) antes de intentar nuevamente.`
        }, 429);
    }

    try {
        const rawData = await request.json();
        const result = onboardingSchema.safeParse(rawData);

        if (!result.success) {
            return jsonResponse({ error: 'Datos inválidos', details: result.error.issues }, 400);
        }

        const { tenantName, tenantSlug, template, username, password, email, whatsapp } = result.data;
        
        const passwordHash = await hashSHA256(password);
        
        // 2. Verificar disponibilidad de Slug y Username global
        const existingTenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantSlug).first();
        if (existingTenant) {
            return jsonResponse({ error: `El subdominio "${tenantSlug}" ya está en uso.` }, 400);
        }

        const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ?')
            .bind(username.toLowerCase().trim(), tenantSlug).first();
        if (existingUser) {
            return jsonResponse({ error: `El nombre de usuario "${username}" ya está registrado en esta tienda.` }, 400);
        }

        // 3. Hash de contraseña con PBKDF2 + salt
        const salt = generateSalt();
        const finalHash = await hashPasswordPBKDF2(passwordHash, salt);

        // 4. Crear Tenant y Usuario en una transacción Batch atómica
        const legalMetadata = {
            legal: {
                terms_version: 'v1.0',
                terms_accepted: true,
                accepted_at: new Date().toISOString(),
                registration_ip: clientIp
            }
        };

        const statements = [
            db.prepare(
                'INSERT INTO tenants (id, name, plan, template, config_json, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(tenantSlug, tenantName, 'basic', template, JSON.stringify(legalMetadata), whatsapp || null, 1),
            
            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '36.50', ?)"
            ).bind(tenantSlug),

            db.prepare(
                'INSERT INTO users (username, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
            ).bind(username.toLowerCase().trim(), finalHash, salt, 'admin', tenantSlug)
        ];

        await db.batch(statements);

        // 5. Registrar el intento exitoso en el rate limiter
        await recordRegistrationAttempt(db, clientIp);

        // Notificar via webhook (asíncrono)
        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'new_tenant_registered', tenantSlug, tenantName, username, email })
                }));
            } catch (e) {
                console.error("Webhook error:", e);
            }
        }

        const host = new URL(request.url).host;
        return jsonResponse({
            success: true,
            message: `¡Registro exitoso! Tu tienda está disponible en ${host}/${tenantSlug}`,
            tenantId: tenantSlug
        }, 201);

    } catch (err) {
        console.error('Error en POST /api/onboarding:', err);
        return jsonResponse({ error: 'Error interno al registrar el negocio.' }, 500);
    }
};
