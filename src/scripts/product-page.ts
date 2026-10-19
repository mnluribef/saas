// src/scripts/product-page.ts
// Controlador de la Página Dedicada de Producto
import type { CatalogProduct } from './types/catalog.types';
import { ToastService } from './services/toast.service';
import { BcvCurrencyService } from './services/bcv.service';
import { LocalStorageCartStorage } from './services/storage.service';
import { CartService } from './services/cart.service';
import { syncStoreWithSettings } from './services/store-sync.service';

class ProductPageController {
    private toastService: ToastService;
    private currencyService: BcvCurrencyService;
    private cartService: CartService;
    private tenantId: string | null = null;
    private template = 'restaurant';
    private whatsappNumber = '584241230046';
    private businessName = 'Ventrina Store';

    constructor() {
        this.toastService = new ToastService();
        this.currencyService = new BcvCurrencyService();

        this.resolveContext();

        const storageKey = (this.tenantId || this.businessName).toLowerCase().replace(/[^a-z0-9]/g, '_') || 'default';
        const storage = new LocalStorageCartStorage(storageKey);
        const storeMetaConfig = {
            whatsappNumber: this.whatsappNumber,
            defaultCurrency: '$',
            businessName: this.businessName,
            template: this.template,
            itemNounSingular: 'Artículo',
            itemNounPlural: 'Artículos',
            emptyCartEmoji: '🛒',
            deliveryName: 'Delivery',
            deliveryPrice: 5,
            pickupName: 'Retiro en local',
            storePrefix: 'VEN',
            tenantId: this.tenantId || undefined,
        };
        this.cartService = new CartService(storage, storeMetaConfig);

        this.updateCartBadge();
        this.cartService.subscribe(() => this.updateCartBadge());

        this.init();
    }

    private resolveContext(): void {
        const url = new URL(window.location.href);

        // 1. Tenant
        const metaTenant = document.querySelector('meta[name="ventrina-tenant"], meta[name="vendly-tenant"]')?.getAttribute('content');
        const qsTenant = url.searchParams.get('tenant') || url.searchParams.get('store');
        this.tenantId = metaTenant || qsTenant || null;

        // Si la URL es de la forma /[store]/p/[id]
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 3 && pathParts[1] === 'p') {
            this.tenantId = pathParts[0];
        }

        // 2. Config meta
        const storeMetaEl = document.getElementById('catalog-store-meta');
        if (storeMetaEl) {
            this.whatsappNumber = storeMetaEl.dataset.whatsapp || this.whatsappNumber;
            this.template = storeMetaEl.dataset.template || this.template;
            this.businessName = storeMetaEl.dataset.businessName || this.businessName;
        }

