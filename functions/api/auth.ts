// functions/api/auth.ts
// Endpoints de autenticación, sesión y cambio de contraseña
import type { D1Database } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf, generateSalt, hashPasswordPBKDF2, hashSHA256 } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, parseCookies, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const COMMON_PASSWORDS = new Set([
    '12345678', 'password', 'qwerty123', 'admin123', '123456789', '1234567890',
    'password123', 'ventrina123', 'vendly123', 'contraseña', 'welcome1', 'admin1234', '11111111',
    'abc12345', 'pass1234'
]);

export const strongPasswordSchema = z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .refine(p => !COMMON_PASSWORDS.has(p.toLowerCase()), "La contraseña es demasiado común o predecible");

export const loginSchema = z.object({
    username: z.string().min(1, "Usuario requerido"),
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

interface RateLimitRow {
    ip: string;
    count: number;
    first_attempt: number;
    lockout_until: number;
}

interface UserDbRow {
    id: string;
    username: string;
    password_hash: string;
    password_salt: string | null;
    role: string;
    tenant_id: string;
}

export async function purgeExpiredRateLimits(db: D1Database): Promise<number> {
    const now = Date.now();
    try {
        const res = await db.prepare(
            "DELETE FROM rate_limits WHERE (? - first_attempt > ?) AND (? >= lockout_until)"
        ).bind(now, LOCKOUT_TIME_MS, now).run();
        return res?.meta?.changes ?? 0;
    } catch {
        return 0;
    }
}

async function checkRateLimit(db: D1Database, ip: string): Promise<{ allowed: boolean; remainingMinutes?: number }> {
    const now = Date.now();
    
    // Auto-purga de registros expirados en segundo plano (Fix #8)
    await purgeExpiredRateLimits(db);
    
    let record: RateLimitRow | null = null;
    try {
        record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(ip).first<RateLimitRow>();
    } catch {
        return { allowed: true };
    }
    
    if (!record) return { allowed: true };

    if (now < record.lockout_until) {
        const remainingMinutes = Math.ceil((record.lockout_until - now) / 60000);
        return { allowed: false, remainingMinutes };
    }

    if (now - record.first_attempt > LOCKOUT_TIME_MS) {
        await db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(ip).run();
        return { allowed: true };
    }

    return { allowed: true };
}

async function recordFailedAttempt(db: D1Database, ip: string): Promise<void> {
    const now = Date.now();
    try {
        const record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(ip).first<RateLimitRow>();
        
        if (!record) {
            await db.prepare("INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)").bind(ip, now).run();
        } else {
            const newCount = record.count + 1;
            let newLockout = 0;
            if (newCount >= MAX_ATTEMPTS) {
                newLockout = now + LOCKOUT_TIME_MS;
            }
            await db.prepare("UPDATE rate_limits SET count = ?, lockout_until = ? WHERE ip = ?").bind(newCount, newLockout, ip).run();
        }
    } catch {}
}

async function clearRateLimit(db: D1Database, ip: string): Promise<void> {
    try {
        await db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(ip).run();
    } catch {}
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
            { authenticated: true, username: user.username, role: user.role, tenantId: user.tenant_id },
            200,
            { "Cache-Control": "no-store, no-cache, must-revalidate" }
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

    // 1. Verificar Rate Limit
    const rateCheck = await checkRateLimit(db, clientIp);
    if (!rateCheck.allowed) {
        return jsonResponse({ 
            error: `Demasiados intentos fallidos. Por seguridad, espera ${rateCheck.remainingMinutes} minuto(s) antes de reintentar.` 
        }, 429);
    }

    try {
        const bodyJson = await request.json();
        const parseResult = loginSchema.safeParse(bodyJson);

        if (!parseResult.success) {
            return jsonResponse({ error: "Usuario y contraseña requeridos.", details: parseResult.error.issues }, 400);
        }
        
        const { username, password, tenant: bodyTenant, tenantId: bodyTenantId } = parseResult.data;

        // Resolución Inteligente del Tenant
        const urlTenant = new URL(request.url).searchParams.get('tenant');
        let effectiveTenantId = (bodyTenant || bodyTenantId || urlTenant || '').trim().toLowerCase();

        if (!effectiveTenantId) {
            const { id: resolvedId } = await resolveTenant(request, db);
            effectiveTenantId = resolvedId;
        }

        // Si aún no está especificado y cae en 'demo', buscar si este username pertenece a un único tenant
        if (effectiveTenantId === 'demo') {
            const userMatches = await db.prepare(
                "SELECT tenant_id FROM users WHERE username = ?"
            ).bind(username.toLowerCase().trim()).all<{ tenant_id: string }>();

            if (userMatches?.results && userMatches.results.length === 1) {
                effectiveTenantId = userMatches.results[0].tenant_id;
            }
        }

        // Buscar usuario en base de datos (scoped al tenant resuelto)
        const user = await db.prepare("SELECT * FROM users WHERE username = ? AND tenant_id = ?")
            .bind(username.toLowerCase().trim(), effectiveTenantId)
            .first<UserDbRow>();

        if (!user) {
            await recordFailedAttempt(db, clientIp);
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
            await recordFailedAttempt(db, clientIp);
            return jsonResponse({ error: "Credenciales inválidas." }, 401);
        }

        // Login exitoso: limpiar intentos fallidos
        await clearRateLimit(db, clientIp);

        // Generar un token seguro de sesión
        const sessionToken = crypto.randomUUID();
        const maxAge = 7 * 24 * 60 * 60; // 7 días en segundos
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        // S-03: Registrar la sesión en la base de datos con IP y hash de User-Agent
        const clientUa = request.headers.get("User-Agent") || "unknown";
        const uaHash = (await hashSHA256(clientUa)).slice(0, 32);

        await db.prepare("INSERT INTO sessions (token, username, expires_at, tenant_id, ip, ua_hash) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(sessionToken, user.username, expiresAt, effectiveTenantId, clientIp, uaHash)
            .run();

        const cookie = `ventrina_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
        
        return jsonResponse(
            { success: true, username: user.username, role: user.role, tenantId: effectiveTenantId, tenant: effectiveTenantId },
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

    // Protección contra fuerza bruta en cambio de contraseña (Fix #4)
    const rateCheck = await checkRateLimit(db, clientIp);
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

        // Búsqueda estrictamente aislada por username Y tenant_id
        const user = await db.prepare("SELECT * FROM users WHERE username = ? AND tenant_id = ?")
            .bind(sessionUser.username.toLowerCase().trim(), sessionUser.tenant_id)
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
            await recordFailedAttempt(db, clientIp);
            return jsonResponse({ error: "La contraseña actual es incorrecta." }, 400);
        }

        // Generar nuevo salt y hash PBKDF2 DIRECTO para la nueva contraseña (Fix #5)
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(newPassword, newSalt);

        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ? AND tenant_id = ?")
            .bind(newHash, newSalt, user.id, sessionUser.tenant_id)
            .run();

        // Limpiar intentos fallidos tras éxito
        await clearRateLimit(db, clientIp);

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
    const token = cookies["ventrina_session"] || cookies["vendly_session"] || null;

    if (token) {
        try {
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    const clearVentrinaCookie = `ventrina_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
    const clearVendlyCookie = `vendly_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

    const headers = new Headers({
        "Content-Type": "application/json"
    });
    headers.append("Set-Cookie", clearVentrinaCookie);
    headers.append("Set-Cookie", clearVendlyCookie);

    return new Response(JSON.stringify({ success: true }), { headers });
};
