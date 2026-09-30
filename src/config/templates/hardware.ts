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
    primaryColor: '#0284C7', // Azul industrial moderno
    primaryHover: '#0369A1',
    primaryLight: 'rgba(2, 132, 199, 0.1)',
    accentColor: '#F97316', // Naranja seguridad/construcción
    accentHover: '#EA580C',
    bgDark: '#0F172A', // Slate dark
    bgDarker: '#020617',
    bgCard: '#1E293B',
    textLight: '#F8FAFC',
    fontHeading: "'Outfit', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@300;400;500;600&display=swap',
    badgeBg: 'rgba(249, 115, 22, 0.15)',
    badgeBorder: 'rgba(249, 115, 22, 0.4)',
    badgeText: '#FB923C',
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
};
