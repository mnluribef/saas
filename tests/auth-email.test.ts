// tests/auth-email.test.ts
import { describe, it, expect, vi } from 'vitest';
import { loginSchema, onRequestPost } from '../functions/api/auth';
import { createUserSchema } from '../functions/api/users';
import { hashPasswordPBKDF2, generateSalt } from '../functions/api/_auth';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, PagesContext } from '../functions/types';

describe('Strict Email-Only Authentication (no username backwards compatibility)', () => {
    describe('loginSchema Validation', () => {
        it('accepts login with a valid email and password', () => {
            const valid = {
                email: 'admin@ventrina.app',
                password: 'Password123!',
                tenant: 'mitienda'
            };
            const result = loginSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it('rejects login with username instead of email', () => {
            const legacy = {
                username: 'superadmin',
                password: 'Password123!',
                tenant: 'mitienda'
            };
            const result = loginSchema.safeParse(legacy);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some(i => i.path.includes('email'))).toBe(true);
            }
        });

        it('rejects invalid email formats in login', () => {
            const invalid = {
                email: 'not-an-email',
                password: 'Password123!'
            };
            const result = loginSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it('rejects login without password', () => {
            const noPass = {
                email: 'admin@ventrina.app'
            };
            const result = loginSchema.safeParse(noPass);
            expect(result.success).toBe(false);
        });
    });

    describe('createUserSchema Validation', () => {
        it('accepts user creation with valid email and strong password', () => {
            const valid = {
                email: 'staff@ventrina.app',
                password: 'SecurePassword123!',
                role: 'staff' as const
            };
            const result = createUserSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it('rejects user creation with username instead of email', () => {
            const legacy = {
                username: 'staffuser',
                password: 'SecurePassword123!',
                role: 'staff' as const
            };
            const result = createUserSchema.safeParse(legacy);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some(i => i.path.includes('email'))).toBe(true);
            }
        });
    });

    describe('onRequestPost Handler (Login Execution)', () => {
        it('logs in user successfully matching email and tenant', async () => {
            const salt = generateSalt();
            const password = 'Password123!';
            const hash = await hashPasswordPBKDF2(password, salt);

            const mockUserRow = {
                id: '1',
                username: 'owner@store.com',
                email: 'owner@store.com',
                password_hash: hash,
                password_salt: salt,
                role: 'admin',
                tenant_id: 'mystore'
            };

            const mockDb = {
                prepare: vi.fn().mockImplementation((query: string) => ({
                    bind: vi.fn().mockImplementation((..._args: any[]) => ({
                        first: vi.fn().mockImplementation(async () => {
                            if (query.includes('FROM rate_limits')) return null;
                            if (query.includes('FROM users WHERE email = ? AND tenant_id = ?')) return mockUserRow;
                            return null;
                        }),
                        all: vi.fn().mockResolvedValue({ results: [] }),
                        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
                    })),
                    run: vi.fn().mockResolvedValue({ success: true })
                }))
            } as unknown as D1Database;

            const context = {
                request: new Request('https://ventrina.app/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'owner@store.com',
                        password: 'Password123!',
                        tenant: 'mystore'
                    })
                }),
                env: {
                    DB: mockDb
                },
                waitUntil: vi.fn()
            } as unknown as PagesContext<Env>;

            const response = await onRequestPost(context);
            expect(response.status).toBe(200);

            const data = (await response.json()) as any;
            expect(data.success).toBe(true);
            expect(data.email).toBe('owner@store.com');
            expect(data.tenantId).toBe('mystore');

            const setCookie = response.headers.get('Set-Cookie');
            expect(setCookie).toContain('ventrina_session=');
        });

        it('rejects login request with missing email field', async () => {
            const mockDb = {
                prepare: vi.fn().mockImplementation(() => ({
                    bind: vi.fn().mockReturnValue({
                        first: vi.fn().mockResolvedValue(null),
                        run: vi.fn().mockResolvedValue({ success: true })
                    })
                }))
            } as unknown as D1Database;

            const context = {
                request: new Request('https://ventrina.app/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'owner@store.com', // old field, should fail validation
                        password: 'Password123!',
                        tenant: 'mystore'
                    })
                }),
                env: {
                    DB: mockDb
                },
                waitUntil: vi.fn()
            } as unknown as PagesContext<Env>;

            const response = await onRequestPost(context);
            expect(response.status).toBe(400);

            const data = (await response.json()) as any;
            expect(data.error).toContain('Correo electrónico');
        });
    });
});
