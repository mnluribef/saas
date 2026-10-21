// functions/api/onboarding.ts
// Registro de nuevos clientes (Creación de Tenant + Admin)
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { z } from "zod";
import { generateSalt, hashPasswordPBKDF2, generateSessionToken, buildSessionCookie } from "./_auth";
import { strongPasswordSchema } from "./auth";
import { getDB, jsonResponse } from "./_helpers";
import { sendWelcomeEmail } from "./_services/email.service";
import { generateWebhookSignature } from "./_services/order.service";
import { RateLimitService } from "./_services/rate-limit.service";
import { invalidateTenantCache, SYSTEM_PATHS, SYSTEM_SUBDOMAINS } from "./_tenant";
import { getStarterProducts } from "../../src/config/starter-products";
import type { Env, PagesHandler } from '../types';

export const onboardingSchema = z.object({
    tenantName: z.string().min(2, "El nombre del negocio es muy corto").max(100),
    tenantSlug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, "El slug solo puede contener minúsculas, números y guiones."),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts', 'grocery']).default('restaurant'),
    email: z.email("Formato de correo electrónico inválido"),
    password: strongPasswordSchema,
    whatsapp: z.string().max(30).optional().nullable(),
    acceptTerms: z.boolean().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

const MAX_REGISTRATIONS_PER_HOUR = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hora

/**
 * Asegura que la columna 'email' exista en la tabla 'users' de forma defensiva y autosanadora.
 */
async function ensureUsersEmailColumn(db: D1Database): Promise<boolean> {
    try {
        const tableInfo = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
        const hasEmail = tableInfo?.results?.some(col => col.name === 'email');
        if (!hasEmail) {
            await db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
            try {
                await db.prepare("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)").run();
            } catch {}
        }
        return true;
    } catch {
        try {
            await db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
            return true;
        } catch {
            return false;
        }
    }
}

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // 1. S-03: Verificar rate limit mediante RateLimitService compartido
    const rateLimitService = new RateLimitService(db);
    const rateCheck = await rateLimitService.checkRateLimit(`reg_${clientIp}`, {
        maxAttempts: MAX_REGISTRATIONS_PER_HOUR,
        windowMs: REGISTRATION_WINDOW_MS
    });

    if (!rateCheck.allowed) {
        return jsonResponse({
            error: `Demasiados registros desde esta IP. Por favor espera ${rateCheck.remainingMinutes || 60} minuto(s) antes de intentar nuevamente.`
        }, 429);
    }

    try {
        const rawData = await request.json();
        const result = onboardingSchema.safeParse(rawData);

        if (!result.success) {
            return jsonResponse({ error: 'Datos inválidos', details: result.error.issues }, 400);
        }

        const { tenantName, tenantSlug, template, password, email, whatsapp } = result.data;
        const cleanEmail = email.toLowerCase().trim();
        
        // Normalizar número de WhatsApp a formato internacional (E.164 Venezuela / LatAm)
        let cleanWhatsApp = whatsapp ? whatsapp.replace(/[^0-9]/g, '') : null;
        if (cleanWhatsApp) {
            if (cleanWhatsApp.startsWith('0')) {
                cleanWhatsApp = '58' + cleanWhatsApp.substring(1);
            } else if (cleanWhatsApp.length === 10 && !cleanWhatsApp.startsWith('58')) {
                cleanWhatsApp = '58' + cleanWhatsApp;
            }
        }

        // 2. Verificar disponibilidad de Slug y Correo
        if (SYSTEM_PATHS.has(tenantSlug) || SYSTEM_SUBDOMAINS.has(tenantSlug)) {
            return jsonResponse({ error: `El subdominio o identificador "${tenantSlug}" está reservado por el sistema.` }, 400);
        }

        const existingTenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantSlug).first();
        if (existingTenant) {
            return jsonResponse({ error: `El subdominio o dirección "${tenantSlug}" ya está en uso.` }, 400);
        }

        const hasEmailCol = await ensureUsersEmailColumn(db);

        const existingUser = hasEmailCol
            ? await db.prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ?')
                .bind(cleanEmail, tenantSlug).first()
            : await db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ?')
                .bind(cleanEmail, tenantSlug).first();

        if (existingUser) {
            return jsonResponse({ error: `El correo "${cleanEmail}" ya está registrado en esta tienda.` }, 400);
        }

        // 3. Hash de contraseña directo con PBKDF2 + salt (Fix #5)
        const salt = generateSalt();
        const finalHash = await hashPasswordPBKDF2(password, salt);

        // 4. Generar sesión automática con token de alta entropía (256 bits S-04)
        const sessionToken = generateSessionToken();
        const maxAge = 7 * 24 * 60 * 60; // 7 días
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        const legalMetadata = {
            legal: {
                terms_version: 'v1.0',
                terms_accepted: true,
                accepted_at: new Date().toISOString(),
                registration_ip: clientIp
            }
        };

        const userInsertStmt = hasEmailCol
            ? db.prepare(
                'INSERT INTO users (username, email, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(cleanEmail, cleanEmail, finalHash, salt, 'admin', tenantSlug)
            : db.prepare(
                'INSERT INTO users (username, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?)'
            ).bind(cleanEmail, finalHash, salt, 'admin', tenantSlug);

        const statements: D1PreparedStatement[] = [
            db.prepare(
                'INSERT INTO tenants (id, name, plan, template, config_json, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(tenantSlug, tenantName, 'basic', template, JSON.stringify(legalMetadata), cleanWhatsApp || null, 1),
            
            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '853.50', ?)"
            ).bind(tenantSlug),

            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_auto_update', '1', ?)"
            ).bind(tenantSlug),

            userInsertStmt,

            db.prepare(
                'INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)'
            ).bind(sessionToken, cleanEmail, expiresAt, tenantSlug)
        ];

        // 5. Sembrar productos iniciales de ejemplo (OCP - configuración desacoplada)
        const starterProducts = getStarterProducts(tenantSlug, template);
        for (const p of starterProducts) {
            statements.push(
                db.prepare(
                    'INSERT INTO products (id, name, description, price, category, icon, image_url, template, stock, active, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(p.id, p.name, p.description, p.price, p.category, p.icon, p.image_url, template, p.stock, 1, tenantSlug)
            );
        }

        await db.batch(statements);

        // 6. Registrar el intento exitoso en el rate limiter
        await rateLimitService.recordAttempt(`reg_${clientIp}`);

        // F-01: Invalidar y calentar caché KV para el nuevo tenant
        await invalidateTenantCache(env.KV, tenantSlug);

        // S-01: Notificar via webhook autenticado con firma HMAC-SHA256 (asíncrono)
        if (env.WEBHOOK_URL) {
            try {
                const webhookPayload = JSON.stringify({
                    event: 'new_tenant_registered',
                    tenantSlug,
                    tenantName,
                    email: cleanEmail,
                    timestamp: new Date().toISOString()
                });
                const webhookSecret = (env.WEBHOOK_SECRET as string) || (env.JWT_SECRET as string) || 'ventrina-webhook-secret-salt';
                const signature = await generateWebhookSignature(webhookPayload, webhookSecret);

                context.waitUntil?.(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Ventrina-Signature': `sha256=${signature}`
                    },
                    body: webhookPayload
                }).catch(e => console.error("Webhook error:", e)));
            } catch (e) {
                console.error("Webhook signature/dispatch error:", e);
            }
        }

        const url = new URL(request.url);
        const host = (request.headers.get('x-forwarded-host') || url.hostname).toLowerCase();
        const isVentrinaApp = host.endsWith('ventrina.app');
        const cookie = buildSessionCookie(sessionToken, request, maxAge);

        const storeHost = isVentrinaApp 
            ? `${tenantSlug}.ventrina.app` 
            : (host.includes('localhost') ? `${tenantSlug}.localhost:${url.port || '8788'}` : `${tenantSlug}.${host}`);

        const storeUrl = `https://${storeHost}`;
        const adminUrl = isVentrinaApp
            ? `https://${tenantSlug}.ventrina.app/admin`
            : `${url.origin}/admin?tenant=${tenantSlug}`;

        // Enviar correo de bienvenida con instrucciones de primeros pasos (asíncrono)
        try {
            context.waitUntil?.(
                sendWelcomeEmail(env, {
                    to: cleanEmail,
                    tenantName,
                    tenantSlug,
                    template,
                    storeUrl,
                    adminUrl
                })
            );
        } catch (emailErr) {
            console.error('Error al programar envío de email de bienvenida:', emailErr);
        }

        return jsonResponse({
            success: true,
            message: `¡Registro exitoso! Tu tienda está disponible en https://${storeHost}`,
            tenantId: tenantSlug
        }, 201, { "Set-Cookie": cookie });

    } catch (err: unknown) {
        // S-02: Eliminar exposición de detalles internos o constraints de BD
        console.error('Error en POST /api/onboarding:', err);
        const message = err instanceof Error ? err.message : 'Error interno al registrar el negocio.';
        return jsonResponse({ error: message }, 500);
    }
};
