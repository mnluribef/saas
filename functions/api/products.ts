// functions/api/products.ts
// Controlador HTTP de Productos - Ventrina SaaS (M-01: Capa Controller)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse, compressedJsonResponse } from "./_helpers";
import { ProductService } from "./_services/product.service";
import type { Env, PagesHandler } from '../types';

export const productSchema = z.object({
    id: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/, "ID inválido. Solo minúsculas, números y guiones."),
    name: z.string().min(2).max(150),
    description: z.string().max(500).optional().default(""),
    price: z.number().min(0).or(z.string().transform(v => parseFloat(v))),
    compare_at_price: z.number().min(0).optional().nullable().or(z.string().transform(v => parseFloat(v) || 0)).default(0),
    category: z.string().default("principales"),
    icon: z.string().max(50).optional().default("package"),
    badge: z.string().max(50).optional().nullable().default(""),
    image_url: z.string().optional().default("/assets/favicon.svg"),
    brand: z.string().max(100).optional().nullable(),
    model: z.string().max(100).optional().nullable(),
    sku: z.string().max(100).optional().nullable().default(""),
    sizes: z.string().max(500).optional().nullable(),
    template: z.string().default("restaurant"),
    stock: z.number().int().min(-1).optional().default(-1),
    active: z.number().int().min(0).max(1).optional().default(1)
});

export type ProductInput = z.infer<typeof productSchema>;

export interface ProductAttribute {
    id: string | number;
    key: string;
    label: string;
    values: string[];
    type: string;
    price_matrix: Record<string, number>;
    required: boolean;
}

export interface ProductItem {
    id: string;
    name: string;
    type_id: string;
    category: string;
    description: string;
    price: number;
    compare_at_price?: number;
    icon: string;
    badge?: string | null;
    image_url: string;
    sizes: string | null;
    template: string;
    stock?: number;
    active: number;
    tenant_id: string;
    brand: string | null;
    model: string | null;
    sku?: string | null;
    created_at?: string;
    attributes?: ProductAttribute[];
}

/**
 * GET /api/products - Consulta individual o catálogo paginado con búsqueda FTS
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db, env.KV);
    const productService = new ProductService(db);

    const url = new URL(request.url);
    const singleId = url.searchParams.get("id");

    if (singleId) {
        const prodRes = await productService.getProduct(singleId, tenantId);
        if (!prodRes.ok) {
            return jsonResponse({ error: prodRes.error }, prodRes.code || 404);
        }
        return jsonResponse(prodRes.data, 200, {
            "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
            "Vary": "X-Tenant-Id",
            "X-Tenant-Id": tenantId
        });
    }

    try {
        const typeId = url.searchParams.get("type");
        const category = url.searchParams.get("category");
        const search = url.searchParams.get("q") || url.searchParams.get("search");

        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "100")));
        const offset = (page - 1) * limit;

        const authUser = await verifySession(context, tenantId);
        const isAdminMode = authUser && authUser.role === 'admin';
        const activeOnly = !isAdminMode;

        const { products, total } = await productService.listProducts({
            tenantId,
            typeId,
            category,
            search,
            activeOnly,
            limit,
            offset
        });

        const cacheControl = isAdminMode
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

        return compressedJsonResponse({
            data: products,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }, 200, {
            "Cache-Control": cacheControl,
            "Vary": "X-Tenant-Id",
            "X-Tenant-Id": tenantId
        });
    } catch (err) {
        console.error("Error en GET /api/products:", err);
        return jsonResponse({ error: "Error interno al consultar productos." }, 500);
    }
};

/**
 * POST /api/products - Admin only: Crear nuevo producto
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const productService = new ProductService(db);
        const createRes = await productService.createProduct(result.data, tenant, tenantId);

        if (!createRes.ok) {
            return jsonResponse({ error: createRes.error }, createRes.code || 400);
        }

        return jsonResponse({ success: true, message: "Producto creado exitosamente." }, 201);
    } catch (err) {
        console.error("Error en POST /api/products:", err);
        return jsonResponse({ error: "Error al guardar el producto." }, 500);
    }
};

/**
 * PUT /api/products - Admin only: Actualizar producto existente
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const productService = new ProductService(db);
        const updateRes = await productService.updateProduct(result.data, tenantId);

        if (!updateRes.ok) {
            return jsonResponse({ error: updateRes.error }, updateRes.code || 404);
        }

        return jsonResponse({ success: true, message: "Producto actualizado exitosamente." });
    } catch (err) {
        console.error("Error en PUT /api/products:", err);
        return jsonResponse({ error: "Error al actualizar producto." }, 500);
    }
};

/**
 * DELETE /api/products - Admin only: Eliminación o archivado masivo o individual
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const ids = url.searchParams.get("ids");
        const permanent = url.searchParams.get("permanent") === "true";

        const productService = new ProductService(db);
        const deleteRes = await productService.deleteProducts({ id, ids, permanent }, tenantId);

        if (!deleteRes.ok) {
            return jsonResponse({ error: deleteRes.error }, deleteRes.code || 400);
        }

        return jsonResponse({ success: true, message: deleteRes.data.message });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return jsonResponse({ error: "Error al eliminar producto." }, 500);
    }
};

/**
 * PATCH /api/products - Admin only: Archivar o reactivar producto (F-08)
 */
export const onRequestPatch: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const action = (url.searchParams.get("action") || "archive") as 'archive' | 'restore';

    if (!id) return jsonResponse({ error: "ID de producto requerido." }, 400);

    const productService = new ProductService(db);
    const toggleRes = await productService.toggleActive(id, action, tenantId);

    if (!toggleRes.ok) {
        return jsonResponse({ error: toggleRes.error }, toggleRes.code || 404);
    }

    return jsonResponse({
        success: true,
        message: toggleRes.data
    });
};
