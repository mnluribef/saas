// src/config/templates/tech.ts
import type { StoreConfig } from '../../types/store.types';

export const techTemplate: StoreConfig = {
  template: 'tech',
  business: {
    name: 'NEXUS TECH',
    shortName: 'NEXUS',
    tagline: 'Tecnología, Gaming & Hardware de Alto Rendimiento',
    description: 'NEXUS TECH: Laptops, smartphones, periféricos gamer, componentes de PC y gadgets de última generación con garantía directa y despacho asegurado.',
    logoTextPrimary: 'NEXUS',
    logoTextSecondary: 'TECH',
    siteUrl: 'https://nexustech.pages.dev',
    ogImage: '/assets/og_image_tech.webp',
  },
  contact: {
    whatsapp: '584124756191',
    whatsappDisplay: '+58 412-4756191',
    phone: '+58 412-4756191',
    email: 'soporte@nexustech.com',
    instagram: 'https://www.instagram.com/nexustech.ve/',
    instagramHandle: '@nexustech.ve',
    address: 'Torre Empresarial Sigma, Piso 3, Ofic. 304',
    addressLocality: 'Valencia',
    addressRegion: 'Carabobo',
    addressCountry: 'VE',
    hours: 'Lun – Sáb: 9:00 AM – 6:30 PM',
  },
  theme: {
    primaryColor: '#6366F1', // Indigo Cyber
    primaryHover: '#4F46E5',
    primaryLight: 'rgba(99, 102, 241, 0.1)',
    accentColor: '#06B6D4', // Cyan Neón
    accentHover: '#0891B2',
    bgDark: '#0B0F19', // Deep space dark
    bgDarker: '#030712',
    bgCard: '#111827',
    textLight: '#F9FAFB',
    fontHeading: "'Outfit', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@300;400;500;600&display=swap',
    badgeBg: 'rgba(6, 182, 212, 0.12)',
    badgeBorder: 'rgba(6, 182, 212, 0.35)',
    badgeText: '#22D3EE',
  },
  landing: {
    hero: {
      badgeText: '⚡ Hardware de Nueva Generación · Garantía Oficial',
      headline: 'Potencia tu mundo con',
      headlineHighlight: 'tecnología real.',
      subheadline: 'Equipos sellados, procesadores, tarjetas gráficas, laptops de alto rendimiento y periféricos gamer. Asesoría técnica especializada y envíos asegurados a todo el país.',
      ctaPrimaryText: 'Explorar Equipos',
      ctaPrimaryLink: '#menu',
      ctaSecondaryText: 'Consultar Stock',
      ctaSecondaryLink: 'https://wa.me/584124756191',
      slides: [
        { image: '/assets/product_laptop.jpg', alt: 'Laptops y computadoras de alto rendimiento' },
        { image: '/assets/product_monitor.jpg', alt: 'Monitores gamer y pantallas profesionales' },
        { image: '/assets/product_teclado.jpg', alt: 'Periféricos y componentes gamer' },
      ],
      stats: [
        { value: '100%', label: 'Equipos Nuevos y Sellados' },
        { value: '🛡️ 1 Año', label: 'Garantía Escrita' },
        { value: '✈️ Asegurado', label: 'Envíos Nacionales' },
      ],
    },
    benefits: {
      title: 'Por qué confiar en',
      titleHighlight: 'NEXUS TECH',
      subtitle: 'Comprar tecnología debe darte total tranquilidad. Cero riesgos, cero sorpresas.',
      items: [
        {
          icon: 'cpu',
          title: '100% Originales y Sellados en Caja',
          description: 'Todos nuestros dispositivos son importados legalmente con seriales verificables ante el fabricante correspondiente.',
        },
        {
          icon: 'shield-check',
          title: 'Garantía Escrita y Soporte Local',
          description: 'Cuentas con garantía contra defectos de fábrica respaldada por nuestro propio laboratorio técnico especializado.',
        },
        {
          icon: 'zap',
          title: 'Asesoría en Ensamblaje y Compatibilidad',
          description: '¿No sabes si esa gráfica entra en tu case o qué fuente necesitas? Te ayudamos a armar tu setup ideal sin costo extra.',
        },
        {
          icon: 'box',
          title: 'Envíos Protegidos y Asegurados',
          description: 'Embalaje a prueba de golpes con seguro de tránsito total ante pérdidas o daños durante el transporte.',
        },
      ],
    },
    catalog: {
      title: 'Catálogo de',
      titleHighlight: 'Tecnología',
      subtitle: 'Explora laptops, componentes de PC, smartphones, monitores, audio y periféricos para productividad y gaming.',
      searchPlaceholder: 'Buscar laptop, RTX 4070, monitor 144Hz, SSD NVMe, teclado...',
      emptyMessage: 'No encontramos ese modelo en lista. ¡Contáctanos por WhatsApp para pedidos bajo encargo o cotización!',
      addToCartText: 'Agregar al Carrito',
    },
    process: {
      title: '¿Cómo comprar tu',
      titleHighlight: 'equipo?',
      subtitle: 'Proceso transparente con verificación previa de seriales y especificaciones.',
      steps: [
        {
          number: 1,
          title: 'Elige tu Dispositivo',
          description: 'Revisa especificaciones de CPU, RAM, almacenamiento, pantalla y puertos.',
        },
        {
          number: 2,
          title: 'Configura tu Orden',
          description: 'Selecciona variantes (almacenamiento, color) o añade accesorios complementarios.',
        },
        {
          number: 3,
          title: 'Confirma por WhatsApp',
          description: 'Te enviamos fotos reales del empaque sellado y serial para tu total seguridad antes del pago.',
        },
        {
          number: 4,
          title: 'Despacho Inmediato',
          description: 'Retira en nuestra oficina técnica o recibe con número de guía rastreable en tiempo real.',
        },
      ],
    },
    testimonials: {
      title: 'Lo que opinan',
      titleHighlight: 'nuestros usuarios',
      subtitle: 'Profesionales, gamers y empresas que confían su infraestructura en NEXUS.',
      items: [
        {
          name: 'Alejandro Bastidas',
          role: 'Desarrollador de Software',
          review: '"Compré mi laptop para programar y una pantalla externa. Llegaron al día siguiente a Valencia totalmente selladas con su factura. Excelente atención."',
          avatar: '/assets/client_jose.webp',
          rating: 5,
        },
        {
          name: 'Valeria Rivas',
          role: 'Diseñadora UI/UX & 3D',
          review: '"Me asesoraron con la tarjeta gráfica y la memoria RAM para mis renders. El soporte es impecable y los precios son los más competitivos del mercado."',
          avatar: '/assets/client_ana.webp',
          rating: 5,
        },
        {
          name: 'Marcos Gil',
          role: 'Gamer & Streamer',
          review: '"El teclado mecánico y los auriculares llegaron impecables. La atención por WhatsApp fue súper rápida y me resolvieron todas las dudas técnicas."',
          avatar: '/assets/client_maria.webp',
          rating: 5,
        },
      ],
    },
    faq: {
      title: 'Preguntas',
      titleHighlight: 'Frecuentes',
      subtitle: 'Transparencia total para tus compras tecnológicas',
      items: [
        {
          q: '¿Los equipos son completamente nuevos y sellados?',
          a: 'Sí, 100% de nuestros productos vienen de fábrica en caja precintada con sus sellos de seguridad intactos. No comercializamos productos usados sin previo aviso explícito.',
        },
        {
          q: '¿Cómo funciona la garantía de los productos?',
          a: 'Todos los equipos disponen de garantía formal por escrito desde 30 días hasta 12 meses dependiendo de la categoría y fabricante.',
        },
        {
          q: '¿Hacen entregas personales?',
          a: 'Sí, puedes retirar directamente en nuestras instalaciones previa coordinación y verificar tu equipo en persona.',
        },
        {
          q: '¿Qué medios de pago reciben?',
          a: 'Recibimos Binance (USDT), Zelle, transferencias en Bolívares a tasa oficial BCV, Pago Móvil, PayPal y efectivo en divisas.',
        },
        {
          q: '¿Hacen importaciones o pedidos bajo encargo de piezas específicas?',
          a: 'Sí, si buscas un componente o modelo específico no listado en catálogo, podemos cotizarte y gestionarte la importación express.',
        },
      ],
    },
  },
  nav: {
    links: [
      { label: 'GARANTÍA', href: '#nosotros' },
      { label: 'CATÁLOGO', href: '#menu' },
      { label: 'CÓMO COMPRAR', href: '#como-pedir' },
      { label: 'CLIENTES', href: '#testimonios' },
      { label: 'PREGUNTAS', href: '#faq' },
    ],
  },
  seo: {
    title: 'NEXUS TECH | Tienda de Tecnología, Computación & Gaming',
    description: 'Venta de laptops, hardware gamer, componentes de PC, smartphones y accesorios con garantía y despacho asegurado a toda Venezuela.',
    keywords: 'tecnologia venezuela, computadoras gamer, laptops, procesadores, rtx, componentes pc, valencia, caracas',
    schemaType: 'ElectronicsStore',
    priceRange: '$$$',
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
