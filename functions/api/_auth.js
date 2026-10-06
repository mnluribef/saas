// Auxiliar de Autenticación para API de Vendly SaaS

/**
 * Obtiene el token de la sesión desde las Cookies o el encabezado Authorization
 * @param {Request} request 
 */
function getTokenFromRequest(request) {
    // 1. Intentar desde el encabezado Authorization: Bearer <token>
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    // 2. Intentar desde las Cookies: vendly_session=<token>
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
        const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split("=");
            acc[key] = value;
            return acc;
        }, {});
        return cookies["vendly_session"];
    }

    return null;
}

/**
 * Verifica si la sesión es válida y está activa en la base de datos D1
 * @param {object} context - Contexto de la función de Cloudflare Pages
 * @param {string|null} tenantId - ID del tenant para validación cruzada (opcional)
 * @returns {Promise<{username: string, role: string, tenant_id: string}|null>}
 */
export async function verifySession(context, tenantId = null) {
    const { request, env } = context;
    const db = env.DB || env.vendly;

    const token = getTokenFromRequest(request);
    if (!token) return null;

    try {
        const now = Math.floor(Date.now() / 1000);
        let query = `SELECT s.username, s.tenant_id, u.role 
             FROM sessions s
             JOIN users u ON s.username = u.username AND s.tenant_id = u.tenant_id
             WHERE s.token = ? AND s.expires_at > ?`;
        const bindings = [token, now];

        // Si se pasa tenantId, aseguramos que la sesión pertenezca a ese tenant
        if (tenantId) {
            query += ' AND s.tenant_id = ?';
            bindings.push(tenantId);
        }

        const session = await db.prepare(query).bind(...bindings).first();

        if (session) {
            return { username: session.username, role: session.role, tenant_id: session.tenant_id };
        }
    } catch (err) {
        console.error("Error verificando sesión:", err);
    }

    return null;
}


/**
 * Convierte un string hexadecimal a Uint8Array
 */
export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Convierte un Uint8Array a un string hexadecimal
 */
export function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Genera el hash SHA-256 de una contraseña en texto plano (para retrocompatibilidad y hashing base)
 */
export async function hashSHA256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Genera un salt aleatorio en formato hexadecimal (128 bits)
 */
export function generateSalt() {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    return bytesToHex(saltBytes);
}

/**
 * Hashea una contraseña (recibida como hash SHA-256) usando PBKDF2 con 100,000 iteraciones
 */
export async function hashPasswordPBKDF2(passwordHash, saltHex) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(passwordHash),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const derivedKeyBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: hexToBytes(saltHex),
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
export function unauthorizedResponse() {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión inválida o expirada." }), {
        status: 401,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

/**
 * Retorna una respuesta de error 403 Forbidden
 */
export function forbiddenResponse() {
    return new Response(JSON.stringify({ error: "Prohibido. No tienes permisos para realizar esta acción." }), {
        status: 403,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

