-- Migración Fase 1: Conversión a SaaS Multi-Tenant
-- Vendly SaaS: Tabla de Tenants + tenant_id en todas las tablas de datos
-- NOTA: La migración 0001 ya fue aplicada. Esta aplica SOLO los cambios de multi-tenancy.

-- 1. Tabla principal de tenants (clientes del SaaS)
CREATE TABLE IF NOT EXISTS tenants (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    plan         TEXT NOT NULL DEFAULT 'basic',
    template     TEXT NOT NULL DEFAULT 'restaurant',
    config_json  TEXT NOT NULL DEFAULT '{}',
    domain       TEXT UNIQUE,
    whatsapp     TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tenant demo/sistema por defecto
INSERT OR IGNORE INTO tenants (id, name, plan, template, config_json)
VALUES ('demo', 'Demo Store', 'pro', 'restaurant', '{}');

-- 2. Columna tenant_id en productos, pedidos, ventas y sesiones
ALTER TABLE products    ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE orders      ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE sales       ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE sessions    ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'demo';

-- 3. Recrear 'settings' para que la PRIMARY KEY sea (tenant_id, key)
CREATE TABLE settings_new (
    key TEXT,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    PRIMARY KEY (tenant_id, key)
);
INSERT INTO settings_new SELECT key, value, updated_at, 'demo' FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

-- 4. Recrear 'users' para que el username sea UNIQUE por tenant
CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    UNIQUE(tenant_id, username)
);
INSERT INTO users_new SELECT id, username, password_hash, password_salt, role, created_at, 'demo' FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 5. Índices para consultas multi-tenant eficientes
CREATE INDEX IF NOT EXISTS idx_products_tenant   ON products(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_orders_tenant     ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant      ON sales(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_settings_tenant   ON settings(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant   ON sessions(tenant_id, token);
CREATE INDEX IF NOT EXISTS idx_tenants_domain    ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_active    ON tenants(active);
