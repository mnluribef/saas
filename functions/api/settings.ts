// functions/api/settings.ts
// Controlador de Configuración de la Tienda (Modular por Namespaces - Opción A)
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { z } from "zod";
import { verifySession, unauthorizedResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler, TenantRow } from '../types';

// Validador estricto para evitar inflar SQLite D1 con DataURLs Base64 gigantes
const safeImageString = z.string().max(2000000).refine((val) => {
    if (val && val.startsWith("data:image/")) {
        // Enforce max ~120KB para Base64 inline; imágenes pesadas deben usar /api/upload (R2)
        return val.length <= 150000;
    }
    return true;
}, {
    message: "La imagen en Base64 excede 100KB. Por favor usa el gestor de subida de imágenes (/api/upload a Cloudflare R2)."
});

export const heroSlideSchema = z.object({
    image: safeImageString,
    alt: z.string().max(250).optional().default(""),
    caption: z.string().max(300).optional(),
});

export const heroStatSchema = z.object({
    value: z.string().max(50),
    label: z.string().max(100),
});

export const benefitItemSchema = z.object({
    icon: z.string().max(60).default("award"),
    title: z.string().max(120),
    description: z.string().max(600),
});

export const processStepSchema = z.object({
    number: z.union([z.number(), z.string()]),
    title: z.string().max(120),
    description: z.string().max(600),
});

export const testimonialItemSchema = z.object({
    name: z.string().max(100),
    role: z.string().max(100).default("Cliente"),
    review: z.string().max(1200),
    avatar: safeImageString.optional().default(""),
    rating: z.union([z.number(), z.string().transform(v => parseInt(v, 10))]).optional().default(5),
});

export const faqItemSchema = z.object({
    q: z.string().max(300),
    a: z.string().max(2000),
});

export const businessSettingsSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    shortName: z.string().max(50).optional(),
    tagline: z.string().max(250).optional(),
    description: z.string().max(1500).optional(),
    logoTextPrimary: z.string().max(40).optional(),
    logoTextSecondary: z.string().max(40).optional(),
    logoIcon: z.string().max(1000).optional(),
    logoImage: safeImageString.optional(),
    siteUrl: z.string().max(300).optional(),
    ogImage: safeImageString.optional(),
});

export const contactSettingsSchema = z.object({
    whatsapp: z.string().max(30).optional(),
    whatsappDisplay: z.string().max(50).optional(),
    phone: z.string().max(50).optional(),
    email: z.email().or(z.literal("")).optional(),
    instagram: z.string().max(120).optional(),
    instagramHandle: z.string().max(60).optional(),
    address: z.string().max(350).optional(),
    hours: z.string().max(180).optional(),
});

export const paymentSettingsSchema = z.object({
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
});

export const labelsSettingsSchema = z.object({
    itemNounSingular: z.string().max(50).optional(),
    itemNounPlural: z.string().max(50).optional(),
    emptyCartEmoji: z.string().max(10).optional(),
    deliveryOptionName: z.string().max(50).optional(),
    deliveryOptionPrice: z.number().min(0).or(z.string().transform(v => parseFloat(v))).optional(),
    pickupOptionName: z.string().max(50).optional(),
});

export const landingSettingsSchema = z.object({
    hero: z.object({
        badgeText: z.string().max(150).optional(),
        headline: z.string().max(200).optional(),
        headlineHighlight: z.string().max(200).optional(),
        subheadline: z.string().max(1000).optional(),
        ctaPrimaryText: z.string().max(60).optional(),
        ctaPrimaryLink: z.string().max(250).optional(),
        ctaSecondaryText: z.string().max(60).optional(),
        ctaSecondaryLink: z.string().max(250).optional(),
        slides: z.array(heroSlideSchema).optional(),
        stats: z.array(heroStatSchema).optional(),
    }).optional(),
    catalog: z.object({
        title: z.string().max(120).optional(),
        titleHighlight: z.string().max(120).optional(),
        subtitle: z.string().max(500).optional(),
        searchPlaceholder: z.string().max(150).optional(),
        emptyMessage: z.string().max(250).optional(),
        addToCartText: z.string().max(60).optional(),
    }).optional(),
    benefits: z.object({
        title: z.string().max(120).optional(),
        titleHighlight: z.string().max(120).optional(),
        subtitle: z.string().max(500).optional(),
        items: z.array(benefitItemSchema).optional(),
    }).optional(),
    process: z.object({
        title: z.string().max(120).optional(),
        titleHighlight: z.string().max(120).optional(),
        subtitle: z.string().max(500).optional(),
        steps: z.array(processStepSchema).optional(),
    }).optional(),
    testimonials: z.object({
        title: z.string().max(120).optional(),
        titleHighlight: z.string().max(120).optional(),
        subtitle: z.string().max(500).optional(),
        items: z.array(testimonialItemSchema).optional(),
    }).optional(),
    faq: z.object({
        title: z.string().max(120).optional(),
        titleHighlight: z.string().max(120).optional(),
        subtitle: z.string().max(500).optional(),
        items: z.array(faqItemSchema).optional(),
    }).optional(),
});

