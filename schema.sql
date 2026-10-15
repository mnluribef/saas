-- Esquema Canónico de Base de Datos - Vendly E-commerce SaaS
-- Base de datos D1 estándar para arquitectura Multi-Tenant, catálogo, pedidos, inventario y facturación

-- 1. Tabla de Clientes del SaaS (Tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id           TEXT PRIMARY KEY, -- Slug/identificador (ej: 'fogon', 'mitienda', 'demo')
    name         TEXT NOT NULL,
    plan         TEXT NOT NULL DEFAULT 'basic', -- 'basic', 'pro', 'enterprise'
    template     TEXT NOT NULL DEFAULT 'restaurant', -- 'restaurant', 'hardware', 'fashion', 'tech', 'autoparts'
    config_json  TEXT NOT NULL DEFAULT '{}',
    domain       TEXT UNIQUE,
    whatsapp     TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Tipos de Producto (Categorías del catálogo)
CREATE TABLE IF NOT EXISTS product_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'package',
    template TEXT NOT NULL DEFAULT 'restaurant',
    attributes TEXT DEFAULT '[]'
);

-- 3. Tabla de Productos (con tenant_id y stock)
CREATE TABLE IF NOT EXISTS products (
    id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0.0,
    category TEXT,
    icon TEXT,
    image_url TEXT,
    sizes TEXT,
    type_id TEXT REFERENCES product_types(id),
    brand TEXT,
    model TEXT,
    template TEXT NOT NULL DEFAULT 'restaurant',
    stock INTEGER DEFAULT -1, -- -1 = Ilimitado, >=0 = Stock controlado
    active INTEGER NOT NULL DEFAULT 1,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 4. Tabla de Atributos de Producto por Instancia
CREATE TABLE IF NOT EXISTS product_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    attr_key TEXT NOT NULL,
    attr_label TEXT NOT NULL,
    attr_values TEXT NOT NULL,
    attr_type TEXT DEFAULT 'select',
    price_matrix TEXT DEFAULT '{}',
    required INTEGER DEFAULT 0
);

-- 5. Tabla de Variantes/Opciones de Producto
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    sku TEXT,
    label TEXT NOT NULL,
    price_delta REAL DEFAULT 0.0,
    stock INTEGER DEFAULT -1,
    active INTEGER DEFAULT 1
);

-- 6. Tabla de Cupones / Códigos de Descuento
CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' o 'fixed'
    discount_value REAL NOT NULL, -- Porcentaje (ej: 10 para 10%) o monto fijo USD (ej: 5.00)
    min_order_amount REAL DEFAULT 0.0,
    max_uses INTEGER DEFAULT -1, -- -1 = ilimitado
    uses_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at DATETIME,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);

-- 7. Tabla de Pedidos (Scoped por Tenant)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    delivery_type TEXT NOT NULL DEFAULT 'delivery',
    delivery_address TEXT,
    delivery_notes TEXT,
    payment_method TEXT,
    payment_reference TEXT,
    payment_receipt_url TEXT,
    bcv_rate REAL DEFAULT 0.0,
    total_bs REAL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    total_items INTEGER NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0.0,
    template TEXT DEFAULT 'restaurant',
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Detalles de Pedido (Items)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL DEFAULT 0.0,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 9. Tabla de Ventas Registradas
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    monto REAL NOT NULL DEFAULT 0.0,
    metodo_pago TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 10. Tabla de Usuarios (Aislados por Tenant)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    UNIQUE(tenant_id, username)
);

-- 11. Tabla de Sesiones Activas
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL
);

-- 12. Tabla de Configuraciones del Negocio (Tasa BCV, switches)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT NOT NULL DEFAULT 'demo',
    PRIMARY KEY (tenant_id, key)
);

-- 13. Tabla de Rate Limiting por IP
CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    first_attempt INTEGER NOT NULL,
    lockout_until INTEGER NOT NULL DEFAULT 0
);

