// functions/api/products.ts
// Controlador de Catálogo de Productos - Vendly SaaS (Multi-Tenant)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { checkProductLimit } from "./_plans";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

function normalizeImageUrl(url: string | null | undefined): string {
    if (!url) return '/assets/favicon.svg';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return '/' + trimmed;
}

export const productSchema = z.object({
    id: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/, "ID inválido. Solo minúsculas, números y guiones."),
    name: z.string().min(2).max(150),
    description: z.string().max(500).optional().default(""),
    price: z.number().min(0).or(z.string().transform(v => parseFloat(v))),
    category: z.string().default("principales"),
    icon: z.string().max(50).optional().default("package"),
    image_url: z.string().optional().default("/assets/favicon.svg"),
    brand: z.string().max(100).optional().nullable(),
    model: z.string().max(100).optional().nullable(),
    sizes: z.string().max(200).optional().nullable(),
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
    icon: string;
    image_url: string;
    sizes: string | null;
    template: string;
    stock?: number;
    active: number;
    tenant_id: string;
    brand: string | null;
    model: string | null;
    created_at?: string;
    attributes?: ProductAttribute[];
}

interface RawAttributeRow {
    id: string | number;
    product_id: string;
    attr_key: string;
    attr_label: string;
    attr_values: string;
    attr_type: string | null;
    price_matrix: string | null;
    required: number;
}

