// tests/products-api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { onRequestGet } from '../functions/api/products';
import type { D1Database } from '@cloudflare/workers-types';

describe('GET /api/products handler', () => {
    it('returns products for demo tenant with template parameter', async () => {
        const mockRows = [
            {
                id: 'prod-1',
                name: 'Producto Test',
                type_id: 'principales',
                category: 'principales',
                description: 'Desc',
                price: 10,
                compare_at_price: 0,
                icon: 'package',
                badge: '',
                image_url: '/img.jpg',
                sizes: null,
                template: 'restaurant',
                stock: 10,
                active: 1,
                tenant_id: 'demo',
                brand: null,
                model: null,
                sku: ''
            }
        ];

        const mockDb = {
            prepare: vi.fn().mockImplementation((query: string) => ({
                bind: vi.fn().mockImplementation((..._args: any[]) => ({
                    first: vi.fn().mockImplementation(async () => {
                        if (query.includes('COUNT(*)')) {
                            return { total: 1 };
                        }
                        if (query.includes('FROM tenants')) {
                            return { id: 'demo', name: 'Demo Store', template: 'restaurant' };
                        }
                        return null;
                    }),
                    all: vi.fn().mockImplementation(async () => {
                        if (query.includes('FROM products')) {
                            return { results: mockRows };
                        }
                        if (query.includes('FROM product_attributes')) {
                            return { results: [] };
                        }
                        return { results: [] };
                    })
                }))
            }))
        } as unknown as D1Database;

        const mockContext: any = {
            request: new Request('http://localhost:4321/api/products?template=restaurant&tenant=demo', {
                headers: {
                    'X-Tenant-Id': 'demo'
                }
            }),
            env: {
                DB: mockDb
            },
            data: {}
        };

        const res = await onRequestGet(mockContext);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('data');
        expect(Array.isArray((data as any).data)).toBe(true);
        expect((data as any).data.length).toBe(1);
    });

    it('falls back to starter products when D1 returns 0 products for demo tenant', async () => {
        const mockDb = {
            prepare: vi.fn().mockImplementation((query: string) => ({
                bind: vi.fn().mockImplementation((..._args: any[]) => ({
                    first: vi.fn().mockImplementation(async () => {
                        if (query.includes('COUNT(*)')) {
                            return { total: 0 };
                        }
                        if (query.includes('FROM tenants')) {
                            return { id: 'demo', name: 'Demo Store', template: 'restaurant' };
                        }
                        return null;
                    }),
                    all: vi.fn().mockImplementation(async () => {
                        return { results: [] };
                    })
                }))
            }))
        } as unknown as D1Database;

        const templates = ['restaurant', 'hardware', 'fashion', 'tech', 'autoparts', 'grocery'];
        for (const tmpl of templates) {
            const mockContext: any = {
                request: new Request(`http://localhost:4321/api/products?template=${tmpl}&tenant=demo`, {
                    headers: { 'X-Tenant-Id': 'demo' }
                }),
                env: { DB: mockDb },
                data: {}
            };
            const res = await onRequestGet(mockContext);
            expect(res.status).toBe(200);
            const data: any = await res.json();
            expect(data.data.length).toBeGreaterThan(0);
            expect(data.data[0].template).toBe(tmpl);
        }
    });
});
