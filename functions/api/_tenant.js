// functions/api/_tenant.js
// Middleware multi-tenant: resuelve el tenant desde la request y lo inyecta en context.tenant

/**
 * Resuelve el tenant_id desde:
 * 1. Header X-Tenant-Id (para testing/admin)
 * 2. Subdominio: fogon.vendly.app → 'fogon'
 * 3. Path-based: vendly.app/s/fogon → 'fogon'
 * 4. Custom domain: fogon.com → lookup en DB por domain
 * 5. Fallback: 'demo'
 *
 * @param {Request} request
 * @param {object} db - Cloudflare D1 binding
 * @returns {Promise<{id: string, tenant: object|null}>}
 */
export async function resolveTenant(request, db) {
    const url = new URL(request.url);
    const host = url.hostname; // e.g. 'fogon.vendly.app' or 'fogon.com'

    // 0.1 Query Parameter (direct navigation / fetch)
    const qsTenant = url.searchParams.get('tenant');
    if (qsTenant) {
        const tenant = await getTenantById(db, qsTenant);
        if (tenant) return { id: qsTenant, tenant };
    }

    // 0.2 Header explícito (útil en desarrollo local, testing y super-admin)
    const headerTenantId = request.headers.get('X-Tenant-Id');
    if (headerTenantId) {
        const tenant = await getTenantById(db, headerTenantId);
        if (tenant) return { id: headerTenantId, tenant };
    }

    // 0.3 Referer Header (API calls desde páginas del frontend como vendly-20w.pages.dev/mitienda)
    const referer = request.headers.get('Referer');
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            // 1. Query parameter en Referer
            const refererTenant = refererUrl.searchParams.get('tenant');
            if (refererTenant) {
                const tenant = await getTenantById(db, refererTenant);
                if (tenant) return { id: refererTenant, tenant };
            }
            // 2. Primer segmento del path en Referer (ej: /mitienda o /s/mitienda)
            const refPathParts = refererUrl.pathname.split('/').filter(Boolean);
            if (refPathParts.length > 0) {
                let candidate = refPathParts[0].toLowerCase();
                if (candidate === 's' && refPathParts.length > 1) {
                    candidate = refPathParts[1].toLowerCase();
                }
                const SYSTEM_PATHS = new Set(['api', 'admin', 'login', 'register', 'precios', 'superadmin', 'demo', 'assets', '_astro']);
                if (candidate && !SYSTEM_PATHS.has(candidate) && !candidate.includes('.')) {
                    const tenant = await getTenantById(db, candidate);
                    if (tenant) return { id: candidate, tenant };
                }
            }
        } catch (_) {
            // Ignore invalid referer URLs
        }
    }

    // 0.4 Cookie de Sesión (si el usuario ya inició sesión en el panel admin)
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            if (key) acc[key] = value;
            return acc;
        }, {});
        const sessionToken = cookies['vendly_session'];
        if (sessionToken && db) {
            try {
                const now = Math.floor(Date.now() / 1000);
                const sessionRow = await db.prepare(
                    'SELECT tenant_id FROM sessions WHERE token = ? AND expires_at > ?'
                ).bind(sessionToken, now).first();
                if (sessionRow && sessionRow.tenant_id) {
                    const tenant = await getTenantById(db, sessionRow.tenant_id);
                    if (tenant) return { id: sessionRow.tenant_id, tenant };
                }
            } catch (_) {}
        }
    }

    // 1. Path-based directo en URL de la request: /s/{tenant_id} o /{tenant_id}
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        let candidate = pathParts[0].toLowerCase();
        if (candidate === 's' && pathParts.length > 1) {
            candidate = pathParts[1].toLowerCase();
        }
        const SYSTEM_PATHS = new Set(['api', 'admin', 'login', 'register', 'precios', 'superadmin', 'demo', 'assets', '_astro']);
        if (candidate && !SYSTEM_PATHS.has(candidate) && !candidate.includes('.')) {
            const tenant = await getTenantById(db, candidate);
            if (tenant) return { id: candidate, tenant };
        }
    }

    // 2. Subdominio: fogon.vendly.app (excluir 'www', 'app', 'admin', 'demo', 'api')
    const SYSTEM_SUBDOMAINS = new Set(['www', 'app', 'admin', 'demo', 'api']);
    const parts = host.split('.');
    if (parts.length >= 3) {
        const subdomain = parts[0].toLowerCase();
        if (!SYSTEM_SUBDOMAINS.has(subdomain)) {
            const tenant = await getTenantById(db, subdomain);
            if (tenant) return { id: subdomain, tenant };
        }
    }

    // 3. Custom domain lookup (para clientes con dominio propio)
    if (!host.includes('vendly') && !host.includes('localhost') && !host.includes('pages.dev')) {
        const tenant = await getTenantByDomain(db, host);
        if (tenant) return { id: tenant.id, tenant };
    }

    // 4. Fallback al tenant demo (compatibilidad hacia atrás)
    return { id: 'demo', tenant: null };
}

/**
 * Obtiene un tenant de la BD por su ID
 */
async function getTenantById(db, tenantId) {
    try {
        return await db.prepare(
            'SELECT * FROM tenants WHERE id = ? AND active = 1'
        ).bind(tenantId).first();
    } catch {
        return null;
    }
}

/**
 * Obtiene un tenant de la BD por su dominio custom
 */
async function getTenantByDomain(db, domain) {
    try {
        return await db.prepare(
            'SELECT * FROM tenants WHERE domain = ? AND active = 1'
        ).bind(domain).first();
    } catch {
        return null;
    }
}

/**
 * Verifica que el tenant resuelto esté activo.
 * Retorna una Response de error si está suspendido o no existe.
 */
export function tenantNotFoundResponse() {
    return new Response(JSON.stringify({ error: 'Tenant no encontrado o suspendido.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Helper: parsea el config_json de un tenant con seguridad
 */
export function parseTenantConfig(tenant) {
    if (!tenant?.config_json) return {};
    try {
        return JSON.parse(tenant.config_json);
    } catch {
        return {};
    }
}
