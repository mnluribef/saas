// src/config/starter-products.ts
// Catálogo inicial preconfigurado por plantilla de negocio (OCP - Abierto a extensión, cerrado a modificación)

export interface StarterProductItem {
    name: string;
    description: string;
    price: number;
    category: string;
    icon: string;
    image_url: string;
    stock: number;
}

export interface StarterProduct extends StarterProductItem {
    id: string;
}

export const STARTER_PRODUCTS_BY_TEMPLATE: Record<string, StarterProductItem[]> = {
    restaurant: [
        {
            name: 'Hamburguesa Especial Ventrina',
            description: 'Carne 100% res 180g, queso cheddar fundido, tocineta crujiente, lechuga y salsa especial de la casa.',
            price: 8.50,
            category: 'principales',
            icon: 'utensils',
            image_url: '/assets/hero_grill.webp',
            stock: -1
        },
        {
            name: 'Papas Rústicas Crispy',
            description: 'Papas sazonadas con pimentón dulce, sal marina y dip de queso fundido.',
            price: 3.50,
            category: 'acompañantes',
            icon: 'package',
            image_url: '/assets/hero_grill.webp',
            stock: 50
        },
        {
            name: 'Bebida Refrescante 355ml',
            description: 'Refresco en lata frío, variedad de sabores disponibles.',
            price: 1.50,
            category: 'bebidas',
            icon: 'coffee',
            image_url: '/assets/hero_grill.webp',
            stock: 100
        }
    ],
    hardware: [
        {
            name: 'Taladro Percutor 1/2 650W',
            description: 'Velocidad variable reversible, empuñadura ergonómica, mandril metálico de 13mm.',
            price: 45.00,
            category: 'herramientas',
            icon: 'tool',
            image_url: '/assets/product_taladro.webp',
            stock: 15
        },
        {
            name: 'Juego de Destornilladores x6 Piezas',
            description: 'Puntas magnéticas de cromo vanadio, mangos bimateriales antideslizantes.',
            price: 12.00,
            category: 'manuales',
            icon: 'wrench',
            image_url: '/assets/product_taladro.webp',
            stock: 30
        }
    ],
    fashion: [
        {
            name: 'Camisa Casual Lino Premium',
            description: 'Confeccionada en 100% lino fresco, corte slim fit, botones de madera natural.',
            price: 28.00,
            category: 'camisas',
            icon: 'tag',
            image_url: '/assets/hero_fashion.webp',
            stock: 25
        },
        {
            name: 'Pantalón Chino Gabardina',
            description: 'Algodón elástico de alta resistencia, bolsillos laterales y traseros.',
            price: 35.00,
            category: 'pantalones',
            icon: 'tag',
            image_url: '/assets/hero_fashion.webp',
            stock: 20
        }
    ],
    tech: [
        {
            name: 'Auriculares Inalámbricos Pro ANC',
            description: 'Cancelación activa de ruido, Bluetooth 5.3, autonomía de 32 horas con estuche.',
            price: 29.99,
            category: 'audio',
            icon: 'headphones',
            image_url: '/assets/product_laptop.webp',
            stock: 20
        },
        {
            name: 'Mouse Gamer RGB 6400 DPI',
            description: 'Sensor óptico de alta precisión, 6 botones programables y cable trenzado.',
            price: 16.50,
            category: 'perifericos',
            icon: 'mouse',
            image_url: '/assets/product_laptop.webp',
            stock: 40
        }
    ],
    autoparts: [
        {
            name: 'Pastillas de Freno Cerámicas Delanteras',
            description: 'Compuesto cerámico de alta duración, frenado silencioso y baja emisión de polvo.',
            price: 26.00,
            category: 'frenos',
            icon: 'disc',
            image_url: '/assets/product_frenos.webp',
            stock: 18
        },
        {
            name: 'Aceite de Motor 20W-50 Mineral 1L',
            description: 'Protección antidesgaste para altas temperaturas en motores a gasolina.',
            price: 7.50,
            category: 'lubricantes',
            icon: 'droplet',
            image_url: '/assets/product_frenos.webp',
            stock: 60
        }
    ],
    grocery: [
        {
            name: 'Combo Despensa Familiar Quincenal',
            description: 'Pack ahorro con 2 Harina PAN, 2 Arroz blanco, 2 Pasta larga, 1 Aceite 1L, 1 Azúcar y 1 Café 500g.',
            price: 28.50,
            category: 'combos',
            icon: 'shopping-bag',
            image_url: '/assets/product_combo_despensa.webp',
            stock: 35
        },
        {
            name: 'Queso Blanco Llanero Fresco (1kg)',
            description: 'Queso fresco artesanal de primera calidad, punto justo de sal. Ideal para arepas y cachapas.',
            price: 6.80,
            category: 'charcuteria',
            icon: 'award',
            image_url: '/assets/hero_grocery.jpg',
            stock: 40
        },
        {
            name: 'Jamón Cocido Superior (500g)',
            description: 'Jamón tierno bajo en grasa, rebanado fino al vacío al momento de armar tu pedido.',
            price: 4.50,
            category: 'charcuteria',
            icon: 'award',
            image_url: '/assets/hero_grocery.jpg',
            stock: 50
        },
        {
            name: 'Café Gourmet Tostado y Molido (500g)',
            description: 'Café de altura 100% arábica, aroma intenso, tueste medio y notas achocolatadas.',
            price: 5.50,
            category: 'despensa',
            icon: 'coffee',
            image_url: '/assets/product_combo_despensa.webp',
            stock: 60
        }
    ]
};

function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

/**
 * Obtiene los productos iniciales para un nuevo tenant según la plantilla seleccionada
 */
export function getStarterProducts(tenantId: string, template: string): StarterProduct[] {
    const items = STARTER_PRODUCTS_BY_TEMPLATE[template] || STARTER_PRODUCTS_BY_TEMPLATE.autoparts;
    return items.map(item => ({
        ...item,
        id: `${tenantId}-${slugify(item.name).slice(0, 30)}`
    }));
}
