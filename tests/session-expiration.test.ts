// tests/session-expiration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { onRequestGet } from '../functions/api/auth';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, PagesContext } from '../functions/types';

describe('Session Auto-Expiration & Verification (GET /api/auth)', () => {
    it('returns authenticated: true when session token is active and valid in D1', async () => {
        const now = Math.floor(Date.now() / 1000);
        const mockDb = {
            prepare: vi.fn().mockImplementation((query: string) => ({
                bind: vi.fn().mockImplementation((..._args: any[]) => ({
                    first: vi.fn().mockImplementation(async () => {
                        if (query.includes('FROM sessions s') || query.includes('FROM sessions')) {
                            return {
                                username: 'admin@tienda.com',
                                role: 'admin',
                                tenant_id: 'mitienda',
                                email: 'admin@tienda.com',
                                expires_at: now + 3600
                            };
                        }
                        return null;
                    }),
                    run: vi.fn().mockResolvedValue({ success: true })
                }))
            }))
        } as unknown as D1Database;

        const context = {
            request: new Request('https://ventrina.app/api/auth', {
                method: 'GET',
                headers: { 'Cookie': 'ventrina_session=valid-active-token' }
            }),
            env: {
                DB: mockDb
            },
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const response = await onRequestGet(context);
        expect(response.status).toBe(200);

        const data = (await response.json()) as any;
        expect(data.authenticated).toBe(true);
        expect(data.email).toBe('admin@tienda.com');
        expect(data.role).toBe('admin');
        expect(data.tenantId).toBe('mitienda');
    });

    it('returns authenticated: false, expired: true and clears cookie when token is expired/invalid', async () => {
        const mockDb = {
            prepare: vi.fn().mockImplementation(() => ({
                bind: vi.fn().mockImplementation((..._args: any[]) => ({
                    first: vi.fn().mockResolvedValue(null), // Token no existe o expires_at < now
                    run: vi.fn().mockResolvedValue({ success: true })
                }))
            }))
        } as unknown as D1Database;

        const context = {
            request: new Request('https://ventrina.app/api/auth', {
                method: 'GET',
                headers: { 'Cookie': 'ventrina_session=expired-or-revoked-token' }
            }),
            env: {
                DB: mockDb
            },
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const response = await onRequestGet(context);
        expect(response.status).toBe(200);

        const data = (await response.json()) as any;
        expect(data.authenticated).toBe(false);
        expect(data.expired).toBe(true);

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toBeTruthy();
        expect(setCookie).toContain('Max-Age=0');
        expect(setCookie).toContain('ventrina_session=');
    });

    it('returns authenticated: false without expired flag when no session cookie was sent', async () => {
        const mockDb = {
            prepare: vi.fn().mockImplementation(() => ({
                bind: vi.fn().mockImplementation((..._args: any[]) => ({
                    first: vi.fn().mockResolvedValue(null),
                    run: vi.fn().mockResolvedValue({ success: true })
                }))
            }))
        } as unknown as D1Database;

        const context = {
            request: new Request('https://ventrina.app/api/auth', {
                method: 'GET'
            }),
            env: {
                DB: mockDb
            },
            waitUntil: vi.fn()
        } as unknown as PagesContext<Env>;

        const response = await onRequestGet(context);
        expect(response.status).toBe(200);

        const data = (await response.json()) as any;
        expect(data.authenticated).toBe(false);
        expect(data.expired).toBeUndefined();

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toBeNull();
    });
});
