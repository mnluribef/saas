// functions/api/_tenant.ts
// Middleware multi-tenant: resuelve el tenant desde la request y lo inyecta en context.tenant
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { parseCookies } from './_helpers';
import type { TenantResolution, TenantRow } from '../types';

export const SYSTEM_PATHS = new Set([
    '',
    'api',
    'admin',
    'login',
    'register',
    'precios',
    'superadmin',
    'demo',
    'assets',
    '_astro',
    'p',
    's',
    'producto',
    'terminos',
    'robots.txt',
    'sitemap.xml',
    'llms.txt',
    'ai-catalog.json',
    'favicon.ico',
    'favicon.svg',
    '.well-known'
]);
export const SYSTEM_SUBDOMAINS = new Set(['www', 'app', 'admin', 'demo', 'api']);

/**
 * Extrae el subdominio de un hostname, ignorando subdominios de sistema y dominios raíz
 */
export function extractSubdomain(host: string): string | null {
    const cleanHost = host.split(':')[0].toLowerCase();

    // 1. *.ventrina.app -> parts: [subdomain, 'ventrina', 'app']
    if (cleanHost.endsWith('.ventrina.app')) {
        const prefix = cleanHost.slice(0, -'.ventrina.app'.length);
        const parts = prefix.split('.');
        const sub = parts[parts.length - 1];
        return sub && !SYSTEM_SUBDOMAINS.has(sub) ? sub : null;
    }

    // 2. *.localhost -> parts: [subdomain, 'localhost']
    if (cleanHost.endsWith('.localhost')) {
        const prefix = cleanHost.slice(0, -'.localhost'.length);
        const parts = prefix.split('.');
        const sub = parts[parts.length - 1];
        return sub && !SYSTEM_SUBDOMAINS.has(sub) ? sub : null;
    }

    // 3. *.pages.dev (ej: mitienda.ventrina.pages.dev)
    if (cleanHost.endsWith('.pages.dev')) {
        const prefix = cleanHost.slice(0, -'.pages.dev'.length);
        const parts = prefix.split('.');
        if (parts.length >= 2) {
            const sub = parts[0];
            return sub && !SYSTEM_SUBDOMAINS.has(sub) ? sub : null;
        }
        return null;
    }

    // 4. Fallback genérico para otros dominios con 3 o más partes
    const parts = cleanHost.split('.');
    if (parts.length >= 3) {
        const sub = parts[0];
        if (!SYSTEM_SUBDOMAINS.has(sub)) {
            return sub;
        }
    }

    return null;
}

/**
 * Resuelve el tenant_id desde:
 * 1. Header X-Tenant-Id (para testing/admin)
 * 2. Subdominio: fogon.ventrina.app → 'fogon'
 * 3. Custom domain: fogon.com → lookup en DB por domain
 * 4. Path-based: ventrina.app/s/fogon o ventrina.app/fogon → 'fogon'
 * 5. Fallback: 'demo'
 * Incorpora capa de caché Cloudflare KV con TTL progresivo por plan (P-01).
 */
export async function resolveTenant(request: Request, db: D1Database, kv?: KVNamespace): Promise<TenantResolution> {
    const url = new URL(request.url);
    const rawHost = request.headers.get('x-forwarded-host') || url.hostname;
    const host = rawHost.split(':')[0].toLowerCase();

    // 0.1 Query Parameter RESTRINGIDO: solo permitido cuando se acompaña de la clave de super-admin.
    const qsTenant = url.searchParams.get('tenant');
    if (qsTenant) {
        const superadminKey = request.headers.get('X-Superadmin-Key');
        if (superadminKey) {
            const tenant = await getTenantByIdCached(db, qsTenant, kv);
            if (tenant) return { id: qsTenant, tenant };
        }
    }

    // 0.2 Header explícito (development, testing y super-admin)
    const headerTenantId = request.headers.get('X-Tenant-Id');
    if (headerTenantId) {
        const tenant = await getTenantByIdCached(db, headerTenantId, kv);
        if (tenant) return { id: headerTenantId, tenant };
    }

    // 0.3 Cookie de Sesión
    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionToken = cookies['ventrina_session'];
    if (sessionToken && db) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const sessionRow = await db.prepare(
                'SELECT tenant_id FROM sessions WHERE token = ? AND expires_at > ?'
            ).bind(sessionToken, now).first<{ tenant_id: string }>();
            if (sessionRow && sessionRow.tenant_id) {
                const tenant = await getTenantByIdCached(db, sessionRow.tenant_id, kv);
                if (tenant) return { id: sessionRow.tenant_id, tenant };
            }
        } catch {
            // Ignore session errors during tenant lookup
        }
    }

    // 1. Subdominio: fogon.ventrina.app (o en local fogon.localhost)
    const subdomain = extractSubdomain(host);
    if (subdomain) {
        const tenant = await getTenantByIdCached(db, subdomain, kv);
        if (tenant) return { id: subdomain, tenant };
    }

    // 2. Custom domain lookup
    if (!host.includes('ventrina') && !host.includes('localhost') && !host.includes('pages.dev')) {
        const tenant = await getTenantByDomainCached(db, host, kv);
        if (tenant) return { id: tenant.id, tenant };
    }

    // 3. Path-based directo en URL de la request (retrocompatibilidad): /s/{tenant_id} o /{tenant_id}
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        let candidate = pathParts[0].toLowerCase();
        if (candidate === 's' && pathParts.length > 1) {
            candidate = pathParts[1].toLowerCase();
        }
        if (candidate && !SYSTEM_PATHS.has(candidate) && !candidate.includes('.')) {
            const tenant = await getTenantByIdCached(db, candidate, kv);
            if (tenant) return { id: candidate, tenant };
        }
    }

    // 4. Fallback al tenant demo
    return { id: 'demo', tenant: null };
}

