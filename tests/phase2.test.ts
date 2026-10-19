// tests/phase2.test.ts
// Tests unitarios para las mejoras avanzadas de la Fase 2
import { describe, it, expect } from 'vitest';
import { getAllowedOrigin, buildCorsHeaders } from '../functions/api/_middleware';
import { validateCsrf } from '../functions/api/_auth';
import { strongPasswordSchema } from '../functions/api/auth';
import { problemResponse } from '../functions/api/_helpers';
import { openApiSpec } from '../functions/api/openapi';

describe('Phase 2 Improvements Unit Tests', () => {
    describe('S-01: CORS Allowlist (getAllowedOrigin)', () => {
        it('allows official production domains and subdomains', () => {
            expect(getAllowedOrigin('https://ventrina.app')).toBe('https://ventrina.app');
            expect(getAllowedOrigin('https://fogon.ventrina.app')).toBe('https://fogon.ventrina.app');
            expect(getAllowedOrigin('https://demo.ventrina.app')).toBe('https://demo.ventrina.app');
            expect(getAllowedOrigin('https://saas-demo.pages.dev')).toBe('https://saas-demo.pages.dev');
        });

        it('allows local development environments', () => {
            expect(getAllowedOrigin('http://localhost:4321')).toBe('http://localhost:4321');
            expect(getAllowedOrigin('http://localhost:3000')).toBe('http://localhost:3000');
            expect(getAllowedOrigin('http://127.0.0.1:4321')).toBe('http://127.0.0.1:4321');
        });

        it('rejects unauthorized origins', () => {
            expect(getAllowedOrigin('https://malicious-site.com')).toBeNull();
            expect(getAllowedOrigin('https://fake-ventrina.app.evil.com')).toBeNull();
            expect(getAllowedOrigin(null)).toBeNull();
            expect(getAllowedOrigin('invalid-url')).toBeNull();
        });

        it('sets appropriate CORS credentials when origin is allowed', () => {
            const headers = buildCorsHeaders('https://ventrina.app');
            expect(headers['Access-Control-Allow-Origin']).toBe('https://ventrina.app');
            expect(headers['Access-Control-Allow-Credentials']).toBe('true');
            expect(headers['Vary']).toBe('Origin');
            expect(headers['Access-Control-Expose-Headers']).toContain('X-Request-Id');
            expect(headers['Access-Control-Expose-Headers']).toContain('X-Response-Time');
        });

        it('injects X-Request-Id, X-Response-Time, and version headers in onRequest middleware (M-04, O-02)', async () => {
            const { onRequest } = await import('../functions/api/_middleware');
            const mockContext: any = {
                request: new Request('https://ventrina.app/api/products', {
                    headers: { 'Origin': 'https://ventrina.app' }
                }),
                next: async () => new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }),
                data: {}
            };

            const response = await onRequest(mockContext);
            expect(response.headers.get('X-Request-Id')).toBeDefined();
            expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
            expect(response.headers.get('X-API-Version')).toBe('1.0.0');
            expect(mockContext.data.requestId).toBeDefined();
            expect(mockContext.data.requestId).toBe(response.headers.get('X-Request-Id'));
        });
    });

    describe('S-02: CSRF Origin Validation (validateCsrf)', () => {
        it('allows safe HTTP read methods unconditionally', () => {
            const getReq = new Request('https://ventrina.app/api/orders', { method: 'GET' });
            expect(validateCsrf(getReq)).toBe(true);

            const headReq = new Request('https://ventrina.app/api/products', { method: 'HEAD' });
            expect(validateCsrf(headReq)).toBe(true);
        });

        it('allows mutating requests with custom X-Requested-With header', () => {
            const postReq = new Request('https://ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            expect(validateCsrf(postReq)).toBe(true);
        });

        it('allows mutating requests with same origin or trusted host', () => {
            const postReq = new Request('https://fogon.ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'Origin': 'https://fogon.ventrina.app' }
            });
            expect(validateCsrf(postReq)).toBe(true);

            const customDomainReq = new Request('https://mitienda.com/api/settings', {
                method: 'PUT',
                headers: { 'Origin': 'https://mitienda.com' }
            });
            expect(validateCsrf(customDomainReq, 'mitienda.com')).toBe(true);
        });

        it('rejects cross-origin mutations from untrusted origins', () => {
            const postReq = new Request('https://fogon.ventrina.app/api/orders', {
                method: 'POST',
                headers: { 'Origin': 'https://attacker.org' }
            });
            expect(validateCsrf(postReq, 'fogon.ventrina.app')).toBe(false);
        });
    });

    describe('F-06: Password Complexity Policy (strongPasswordSchema)', () => {
        it('rejects passwords shorter than 8 characters', () => {
            const res = strongPasswordSchema.safeParse('short');
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.issues[0].message).toContain('8 caracteres');
            }
        });

        it('rejects trivial or common dictionary passwords', () => {
            expect(strongPasswordSchema.safeParse('12345678').success).toBe(false);
            expect(strongPasswordSchema.safeParse('password').success).toBe(false);
            expect(strongPasswordSchema.safeParse('qwerty123').success).toBe(false);
            expect(strongPasswordSchema.safeParse('admin123').success).toBe(false);
            expect(strongPasswordSchema.safeParse('contraseña').success).toBe(false);
        });

        it('accepts strong, compliant passwords', () => {
            expect(strongPasswordSchema.safeParse('SecureAdmin2026!#').success).toBe(true);
            expect(strongPasswordSchema.safeParse('VentrinaCloud$789').success).toBe(true);
        });
    });

    describe('U-01: RFC 7807 Problem Details (problemResponse)', async () => {
        it('generates structured problem JSON with content-type and status', async () => {
            const response = problemResponse({
                type: 'https://ventrina.app/errors/rate-limit-exceeded',
                title: 'Límite de subida alcanzado',
                status: 429,
                detail: 'Máximo 10 comprobantes por hora.'
            });

            expect(response.status).toBe(429);
            expect(response.headers.get('Content-Type')).toBe('application/problem+json');

            const body = await response.json() as any;
            expect(body.type).toBe('https://ventrina.app/errors/rate-limit-exceeded');
            expect(body.title).toBe('Límite de subida alcanzado');
            expect(body.status).toBe(429);
            expect(body.detail).toBe('Máximo 10 comprobantes por hora.');
            expect(body.error).toBe('Máximo 10 comprobantes por hora.'); // retrocompatibilidad
        });
    });

    describe('U-03: OpenAPI 3.0.3 Specification Contract', () => {
        it('contains required OpenAPI top-level fields', () => {
            expect(openApiSpec.openapi).toBe('3.0.3');
            expect(openApiSpec.info.title).toBe('Ventrina SaaS API');
            expect(openApiSpec.info.version).toBe('2.0.0');
            expect(openApiSpec.servers.length).toBeGreaterThanOrEqual(1);
        });

        it('defines core REST API endpoints in specification', () => {
            const paths = Object.keys(openApiSpec.paths);
            expect(paths).toContain('/health');
            expect(paths).toContain('/auth');
            expect(paths).toContain('/products');
            expect(paths).toContain('/orders');
            expect(paths).toContain('/categories');
            expect(paths).toContain('/users');
            expect(paths).toContain('/analytics');
            expect(paths).toContain('/upload');
        });
    });
});
