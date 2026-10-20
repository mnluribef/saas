// functions/api/categories.ts
// Gestor Central de Categorías del Catálogo - Ventrina SaaS (DIP, S-06, P-01)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import { CategoryRepository } from "./_repositories";
import type { Env, PagesHandler } from '../types';

export interface CategoryItem {
    id: string;
    name: string;
    icon?: string;
    count: number;
}

const createCategorySchema = z.object({
    id: z.string().min(2, "El slug debe tener al menos 2 caracteres").max(80).regex(/^[a-z0-9_-]+$/, "El slug solo puede contener letras minúsculas, números y guiones."),
    name: z.string().min(2, "El nombre visible debe tener al menos 2 caracteres").max(100),
    icon: z.string().max(50).optional().default("tag")
});

const renameCategorySchema = z.object({
    oldCategory: z.string().min(1, "Categoría actual requerida"),
    newCategory: z.string().min(2, "El nuevo slug debe tener al menos 2 caracteres").max(80).regex(/^[a-z0-9_-]+$/, "El slug solo puede contener letras minúsculas, números y guiones."),
    name: z.string().min(2, "El nombre visible debe tener al menos 2 caracteres").max(100).optional(),
    icon: z.string().max(50).optional()
});

const deleteCategorySchema = z.object({
    category: z.string().min(1, "Categoría a eliminar requerida"),
    reassignTo: z.string().optional()
});

