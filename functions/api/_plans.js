// functions/api/_plans.js
// Configuración de límites y capacidades de cada plan del SaaS

export const PLANS = {
    'basic': {
        name: 'Básico',
        maxProducts: 30,
        maxOrdersPerMonth: 100,
        features: ['catalog', 'whatsapp_orders']
    },
    'pro': {
        name: 'Profesional',
        maxProducts: 200,
        maxOrdersPerMonth: 1000,
        features: ['catalog', 'whatsapp_orders', 'inventory', 'analytics']
    },
    'enterprise': {
        name: 'Empresarial',
        maxProducts: 999999, // Ilimitado práctico
        maxOrdersPerMonth: 999999, // Ilimitado práctico
        features: ['catalog', 'whatsapp_orders', 'inventory', 'analytics', 'api', 'custom_domain']
    }
};

/**
 * Verifica si un tenant ha excedido su límite de productos.
 * @param {object} db - Binding de D1
 * @param {object} tenant - Objeto tenant obtenido de `resolveTenant`
 * @returns {Promise<{ allowed: boolean, limit: number, current: number }>}
 */
export async function checkProductLimit(db, tenant) {
    const planKey = tenant?.plan || 'basic';
    const planLimits = PLANS[planKey] || PLANS['basic'];
    
    const { total } = await db.prepare(
        'SELECT COUNT(*) as total FROM products WHERE tenant_id = ?'
    ).bind(tenant?.id || 'demo').first();

    return {
        allowed: total < planLimits.maxProducts,
        limit: planLimits.maxProducts,
        current: total
    };
}

/**
 * Verifica si un tenant ha excedido su límite de pedidos en el mes actual.
 * @param {object} db - Binding de D1
 * @param {object} tenant - Objeto tenant obtenido de `resolveTenant`
 * @returns {Promise<{ allowed: boolean, limit: number, current: number }>}
 */
export async function checkOrderLimit(db, tenant) {
    const planKey = tenant?.plan || 'basic';
    const planLimits = PLANS[planKey] || PLANS['basic'];
    
    // Obtener primer día del mes actual en formato ISO (YYYY-MM-01)
    const date = new Date();
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();

    const { total } = await db.prepare(
        'SELECT COUNT(*) as total FROM orders WHERE tenant_id = ? AND created_at >= ?'
    ).bind(tenant?.id || 'demo', firstDayOfMonth).first();

    return {
        allowed: total < planLimits.maxOrdersPerMonth,
        limit: planLimits.maxOrdersPerMonth,
        current: total
    };
}
