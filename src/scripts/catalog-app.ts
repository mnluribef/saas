import type { StoreMetaConfig } from './types/catalog.types';
import { ToastService } from './services/toast.service';
import { ImageCompressionService } from './services/image.service';
import { BcvCurrencyService } from './services/bcv.service';
import { LocalStorageCartStorage } from './services/storage.service';
import { CartService } from './services/cart.service';
import { OrderService } from './services/order.service';
import { CartUIController } from './controllers/cart.controller';
import { CatalogController } from './controllers/catalog.controller';
import { initScrollReveal } from './utils/reveal.util';
import { syncStoreWithSettings } from './services/store-sync.service';

function resolveActiveTenantId(): string | undefined {
    const storeMetaEl = document.getElementById('catalog-store-meta');
    if (storeMetaEl?.dataset.tenant) return storeMetaEl.dataset.tenant;

    const metaTag = document.querySelector('meta[name="vendly-tenant"]');
    const metaTenant = metaTag?.getAttribute('content');
    if (metaTenant) return metaTenant;

    const qs = new URLSearchParams(window.location.search).get('tenant');
    if (qs) return qs;

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        let candidate = pathParts[0].toLowerCase();
        if (candidate === 's' && pathParts.length > 1) {
            candidate = pathParts[1].toLowerCase();
        }
        const SYSTEM_PATHS = new Set(['api', 'admin', 'login', 'register', 'precios', 'superadmin', 'demo', 'assets', '_astro']);
        if (candidate && !SYSTEM_PATHS.has(candidate) && !candidate.includes('.')) {
            return candidate;
        }
    }

    return undefined;
}

export function createStoreConfig(): StoreMetaConfig {
    const storeMetaEl = document.getElementById('catalog-store-meta');
    const tenantId = resolveActiveTenantId();
    return {
        whatsappNumber: storeMetaEl?.dataset.whatsapp || '584124756191',
        defaultCurrency: storeMetaEl?.dataset.currency || '$',
        businessName: storeMetaEl?.dataset.businessName || 'Vendly Store',
        template: storeMetaEl?.dataset.template || 'restaurant',
        itemNounSingular: storeMetaEl?.dataset.itemNounSingular || 'Artículo',
        itemNounPlural: storeMetaEl?.dataset.itemNounPlural || 'Artículos',
        emptyCartEmoji: storeMetaEl?.dataset.emptyCartEmoji || '🛒',
        deliveryName: storeMetaEl?.dataset.deliveryName || 'Delivery',
        deliveryPrice: parseFloat(storeMetaEl?.dataset.deliveryPrice || '5'),
        pickupName: storeMetaEl?.dataset.pickupName || 'Retiro en local',
        storePrefix: storeMetaEl?.dataset.storePrefix || 'VEN',
        tenantId,
    };
}

export function initCatalogApp(): void {
    const config = createStoreConfig();
    const storeKey = (config.tenantId || config.businessName).toLowerCase().replace(/[^a-z0-9]/g, '_') || 'default';
    const storageKey = `vendly_cart_${config.template}_${storeKey}`;

    // Hidratación instantánea si fue inyectada por el servidor
    const injectedConfigEl = document.getElementById('injected-tenant-config');
    if (injectedConfigEl && injectedConfigEl.textContent) {
        try {
            const preloadedConfig = JSON.parse(injectedConfigEl.textContent);
            syncStoreWithSettings(preloadedConfig);
        } catch (_) {}
    }

    // Services (Dependency Inversion & Single Responsibility)
    const toastService = new ToastService();
    const imageService = new ImageCompressionService();
    const currencyService = new BcvCurrencyService();
    const cartStorage = new LocalStorageCartStorage(storageKey);
    const cartService = new CartService(cartStorage, config);
    const orderService = new OrderService(config, currencyService);

    // Controllers
    const cartController = new CartUIController(
        cartService,
        currencyService,
        orderService,
        toastService,
        imageService,
        config
    );

    const catalogController = new CatalogController(
        cartService,
        currencyService,
        toastService,
        config
    );

    // Inicialización global
    initScrollReveal();
    currencyService.fetchRate();
    catalogController.loadCatalog();
    cartController.render();

    // Sincronizar en vivo configuraciones personalizadas del tenant si existen
    const settingsUrl = config.tenantId
        ? `/api/settings?tenant=${encodeURIComponent(config.tenantId)}`
        : '/api/settings';

    const reqHeaders: Record<string, string> = {};
    if (config.tenantId) {
        reqHeaders['X-Tenant-Id'] = config.tenantId;
    }

    fetch(settingsUrl, { headers: reqHeaders }).then(res => res.json() as Promise<any>).then((data: any) => {
        if (data.success && data.tenant?.config) {
            const cfg = data.tenant.config;
            const pm = cfg.payment?.pagoMovil;
            const z = cfg.payment?.zelle;
            const c = cfg.contact;

            // Actualizar todos los textos, imágenes de portada, catálogo, beneficios, testimonios y FAQs
            syncStoreWithSettings(cfg);

            // Actualizar datos de pago móvil en el DOM si fueron configurados
            if (pm?.banco) {
                const el = document.getElementById('pm-data-banco');
                if (el) el.textContent = pm.banco;
            }
            if (pm?.telefono) {
                const el = document.getElementById('pm-data-telefono');
                if (el) el.textContent = pm.telefono;
            }
            if (pm?.cedula) {
                const el = document.getElementById('pm-data-cedula');
                if (el) el.textContent = pm.cedula;
            }

            // Actualizar datos de Zelle en el DOM
            if (z?.email) {
                const el = document.getElementById('zelle-data-email');
                if (el) el.textContent = z.email;
            }
            if (z?.titular) {
                const el = document.getElementById('zelle-data-titular');
                if (el) el.textContent = z.titular;
            }

            // Actualizar WhatsApp si fue modificado
            if (c?.whatsapp) {
                config.whatsappNumber = c.whatsapp;
                const waFloat = document.querySelector('.float-wa') as HTMLAnchorElement | null;
                if (waFloat) {
                    waFloat.href = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Hola! Vengo de la web y quiero ver el catálogo`)}`;
                }
            }

            // Actualizar precio de delivery si fue modificado
            if (cfg.labels?.deliveryOptionPrice !== undefined) {
                config.deliveryPrice = parseFloat(cfg.labels.deliveryOptionPrice);
                cartController.render();
            }
        }
    }).catch(() => {
        // En caso de modo offline o demo estático, conserva los valores por defecto
    });
}