-- 14. Tabla de Configuración por Namespaces (Desarticulación del monolito config_json)
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id    TEXT NOT NULL,
    namespace    TEXT NOT NULL, -- 'business', 'contact', 'payment', 'landing', 'labels'
    data_json    TEXT NOT NULL DEFAULT '{}',
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, namespace),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- ÍNDICES PARA OPTIMIZACIÓN MULTI-TENANT
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_tenant       ON products(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_products_template     ON products(template);
CREATE INDEX IF NOT EXISTS idx_orders_tenant         ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant          ON sales(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_users_tenant          ON users(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires      ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant        ON coupons(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_ns    ON tenant_settings(tenant_id, namespace);

-- ============================================================
-- PRECARGA DE DATOS CANÓNICA
-- ============================================================

-- Tenant Demo por Defecto
INSERT OR IGNORE INTO tenants (id, name, plan, template, config_json)
VALUES ('demo', 'Vendly Demo Store', 'pro', 'restaurant', '{}');

-- Settings Iniciales para Demo
INSERT OR IGNORE INTO settings (key, value, tenant_id) VALUES 
('bcv_rate', '853.50', 'demo'),
('bcv_auto_update', '1', 'demo'),
('bcv_updated_at', '1970-01-01 00:00:00', 'demo');

-- Categorías Estándar
INSERT OR IGNORE INTO product_types (id, name, description, icon, template) VALUES
('entradas', 'Entradas y Pasapalos', 'Tequeños, empanaditas y delicias para abrir el apetito.', 'utensils', 'restaurant'),
('principales', 'Platos Principales', 'Pabellón criollo, carnes a la brasa, cachapas y asados.', 'flame', 'restaurant'),
('combos', 'Combos y Promociones', 'La mejor opción para compartir en familia o con amigos.', 'users', 'restaurant'),
('postres', 'Postres Tradicionales', 'Tres leches, quesillo casero y dulces venezolanos.', 'cake', 'restaurant'),
('bebidas', 'Bebidas Típicas', 'Papelón con limón, jugos naturales y refrescos.', 'cup-soda', 'restaurant');

-- Productos Iniciales para Demo
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active, tenant_id, stock) VALUES
('pabellon-criollo', 'Pabellón Criollo Especial', 'principales', 'principales', 12.00, 'utensils', 'Carne mechada tierna y jugosa, caraotas negras con queso blanco rallado, arroz blanco y tajadas de plátano maduro.', '/assets/product_pabellon.webp', 'Carne Mechada, Pollo Mechado', 'restaurant', 1, 'demo', -1),
('asado-negro', 'Asado Negro Tradicional', 'principales', 'principales', 14.50, 'utensils', 'Corte de res cocinado a fuego lento en reducción dulce de papelón y especias. Acompañado de puré de papas y arroz.', '/assets/product_asado_negro.webp', 'Puré de Papas, Arroz y Ensalada', 'restaurant', 1, 'demo', -1),
('cachapa-queso', 'Cachapa con Queso de Mano', 'principales', 'principales', 9.50, 'flame', 'Masa fresca de maíz tierno cocida al budare, rellena con auténtico queso de mano y bañada con mantequilla criolla.', '/assets/product_cachapa.webp', 'Sola, Con Pernil (+3$), Con Carne Mechada (+3$)', 'restaurant', 1, 'demo', -1),
('tequenos-queso', 'Tequeños Tradicionales (6 und)', 'entradas', 'entradas', 6.00, 'utensils', 'Deditos de masa crujiente rellenos con abundante queso llanero fundido. Servidos con salsa tártara de la casa.', '/assets/product_tequenos.webp', '6 unidades, 12 unidades (+5$)', 'restaurant', 1, 'demo', -1),
('empanaditas-degustacion', 'Mini Empanadas Criollas (4 und)', 'entradas', 'entradas', 5.50, 'utensils', 'Degustación de mini empanadas de maíz crujientes: carne mechada, queso llanero, pollo y cazón fresco.', '/assets/product_empanadas.webp', 'Surtidas, Solo Queso, Solo Carne', 'restaurant', 1, 'demo', -1),
('combo-parrillero', 'Combo Parrillero Familiar', 'combos', 'combos', 28.00, 'users', 'Para 3-4 personas: Carne de res a la parrilla, pollo asado, chorizo ahumado, yuca con mojo, ensalada y guasacaca.', '/assets/product_churrasco.webp', 'Familiar 4 personas, Pareja 2 personas (-10$)', 'restaurant', 1, 'demo', -1),
('quesillo-casero', 'Quesillo Tradicional Venezolano', 'postres', 'postres', 4.00, 'cake', 'Postre cremoso a base de huevos, leche condensada y vainilla, cubierto con un rico caramelo dorado hecho a mano.', '/assets/product_quesillo.webp', 'Porción individual', 'restaurant', 1, 'demo', -1),
('tres-leches', 'Torta Tres Leches', 'postres', 'postres', 4.50, 'cake', 'Bizcocho esponjoso empapado en nuestra mezcla especial de tres leches, coronado con merengue suave y canela.', '/assets/product_tres_leches.webp', 'Porción individual', 'restaurant', 1, 'demo', -1),
('papelon-limon', 'Papelón con Limón (500ml)', 'bebidas', 'bebidas', 2.50, 'cup-soda', 'La bebida criolla por excelencia. Panela de papelón disuelta con abundante jugo de limón fresco y mucho hielo.', '/assets/product_papelon_limon.webp', 'Vaso 500ml, Jarra 1.5L (+3$)', 'restaurant', 1, 'demo', -1);
