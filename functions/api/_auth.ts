// functions/api/_auth.ts
// Auxiliar de Autenticación para API de Vendly SaaS
import { getDB, parseCookies } from './_helpers';
import type { Env, UserSession } from '../types';

/**
 * Obtiene el token de la sesión desde las Cookies o el encabezado Authorization
 */
function getTokenFromRequest(request: Request): string | null {
    // 1. Intentar desde el encabezado Authorization: Bearer <token>
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    // 2. Intentar desde las Cookies: vendly_session=<token>
    const cookies = parseCookies(request.headers.get("Cookie"));
    return cookies["vendly_session"] || null;
}

interface SessionRow {
    username: string;
    role: string;
    tenant_id: string;
    ip?: string | null;
    ua_hash?: string | null;
    expires_at?: number;
}

/**
 * Valida la autenticidad del origen de las peticiones mutantes para mitigar CSRF (S-02)
 */
export function validateCsrf(request: Request, tenantDomain?: string | null): boolean {
    const method = request.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return true;
    }

    // Cabecera custom explícita enviada por clientes SPA
    const requestedWith = request.headers.get('X-Requested-With');
    if (requestedWith) return true;

    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const source = origin || referer;

    // Si no hay cabecera Origin ni Referer (ej: backend-to-backend con Bearer token),
    // validar si tiene Authorization header
    if (!source) {
        const authHeader = request.headers.get('Authorization');
        return Boolean(authHeader && authHeader.startsWith('Bearer '));
    }

    try {
        const sourceUrl = new URL(source);
        const sourceHost = sourceUrl.hostname.toLowerCase();
        const requestHost = new URL(request.url).hostname.toLowerCase();

        if (sourceHost === requestHost) return true;
        if (sourceHost === 'localhost' || sourceHost === '127.0.0.1') return true;
        if (sourceHost === 'vendly.app' || sourceHost.endsWith('.vendly.app')) return true;
        if (sourceHost.endsWith('.pages.dev')) return true;
        if (tenantDomain && (sourceHost === tenantDomain.toLowerCase() || sourceHost.endsWith(`.${tenantDomain.toLowerCase()}`))) return true;

        return false;
    } catch {
        return false;
    }
}

/**
 * Verifica si la sesión es válida y está activa en la base de datos D1
 */
export async function verifySession(
    context: { request: Request; env: Env },
    tenantId: string | null = null
): Promise<UserSession | null> {
    const { request, env } = context;
    const db = getDB(env);

    const token = getTokenFromRequest(request);
    if (!token) return null;

    try {
        const now = Math.floor(Date.now() / 1000);
        let query = `SELECT s.username, s.tenant_id, s.ip, s.ua_hash, s.expires_at, u.role 
             FROM sessions s
             JOIN users u ON s.username = u.username AND s.tenant_id = u.tenant_id
             WHERE s.token = ? AND s.expires_at > ?`;
        const bindings: (string | number)[] = [token, now];

        if (tenantId) {
            query += ' AND s.tenant_id = ?';
            bindings.push(tenantId);
        }

        const session = await db.prepare(query).bind(...bindings).first<SessionRow>();

        if (session) {
            // S-03: Mitigar secuestro de sesión mediante comparación de hash de User-Agent
            if (session.ua_hash) {
                const clientUa = request.headers.get('User-Agent') || 'unknown';
                const currentUaHash = (await hashSHA256(clientUa)).slice(0, 32);
                if (session.ua_hash !== currentUaHash) {
                    console.warn(`[Security] Posible secuestro de sesión detectado para usuario ${session.username}`);
                    return null;
                }
            }

            // S-03: Sliding expiration - Extender expiración si restan menos de 12 horas
            if (session.expires_at && (session.expires_at - now < 43200)) {
                const extendedExpiresAt = now + (7 * 24 * 60 * 60);
                db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
                    .bind(extendedExpiresAt, token)
                    .run()
                    .catch(() => {});
            }

            return {
                username: session.username,
                role: session.role,
                tenant_id: session.tenant_id,
            };
        }
    } catch (err) {
        console.error("Error verificando sesión:", err);
    }

    return null;
}

/**
 * Convierte un string hexadecimal a Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Convierte un Uint8Array a un string hexadecimal
 */
export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Genera el hash SHA-256 de una contraseña en texto plano
 */
export async function hashSHA256(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Genera un salt aleatorio en formato hexadecimal (128 bits)
 */
export function generateSalt(): string {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    return bytesToHex(saltBytes);
}

/**
 * Hashea una contraseña usando PBKDF2 con 100,000 iteraciones (directo sobre el texto plano)
 */
export async function hashPasswordPBKDF2(password: string, saltHex: string): Promise<string> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const derivedKeyBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: hexToBytes(saltHex) as any,
            iterations: 100000,
            hash: "SHA-256"
        },
        passwordKey,
        256
    );
    return bytesToHex(new Uint8Array(derivedKeyBits));
}

/**
 * Retorna una respuesta de error 401 Unauthorized
 */
export function unauthorizedResponse(message = "No autorizado. Sesión inválida o expirada."): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

/**
 * Retorna una respuesta de error 403 Forbidden
 */
export function forbiddenResponse(message = "Prohibido. No tienes permisos para realizar esta acción."): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: 403,
        headers: {
            "Content-Type": "application/json"
        }
    });
}
