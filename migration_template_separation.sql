-- Migración para separación arquitectónica estricta por plantilla
-- Vendly Multi-Template SaaS

-- 1. Agregar columna template a productos (si no existe)
ALTER TABLE products ADD COLUMN template TEXT NOT NULL DEFAULT 'restaurant';

-- 2. Agregar columna template a categorías (si no existe)
ALTER TABLE product_types ADD COLUMN template TEXT NOT NULL DEFAULT 'restaurant';

-- 3. Agregar columna template a pedidos
ALTER TABLE orders ADD COLUMN template TEXT DEFAULT 'restaurant';

-- 4. Crear índices para optimizar filtrado por plantilla
CREATE INDEX IF NOT EXISTS idx_products_template ON products(template);
CREATE INDEX IF NOT EXISTS idx_product_types_template ON product_types(template);
CREATE INDEX IF NOT EXISTS idx_orders_template ON orders(template);

-- 5. Asignar template a categorías de Ferretería
UPDATE product_types SET template = 'hardware' WHERE id IN (
  'herramientas-electricas', 'herramientas-manuales', 'plomeria', 'electricidad', 'construccion-pinturas'
);

-- 6. Asignar template a productos de Ferretería
UPDATE products SET template = 'hardware' WHERE id IN (
  'taladro-percutor-12v', 'esmeril-angular-4-12', 'juego-llaves-combinadas', 'tuberia-pvc-aguas-blancas', 'cuñete-pintura-blanca'
);

-- 7. Asignar template a categorías de Moda
UPDATE product_types SET template = 'fashion' WHERE id IN (
  'vestidos', 'blusas-tops', 'pantalones-jeans', 'conjuntos', 'accesorios-calzado'
);

-- 8. Asignar template a productos de Moda
UPDATE products SET template = 'fashion' WHERE id IN (
  'vestido-midi-lino', 'blazer-oversize-sastre', 'jeans-wide-leg-rigido', 'top-ribbed-basico'
);

-- 9. Asignar template a categorías de Tecnología
UPDATE product_types SET template = 'tech' WHERE id IN (
  'laptops-pc', 'smartphones-tablets', 'componentes', 'perifericos', 'accesorios-redes'
);

-- 10. Asignar template a productos de Tecnología
UPDATE products SET template = 'tech' WHERE id IN (
  'laptop-intel-i5-16gb', 'ssd-nvme-1tb-gen4', 'teclado-mecanico-rgb', 'monitor-gamer-24-165hz'
);

-- 11. Asignar template a productos y categorías de Restaurante (por coherencia explícita)
UPDATE product_types SET template = 'restaurant' WHERE id IN (
  'entradas', 'principales', 'combos', 'postres', 'bebidas'
);
UPDATE products SET template = 'restaurant' WHERE id IN (
  'pabellon-criollo', 'asado-negro', 'cachapa-queso', 'tequenos-queso', 'empanaditas-degustacion', 'combo-parrillero', 'quesillo-casero', 'tres-leches', 'papelon-limon'
);