        // 3. Injected tenant config
        const injectedScript = document.getElementById('injected-tenant-config');
        if (injectedScript?.textContent) {
            try {
                const config = JSON.parse(injectedScript.textContent);
                syncStoreWithSettings(config);
                if (config.business?.name) this.businessName = config.business.name;
                if (config.contact?.whatsapp) this.whatsappNumber = config.contact.whatsapp;
            } catch { }
        }
    }

    private resolveProductId(): string | null {
        const url = new URL(window.location.href);

        // 1. Meta tag
        const metaId = document.querySelector('meta[name="ventrina-product-id"], meta[name="vendly-product-id"]')?.getAttribute('content');
        if (metaId) return metaId;

        // 2. Query param
        const qsId = url.searchParams.get('id') || url.searchParams.get('p') || url.searchParams.get('producto');
        if (qsId) return qsId;

        // 3. Path segment (/[store]/p/[id])
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 3 && pathParts[1] === 'p') {
            return pathParts[2];
        }

        return null;
    }

    private updateCartBadge(): void {
        const badge = document.getElementById('cart-count');
        if (badge) {
            badge.textContent = String(this.cartService.getTotalCount());
        }
    }

    private async init(): Promise<void> {
        this.setupNavigationLinks();

        const productId = this.resolveProductId();
        if (!productId) {
            this.showError();
            return;
        }

        await this.loadProduct(productId);
    }

    private setupNavigationLinks(): void {
        const backLink = document.getElementById('pdp-back-link') as HTMLAnchorElement | null;
        const backText = document.getElementById('pdp-back-text');
        const errBackBtn = document.getElementById('pdp-error-back-btn') as HTMLAnchorElement | null;

        const storeUrl = this.tenantId ? `/${this.tenantId}` : `/demo/${this.template}`;
        const storeLabel = this.businessName ? `Volver a ${this.businessName}` : 'Volver a la Tienda';

        if (backLink) {
            backLink.href = storeUrl;
        }
        if (backText) {
            backText.textContent = storeLabel;
        }
        if (errBackBtn) {
            errBackBtn.href = storeUrl;
        }

        // Float cart button click -> redirige a la tienda con ancla o carrito
        document.getElementById('cart-btn')?.addEventListener('click', () => {
            window.location.href = `${storeUrl}#menu`;
        });
    }

    private async loadProduct(productId: string): Promise<void> {
        const loadingEl = document.getElementById('pdp-loading');
        const gridEl = document.getElementById('pdp-grid');

        try {
            const tenantParam = this.tenantId ? `&tenant=${encodeURIComponent(this.tenantId)}` : '';
            const res = await fetch(`/api/products?id=${encodeURIComponent(productId)}${tenantParam}`);
            if (!res.ok) throw new Error('Producto no encontrado');

            const product = (await res.json()) as CatalogProduct;
            this.renderProductDetails(product);

            if (loadingEl) loadingEl.classList.add('store-meta-hidden');
            if (gridEl) gridEl.classList.remove('store-meta-hidden');

            this.loadRelatedProducts(product);
        } catch {
            this.showError();
        }
    }

    private showError(): void {
        const loadingEl = document.getElementById('pdp-loading');
        const errorEl = document.getElementById('pdp-error');
        const gridEl = document.getElementById('pdp-grid');

        if (loadingEl) loadingEl.classList.add('store-meta-hidden');
        if (gridEl) gridEl.classList.add('store-meta-hidden');
        if (errorEl) errorEl.classList.remove('store-meta-hidden');
    }

    private renderProductDetails(product: CatalogProduct): void {
        document.title = `${product.name} | ${this.businessName}`;

        // Breadcrumb
        const crumbCat = document.getElementById('pdp-crumb-category');
        if (crumbCat) crumbCat.textContent = product.category || 'Catálogo';
        const crumbTitle = document.getElementById('pdp-crumb-title');
        if (crumbTitle) crumbTitle.textContent = product.name;

        // Imagen
        const imgEl = document.getElementById('pdp-img') as HTMLImageElement | null;
        if (imgEl) {
            imgEl.src = product.image_url
                ? (product.image_url.startsWith('http') || product.image_url.startsWith('/') ? product.image_url : `/${product.image_url}`)
                : '/assets/favicon.svg';
            imgEl.alt = product.name;
        }

        // Badges
        const badgesEl = document.getElementById('pdp-badges');
        if (badgesEl) {
            let bHtml = '';
            if (product.badge) {
                const promoLabels: Record<string, string> = {
                    destacado: '⭐ Más Vendido',
                    oferta: '🔥 Oferta Especial',
                    nuevo: '✨ Nuevo Ingreso',
                    liquidacion: '🏷️ Liquidación'
                };
                const label = promoLabels[product.badge] || product.badge;
                bHtml += `<span class="promo-badge ${product.badge}">${label}</span> `;
            }
            if (product.stock === 0) {
                bHtml += '<span class="product-stock-badge-danger">Agotado</span>';
            } else if (product.stock !== undefined && product.stock > 0 && product.stock <= 5) {
                bHtml += `<span class="product-stock-badge-warning">¡Últimas ${product.stock} disponibles!</span>`;
            }
            badgesEl.innerHTML = bHtml;
        }

        // Título y Categoría
        const catBadge = document.getElementById('pdp-category-badge');
        if (catBadge) catBadge.textContent = product.category || 'General';

        const nameEl = document.getElementById('pdp-name');
        if (nameEl) nameEl.textContent = product.name;

        const brandModelEl = document.getElementById('pdp-brand-model');
        if (brandModelEl) {
            const parts: string[] = [];
            if (product.sku) parts.push(`SKU: ${product.sku}`);
            if (product.brand) parts.push(`Marca: ${product.brand}`);
            if (product.model) parts.push(`Modelo: ${product.model}`);
            brandModelEl.textContent = parts.join(' · ');
        }

        // Precios y Descuento
        const priceUsdEl = document.getElementById('pdp-price-usd');
        if (priceUsdEl) {
            priceUsdEl.textContent = product.price > 0 ? `$${parseFloat(String(product.price)).toFixed(2)}` : 'A consultar';
        }

        const priceOrigEl = document.getElementById('pdp-price-original');
        const discountBadgeEl = document.getElementById('pdp-discount-badge');
        const comparePrice = parseFloat(String(product.compare_at_price || product.original_price || 0));
        const currentPrice = parseFloat(String(product.price || 0));
        if (comparePrice > currentPrice && currentPrice > 0) {
            if (priceOrigEl) {
                priceOrigEl.textContent = `$${comparePrice.toFixed(2)}`;
                priceOrigEl.classList.remove('store-meta-hidden');
            }
            if (discountBadgeEl) {
                const pct = Math.round(((comparePrice - currentPrice) / comparePrice) * 100);
                discountBadgeEl.textContent = `-${pct}% OFF`;
                discountBadgeEl.classList.remove('store-meta-hidden');
            }
        } else {
            if (priceOrigEl) priceOrigEl.classList.add('store-meta-hidden');
            if (discountBadgeEl) discountBadgeEl.classList.add('store-meta-hidden');
        }

        const updateBcvPrice = () => {
            const rate = this.currencyService.getRate();
            const priceBcvEl = document.getElementById('pdp-price-bcv');
            if (priceBcvEl && product.price > 0) {
                priceBcvEl.textContent = `~Bs. ${(product.price * rate).toFixed(2)}`;
            }
            const stickyBcvEl = document.getElementById('pdp-sticky-bcv');
            if (stickyBcvEl && product.price > 0) {
                stickyBcvEl.textContent = `~Bs. ${(product.price * rate).toFixed(2)}`;
            }
        };
        updateBcvPrice();
        this.currencyService.onRateChange(updateBcvPrice);

        // Sincronizar datos en Barra Flotante Sticky de Móvil
        const stickyThumb = document.getElementById('pdp-sticky-thumb') as HTMLImageElement | null;
        if (stickyThumb && imgEl) stickyThumb.src = imgEl.src;
        const stickyTitle = document.getElementById('pdp-sticky-title');
        if (stickyTitle) stickyTitle.textContent = product.name;
        const stickyPrice = document.getElementById('pdp-sticky-price');
        if (stickyPrice) stickyPrice.textContent = priceUsdEl?.textContent || '$0.00';

        // Descripción
        const descEl = document.getElementById('pdp-desc');
        if (descEl) {
            descEl.textContent = product.description || 'Este producto no cuenta con descripción detallada en este momento.';
        }

        // Variantes y Atributos con valor visible en label
        const attrsBox = document.getElementById('pdp-attributes-container');
        if (attrsBox) {
            let html = '';
            if (product.attributes && product.attributes.length > 0) {
                html = product.attributes.map(attr => {
                    const firstVal = attr.values[0] || '';
                    const opts = attr.type === 'color_swatch'
                        ? `<div class="color-swatch-container" data-attribute="${attr.key}" data-label="${attr.label}">${attr.values.map((val: string, idx: number) => {
                            const slug = val.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                            return `<button type="button" class="color-swatch-btn color-swatch-${slug} ${idx === 0 ? 'active' : ''}" data-value="${val}" title="${val}"></button>`;
                        }).join('')}</div>`
                        : `<div class="attribute-selector" data-attribute="${attr.key}" data-label="${attr.label}">${attr.values.map((val: string, idx: number) => {
                            return `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${val}">${val}</button>`;
                        }).join('')}</div>`;
                    return `<div class="attribute-options-group"><label>${attr.label}: <strong class="attr-selected-value">${firstVal}</strong></label>${opts}</div>`;
                }).join('');
            } else if (product.sizes) {
                const sizesList = product.sizes.split(',').map(s => s.trim()).filter(Boolean);
                const firstSize = sizesList[0] || '';
                html = `<div class="attribute-options-group"><label>Opciones: <strong class="attr-selected-value">${firstSize}</strong></label><div class="attribute-selector" data-attribute="opcion" data-label="Opción">${sizesList.map((size: string, idx: number) => `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${size}">${size}</button>`).join('')}</div></div>`;
            }
            attrsBox.innerHTML = html;

            attrsBox.addEventListener('click', (e) => {
                const btn = (e.target as HTMLElement).closest('.attribute-btn, .color-swatch-btn') as HTMLElement | null;
                if (!btn) return;
                const parent = btn.parentElement;
                if (!parent) return;
                parent.querySelectorAll('.attribute-btn, .color-swatch-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Actualizar valor en label
                const group = btn.closest('.attribute-options-group');
                const valStrong = group?.querySelector('.attr-selected-value');
                const val = btn.getAttribute('data-value');
                if (valStrong && val) {
                    valStrong.textContent = val;
                }
            });
        }

        // Cantidad selector
        const qtyIn = document.getElementById('pdp-qty-input') as HTMLInputElement | null;
        if (qtyIn) {
            qtyIn.value = '1';
            qtyIn.max = String((product.stock !== undefined && product.stock > 0) ? product.stock : 99);
        }

        document.getElementById('pdp-qty-minus')?.addEventListener('click', () => {
            if (!qtyIn) return;
            let v = parseInt(qtyIn.value) || 1;
            if (v > 1) qtyIn.value = String(v - 1);
        });

        document.getElementById('pdp-qty-plus')?.addEventListener('click', () => {
            if (!qtyIn) return;
            let v = parseInt(qtyIn.value) || 1;
            const max = parseInt(qtyIn.max) || 99;
            if (v < max) qtyIn.value = String(v + 1);
        });

        // WhatsApp directo
        const btnWa = document.getElementById('pdp-btn-whatsapp') as HTMLAnchorElement | null;
        if (btnWa) {
            const cleanPhone = String(this.whatsappNumber).replace(/[^\d]/g, '');
            const msg = `¡Hola! Vengo de la página de *${product.name}* en ${this.businessName} ($${parseFloat(String(product.price)).toFixed(2)}). ¿Tienen disponibilidad para ordenar?`;
            btnWa.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }

        // Botón Compartir
        document.getElementById('pdp-btn-share')?.addEventListener('click', async () => {
            const shareUrl = window.location.href;
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `${product.name} | ${this.businessName}`,
                        text: `Mira ${product.name} en ${this.businessName}`,
                        url: shareUrl,
                    });
                    return;
                } catch { }
            }

            try {
                await navigator.clipboard.writeText(shareUrl);
                this.toastService.show('¡Enlace del producto copiado al portapapeles!');
            } catch {
                prompt('Copia este enlace directo del producto:', shareUrl);
            }
        });

        // Botón Agregar al Carrito con feedback animado
        const btnAdd = document.getElementById('pdp-btn-add-cart') as HTMLButtonElement | null;
        const btnAddText = document.getElementById('pdp-btn-add-text');
        const stickyBtn = document.getElementById('pdp-sticky-btn') as HTMLButtonElement | null;

        const handleAddToCartAction = () => {
            const qty = qtyIn ? parseInt(qtyIn.value) || 1 : 1;
            const options: Record<string, string> = {};
            const optionLabels: Record<string, string> = {};

            attrsBox?.querySelectorAll<HTMLElement>('[data-attribute]').forEach((sel) => {
                const key = sel.getAttribute('data-attribute')!;
                const label = sel.getAttribute('data-label') || key;
                const activeBtn = sel.querySelector<HTMLElement>('.active');
                const val = activeBtn?.getAttribute('data-value');
                if (val) {
                    options[key] = val;
                    optionLabels[key] = label;
                }
            });

            this.cartService.addItem(product.id, product.name, product.price, qty, product.icon || 'package', options, optionLabels);
            const optList = Object.values(options).filter(Boolean);
            this.toastService.show(
                `¡Añadido ${qty}x ${product.name}${optList.length ? ` (${optList.join(', ')})` : ''} al pedido!`
            );

            // Feedback visual en botón principal
            if (btnAdd) {
                btnAdd.classList.add('btn-added-state');
                if (btnAddText) btnAddText.textContent = '✓ ¡Añadido!';
                setTimeout(() => {
                    btnAdd.classList.remove('btn-added-state');
                    if (btnAddText) btnAddText.textContent = 'Agregar al Carrito';
                }, 1500);
            }

            // Feedback visual en botón sticky
            if (stickyBtn) {
                stickyBtn.classList.add('btn-added-state');
                const stickyText = document.getElementById('pdp-sticky-btn-text');
                if (stickyText) stickyText.textContent = '✓ ¡Listo!';
                setTimeout(() => {
                    stickyBtn.classList.remove('btn-added-state');
                    if (stickyText) stickyText.textContent = 'Añadir';
                }, 1500);
            }
        };

        if (btnAdd) {
            if (product.stock === 0) {
                btnAdd.disabled = true;
                if (btnAddText) btnAddText.textContent = 'Producto Agotado';
                if (stickyBtn) stickyBtn.disabled = true;
            } else {
                btnAdd.disabled = false;
                btnAdd.addEventListener('click', handleAddToCartAction);
            }
        }

        if (stickyBtn && product.stock !== 0) {
            stickyBtn.addEventListener('click', handleAddToCartAction);
        }

        // Observador para activar la Sticky Bar en Mobile cuando se hace scroll pasando el botón
        this.setupStickyBarObserver();
    }

    private setupStickyBarObserver(): void {
        const stickyBar = document.getElementById('pdp-sticky-bar');
        const buyButton = document.getElementById('pdp-btn-add-cart');
        if (!stickyBar || !buyButton) return;

        if (typeof IntersectionObserver !== 'undefined') {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    // Si el botón principal no está visible en el viewport y está por encima de la pantalla
                    if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
                        stickyBar.classList.add('is-visible');
                    } else {
                        stickyBar.classList.remove('is-visible');
                    }
                });
            }, { threshold: 0.1 });

            observer.observe(buyButton);
        } else {
            window.addEventListener('scroll', () => {
                const rect = buyButton.getBoundingClientRect();
                if (rect.bottom < 0) {
                    stickyBar.classList.add('is-visible');
                } else {
                    stickyBar.classList.remove('is-visible');
                }
            }, { passive: true });
        }
    }

    private async loadRelatedProducts(currentProduct: CatalogProduct): Promise<void> {
        const relatedSection = document.getElementById('pdp-related-section');
        const relatedGrid = document.getElementById('pdp-related-grid');
        if (!relatedSection || !relatedGrid) return;

        try {
            const tenantParam = this.tenantId ? `&tenant=${encodeURIComponent(this.tenantId)}` : '';
            const res = await fetch(`/api/products?template=${encodeURIComponent(this.template)}${tenantParam}`);
            if (!res.ok) return;

            const responseData: any = await res.json();
            const allProducts: CatalogProduct[] = Array.isArray(responseData) ? responseData : responseData?.data || [];

            const related = allProducts
                .filter(p => p.id !== currentProduct.id && (p.category === currentProduct.category || p.type_id === currentProduct.type_id))
                .slice(0, 3);

            if (related.length === 0) return;

            const currentRate = this.currencyService.getRate();

            relatedGrid.innerHTML = related.map(p => {
                const img = p.image_url
                    ? (p.image_url.startsWith('http') || p.image_url.startsWith('/') ? p.image_url : `/${p.image_url}`)
                    : '/assets/favicon.svg';
                const price = p.price > 0 ? `$${parseFloat(String(p.price)).toFixed(2)}` : 'A consultar';
                const bcvPrice = p.price > 0 ? `(~Bs. ${(p.price * currentRate).toFixed(2)})` : '';
                const pUrl = this.tenantId ? `/${this.tenantId}/p/${encodeURIComponent(p.id)}` : `/producto?id=${encodeURIComponent(p.id)}&template=${this.template}`;

                return `
                    <div class="product-card">
                        <a href="${pUrl}" class="product-img">
                            <img src="${img}" alt="${p.name}" loading="lazy">
                        </a>
                        <div class="product-info">
                            <div class="product-header">
                                <h3><a href="${pUrl}">${p.name}</a></h3>
                            </div>
                            <div class="product-price">${price} <span class="product-price-bcv">${bcvPrice}</span></div>
                            <a href="${pUrl}" class="pdm-btn-primary pdp-related-btn">Ver Producto</a>
                        </div>
                    </div>
                `;
            }).join('');

            relatedSection.classList.remove('store-meta-hidden');
        } catch { }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ProductPageController());
} else {
    new ProductPageController();
}
