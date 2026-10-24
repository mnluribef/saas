// functions/api/auth.ts
// Endpoints de autenticación, sesión y cambio de contraseña
import type { D1Database } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf, generateSalt, hashPasswordPBKDF2, hashSHA256, generateSessionToken, buildSessionCookie } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, parseCookies, jsonResponse } from "./_helpers";
import { RateLimitService } from "./_services/rate-limit.service";
import type { Env, PagesHandler } from '../types';


export const COMMON_PASSWORDS = new Set([
    '12345678', 'password', 'qwerty123', 'admin123', '123456789', '1234567890',
    'password123', 'ventrina123', 'contraseña', 'welcome1', 'admin1234', '11111111',
    'abc12345', 'pass1234'
]);

export const strongPasswordSchema = z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .refine(p => !COMMON_PASSWORDS.has(p.toLowerCase()), "La contraseña es demasiado común o predecible");

export const loginSchema = z.object({
    email: z.email("Correo electrónico válido requerido"),
    password: z.string().min(1, "Contraseña requerida"),
    tenant: z.string().max(60).optional(),
    tenantId: z.string().max(60).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Contraseña actual requerida"),
    newPassword: strongPasswordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 5 * 60 * 1000; // 5 minutos de bloqueo


interface UserDbRow {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    password_salt: string | null;
    role: string;
    tenant_id: string;
}

export async function purgeExpiredRateLimits(_db: D1Database): Promise<number> {
    // KV expira los registros automáticamente via TTL, no se requiere purga manual.
    return 0;
}


/**
 * GET /api/auth - Verifica el estado de la sesión actual
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const user = await verifySession(context);
    
    // Limpieza oportunista de sesiones expiradas
    try {
        const { env } = context;
        const db = getDB(env);
        const now = Math.floor(Date.now() / 1000);
        context.waitUntil?.(
            db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run()
        );
    } catch {}

    if (user) {
        return jsonResponse(
            { authenticated: true, email: user.email, username: user.email, role: user.role, tenantId: user.tenant_id },
            200,
            { "Cache-Control": "no-store, no-cache, must-revalidate" }
        );
    }

    const cookies = parseCookies(context.request.headers.get("Cookie"));
    const hadSessionCookie = Boolean(cookies["ventrina_session"]);

    if (hadSessionCookie) {
        const clearCookie = buildSessionCookie('', context.request, 0);
        return jsonResponse(
            { authenticated: false, expired: true },
            200,
            {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Set-Cookie": clearCookie
            }
        );
    }

    return jsonResponse(
        { authenticated: false },
        200,
        { "Cache-Control": "no-store, no-cache, must-revalidate" }
    );
};

/**
 * POST /api/auth - Inicia sesión (Login Multi-Tenant)
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // 1. Verificar Rate Limit via KV (S-03 — Fix #1: migrado de D1 a KV para soportar alta concurrencia)
    const rateLimitService = new RateLimitService(env.KV);

    const rateCheck = await rateLimitService.checkRateLimit(clientIp, {
        maxAttempts: MAX_ATTEMPTS,
        windowMs: LOCKOUT_TIME_MS
    });
    if (!rateCheck.allowed) {
        return jsonResponse({ 
            error: `Demasiados intentos fallidos. Por seguridad, espera ${rateCheck.remainingMinutes} minuto(s) antes de reintentar.` 
        }, 429);
    }

    try {
        const bodyJson = await request.json();
        const parseResult = loginSchema.safeParse(bodyJson);

        if (!parseResult.success) {
            return jsonResponse({ error: "Correo electrónico y contraseña requeridos.", details: parseResult.error.issues }, 400);
        }
        
        const { email, password, tenant: bodyTenant, tenantId: bodyTenantId } = parseResult.data;

        // Resolución Inteligente del Tenant
        const urlTenant = new URL(request.url).searchParams.get('tenant');
        let effectiveTenantId = (bodyTenant || bodyTenantId || urlTenant || '').trim().toLowerCase();

        if (!effectiveTenantId) {
            const { id: resolvedId } = await resolveTenant(request, db);
            effectiveTenantId = resolvedId;
        }

        const cleanEmail = email.toLowerCase().trim();

        // Si aún no está especificado y cae en 'demo', buscar si este email pertenece a un único tenant
        if (effectiveTenantId === 'demo') {
            try {
                const userMatches = await db.prepare(
                    "SELECT tenant_id FROM users WHERE email = ?"
                ).bind(cleanEmail).all<{ tenant_id: string }>();

                if (userMatches?.results && userMatches.results.length === 1) {
                    effectiveTenantId = userMatches.results[0].tenant_id;
                }
            } catch {}
        }

        // Buscar usuario en base de datos (scoped al tenant resuelto) por email exclusivamente
        const user = await db.prepare("SELECT * FROM users WHERE email = ? AND tenant_id = ?")
            .bind(cleanEmail, effectiveTenantId)
            .first<UserDbRow>();

        if (!user) {
            await rateLimitService.recordFailure(clientIp, { maxAttempts: MAX_ATTEMPTS, windowMs: LOCKOUT_TIME_MS });
            return jsonResponse({ error: "Credenciales inválidas o tienda no encontrada." }, 401);
        }

        let isMatch = false;

        if (!user.password_salt) {
            // Caso 1: Usuario legacy con SHA-256 plano
            const legacyHash = await hashSHA256(password);
            isMatch = (user.password_hash === legacyHash);
            
            if (isMatch) {
                // Migrar automáticamente al nuevo formato PBKDF2 directo (Fix #5)
                const newSalt = generateSalt();
                const newHash = await hashPasswordPBKDF2(password, newSalt);
                
                await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
                    .bind(newHash, newSalt, user.id)
                    .run();
            }
        } else {
            // Caso 2: Usuario con PBKDF2 directo (Fix #5)
            const directHash = await hashPasswordPBKDF2(password, user.password_salt);
            if (user.password_hash === directHash) {
                isMatch = true;
            } else {
                // Caso 2b: Compatibilidad hacia atrás con hash previo PBKDF2(SHA256(password), salt)
                const legacySha = await hashSHA256(password);
                const legacyHash = await hashPasswordPBKDF2(legacySha, user.password_salt);
                if (user.password_hash === legacyHash) {
                    isMatch = true;
                    // Auto-migrar silenciosamente a PBKDF2 directo
                    const newSalt = generateSalt();
                    const newHash = await hashPasswordPBKDF2(password, newSalt);
                    await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
                        .bind(newHash, newSalt, user.id)
                        .run();
                }
            }
        }

        if (!isMatch) {
            await rateLimitService.recordFailure(clientIp, { maxAttempts: MAX_ATTEMPTS, windowMs: LOCKOUT_TIME_MS });
            return jsonResponse({ error: "Credenciales inválidas." }, 401);
        }

        // Login exitoso: limpiar intentos fallidos
        await rateLimitService.clear(clientIp);

        // Generar un token criptográficamente seguro de sesión (256 bits S-04)
        const sessionToken = generateSessionToken();
        const maxAge = 7 * 24 * 60 * 60; // 7 días en segundos
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        // S-03: Registrar la sesión en la base de datos con IP y hash de User-Agent
        const clientUa = request.headers.get("User-Agent") || "unknown";
        const uaHash = (await hashSHA256(clientUa)).slice(0, 32);

        try {
            await db.prepare("INSERT INTO sessions (token, username, expires_at, tenant_id, ip, ua_hash) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(sessionToken, user.email || cleanEmail, expiresAt, effectiveTenantId, clientIp, uaHash)
                .run();
        } catch {
            // Fallback defensivo si la tabla sessions no tiene las columnas ip o ua_hash
            await db.prepare("INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)")
                .bind(sessionToken, user.email || cleanEmail, expiresAt, effectiveTenantId)
                .run();
        }

        const cookie = buildSessionCookie(sessionToken, request, maxAge);
        
        return jsonResponse(
            { success: true, email: user.email || cleanEmail, username: user.email || cleanEmail, role: user.role, tenantId: effectiveTenantId, tenant: effectiveTenantId },
            200,
            { "Set-Cookie": cookie }
        );
    } catch (err) {
        console.error("Error en POST /api/auth:", err);
        return jsonResponse({ error: "Error en el servidor al autenticar." }, 500);
    }
};

/**
 * PUT /api/auth - Cambiar contraseña del administrador (Aislado por Tenant)
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    if (!validateCsrf(request)) return forbiddenResponse("Verificación de seguridad CSRF fallida.");

    const sessionUser = await verifySession(context);
    if (!sessionUser) return unauthorizedResponse();

    const db = getDB(env);
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // Protección contra fuerza bruta en cambio de contraseña (Fix #4, S-03)
    const rateLimitService = new RateLimitService(env.KV);

    const rateCheck = await rateLimitService.checkRateLimit(clientIp, {
        maxAttempts: MAX_ATTEMPTS,
        windowMs: LOCKOUT_TIME_MS
    });
    if (!rateCheck.allowed) {
        return jsonResponse({ 
            error: `Demasiados intentos fallidos. Por seguridad, espera ${rateCheck.remainingMinutes} minuto(s) antes de reintentar.` 
        }, 429);
    }

    try {
        const bodyJson = await request.json();
        const parseResult = changePasswordSchema.safeParse(bodyJson);

        if (!parseResult.success) {
            return jsonResponse({ error: "Debes enviar la contraseña actual y la nueva.", details: parseResult.error.issues }, 400);
        }

        const { currentPassword, newPassword } = parseResult.data;

        // Búsqueda estrictamente aislada por email Y tenant_id
        const userEmail = (sessionUser.email || sessionUser.username).toLowerCase().trim();
        const user = await db.prepare("SELECT * FROM users WHERE (email = ? OR username = ?) AND tenant_id = ?")
            .bind(userEmail, userEmail, sessionUser.tenant_id)
            .first<UserDbRow>();

        if (!user) {
            return unauthorizedResponse();
        }

        // Verificar contraseña actual con soporte retroactivo (Fix #5)
        let currentMatch = false;
        if (!user.password_salt) {
            const currentSha = await hashSHA256(currentPassword);
            currentMatch = (user.password_hash === currentSha);
        } else {
            const directHash = await hashPasswordPBKDF2(currentPassword, user.password_salt);
            if (user.password_hash === directHash) {
                currentMatch = true;
            } else {
                const legacySha = await hashSHA256(currentPassword);
                const legacyHash = await hashPasswordPBKDF2(legacySha, user.password_salt);
                currentMatch = (user.password_hash === legacyHash);
            }
        }

        if (!currentMatch) {
            await rateLimitService.recordFailure(clientIp, { maxAttempts: MAX_ATTEMPTS, windowMs: LOCKOUT_TIME_MS });
            return jsonResponse({ error: "La contraseña actual es incorrecta." }, 400);
        }

        // Generar nuevo salt y hash PBKDF2 DIRECTO para la nueva contraseña (Fix #5)
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(newPassword, newSalt);

        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ? AND tenant_id = ?")
            .bind(newHash, newSalt, user.id, sessionUser.tenant_id)
            .run();

        // Limpiar intentos fallidos tras éxito
        await rateLimitService.clear(clientIp);

        return jsonResponse({ success: true, message: "Contraseña actualizada exitosamente." });

    } catch (err) {
        console.error("Error en PUT /api/auth:", err);
        return jsonResponse({ error: "Error al actualizar contraseña." }, 500);
    }
};

/**
 * DELETE /api/auth - Cierra sesión (Logout)
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    const cookies = parseCookies(request.headers.get("Cookie"));
    const token = cookies["ventrina_session"] || null;

    if (token) {
        try {
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    const clearVentrinaCookie = buildSessionCookie('', request, 0);

    const headers = new Headers({
        "Content-Type": "application/json"
    });
    headers.append("Set-Cookie", clearVentrinaCookie);

    return new Response(JSON.stringify({ success: true }), { headers });
};