function formatCategoryName(slug: string): string {
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * GET /api/categories
 * Retorna las categorías activas en los productos del tenant con su conteo en tiempo real,
 * fusionadas con las definiciones personalizadas (nombres visibles, emojis e iconos).
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    try {
        const categoryRepo = new CategoryRepository(db);

        // P-01: Obtener conteo y metadata en una sola llamada batch a D1
        const { productCounts, customJson } = await categoryRepo.getCategoriesData(tenantId);

        let customCategories: Array<{ id: string; name: string; icon?: string }> = [];
        if (customJson) {
            try {
                customCategories = JSON.parse(customJson);
            } catch {}
        }

        if ((!customCategories || customCategories.length === 0) && tenant?.config_json) {
            try {
                const cfg = JSON.parse(tenant.config_json);
                if (Array.isArray(cfg.categories)) {
                    customCategories = cfg.categories;
                }
            } catch {}
        }

        const customMap = new Map<string, { id: string; name: string; icon?: string }>();
        if (Array.isArray(customCategories)) {
            customCategories.forEach(c => {
                if (c && c.id) {
                    customMap.set(c.id.toLowerCase().trim(), c);
                }
            });
        }

        const categoriesMap = new Map<string, CategoryItem>();

        // Agregar las que tienen productos asignados
        if (productCounts && Array.isArray(productCounts)) {
            for (const pc of productCounts) {
                const slug = pc.category.toLowerCase().trim();
                const custom = customMap.get(slug);
                categoriesMap.set(slug, {
                    id: slug,
                    name: custom?.name || formatCategoryName(slug),
                    icon: custom?.icon || 'tag',
                    count: Number(pc.count) || 0
                });
            }
        }

        // Agregar las categorías personalizadas creadas que tengan 0 productos
        for (const [slug, custom] of customMap.entries()) {
            if (!categoriesMap.has(slug)) {
                categoriesMap.set(slug, {
                    id: slug,
                    name: custom.name || formatCategoryName(slug),
                    icon: custom.icon || 'tag',
                    count: 0
                });
            }
        }

        const categories = Array.from(categoriesMap.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        // F-05: Caché pública en CDN y navegador para storefront (120s), evitando queries recurrentes a D1
        const authUser = await verifySession(context, tenantId);
        const cacheControl = authUser
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=120, stale-while-revalidate=60";

        return jsonResponse({
            success: true,
            tenantId,
            categories
        }, 200, { "Cache-Control": cacheControl });

    } catch (err: unknown) {
        console.error("Error en GET /api/categories:", err);
        return jsonResponse({ error: "Error al obtener las categorías del catálogo." }, 500);
    }
};

/**
 * POST /api/categories
 * Crea una nueva categoría para la tienda (Admin only)
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const body = await request.json();
        const parseResult = createCategorySchema.safeParse(body);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos inválidos", details: parseResult.error.issues }, 400);
        }

        const { id, name, icon } = parseResult.data;
        const slug = id.toLowerCase().trim();
        const categoryRepo = new CategoryRepository(db);

        // Cargar categorías existentes
        let customCategories: Array<{ id: string; name: string; icon?: string }> = [];
        const customJson = await categoryRepo.getCustomCategoriesJson(tenantId);
        if (customJson) {
            try {
                customCategories = JSON.parse(customJson);
            } catch {}
        }

        if (!Array.isArray(customCategories)) customCategories = [];

        const existingIdx = customCategories.findIndex(c => c.id === slug);
        if (existingIdx >= 0) {
            customCategories[existingIdx] = { id: slug, name, icon: icon || 'tag' };
        } else {
            customCategories.push({ id: slug, name, icon: icon || 'tag' });
        }

        await categoryRepo.saveCustomCategories(tenantId, tenant, customCategories);

        return jsonResponse({
            success: true,
            message: `Categoría "${name}" creada con éxito.`,
            category: { id: slug, name, icon: icon || 'tag', count: 0 }
        }, 201);

    } catch (err: unknown) {
        console.error("Error en POST /api/categories:", err);
        return jsonResponse({ error: "Error al crear la categoría." }, 500);
    }
};

/**
 * PUT /api/categories
 * Renombra una categoría globalmente en todos los productos vinculados y actualiza su metadata
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const body = await request.json();
        const parseResult = renameCategorySchema.safeParse(body);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos inválidos", details: parseResult.error.issues }, 400);
        }

        const { oldCategory, newCategory, name, icon } = parseResult.data;
        const oldSlug = oldCategory.trim();
        const newSlug = newCategory.toLowerCase().trim();
        const displayName = name || formatCategoryName(newSlug);

        const categoryRepo = new CategoryRepository(db);

        // 1. Actualizar atómicamente todos los productos de este tenant que tengan esta categoría
        const affectedCount = await categoryRepo.updateProductsCategory(tenantId, oldSlug, newSlug);

        // 2. Actualizar configuración persistida
        let customCategories: Array<{ id: string; name: string; icon?: string }> = [];
        const customJson = await categoryRepo.getCustomCategoriesJson(tenantId);
        if (customJson) {
            try {
                customCategories = JSON.parse(customJson);
            } catch {}
        }

        if (!Array.isArray(customCategories)) customCategories = [];

        const oldIdx = customCategories.findIndex(c => c.id === oldSlug);
        if (oldIdx >= 0) {
            customCategories[oldIdx] = {
                id: newSlug,
                name: displayName,
                icon: icon || customCategories[oldIdx].icon || 'tag'
            };
        } else {
            customCategories.push({
                id: newSlug,
                name: displayName,
                icon: icon || 'tag'
            });
        }

        await categoryRepo.saveCustomCategories(tenantId, tenant, customCategories);

        return jsonResponse({
            success: true,
            message: `Categoría actualizada a "${displayName}". Se actualizaron ${affectedCount} producto(s).`,
            affectedProducts: affectedCount,
            category: { id: newSlug, name: displayName, icon: icon || 'tag' }
        }, 200);

    } catch (err: unknown) {
        console.error("Error en PUT /api/categories:", err);
        return jsonResponse({ error: "Error al actualizar la categoría." }, 500);
    }
};

/**
 * DELETE /api/categories
 * Elimina una categoría o reasigna sus productos a otra categoría existente
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const body = await request.json();
        const parseResult = deleteCategorySchema.safeParse(body);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos inválidos", details: parseResult.error.issues }, 400);
        }

        const { category, reassignTo } = parseResult.data;
        const targetSlug = category.trim();
        const fallbackSlug = reassignTo?.toLowerCase().trim();
        const categoryRepo = new CategoryRepository(db);

        // Verificar si la categoría tiene productos
        const productCount = await categoryRepo.countProductsByCategory(tenantId, targetSlug);

        if (productCount > 0) {
            if (!fallbackSlug || fallbackSlug === targetSlug) {
                return jsonResponse({
                    error: `La categoría "${targetSlug}" tiene ${productCount} producto(s) asignado(s). Selecciona una categoría de destino para reasignarlos antes de eliminarla.`
                }, 400);
            }

            // Reasignar productos a la categoría destino
            await categoryRepo.updateProductsCategory(tenantId, targetSlug, fallbackSlug);
        }

        // Eliminar de las definiciones personalizadas
        let customCategories: Array<{ id: string; name: string; icon?: string }> = [];
        const customJson = await categoryRepo.getCustomCategoriesJson(tenantId);
        if (customJson) {
            try {
                customCategories = JSON.parse(customJson);
            } catch {}
        }

        if (Array.isArray(customCategories)) {
            customCategories = customCategories.filter(c => c.id !== targetSlug);
            await categoryRepo.saveCustomCategories(tenantId, tenant, customCategories);
        }

        return jsonResponse({
            success: true,
            message: productCount > 0 
                ? `Categoría eliminada. Se reasignaron ${productCount} producto(s) a "${fallbackSlug}".`
                : `Categoría eliminada con éxito.`,
            reassignedCount: productCount
        }, 200);

    } catch (err: unknown) {
        console.error("Error en DELETE /api/categories:", err);
        return jsonResponse({ error: "Error al eliminar la categoría." }, 500);
    }
};
