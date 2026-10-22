// src/config/templates/grocery.ts
import type { StoreConfig } from '../../types/store.types';

export const groceryTemplate: StoreConfig = {
  template: 'grocery',
  business: {
    name: 'BODEGÓN EXPRESS',
    shortName: 'BODEGÓN',
    tagline: 'Víveres, Bodegón y Charcutería Fresca · Delivery Express',
    description: 'BODEGÓN EXPRESS: Tu minimarket y bodegón de confianza en La Victoria, Aragua. Víveres nacionales e importados, charcutería fresca, licores, snacks y combos de despensa. Pedidos rápidos por WhatsApp.',
    logoTextPrimary: 'BODEGÓN',
    logoTextSecondary: 'EXPRESS',
    siteUrl: 'https://bodegon.pages.dev',
    ogImage: '/assets/og_image_grocery.webp',
  },
  contact: {
    whatsapp: '584241230046',
    whatsappDisplay: '+58 424-1230046',
    phone: '+58 424-1230046',
    email: 'contacto@bodegonexpress.ve',
    instagram: 'https://www.instagram.com/bodegonexpress.ve/',
    instagramHandle: '@bodegonexpress.ve',
    address: 'Av. Francisco de Loreto, Centro, La Victoria, Aragua',
    addressLocality: 'La Victoria',
    addressRegion: 'Aragua',
    addressCountry: 'VE',
    hours: 'Lun – Dom: 8:00 AM – 9:00 PM',
  },
  theme: {
    // Primario: Verde Esmeralda Fresco (Confianza, Calidad, Alimentos)
    primaryColor: '#15803D',
    primaryHover: '#166534',
    primaryDeep: '#14532D',
    primaryLight: 'rgba(21, 128, 61, 0.12)',
    primaryPale: '#F0FDF4',

    // Acento: Ámbar Dorado & Trigo Tostado
    accentColor: '#D97706',
    accentHover: '#B45309',
    accentLight: 'rgba(217, 119, 6, 0.16)',
    accentPale: '#FFFBEB',

    // Superficies y Fondos Limpios
    bgPage: '#F8FAFC',
    bgSection: '#F1F5F9',
    bgCard: '#FFFFFF',
    borderSubtle: 'rgba(21, 128, 61, 0.12)',
    borderFocus: '#15803D',

    // Tipografía & Contrastes
    textHeading: '#0F172A',
    textBody: '#334155',
    textMuted: '#64748B',
    textLight: '#94A3B8',

    // Hero & Overlays
    heroBg: '#062817',
    heroOverlay: 'linear-gradient(to bottom right, rgba(6, 40, 23, 0.90) 0%, rgba(15, 23, 42, 0.75) 45%, rgba(21, 128, 61, 0.20) 80%, rgba(217, 119, 6, 0.12) 100%)',
    heroFadeBottom: 'linear-gradient(to top, #F8FAFC 0%, transparent 100%)',

    // Gradientes & Sombras
    gradHero: 'linear-gradient(135deg, #166534 0%, #15803D 55%, #D97706 100%)',
    gradCta: 'linear-gradient(135deg, #166534 0%, #15803D 100%)',
    gradSection: 'linear-gradient(160deg, #F8FAFC 0%, #F1F5F9 60%, #E2E8F0 100%)',
    gradAccent: 'linear-gradient(135deg, #B45309 0%, #D97706 100%)',
    shadowColor: 'rgba(21, 128, 61, 0.20)',
    shadowCard: '0 4px 20px rgba(15, 23, 42, 0.06)',

    // Badges & Pastillas
    badgeBg: 'rgba(22, 163, 74, 0.15)',
    badgeBorder: 'rgba(22, 163, 74, 0.40)',
    badgeText: '#15803D',

    // Fuentes
    fontHeading: "'Outfit', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@300;400;500;600&display=swap',
  },
  landing: {
    hero: {
      badgeText: '🛒 Bodegón & Minimarket · Delivery Inmediato',
      headline: 'Tu despensa lista,',
      headlineHighlight: 'directo a tu mesa.',
      subheadline: 'Víveres de primera calidad, charcutería fresca rebanada al día, snacks importados y combos de ahorro quincenal. Arma tu pedido y recíbelo en minutos vía WhatsApp.',
      ctaPrimaryText: 'Ver Catálogo',
      ctaPrimaryLink: '#menu',
      ctaSecondaryText: 'Pedir por WhatsApp',
      ctaSecondaryLink: 'https://wa.me/584241230046',
      slides: [
        { image: '/assets/hero_grocery.jpg', alt: 'Pasillo Gourmet y Bodegón' },
        { image: '/assets/product_combo_despensa.webp', alt: 'Combos de Despensa y Víveres' },
        { image: '/assets/hero_main.webp', alt: 'Productos Frescos Seleccionados' },
      ],
      stats: [
        { value: '+1,500', label: 'Productos en Stock' },
        { value: '🚀 35 min', label: 'Entrega Promedio' },
        { value: '⭐ 4.9', label: 'Clientes Satisfechos' },
      ],
    },
    benefits: {
      title: '¿Por qué comprar en',
      titleHighlight: 'BODEGÓN EXPRESS',
      subtitle: 'Comodidad, frescura y las mejores marcas para tu hogar sin colas ni complicaciones.',
      items: [
        {
          icon: 'shopping-bag',
          title: 'Víveres y Marcas Importadas',
          description: 'Encuentra desde productos esenciales de la canasta básica hasta marcas premium internacionales y golosinas importadas.',
        },
        {
          icon: 'award',
          title: 'Charcutería Fresca al Día',
          description: 'Quesos nacionales e importados, jamones y embutidos rebanados al momento con el peso exacto que necesitas.',
        },
        {
          icon: 'truck',
          title: 'Delivery Express Seguro',
          description: 'Llevamos tu compra cuidadosamente empacada y refrigerada hasta la puerta de tu casa o trabajo en tiempo récord.',
        },
      ],
    },
    catalog: {
      title: 'Catálogo de',
      titleHighlight: 'Víveres y Bodegón',
      subtitle: 'Navega por despensa, charcutería, bebidas, snacks y nuestros combos de ahorro familiar.',
      searchPlaceholder: 'Buscar arroz, harina PAN, queso blanco, pasta, aceite, café, galletas...',
      emptyMessage: 'No encontramos ese producto en catálogo. ¡Escríbenos al WhatsApp, quizás lo tenemos en bodega!',
      addToCartText: 'Agregar al Carrito',
    },
    process: {
      title: '¿Cómo comprar en',
      titleHighlight: 'Bodegón Express?',
      subtitle: 'Hacer tu mercado nunca fue tan cómodo y rápido.',
      steps: [
        {
          number: 1,
          title: 'Arma tu Carrito',
          description: 'Selecciona los víveres, charcutería y productos favoritos navegando por categorías o usando el buscador.',
        },
        {
          number: 2,
          title: 'Revisa tu Pedido',
          description: 'Verifica las cantidades, selecciona si deseas delivery a domicilio o retiro rápido en nuestro local.',
        },
        {
          number: 3,
          title: 'Confirma por WhatsApp',
          description: 'Envía tu orden con un solo clic. Nuestro equipo confirmará existencias y total en segundos.',
        },
        {
          number: 4,
          title: 'Recibe y Disfruta',
          description: 'Paga con Pago Móvil, Zelle o efectivo en entrega. ¡Tu despensa surtida sin salir de casa!',
        },
      ],
    },
    testimonials: {
      title: 'Lo que dicen nuestros',
      titleHighlight: 'vecinos y clientes',
      subtitle: 'Familias que confían su mercado semanal en nuestro servicio.',
      items: [
        {
          name: 'Carolina Méndez',
          role: 'Cliente Frecuente',
          review: '"El servicio de delivery es impecable. Los quesos y jamones llegan fresquecitos y bien empacados. Me ahorra horas de cola en el supermercado."',
          avatar: '/assets/client_maria.webp',
          rating: 5,
        },
        {
          name: 'Roberto Valera',
          role: 'Padre de Familia',
          review: '"Pido el combo despensa cada 15 días por WhatsApp y siempre tienen todo. La atención es rápida y súper amable."',
          avatar: '/assets/client_jose.webp',
          rating: 5,
        },
        {
          name: 'Elena Castillo',
          role: 'Emprendedora',
          review: '"Excelente variedad de productos importados y licores para reuniones. Pago con Zelle o Pago Móvil sin ningún problema."',
          avatar: '/assets/client_ana.webp',
          rating: 5,
        },
      ],
    },
    faq: {
      title: 'Preguntas',
      titleHighlight: 'Frecuentes',
      subtitle: 'Todo lo que necesitas saber sobre entregas, pedidos y formas de pago.',
      items: [
        {
          q: '¿Cómo se pesa y factura la charcutería?',
          a: 'La charcutería se rebate y pesa de forma precisa al momento de armar tu pedido. En WhatsApp te enviaremos la foto del peso exacto y monto correspondiente.',
        },
        {
          q: '¿Cuáles son los métodos de pago aceptados?',
          a: 'Aceptamos Pago Móvil, transferencias bancarias nacionales, Zelle, Binance Pay y efectivo en divisas al momento de recibir.',
        },
        {
          q: '¿Cuánto tarda el delivery?',
          a: 'El tiempo promedio de entrega en la zona metropolitana es de 30 a 45 minutos después de confirmada la orden.',
        },
        {
          q: '¿Puedo retirar mi pedido directamente en la tienda?',
          a: '¡Sí, claro! Puedes elegir la opción Retiro en Tienda al finalizar el carrito y tendremos tu paquete listo para recoger sin esperas.',
        },
        {
          q: '¿Mantienen la cadena de frío para lácteos y embutidos?',
          a: 'Absolutamente. Todos los productos refrigerados se transportan en coolers térmicos para preservar su frescura intacta.',
        },
      ],
    },
  },
  nav: {
    links: [
      { label: 'BODEGÓN', href: '#nosotros' },
      { label: 'CATÁLOGO', href: '#menu' },
      { label: 'CÓMO PEDIR', href: '#como-pedir' },
      { label: 'OPINIONES', href: '#testimonios' },
      { label: 'PREGUNTAS', href: '#faq' },
    ],
  },
  seo: {
    title: 'BODEGÓN EXPRESS | Minimarket, Víveres y Charcutería Fresca',
    description: 'Tu bodegón y minimarket de confianza. Víveres nacionales e importados, charcutería, bebidas y combos de ahorro con delivery express a domicilio.',
    keywords: 'bodegon, minimarket, viveres, charcuteria, delivery mercado, venezuela, combos despensa, compras por whatsapp',
    schemaType: 'Store',
    priceRange: '$$',
  },
  features: {
    showBcvRate: true,
    showSearch: true,
    showCart: true,
    orderViaWhatsapp: true,
    deliveryOptions: true,
    currencySymbol: '$',
    currencyCode: 'USD',
    allowCustomNotes: true,
  },
  storePrefix: 'BOD',
  payment: {
    pagoMovil: {
      banco: 'Banesco (0134)',
      telefono: '0424-1230046',
      cedula: 'J-50123984',
      titular: 'BODEGON EXPRESS C.A.',
    },
    pagoMovilAccounts: [
      {
        id: 'pm-bod-1',
        banco: 'Banesco (0134)',
        telefono: '0424-1230046',
        cedula: 'J-50123984',
        titular: 'BODEGON EXPRESS C.A.',
        isDefault: true,
      }
    ],
    zelle: {
      email: 'pagos@bodegonexpress.ve',
      titular: 'BODEGON EXPRESS LLC',
    },
    efectivo: true,
    punto: true,
  },
  labels: {
    itemNounSingular: 'Producto',
    itemNounPlural: 'Productos',
    emptyCartEmoji: '🛒',
    cartTitle: '🛒 Tu Carrito de Mercado',
    deliveryOptionName: 'Delivery Express a Domicilio',
    deliveryOptionPrice: 3,
    pickupOptionName: 'Retiro en Bodegón',
  },
  categories: [
    { id: 'despensa', name: 'Despensa y Granos', icon: 'package' },
    { id: 'charcuteria', name: 'Charcutería y Lácteos', icon: 'award' },
    { id: 'bebidas', name: 'Bebidas y Licores', icon: 'coffee' },
    { id: 'snacks', name: 'Snacks y Golosinas', icon: 'sparkles' },
    { id: 'combos', name: 'Combos de Ahorro', icon: 'shopping-bag' },
  ],
};
