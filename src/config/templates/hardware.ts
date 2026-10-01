// src/config/templates/hardware.ts
import type { StoreConfig } from '../../types/store.types';

export const hardwareTemplate: StoreConfig = {
  template: 'hardware',
  business: {
    name: 'FERROMAX',
    shortName: 'FERROMAX',
    tagline: 'Ferretería Industrial y del Hogar',
    description: 'FERROMAX: Tu ferretería de confianza. Herramientas eléctricas, plomería, electricidad, pinturas y materiales de construcción con despacho directo a obra o taller.',
    logoTextPrimary: 'FERRO',
    logoTextSecondary: 'MAX',
    siteUrl: 'https://ferromax.pages.dev',
    ogImage: '/assets/og_image_hardware.webp',
  },
  contact: {
    whatsapp: '584124756191',
    whatsappDisplay: '+58 412-4756191',
    phone: '+58 412-4756191',
    email: 'ventas@ferromax.com',
    instagram: 'https://www.instagram.com/ferromax.ve/',
    instagramHandle: '@ferromax.ve',
    address: 'Zona Industrial, Av. Principal Galpón 4, La Victoria, Aragua',
    addressLocality: 'La Victoria',
    addressRegion: 'Aragua',
    addressCountry: 'VE',
    hours: 'Lun – Sáb: 7:30 AM – 5:30 PM',
  },
  theme: {
    // Primario: Azul Zafiro Industrial (Bosch / Makita / Herramientas)
    primaryColor: '#0284C7',
    primaryHover: '#0369A1',
    primaryDeep: '#075985',
    primaryLight: 'rgba(2, 132, 199, 0.12)',
    primaryPale: '#F0F9FF',

    // Acento: Naranja Seguridad & Construcción (DeWalt / Obra)
    accentColor: '#F97316',
    accentHover: '#EA580C',
    accentLight: 'rgba(249, 115, 22, 0.16)',
    accentPale: '#FFF7ED',

    // Superficies y Fondos Técnicos
    bgPage: '#F8FAFC',     // Slate 50 - Limpio, técnico y moderno
    bgSection: '#F1F5F9',  // Slate 100 - Textura de acero ligero
    bgCard: '#FFFFFF',
    borderSubtle: 'rgba(2, 132, 199, 0.12)',
    borderFocus: '#0284C7',

    // Tipografía & Contrastes Técnicos
    textHeading: '#0F172A', // Slate 900 - Titanio industrial
    textBody: '#334155',    // Slate 700 - Alta legibilidad
    textMuted: '#64748B',   // Slate 500
    textLight: '#94A3B8',

    // Hero & Overlays
    heroBg: '#0A1120',
    heroOverlay: 'linear-gradient(to bottom right, rgba(10, 17, 32, 0.92) 0%, rgba(15, 30, 56, 0.75) 45%, rgba(2, 132, 199, 0.18) 80%, rgba(249, 115, 22, 0.12) 100%)',
    heroFadeBottom: 'linear-gradient(to top, #F8FAFC 0%, transparent 100%)',

    // Gradientes & Sombras
    gradHero: 'linear-gradient(135deg, #0369A1 0%, #0284C7 55%, #F97316 100%)',
    gradCta: 'linear-gradient(135deg, #0369A1 0%, #0284C7 100%)',
    gradSection: 'linear-gradient(160deg, #F8FAFC 0%, #F1F5F9 60%, #E2E8F0 100%)',
    gradAccent: 'linear-gradient(135deg, #EA580C 0%, #F97316 100%)',
    shadowColor: 'rgba(2, 132, 199, 0.22)',
    shadowCard: '0 4px 20px rgba(15, 23, 42, 0.06)',

    // Badges & Pastillas
    badgeBg: 'rgba(249, 115, 22, 0.14)',
    badgeBorder: 'rgba(249, 115, 22, 0.40)',
    badgeText: '#C2410C',

    // Fuentes
    fontHeading: "'Outfit', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@300;400;500;600&display=swap',
  },
  landing: {
    hero: {
      badgeText: '🛠️ Ferretería y Materiales Industriales · Envíos a Obra',
      headline: 'Solidez y precisión',
      headlineHighlight: 'para tus proyectos.',
      subheadline: 'Herramientas de alto rendimiento, materiales para construcción, plomería y electricidad. Atención inmediata por WhatsApp y despacho express a tu obra o taller.',
      ctaPrimaryText: 'Ver Catálogo',
      ctaPrimaryLink: '#menu',
      ctaSecondaryText: 'Cotizar por WhatsApp',
      ctaSecondaryLink: 'https://wa.me/584124756191',
      slides: [
        { image: '/assets/product_taladro.jpg', alt: 'Herramientas eléctricas y manuales' },
        { image: '/assets/product_esmeril.jpg', alt: 'Materiales para construcción y herrería' },
        { image: '/assets/product_pintura.jpg', alt: 'Pinturas, plomería y electricidad' },
      ],
      stats: [
        { value: '+5,000', label: 'Artículos en Stock' },
        { value: '🏆 100%', label: 'Garantía de Fábrica' },
        { value: '🚚 Envíos', label: 'Directo a tu Obra' },
      ],
    },
    benefits: {
      title: '¿Por qué comprar en',
      titleHighlight: 'FERROMAX',
      subtitle: 'Respaldamos a constructores, técnicos, herreros y proyectos del hogar con marcas de primer nivel y stock real.',
      items: [
        {
          icon: 'shield-check',
          title: 'Garantía Certificada',
          description: 'Trabajamos únicamente con marcas oficiales y distribuidores autorizados con respaldo total en repuestos y servicio.',
        },
        {
          icon: 'truck',
          title: 'Despacho a Obra y Taller',
          description: 'Contamos con flota propia para despacho de materiales pesados y entregas express de herramientas en tiempo récord.',
        },
        {
          icon: 'message-circle',
          title: 'Cotizaciones Rápidas por WhatsApp',
          description: 'Envíanos tu lista de materiales o medidas por foto o texto. Te enviamos presupuesto formal en minutos.',
        },
        {
          icon: 'file-text',
          title: 'Factura Fiscal y Precios al Mayor',
          description: 'Atendemos tanto al consumidor final como a empresas y contratistas con descuentos por volumen y formalidad fiscal.',
        },
      ],
    },
    catalog: {
      title: 'Catálogo de',
      titleHighlight: 'Productos',
      subtitle: 'Explora nuestras categorías: herramientas eléctricas, fijaciones, plomería, electricidad, pinturas y soldadura.',
      searchPlaceholder: 'Buscar taladro, tubería, disco de corte, pintura, cemento...',
      emptyMessage: 'No encontramos productos que coincidan. ¡Contáctanos por WhatsApp para consultar existencia en almacén!',
      addToCartText: 'Agregar a Cotización',
    },
    process: {
      title: '¿Cómo comprar o',
      titleHighlight: 'cotizar?',
      subtitle: 'Comprar tus herramientas y materiales nunca fue tan ágil y seguro.',
      steps: [
        {
          number: 1,
          title: 'Explora el Catálogo',
          description: 'Revisa las especificaciones técnicas, potencias, medidas y presentaciones de cada producto.',
        },
        {
          number: 2,
          title: 'Arma tu Pedido',
          description: 'Agrega las cantidades y accesorios necesarios para tu trabajo al carrito de cotización.',
        },
        {
          number: 3,
          title: 'Envía tu Lista por WhatsApp',
          description: 'Un asesor técnico verificará existencias en almacén y calculará el costo de transporte o entrega.',
        },
        {
          number: 4,
          title: 'Recibe en Obra o Retira',
          description: 'Paga con el método de tu preferencia y recibe en obra o retira sin colas por nuestro mostrador express.',
        },
      ],
    },
    testimonials: {
      title: 'Respaldado por',
      titleHighlight: 'profesionales',
      subtitle: 'Contratistas, maestros de obra y técnicos que confían en nosotros día a día.',
      items: [
        {
          name: 'Ing. Roberto Silva',
          role: 'Contratista de Obras Civiles',
          review: '"Excelente servicio de despacho a obra. Compramos el lote de discos de corte y brocas y llegaron exactamente a la hora pautada. 100% confiables."',
          avatar: '/assets/client_jose.webp',
          rating: 5,
        },
        {
          name: 'Héctor Mendoza',
          role: 'Taller de Herrería & Soldadura',
          review: '"Las máquinas inverter y los electrodos siempre en existencia y con el mejor precio. Cotizar por WhatsApp ahorra horas de viaje y tráfico."',
          avatar: '/assets/client_maria.webp',
          rating: 5,
        },
        {
          name: 'Elena Castillo',
          role: 'Remodelaciones del Hogar',
          review: '"Me asesoraron paso a paso con las tuberías y las pinturas para la casa. La atención al cliente es inmejorable."',
          avatar: '/assets/client_ana.webp',
          rating: 5,
        },
      ],
    },
    faq: {
      title: 'Preguntas',
      titleHighlight: 'Frecuentes',
      subtitle: 'Respuestas claras para tus compras industriales y del hogar',
      items: [
        {
          q: '¿Tienen servicio de entrega de materiales pesados?',
          a: 'Sí, disponemos de camiones plataforma para tuberías, perfiles, cabillas, cemento y materiales voluminosos con entrega directa a la ubicación que nos indiques.',
        },
        {
          q: '¿Emiten factura fiscal para empresas?',
          a: 'Sí, emitimos factura fiscal válida con RIF tanto para contribuyentes especiales como personas naturales y jurídicas.',
        },
        {
          q: '¿Tienen descuentos para compras al mayor o contratistas?',
          a: 'Contamos con una escala de precios preferenciales para compras por bulto, proyectos constructivos o compras recurrentes de talleres.',
        },
        {
          q: '¿Cuáles son las formas de pago aceptadas?',
          a: 'Transferencias bancarias en Bs. a tasa BCV oficial, Pago Móvil, Zelle, transferencias internacionales en USD y efectivo en caja.',
        },
        {
          q: '¿Las herramientas eléctricas cuentan con garantía?',
          a: 'Todas las herramientas cuentan con garantía directa de fábrica desde 3 meses hasta 3 años según la marca y modelo.',
        },
      ],
    },
  },
  nav: {
    links: [
      { label: 'SERVICIOS', href: '#nosotros' },
      { label: 'CATÁLOGO', href: '#menu' },
      { label: 'CÓMO COMPRAR', href: '#como-pedir' },
      { label: 'OPINIONES', href: '#testimonios' },
      { label: 'PREGUNTAS', href: '#faq' },
    ],
  },
  seo: {
    title: 'FERROMAX | Ferretería Industrial & Materiales de Construcción',
    description: 'Ferretería integral en La Victoria. Herramientas eléctricas, plomería, electricidad, pinturas y materiales pesados con entrega en obra. Cotiza al instante por WhatsApp.',
    keywords: 'ferreteria, herramientas electricas, materiales construccion, taladro, plomeria, tuberia, soldadura, pinturas, La Victoria, Venezuela',
    schemaType: 'HardwareStore',
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
  storePrefix: 'FER',
  payment: {
    pagoMovil: {
      banco: 'Mercantil (0105)',
      telefono: '0412-4756191',
      cedula: 'J-40192831',
    },
    zelle: {
      email: 'pagos@ferromax.com',
      titular: 'FERROMAX SUMINISTROS C.A.',
    },
    efectivo: true,
    punto: true,
  },
  labels: {
    itemNounSingular: 'Artículo',
    itemNounPlural: 'Artículos',
    emptyCartEmoji: '🧰',
    cartTitle: '🧰 Tu Cotización / Pedido',
    deliveryOptionName: 'Flete / Despacho a Obra',
    deliveryOptionPrice: 10,
    pickupOptionName: 'Retiro en Galpón / Tienda',
  },
  categories: [
    { id: 'herramientas-electricas', name: 'Herramientas Eléctricas', icon: 'zap' },
    { id: 'herramientas-manuales', name: 'Herramientas Manuales', icon: 'wrench' },
    { id: 'plomeria', name: 'Plomería & Tuberías', icon: 'droplet' },
    { id: 'electricidad', name: 'Electricidad & Iluminación', icon: 'sun' },
    { id: 'construccion-pinturas', name: 'Construcción & Pinturas', icon: 'brush' },
  ],
};
