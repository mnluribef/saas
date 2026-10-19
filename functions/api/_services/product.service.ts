// functions/api/_services/product.service.ts
// Lógica de negocio para catálogo de productos, límites de plan y normalización (M-01)
import type { D1Database } from '@cloudflare/workers-types';
import { ProductRepository, type ListProductsQuery } from '../_repositories/product.repo';
import { checkProductLimit } from '../_plans';
import { ok, err, type Result } from '../_result';
import type { ProductItem, ProductInput } from '../products';
import type { TenantRow } from '../../types';

export function normalizeImageUrl(url: string | null | undefined): string {
    if (!url) return '/assets/favicon.svg';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return '/' + trimmed;
}

export class ProductService {
    private repo: ProductRepository;

    constructor(private db: D1Database) {
        this.repo = new ProductRepository(db);
    }

    /**
     * Obtiene un producto individual junto a sus atributos y precios variables
     */
    async getProduct(productId: string, tenantId: string): Promise<Result<ProductItem, string>> {
        const product = await this.repo.findById(productId, tenantId);
        if (!product) {
            return err("Producto no encontrado", 404);
        }

        const attributes = await this.repo.findAttributesByProductId(productId, tenantId);
        product.attributes = attributes;
        product.image_url = normalizeImageUrl(product.image_url);
        product.stock = product.stock !== undefined && product.stock !== null ? product.stock : -1;
        product.compare_at_price = product.compare_at_price ? parseFloat(String(product.compare_at_price)) : 0;
        product.sku = product.sku || '';
        product.badge = product.badge || '';

        return ok(product);
    }

    /**
     * Lista productos con soporte de atributos por lote y formato limpio
     */
    async listProducts(query: ListProductsQuery): Promise<{ products: ProductItem[]; total: number }> {
        const { products, total } = await this.repo.listProducts(query);

        if (products.length > 0) {
            const productIds = products.map(p => p.id);
            const attrsMap = await this.repo.findAttributesByProductIds(productIds, query.tenantId);

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

        return { products, total };
    }

    /**
     * Valida límites de plan y registra un nuevo producto
     */
    async createProduct(input: ProductInput, tenant: TenantRow | null, tenantId: string): Promise<Result<{ id: string }, string>> {
        // Validar límite del plan del tenant
        const limitCheck = await checkProductLimit(this.db, tenant);
        if (!limitCheck.allowed) {
            return err(
                `Límite de productos alcanzado. Tu plan permite un máximo de ${limitCheck.limit} productos. Por favor actualiza tu plan para añadir más.`,
                403
            );
        }

        const productId = input.id.toLowerCase().trim();
        const existing = await this.repo.findById(productId, tenantId);
        if (existing) {
            return err(`El identificador "${productId}" ya está registrado.`, 400);
        }

        await this.repo.insert(input, tenantId);
        return ok({ id: productId });
    }

    /**
     * Actualiza un producto existente
     */
    async updateProduct(input: ProductInput, tenantId: string): Promise<Result<boolean, string>> {
        const existing = await this.repo.findById(input.id, tenantId);
        if (!existing) {
            return err("Producto no encontrado.", 404);
        }

        await this.repo.update(input.id, input, tenantId);
        return ok(true);
    }

    /**
     * Elimina productos de forma segura (soft-delete si tienen pedidos o hard-delete si no)
     */
    async deleteProducts(
        params: { id?: string | null; ids?: string | null; permanent?: boolean },
        tenantId: string
    ): Promise<Result<{ message: string; affectedCount?: number }, string>> {
        const { id, ids: idsParam, permanent } = params;

        // Operación masiva
        if (idsParam) {
            const ids = idsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (ids.length === 0) {
                return err("IDs requeridos para operación masiva.", 400);
            }

            if (!permanent) {
                const count = await this.repo.softDelete(ids, tenantId);
                return ok({ message: `${count} productos archivados (desactivados).`, affectedCount: count });
            }

            const count = await this.repo.hardDelete(ids, tenantId);
            return ok({ message: `${count} productos eliminados definitivamente con éxito.`, affectedCount: count });
        }

        if (!id) {
            return err("ID de producto requerido.", 400);
        }

        const existing = await this.repo.findById(id, tenantId);
        if (!existing) {
            return err("Producto no encontrado en esta tienda.", 404);
        }

        const hasRefs = await this.repo.hasOrderReferences(id);
        if (!permanent || hasRefs) {
            await this.repo.softDelete([id], tenantId);
            const message = hasRefs
                ? "El producto tiene pedidos históricos asociados. Fue archivado (desactivado) para proteger la integridad del historial."
                : "Producto archivado (desactivado) exitosamente.";
            return ok({ message });
        }

        await this.repo.hardDelete([id], tenantId);
        return ok({ message: "Producto eliminado definitivamente." });
    }

    /**
     * Reactiva o archiva un producto cambiando su flag active
     */
    async toggleActive(id: string, action: 'archive' | 'restore', tenantId: string): Promise<Result<string, string>> {
        const newActive = action === 'restore' ? 1 : 0;
        const updated = await this.repo.setActiveStatus(id, tenantId, newActive);
        if (!updated) {
            return err("Producto no encontrado.", 404);
        }
        return ok(action === 'restore' ? "Producto reactivado exitosamente." : "Producto archivado exitosamente.");
    }
}
