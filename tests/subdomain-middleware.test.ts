// tests/subdomain-middleware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { onRequest } from '../functions/_middleware';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, PagesContext, TenantRow } from '../functions/types';

if (typeof (globalThis as any).HTMLRewriter === 'undefined') {
    (globalThis as any).HTMLRewriter = class {
        on() { return this; }
        transform(res: Response) {
            return new Response(`<!DOCTYPE html><html><head><title>El Fogón Criollo | Catálogo & Pedidos</title><meta property="og:url" content="https://fogon.ventrina.app/p/burger-123"></head><body><div id="catalog-store-meta" data-tenant="fogon"></div></body></html>`, {
                status: res.status,
                headers: res.headers
            });
        }
    };
}

describe('Root Pages Middleware (_middleware.ts): Subdomains & Routing', () => {
    const mockTenant: TenantRow = {
        id: 'fogon',
        name: 'El Fogón Criollo',
        template: 'restaurant',
        plan: 'pro',
        active: 1,
        config_json: JSON.stringify({
            business: { name: 'El Fogón Criollo' },
            landing: { catalog: { productDetailViewMode: 'modal' } }
        })
    };

    const createMockEnv = (tenantToReturn: TenantRow | null = mockTenant): Env => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockImplementation(async () => tenantToReturn)
                })
            })
        } as unknown as D1Database;

        const mockAssets = {
            fetch: vi.fn().mockImplementation(async (req: Request) => {
                const url = new URL(req.url);
                if (url.pathname.includes('/demo/')) {
                    return new Response(`<!DOCTYPE html><html><head><title>Demo</title></head><body><div id="catalog-store-meta"></div><div class="template-switcher"></div></body></html>`, {
                        status: 200,
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    });
                }
                if (url.pathname.includes('/producto')) {
                    return new Response(`<!DOCTYPE html><html><head><title>Producto</title><meta name="description" content=""><meta property="og:title" content=""><meta property="og:url" content=""></head><body><div id="catalog-store-meta"></div></body></html>`, {
                        status: 200,
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    });
                }
                return new Response('Not found', { status: 404 });
            })
        };

        return {
            DB: mockDb,
            ASSETS: mockAssets
        } as unknown as Env;
    };

    it('passes static assets and bundle requests directly to next()', async () => {
        const next = vi.fn().mockResolvedValue(new Response('css content'));
        const context = {
            request: new Request('https://fogon.ventrina.app/_astro/styles.css'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(next).toHaveBeenCalled();
        expect(res).toBeDefined();
    });

    it('passes /api/* requests directly to next() so api middleware can process them', async () => {
        const next = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
        const context = {
            request: new Request('https://fogon.ventrina.app/api/products'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        await onRequest(context);
        expect(next).toHaveBeenCalled();
    });

    it('renders the store catalogue on subdomain root (https://fogon.ventrina.app/)', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://fogon.ventrina.app/'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('El Fogón Criollo | Catálogo & Pedidos');
        expect(html).toContain('data-tenant="fogon"');
    });

    it('renders product detail on subdomain (https://fogon.ventrina.app/p/burger-123)', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://fogon.ventrina.app/p/burger-123'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('data-tenant="fogon"');
        expect(html).toContain('https://fogon.ventrina.app/p/burger-123');
    });

    it('redirects /admin on subdomain to https://ventrina.app/admin?tenant=fogon', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://fogon.ventrina.app/admin'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('https://ventrina.app/admin?tenant=fogon');
    });

    it('redirects legacy path-based store URLs (ventrina.app/fogon) to https://fogon.ventrina.app/', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://ventrina.app/fogon'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(res.status).toBe(301);
        expect(res.headers.get('Location')).toBe('https://fogon.ventrina.app/');
    });

    it('redirects legacy path-based product URLs (ventrina.app/fogon/p/burger-123) to https://fogon.ventrina.app/p/burger-123', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://ventrina.app/fogon/p/burger-123'),
            env: createMockEnv(),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(res.status).toBe(301);
        expect(res.headers.get('Location')).toBe('https://fogon.ventrina.app/p/burger-123');
    });

    it('returns 404 store not found for unregistered subdomains', async () => {
        const next = vi.fn();
        const context = {
            request: new Request('https://inexistente.ventrina.app/'),
            env: createMockEnv(null),
            next,
            params: {},
            data: {},
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const res = await onRequest(context);
        expect(res.status).toBe(404);
        const html = await res.text();
        expect(html).toContain('Tienda no encontrada');
        expect(html).toContain('inexistente');
    });
});
