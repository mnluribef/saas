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

    // 0.1 Query Parameter (direct navigation)
    const qsTenant = url.searchParams.get('tenant');
    if (qsTenant) {
        const tenant = await getTenantById(db, qsTenant);
        if (tenant) return { id: qsTenant, tenant };
    }

    // 0.2 Referer Header (API calls from the frontend on localhost/pages.dev)
    const referer = request.headers.get('Referer');
    if (referer && (host.includes('localhost') || host.includes('pages.dev'))) {
        try {
            const refererUrl = new URL(referer);
            const refererTenant = refererUrl.searchParams.get('tenant');
            if (refererTenant) {
                const tenant = await getTenantById(db, refererTenant);
                if (tenant) return { id: refererTenant, tenant };
            }
        } catch (e) {
            // Ignore invalid referer URLs
        }
    }

    // 1. Header explícito (útil en desarrollo local y super-admin)
    const headerTenantId = request.headers.get('X-Tenant-Id');
    if (headerTenantId) {
        const tenant = await getTenantById(db, headerTenantId);
        if (tenant) return { id: headerTenantId, tenant };
    }

    // 2. Path-based: /s/{tenant_id}/...
    const pathMatch = url.pathname.match(/^\/s\/([a-z0-9_-]+)(\/|$)/i);
    if (pathMatch) {
        const tenantId = pathMatch[1].toLowerCase();
        const tenant = await getTenantById(db, tenantId);
        if (tenant) return { id: tenantId, tenant };
    }

    // 3. Subdominio: fogon.vendly.app (excluir 'www', 'app', 'admin', 'demo')
    const SYSTEM_SUBDOMAINS = new Set(['www', 'app', 'admin', 'demo', 'api']);
    const parts = host.split('.');
    if (parts.length >= 3) {
        const subdomain = parts[0].toLowerCase();
        if (!SYSTEM_SUBDOMAINS.has(subdomain)) {
            const tenant = await getTenantById(db, subdomain);
            if (tenant) return { id: subdomain, tenant };
        }
    }

    // 4. Custom domain lookup (para clientes con dominio propio)
    if (!host.includes('vendly') && !host.includes('localhost') && !host.includes('pages.dev')) {
        const tenant = await getTenantByDomain(db, host);
        if (tenant) return { id: tenant.id, tenant };
    }

    // 5. Fallback al tenant demo (compatibilidad hacia atrás)
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
