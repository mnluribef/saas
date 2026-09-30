// src/types/store.types.ts
// Definiciones de tipos para la arquitectura multi-tienda configurable

export type StoreTemplateType = 'restaurant' | 'hardware' | 'fashion' | 'tech';

export type SchemaOrgType =
  | 'Restaurant'
  | 'HardwareStore'
  | 'ClothingStore'
  | 'ElectronicsStore'
  | 'Store'
  | 'LocalBusiness';

export interface BenefitItem {
  icon: string; // Nombre del icono o SVG inline
  title: string;
  description: string;
}

export interface ProcessStep {
  number: number | string;
  title: string;
  description: string;
}

export interface TestimonialItem {
  name: string;
  role: string;
  review: string;
  avatar: string;
  rating?: number;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface HeroSlide {
  image: string;
  alt: string;
  caption?: string;
}

export interface StoreBusinessConfig {
  name: string;
  shortName?: string;
  tagline: string;
  description: string;
  logoTextPrimary: string;
  logoTextSecondary?: string;
  logoIcon?: string; // SVG path or SVG string
  siteUrl: string;
  ogImage: string;
}

export interface StoreContactConfig {
  whatsapp: string; // Formato internacional sin +, ej: 584124756191
  whatsappDisplay?: string; // Ej: +58 412-4756191
  phone?: string;
  email?: string;
  instagram?: string;
  instagramHandle?: string;
  address: string;
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
  hours: string;
  mapsUrl?: string;
}

export interface StoreThemeConfig {
  primaryColor: string; // ej: '#D4AF37' o '#2563EB'
  primaryHover: string;
  primaryLight: string;
  accentColor: string;
  accentHover?: string;
  bgDark: string;
  bgDarker: string;
  bgCard: string;
  textLight: string;
  fontHeading: string;
  fontBody: string;
  googleFontsUrl: string;
  badgeBg?: string;
  badgeBorder?: string;
  badgeText?: string;
}

export interface StoreLandingConfig {
  hero: {
    badgeText: string;
    headline: string;
    headlineHighlight: string;
    subheadline: string;
    ctaPrimaryText: string;
    ctaPrimaryLink: string;
    ctaSecondaryText?: string;
    ctaSecondaryLink?: string;
    slides: HeroSlide[];
    stats: Array<{
      value: string;
      label: string;
    }>;
  };
  benefits: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    items: BenefitItem[];
  };
  catalog: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    searchPlaceholder: string;
    emptyMessage?: string;
    addToCartText?: string;
  };
  process: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    steps: ProcessStep[];
  };
  testimonials: {
    title: string;
    titleHighlight: string;
    subtitle: string;
    items: TestimonialItem[];
  };
  faq: {
    title: string;
    titleHighlight: string;
    subtitle?: string;
    items: FaqItem[];
  };
}

export interface StoreNavConfig {
  links: NavLink[];
}

export interface StoreSeoConfig {
  title: string;
  description: string;
  keywords: string;
  schemaType: SchemaOrgType;
  priceRange?: string;
  servesCuisine?: string; // Para restaurantes
}

export interface StoreFeaturesConfig {
  showBcvRate: boolean; // Mostrar tasa de cambio oficial (Venezuela)
  showSearch: boolean;
  showCart: boolean;
  orderViaWhatsapp: boolean;
  deliveryOptions: boolean; // Delivery vs Retiro en tienda
  currencySymbol: string;
  currencyCode: string;
  allowCustomNotes: boolean;
}

export interface StorePaymentConfig {
  pagoMovil?: {
    banco: string;
    telefono: string;
    cedula: string;
  };
  zelle?: {
    email: string;
    titular: string;
  };
  efectivo?: boolean;
  punto?: boolean;
}

export interface StoreLabelsConfig {
  itemNounSingular: string; // ej: "Platillo", "Artículo", "Prenda", "Equipo"
  itemNounPlural: string;   // ej: "Platillos", "Artículos", "Prendas", "Equipos"
  emptyCartEmoji: string;   // ej: "🍽️", "🧰", "🛍️", "⚡"
  cartTitle: string;        // ej: "Tu Pedido", "Tus Compras", "Tu Cotización"
  deliveryOptionName: string; // ej: "Delivery", "Despacho a Obra", "Envío Nacional", "Envío Express"
  deliveryOptionPrice: number; // Costo adicional en USD
  pickupOptionName: string;   // ej: "Retiro en local", "Retiro en Galpón", "Retiro en Tienda", "Retiro en Oficina"
}

export interface CategoryDefinition {
  id: string;
  name: string;
  icon?: string;
}

export interface StoreConfig {
  template: StoreTemplateType;
  storePrefix?: string; // Prefijo para IDs de pedidos (ej: 'FOG', 'FER', 'AUR', 'NEX')
  business: StoreBusinessConfig;
  contact: StoreContactConfig;
  theme: StoreThemeConfig;
  landing: StoreLandingConfig;
  nav: StoreNavConfig;
  seo: StoreSeoConfig;
  features: StoreFeaturesConfig;
  payment?: StorePaymentConfig;
  labels?: StoreLabelsConfig;
  categories?: CategoryDefinition[];
}

