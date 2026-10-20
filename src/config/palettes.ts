// src/config/palettes.ts
// Catálogo de paletas de colores armónicas y preconfiguradas para Ventrina SaaS
// Permite personalizar la estética visual de cualquier tienda independientemente de la plantilla
import type { StoreThemeConfig } from '../types/store.types';

export interface PaletteDefinition {
    id: string;
    name: string;
    description: string;
    category: 'cálido' | 'fresco' | 'tecnológico' | 'elegante' | 'minimalista' | 'neutro';
    preview: {
        primary: string;
        accent: string;
        bgPage: string;
        text: string;
    };
    theme?: Partial<StoreThemeConfig>;
}

export const COLOR_PALETTES: Record<string, PaletteDefinition> = {
    'default': {
        id: 'default',
        name: 'Plantilla por Defecto',
        description: 'Conserva la combinación de colores oficial diseñada para la plantilla seleccionada.',
        category: 'neutro',
        preview: {
            primary: '#E25822',
            accent: '#D4AF37',
            bgPage: '#FFFDF9',
            text: '#1C0A00'
        }
        // Sin theme override; hereda directamente el base.theme de la plantilla
    },
    'amber-gold': {
        id: 'amber-gold',
        name: 'Ámbar Cálido & Fuego Criollo',
        description: 'Tonos tostados, ámbar dorado y crema suave. Ideal para gastronomía, cafés y asados.',
        category: 'cálido',
        preview: {
            primary: '#D97706',
            accent: '#F59E0B',
            bgPage: '#FFFDF7',
            text: '#451A03'
        },
        theme: {
            primaryColor: '#D97706',
            primaryHover: '#B45309',
            primaryDeep: '#92400E',
            primaryLight: 'rgba(217, 119, 6, 0.12)',
            primaryPale: '#FFFBEB',
            accentColor: '#F59E0B',
            accentHover: '#D97706',
            accentLight: 'rgba(245, 158, 11, 0.15)',
            accentPale: '#FEF3C7',
            bgPage: '#FFFDF7',
            bgSection: '#FEF9EE',
            bgCard: '#FFFFFF',
            heroBg: '#1A0B02',
            borderSubtle: 'rgba(180, 83, 9, 0.14)',
            borderFocus: '#D97706',
            textHeading: '#451A03',
            textBody: '#78350F',
            textMuted: '#92400E',
            textLight: '#B45309',
            shadowColor: 'rgba(217, 119, 6, 0.22)',
            badgeBg: 'rgba(245, 158, 11, 0.18)',
            badgeBorder: 'rgba(217, 119, 6, 0.35)',
            badgeText: '#B45309'
        }
    },
    'emerald-mint': {
        id: 'emerald-mint',
        name: 'Esmeralda Puro & Menta Fresca',
        description: 'Verde esmeralda profundo con destellos menta y blanco puro. Ideal para bienestar, salud, botánica y frescura.',
        category: 'fresco',
        preview: {
            primary: '#059669',
            accent: '#10B981',
            bgPage: '#FBFDFB',
            text: '#064E3B'
        },
        theme: {
            primaryColor: '#059669',
            primaryHover: '#047857',
            primaryDeep: '#064E3B',
            primaryLight: 'rgba(5, 150, 105, 0.12)',
            primaryPale: '#ECFDF5',
            accentColor: '#10B981',
            accentHover: '#059669',
            accentLight: 'rgba(16, 185, 129, 0.15)',
            accentPale: '#D1FAE5',
            bgPage: '#FBFDFB',
            bgSection: '#F0FDF4',
            bgCard: '#FFFFFF',
            heroBg: '#031A12',
            borderSubtle: 'rgba(5, 150, 105, 0.14)',
            borderFocus: '#059669',
            textHeading: '#064E3B',
            textBody: '#065F46',
            textMuted: '#047857',
            textLight: '#059669',
            shadowColor: 'rgba(5, 150, 105, 0.2)',
            badgeBg: 'rgba(16, 185, 129, 0.18)',
            badgeBorder: 'rgba(5, 150, 105, 0.35)',
            badgeText: '#047857'
        }
    },
    'sapphire-ocean': {
        id: 'sapphire-ocean',
        name: 'Azul Zafiro & Océano Profundo',
        description: 'Azul zafiro de alta confianza con acentos aqua y fondo despejado. Ideal para tecnología, servicios, repuestos y ferretería.',
        category: 'tecnológico',
        preview: {
            primary: '#2563EB',
            accent: '#06B6D4',
            bgPage: '#F8FAFC',
            text: '#0F172A'
        },
        theme: {
            primaryColor: '#2563EB',
            primaryHover: '#1D4ED8',
            primaryDeep: '#1E40AF',
            primaryLight: 'rgba(37, 99, 235, 0.12)',
            primaryPale: '#EFF6FF',
            accentColor: '#06B6D4',
            accentHover: '#0891B2',
            accentLight: 'rgba(6, 182, 212, 0.15)',
            accentPale: '#CFFAFE',
            bgPage: '#F8FAFC',
            bgSection: '#F1F5F9',
            bgCard: '#FFFFFF',
            heroBg: '#070F1E',
            borderSubtle: 'rgba(37, 99, 235, 0.14)',
            borderFocus: '#2563EB',
            textHeading: '#0F172A',
            textBody: '#1E293B',
            textMuted: '#475569',
            textLight: '#64748B',
            shadowColor: 'rgba(37, 99, 235, 0.2)',
            badgeBg: 'rgba(6, 182, 212, 0.18)',
            badgeBorder: 'rgba(37, 99, 235, 0.35)',
            badgeText: '#1E40AF'
        }
    },
    'cyber-violet': {
        id: 'cyber-violet',
        name: 'Violeta Eléctrico & Fucsia Neón',
        description: 'Vibrante violeta cósmico y fucsia de alto impacto. Ideal para gaming, periféricos, electrónica moderna y cultura pop.',
        category: 'tecnológico',
        preview: {
            primary: '#7C3AED',
            accent: '#EC4899',
            bgPage: '#FAFAFE',
            text: '#2E1065'
        },
        theme: {
            primaryColor: '#7C3AED',
            primaryHover: '#6D28D9',
            primaryDeep: '#5B21B6',
            primaryLight: 'rgba(124, 58, 237, 0.12)',
            primaryPale: '#F5F3FF',
            accentColor: '#EC4899',
            accentHover: '#DB2777',
            accentLight: 'rgba(236, 72, 153, 0.15)',
            accentPale: '#FDF2F8',
            bgPage: '#FAFAFE',
            bgSection: '#F3F0FF',
            bgCard: '#FFFFFF',
            heroBg: '#0F071D',
            borderSubtle: 'rgba(124, 58, 237, 0.14)',
            borderFocus: '#7C3AED',
            textHeading: '#2E1065',
            textBody: '#4C1D95',
            textMuted: '#6D28D9',
            textLight: '#8B5CF6',
            shadowColor: 'rgba(124, 58, 237, 0.22)',
            badgeBg: 'rgba(236, 72, 153, 0.18)',
            badgeBorder: 'rgba(124, 58, 237, 0.35)',
            badgeText: '#5B21B6'
        }
    },
    'crimson-ruby': {
        id: 'crimson-ruby',
        name: 'Rubí Carmesí & Fuego Intenso',
        description: 'Rojo carmesí atrevido con destellos naranja y excelente contraste. Ideal para comida rápida, carnicería, hamburgueserías y deportes.',
        category: 'cálido',
        preview: {
            primary: '#DC2626',
            accent: '#EA580C',
            bgPage: '#FFFBFB',
            text: '#450A0A'
        },
        theme: {
            primaryColor: '#DC2626',
            primaryHover: '#B91C1C',
            primaryDeep: '#991B1B',
            primaryLight: 'rgba(220, 38, 38, 0.12)',
            primaryPale: '#FEF2F2',
            accentColor: '#EA580C',
            accentHover: '#C2410C',
            accentLight: 'rgba(234, 88, 12, 0.15)',
            accentPale: '#FFEDD5',
            bgPage: '#FFFBFB',
            bgSection: '#FFF1F1',
            bgCard: '#FFFFFF',
            heroBg: '#180406',
            borderSubtle: 'rgba(220, 38, 38, 0.14)',
            borderFocus: '#DC2626',
            textHeading: '#450A0A',
            textBody: '#7F1D1D',
            textMuted: '#991B1B',
            textLight: '#B91C1C',
            shadowColor: 'rgba(220, 38, 38, 0.2)',
            badgeBg: 'rgba(234, 88, 12, 0.18)',
            badgeBorder: 'rgba(220, 38, 38, 0.35)',
            badgeText: '#991B1B'
        }
    },
    'rose-boutique': {
        id: 'rose-boutique',
        name: 'Rosa Velvet & Champagne Gold',
        description: 'Paleta chic de rosa empolvado con oro champagne. Creada para moda femenina, alta costura, calzado y cosmética de lujo.',
        category: 'elegante',
        preview: {
            primary: '#E11D48',
            accent: '#D97706',
            bgPage: '#FFFDFD',
            text: '#4C0519'
        },
        theme: {
            primaryColor: '#E11D48',
            primaryHover: '#BE123C',
            primaryDeep: '#9F1239',
            primaryLight: 'rgba(225, 29, 72, 0.12)',
            primaryPale: '#FFF1F2',
            accentColor: '#D97706',
            accentHover: '#B45309',
            accentLight: 'rgba(217, 119, 6, 0.15)',
            accentPale: '#FEF3C7',
            bgPage: '#FFFDFD',
            bgSection: '#FFF5F6',
            bgCard: '#FFFFFF',
            heroBg: '#180611',
            borderSubtle: 'rgba(225, 29, 72, 0.14)',
            borderFocus: '#E11D48',
            textHeading: '#4C0519',
            textBody: '#881337',
            textMuted: '#9F1239',
            textLight: '#BE123C',
            shadowColor: 'rgba(225, 29, 72, 0.2)',
            badgeBg: 'rgba(217, 119, 6, 0.18)',
            badgeBorder: 'rgba(225, 29, 72, 0.35)',
            badgeText: '#9F1239'
        }
    },
    'obsidian-slate': {
        id: 'obsidian-slate',
        name: 'Obsidiana & Titanio Minimalista',
        description: 'Monocromo elegante en negro azabache, gris pizarra y azul titanio. Diseñado para marcas sobrias, premium y automotriz.',
        category: 'minimalista',
        preview: {
            primary: '#0F172A',
            accent: '#3B82F6',
            bgPage: '#F8FAFC',
            text: '#020617'
        },
        theme: {
            primaryColor: '#0F172A',
            primaryHover: '#1E293B',
            primaryDeep: '#020617',
            primaryLight: 'rgba(15, 23, 42, 0.12)',
            primaryPale: '#F1F5F9',
            accentColor: '#3B82F6',
            accentHover: '#2563EB',
            accentLight: 'rgba(59, 130, 246, 0.15)',
            accentPale: '#DBEAFE',
            bgPage: '#F8FAFC',
            bgSection: '#EDF2F7',
            bgCard: '#FFFFFF',
            heroBg: '#090D16',
            borderSubtle: 'rgba(15, 23, 42, 0.14)',
            borderFocus: '#0F172A',
            textHeading: '#020617',
            textBody: '#0F172A',
            textMuted: '#334155',
            textLight: '#475569',
            shadowColor: 'rgba(15, 23, 42, 0.18)',
            badgeBg: 'rgba(59, 130, 246, 0.18)',
            badgeBorder: 'rgba(15, 23, 42, 0.35)',
            badgeText: '#0F172A'
        }
    },
    'terracotta-sunset': {
        id: 'terracotta-sunset',
        name: 'Terracota Artesanal & Atardecer',
        description: 'Cálido marrón rojizo con ocre brillante y fondo marfil. Ideal para ferretería rústica, cuero, decoración y artesanía.',
        category: 'cálido',
        preview: {
            primary: '#C2410C',
            accent: '#D97706',
            bgPage: '#FFFCF9',
            text: '#431407'
        },
        theme: {
            primaryColor: '#C2410C',
            primaryHover: '#9A3412',
            primaryDeep: '#7C2D12',
            primaryLight: 'rgba(194, 65, 12, 0.12)',
            primaryPale: '#FFF7ED',
            accentColor: '#D97706',
            accentHover: '#B45309',
            accentLight: 'rgba(217, 119, 6, 0.15)',
            accentPale: '#FEF3C7',
            bgPage: '#FFFCF9',
            bgSection: '#FFF3EB',
            bgCard: '#FFFFFF',
            heroBg: '#1A0A04',
            borderSubtle: 'rgba(194, 65, 12, 0.14)',
            borderFocus: '#C2410C',
            textHeading: '#431407',
            textBody: '#7C2D12',
            textMuted: '#9A3412',
            textLight: '#C2410C',
            shadowColor: 'rgba(194, 65, 12, 0.2)',
            badgeBg: 'rgba(217, 119, 6, 0.18)',
            badgeBorder: 'rgba(194, 65, 12, 0.35)',
            badgeText: '#7C2D12'
        }
    },
    'midnight-gold': {
        id: 'midnight-gold',
        name: 'Midnight Luxury & Oro Imperial',
        description: 'Lujo sobrio en negro carbón con acentos en oro imperial pulido y champagne. Ideal para joyería, relojes, licores finos y alta gama.',
        category: 'elegante',
        preview: {
            primary: '#D4AF37',
            accent: '#F3E5AB',
            bgPage: '#FAF9F6',
            text: '#111217'
        },
        theme: {
            primaryColor: '#D4AF37',
            primaryHover: '#B89628',
            primaryDeep: '#8C7016',
            primaryLight: 'rgba(212, 175, 55, 0.12)',
            primaryPale: '#FDFBF2',
            accentColor: '#E5C158',
            accentHover: '#D4AF37',
            accentLight: 'rgba(229, 193, 88, 0.15)',
            accentPale: '#FFFDF5',
            bgPage: '#FAF9F6',
            bgSection: '#F4F2EC',
            bgCard: '#FFFFFF',
            heroBg: '#0C0D12',
            borderSubtle: 'rgba(212, 175, 55, 0.18)',
            borderFocus: '#D4AF37',
            textHeading: '#111217',
            textBody: '#272830',
            textMuted: '#5A5C69',
            textLight: '#858796',
            shadowColor: 'rgba(212, 175, 55, 0.22)',
            badgeBg: 'rgba(212, 175, 55, 0.15)',
            badgeBorder: 'rgba(212, 175, 55, 0.40)',
            badgeText: '#997A15'
        }
    },
    'nordic-sage': {
        id: 'nordic-sage',
        name: 'Nordic Sage & Terracota Suave',
        description: 'Verde salvia escandinavo y arcilla suave sobre marfil lino. Ideal para interiorismo, cosmética botánica, cerámica y bienestar.',
        category: 'fresco',
        preview: {
            primary: '#2D5A46',
            accent: '#E07A5F',
            bgPage: '#FBF9F5',
            text: '#14261C'
        },
        theme: {
            primaryColor: '#2D5A46',
            primaryHover: '#234737',
            primaryDeep: '#173024',
            primaryLight: 'rgba(45, 90, 70, 0.12)',
            primaryPale: '#EEF5F1',
            accentColor: '#E07A5F',
            accentHover: '#C96348',
            accentLight: 'rgba(224, 122, 95, 0.15)',
            accentPale: '#FDF1ED',
            bgPage: '#FBF9F5',
            bgSection: '#F3EFE8',
            bgCard: '#FFFFFF',
            heroBg: '#081A12',
            borderSubtle: 'rgba(45, 90, 70, 0.14)',
            borderFocus: '#2D5A46',
            textHeading: '#14261C',
            textBody: '#233B2E',
            textMuted: '#476655',
            textLight: '#6D8D7C',
            shadowColor: 'rgba(45, 90, 70, 0.18)',
            badgeBg: 'rgba(224, 122, 95, 0.15)',
            badgeBorder: 'rgba(224, 122, 95, 0.38)',
            badgeText: '#C96348'
        }
    },
    'sunset-coral': {
        id: 'sunset-coral',
        name: 'Sunset Coral & Melocotón Tropical',
        description: 'Coral vibrante con destellos melocotón y mango dorado. Creado para ropa playera, heladerías, smoothies y marcas juveniles.',
        category: 'cálido',
        preview: {
            primary: '#F43F5E',
            accent: '#F59E0B',
            bgPage: '#FFFBFB',
            text: '#4C0519'
        },
        theme: {
            primaryColor: '#F43F5E',
            primaryHover: '#E11D48',
            primaryDeep: '#BE123C',
            primaryLight: 'rgba(244, 63, 94, 0.12)',
            primaryPale: '#FFF1F2',
            accentColor: '#F59E0B',
            accentHover: '#D97706',
            accentLight: 'rgba(245, 158, 11, 0.15)',
            accentPale: '#FEF3C7',
            bgPage: '#FFFBFB',
            bgSection: '#FFF1F2',
            bgCard: '#FFFFFF',
            heroBg: '#1A0810',
            borderSubtle: 'rgba(244, 63, 94, 0.14)',
            borderFocus: '#F43F5E',
            textHeading: '#4C0519',
            textBody: '#881337',
            textMuted: '#9F1239',
            textLight: '#BE123C',
            shadowColor: 'rgba(244, 63, 94, 0.20)',
            badgeBg: 'rgba(245, 158, 11, 0.18)',
            badgeBorder: 'rgba(244, 63, 94, 0.35)',
            badgeText: '#BE123C'
        }
    }
};

