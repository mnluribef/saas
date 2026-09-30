-- =====================================================
-- SEMILLAS SQL PARA PLANTILLAS MULTI-TIENDA
-- Ejecutar según la plantilla seleccionada en D1:
-- wrangler d1 execute vendly-db --local --file=seed_templates.sql
-- =====================================================

-- =====================================================
-- 1. FERRETERÍA (hardware)
-- =====================================================
-- Categorías Ferretería
INSERT OR IGNORE INTO product_types (id, name, description, icon, template) VALUES
('herramientas-electricas', 'Herramientas Eléctricas', 'Taladros, esmeriles, sierras circulares y rotomartillos.', 'zap', 'hardware'),
('herramientas-manuales', 'Herramientas Manuales', 'Juegos de llaves, destornilladores, alicates y martillos.', 'wrench', 'hardware'),
('plomeria', 'Plomería y Tuberías', 'Tubos PVC, llaves de paso, pegamentos y conexiones.', 'droplet', 'hardware'),
('electricidad', 'Electricidad e Iluminación', 'Cables THW, breakers, tomacorrientes y reflectores LED.', 'sun', 'hardware'),
('construccion-pinturas', 'Construcción y Pinturas', 'Pinturas de caucho, esmaltes, brochas y cemento.', 'brush', 'hardware');

-- Productos de Muestra Ferretería
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active) VALUES
('taladro-percutor-12v', 'Taladro Percutor Inalámbrico 12V + Maletín', 'herramientas-electricas', 'herramientas-electricas', 48.00, 'zap', 'Taladro con mandril de 3/8", 2 baterías de litio, cargador rápido y juego de 24 accesorios.', 'assets/product_taladro.jpg', 'Batería 1.5Ah, Batería 2.0Ah (+8$)', 'hardware', 1),
('esmeril-angular-4-12', 'Esmeril Angular 4-1/2" 850W Industrial', 'herramientas-electricas', 'herramientas-electricas', 42.50, 'zap', 'Motor potente de 11,000 RPM, protector ajustable y mango lateral antivibración.', 'assets/product_esmeril.jpg', '110V Estándar, 220V', 'hardware', 1),
('juego-llaves-combinadas', 'Juego de Llaves Combinadas Cromo Vanadio (12 Pzas)', 'herramientas-manuales', 'herramientas-manuales', 18.00, 'wrench', 'Medidas milimétricas de 6mm a 22mm forjadas en acero endurecido resistente al óxido.', 'assets/product_llaves.jpg', 'Estuche de lona enrollable', 'hardware', 1),
('tuberia-pvc-aguas-blancas', 'Tubo PVC 1/2" Presión Aguas Blancas (3 metros)', 'plomeria', 'plomeria', 3.50, 'droplet', 'Tubería de alta resistencia con campana para agua potable norma ASTM.', 'assets/product_pvc.jpg', 'Tira 3m, Tira 6m (+3$)', 'hardware', 1),
('cuñete-pintura-blanca', 'Cuñete de Pintura Caucho Mate Blanco Puro (4 Gal)', 'construccion-pinturas', 'construccion-pinturas', 35.00, 'brush', 'Pintura clase A lavable para interiores y exteriores, secado rápido y alto rendimiento.', 'assets/product_pintura.jpg', 'Galón (12$), Cuñete 4 Gal (35$)', 'hardware', 1);

-- =====================================================
-- 2. TIENDA DE ROPA / MODA (fashion)
-- =====================================================
-- Categorías Ropa
INSERT OR IGNORE INTO product_types (id, name, description, icon, template) VALUES
('vestidos', 'Vestidos & Enterizos', 'Diseños casuales, midi, cóctel y vestidos playeros.', 'sparkles', 'fashion'),
('blusas-tops', 'Blusas & Tops', 'Crop tops, blusas de lino, camisas oversize y básicos.', 'heart', 'fashion'),
('pantalones-jeans', 'Pantalones & Jeans', 'Jeans wide leg, pantalones sastre, shorts y faldas.', 'scissors', 'fashion'),
('conjuntos', 'Conjuntos & Sets', 'Sets coordinados de 2 y 3 piezas para toda ocasión.', 'layers', 'fashion'),
('accesorios-calzado', 'Calzado & Accesorios', 'Carteras, cinturones, calzado de temporada y joyería.', 'tag', 'fashion');

