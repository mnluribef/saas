import { verifySession, unauthorizedResponse, generateSalt, hashPasswordPBKDF2, hashSHA256 } from "./_auth.js";
import { resolveTenant } from "./_tenant.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 5 * 60 * 1000; // 5 minutos de bloqueo

async function checkRateLimit(db, ip) {
    const now = Date.now();
    
    let record;
    try {
        record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(ip).first();
    } catch(e) { return { allowed: true }; } // Fallback si la tabla no existe aún
    
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

async function recordFailedAttempt(db, ip) {
    const now = Date.now();
    try {
        let record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(ip).first();
        
        if (!record) {
            await db.prepare("INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)").bind(ip, now).run();
        } else {
            let newCount = record.count + 1;
            let newLockout = 0;
            if (newCount >= MAX_ATTEMPTS) {
                newLockout = now + LOCKOUT_TIME_MS;
            }
            await db.prepare("UPDATE rate_limits SET count = ?, lockout_until = ? WHERE ip = ?").bind(newCount, newLockout, ip).run();
        }
    } catch(e) {}
}

async function clearRateLimit(db, ip) {
    try {
        await db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(ip).run();
    } catch(e) {}
}

/**
 * GET /api/auth - Verifica el estado de la sesión actual
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    
    // Limpieza oportunista de sesiones expiradas
    try {
        const { env } = context;
        const db = env.DB || env.vendly;
        const now = Math.floor(Date.now() / 1000);
        context.waitUntil?.(
            db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run()
        );
    } catch (_) {}

    if (user) {
        return new Response(JSON.stringify({ authenticated: true, username: user.username, role: user.role }), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    }

    return new Response(JSON.stringify({ authenticated: false }), {
        headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

/**
 * POST /api/auth - Inicia sesión (Login)
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";
    const { id: tenantId } = await resolveTenant(request, db);

    // 1. Verificar Rate Limit
    const rateCheck = await checkRateLimit(db, clientIp);
    if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ 
            error: `Demasiados intentos fallidos. Por seguridad, espera ${rateCheck.remainingMinutes} minuto(s) antes de reintentar.` 
        }), {
            status: 429,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: "Usuario y contraseña requeridos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        
        const passwordHash = await hashSHA256(password);

        // Buscar usuario en base de datos (scoped al tenant)
        const user = await db.prepare("SELECT * FROM users WHERE username = ? AND tenant_id = ?")
            .bind(username.toLowerCase().trim(), tenantId)
            .first();

        if (!user) {
            await recordFailedAttempt(db, clientIp);
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
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
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Login exitoso: limpiar intentos fallidos
        await clearRateLimit(db, clientIp);

        // Generar un token seguro de sesión
        const sessionToken = crypto.randomUUID();
        const maxAge = 7 * 24 * 60 * 60; // 7 días en segundos
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        // Registrar la sesión en la base de datos (con tenant_id)
        await db.prepare("INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)")
            .bind(sessionToken, user.username, expiresAt, tenantId)
            .run();

        // Cookie segura HTTP-only para Vendly SaaS
        const cookie = `vendly_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
        
        return new Response(JSON.stringify({ success: true, username: user.username, role: user.role }), {
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": cookie
            }
        });
    } catch (err) {
        console.error("Error en POST /api/auth:", err);
        return new Response(JSON.stringify({ error: "Error en el servidor al autenticar." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/auth - Cambiar contraseña del administrador (Requiere sesión activa)
 */
export async function onRequestPut(context) {
    const sessionUser = await verifySession(context);
    if (!sessionUser) return unauthorizedResponse();

    const { request, env } = context;
    const db = env.DB || env.vendly;

    try {
        const { currentPassword, newPassword } = await request.json();

        if (!currentPassword || !newPassword) {
            return new Response(JSON.stringify({ error: "Debes enviar la contraseña actual y la nueva." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        
        const currentPasswordHash = await hashSHA256(currentPassword);
        const newPasswordHash = await hashSHA256(newPassword);

        const user = await db.prepare("SELECT * FROM users WHERE username = ?")
            .bind(sessionUser.username.toLowerCase().trim())
            .first();

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
            return new Response(JSON.stringify({ error: "La contraseña actual es incorrecta." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar nuevo salt y hash PBKDF2 para la nueva contraseña
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(newPasswordHash, newSalt);

        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
            .bind(newHash, newSalt, user.id)
            .run();

        // Invalidar todas las sesiones antiguas excepto la actual si se desea, o cerrar todas por seguridad
        return new Response(JSON.stringify({ success: true, message: "Contraseña actualizada exitosamente." }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en PUT /api/auth:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar contraseña." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/auth - Cierra sesión (Logout)
 */
export async function onRequestDelete(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;

    const cookieHeader = request.headers.get("Cookie");
    let token = null;
    if (cookieHeader) {
        const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split("=");
            acc[key] = value;
            return acc;
        }, {});
        token = cookies["vendly_session"];
    }

    if (token) {
        try {
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    // Limpiar cookie de sesión de Vendly
    const clearVendlyCookie = `vendly_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

    const headers = new Headers({
        "Content-Type": "application/json"
    });
    headers.append("Set-Cookie", clearVendlyCookie);

    return new Response(JSON.stringify({ success: true }), {
        headers
    });
}
