// src/config/store.config.ts
// Configuración centralizada de la tienda (Single Source of Truth)

import type { StoreConfig, StoreTemplateType } from '../types/store.types';
import { restaurantTemplate } from './templates/restaurant';
import { hardwareTemplate } from './templates/hardware';
import { fashionTemplate } from './templates/fashion';
import { techTemplate } from './templates/tech';

/**
 * Registro de todas las plantillas disponibles en el sistema.
 */
export const storeTemplates: Record<StoreTemplateType, StoreConfig> = {
  restaurant: restaurantTemplate,
  hardware: hardwareTemplate,
  fashion: fashionTemplate,
  tech: techTemplate,
};

/**
 * Plantilla activa actual.
 * 
 * 👉 ¡Para cambiar el tipo de tienda en todo el proyecto, solo cambia este valor!
 * Opciones disponibles: 'restaurant' | 'hardware' | 'fashion' | 'tech'
 */
export const ACTIVE_TEMPLATE: StoreTemplateType = 'restaurant';

/**
 * Helper para combinar configuraciones de forma recursiva o con overrides personalizados.
 */
export function createStoreConfig(
  templateType: StoreTemplateType = ACTIVE_TEMPLATE,
  customOverrides?: Partial<StoreConfig>
): StoreConfig {
  const base = storeTemplates[templateType] || storeTemplates.restaurant;
  if (!customOverrides) return base;

  return {
    ...base,
    ...customOverrides,
    business: { ...base.business, ...(customOverrides.business || {}) },
    contact: { ...base.contact, ...(customOverrides.contact || {}) },
    theme: { ...base.theme, ...(customOverrides.theme || {}) },
    landing: {
      ...base.landing,
      ...(customOverrides.landing || {}),
      hero: { ...base.landing.hero, ...(customOverrides.landing?.hero || {}) },
      benefits: { ...base.landing.benefits, ...(customOverrides.landing?.benefits || {}) },
      catalog: { ...base.landing.catalog, ...(customOverrides.landing?.catalog || {}) },
      process: { ...base.landing.process, ...(customOverrides.landing?.process || {}) },
      testimonials: { ...base.landing.testimonials, ...(customOverrides.landing?.testimonials || {}) },
      faq: { ...base.landing.faq, ...(customOverrides.landing?.faq || {}) },
    },
    nav: { ...base.nav, ...(customOverrides.nav || {}) },
    seo: { ...base.seo, ...(customOverrides.seo || {}) },
    features: { ...base.features, ...(customOverrides.features || {}) },
  };
}

/**
 * Configuración activa de la tienda exportada para todo el proyecto.
 */
export const storeConfig: StoreConfig = createStoreConfig(ACTIVE_TEMPLATE);
export default storeConfig;
