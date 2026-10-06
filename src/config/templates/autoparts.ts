// src/config/templates/autoparts.ts
import type { StoreConfig } from '../../types/store.types';

export const autopartsTemplate: StoreConfig = {
  template: 'autoparts',
  business: {
    name: 'MOTOPARTS',
    shortName: 'MOTOPARTS',
    tagline: 'Repuestos Automotrices de Calidad',
    description: 'MOTOPARTS: Encuentra los mejores repuestos y accesorios para tu vehículo. Frenos, suspensión, motor, lubricantes y más. Confianza y seguridad en cada viaje.',
    logoTextPrimary: 'MOTO',
    logoTextSecondary: 'PARTS',
    siteUrl: 'https://motoparts.pages.dev',
    ogImage: '/assets/og_image_autoparts.webp',
  },
  contact: {
    whatsapp: '584121234567',
    whatsappDisplay: '+58 412-1234567',
    phone: '+58 412-1234567',
    email: 'ventas@motoparts.com',
    instagram: 'https://www.instagram.com/motoparts.ve/',
    instagramHandle: '@motoparts.ve',
    address: 'Av. Las Delicias, Local 12, Maracay, Aragua',
    addressLocality: 'Maracay',
    addressRegion: 'Aragua',
    addressCountry: 'VE',
    hours: 'Lun – Sáb: 8:00 AM – 6:00 PM',
  },
  theme: {
    // Primario: Rojo Carreras (Pasión, Automotriz)
    primaryColor: '#DC2626',
    primaryHover: '#B91C1C',
    primaryDeep: '#991B1B',
    primaryLight: 'rgba(220, 38, 38, 0.12)',
    primaryPale: '#FEF2F2',

    // Acento: Gris Metálico & Carbono
    accentColor: '#4B5563',
    accentHover: '#374151',
    accentLight: 'rgba(75, 85, 99, 0.16)',
    accentPale: '#F3F4F6',

    // Superficies y Fondos
    bgPage: '#F9FAFB',
    bgSection: '#F3F4F6',
    bgCard: '#FFFFFF',
    borderSubtle: 'rgba(220, 38, 38, 0.12)',
    borderFocus: '#DC2626',

    // Tipografía & Contrastes Técnicos
    textHeading: '#111827',
    textBody: '#374151',
    textMuted: '#6B7280',
    textLight: '#9CA3AF',

    // Hero & Overlays
    heroBg: '#1F2937',
    heroOverlay: 'linear-gradient(to bottom right, rgba(31, 41, 55, 0.92) 0%, rgba(17, 24, 39, 0.75) 45%, rgba(220, 38, 38, 0.18) 80%, rgba(75, 85, 99, 0.12) 100%)',
    heroFadeBottom: 'linear-gradient(to top, #F9FAFB 0%, transparent 100%)',

    // Gradientes & Sombras
    gradHero: 'linear-gradient(135deg, #B91C1C 0%, #DC2626 55%, #4B5563 100%)',
    gradCta: 'linear-gradient(135deg, #B91C1C 0%, #DC2626 100%)',
    gradSection: 'linear-gradient(160deg, #F9FAFB 0%, #F3F4F6 60%, #E5E7EB 100%)',
    gradAccent: 'linear-gradient(135deg, #374151 0%, #4B5563 100%)',
    shadowColor: 'rgba(220, 38, 38, 0.22)',
    shadowCard: '0 4px 20px rgba(17, 24, 39, 0.06)',

    // Badges & Pastillas
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeBorder: 'rgba(245, 158, 11, 0.40)',
    badgeText: '#FBBF24',

    // Fuentes
    fontHeading: "'Outfit', sans-serif",
    fontBody: "'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@300;400;500;600&display=swap',
  },
  landing: {
    hero: {
      badgeText: '🚗 Repuestos y Accesorios · Originales y Alternativos',
      headline: 'Máximo poder',
      headlineHighlight: 'para tu motor.',
      subheadline: 'Repuestos premium y originales. Frenos, motor y suspensión con envíos nacionales y asesoría experta al instante.',
      ctaPrimaryText: 'Buscar Repuestos',
      ctaPrimaryLink: '#menu',
      ctaSecondaryText: 'Consulta por WhatsApp',
      ctaSecondaryLink: 'https://wa.me/584121234567',
      slides: [
        { image: '/assets/product_frenos.webp', alt: 'Discos y Pastillas de freno' },
        { image: '/assets/product_aceite.webp', alt: 'Lubricantes y Filtros' },
        { image: '/assets/product_suspension.webp', alt: 'Amortiguadores y Suspensión' },
      ],
      stats: [
        { value: '+10k', label: 'Repuestos Disponibles' },
        { value: '💯 100%', label: 'Garantía de Calidad' },
        { value: '🔧 Asesoría', label: 'Especializada' },
      ],
    },
    benefits: {
      title: '¿Por qué elegir',
      titleHighlight: 'MOTOPARTS',
      subtitle: 'Nos apasiona el mundo automotor, ofreciendo solo productos de calidad superior para el mantenimiento de tu vehículo.',
      items: [
        {
          icon: 'shield-check',
          title: 'Repuestos Garantizados',
          description: 'Trabajamos con las mejores marcas y fabricantes OEM para garantizar la seguridad y durabilidad de tus reparaciones.',
        },
        {
          icon: 'zap',
          title: 'Asesoría Técnica',
          description: 'No estás seguro de qué pieza necesitas? Nuestro equipo de expertos te guiará para encontrar el repuesto exacto para tu modelo.',
        },
        {
          icon: 'truck',
          title: 'Envíos Nacionales',
          description: 'Hacemos envíos seguros y rápidos a todo el país para que tu vehículo vuelva a la carretera cuanto antes.',
        },
      ],
    },
    catalog: {
      title: 'Catálogo de',
      titleHighlight: 'Repuestos',
      subtitle: 'Navega por categorías: motor, frenos, tren delantero, eléctricos y accesorios.',
      searchPlaceholder: 'Buscar pastillas de freno, filtro de aceite, amortiguador, bujías...',
      emptyMessage: 'No encontramos esa pieza. ¡Contáctanos por WhatsApp, quizás lo tenemos en nuestro inventario no publicado!',
      addToCartText: 'Agregar al Carrito',
    },
    process: {
      title: '¿Cómo comprar tu',
      titleHighlight: 'repuesto?',
      subtitle: 'Adquirir las piezas correctas es rápido, sencillo y seguro.',
      steps: [
        {
          number: 1,
          title: 'Busca la Pieza',
          description: 'Encuentra el repuesto ideal navegando por categorías o usando nuestro buscador por número de parte o aplicación.',
        },
        {
          number: 2,
          title: 'Arma tu Pedido',
          description: 'Añade los productos que necesitas al carrito de compras, verificando siempre la compatibilidad con tu auto.',
        },
        {
          number: 3,
          title: 'Confirma Disponibilidad',
          description: 'Envíanos tu pedido por WhatsApp para confirmar stock y gestionar el pago y envío.',
        },
        {
          number: 4,
          title: 'Recibe tu Compra',
          description: 'Retira en nuestra tienda física o recibe en la comodidad de tu casa o taller.',
        },
      ],
    },
    testimonials: {
      title: 'Lo que dicen nuestros',
      titleHighlight: 'clientes',
      subtitle: 'Conductores y mecánicos satisfechos con nuestro servicio.',
      items: [
        {
          name: 'Carlos Rodríguez',
          role: 'Taller Mecánico El Motorcito',
          review: '"Siempre consigo aquí los repuestos que necesito para los carros de mis clientes. Atención de primera y precios competitivos."',
          avatar: '/assets/client_jose.webp',
          rating: 5,
        },
        {
          name: 'María Fernández',
          role: 'Conductora',
          review: '"Excelente asesoría. Me ayudaron a encontrar el aceite y los filtros correctos para mi carro sin complicaciones."',
          avatar: '/assets/client_maria.webp',
          rating: 5,
        },
        {
          name: 'Javier Pérez',
          role: 'Taxista',
          review: '"Compré unos amortiguadores y me llegaron rapidísimo. La calidad se nota al conducir, 100% recomendados."',
          avatar: '/assets/client_ana.webp',
          rating: 5,
        },
      ],
    },
    faq: {
      title: 'Preguntas',
      titleHighlight: 'Frecuentes',
      subtitle: 'Resuelve tus dudas sobre repuestos y envíos.',
      items: [
        {
          q: '¿Cómo sé si el repuesto aplica para mi vehículo?',
          a: 'Puedes consultarnos directamente por WhatsApp con los datos de tu vehículo (marca, modelo, año y motor) o el número VIN, y verificaremos la compatibilidad por ti.',
        },
        {
          q: '¿Ofrecen repuestos originales o alternativos?',
          a: 'Ofrecemos ambas opciones. Contamos con líneas OEM (originales) y marcas alternativas de excelente calidad (Aftermarket).',
        },
        {
          q: '¿Qué garantía tienen los productos?',
          a: 'Todos los repuestos tienen garantía por defectos de fábrica. Los periodos varían según la marca y tipo de producto.',
        },
        {
          q: '¿Hacen envíos a todo el país?',
          a: 'Sí, realizamos envíos nacionales a través de las principales empresas de encomiendas. El envío se hace cobro a destino o prepagado, según prefieras.',
        },
        {
          q: '¿Tienen tienda física donde pueda retirar mi compra?',
          a: 'Sí, contamos con tienda física donde puedes retirar tus repuestos personalmente luego de concretar el pedido.',
        },
      ],
    },
  },
  nav: {
    links: [
      { label: 'SOBRE NOSOTROS', href: '#nosotros' },
      { label: 'REPUESTOS', href: '#menu' },
      { label: 'CÓMO COMPRAR', href: '#como-pedir' },
      { label: 'TESTIMONIOS', href: '#testimonios' },
      { label: 'AYUDA', href: '#faq' },
    ],
  },
  seo: {
    title: 'MOTOPARTS | Venta de Repuestos Automotrices y Accesorios',
    description: 'Encuentra los mejores repuestos para tu vehículo en MOTOPARTS. Frenos, suspensión, motor, lubricantes. Envíos a nivel nacional.',
    keywords: 'repuestos, automotriz, auto parts, frenos, lubricantes, amortiguadores, bujias, venezuela, repuestos originales',
    schemaType: 'AutoPartsStore',
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
  storePrefix: 'MOT',
  payment: {
    pagoMovil: {
      banco: 'Banesco (0134)',
      telefono: '0412-1234567',
      cedula: 'J-40192831',
    },
    zelle: {
      email: 'pagos@motoparts.com',
      titular: 'MOTOPARTS C.A.',
    },
    efectivo: true,
    punto: true,
  },
  labels: {
    itemNounSingular: 'Repuesto',
    itemNounPlural: 'Repuestos',
    emptyCartEmoji: '🚗',
    cartTitle: '🚗 Tu Pedido de Repuestos',
    deliveryOptionName: 'Envío Nacional / Delivery',
    deliveryOptionPrice: 5,
    pickupOptionName: 'Retiro en Tienda',
  },
  categories: [
    { id: 'frenos', name: 'Frenos y Sistema', icon: 'shield-check' },
    { id: 'motor', name: 'Componentes de Motor', icon: 'settings' },
    { id: 'suspension', name: 'Suspensión y Dirección', icon: 'truck' },
    { id: 'lubricantes', name: 'Lubricantes y Fluidos', icon: 'droplet' },
    { id: 'electrico', name: 'Sistema Eléctrico', icon: 'zap' },
  ],
};
