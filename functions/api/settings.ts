// functions/api/settings.ts
// Controlador HTTP de Configuración de la Tienda (M-01: Capa Controller)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import { SettingsService } from "./_services/settings.service";
import type { Env, PagesHandler } from '../types';

// Validador estricto para evitar inflar SQLite D1 con DataURLs Base64 gigantes
const safeImageString = z.string().max(2000000).refine((val) => {
    if (val && val.startsWith("data:image/")) {
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

export const pagoMovilAccountSchema = z.object({
    id: z.string().max(50).optional(),
    banco: z.string().max(100),
    telefono: z.string().max(50),
    cedula: z.string().max(50),
    titular: z.string().max(100).optional(),
    isDefault: z.boolean().optional(),
});

export const paymentSettingsSchema = z.object({
    pagoMovil: z.object({
        banco: z.string().max(100).optional(),
        telefono: z.string().max(50).optional(),
        cedula: z.string().max(50).optional(),
        titular: z.string().max(100).optional(),
    }).optional(),
    pagoMovilAccounts: z.array(pagoMovilAccountSchema).max(10).optional(),
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
        productDetailViewMode: z.enum(['modal', 'page']).optional().default('modal'),
        productDetailShareBtn: z.enum(['enabled', 'disabled']).optional().default('enabled'),
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
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts', 'grocery']).optional(),
    palette: z.string().max(50).optional().nullable(),
    storePrefix: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/).optional(),
});

export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type HeroStat = z.infer<typeof heroStatSchema>;
export type BenefitItem = z.infer<typeof benefitItemSchema>;
export type ProcessStep = z.infer<typeof processStepSchema>;
export type TestimonialItem = z.infer<typeof testimonialItemSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

/**
 * GET /api/settings - Obtiene la configuración del tenant actual (global o por namespace)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    try {
        const url = new URL(request.url);
        const requestedNamespace = url.searchParams.get("namespace");

        const settingsService = new SettingsService(db);
        const res = await settingsService.getTenantSettingsResponse(tenantId, tenant, requestedNamespace);

        if (!res.ok) {
            return jsonResponse({ error: res.error }, res.code || 500);
        }

        return jsonResponse(res.data, 200, {
            "Cache-Control": "no-store, no-cache, must-revalidate"
        });
    } catch (err) {
        console.error("Error en GET /api/settings:", err);
        return jsonResponse({ error: "Error interno al obtener configuración." }, 500);
    }
};

/**
 * PUT /api/settings - Actualiza la configuración de la tienda por namespaces (Admin Only)
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const body = await request.json();
        const parsed = storeSettingsSchema.safeParse(body);

        if (!parsed.success) {
            return jsonResponse({
                error: "Datos de configuración inválidos",
                details: parsed.error.issues
            }, 400);
        }

        const settingsService = new SettingsService(db);
        const saveRes = await settingsService.updateStoreSettings(
            tenantId,
            parsed.data,
            tenant?.domain,
            env.KV
        );

        if (!saveRes.ok) {
            return jsonResponse({ error: saveRes.error }, saveRes.code || 500);
        }

        return jsonResponse({
            success: true,
            message: saveRes.data.message,
            config: saveRes.data.config
        });
    } catch (err) {
        console.error("Error en PUT /api/settings:", err);
        return jsonResponse({ error: "Error al guardar la configuración de la tienda." }, 500);
    }
};
