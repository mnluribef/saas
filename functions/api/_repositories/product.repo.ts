// functions/api/_repositories/product.repo.ts
// Acceso a datos y consultas D1 para catálogo de productos, atributos y variantes (M-01)
import type { D1Database } from '@cloudflare/workers-types';
import type { ProductItem, ProductAttribute } from '../products';

export interface RawAttributeRow {
    id: string | number;
    product_id: string;
    attr_key: string;
    attr_label: string;
    attr_values: string;
    attr_type: string | null;
    price_matrix: string | null;
    required: number;
}

export interface ListProductsQuery {
    tenantId: string;
    typeId?: string | null;
    category?: string | null;
    search?: string | null;
    activeOnly?: boolean;
    limit: number;
    offset: number;
}

export class ProductRepository {
    constructor(private db: D1Database) {}

    /**
     * Busca un producto por ID y tenant_id
     */
    async findById(productId: string, tenantId: string): Promise<ProductItem | null> {
        return await this.db.prepare(
            "SELECT * FROM products WHERE tenant_id = ? AND id = ?"
        ).bind(tenantId, productId).first<ProductItem>();
    }

    /**
     * Obtiene los atributos de un producto específico
     */
    async findAttributesByProductId(productId: string, tenantId: string): Promise<ProductAttribute[]> {
        const { results } = await this.db.prepare(
            "SELECT * FROM product_attributes WHERE tenant_id = ? AND product_id = ?"
        ).bind(tenantId, productId).all<RawAttributeRow>();

        return (results || []).map(attr => {
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
    }

    /**
     * Obtiene los atributos de múltiples productos por lista de IDs
     */
    async findAttributesByProductIds(productIds: string[], tenantId: string): Promise<Record<string, ProductAttribute[]>> {
        const attrsMap: Record<string, ProductAttribute[]> = {};
        if (productIds.length === 0) return attrsMap;

        const placeholders = productIds.map(() => '?').join(',');
        const { results: rawAttrs } = await this.db.prepare(
            `SELECT * FROM product_attributes WHERE tenant_id = ? AND product_id IN (${placeholders})`
        ).bind(tenantId, ...productIds).all<RawAttributeRow>();

        for (const pid of productIds) {
            attrsMap[pid] = [];
        }

        if (rawAttrs && Array.isArray(rawAttrs)) {
            for (const attr of rawAttrs) {
                if (!attrsMap[attr.product_id]) attrsMap[attr.product_id] = [];

                let parsedValues: string[] = [];
                try {
                    parsedValues = JSON.parse(attr.attr_values);
                } catch {
                    parsedValues = attr.attr_values?.split(',') || [];
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
        }

        return attrsMap;
    }

    /**
     * Lista productos aplicando filtros de tipo, categoría, búsqueda FTS o LIKE y paginación
     */
    async listProducts(query: ListProductsQuery): Promise<{ products: ProductItem[]; total: number }> {
        const { tenantId, typeId, category, search, activeOnly = true, limit, offset } = query;
        const conditions: string[] = ["tenant_id = ?"];
        const params: (string | number)[] = [tenantId];

        if (typeId) {
            conditions.push("(type_id = ? OR category = ?)");
            params.push(typeId, typeId);
        } else if (category && category !== 'all') {
            conditions.push("(category = ? OR type_id = ?)");
            params.push(category, category);
        }

        if (activeOnly) {
            conditions.push("active = 1");
        }

        let isFtsUsed = false;
        if (search && search.trim()) {
            const rawTerm = search.trim();
            const ftsQuery = rawTerm.split(/\s+/).filter(Boolean).map(term => `"${term.replace(/"/g, '""')}*"`).join(" AND ");

            try {
                const ftsCount = await this.db.prepare(
                    `SELECT COUNT(*) as total FROM products_fts WHERE products_fts MATCH ?`
                ).bind(ftsQuery).first<{ total: number }>();

                if (ftsCount !== null) {
                    isFtsUsed = true;
                    conditions.push(`rowid IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)`);
                    params.push(ftsQuery);
                }
            } catch {
                isFtsUsed = false;
            }

            if (!isFtsUsed) {
                conditions.push("(name LIKE ? OR description LIKE ? OR sku LIKE ? OR brand LIKE ?)");
                const searchPattern = `%${rawTerm}%`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern);
            }
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;

        // Conteo total
        const countRow = await this.db.prepare(
            `SELECT COUNT(*) as total FROM products ${whereClause}`
        ).bind(...params).first<{ total: number }>();
        const total = countRow?.total ?? 0;

        // Lista paginada
        const { results: rawProducts } = await this.db.prepare(
            `SELECT * FROM products ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(...params, limit, offset).all<ProductItem>();

        return {
            products: rawProducts || [],
            total
        };
    }

    /**
     * Inserta un nuevo producto
     */
    async insert(product: Record<string, unknown>, tenantId: string): Promise<void> {
        try {
            await this.db.prepare(`
                INSERT INTO products (
                    id, name, type_id, category, description, price, compare_at_price,
                    icon, badge, image_url, sizes, template, active, tenant_id, brand, model, sku, stock
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                product.id, product.name, product.category, product.category, product.description,
                product.price, product.compare_at_price ?? 0, product.icon, product.badge ?? '',
                product.image_url, product.sizes, product.template, product.active, tenantId,
                product.brand, product.model, product.sku ?? '', product.stock ?? -1
            ).run();
        } catch (dbErr: unknown) {
            if (String(dbErr).includes('no such column')) {
                await this.db.prepare(`
                    INSERT INTO products (
                        id, name, type_id, category, description, price, icon, image_url,
                        sizes, template, active, tenant_id, brand, model, stock
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    product.id, product.name, product.category, product.category, product.description,
                    product.price, product.icon, product.image_url, product.sizes, product.template,
                    product.active, tenantId, product.brand, product.model, product.stock ?? -1
                ).run();
            } else {
                throw dbErr;
            }
        }
    }

    /**
     * Actualiza un producto existente
     */
    async update(id: string, product: Record<string, unknown>, tenantId: string): Promise<void> {
        try {
            await this.db.prepare(`
                UPDATE products SET
                    name = ?, type_id = ?, category = ?, description = ?, price = ?,
                    compare_at_price = ?, icon = ?, badge = ?, image_url = ?, sizes = ?,
                    template = ?, active = ?, brand = ?, model = ?, sku = ?, stock = ?
                WHERE id = ? AND tenant_id = ?
            `).bind(
                product.name, product.category, product.category, product.description,
                product.price, product.compare_at_price ?? 0, product.icon, product.badge ?? '',
                product.image_url, product.sizes, product.template, product.active,
                product.brand, product.model, product.sku ?? '', product.stock ?? -1, id, tenantId
            ).run();
        } catch (dbErr: unknown) {
            if (String(dbErr).includes('no such column')) {
                await this.db.prepare(`
                    UPDATE products SET
                        name = ?, type_id = ?, category = ?, description = ?, price = ?,
                        icon = ?, image_url = ?, sizes = ?, template = ?, active = ?,
                        brand = ?, model = ?, stock = ?
                    WHERE id = ? AND tenant_id = ?
                `).bind(
                    product.name, product.category, product.category, product.description,
                    product.price, product.icon, product.image_url, product.sizes,
                    product.template, product.active, product.brand, product.model,
                    product.stock ?? -1, id, tenantId
                ).run();
            } else {
                throw dbErr;
            }
        }
    }

    /**
     * Soft delete (desactivación / archivado) de uno o varios productos
     */
    async softDelete(ids: string[], tenantId: string): Promise<number> {
        const placeholders = ids.map(() => '?').join(',');
        const res = await this.db.prepare(
            `UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND tenant_id = ?`
        ).bind(...ids, tenantId).run();
        return res?.meta?.changes ?? 0;
    }

    /**
     * Eliminación permanente de productos y sus atributos asociados
     */
    async hardDelete(ids: string[], tenantId: string): Promise<number> {
        const placeholders = ids.map(() => '?').join(',');
        await this.db.batch([
            this.db.prepare(`DELETE FROM product_attributes WHERE tenant_id = ? AND product_id IN (${placeholders})`).bind(tenantId, ...ids),
            this.db.prepare(`DELETE FROM product_variants WHERE tenant_id = ? AND product_id IN (${placeholders})`).bind(tenantId, ...ids),
            this.db.prepare(`DELETE FROM products WHERE id IN (${placeholders}) AND tenant_id = ?`).bind(...ids, tenantId)
        ]);
        return ids.length;
    }

    /**
     * Verifica si un producto tiene pedidos históricos asociados
     */
    async hasOrderReferences(productId: string): Promise<boolean> {
        const ref = await this.db.prepare(
            "SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1"
        ).bind(productId).first();
        return Boolean(ref);
    }

    /**
     * Alterna el estado activo de un producto (F-08)
     */
    async setActiveStatus(id: string, tenantId: string, active: number): Promise<boolean> {
        const res = await this.db.prepare(
            "UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?"
        ).bind(active, id, tenantId).run();
        return Boolean(res && res.meta?.changes && res.meta.changes > 0);
    }
}
