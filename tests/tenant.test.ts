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
        const req = new Request('https://vendly.app/api/products', {
            headers: { 'X-Tenant-Id': 'fogon' }
        });
        const result = await resolveTenant(req, mockDb);
        expect(result.id).toBe('fogon');
        expect(result.tenant).toBeDefined();
    });

    it('ignores Referer header to prevent tenant spoofing (Fix #3)', async () => {
        const req = new Request('https://vendly.app/api/orders', {
            headers: {
                'Referer': 'https://vendly.app/s/spoofed-tenant'
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
        expect(SYSTEM_PATHS.has('fogon')).toBe(false);
    });

    it('identifies system subdomains in SYSTEM_SUBDOMAINS', () => {
        expect(SYSTEM_SUBDOMAINS.has('www')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('api')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('admin')).toBe(true);
        expect(SYSTEM_SUBDOMAINS.has('fogon')).toBe(false);
    });

    it('falls back to demo when no tenant information is found', async () => {
        const emptyDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue(null)
                })
            })
        } as unknown as D1Database;

        const req = new Request('https://vendly.app/api/orders');
        const result = await resolveTenant(req, emptyDb);
        expect(result.id).toBe('demo');
    });
});