/**
 * Obtiene un tenant de la BD por su ID
 */
async function getTenantById(db: D1Database, tenantId: string): Promise<TenantRow | null> {
    try {
        return await db.prepare(
            'SELECT * FROM tenants WHERE id = ? AND active = 1'
        ).bind(tenantId).first<TenantRow>();
    } catch {
        return null;
    }
}

/**
 * E-04: TTL de caché progresivo según el plan del tenant (en segundos)
 */
export const TTL_BY_PLAN: Record<string, number> = {
    basic: 60,       // 1 minuto
    pro: 300,        // 5 minutos
    enterprise: 1800 // 30 minutos
};

export function getTenantCacheTtl(plan?: string | null): number {
    if (!plan) return TTL_BY_PLAN.basic;
    return TTL_BY_PLAN[plan] || TTL_BY_PLAN.basic;
}

/**
 * E-06: Convención de claves versionadas con namespace para KV
 */
export function getTenantKvKey(tenantId: string): string {
    return `v1:${tenantId}:tenant`;
}

export function getDomainKvKey(domain: string): string {
    return `v1:domain:${domain}`;
}

/**
 * Obtiene un tenant de la BD o de Cloudflare KV por su ID con TTL progresivo según plan (P-01, E-04, E-06)
 */
export async function getTenantByIdCached(db: D1Database, tenantId: string, kv?: KVNamespace): Promise<TenantRow | null> {
    const primaryKey = getTenantKvKey(tenantId);
    if (kv) {
        try {
            // Intentar con prefijo v1 estructurado; fallback a clave legacy para transición suave
            const cached = await kv.get(primaryKey, 'json') || await kv.get(`tenant:${tenantId}`, 'json');
            if (cached) return cached as TenantRow;
        } catch {}
    }

    const tenant = await getTenantById(db, tenantId);
    if (tenant && kv) {
        try {
            const ttl = getTenantCacheTtl(tenant.plan);
            await kv.put(primaryKey, JSON.stringify(tenant), { expirationTtl: ttl });
        } catch {}
    }
    return tenant;
}

/**
 * Obtiene un tenant de la BD por su dominio custom
 */
async function getTenantByDomain(db: D1Database, domain: string): Promise<TenantRow | null> {
    try {
        return await db.prepare(
            'SELECT * FROM tenants WHERE domain = ? AND active = 1'
        ).bind(domain).first<TenantRow>();
    } catch {
        return null;
    }
}

/**
 * Obtiene un tenant por dominio con caché Cloudflare KV con TTL progresivo (P-01, E-04, E-06)
 */
export async function getTenantByDomainCached(db: D1Database, domain: string, kv?: KVNamespace): Promise<TenantRow | null> {
    const primaryKey = getDomainKvKey(domain);
    if (kv) {
        try {
            const cached = await kv.get(primaryKey, 'json') || await kv.get(`domain:${domain}`, 'json');
            if (cached) return cached as TenantRow;
        } catch {}
    }

    const tenant = await getTenantByDomain(db, domain);
    if (tenant && kv) {
        try {
            const ttl = getTenantCacheTtl(tenant.plan);
            await kv.put(primaryKey, JSON.stringify(tenant), { expirationTtl: ttl });
        } catch {}
    }
    return tenant;
}

/**
 * Invalida la caché de un tenant en Cloudflare KV (limpia keys versionadas y legacy) (E-06)
 */
export async function invalidateTenantCache(kv: KVNamespace | undefined, tenantId: string, domain?: string | null): Promise<void> {
    if (!kv) return;
    try {
        const promises = [
            kv.delete(getTenantKvKey(tenantId)),
            kv.delete(`tenant:${tenantId}`)
        ];
        if (domain) {
            promises.push(kv.delete(getDomainKvKey(domain)));
            promises.push(kv.delete(`domain:${domain}`));
        }
        await Promise.all(promises);
    } catch {}
}

/**
 * Retorna una Response de error si el tenant está suspendido o no existe.
 */
export function tenantNotFoundResponse(): Response {
    return new Response(JSON.stringify({ error: 'Tenant no encontrado o suspendido.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Parsea el config_json de un tenant con seguridad
 */
export function parseTenantConfig<T = Record<string, unknown>>(tenant: TenantRow | null | undefined): T {
    if (!tenant?.config_json) return {} as T;
    try {
        return JSON.parse(tenant.config_json) as T;
    } catch {
        return {} as T;
    }
}
