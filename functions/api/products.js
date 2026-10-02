// Controlador de Catálogo de Productos - Vendly SaaS
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth.js";
import { z } from "zod";

function normalizeImageUrl(url) {
    if (!url) return '/assets/favicon.svg';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return '/' + trimmed;
}

// Zod schemas para validación
const productSchema = z.object({
    id: z.string().min(2, "ID demasiado corto").max(100, "ID demasiado largo").regex(/^[a-z0-9_-]+$/, "ID inválido. Solo minúsculas, números y guiones."),
    name: z.string().min(2, "Nombre requerido").max(150),
    description: z.string().max(500).optional().default(""),
    price: z.number().min(0, "El precio no puede ser negativo").or(z.string().transform(v => parseFloat(v))),
    category: z.string().default("principales"),
    icon: z.string().max(50).optional().default("package"),
    image_url: z.string().url("Debe ser una URL válida").or(z.string().startsWith("/")).optional().default("/assets/favicon.svg"),
    sizes: z.string().max(200).optional().nullable(),
    template: z.string().default("restaurant"),
    active: z.number().int().min(0).max(1).optional().default(1)
});

/**
 * GET /api/products - Listar productos (con Paginación)
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;
    
    const url = new URL(request.url);
    const isAdminMode = url.searchParams.get("admin") === "true";
    const template = url.searchParams.get("template");
    
    // Paginación
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    try {
        let conditions = [];
        let params = [];

        if (!isAdminMode) {
            conditions.push("active = 1");
            if (!template) conditions.push("template = 'restaurant'");
        }
        
        if (template && template !== "all") {
            conditions.push("template = ?");
            params.push(template);
        }

        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
        const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
        const dataQuery = `SELECT * FROM products ${whereClause} ORDER BY created_at ${isAdminMode ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`;

        const countStmt = params.length > 0 ? db.prepare(countQuery).bind(...params) : db.prepare(countQuery);
        const { total } = await countStmt.first();

        const dataParams = [...params, limit, offset];
        const { results: products } = await db.prepare(dataQuery).bind(...dataParams).all();

        // Cargar atributos (optimización: solo para los productos de esta página)
        if (products.length > 0) {
            const productIds = products.map(p => `'${p.id}'`).join(',');
            const { results: allAttributes } = await db.prepare(`SELECT * FROM product_attributes WHERE product_id IN (${productIds})`).all();
            
            const attrsMap = {};
            for (const attr of allAttributes) {
                if (!attrsMap[attr.product_id]) attrsMap[attr.product_id] = [];
                let parsedValues = [];
                try { parsedValues = JSON.parse(attr.attr_values); } catch (e) { parsedValues = attr.attr_values ? attr.attr_values.split(",") : []; }
                let parsedPriceMatrix = {};
                try { parsedPriceMatrix = JSON.parse(attr.price_matrix); } catch (e) { parsedPriceMatrix = {}; }
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
            : "public, max-age=10";

        return new Response(JSON.stringify({
            data: products,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": cacheControl
            }
        });
    } catch (err) {
        console.error("Error en GET /api/products:", err);
        return new Response(JSON.stringify({ error: "Error interno al consultar productos." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /api/products - Agregar nuevo producto (Admin Only)
 */
export async function onRequestPost(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    try {
        const rawData = await request.json();
        
        // Validación con Zod
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active } = result.data;
        const productId = id.toLowerCase().trim();

        // Validar si el ID ya existe
        const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
        if (existing) {
            return new Response(JSON.stringify({ error: `El identificador "${productId}" ya está registrado.` }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "INSERT INTO products (id, name, type_id, category, description, price, icon, image_url, sizes, template, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
            productId, name, category, category, description,
            price, icon, image_url, sizes, template, active
        ).run();

        return new Response(JSON.stringify({ success: true, message: "Producto creado exitosamente." }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en POST /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al guardar el producto." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/products - Modificar producto existente (Admin Only)
 */
export async function onRequestPut(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    try {
        const rawData = await request.json();
        
        // Validación con Zod
        const result = productSchema.safeParse(rawData);
        if (!result.success) {
            return new Response(JSON.stringify({ error: "Datos inválidos", details: result.error.issues }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { id, name, description, price, category, icon, image_url, sizes, template, active } = result.data;

        // Verificar si el producto existe
        const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
        if (!existing) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, icon = ?, image_url = ?, sizes = ?, template = ?, active = ? WHERE id = ?"
        )
        .bind(
            name, category, category, description, price, icon,
            image_url, sizes, template, active, id
        ).run();

        return new Response(JSON.stringify({ success: true, message: "Producto actualizado exitosamente." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en PUT /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar producto." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/products - Eliminar producto (Admin Only)
 */
export async function onRequestDelete(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    const { env, request } = context;
    const db = env.DB || env.vendly;

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "ID de producto requerido." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare("DELETE FROM product_attributes WHERE product_id = ?").bind(id).run();
        const result = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();

        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Producto eliminado." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al eliminar producto." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
