// functions/api/_services/rate-limit.service.ts
// Servicio centralizado y reutilizable de Rate Limiting en Cloudflare D1 (S-03, SRP, DRY)
import type { D1Database } from '@cloudflare/workers-types';

export interface RateLimitRow {
    ip: string;
    count: number;
    first_attempt: number;
    lockout_until: number;
}

export interface RateLimitCheckResult {
    allowed: boolean;
    remainingMinutes?: number;
    remaining?: number;
}

export interface RateLimitOptions {
    maxAttempts: number;
    windowMs: number;
    lockoutMs?: number;
}

export class RateLimitService {
    constructor(private db: D1Database) {}

    /**
     * Purga registros expirados de la tabla rate_limits de forma asíncrona (Fix #8, P-04)
     */
    async purgeExpired(windowMs: number = 15 * 60 * 1000): Promise<number> {
        const now = Date.now();
        try {
            const res = await this.db.prepare(
                "DELETE FROM rate_limits WHERE (? - first_attempt > ?) AND (? >= lockout_until)"
            ).bind(now, windowMs, now).run();
            return res?.meta?.changes ?? 0;
        } catch {
            return 0;
        }
    }

    /**
     * Verifica si una clave o IP tiene permitido realizar la acción
     */
    async checkRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitCheckResult> {
        const now = Date.now();
        const { maxAttempts, windowMs } = options;

        let record: RateLimitRow | null = null;
        try {
            record = await this.db.prepare(
                "SELECT ip, count, first_attempt, lockout_until FROM rate_limits WHERE ip = ?"
            ).bind(key).first<RateLimitRow>();
        } catch {
            return { allowed: true, remaining: maxAttempts };
        }

        if (!record) {
            return { allowed: true, remaining: maxAttempts };
        }

        // Si está en período de bloqueo activo
        if (now < record.lockout_until) {
            const remainingMinutes = Math.ceil((record.lockout_until - now) / 60000);
            return { allowed: false, remainingMinutes, remaining: 0 };
        }

        // Si la ventana de tiempo ya expiró, limpiar registro obsoleto
        if (now - record.first_attempt > windowMs) {
            try {
                await this.db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(key).run();
            } catch {}
            return { allowed: true, remaining: maxAttempts };
        }

        // Si superó el máximo de intentos
        if (record.count >= maxAttempts) {
            const remainingMinutes = Math.ceil((windowMs - (now - record.first_attempt)) / 60000);
            return { allowed: false, remainingMinutes, remaining: 0 };
        }

        return { allowed: true, remaining: Math.max(0, maxAttempts - record.count) };
    }

    /**
     * Registra un intento fallido (e.g. login inválido), aplicando lockout si alcanza el umbral
     */
    async recordFailure(key: string, options: RateLimitOptions): Promise<void> {
        const now = Date.now();
        const { maxAttempts, lockoutMs = options.windowMs } = options;

        try {
            const record = await this.db.prepare(
                "SELECT ip, count, first_attempt, lockout_until FROM rate_limits WHERE ip = ?"
            ).bind(key).first<RateLimitRow>();

            if (!record) {
                await this.db.prepare(
                    "INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)"
                ).bind(key, now).run();
            } else {
                const newCount = record.count + 1;
                let newLockout = 0;
                if (newCount >= maxAttempts) {
                    newLockout = now + lockoutMs;
                }
                await this.db.prepare(
                    "UPDATE rate_limits SET count = ?, lockout_until = ? WHERE ip = ?"
                ).bind(newCount, newLockout, key).run();
            }
        } catch {}
    }

    /**
     * Registra un intento consumido (e.g. registro de nuevo tenant)
     */
    async recordAttempt(key: string): Promise<void> {
        const now = Date.now();
        try {
            const record = await this.db.prepare(
                "SELECT ip, count, first_attempt, lockout_until FROM rate_limits WHERE ip = ?"
            ).bind(key).first<RateLimitRow>();

            if (!record) {
                await this.db.prepare(
                    "INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)"
                ).bind(key, now).run();
            } else {
                await this.db.prepare(
                    "UPDATE rate_limits SET count = count + 1 WHERE ip = ?"
                ).bind(key).run();
            }
        } catch {}
    }

    /**
     * Limpia el registro de rate limit tras un éxito (e.g. login correcto)
     */
    async clear(key: string): Promise<void> {
        try {
            await this.db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(key).run();
        } catch {}
    }
}
