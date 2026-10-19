-- Migración 0004: Cupones de descuento y control de stock
-- Ventrina SaaS

-- 1. Tabla de Cupones / Códigos de Descuento
CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' o 'fixed'
    discount_value REAL NOT NULL,
    min_order_amount REAL DEFAULT 0.0,
    max_uses INTEGER DEFAULT -1, -- -1 = ilimitado
    uses_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at DATETIME,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, code);

-- 2. Columna stock en products (si no existe)
ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT -1;