export const storeSettingsSchema = z.object({
    business: businessSettingsSchema.optional(),
    contact: contactSettingsSchema.optional(),
    landing: landingSettingsSchema.optional(),
    payment: paymentSettingsSchema.optional(),
    labels: labelsSettingsSchema.optional(),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts']).optional(),
    storePrefix: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/).optional(),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type HeroStat = z.infer<typeof heroStatSchema>;
export type BenefitItem = z.infer<typeof benefitItemSchema>;
export type ProcessStep = z.infer<typeof processStepSchema>;
export type TestimonialItem = z.infer<typeof testimonialItemSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

interface TenantSettingRow {
    namespace: string;
    data_json: string;
}

/**
 * Helper para reconstruir la configuración completa desde la tabla modular tenant_settings
 */
async function loadTenantSettings(db: D1Database, tenantId: string, fallbackJson?: string | null): Promise<Record<string, any>> {
    try {
        const { results: rows } = await db.prepare(
            "SELECT namespace, data_json FROM tenant_settings WHERE tenant_id = ?"
        ).bind(tenantId).all<TenantSettingRow>();

        if (rows && rows.length > 0) {
            const config: Record<string, any> = {};
            for (const row of rows) {
                try {
                    config[row.namespace] = JSON.parse(row.data_json);
                } catch {
                    config[row.namespace] = {};
                }
            }
            return config;
        }
    } catch {
        // En caso de que la tabla aún no exista antes de correr la migración
    }

    if (fallbackJson) {
        try {
            return JSON.parse(fallbackJson);
        } catch {
            return {};
        }
    }

    return {};
}

/**
 * GET /api/settings - Obtiene la configuración del tenant actual
 * Admite filtro opcional ?namespace=payment|contact|business|landing|labels
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    try {
        let tenantData = tenant;
        if (!tenantData) {
            tenantData = await db.prepare("SELECT * FROM tenants WHERE id = ?").bind(tenantId).first<TenantRow>();
        }

        const configJson = await loadTenantSettings(db, tenantId, tenantData?.config_json);

        const url = new URL(request.url);
        const requestedNamespace = url.searchParams.get("namespace");

        if (requestedNamespace && typeof requestedNamespace === "string") {
            return jsonResponse({
                success: true,
                tenantId,
                namespace: requestedNamespace,
                data: configJson[requestedNamespace] || {}
            }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate" });
        }

        return jsonResponse({
            success: true,
            tenant: {
                id: tenantId,
                name: tenantData?.name || "Tienda",
                template: tenantData?.template || "restaurant",
                domain: tenantData?.domain || null,
                whatsapp: tenantData?.whatsapp || null,
                config: configJson
            }
        }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate" });
    } catch (err) {
        console.error("Error en GET /api/settings:", err);
        return jsonResponse({ error: "Error interno al obtener configuración." }, 500);
    }
};

/**
 * PUT /api/settings - Actualiza la configuración de la tienda (Admin Only)
 * Guarda modularmente por namespace en tenant_settings y actualiza el snapshot en tenants
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();

    try {
        const body = await request.json();
        const parsed = storeSettingsSchema.safeParse(body);

        if (!parsed.success) {
            return jsonResponse({
                error: "Datos de configuración inválidos",
                details: parsed.error.issues
            }, 400);
        }

        const updates = parsed.data;

        // Cargar estado actual
        const tenantRow = await db.prepare(
            "SELECT config_json, name, template, whatsapp FROM tenants WHERE id = ?"
        ).bind(tenantId).first<TenantRow>();

        const currentConfig = await loadTenantSettings(db, tenantId, tenantRow?.config_json);

        // 1. Merge modular por cada Namespace
        const mergedBusiness = {
            ...(currentConfig.business || {}),
            ...(updates.business || {})
        };

        const mergedContact = {
            ...(currentConfig.contact || {}),
            ...(updates.contact || {})
        };

        const currentLanding = currentConfig.landing || {};
        const updateLanding = updates.landing || {};
        const mergedLanding = {
            ...currentLanding,
            hero: {
                ...(currentLanding.hero || {}),
                ...(updateLanding.hero || {}),
                slides: updateLanding.hero?.slides !== undefined ? updateLanding.hero.slides : (currentLanding.hero?.slides || []),
                stats: updateLanding.hero?.stats !== undefined ? updateLanding.hero.stats : (currentLanding.hero?.stats || []),
            },
            catalog: {
                ...(currentLanding.catalog || {}),
                ...(updateLanding.catalog || {})
            },
            benefits: {
                ...(currentLanding.benefits || {}),
                ...(updateLanding.benefits || {}),
                items: updateLanding.benefits?.items !== undefined ? updateLanding.benefits.items : (currentLanding.benefits?.items || []),
            },
            process: {
                ...(currentLanding.process || {}),
                ...(updateLanding.process || {}),
                steps: updateLanding.process?.steps !== undefined ? updateLanding.process.steps : (currentLanding.process?.steps || []),
            },
            testimonials: {
                ...(currentLanding.testimonials || {}),
                ...(updateLanding.testimonials || {}),
                items: updateLanding.testimonials?.items !== undefined ? updateLanding.testimonials.items : (currentLanding.testimonials?.items || []),
            },
            faq: {
                ...(currentLanding.faq || {}),
                ...(updateLanding.faq || {}),
                items: updateLanding.faq?.items !== undefined ? updateLanding.faq.items : (currentLanding.faq?.items || []),
            },
        };

        const mergedPayment = {
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
        };

        const mergedLabels = {
            ...(currentConfig.labels || {}),
            ...(updates.labels || {})
        };

        const storePrefix = updates.storePrefix || currentConfig.storePrefix || tenantRow?.name?.slice(0, 3).toUpperCase() || 'VEN';

        const namespacesToPersist: [string, Record<string, any>][] = [
            ['business', mergedBusiness],
            ['contact', mergedContact],
            ['landing', mergedLanding],
            ['payment', mergedPayment],
            ['labels', mergedLabels]
        ];

        const statements: D1PreparedStatement[] = [];

        // Inserción/Actualización en tenant_settings (Opción A: Namespaces independientes)
        for (const [namespace, data] of namespacesToPersist) {
            statements.push(
                db.prepare(`
                    INSERT INTO tenant_settings (tenant_id, namespace, data_json, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(tenant_id, namespace) DO UPDATE SET
                        data_json = excluded.data_json,
                        updated_at = CURRENT_TIMESTAMP
                `).bind(tenantId, namespace, JSON.stringify(data))
            );
        }

        // Construir snapshot consolidado para mantener compatibilidad total con SSR y storefront
        const fullConsolidatedConfig = {
            business: mergedBusiness,
            contact: mergedContact,
            landing: mergedLanding,
            payment: mergedPayment,
            labels: mergedLabels,
            storePrefix
        };

        const newName = updates.business?.name || tenantRow?.name || 'Tienda';
        const newTemplate = updates.template || tenantRow?.template || 'restaurant';
        const newWhatsapp = updates.contact?.whatsapp || tenantRow?.whatsapp || null;

        statements.push(
            db.prepare(`
                UPDATE tenants 
                SET name = ?, template = ?, whatsapp = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).bind(newName, newTemplate, newWhatsapp, JSON.stringify(fullConsolidatedConfig), tenantId)
        );

        await db.batch(statements);

        return jsonResponse({
            success: true,
            message: "Configuración de la tienda actualizada con éxito.",
            config: fullConsolidatedConfig
        });
    } catch (err) {
        console.error("Error en PUT /api/settings:", err);
        return jsonResponse({ error: "Error al guardar la configuración de la tienda." }, 500);
    }
};
