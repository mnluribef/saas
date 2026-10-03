-- =====================================================
-- CARACTERÍSTICAS Y ATRIBUTOS DE PRODUCTOS POR PLANTILLA
-- Ejecutar en D1 remoto y local:
-- wrangler d1 execute vendly-db --remote --file=seed_attributes.sql
-- =====================================================

DELETE FROM product_attributes;

-- =====================================================
-- 1. TECNOLOGÍA (tech)
-- =====================================================
INSERT INTO product_attributes (product_id, attr_key, attr_label, attr_values, attr_type) VALUES
('teclado-mecanico-rgb', 'switch', 'Tipo de Switch', '["Switches Red (Lineales)", "Switches Brown (Táctiles)"]', 'select'),
('laptop-intel-i5-16gb', 'almacenamiento', 'Almacenamiento', '["512GB SSD", "1TB SSD (+45$)"]', 'select'),
('ssd-nvme-1tb-gen4', 'capacidad', 'Capacidad', '["1TB Gen4", "2TB Gen4 (+60$)"]', 'select'),
('monitor-gamer-24-165hz', 'soporte', 'Montura / Soporte', '["Base estándar", "Con brazo ergonómico (+25$)"]', 'select');

-- =====================================================
-- 2. FERRETERÍA (hardware)
-- =====================================================
INSERT INTO product_attributes (product_id, attr_key, attr_label, attr_values, attr_type) VALUES
('taladro-percutor-12v', 'bateria', 'Batería', '["Batería 1.5Ah", "Batería 2.0Ah (+8$)"]', 'select'),
('esmeril-angular-4-12', 'voltaje', 'Voltaje', '["110V Estándar", "220V"]', 'select'),
('juego-llaves-combinadas', 'presentacion', 'Presentación', '["Estuche de lona enrollable"]', 'select'),
('tuberia-pvc-aguas-blancas', 'longitud', 'Longitud', '["Tira 3m", "Tira 6m (+3$)"]', 'select'),
('cuñete-pintura-blanca', 'presentacion', 'Presentación', '["Galón (12$)", "Cuñete 4 Gal (35$)"]', 'select');

-- =====================================================
-- 3. MODA Y ROPA (fashion)
-- =====================================================
INSERT INTO product_attributes (product_id, attr_key, attr_label, attr_values, attr_type) VALUES
('vestido-midi-lino', 'talla', 'Talla', '["Talla S", "Talla M", "Talla L"]', 'select'),
('blazer-oversize-sastre', 'color', 'Color', '["Beige", "Negro", "Camel"]', 'color_swatch'),
('jeans-wide-leg-rigido', 'talla', 'Talla', '["Talla 26", "Talla 28", "Talla 30", "Talla 32"]', 'select'),
('top-ribbed-basico', 'color', 'Color', '["Blanco", "Negro", "Nude"]', 'color_swatch');

-- =====================================================
-- 4. RESTAURANTE / FOGÓN (restaurant)
-- =====================================================
INSERT INTO product_attributes (product_id, attr_key, attr_label, attr_values, attr_type) VALUES
('pabellon-criollo', 'proteina', 'Proteína', '["Carne Mechada", "Pollo Mechado"]', 'select'),
('asado-negro', 'guarnicion', 'Guarnición', '["Puré de Papas", "Arroz y Ensalada"]', 'select'),
('cachapa-queso', 'relleno', 'Relleno', '["Sola", "Con Pernil (+3$)", "Con Carne Mechada (+3$)"]', 'select'),
('tequenos-queso', 'porcion', 'Porción', '["6 unidades", "12 unidades (+5$)"]', 'select'),
('empanaditas-degustacion', 'sabor', 'Sabor', '["Surtidas", "Solo Queso", "Solo Carne"]', 'select'),
('combo-parrillero', 'porcion', 'Porción', '["Familiar 4 personas", "Pareja 2 personas (-10$)"]', 'select'),
('quesillo-casero', 'porcion', 'Porción', '["Porción individual"]', 'select'),
('tres-leches', 'porcion', 'Porción', '["Porción individual"]', 'select'),
('papelon-limon', 'presentacion', 'Presentación', '["Vaso 500ml", "Jarra 1.5L (+3$)"]', 'select');
