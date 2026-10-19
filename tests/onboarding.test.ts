// tests/onboarding.test.ts
import { describe, it, expect, vi } from 'vitest';
import { onboardingSchema } from '../functions/api/onboarding';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, PagesContext } from '../functions/types';

describe('Onboarding & Account Registration (onboarding.ts)', () => {
    describe('onboardingSchema Validation', () => {
        it('accepts registration with email and without username', () => {
            const validData = {
                tenantName: 'Mi Tienda Express',
                tenantSlug: 'mitienda',
                template: 'restaurant' as const,
                email: 'admin@mitienda.com',
                password: 'Password123!',
                whatsapp: '+584141234567',
                acceptTerms: true
            };
            const result = onboardingSchema.safeParse(validData);
            expect(result.success).toBe(true);
        });

        it('accepts legacy registration with username for backwards compatibility', () => {
            const legacyData = {
                tenantName: 'Mi Tienda Express',
                tenantSlug: 'mitienda',
                template: 'restaurant' as const,
                username: 'superadmin',
                password: 'Password123!',
                acceptTerms: true
            };
            const result = onboardingSchema.safeParse(legacyData);
            expect(result.success).toBe(true);
        });

        it('rejects registration without email and without username', () => {
            const invalidData = {
                tenantName: 'Mi Tienda Express',
                tenantSlug: 'mitienda',
                template: 'restaurant' as const,
                password: 'Password123!',
                acceptTerms: true
            };
            const result = onboardingSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('correo');
            }
        });

        it('rejects invalid email formats', () => {
            const invalidEmail = {
                tenantName: 'Mi Tienda Express',
                tenantSlug: 'mitienda',
                template: 'restaurant' as const,
                email: 'not-an-email',
                password: 'Password123!',
                acceptTerms: true
            };
            const result = onboardingSchema.safeParse(invalidEmail);
            expect(result.success).toBe(false);
        });
    });

    describe('onRequestPost Handler & Database Self-Healing', () => {
        it('handles onboarding and adds email column defensively if absent', async () => {
            const { onRequestPost } = await import('../functions/api/onboarding');

            const tableInfoColumns = [
                { name: 'id' },
                { name: 'username' },
                { name: 'password_hash' },
                { name: 'role' },
                { name: 'tenant_id' }
                // email column absent initially
            ];

            const mockDb = {
                prepare: vi.fn().mockImplementation((query: string) => ({
                    bind: vi.fn().mockImplementation((..._args: any[]) => ({
                        first: vi.fn().mockImplementation(async () => {
                            if (query.includes('FROM rate_limits')) return null;
                            if (query.includes('FROM tenants WHERE id = ?')) return null;
                            if (query.includes('FROM users WHERE')) return null;
                            return null;
                        }),
                        all: vi.fn().mockImplementation(async () => {
                            if (query.includes('PRAGMA table_info(users)')) {
                                return { results: tableInfoColumns };
                            }
                            return { results: [] };
                        }),
                        run: vi.fn().mockResolvedValue({ success: true })
                    })),
                    all: vi.fn().mockImplementation(async () => {
                        if (query.includes('PRAGMA table_info(users)')) {
                            return { results: tableInfoColumns };
                        }
                        return { results: [] };
                    }),
                    run: vi.fn().mockResolvedValue({ success: true })
                })),
                batch: vi.fn().mockResolvedValue([])
            } as unknown as D1Database;

            const context = {
                request: new Request('https://ventrina.app/api/onboarding', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tenantName: 'Tienda Test',
                        tenantSlug: 'tiendatest',
                        template: 'restaurant',
                        email: 'owner@tiendatest.com',
                        password: 'Password123!',
                        acceptTerms: true
                    })
                }),
                env: {
                    DB: mockDb
                },
                waitUntil: vi.fn()
            } as unknown as PagesContext<Env>;

            const response = await onRequestPost(context);
            expect(response.status).toBe(201);
            const data = (await response.json()) as any;
            expect(data.success).toBe(true);
            expect(data.tenantId).toBe('tiendatest');
            expect(mockDb.batch).toHaveBeenCalled();
        });
    });
});