-- Productos de Muestra Ropa
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active) VALUES
('vestido-midi-lino', 'Vestido Midi en Lino con Escote Espalda', 'vestidos', 'vestidos', 32.00, 'sparkles', 'Vestido fresco en lino natural con caída fluida y lazo ajustable en espalda.', 'assets/product_vestido.jpg', 'Talla S, Talla M, Talla L', 'fashion', 1),
('blazer-oversize-sastre', 'Blazer Oversize Sastre Estructurado', 'conjuntos', 'conjuntos', 45.00, 'layers', 'Blazer con hombreras suaves, forro interno de satén y solapa clásica smoking.', 'assets/product_blazer.jpg', 'Color Beige, Color Negro, Color Camel', 'fashion', 1),
('jeans-wide-leg-rigido', 'Jeans Wide Leg Tiro Alto Denim Clásico', 'pantalones-jeans', 'pantalones-jeans', 28.00, 'scissors', 'Denim rígido 100% algodón, lavado vintage con bota ancha en tendencia.', 'assets/product_jeans.jpg', 'Talla 26, Talla 28, Talla 30, Talla 32', 'fashion', 1),
('top-ribbed-basico', 'Top Ribbed Tirantes Espagueti Algodón', 'blusas-tops', 'blusas-tops', 12.00, 'heart', 'Básico indispensable en tejido acanalado con excelente elasticidad y soporte.', 'assets/product_top.jpg', 'Blanco, Negro, Nude', 'fashion', 1);

-- =====================================================
-- 3. TIENDA DE TECNOLOGÍA (tech)
-- =====================================================
-- Categorías Tecnología
INSERT OR IGNORE INTO product_types (id, name, description, icon, template) VALUES
('laptops-pc', 'Laptops & Computadoras', 'Laptops para trabajo, estudio, programación y gaming.', 'cpu', 'tech'),
('smartphones-tablets', 'Smartphones & Tablets', 'Dispositivos iOS y Android sellados con garantía.', 'smartphone', 'tech'),
('componentes', 'Componentes de PC', 'Tarjetas de video, procesadores, RAM y unidades SSD.', 'hard-drive', 'tech'),
('perifericos', 'Periféricos & Audio', 'Teclados mecánicos, ratones gamer y auriculares.', 'headphones', 'tech'),
('accesorios-redes', 'Accesorios & Conectividad', 'Routers Wi-Fi 6, cargadores GaN y cables de alta velocidad.', 'wifi', 'tech');

-- Productos de Muestra Tecnología
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active) VALUES
('laptop-intel-i5-16gb', 'Laptop Ultrabook 15.6" Intel Core i5 / 16GB / 512GB SSD', 'laptops-pc', 'laptops-pc', 580.00, 'cpu', 'Pantalla FHD IPS antireflejo, teclado retroiluminado, chasis en aluminio y batería de 8 horas.', 'assets/product_laptop.jpg', '512GB SSD, 1TB SSD (+45$)', 'tech', 1),
('ssd-nvme-1tb-gen4', 'Unidad de Estado Sólido SSD NVMe 1TB PCIe 4.0', 'componentes', 'componentes', 85.00, 'hard-drive', 'Velocidades ultra rápidas de hasta 7000 MB/s de lectura. Compatible con PC y PS5.', 'assets/product_ssd.jpg', '1TB Gen4, 2TB Gen4 (+60$)', 'tech', 1),
('teclado-mecanico-rgb', 'Teclado Mecánico RGB 75% Switch Red Hot-Swap', 'perifericos', 'perifericos', 48.00, 'headphones', 'Conexión inalámbrica triple (Bluetooth, 2.4Ghz y cable USB-C), switches lubricados de fábrica.', 'assets/product_teclado.jpg', 'Switches Red (Lineales), Switches Brown (Táctiles)', 'tech', 1),
('monitor-gamer-24-165hz', 'Monitor Gamer 24" Fast IPS 165Hz 1ms HDR', 'perifericos', 'perifericos', 145.00, 'cpu', 'Resolución FHD 1080p, soporte FreeSync / G-Sync Compatible, bordes ultra delgados.', 'assets/product_monitor.jpg', 'Base estándar, Con brazo ergonómico (+25$)', 'tech', 1);