/**
 * GET /api/products
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    const { id: tenantId } = await resolveTenant(request, db);

    const url = new URL(request.url);
    const singleId = url.searchParams.get("id");
    if (singleId) {
        try {
            const singleProduct = await db.prepare(
                "SELECT * FROM products WHERE tenant_id = ? AND id = ?"
            ).bind(tenantId, singleId).first<ProductItem>();

            if (!singleProduct) {
                return jsonResponse({ error: "Producto no encontrado" }, 404);
            }

            const { results: attributes } = await db.prepare(
                "SELECT * FROM product_attributes WHERE product_id = ?"
            ).bind(singleId).all<RawAttributeRow>();

            const parsedAttrs: ProductAttribute[] = (attributes || []).map(attr => {
                let parsedValues: string[] = [];
                try {
                    parsedValues = JSON.parse(attr.attr_values);
                } catch {
                    parsedValues = attr.attr_values?.split(",") || [];
                }

                let parsedPriceMatrix: Record<string, number> = {};
                try {
                    parsedPriceMatrix = JSON.parse(attr.price_matrix || '{}');
                } catch {
                    parsedPriceMatrix = {};
                }

                return {
                    id: attr.id,
                    key: attr.attr_key,
                    label: attr.attr_label,
                    values: parsedValues,
                    type: attr.attr_type || 'select',
                    price_matrix: parsedPriceMatrix,
                    required: attr.required === 1
                };
            });

            singleProduct.attributes = parsedAttrs;
            singleProduct.image_url = normalizeImageUrl(singleProduct.image_url);

            return jsonResponse(singleProduct);
        } catch (err) {
            console.error("Error al obtener producto individual:", err);
            return jsonResponse({ error: "Error al procesar la solicitud" }, 500);
        }
    }

    const isAdminMode = url.searchParams.get("admin") === "true";
    const templateFilter = url.searchParams.get("template");

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    try {
        const conditions: string[] = ["tenant_id = ?"];
        const params: (string | number)[] = [tenantId];

        if (!isAdminMode) {
            conditions.push("active = 1");
        }

        if (templateFilter && templateFilter !== "all") {
            conditions.push("template = ?");
            params.push(templateFilter);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");
        const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
        const dataQuery = `SELECT * FROM products ${whereClause} ORDER BY created_at ${isAdminMode ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`;

        const countRow = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        const dataParams = [...params, limit, offset];
        const { results: rawProducts } = await db.prepare(dataQuery).bind(...dataParams).all<ProductItem>();
        const products = rawProducts || [];

        if (products.length > 0) {
            const productIds = products.map(p => p.id);
            const placeholders = productIds.map(() => '?').join(',');
            const { results: allAttributes } = await db.prepare(
                `SELECT * FROM product_attributes WHERE product_id IN (${placeholders})`
            ).bind(...productIds).all<RawAttributeRow>();

            const attrsMap: Record<string, ProductAttribute[]> = {};
            for (const attr of allAttributes || []) {
                if (!attrsMap[attr.product_id]) attrsMap[attr.product_id] = [];
                let parsedValues: string[] = [];
                try {
                    parsedValues = JSON.parse(attr.attr_values);
                } catch {
                    parsedValues = attr.attr_values?.split(",") || [];
                }

                let parsedPriceMatrix: Record<string, number> = {};
                try {
                    parsedPriceMatrix = JSON.parse(attr.price_matrix || '{}');
                } catch {
                    parsedPriceMatrix = {};
                }

                attrsMap[attr.product_id].push({
                    id: attr.id,
                    key: attr.attr_key,
                    label: attr.attr_label,
                    values: parsedValues,
                    type: attr.attr_type || 'select',
                    price_matrix: parsedPriceMatrix,
                    required: attr.required === 1
                });
            }

            for (const product of products) {
                product.type_id = product.type_id || product.category || 'principales';
                product.category = product.category || product.type_id;
                product.template = product.template || 'restaurant';
                product.attributes = attrsMap[product.id] || [];
                product.image_url = normalizeImageUrl(product.image_url);
                product.stock = product.stock !== undefined && product.stock !== null ? product.stock : -1;
            }
        }

        const cacheControl = isAdminMode
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

        return jsonResponse({
            data: products,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }, 200, {
            "Cache-Control": cacheControl,
            "X-Tenant-Id": tenantId
        });
    } catch (err) {
        console.error("Error en GET /api/products:", err);
        return jsonResponse({ error: "Error interno al consultar productos." }, 500);
    }
};

/**
 * POST /api/products - Admin only
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    // Check Plan Limits
    const limitCheck = await checkProductLimit(db, tenant);
    if (!limitCheck.allowed) {
        return jsonResponse({ 
            error: `Límite de productos alcanzado. Tu plan permite un máximo de ${limitCheck.limit} productos. Por favor actualiza tu plan para añadir más.` 
        }, 403);
    }

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active, brand, model, stock } = result.data;
        const productId = id.toLowerCase().trim();

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(productId, tenantId).first();

        if (existing) {
            return jsonResponse({ error: `El identificador "${productId}" ya está registrado.` }, 400);
        }

        await db.prepare(
            "INSERT INTO products (id, name, type_id, category, description, price, icon, image_url, sizes, template, active, tenant_id, brand, model, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(productId, name, category, category, description, price, icon, image_url, sizes, template, active, tenantId, brand, model, stock ?? -1).run();

        return jsonResponse({ success: true, message: "Producto creado exitosamente." }, 201);
    } catch (err) {
        console.error("Error en POST /api/products:", err);
        return jsonResponse({ error: "Error al guardar el producto." }, 500);
    }
};

/**
 * PUT /api/products - Admin only
 */
export const onRequestPut: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return jsonResponse({ error: "Datos inválidos", details: result.error.issues }, 400);
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active, brand, model, stock } = result.data;

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).first();

        if (!existing) {
            return jsonResponse({ error: "Producto no encontrado." }, 404);
        }

        await db.prepare(
            "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, icon = ?, image_url = ?, sizes = ?, template = ?, active = ?, brand = ?, model = ?, stock = ? WHERE id = ? AND tenant_id = ?"
        ).bind(name, category, category, description, price, icon, image_url, sizes, template, active, brand, model, stock ?? -1, id, tenantId).run();

        return jsonResponse({ success: true, message: "Producto actualizado exitosamente." });
    } catch (err) {
        console.error("Error en PUT /api/products:", err);
        return jsonResponse({ error: "Error al actualizar producto." }, 500);
    }
};

/**
 * DELETE /api/products - Admin only
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return jsonResponse({ error: "ID de producto requerido." }, 400);
        }

        await db.batch([
            db.prepare("DELETE FROM product_attributes WHERE product_id = ?").bind(id),
            db.prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?").bind(id, tenantId)
        ]);

        return jsonResponse({ success: true, message: "Producto eliminado." });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return jsonResponse({ error: "Error al eliminar producto." }, 500);
    }
};
