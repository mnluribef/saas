-- Migración 0009: Índice en order_items(product_id) para consultas analíticas y reportes eficientes
-- Vendly SaaS

CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
