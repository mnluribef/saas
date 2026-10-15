// functions/api/auth.ts
// Endpoints de autenticación, sesión y cambio de contraseña
import type { D1Database } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse, generateSalt, hashPasswordPBKDF2, hashSHA256 } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, parseCookies, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const loginSchema = z.object({
    username: z.string().min(1, "Usuario requerido"),
    password: z.string().min(1, "Contraseña requerida"),
    tenant: z.string().max(60).optional(),
    tenantId: z.string().max(60).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Contraseña actual requerida"),
    newPassword: z.string().min(1, "Nueva contraseña requerida"),
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

async function checkRateLimit(db: D1Database, ip: string): Promise<{ allowed: boolean; remainingMinutes?: number }> {
    const now = Date.now();
    
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
        const passwordHash = await hashSHA256(password);

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
            isMatch = (user.password_hash === passwordHash);
            
            if (isMatch) {
                // Migrar automáticamente al nuevo formato PBKDF2
                const newSalt = generateSalt();
                const newHash = await hashPasswordPBKDF2(passwordHash, newSalt);
                
                await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
                    .bind(newHash, newSalt, user.id)
                    .run();
            }
        } else {
            // Caso 2: Usuario con PBKDF2
            const calculatedHash = await hashPasswordPBKDF2(passwordHash, user.password_salt);
            isMatch = (user.password_hash === calculatedHash);
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

        // Registrar la sesión en la base de datos (con tenant_id)
        await db.prepare("INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)")
            .bind(sessionToken, user.username, expiresAt, effectiveTenantId)
            .run();

        const cookie = `vendly_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
        
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
    const sessionUser = await verifySession(context);
    if (!sessionUser) return unauthorizedResponse();

    const { request, env } = context;
    const db = getDB(env);

    try {
        const bodyJson = await request.json();
        const parseResult = changePasswordSchema.safeParse(bodyJson);

        if (!parseResult.success) {
            return jsonResponse({ error: "Debes enviar la contraseña actual y la nueva.", details: parseResult.error.issues }, 400);
        }

        const { currentPassword, newPassword } = parseResult.data;
        
        const currentPasswordHash = await hashSHA256(currentPassword);
        const newPasswordHash = await hashSHA256(newPassword);

        // Búsqueda estrictamente aislada por username Y tenant_id
        const user = await db.prepare("SELECT * FROM users WHERE username = ? AND tenant_id = ?")
            .bind(sessionUser.username.toLowerCase().trim(), sessionUser.tenant_id)
            .first<UserDbRow>();

        if (!user) {
            return unauthorizedResponse();
        }

        // Verificar contraseña actual
        let currentMatch = false;
        if (!user.password_salt) {
            currentMatch = (user.password_hash === currentPasswordHash);
        } else {
            const calculatedHash = await hashPasswordPBKDF2(currentPasswordHash, user.password_salt);
            currentMatch = (user.password_hash === calculatedHash);
        }

        if (!currentMatch) {
            return jsonResponse({ error: "La contraseña actual es incorrecta." }, 400);
        }

        // Generar nuevo salt y hash PBKDF2 para la nueva contraseña
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(newPasswordHash, newSalt);

        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ? AND tenant_id = ?")
            .bind(newHash, newSalt, user.id, sessionUser.tenant_id)
            .run();

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

    const token = parseCookies(request.headers.get("Cookie"))["vendly_session"] || null;

    if (token) {
        try {
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    const clearVendlyCookie = `vendly_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

    const headers = new Headers({
        "Content-Type": "application/json"
    });
    headers.append("Set-Cookie", clearVendlyCookie);

    return new Response(JSON.stringify({ success: true }), { headers });
};
