// functions/types.ts
// Tipos unificados para Cloudflare Pages Functions y bindings del backend
import type { D1Database, R2Bucket, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
    DB: D1Database;
    ventrina?: D1Database;
    STORAGE?: R2Bucket;
    BUCKET?: R2Bucket;
    KV?: KVNamespace;
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
    ASSETS?: { fetch: typeof fetch };
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

/**
 * M-04: Datos enriquecidos disponibles en el contexto de la aplicación tras middleware
 */
export interface AppContextData {
    tenant?: TenantRow | null;
    tenantId?: string;
    user?: UserSession | null;
    db?: D1Database;
    requestId?: string;
    startTime?: number;
    [key: string]: unknown;
}

/**
 * M-04: Interface AppContext fuertemente tipada para handlers y middlewares
 */
export interface AppContext<E = Env, P extends string = string> extends Omit<PagesContext<E, P>, 'data'> {
    data: AppContextData;
}

export type AppHandler<E = Env, P extends string = string> = (
    context: AppContext<E, P>
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
    email: string;
    username: string;
    role: string;
    tenant_id: string;
}

export interface TenantResolution {
    id: string;
    tenant: TenantRow | null;
}

export interface OrderEventRow {
    id?: number;
    order_id: string;
    tenant_id: string;
    from_status: string | null;
    to_status: string;
    actor: string | null;
    note: string | null;
    created_at?: string;
}

export interface OrderRow {
    id: string;
    client_name: string;
    client_phone: string;
    delivery_type: string;
    delivery_address: string | null;
    delivery_notes: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    payment_receipt_url: string | null;
    bcv_rate: number;
    total_bs: number;
    status: string;
    total_items: number;
    total_price: number;
    coupon_code?: string | null;
    discount_amount?: number;
    template: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
}
