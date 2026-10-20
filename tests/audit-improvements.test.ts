// tests/audit-improvements.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CategoryRepository } from '../functions/api/_repositories/category.repo';
import { RateLimitService } from '../functions/api/_services/rate-limit.service';
import { getStarterProducts } from '../src/config/starter-products';
import { checkProductLimit } from '../functions/api/_plans';
import { resolveBcvRate } from '../functions/api/_services/order.service';
import { generateSessionToken, buildSessionCookie, validateCsrf } from '../functions/api/_auth';
import type { D1Database } from '@cloudflare/workers-types';
import type { TenantRow } from '../functions/types';

describe('Audit Plan Improvements Verification', () => {
    describe('S-04 & Session Helpers (_auth.ts)', () => {
        it('generates a 256-bit high-entropy session token (64 hex characters)', () => {
            const token1 = generateSessionToken();
            const token2 = generateSessionToken();

            expect(token1).toHaveLength(64);
            expect(token2).toHaveLength(64);
            expect(token1).toMatch(/^[0-9a-f]{64}$/);
            expect(token1).not.toBe(token2);
        });

        it('constructs consistent session cookies for root domain and subdomains', () => {
            const reqVentrina = new Request('https://mitienda.ventrina.app/admin');
            const cookieVentrina = buildSessionCookie('test-token', reqVentrina, 3600);
            expect(cookieVentrina).toContain('Domain=.ventrina.app');
            expect(cookieVentrina).toContain('ventrina_session=test-token');
            expect(cookieVentrina).toContain('Max-Age=3600');
            expect(cookieVentrina).toContain('HttpOnly');

            const reqLocal = new Request('http://localhost:8788/admin');
            const cookieLocal = buildSessionCookie('test-token', reqLocal, 3600);
            expect(cookieLocal).not.toContain('Domain=');
            expect(cookieLocal).toContain('ventrina_session=test-token');
        });

        it('restricts X-Requested-With header to known safe values (S-05)', () => {
            const validReqXml = new Request('https://ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            expect(validateCsrf(validReqXml)).toBe(true);

            const validReqFetch = new Request('https://ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'X-Requested-With': 'fetch' }
            });
            expect(validateCsrf(validReqFetch)).toBe(true);

            const invalidReq = new Request('https://ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'X-Requested-With': 'malicious-agent' }
            });
            expect(validateCsrf(invalidReq)).toBe(false);
        });
    });

    describe('OCP: Starter Products Config (starter-products.ts)', () => {
        it('returns predefined products for restaurant template', () => {
            const products = getStarterProducts('demo-store', 'restaurant');
            expect(products.length).toBeGreaterThan(0);
            expect(products[0].id).toContain('demo-store-');
            expect(products.some(p => p.category === 'principales')).toBe(true);
        });

        it('falls back to default template for unknown templates without error', () => {
            const products = getStarterProducts('demo-store', 'non-existent-template');
            expect(products.length).toBeGreaterThan(0);
            expect(products[0].id).toContain('demo-store-');
        });
    });

    describe('DIP & S-06 & P-01: CategoryRepository (category.repo.ts)', () => {
        it('batches product counts and custom settings in a single D1 call', async () => {
            const mockDb = {
                batch: vi.fn().mockResolvedValue([
                    { results: [{ category: 'hamburguesas', count: 5 }] },
                    { results: [{ data_json: JSON.stringify([{ id: 'hamburguesas', name: 'Hamburguesas Gourmet', icon: 'burger' }]) }] }
                ]),
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({})
                })
            } as unknown as D1Database;

            const repo = new CategoryRepository(mockDb);
            const data = await repo.getCategoriesData('tienda1');

            expect(mockDb.batch).toHaveBeenCalled();
            expect(data.productCounts).toHaveLength(1);
            expect(data.productCounts[0].category).toBe('hamburguesas');
            expect(data.customJson).toContain('Hamburguesas Gourmet');
        });

        it('saves custom categories to tenant_settings and syncs with config_json without any types', async () => {
            const runMock = vi.fn().mockResolvedValue({ success: true });
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        run: runMock
                    })
                })
            } as unknown as D1Database;

            const repo = new CategoryRepository(mockDb);
            const tenant: TenantRow = {
                id: 't1',
                name: 'Tienda 1',
                template: 'restaurant',
                plan: 'pro',
                active: 1,
                config_json: JSON.stringify({ business: { name: 'Tienda 1' } })
            };

            await repo.saveCustomCategories('t1', tenant, [{ id: 'pizzas', name: 'Pizzas Artesanales', icon: 'pizza' }]);
            expect(runMock).toHaveBeenCalled();
        });
    });

    describe('S-03 & P-04: RateLimitService (rate-limit.service.ts)', () => {
        it('allows request when within attempt limit and blocks when exceeded', async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({
                            ip: '127.0.0.1',
                            count: 5,
                            first_attempt: Date.now() - 5000,
                            lockout_until: 0
                        }),
                        run: vi.fn().mockResolvedValue({ success: true })
                    })
                })
            } as unknown as D1Database;

            const service = new RateLimitService(mockDb);
            const check = await service.checkRateLimit('127.0.0.1', { maxAttempts: 5, windowMs: 60000 });
            expect(check.allowed).toBe(false);
            expect(check.remaining).toBe(0);
        });

        it('enforces lockout_until when lockout is active', async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({
                            ip: '127.0.0.1',
                            count: 5,
                            first_attempt: Date.now() - 5000,
                            lockout_until: Date.now() + 10 * 60 * 1000 // 10 mins lockout
                        })
                    })
                })
            } as unknown as D1Database;

            const service = new RateLimitService(mockDb);
            const check = await service.checkRateLimit('127.0.0.1', { maxAttempts: 5, windowMs: 60000 });
            expect(check.allowed).toBe(false);
            expect(check.remainingMinutes).toBeGreaterThan(0);
        });
    });

    describe('F-03: Active Products Limit Check (_plans.ts)', () => {
        it('queries products with active = 1 filter', async () => {
            let capturedQuery = '';
            const mockDb = {
                prepare: vi.fn().mockImplementation((q: string) => {
                    capturedQuery = q;
                    return {
                        bind: vi.fn().mockReturnValue({
                            first: vi.fn().mockResolvedValue({ total: 10 })
                        })
                    };
                })
            } as unknown as D1Database;

            const tenant: TenantRow = { id: 't1', name: 'Tienda', template: 'restaurant', plan: 'basic', active: 1 };
            const result = await checkProductLimit(mockDb, tenant);

            expect(capturedQuery).toContain('AND active = 1');
            expect(result.allowed).toBe(true);
            expect(result.current).toBe(10);
            expect(result.limit).toBe(30);
        });
    });

    describe('P-02: BCV Rate Caching (order.service.ts)', () => {
        it('resolves BCV rate directly from cached tenant config_json without D1 query', async () => {
            const mockDb = {
                prepare: vi.fn()
            } as unknown as D1Database;

            const configJson = JSON.stringify({
                bcvRate: 865.25
            });

            const res = await resolveBcvRate(mockDb, 'tienda1', undefined, configJson);
            expect(res.rate).toBe(865.25);
            expect(mockDb.prepare).not.toHaveBeenCalled();
        });

        it('falls back to settings table query when config_json has no rate', async () => {
            const mockDb = {
                prepare: vi.fn().mockReturnValue({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue({ value: '870.50' })
                    })
                })
            } as unknown as D1Database;

            const res = await resolveBcvRate(mockDb, 'tienda1', undefined, '{}');
            expect(res.rate).toBe(870.50);
            expect(mockDb.prepare).toHaveBeenCalled();
        });
    });

    describe('F-02: Analytics Plan Restriction (analytics.ts)', () => {
        it('blocks basic plan tenants with 403 Forbidden', async () => {
            const { onRequestGet } = await import('../functions/api/analytics');

            const mockDb = {
                prepare: vi.fn().mockImplementation((query: string) => ({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockImplementation(async () => {
                            if (query.includes('FROM sessions') || query.includes('sessions s')) {
                                return {
                                    username: 'admin@tienda.com',
                                    role: 'admin',
                                    tenant_id: 'mitienda',
                                    expires_at: Math.floor(Date.now() / 1000) + 100000
                                };
                            }
                            if (query.includes('FROM tenants')) {
                                return {
                                    id: 'mitienda',
                                    name: 'Mi Tienda',
                                    plan: 'basic',
                                    active: 1
                                };
                            }
                            return null;
                        }),
                        all: vi.fn().mockResolvedValue({ results: [] }),
                        run: vi.fn().mockResolvedValue({ success: true })
                    })
                }))
            };

            const mockContext: any = {
                request: new Request('https://ventrina.app/api/analytics?tenant=mitienda', {
                    headers: { 'Cookie': 'ventrina_session=dummy-token' }
                }),
                env: {
                    DB: mockDb
                }
            };

            const res = await onRequestGet(mockContext);
            expect(res.status).toBe(403);
            const data = await res.json() as any;
            expect(data.upgradeRequired).toBe(true);
        });
    });
});
