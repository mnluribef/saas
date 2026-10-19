-- Migración 0007: Agregar tenant_id a product_attributes y product_variants para aislamiento multi-tenant
-- Ventrina SaaS

ALTER TABLE product_attributes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE product_variants ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';

CREATE INDEX IF NOT EXISTS idx_product_attributes_tenant_prod ON product_attributes(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_prod ON product_variants(tenant_id, product_id);
