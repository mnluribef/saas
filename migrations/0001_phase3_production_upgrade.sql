-- Migración Fase 3: Preparación para Producción
-- Vendly SaaS: Roles (RBAC), Almacenamiento R2 e Índices de Paginación

-- 1. Agregar columna 'role' para control de acceso basado en roles
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';

-- 2. Agregar columna 'payment_receipt_url' para almacenar URLs de comprobantes en Cloudflare R2
ALTER TABLE orders ADD COLUMN payment_receipt_url TEXT;

-- 3. Índices de optimización para consultas paginadas y filtros
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_fecha ON sales(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_products_template ON products(template);