/**
 * Obtiene la definición de una paleta por su identificador
 */
export function getPalette(paletteId?: string | null): PaletteDefinition | null {
    if (!paletteId || paletteId === 'default') return null;
    return COLOR_PALETTES[paletteId] || null;
}

/**
 * Retorna la lista completa de paletas disponibles para renderizar selectores UI
 */
export function getAllPalettes(): PaletteDefinition[] {
    return Object.values(COLOR_PALETTES);
}

/**
 * Genera el bloque CSS completo para inyección en :root con prioridad !important
 */
export function generatePaletteCss(paletteId?: string | null): string {
    if (!paletteId || paletteId === 'default') return '';
    const pal = getPalette(paletteId);
    if (!pal || !pal.theme) return '';

    const theme = pal.theme;
    const themePrimary = theme.primaryColor || '#D97706';
    const themePrimaryHover = theme.primaryHover || themePrimary;
    const themePrimaryDeep = theme.primaryDeep || themePrimaryHover;
    const themePrimaryLight = theme.primaryLight || 'rgba(0,0,0,0.1)';
    const themePrimaryPale = theme.primaryPale || themePrimaryLight;

    const themeAccent = theme.accentColor || '#F59E0B';
    const themeAccentHover = theme.accentHover || themeAccent;
    const themeAccentLight = theme.accentLight || 'rgba(0,0,0,0.1)';
    const themeAccentPale = theme.accentPale || '#FFFFFF';

    const themeBgPage = theme.bgPage || '#FFFDF9';
    const themeBgSection = theme.bgSection || '#FFF5EE';
    const themeBgCard = theme.bgCard || '#FFFFFF';

    const themeBorderSubtle = theme.borderSubtle || 'rgba(0, 0, 0, 0.08)';
    const themeBorderFocus = theme.borderFocus || themePrimary;

    const themeTextHeading = theme.textHeading || '#1C0A00';
    const themeTextBody = theme.textBody || '#3D2214';
    const themeTextMuted = theme.textMuted || '#7A523B';
    const themeTextLight = theme.textLight || '#A67C65';

    const themeHeroBg = theme.heroBg || '#0A1120';
    const themeHeroOverlay = theme.heroOverlay || 'linear-gradient(to bottom right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)';
    const themeHeroFade = theme.heroFadeBottom || `linear-gradient(to top, ${themeBgPage} 0%, transparent 100%)`;

    const themeGradHero = theme.gradHero || `linear-gradient(135deg, ${themePrimaryHover} 0%, ${themePrimary} 55%, ${themeAccent} 100%)`;
    const themeGradCta = theme.gradCta || `linear-gradient(135deg, ${themePrimaryHover} 0%, ${themePrimary} 100%)`;
    const themeGradSection = theme.gradSection || `linear-gradient(160deg, ${themeBgPage} 0%, ${themeBgSection} 100%)`;
    const themeGradAccent = theme.gradAccent || `linear-gradient(135deg, ${themeAccentHover} 0%, ${themeAccent} 100%)`;

    const themeShadow = `0 12px 36px ${theme.shadowColor || 'rgba(0,0,0,0.18)'}`;
    const themeShadowCard = theme.shadowCard || '0 4px 20px rgba(0, 0, 0, 0.06)';

    const themeBadgeBg = theme.badgeBg || 'rgba(212, 175, 55, 0.14)';
    const themeBadgeBorder = theme.badgeBorder || 'rgba(212, 175, 55, 0.38)';
    const themeBadgeText = theme.badgeText || themeAccent;

    return `:root {
  --theme-primary: ${themePrimary} !important;
  --theme-primary-hover: ${themePrimaryHover} !important;
  --theme-primary-deep: ${themePrimaryDeep} !important;
  --theme-primary-light: ${themePrimaryLight} !important;
  --theme-primary-pale: ${themePrimaryPale} !important;

  --theme-accent: ${themeAccent} !important;
  --theme-accent-hover: ${themeAccentHover} !important;
  --theme-accent-light: ${themeAccentLight} !important;
  --theme-accent-pale: ${themeAccentPale} !important;

  --theme-bg-page: ${themeBgPage} !important;
  --theme-bg-section: ${themeBgSection} !important;
  --theme-bg-card: ${themeBgCard} !important;

  --theme-border-subtle: ${themeBorderSubtle} !important;
  --theme-border-focus: ${themeBorderFocus} !important;

  --theme-text-heading: ${themeTextHeading} !important;
  --theme-text-body: ${themeTextBody} !important;
  --theme-text-muted: ${themeTextMuted} !important;
  --theme-text-light: ${themeTextLight} !important;

  --theme-hero-bg: ${themeHeroBg} !important;
  --theme-hero-overlay: ${themeHeroOverlay} !important;
  --theme-hero-fade: ${themeHeroFade} !important;

  --theme-grad-hero: ${themeGradHero} !important;
  --theme-grad-cta: ${themeGradCta} !important;
  --theme-grad-section: ${themeGradSection} !important;
  --theme-grad-accent: ${themeGradAccent} !important;

  --theme-shadow: ${themeShadow} !important;
  --theme-shadow-card: ${themeShadowCard} !important;

  --theme-badge-bg: ${themeBadgeBg} !important;
  --theme-badge-border: ${themeBadgeBorder} !important;
  --theme-badge-text: ${themeBadgeText} !important;

  /* Compatibilidad directa con tokens de estilo */
  --rose: ${themePrimary} !important;
  --rose-deep: ${themePrimaryHover} !important;
  --rose-dark: ${themePrimaryDeep} !important;
  --rose-light: ${themePrimaryLight} !important;
  --rose-pale: ${themePrimaryPale} !important;

  --gold: ${themeAccent} !important;
  --gold-deep: ${themeAccentHover} !important;
  --gold-light: ${themeAccentLight} !important;
  --gold-pale: ${themeAccentPale} !important;

  --cream: ${themeBgPage} !important;
  --blush: ${themeBgSection} !important;
  --bg-card: ${themeBgCard} !important;

  --border-subtle: ${themeBorderSubtle} !important;
  --border-focus: ${themeBorderFocus} !important;

  --text-heading: ${themeTextHeading} !important;
  --text-body: ${themeTextBody} !important;
  --text-muted: ${themeTextMuted} !important;
  --text-light: ${themeTextLight} !important;

  --hero-bg: ${themeHeroBg} !important;
  --hero-overlay: ${themeHeroOverlay} !important;
  --hero-fade-bottom: ${themeHeroFade} !important;

  --grad-hero: ${themeGradHero} !important;
  --grad-cta: ${themeGradCta} !important;
  --grad-section: ${themeGradSection} !important;
  --grad-gold: ${themeGradAccent} !important;
}`;
}

