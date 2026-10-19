-- Migration 0013: Índice compuesto para paginación cursor-based eficiente en orders (E-01)
CREATE INDEX IF NOT EXISTS idx_orders_cursor 
ON orders(tenant_id, created_at DESC, id DESC);
