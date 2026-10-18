// functions/api/_plans.ts
// Configuración de límites y capacidades de cada plan del SaaS
import type { D1Database } from '@cloudflare/workers-types';
import type { TenantRow } from '../types';

export interface PlanConfig {
    name: string;
    monthlyPriceUsd: number;
    maxProducts: number;
    maxOrdersPerMonth: number;
    features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
    'basic': {
        name: 'Básico',
        monthlyPriceUsd: 15,
        maxProducts: 30,
        maxOrdersPerMonth: 100,
        features: ['catalog', 'whatsapp_orders']
    },
    'pro': {
        name: 'Profesional',
        monthlyPriceUsd: 30,
        maxProducts: 200,
        maxOrdersPerMonth: 1000,
        features: ['catalog', 'whatsapp_orders', 'inventory', 'analytics']
    },
    'enterprise': {
        name: 'Empresarial',
        monthlyPriceUsd: 99,
        maxProducts: 999999, // Ilimitado práctico
        maxOrdersPerMonth: 999999, // Ilimitado práctico
        features: ['catalog', 'whatsapp_orders', 'inventory', 'analytics', 'api', 'custom_domain']
    }
};

export interface LimitCheckResult {
    allowed: boolean;
    limit: number;
    current: number;
}

/**
 * Verifica si un tenant ha excedido su límite de productos.
 */
export async function checkProductLimit(
    db: D1Database,
    tenant: TenantRow | null
): Promise<LimitCheckResult> {
    const planKey = tenant?.plan || 'basic';
    const planLimits = PLANS[planKey] || PLANS['basic'];
    
    const row = await db.prepare(
        'SELECT COUNT(*) as total FROM products WHERE tenant_id = ?'
    ).bind(tenant?.id || 'demo').first<{ total: number }>();

    const total = row?.total ?? 0;

    return {
        allowed: total < planLimits.maxProducts,
        limit: planLimits.maxProducts,
        current: total
    };
}

/**
 * Verifica si un tenant ha excedido su límite de pedidos en el mes actual.
 */
export async function checkOrderLimit(
    db: D1Database,
    tenant: TenantRow | null
): Promise<LimitCheckResult> {
    const planKey = tenant?.plan || 'basic';
    const planLimits = PLANS[planKey] || PLANS['basic'];
    
    // Obtener primer día del mes actual en formato ISO (YYYY-MM-01)
    const date = new Date();
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();

    const row = await db.prepare(
        'SELECT COUNT(*) as total FROM orders WHERE tenant_id = ? AND created_at >= ?'
    ).bind(tenant?.id || 'demo', firstDayOfMonth).first<{ total: number }>();

    const total = row?.total ?? 0;

    return {
        allowed: total < planLimits.maxOrdersPerMonth,
        limit: planLimits.maxOrdersPerMonth,
        current: total
    };
}
