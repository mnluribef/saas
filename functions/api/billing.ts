// functions/api/billing.ts
// Endpoint para que cada tenant consulte su plan, límites, consumo actual e info de pago
import { verifySession, unauthorizedResponse } from "./_auth";
import { resolveTenant, tenantNotFoundResponse } from "./_tenant";
import { PLANS, checkProductLimit, checkOrderLimit } from "./_plans";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    if (!tenant) {
        return tenantNotFoundResponse();
    }

    // Solo los administradores del tenant pueden ver esta info
    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const productStats = await checkProductLimit(db, tenant);
        const orderStats = await checkOrderLimit(db, tenant);
        
        const planKey = tenant.plan || 'basic';
        const planDetails = PLANS[planKey] || PLANS['basic'];

        // Datos para Pagos Manuales (B2B Venezuela)
        const paymentInfo = {
            method: env.PAYMENT_METHOD || "Transferencia Bancaria / Pago Móvil",
            bank: env.PAYMENT_BANK || "Banesco",
            phone: env.PAYMENT_PHONE || "No disponible",
            id: env.PAYMENT_ID || "No disponible",
            binancePay: env.PAYMENT_BINANCE || "pagos@vendly.app",
            zelle: env.PAYMENT_ZELLE || "pagos@vendly.app",
            monthlyPriceUsd: planKey === 'basic' ? 15 : planKey === 'pro' ? 30 : 99
        };

        return jsonResponse({
            tenant: {
                id: tenant.id,
                name: tenant.name,
                plan: planDetails.name,
                status: tenant.active === 1 ? 'Activo' : 'Suspendido',
                domain: tenant.domain || `${new URL(request.url).host}/${tenant.id}`
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
        });

    } catch (err) {
        console.error("Error en GET /api/billing:", err);
        return jsonResponse({ error: "Error interno al consultar datos de facturación." }, 500);
    }
};
