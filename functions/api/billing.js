// functions/api/billing.js
// Endpoint para que cada tenant consulte su plan, límites, consumo actual e info de pago
import { verifySession, unauthorizedResponse } from "./_auth.js";
import { resolveTenant } from "./_tenant.js";
import { PLANS, checkProductLimit, checkOrderLimit } from "./_plans.js";

/**
 * GET /api/billing
 * Retorna la información de consumo y plan actual del tenant.
 */
export async function onRequestGet(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // Solo los administradores del tenant pueden ver esta info
    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const productStats = await checkProductLimit(db, tenant);
        const orderStats = await checkOrderLimit(db, tenant);
        
        const planKey = tenant?.plan || 'basic';
        const planDetails = PLANS[planKey];

        // Datos para Pagos Manuales (B2B Venezuela)
        // En un futuro, esto podría venir de una tabla de configuración del Super-Admin
        const paymentInfo = {
            method: env.PAYMENT_METHOD || "Transferencia Bancaria / Pago Móvil",
            bank: env.PAYMENT_BANK || "Banesco",
            phone: env.PAYMENT_PHONE || "No disponible",
            id: env.PAYMENT_ID || "No disponible",
            binancePay: env.PAYMENT_BINANCE || "pagos@vendly.app",
            zelle: env.PAYMENT_ZELLE || "pagos@vendly.app",
            monthlyPriceUsd: planKey === 'basic' ? 15 : planKey === 'pro' ? 30 : 99
        };

        return new Response(JSON.stringify({
            tenant: {
                id: tenant.id,
                name: tenant.name,
                plan: planDetails.name,
                status: tenant.active === 1 ? 'Activo' : 'Suspendido',
                domain: tenant.domain || `${tenant.id}.vendly.app`
            },
            usage: {
                products: {
                    current: productStats.current,
                    limit: productStats.limit,
                    percentage: Math.min(100, Math.round((productStats.current / productStats.limit) * 100))
                },
                ordersThisMonth: {
                    current: orderStats.current,
                    limit: orderStats.limit,
                    percentage: Math.min(100, Math.round((orderStats.current / orderStats.limit) * 100))
                }
            },
            billing: paymentInfo
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error("Error en GET /api/billing:", err);
        return new Response(JSON.stringify({ error: "Error interno al consultar datos de facturación." }), { status: 500 });
    }
}
