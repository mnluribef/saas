import { describe, it, expect, vi } from 'vitest';
import { resolveTenant, SYSTEM_PATHS, SYSTEM_SUBDOMAINS } from '../functions/api/_tenant';
import type { D1Database } from '@cloudflare/workers-types';

describe('Tenant Resolution Logic (_tenant.ts)', () => {
    const mockDb = {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => {
                    return { id: 'fogon', name: 'El Fogón Criollo', active: 1 };
                })
            })
        })
    } as unknown as D1Database;

    it('resolves tenant via X-Tenant-Id header', async () => {
        const req = new Request('https://ventrina.app/api/products', {
            headers: { 'X-Tenant-Id': 'fogon' }
        });
        const result = await resolveTenant(req, mockDb);
        expect(result.id).toBe('fogon');
        expect(result.tenant).toBeDefined();
    });

    it('ignores Referer header to prevent tenant spoofing (Fix #3)', async () => {
        const req = new Request('https://ventrina.app/api/orders', {
            headers: {
                'Referer': 'https://ventrina.app/s/spoofed-tenant'
            }
        });
        const result = await resolveTenant(req, mockDb);
        // Debe caer en demo o resolución segura de la URL, no del Referer
        expect(result.id).not.toBe('spoofed-tenant');
    });

    it('identifies system paths in SYSTEM_PATHS constant (Fix #11)', () => {
        expect(SYSTEM_PATHS.has('api')).toBe(true);
        expect(SYSTEM_PATHS.has('admin')).toBe(true);
        expect(SYSTEM_PATHS.has('login')).toBe(true);
        expect(SYSTEM_PATHS.has('register')).toBe(true);
        expect(SYSTEM_PATHS.has('precios')).toBe(true);
        expect(SYSTEM_PATHS.has('terminos')).toBe(true);
        expect(SYSTEM_PATHS.has('producto')).toBe(true);
        expect(SYSTEM_PATHS.has('fogon')).toBe(false);
    });

    it('identifies system subdomains in SYSTEM_SUBDOMAINS', () => {
        expect(SYSTEM_SUBDOMAINS.has('www')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('api')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('admin')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('fogon')).toBe(false);
    });

    it('extracts subdomains correctly from various host formats', async () => {
        const { extractSubdomain } = await import('../functions/api/_tenant');
        expect(extractSubdomain('mitienda.ventrina.app')).toBe('mitienda');
        expect(extractSubdomain('fogon.ventrina.app:443')).toBe('fogon');
        expect(extractSubdomain('ventrina.app')).toBeNull();
        expect(extractSubdomain('www.ventrina.app')).toBeNull();
        expect(extractSubdomain('admin.ventrina.app')).toBeNull();
        expect(extractSubdomain('api.ventrina.app')).toBeNull();
        expect(extractSubdomain('mitienda.localhost:8788')).toBe('mitienda');
        expect(extractSubdomain('localhost:8788')).toBeNull();
        expect(extractSubdomain('mitienda.ventrina.pages.dev')).toBe('mitienda');
        expect(extractSubdomain('ventrina.pages.dev')).toBeNull();
    });

    it('resolves tenant via subdomain', async () => {
        const req = new Request('https://fogon.ventrina.app/api/products');
        const result = await resolveTenant(req, mockDb);
        expect(result.id).toBe('fogon');
        expect(result.tenant).toBeDefined();
    });

    it('resolves tenant via localhost subdomain', async () => {
        const req = new Request('http://fogon.localhost:8788/api/products');
        const result = await resolveTenant(req, mockDb);
        expect(result.id).toBe('fogon');
        expect(result.tenant).toBeDefined();
    });

    it('falls back to demo when no tenant information is found', async () => {
        const emptyDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        } as unknown as D1Database;

        const req = new Request('https://ventrina.app/api/orders');
        const result = await resolveTenant(req, emptyDb);
        expect(result.id).toBe('demo');
    });

    describe('Demo Isolation Against Authenticated Tenant Sessions', () => {
        const sessionDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(async () => {
                        return { tenant_id: 'tenant-activo', id: 'tenant-activo', active: 1 };
                    })
                })
            })
        } as unknown as D1Database;

        it('resolves to demo when X-Tenant-Id is demo despite active tenant session cookie', async () => {
            const req = new Request('https://ventrina.app/api/products', {
                headers: {
                    'Cookie': 'ventrina_session=session_token_123',
                    'X-Tenant-Id': 'demo'
                }
            });
            const result = await resolveTenant(req, sessionDb);
            expect(result.id).toBe('demo');
        });

        it('resolves to demo when query param tenant=demo is present despite active tenant session cookie', async () => {
            const req = new Request('https://ventrina.app/api/products?tenant=demo', {
                headers: {
                    'Cookie': 'ventrina_session=session_token_123'
                }
            });
            const result = await resolveTenant(req, sessionDb);
            expect(result.id).toBe('demo');
        });

        it('resolves to demo when Referer is a /demo/ page despite active tenant session cookie', async () => {
            const req = new Request('https://ventrina.app/api/products?template=restaurant', {
                headers: {
                    'Cookie': 'ventrina_session=session_token_123',
                    'Referer': 'https://ventrina.app/demo/restaurant/'
                }
            });
            const result = await resolveTenant(req, sessionDb);
            expect(result.id).toBe('demo');
        });

        it('resolves to subdomain tenant despite active session cookie of another tenant', async () => {
            const subdomainDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockImplementation((val) => ({
                        first: vi.fn().mockImplementation(async () => {
                            if (val === 'fogon') {
                                return { id: 'fogon', name: 'El Fogón', active: 1 };
                            }
                            return { tenant_id: 'otro-tenant', id: 'otro-tenant', active: 1 };
                        })
                    }))
                })
            } as unknown as D1Database;

            const req = new Request('https://fogon.ventrina.app/api/products', {
                headers: {
                    'Cookie': 'ventrina_session=session_token_123'
                }
            });
            const result = await resolveTenant(req, subdomainDb);
            expect(result.id).toBe('fogon');
        });
    });

    describe('E-04 & E-06: Progressive KV TTL & Key Namespaces', () => {
        it('assigns progressive TTL based on tenant plan', async () => {
            const { getTenantCacheTtl, TTL_BY_PLAN } = await import('../functions/api/_tenant');
            expect(TTL_BY_PLAN.basic).toBe(60);
            expect(TTL_BY_PLAN.pro).toBe(300);
            expect(TTL_BY_PLAN.enterprise).toBe(1800);

            expect(getTenantCacheTtl('basic')).toBe(60);
            expect(getTenantCacheTtl('pro')).toBe(300);
            expect(getTenantCacheTtl('enterprise')).toBe(1800);
            expect(getTenantCacheTtl(null)).toBe(60);
            expect(getTenantCacheTtl('unknown')).toBe(60);
        });

        it('generates versioned KV keys with structured prefix', async () => {
            const { getTenantKvKey, getDomainKvKey } = await import('../functions/api/_tenant');
            expect(getTenantKvKey('fogon')).toBe('v1:fogon:tenant');
            expect(getDomainKvKey('fogon.com')).toBe('v1:domain:fogon.com');
        });

        it('caches tenant in KV with correct structured key and plan TTL', async () => {
            const { getTenantByIdCached } = await import('../functions/api/_tenant');
            const mockKv = {
                get: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined)
            } as any;

            const enterpriseDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({ id: 'ent-store', plan: 'enterprise', active: 1 })
                    })
                })
            } as unknown as D1Database;

            const tenant = await getTenantByIdCached(enterpriseDb, 'ent-store', mockKv);
            expect(tenant?.id).toBe('ent-store');
            expect(mockKv.get).toHaveBeenCalledWith('v1:ent-store:tenant', 'json');
            expect(mockKv.put).toHaveBeenCalledWith(
                'v1:ent-store:tenant',
                expect.any(String),
                { expirationTtl: 1800 }
            );
        });

        it('invalidates both structured and legacy KV keys', async () => {
            const { invalidateTenantCache } = await import('../functions/api/_tenant');
            const mockKv = {
                delete: vi.fn().mockResolvedValue(undefined)
            } as any;

            await invalidateTenantCache(mockKv, 'fogon', 'fogon.com');
            expect(mockKv.delete).toHaveBeenCalledWith('v1:fogon:tenant');
            expect(mockKv.delete).toHaveBeenCalledWith('tenant:fogon');
            expect(mockKv.delete).toHaveBeenCalledWith('v1:domain:fogon.com');
            expect(mockKv.delete).toHaveBeenCalledWith('domain:fogon.com');
        });
    });
});

