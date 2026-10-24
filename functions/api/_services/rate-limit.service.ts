// functions/api/_services/rate-limit.service.ts
// Servicio centralizado y reutilizable de Rate Limiting en Cloudflare KV (Fix #1: S-03, SRP, DRY)
// Migrado de D1 a KV para soportar alta concurrencia sin saturar SQLite bajo ataques de fuerza bruta.
import type { KVNamespace } from '@cloudflare/workers-types';

export interface RateLimitRecord {
    count: number;
    firstAttempt: number;
    lockoutUntil: number;
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

/** Prefijo de namespace para evitar colisiones con otras claves KV */
const KV_PREFIX = 'rl:v1:';

export class RateLimitService {
    /** kv puede ser undefined (entornos sin KV configurado): en ese caso el rate limit falla abierto (permissive). */
    constructor(private kv: KVNamespace | undefined) {}

    private key(ip: string): string {
        return `${KV_PREFIX}${ip}`;
    }

    private async getRecord(ip: string): Promise<RateLimitRecord | null> {
        if (!this.kv) return null;
        try {
            return await this.kv.get<RateLimitRecord>(this.key(ip), 'json');
        } catch {
            return null;
        }
    }

    private async putRecord(ip: string, record: RateLimitRecord, ttlMs: number): Promise<void> {
        if (!this.kv) return;
        try {
            // KV expirationTtl mínimo es 60 segundos; garantizamos eso.
            const ttlSeconds = Math.max(60, Math.ceil(ttlMs / 1000));
            await this.kv.put(this.key(ip), JSON.stringify(record), { expirationTtl: ttlSeconds });
        } catch {}
    }

    private async deleteRecord(ip: string): Promise<void> {
        if (!this.kv) return;
        try {
            await this.kv.delete(this.key(ip));
        } catch {}
    }

    /**
     * Verifica si una clave o IP tiene permitido realizar la acción.
     * Falla abierto (permite) si KV no está disponible.
     */
    async checkRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitCheckResult> {
        if (!this.kv) return { allowed: true, remaining: options.maxAttempts };

        const now = Date.now();
        const { maxAttempts, windowMs } = options;
        const record = await this.getRecord(key);

        if (!record) {
            return { allowed: true, remaining: maxAttempts };
        }

        // Si está en período de bloqueo activo
        if (now < record.lockoutUntil) {
            const remainingMinutes = Math.ceil((record.lockoutUntil - now) / 60000);
            return { allowed: false, remainingMinutes, remaining: 0 };
        }

        // Si la ventana de tiempo ya expiró, KV ya habrá eliminado el registro (TTL),
        // pero si no, ignorar el registro obsoleto.
        if (now - record.firstAttempt > windowMs) {
            await this.deleteRecord(key);
            return { allowed: true, remaining: maxAttempts };
        }

        // Si superó el máximo de intentos
        if (record.count >= maxAttempts) {
            const remainingMinutes = Math.ceil((windowMs - (now - record.firstAttempt)) / 60000);
            return { allowed: false, remainingMinutes, remaining: 0 };
        }

        return { allowed: true, remaining: Math.max(0, maxAttempts - record.count) };
    }

    /**
     * Registra un intento fallido (e.g. login inválido), aplicando lockout si alcanza el umbral.
     */
    async recordFailure(key: string, options: RateLimitOptions): Promise<void> {
        const now = Date.now();
        const { maxAttempts, lockoutMs = options.windowMs, windowMs } = options;
        const record = await this.getRecord(key);

        if (!record || now - record.firstAttempt > windowMs) {
            await this.putRecord(key, { count: 1, firstAttempt: now, lockoutUntil: 0 }, windowMs);
        } else {
            const newCount = record.count + 1;
            const lockoutUntil = newCount >= maxAttempts ? now + lockoutMs : 0;
            await this.putRecord(key, { count: newCount, firstAttempt: record.firstAttempt, lockoutUntil }, lockoutMs || windowMs);
        }
    }

    /**
     * Registra un intento consumido (e.g. registro de nuevo tenant).
     */
    async recordAttempt(key: string, windowMs = 60 * 60 * 1000): Promise<void> {
        const now = Date.now();
        const record = await this.getRecord(key);

        if (!record || now - record.firstAttempt > windowMs) {
            await this.putRecord(key, { count: 1, firstAttempt: now, lockoutUntil: 0 }, windowMs);
        } else {
            await this.putRecord(key, { count: record.count + 1, firstAttempt: record.firstAttempt, lockoutUntil: 0 }, windowMs);
        }
    }

    /**
     * Limpia el registro de rate limit tras un éxito (e.g. login correcto).
     */
    async clear(key: string): Promise<void> {
        await this.deleteRecord(key);
    }

    /**
     * Stub de compatibilidad: purgeExpired ya no es necesario (KV expira automáticamente via TTL).
     */
    async purgeExpired(_windowMs?: number): Promise<number> {
        return 0;
    }
}
