// tests/health.test.ts
// Tests unitarios para el health check extendido con subsistemas (O-03)
import { describe, it, expect, vi } from 'vitest';
import { onRequestGet, type HealthCheckResponse } from '../functions/api/health';

describe('O-03: Extended Health Check Subsystems (health.ts)', () => {
    it('returns healthy (200) when all subsystems respond quickly', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({ ping: 1 })
            })
        };
        const mockKv = {
            get: vi.fn().mockResolvedValue(null)
        };
        const mockStorage = {
            list: vi.fn().mockResolvedValue({ objects: [] })
        };

        const mockContext: any = {
            env: {
                DB: mockDb,
                KV: mockKv,
                STORAGE: mockStorage,
                ENVIRONMENT: 'test'
            }
        };

        const response = await onRequestGet(mockContext);
        expect(response.status).toBe(200);

        const data = await response.json() as HealthCheckResponse;
        expect(data.status).toBe('healthy');
        expect(data.version).toBe('2.1.0');
        expect(data.environment).toBe('test');
        expect(data.checks.database.status).toBe('ok');
        expect(data.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
        expect(data.checks.kv.status).toBe('ok');
        expect(data.checks.storage.status).toBe('ok');
        expect(data.database.status).toBe('ok'); // retrocompatibilidad
    });

    it('returns degraded (200) when KV or Storage fail but D1 is healthy', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({ ping: 1 })
            })
        };
        const failingKv = {
            get: vi.fn().mockRejectedValue(new Error('KV timeout'))
        };

        const mockContext: any = {
            env: {
                DB: mockDb,
                KV: failingKv,
                ENVIRONMENT: 'production'
            }
        };

        const response = await onRequestGet(mockContext);
        expect(response.status).toBe(200);

        const data = await response.json() as HealthCheckResponse;
        expect(data.status).toBe('degraded');
        expect(data.checks.database.status).toBe('ok');
        expect(data.checks.kv.status).toBe('error');
    });

    it('returns unhealthy (503) when D1 database fails', async () => {
        const failingDb = {
            prepare: vi.fn().mockReturnValue({
                first: vi.fn().mockRejectedValue(new Error('D1 connection lost'))
            })
        };

        const mockContext: any = {
            env: {
                DB: failingDb,
                ENVIRONMENT: 'production'
            }
        };

        const response = await onRequestGet(mockContext);
        expect(response.status).toBe(503);

        const data = await response.json() as HealthCheckResponse;
        expect(data.status).toBe('unhealthy');
        expect(data.checks.database.status).toBe('error');
        expect(data.database.status).toBe('error');
    });

    it('handles unconfigured optional subsystems gracefully', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({ ping: 1 })
            })
        };

        const mockContext: any = {
            env: {
                DB: mockDb
                // No KV, No STORAGE
            }
        };

        const response = await onRequestGet(mockContext);
        expect(response.status).toBe(200);

        const data = await response.json() as HealthCheckResponse;
        expect(data.status).toBe('healthy');
        expect(data.checks.database.status).toBe('ok');
        expect(data.checks.kv.status).toBe('not_configured');
        expect(data.checks.storage.status).toBe('not_configured');
    });
});
