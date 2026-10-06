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
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active, brand, model) VALUES
('taladro-percutor-12v', 'Taladro Percutor Inalámbrico 12V + Maletín', 'herramientas-electricas', 'herramientas-electricas', 48.00, 'zap', 'Taladro con mandril de 3/8", 2 baterías de litio, cargador rápido y juego de 24 accesorios.', '/assets/product_taladro.webp', 'Batería 1.5Ah, Batería 2.0Ah (+8$)', 'hardware', 1, 'DeWalt', 'DCD771C2'),
('esmeril-angular-4-12', 'Esmeril Angular 4-1/2" 850W Industrial', 'herramientas-electricas', 'herramientas-electricas', 42.50, 'zap', 'Motor potente de 11,000 RPM, protector ajustable y mango lateral antivibración.', '/assets/product_esmeril.webp', '110V Estándar, 220V', 'hardware', 1, 'Makita', '9557PBG'),
('juego-llaves-combinadas', 'Juego de Llaves Combinadas Cromo Vanadio (12 Pzas)', 'herramientas-manuales', 'herramientas-manuales', 18.00, 'wrench', 'Medidas milimétricas de 6mm a 22mm forjadas en acero endurecido resistente al óxido.', '/assets/product_llaves.webp', 'Estuche de lona enrollable', 'hardware', 1, 'Stanley', 'STMT71652'),
('tuberia-pvc-aguas-blancas', 'Tubo PVC 1/2" Presión Aguas Blancas (3 metros)', 'plomeria', 'plomeria', 3.50, 'droplet', 'Tubería de alta resistencia con campana para agua potable norma ASTM.', '/assets/product_pvc.webp', 'Tira 3m, Tira 6m (+3$)', 'hardware', 1, 'Tubrica', 'Presión ASTM'),
('cuñete-pintura-blanca', 'Cuñete de Pintura Caucho Mate Blanco Puro (4 Gal)', 'construccion-pinturas', 'construccion-pinturas', 35.00, 'brush', 'Pintura clase A lavable para interiores y exteriores, secado rápido y alto rendimiento.', '/assets/product_pintura.webp', 'Galón (12$), Cuñete 4 Gal (35$)', 'hardware', 1, 'Montana', 'Caucho Mate');

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
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active, brand, model) VALUES
('vestido-midi-lino', 'Vestido Midi en Lino con Escote Espalda', 'vestidos', 'vestidos', 32.00, 'sparkles', 'Vestido fresco en lino natural con caída fluida y lazo ajustable en espalda.', '/assets/product_vestido.webp', 'Talla S, Talla M, Talla L', 'fashion', 1, 'Zara', 'Lino Collection'),
('blazer-oversize-sastre', 'Blazer Oversize Sastre Estructurado', 'conjuntos', 'conjuntos', 45.00, 'layers', 'Blazer con hombreras suaves, forro interno de satén y solapa clásica smoking.', '/assets/product_blazer.webp', 'Color Beige, Color Negro, Color Camel', 'fashion', 1, 'Mango', 'Sastre Premium'),
('jeans-wide-leg-rigido', 'Jeans Wide Leg Tiro Alto Denim Clásico', 'pantalones-jeans', 'pantalones-jeans', 28.00, 'scissors', 'Denim rígido 100% algodón, lavado vintage con bota ancha en tendencia.', '/assets/product_jeans.webp', 'Talla 26, Talla 28, Talla 30, Talla 32', 'fashion', 1, 'Levi''s', 'Wide Leg 501'),
('top-ribbed-basico', 'Top Ribbed Tirantes Espagueti Algodón', 'blusas-tops', 'blusas-tops', 12.00, 'heart', 'Básico indispensable en tejido acanalado con excelente elasticidad y soporte.', '/assets/product_top.webp', 'Blanco, Negro, Nude', 'fashion', 1, 'H&M', 'Basics');

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
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active, brand, model) VALUES
('laptop-intel-i5-16gb', 'Laptop Ultrabook 15.6" Intel Core i5 / 16GB / 512GB SSD', 'laptops-pc', 'laptops-pc', 580.00, 'cpu', 'Pantalla FHD IPS antireflejo, teclado retroiluminado, chasis en aluminio y batería de 8 horas.', '/assets/product_laptop.webp', '512GB SSD, 1TB SSD (+45$)', 'tech', 1, 'Lenovo', 'ThinkPad T14'),
('ssd-nvme-1tb-gen4', 'Unidad de Estado Sólido SSD NVMe 1TB PCIe 4.0', 'componentes', 'componentes', 85.00, 'hard-drive', 'Velocidades ultra rápidas de hasta 7000 MB/s de lectura. Compatible con PC y PS5.', '/assets/product_ssd.webp', '1TB Gen4, 2TB Gen4 (+60$)', 'tech', 1, 'Samsung', '980 PRO'),
('teclado-mecanico-rgb', 'Teclado Mecánico RGB 75% Switch Red Hot-Swap', 'perifericos', 'perifericos', 48.00, 'headphones', 'Conexión inalámbrica triple (Bluetooth, 2.4Ghz y cable USB-C), switches lubricados de fábrica.', '/assets/product_teclado.webp', 'Switches Red (Lineales), Switches Brown (Táctiles)', 'tech', 1, 'Keychron', 'K2 V2'),
('monitor-gamer-24-165hz', 'Monitor Gamer 24" Fast IPS 165Hz 1ms HDR', 'perifericos', 'perifericos', 145.00, 'cpu', 'Resolución FHD 1080p, soporte FreeSync / G-Sync Compatible, bordes ultra delgados.', '/assets/product_monitor.webp', 'Base estándar, Con brazo ergonómico (+25$)', 'tech', 1, 'LG', 'UltraGear 24GN600');

