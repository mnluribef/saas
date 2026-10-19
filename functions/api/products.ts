// functions/api/products.ts
// Controlador de Catálogo de Productos - Vendly SaaS (Multi-Tenant)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf } from "./_auth";
import { resolveTenant } from "./_tenant";
import { checkProductLimit } from "./_plans";
import { getDB, jsonResponse, compressedJsonResponse } from "./_helpers";
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
                "SELECT * FROM product_attributes WHERE tenant_id = ? AND product_id = ?"
            ).bind(tenantId, singleId).all<RawAttributeRow>();

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

        // F-07: Búsqueda flexible por nombre, descripción, sku o marca
        const searchQuery = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim();
        if (searchQuery) {
            conditions.push("(name LIKE ? OR description LIKE ? OR sku LIKE ? OR brand LIKE ?)");
            const term = `%${searchQuery}%`;
            params.push(term, term, term, term);
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
                `SELECT * FROM product_attributes WHERE tenant_id = ? AND product_id IN (${placeholders})`
            ).bind(tenantId, ...productIds).all<RawAttributeRow>();

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
                product.compare_at_price = product.compare_at_price ? parseFloat(String(product.compare_at_price)) : 0;
                product.sku = product.sku || '';
                product.badge = product.badge || '';
            }
        }

        const cacheControl = isAdminMode
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

        return compressedJsonResponse({
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

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

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

        const { id, name, description, price, compare_at_price, category, icon, badge, image_url, sizes, template, active, brand, model, sku, stock } = result.data;
        const productId = id.toLowerCase().trim();

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(productId, tenantId).first();

        if (existing) {
            return jsonResponse({ error: `El identificador "${productId}" ya está registrado.` }, 400);
        }

        try {
            await db.prepare(
                "INSERT INTO products (id, name, type_id, category, description, price, compare_at_price, icon, badge, image_url, sizes, template, active, tenant_id, brand, model, sku, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(productId, name, category, category, description, price, compare_at_price ?? 0, icon, badge ?? '', image_url, sizes, template, active, tenantId, brand, model, sku ?? '', stock ?? -1).run();
        } catch (dbErr: any) {
            if (String(dbErr).includes('no such column')) {
                await db.prepare(
                    "INSERT INTO products (id, name, type_id, category, description, price, icon, image_url, sizes, template, active, tenant_id, brand, model, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(productId, name, category, category, description, price, icon, image_url, sizes, template, active, tenantId, brand, model, stock ?? -1).run();
            } else {
                throw dbErr;
            }
        }

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
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
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

        const { id, name, description, price, compare_at_price, category, icon, badge, image_url, sizes, template, active, brand, model, sku, stock } = result.data;

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).first();

        if (!existing) {
            return jsonResponse({ error: "Producto no encontrado." }, 404);
        }

        try {
            await db.prepare(
                "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, compare_at_price = ?, icon = ?, badge = ?, image_url = ?, sizes = ?, template = ?, active = ?, brand = ?, model = ?, sku = ?, stock = ? WHERE id = ? AND tenant_id = ?"
            ).bind(name, category, category, description, price, compare_at_price ?? 0, icon, badge ?? '', image_url, sizes, template, active, brand, model, sku ?? '', stock ?? -1, id, tenantId).run();
        } catch (dbErr: any) {
            if (String(dbErr).includes('no such column')) {
                await db.prepare(
                    "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, icon = ?, image_url = ?, sizes = ?, template = ?, active = ?, brand = ?, model = ?, stock = ? WHERE id = ? AND tenant_id = ?"
                ).bind(name, category, category, description, price, icon, image_url, sizes, template, active, brand, model, stock ?? -1, id, tenantId).run();
            } else {
                throw dbErr;
            }
        }

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
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const idsParam = url.searchParams.get("ids");
        const isPermanent = url.searchParams.get("permanent") === "true";

        // Soporte para eliminación o archivado en masa
        if (idsParam) {
            const ids = idsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (ids.length === 0) {
                return jsonResponse({ error: "IDs requeridos para operación masiva." }, 400);
            }
            const placeholders = ids.map(() => '?').join(',');

            if (!isPermanent) {
                // F-08: Soft-delete por defecto para preservar histórico
                await db.prepare(`UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND tenant_id = ?`).bind(...ids, tenantId).run();
                return jsonResponse({ success: true, message: `${ids.length} productos archivados (desactivados).` });
            }

            await db.prepare(`DELETE FROM product_attributes WHERE tenant_id = ? AND product_id IN (${placeholders})`).bind(tenantId, ...ids).run();
            await db.prepare(`DELETE FROM product_variants WHERE tenant_id = ? AND product_id IN (${placeholders})`).bind(tenantId, ...ids).run();
            await db.prepare(`DELETE FROM products WHERE id IN (${placeholders}) AND tenant_id = ?`).bind(...ids, tenantId).run();
            return jsonResponse({ success: true, message: `${ids.length} productos eliminados definitivamente con éxito.` });
        }

        if (!id) {
            return jsonResponse({ error: "ID de producto requerido." }, 400);
        }

        // Verificar que el producto pertenece al tenant
        const existing = await db.prepare("SELECT id FROM products WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first();
        if (!existing) {
            return jsonResponse({ error: "Producto no encontrado en esta tienda." }, 404);
        }

        // F-08: Soft-delete si no es permanente o si tiene referencias históricas en pedidos
        const orderRef = await db.prepare("SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1").bind(id).first();
        if (!isPermanent || orderRef) {
            await db.prepare("UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
            const message = orderRef
                ? "El producto tiene pedidos históricos asociados. Fue archivado (desactivado) para proteger la integridad del historial."
                : "Producto archivado (desactivado) exitosamente.";
            return jsonResponse({ success: true, message });
        }

        await db.batch([
            db.prepare("DELETE FROM product_attributes WHERE tenant_id = ? AND product_id = ?").bind(tenantId, id),
            db.prepare("DELETE FROM product_variants WHERE tenant_id = ? AND product_id = ?").bind(tenantId, id),
            db.prepare("DELETE FROM products WHERE id = ? AND tenant_id = ?").bind(id, tenantId)
        ]);

        return jsonResponse({ success: true, message: "Producto eliminado definitivamente." });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return jsonResponse({ error: "Error al eliminar producto." }, 500);
    }
};

/**
 * PATCH /api/products - Archivar o reactivar producto (F-08)
 */
export const onRequestPatch: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    // S-02: Protección CSRF en mutaciones desde el navegador
    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action") || "archive"; // 'archive' o 'restore'

    if (!id) return jsonResponse({ error: "ID de producto requerido." }, 400);

    const newActive = action === "restore" ? 1 : 0;
    const res = await db.prepare(
        "UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?"
    ).bind(newActive, id, tenantId).run();

    if (!res || res.meta.changes === 0) {
        return jsonResponse({ error: "Producto no encontrado." }, 404);
    }

    return jsonResponse({
        success: true,
        message: action === "restore" ? "Producto reactivado exitosamente." : "Producto archivado exitosamente."
    });
};
