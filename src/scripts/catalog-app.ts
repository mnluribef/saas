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

export function createStoreConfig(): StoreMetaConfig {
    const storeMetaEl = document.getElementById('catalog-store-meta');
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
    };
}

export function initCatalogApp(): void {
    const config = createStoreConfig();
    const storeKey = config.businessName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'default';
    const storageKey = `vendly_cart_${config.template}_${storeKey}`;

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
}
