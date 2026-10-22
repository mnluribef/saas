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
    if (storeMetaEl?.dataset.isDemo === 'true') return 'demo';
    if (storeMetaEl?.dataset.tenant) return storeMetaEl.dataset.tenant;

    const isDemoPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/demo/');
    if (isDemoPath) return 'demo';

    const metaTag = document.querySelector('meta[name="ventrina-tenant"]');
    const metaTenant = metaTag?.getAttribute('content');
    if (metaTenant) return metaTenant;

    const qs = new URLSearchParams(window.location.search).get('tenant');
    if (qs) return qs;

    // Extracción de subdominio (ej: mitienda.ventrina.app o mitienda.localhost)
    if (typeof window !== 'undefined' && window.location.hostname) {
        const host = window.location.hostname.toLowerCase();
        if (host.endsWith('.ventrina.app') || host.endsWith('.vendly.app')) {
            const sub = host.split('.')[0];
            if (sub && sub !== 'www' && sub !== 'app') return sub;
        }
        if (host.endsWith('.localhost')) {
            const sub = host.split('.')[0];
            if (sub && sub !== 'www') return sub;
        }
    }

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        let candidate = pathParts[0].toLowerCase();
        if (candidate === 's' && pathParts.length > 1) {
            candidate = pathParts[1].toLowerCase();
        }
        const SYSTEM_PATHS = new Set(['api', 'admin', 'login', 'register', 'precios', 'superadmin', 'demo', 'assets', '_astro', 'terminos', 'producto']);
        if (candidate && !SYSTEM_PATHS.has(candidate) && !candidate.includes('.')) {
            return candidate;
        }
    }

    return undefined;
}

export function createStoreConfig(): StoreMetaConfig {
    const storeMetaEl = document.getElementById('catalog-store-meta');
    const isDemo = Boolean(
        storeMetaEl?.dataset.isDemo === 'true' ||
        (typeof window !== 'undefined' && window.location.pathname.startsWith('/demo/'))
    );
    const tenantId = isDemo ? 'demo' : resolveActiveTenantId();
    if (tenantId && tenantId !== 'demo') {
        const templateBar = document.getElementById('ventrina-template-bar');
        if (templateBar) templateBar.remove();
    }
    return {
        whatsappNumber: storeMetaEl?.dataset.whatsapp || '584241230046',
        defaultCurrency: storeMetaEl?.dataset.currency || '$',
        businessName: storeMetaEl?.dataset.businessName || 'Ventrina Store',
        template: storeMetaEl?.dataset.template || 'restaurant',
        itemNounSingular: storeMetaEl?.dataset.itemNounSingular || 'Artículo',
        itemNounPlural: storeMetaEl?.dataset.itemNounPlural || 'Artículos',
        emptyCartEmoji: storeMetaEl?.dataset.emptyCartEmoji || '🛒',
        deliveryName: storeMetaEl?.dataset.deliveryName || 'Delivery',
        deliveryPrice: parseFloat(storeMetaEl?.dataset.deliveryPrice || '5'),
        pickupName: storeMetaEl?.dataset.pickupName || 'Retiro en local',
        storePrefix: storeMetaEl?.dataset.storePrefix || 'VEN',
        tenantId,
        isDemo,
        productDetailViewMode: (storeMetaEl?.dataset.productDetailViewMode as 'modal' | 'page') || 'modal',
        productDetailShareBtn: (storeMetaEl?.dataset.productDetailShareBtn as 'enabled' | 'disabled') || 'enabled',
    };
}

export function applyFullTenantConfig(
    cfg: any,
    config: StoreMetaConfig,
    cartController?: CartUIController
): void {
    if (!cfg || config.isDemo) return;

    // Sincronizar DOM de textos, hero, catálogo, beneficios, testimonios, FAQs, footer
    syncStoreWithSettings(cfg);

    const b = cfg.business || {};
    const c = cfg.contact || {};
    const pm = cfg.payment?.pagoMovil;
    const z = cfg.payment?.zelle;
    const l = cfg.labels || {};

    if (b.name) {
        config.businessName = b.name;
    }

    if (c.whatsapp) {
        config.whatsappNumber = c.whatsapp;
        const waFloat = document.querySelector('.float-wa') as HTMLAnchorElement | null;
        if (waFloat) {
            const storeName = b.name || config.businessName || 'la tienda';
            waFloat.href = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Hola! Vengo de ${storeName} y quiero hacer un pedido`)}`;
        }
    }

    if (l.deliveryOptionName) config.deliveryName = l.deliveryOptionName;
    if (l.pickupOptionName) config.pickupName = l.pickupOptionName;
    if (l.deliveryOptionPrice !== undefined) config.deliveryPrice = parseFloat(l.deliveryOptionPrice);
    if (l.itemNounSingular) config.itemNounSingular = l.itemNounSingular;
    if (l.itemNounPlural) config.itemNounPlural = l.itemNounPlural;
    if (l.emptyCartEmoji) config.emptyCartEmoji = l.emptyCartEmoji;
    if (cfg.storePrefix) config.storePrefix = cfg.storePrefix;

    // Actualizar datos de pago móvil en el DOM si fueron configurados
    const pmAccounts = cfg.payment?.pagoMovilAccounts && Array.isArray(cfg.payment.pagoMovilAccounts) && cfg.payment.pagoMovilAccounts.length > 0
        ? cfg.payment.pagoMovilAccounts
        : (pm ? [{ banco: pm.banco || '', telefono: pm.telefono || '', cedula: pm.cedula || '', titular: pm.titular || '', isDefault: true }] : []);

    if (cartController && pmAccounts.length > 0) {
        cartController.setPagoMovilAccounts(pmAccounts);
    } else {
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

    if (cartController) {
        cartController.render();
    }
}

export function initCatalogApp(): void {
    const config = createStoreConfig();
    const storeKey = (config.tenantId || config.businessName).toLowerCase().replace(/[^a-z0-9]/g, '_') || 'default';
    const storageKey = `ventrina_cart_${config.template}_${storeKey}`;

    // Hidratación instantánea si fue inyectada por el servidor
    const injectedConfigEl = document.getElementById('injected-tenant-config');
    let preloadedConfig: any = null;
    if (injectedConfigEl && injectedConfigEl.textContent) {
        try {
            preloadedConfig = JSON.parse(injectedConfigEl.textContent);
        } catch (_) { }
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

    // Aplicar configuración prehidratada antes del primer render
    if (preloadedConfig) {
        applyFullTenantConfig(preloadedConfig, config, cartController);
    }

    // Inicialización global
    initScrollReveal();
    currencyService.fetchRate();
    catalogController.loadCatalog();
    cartController.render();

    // Sincronizar en vivo configuraciones personalizadas solo si es una tienda real de tenant (no demo)
    if (!config.isDemo && config.tenantId && config.tenantId !== 'demo') {
        const settingsUrl = `/api/settings?tenant=${encodeURIComponent(config.tenantId)}`;
        const reqHeaders: Record<string, string> = {
            'X-Tenant-Id': config.tenantId
        };

        fetch(settingsUrl, { headers: reqHeaders }).then(res => res.json() as Promise<any>).then((data: any) => {
            if (data.success && data.tenant?.config) {
                applyFullTenantConfig(data.tenant.config, config, cartController);
            }
        }).catch(() => {
            // En caso de modo offline, conserva los valores por defecto
        });
    }
}
