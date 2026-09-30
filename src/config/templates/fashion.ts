// src/config/templates/fashion.ts
import type { StoreConfig } from '../../types/store.types';

export const fashionTemplate: StoreConfig = {
  template: 'fashion',
  business: {
    name: 'AURA STUDIO',
    shortName: 'AURA',
    tagline: 'Moda Urbana & Tendencias Exclusivas',
    description: 'AURA STUDIO: Prendas exclusivas, outfits en tendencia, calzado y accesorios diseñados para destacar tu estilo propio. Envíos a todo el país y atención personalizada.',
    logoTextPrimary: 'AURA',
    logoTextSecondary: 'STUDIO',
    siteUrl: 'https://aurastudio.pages.dev',
    ogImage: '/assets/og_image_fashion.webp',
  },
  contact: {
    whatsapp: '584124756191',
    whatsappDisplay: '+58 412-4756191',
    phone: '+58 412-4756191',
    email: 'contacto@aurastudio.com',
    instagram: 'https://www.instagram.com/aurastudio.ve/',
    instagramHandle: '@aurastudio.ve',
    address: 'C.C. Paseo Las Delicias, Nivel 1, Local 22',
    addressLocality: 'Maracay',
    addressRegion: 'Aragua',
    addressCountry: 'VE',
    hours: 'Lun – Sáb: 10:00 AM – 7:00 PM',
  },
  theme: {
    primaryColor: '#BE185D', // Magenta/Rosa elegante
    primaryHover: '#9D174D',
    primaryLight: 'rgba(190, 24, 93, 0.08)',
    accentColor: '#F59E0B', // Acento dorado cálido
    accentHover: '#D97706',
    bgDark: '#181216', // Dark suave con tinte cálido
    bgDarker: '#0F0B0E',
    bgCard: '#241B21',
    textLight: '#FDF2F8',
    fontHeading: "'Playfair Display', serif",
    fontBody: "'Outfit', 'Inter', sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap',
    badgeBg: 'rgba(190, 24, 93, 0.15)',
    badgeBorder: 'rgba(190, 24, 93, 0.4)',
    badgeText: '#F472B6',
  },
  landing: {
    hero: {
      badgeText: '✨ Nueva Colección · Tendencias Exclusivas',
      headline: 'Estilo auténtico que',
      headlineHighlight: 'te define.',
      subheadline: 'Prendas confeccionadas con textiles premium, cortes modernos y versatilidad para el día a día o eventos especiales. Asesoría de imagen directa por WhatsApp.',
      ctaPrimaryText: 'Ver Colección',
      ctaPrimaryLink: '#menu',
      ctaSecondaryText: 'Consultar Tallas',
      ctaSecondaryLink: 'https://wa.me/584124756191',
      slides: [
        { image: '/assets/product_vestido.jpg', alt: 'Colección de temporada AURA' },
        { image: '/assets/product_blazer.jpg', alt: 'Prendas urbanas y chic' },
        { image: '/assets/product_jeans.jpg', alt: 'Prendas denim y básicos de autor' },
      ],
      stats: [
        { value: '+1,200', label: 'Outfits Enviados' },
        { value: '⭐ 4.9', label: 'Satisfacción en Tallas' },
        { value: '📦 Nacional', label: 'Envíos Rápidos' },
      ],
    },
    benefits: {
      title: 'Por qué vestir con',
      titleHighlight: 'AURA',
      subtitle: 'Cuidamos cada detalle desde el diseño hasta el packaging para ofrecerte una experiencia de compra única.',
      items: [
        {
          icon: 'sparkles',
          title: 'Prendas de Edición Limitada',
          description: 'Lotes reducidos por modelo para que tu outfit mantenga siempre ese toque de exclusividad y originalidad.',
        },
        {
          icon: 'ruler',
          title: 'Guía y Asesoría de Tallas',
          description: '¿Dudas con la talla? Te enviamos medidas en centímetros por WhatsApp antes de despachar para un fit perfecto.',
        },
        {
          icon: 'package-check',
          title: 'Packaging Premium de Regalo',
          description: 'Cada orden se entrega envuelta con papel seda perfumado, tarjeta personalizada y bolsa de tela reutilizable.',
        },
        {
          icon: 'repeat',
          title: 'Política de Cambios Ágil',
          description: 'Si la prenda no te quedó como esperabas, cuentas con días continuos para realizar el cambio sin complicaciones.',
        },
      ],
    },
    catalog: {
      title: 'Nueva',
      titleHighlight: 'Colección',
      subtitle: 'Encuentra vestidos, blusas, pantalones, conjuntos, abrigos y accesorios seleccionados cuidadosamente para ti.',
      searchPlaceholder: 'Buscar vestidos, blusas, jeans, blazer, top...',
      emptyMessage: 'No tenemos esa prenda disponible por ahora. ¡Escríbenos para sugerencias o próximos ingresos!',
      addToCartText: 'Agregar a mi Bolsa',
    },
    process: {
      title: '¿Cómo realizar tu',
      titleHighlight: 'compra?',
      subtitle: 'Comprar ropa nunca fue tan simple, seguro y rápido.',
      steps: [
        {
          number: 1,
          title: 'Elige tu Prenda Favorita',
          description: 'Selecciona el modelo, el color que más te guste y la talla sugerida.',
        },
        {
          number: 2,
          title: 'Arma tu Bolsa',
          description: 'Añade varias prendas y complementa tu look con nuestros accesorios en catálogo.',
        },
        {
          number: 3,
          title: 'Valida Talla por WhatsApp',
          description: 'Enviamos tu carrito directo a nuestras asesoras, quienes validarán tu medida y stock en tiempo real.',
        },
        {
          number: 4,
          title: 'Recibe en Casa',
          description: 'Te enviamos tu paquete con MRW, Zoom, Tealca o delivery local en tu ciudad.',
        },
      ],
    },
    testimonials: {
      title: 'Lo que opinan',
      titleHighlight: 'nuestras clientas',
      subtitle: 'Historias de estilo y satisfacción con nuestros outfits.',
      items: [
        {
          name: 'Camila Morales',
          role: 'Creadora de Contenido',
          review: '"El blazer y el pantalón me quedaron a la medida exacta. La tela tiene una caída impecable y el envío llegó al día siguiente."',
          avatar: '/assets/client_maria.webp',
          rating: 5,
        },
        {
          name: 'Daniela Valera',
          role: 'Abogada',
          review: '"Excelente atención por WhatsApp. Me asesoraron con las medidas del vestido para una boda y los detalles del packaging son de lujo."',
          avatar: '/assets/client_ana.webp',
          rating: 5,
        },
        {
          name: 'Valentina Rossi',
          role: 'Estudiante Universitaria',
          review: '"Ropa hermosa, moderna y a muy buen precio. Es la tercera vez que pido y siempre quedo enamorada de mis conjuntos."',
          avatar: '/assets/client_jose.webp',
          rating: 5,
        },
      ],
    },
    faq: {
      title: 'Preguntas',
      titleHighlight: 'Frecuentes',
      subtitle: 'Resolvemos tus inquietudes sobre tallas, envíos y compras',
      items: [
        {
          q: '¿Cómo sé cuál es mi talla adecuada?',
          a: 'Cada prenda cuenta con una tabla de medidas en centímetros. Si tienes dudas, escríbenos tu estatura y medidas por WhatsApp y una asesora te indicará la talla perfecta.',
        },
        {
          q: '¿Hacen envíos a todo el territorio nacional?',
          a: 'Sí, hacemos envíos a toda Venezuela a través de Zoom, MRW, Tealca y Domesa, así como delivery local dentro de la ciudad.',
        },
        {
          q: '¿Se pueden realizar cambios si no me queda?',
          a: 'Sí, dispones de 5 días hábiles a partir de la entrega para solicitar un cambio de talla o modelo, siempre que la prenda conserve su etiqueta y no presente signos de uso.',
        },
        {
          q: '¿Qué métodos de pago tienen disponibles?',
          a: 'Aceptamos Pago Móvil, transferencias bancarias a tasa oficial BCV, Zelle, PayPal, Binance Pay y efectivo en moneda extranjera.',
        },
        {
          q: '¿Tienen tienda física donde pueda medirme las prendas?',
          a: 'Sí, contamos con showroom para retiro y probador previa cita o en el horario habitual indicado al pie de página.',
        },
      ],
    },
  },
  nav: {
    links: [
      { label: 'LOOKBOOK', href: '#nosotros' },
      { label: 'COLECCIÓN', href: '#menu' },
      { label: 'CÓMO COMPRAR', href: '#como-pedir' },
      { label: 'CLIENTAS', href: '#testimonios' },
      { label: 'PREGUNTAS', href: '#faq' },
    ],
  },
  seo: {
    title: 'AURA STUDIO | Tienda de Ropa Online & Tendencias de Moda',
    description: 'Boutique de moda femenina y urbana. Vestidos, blusas, pantalones, conjuntos y accesorios con envíos a toda Venezuela y asesoría de tallas personalizada.',
    keywords: 'tienda de ropa, moda femenina, vestidos, blusas, boutique online, ropa venezuela, outfit juvenil, maracay, caracas',
    schemaType: 'ClothingStore',
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
