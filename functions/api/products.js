// functions/api/products.js
// Controlador de Catálogo de Productos - Vendly SaaS (Multi-Tenant)
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth.js";
import { resolveTenant } from "./_tenant.js";
import { checkProductLimit } from "./_plans.js";
import { z } from "zod";

function normalizeImageUrl(url) {
    if (!url) return '/assets/favicon.svg';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return '/' + trimmed;
}

const productSchema = z.object({
    id: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/, "ID inválido. Solo minúsculas, números y guiones."),
    name: z.string().min(2).max(150),
    description: z.string().max(500).optional().default(""),
    price: z.number().min(0).or(z.string().transform(v => parseFloat(v))),
    category: z.string().default("principales"),
    icon: z.string().max(50).optional().default("package"),
    image_url: z.string().url().or(z.string().startsWith("/")).optional().default("/assets/favicon.svg"),
    brand: z.string().max(100).optional().nullable(),
    model: z.string().max(100).optional().nullable(),
    sizes: z.string().max(200).optional().nullable(),
    template: z.string().default("restaurant"),
    active: z.number().int().min(0).max(1).optional().default(1)
});

/**
 * GET /api/products
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;

    const { id: tenantId } = await resolveTenant(request, db);

    const url = new URL(request.url);
    const isAdminMode = url.searchParams.get("admin") === "true";
    const templateFilter = url.searchParams.get("template");

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    try {
        const conditions = ["tenant_id = ?"];
        const params = [tenantId];

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

        const { total } = await db.prepare(countQuery).bind(...params).first();
        const dataParams = [...params, limit, offset];
        const { results: products } = await db.prepare(dataQuery).bind(...dataParams).all();

        if (products.length > 0) {
            const productIds = products.map(p => p.id);
            const placeholders = productIds.map(() => '?').join(',');
            const { results: allAttributes } = await db.prepare(
                `SELECT * FROM product_attributes WHERE product_id IN (${placeholders})`
            ).bind(...productIds).all();

            const attrsMap = {};
            for (const attr of allAttributes) {
                if (!attrsMap[attr.product_id]) attrsMap[attr.product_id] = [];
                let parsedValues = [];
                try { parsedValues = JSON.parse(attr.attr_values); } catch { parsedValues = attr.attr_values?.split(",") || []; }
                let parsedPriceMatrix = {};
                try { parsedPriceMatrix = JSON.parse(attr.price_matrix); } catch { parsedPriceMatrix = {}; }
                attrsMap[attr.product_id].push({
                    id: attr.id, key: attr.attr_key, label: attr.attr_label, values: parsedValues,
                    type: attr.attr_type || 'select', price_matrix: parsedPriceMatrix, required: attr.required === 1
                });
            }

            for (const product of products) {
                product.type_id = product.type_id || product.category || 'principales';
                product.category = product.category || product.type_id;
                product.template = product.template || 'restaurant';
                product.attributes = attrsMap[product.id] || [];
                product.image_url = normalizeImageUrl(product.image_url);
            }
        }

        const cacheControl = isAdminMode
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

        return new Response(JSON.stringify({
            data: products,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": cacheControl,
                "X-Tenant-Id": tenantId
            }
        });
    } catch (err) {
        console.error("Error en GET /api/products:", err);
        return new Response(JSON.stringify({ error: "Error interno al consultar productos." }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /api/products - Admin only
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    // Check Plan Limits
    const limitCheck = await checkProductLimit(db, tenant);
    if (!limitCheck.allowed) {
        return new Response(JSON.stringify({ 
            error: `Límite de productos alcanzado. Tu plan permite un máximo de ${limitCheck.limit} productos. Por favor actualiza tu plan para añadir más.` 
        }), {
            status: 403, headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), {
                status: 400, headers: { "Content-Type": "application/json" }
            });
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active, brand, model } = result.data;
        const productId = id.toLowerCase().trim();

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(productId, tenantId).first();

        if (existing) {
            return new Response(JSON.stringify({ error: `El identificador "${productId}" ya está registrado.` }), {
                status: 400, headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "INSERT INTO products (id, name, type_id, category, description, price, icon, image_url, sizes, template, active, tenant_id, brand, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(productId, name, category, category, description, price, icon, image_url, sizes, template, active, tenantId, brand, model).run();

        return new Response(JSON.stringify({ success: true, message: "Producto creado exitosamente." }), {
            status: 201, headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en POST /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al guardar el producto." }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/products - Admin only
 */
export async function onRequestPut(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const rawData = await request.json();
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), {
                status: 400, headers: { "Content-Type": "application/json" }
            });
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active, brand, model } = result.data;

        const existing = await db.prepare(
            "SELECT id FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).first();

        if (!existing) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404, headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, icon = ?, image_url = ?, sizes = ?, template = ?, active = ?, brand = ?, model = ? WHERE id = ? AND tenant_id = ?"
        ).bind(name, category, category, description, price, icon, image_url, sizes, template, active, brand, model, id, tenantId).run();

        return new Response(JSON.stringify({ success: true, message: "Producto actualizado exitosamente." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en PUT /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar producto." }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/products - Admin only
 */
export async function onRequestDelete(context) {
    const { env, request } = context;
    const db = env.DB || env.vendly;
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "ID de producto requerido." }), {
                status: 400, headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare("DELETE FROM product_attributes WHERE product_id = ?").bind(id).run();
        const result = await db.prepare(
            "DELETE FROM products WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).run();

        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404, headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Producto eliminado." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al eliminar producto." }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }
}
