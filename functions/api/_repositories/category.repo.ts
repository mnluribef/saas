// functions/api/_repositories/category.repo.ts
// Repositorio para la gestión de categorías del catálogo en Cloudflare D1 (DIP, S-06, P-01)
import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type { TenantRow } from '../../types';

export interface CategoryDefinition {
    id: string;
    name: string;
    icon?: string;
}

export interface CategoryProductCount {
    category: string;
    count: number;
}

export interface CategoriesBatchData {
    productCounts: CategoryProductCount[];
    customJson: string | null;
}

export class CategoryRepository {
    constructor(private db: D1Database) {}

    /**
     * P-01: Obtiene conteo de productos por categoría y configuraciones personalizadas en un solo roundtrip batch D1
     */
    async getCategoriesData(tenantId: string): Promise<CategoriesBatchData> {
        try {
            const [countsRes, customRowRes] = await this.db.batch([
                this.db.prepare(`
                    SELECT category, COUNT(*) as count 
                    FROM products 
                    WHERE tenant_id = ? AND category IS NOT NULL AND TRIM(category) != '' 
                    GROUP BY category 
                    ORDER BY count DESC
                `).bind(tenantId),
                this.db.prepare(
                    "SELECT data_json FROM tenant_settings WHERE tenant_id = ? AND namespace = 'categories'"
                ).bind(tenantId)
            ]);

            const counts = ((countsRes as D1Result<CategoryProductCount>)?.results || []) as CategoryProductCount[];
            const customResults = ((customRowRes as D1Result<{ data_json: string }>)?.results || []);
            const customJson = customResults.length > 0 ? customResults[0].data_json : null;

            return {
                productCounts: counts,
                customJson
            };
        } catch {
            // Fallback defensivo en caso de error en batch
            const counts = await this.getProductCategoryCounts(tenantId);
            const customJson = await this.getCustomCategoriesJson(tenantId);
            return { productCounts: counts, customJson };
        }
    }

    /**
     * Obtiene el conteo agrupado de productos por categoría
     */
    async getProductCategoryCounts(tenantId: string): Promise<CategoryProductCount[]> {
        const { results } = await this.db.prepare(`
            SELECT category, COUNT(*) as count 
            FROM products 
            WHERE tenant_id = ? AND category IS NOT NULL AND TRIM(category) != '' 
            GROUP BY category 
            ORDER BY count DESC
        `).bind(tenantId).all<CategoryProductCount>();
        return results || [];
    }

    /**
     * Obtiene el JSON crudo de categorías desde tenant_settings
     */
    async getCustomCategoriesJson(tenantId: string): Promise<string | null> {
        try {
            const row = await this.db.prepare(
                "SELECT data_json FROM tenant_settings WHERE tenant_id = ? AND namespace = 'categories'"
            ).bind(tenantId).first<{ data_json: string }>();
            return row?.data_json || null;
        } catch {
            return null;
        }
    }

    /**
     * Cuenta la cantidad de productos vinculados a un slug de categoría
     */
    async countProductsByCategory(tenantId: string, slug: string): Promise<number> {
        const countRow = await this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM products 
            WHERE (category = ? OR type_id = ?) AND tenant_id = ?
        `).bind(slug, slug, tenantId).first<{ count: number }>();
        return Number(countRow?.count) || 0;
    }

    /**
     * Renombra o reasigna una categoría en todos los productos del tenant
     */
    async updateProductsCategory(tenantId: string, oldSlug: string, newSlug: string): Promise<number> {
        const updateResult = await this.db.prepare(`
            UPDATE products 
            SET category = ?, type_id = ? 
            WHERE (category = ? OR type_id = ?) AND tenant_id = ?
        `).bind(newSlug, newSlug, oldSlug, oldSlug, tenantId).run();
        return updateResult.meta?.changes ?? 0;
    }

    /**
     * Sincroniza las definiciones de categorías en tenant_settings y tenants.config_json de forma fuertemente tipada (S-06)
     */
    async saveCustomCategories(
        tenantId: string,
        tenant: TenantRow | null,
        categories: CategoryDefinition[]
    ): Promise<void> {
        try {
            await this.db.prepare(`
                INSERT INTO tenant_settings (tenant_id, namespace, data_json, updated_at)
                VALUES (?, 'categories', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(tenant_id, namespace) DO UPDATE SET
                    data_json = excluded.data_json,
                    updated_at = CURRENT_TIMESTAMP
            `).bind(tenantId, JSON.stringify(categories)).run();
        } catch (e) {
            console.warn("No se pudo escribir en tenant_settings(categories):", e);
        }

        try {
            let currentConfig: Record<string, unknown> = {};
            if (tenant?.config_json) {
                try {
                    currentConfig = JSON.parse(tenant.config_json) as Record<string, unknown>;
                } catch {}
            }
            currentConfig.categories = categories;
            await this.db.prepare(
                "UPDATE tenants SET config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(JSON.stringify(currentConfig), tenantId).run();
        } catch (e) {
            console.warn("No se pudo actualizar tenants.config_json(categories):", e);
        }
    }
}
