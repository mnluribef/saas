// functions/api/settings.js
// Controlador de Configuración de la Tienda (Personalización completa)
import { verifySession, unauthorizedResponse } from "./_auth.js";
import { resolveTenant } from "./_tenant.js";
import { z } from "zod";

const storeSettingsSchema = z.object({
    business: z.object({
        name: z.string().min(2).max(100).optional(),
        shortName: z.string().max(50).optional(),
        tagline: z.string().max(200).optional(),
        description: z.string().max(500).optional(),
        logoTextPrimary: z.string().max(20).optional(),
        logoTextSecondary: z.string().max(20).optional(),
    }).optional(),
    contact: z.object({
        whatsapp: z.string().max(30).optional(),
        whatsappDisplay: z.string().max(50).optional(),
        phone: z.string().max(50).optional(),
        email: z.string().email().or(z.literal("")).optional(),
        instagram: z.string().max(100).optional(),
        instagramHandle: z.string().max(50).optional(),
        address: z.string().max(300).optional(),
        hours: z.string().max(150).optional(),
    }).optional(),
    payment: z.object({
        pagoMovil: z.object({
            banco: z.string().max(100).optional(),
            telefono: z.string().max(50).optional(),
            cedula: z.string().max(50).optional(),
        }).optional(),
        zelle: z.object({
            email: z.string().max(100).optional(),
            titular: z.string().max(100).optional(),
        }).optional(),
        efectivo: z.boolean().optional(),
        punto: z.boolean().optional(),
    }).optional(),
    labels: z.object({
        itemNounSingular: z.string().max(50).optional(),
        itemNounPlural: z.string().max(50).optional(),
        emptyCartEmoji: z.string().max(10).optional(),
        deliveryOptionName: z.string().max(50).optional(),
        deliveryOptionPrice: z.number().min(0).or(z.string().transform(v => parseFloat(v))).optional(),
        pickupOptionName: z.string().max(50).optional(),
    }).optional(),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech']).optional(),
    storePrefix: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/).optional(),
});

/**
 * GET /api/settings - Obtiene la configuración del tenant actual
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    try {
        let tenantData = tenant;
        if (!tenantData) {
            tenantData = await db.prepare("SELECT * FROM tenants WHERE id = ?").bind(tenantId).first();
        }

        let configJson = {};
        if (tenantData && tenantData.config_json) {
            try {
                configJson = JSON.parse(tenantData.config_json);
            } catch (e) {
                configJson = {};
            }
        }

        return new Response(JSON.stringify({
            success: true,
            tenant: {
                id: tenantId,
                name: tenantData?.name || "Tienda",
                template: tenantData?.template || "restaurant",
                domain: tenantData?.domain || null,
                whatsapp: tenantData?.whatsapp || null,
                config: configJson
            }
        }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (err) {
        console.error("Error en GET /api/settings:", err);
        return new Response(JSON.stringify({ error: "Error interno al obtener configuración." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/settings - Actualiza la configuración de la tienda (Admin Only)
 */
export async function onRequestPut(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const body = await request.json();
        const parsed = storeSettingsSchema.safeParse(body);

        if (!parsed.success) {
            return new Response(JSON.stringify({
                error: "Datos de configuración inválidos",
                details: parsed.error.issues
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const updates = parsed.data;

        // Cargar config_json existente para hacer merge profundo
        let currentConfig = {};
        const tenantRow = await db.prepare("SELECT config_json, name, template, whatsapp FROM tenants WHERE id = ?").bind(tenantId).first();
        if (tenantRow && tenantRow.config_json) {
            try {
                currentConfig = JSON.parse(tenantRow.config_json);
            } catch (e) {
                currentConfig = {};
            }
        }

        const mergedConfig = {
            ...currentConfig,
            business: { ...(currentConfig.business || {}), ...(updates.business || {}) },
            contact: { ...(currentConfig.contact || {}), ...(updates.contact || {}) },
            payment: { 
                ...(currentConfig.payment || {}), 
                ...(updates.payment || {}),
                pagoMovil: {
                    ...((currentConfig.payment && currentConfig.payment.pagoMovil) || {}),
                    ...((updates.payment && updates.payment.pagoMovil) || {})
                },
                zelle: {
                    ...((currentConfig.payment && currentConfig.payment.zelle) || {}),
                    ...((updates.payment && updates.payment.zelle) || {})
                }
            },
            labels: { ...(currentConfig.labels || {}), ...(updates.labels || {}) },
            storePrefix: updates.storePrefix || currentConfig.storePrefix || tenantRow?.name?.slice(0, 3).toUpperCase() || 'VEN'
        };

        const newName = updates.business?.name || tenantRow?.name || 'Tienda';
        const newTemplate = updates.template || tenantRow?.template || 'restaurant';
        const newWhatsapp = updates.contact?.whatsapp || tenantRow?.whatsapp || null;
        const configJsonString = JSON.stringify(mergedConfig);

        // Actualizar en base de datos
        await db.prepare(`
            UPDATE tenants 
            SET name = ?, template = ?, whatsapp = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(newName, newTemplate, newWhatsapp, configJsonString, tenantId).run();

        return new Response(JSON.stringify({
            success: true,
            message: "Configuración de la tienda actualizada con éxito.",
            config: mergedConfig
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en PUT /api/settings:", err);
        return new Response(JSON.stringify({ error: "Error al guardar la configuración de la tienda." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
