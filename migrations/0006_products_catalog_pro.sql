-- Migración 0006: Catálogo Pro - Precios de comparación, SKU y Badges promocionales
-- Vendly SaaS

ALTER TABLE products ADD COLUMN compare_at_price REAL DEFAULT 0.0;
ALTER TABLE products ADD COLUMN sku TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN badge TEXT DEFAULT '';
