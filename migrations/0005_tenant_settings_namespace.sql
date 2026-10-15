-- Migración 0005: Desarticulación del monolito config_json en namespaces modulares
-- Vendly SaaS

-- 1. Tabla de Configuración por Namespaces (business, contact, payment, landing, labels)
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id TEXT NOT NULL,
    namespace TEXT NOT NULL, -- 'business', 'contact', 'payment', 'landing', 'labels'
    data_json TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, namespace),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id, namespace);
