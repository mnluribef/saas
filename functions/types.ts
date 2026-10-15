// functions/types.ts
// Tipos unificados para Cloudflare Pages Functions y bindings del backend
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
    DB: D1Database;
    vendly?: D1Database;
    STORAGE?: R2Bucket;
    BUCKET?: R2Bucket;
    SUPERADMIN_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    WEBHOOK_URL?: string;
    ENVIRONMENT?: string;
    JWT_SECRET?: string;
    PAYMENT_METHOD?: string;
    PAYMENT_BANK?: string;
    PAYMENT_PHONE?: string;
    PAYMENT_ID?: string;
    PAYMENT_BINANCE?: string;
    PAYMENT_ZELLE?: string;
}

export interface PagesContext<E = Env, P extends string = string> {
    request: Request;
    env: E & {
        ASSETS?: { fetch: typeof fetch };
    };
    params: Record<P, string | string[]>;
    waitUntil: (promise: Promise<unknown>) => void;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    data: Record<string, unknown>;
}

export type PagesHandler<E = Env, P extends string = string> = (
    context: PagesContext<E, P>
) => Response | Promise<Response>;

export interface TenantRow {
    id: string;
    name: string;
    slug?: string;
    template: string;
    plan: 'basic' | 'pro' | 'enterprise' | string;
    active: number;
    domain?: string | null;
    whatsapp?: string | null;
    config_json?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface UserSession {
    username: string;
    role: string;
    tenant_id: string;
}

export interface TenantResolution {
    id: string;
    tenant: TenantRow | null;
}