-- =====================================================
-- 4. AUTOPARTES / REPUESTOS (autoparts)
-- =====================================================
-- Categorías Autopartes
INSERT OR IGNORE INTO product_types (id, name, description, icon, template) VALUES
('frenos', 'Frenos y Sistema', 'Pastillas, bandas, discos, ligas y cilindros de freno.', 'shield-check', 'autoparts'),
('motor', 'Componentes de Motor', 'Correas de tiempo, pistones, conchas y empacaduras.', 'settings', 'autoparts'),
('suspension', 'Suspensión y Dirección', 'Amortiguadores, bujes, terminales y muñones.', 'truck', 'autoparts'),
('lubricantes', 'Lubricantes y Fluidos', 'Aceites minerales, sintéticos, valvulinas y refrigerantes.', 'droplet', 'autoparts'),
('electrico', 'Sistema Eléctrico', 'Baterías, alternadores, arranques y bujías.', 'zap', 'autoparts');

-- Productos de Muestra Autopartes
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, template, active, brand, model) VALUES
('pastillas-freno-ceramica', 'Pastillas de Freno de Cerámica EBC', 'frenos', 'frenos', 35.00, 'shield-check', 'Juego de pastillas delanteras de cerámica, alto coeficiente de fricción, sin ruido y bajo polvo. Aplica para modelos Sedán 2015-2023.', '/assets/product_frenos.webp', 'Delanteras, Traseras (+30$)', 'autoparts', 1, 'EBC Brakes', 'Ultimax2'),
('aceite-sintetico-5w40', 'Aceite 100% Sintético Velocita 5W-40 (4 Litros)', 'lubricantes', 'lubricantes', 42.00, 'droplet', 'Lubricante sintético formulado para máxima protección en motores de alto rendimiento y temperaturas extremas.', '/assets/product_aceite.webp', 'Envase 4 Litros, Cuarto (946ml) (12$)', 'autoparts', 1, 'Velocita', '5W-40 SN'),
('amortiguadores-gas', 'Par de Amortiguadores a Gas Heavy Duty', 'suspension', 'suspension', 110.00, 'truck', 'Amortiguadores presurizados con nitrógeno. Mejoran la estabilidad, reducen el rebote y aumentan la seguridad. Incluyen bases.', '/assets/product_suspension.webp', 'Delanteros (Par), Traseros (Par)', 'autoparts', 1, 'Monroe', 'OESpectrum');
