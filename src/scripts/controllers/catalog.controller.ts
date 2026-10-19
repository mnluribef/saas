import type { CatalogProduct, StoreMetaConfig, TemplateCategory } from '../types/catalog.types';
import type { CartService } from '../services/cart.service';
import type { ICurrencyService } from '../services/bcv.service';
import type { IToastService } from '../services/toast.service';
import { initScrollReveal } from '../utils/reveal.util';
import { renderIconSvg } from '../../components/common/icons';

export class CatalogController {
    private cartService: CartService;
    private currencyService: ICurrencyService;
    private toastService: IToastService;
    private config: StoreMetaConfig;

    private products: CatalogProduct[] = [];
    private activeCategory = 'all';
    private searchQuery = '';
    private pageSize = 6;
    private visibleCount = 6;
    private categoryNames: Record<string, string> = {};
    private currentModalProduct: CatalogProduct | null = null;

    constructor(
        cartService: CartService,
        currencyService: ICurrencyService,
        toastService: IToastService,
        config: StoreMetaConfig
    ) {
        this.cartService = cartService;
        this.currencyService = currencyService;
        this.toastService = toastService;
        this.config = config;

        this.init();
    }

    private init(): void {
        this.initCategories();
        this.bindEvents();
        this.setupModalEvents();
        this.currencyService.onRateChange(() => {
            if (this.products.length > 0) {
                this.renderProducts();
                if (this.currentModalProduct) {
                    const priceBcvEl = document.getElementById('pdm-price-bcv');
                    if (priceBcvEl && this.currentModalProduct.price > 0) {
                        const currentRate = this.currencyService.getRate();
                        priceBcvEl.textContent = `~Bs. ${(this.currentModalProduct.price * currentRate).toFixed(2)}`;
                    }
                }
            }
        });
    }

    private initCategories(): void {
        let templateCategories: TemplateCategory[] = [];
        try {
            const jsonText = document.getElementById('catalog-template-categories')?.textContent || '[]';
            templateCategories = JSON.parse(jsonText);
        } catch {
            templateCategories = [];
        }

        this.categoryNames = {
            all: `Todo ${this.config.emptyCartEmoji || '✨'}`,
        };
        for (const cat of templateCategories) {
            this.categoryNames[cat.id] = cat.name;
        }
    }

    public async loadCatalog(): Promise<void> {
        try {
            const tenantParam = this.config.tenantId ? `&tenant=${encodeURIComponent(this.config.tenantId)}` : '';
            const reqHeaders: Record<string, string> = {};
            if (this.config.tenantId) {
                reqHeaders['X-Tenant-Id'] = this.config.tenantId;
            }
            const res = await fetch(`/api/products?template=${encodeURIComponent(this.config.template)}${tenantParam}`, {
                headers: reqHeaders
            });
            if (!res.ok) throw new Error();
            const responseData: any = await res.json();
            const products: CatalogProduct[] = Array.isArray(responseData)
                ? responseData
                : responseData?.data || [];

            this.products = products;
            this.renderCategoryFilters();
            this.renderProducts();
            this.checkDirectProductAccess();
        } catch {
            const container = document.getElementById('catalog-container');
            if (container) {
                container.innerHTML = `
                    <div class="catalog-error-box">
                        <div class="catalog-error-icon-wrap">
                            ${renderIconSvg('alert-circle', { size: 36, class: 'catalog-error-icon' })}
                        </div>
                        <h3 class="catalog-error-title">No pudimos cargar el catálogo</h3>
                        <p class="catalog-error-msg">Hubo un error de conexión con el servidor. Por favor, intenta de nuevo.</p>
                        <button id="btn-reload-catalog" class="catalog-error-btn" type="button">
                            ${renderIconSvg('repeat', { size: 16, class: 'catalog-error-btn-icon' })}
                            <span>Recargar Página</span>
                        </button>
                    </div>`;
                document.getElementById('btn-reload-catalog')?.addEventListener('click', () => {
                    window.location.reload();
                });
            }
        }
    }

    private checkDirectProductAccess(): void {
        const urlParams = new URLSearchParams(window.location.search);
        const directId = urlParams.get('p') || urlParams.get('producto');
        if (!directId) return;

        const product = this.products.find(p => p.id === directId);
        if (product) {
            if (this.config.productDetailViewMode === 'page') {
                window.location.href = this.getProductUrl(product.id);
            } else {
                this.openProductModal(product);
            }
        }
    }

    public getProductUrl(productId: string): string {
        const hostname = window.location.hostname.toLowerCase();
        const isSubdomain = hostname.endsWith('.ventrina.app') || 
                            hostname.endsWith('.localhost') || 
                            (this.config.tenantId && hostname.startsWith(`${this.config.tenantId.toLowerCase()}.`));
        if (isSubdomain) {
            return `/p/${encodeURIComponent(productId)}`;
        }
        if (this.config.tenantId) {
            return `/${this.config.tenantId}/p/${encodeURIComponent(productId)}`;
        }
        return `/producto?id=${encodeURIComponent(productId)}&template=${encodeURIComponent(this.config.template)}`;
    }

    private renderCategoryFilters(): void {
        const container = document.getElementById('category-filters');
        if (!container) return;

        const types = new Set<string>(
            this.products.map((p) => p.type_id || p.category || '').filter(Boolean)
        );
        const toRender = ['all', ...Array.from(types)];

        container.innerHTML = toRender
            .map((type) => {
                const name =
                    this.categoryNames[type] ||
                    type.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                return `<button class="category-filter-btn ${this.activeCategory === type ? 'active' : ''}" data-category="${type}">${name}</button>`;
            })
            .join('');
    }

    private renderProducts(): void {
        const container = document.getElementById('catalog-container');
        const loadMoreContainer = document.getElementById('load-more-container');
        if (!container) return;

        let filtered =
            this.activeCategory === 'all'
                ? this.products
                : this.products.filter((p) => (p.type_id || p.category) === this.activeCategory);

        if (this.searchQuery.trim() !== '') {
            const q = this.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(
                (p) =>
                    p.name.toLowerCase().includes(q) ||
                    (p.description && p.description.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="catalog-empty-state">
                    <div class="catalog-empty-icon-wrap">
                        ${renderIconSvg('search', { size: 30, class: 'catalog-empty-icon' })}
                    </div>
                    <p class="catalog-empty-msg">No se encontraron productos que coincidan con tu búsqueda.</p>
                </div>`;
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            return;
        }

        const paginated = filtered.slice(0, this.visibleCount);

        if (loadMoreContainer) {
            loadMoreContainer.style.display = filtered.length > this.visibleCount ? 'block' : 'none';
        }

        const currentBcvRate = this.currencyService.getRate();

        container.innerHTML = paginated
            .map((p) => {
                let attributesHtml = '';
                if (p.attributes && p.attributes.length > 0) {
                    attributesHtml = p.attributes
                        .map((attr) => {
                            const optionsHtml =
                                attr.type === 'color_swatch'
                                    ? `<div class="color-swatch-container" data-attribute="${attr.key}" data-label="${attr.label}" data-product="${p.id}">${attr.values
                                          .map((val: string, idx: number) => {
                                              const isLight = ['blanco', 'amarillo', 'beige', 'marfil', 'crema'].includes(val.toLowerCase().trim());
                                              const lightClass = isLight ? 'light-color' : '';
                                              const slug = val.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                                              return `<button type="button" class="color-swatch-btn color-swatch-${slug} ${idx === 0 ? 'active' : ''} ${lightClass}" data-value="${val}" title="${val}"></button>`;
                                          })
                                          .join('')}</div>`
                                    : `<div class="attribute-selector" data-attribute="${attr.key}" data-label="${attr.label}" data-product="${p.id}">${attr.values
                                          .map(
                                              (val: string, idx: number) =>
                                                  `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${val}">${val}</button>`
                                          )
                                          .join('')}</div>`;
                            return `<div class="attribute-options-group"><label>${attr.label}:</label>${optionsHtml}</div>`;
                        })
                        .join('');
                }

                const legacySizesHtml =
                    p.sizes && (!p.attributes || p.attributes.length === 0)
                        ? `<div class="attribute-options-group"><label>Opciones:</label><div class="attribute-selector" data-attribute="opcion" data-label="Opción" data-product="${p.id}">${p.sizes
                              .split(',')
                              .map(
                                  (size: string, idx: number) =>
                                      `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${size.trim()}">${size.trim()}</button>`
                              )
                              .join('')}</div></div>`
                        : '';

                const productImg = p.image_url
                    ? p.image_url.startsWith('http') || p.image_url.startsWith('/')
                        ? p.image_url
                        : `/${p.image_url}`
                    : '/assets/favicon.svg';

                const priceDisplay =
                    p.price > 0
                        ? `$${parseFloat(String(p.price)).toFixed(2)} <span class="product-price-bcv">(~Bs. ${(p.price * currentBcvRate).toFixed(2)})</span>`
                        : 'A consultar';

                let displayName = p.name;
                let unitBadge = '';
                const unitMatch = p.name.match(/(?:\s*\(([^)]+)\))$/);
                if (unitMatch) {
                    displayName = p.name.replace(unitMatch[0], '');
                    unitBadge = `<span class="product-unit-badge">${unitMatch[1]}</span>`;
                }

                let isOutOfStock = p.stock !== undefined && p.stock !== null && p.stock === 0;
                let stockBadge = '';
                if (isOutOfStock) {
                    stockBadge = `<span class="product-stock-badge-danger">Agotado</span>`;
                } else if (p.stock !== undefined && p.stock !== null && p.stock > 0 && p.stock <= 5) {
                    stockBadge = `<span class="product-stock-badge-warning">¡Últimas ${p.stock} disp.!</span>`;
                }

                let brandBadge = p.brand ? `<span class="product-brand-badge">${p.brand}</span>` : '';
                let modelBadge = p.model ? `<span class="product-model-badge">${p.model}</span>` : '';
                let badgesHtml = (brandBadge || modelBadge || stockBadge) ? `<div class="product-badges">${brandBadge}${modelBadge}${stockBadge}</div>` : '';

                return `
          <div class="product-card reveal" data-product-id="${p.id}">
            <div class="product-img" data-action="open-detail" data-id="${p.id}">
              <img src="${productImg}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='/assets/favicon.svg';">
            </div>
            <div class="product-info">
              <div class="product-header" data-action="open-detail" data-id="${p.id}">
                <h3><span>${displayName}</span>${unitBadge}</h3>
              </div>
              ${badgesHtml}
              <div class="product-price">${priceDisplay}</div>
              <p class="product-desc">${p.description || ''}</p>
              ${attributesHtml}${legacySizesHtml}
              <div class="product-actions">
                ${isOutOfStock ? `
                  <button type="button" class="cta-btn product-cta add-to-cart btn-out-of-stock" disabled>Agotado</button>
                ` : `
                  <div class="main-qty-selector">
                    <button type="button" class="qty-btn-main minus" data-id="${p.id}">-</button>
                    <input type="number" value="1" min="1" max="${(p.stock !== undefined && p.stock > 0) ? p.stock : 99}" id="qty-${p.id}" class="qty-input">
                    <button type="button" class="qty-btn-main plus" data-id="${p.id}">+</button>
                  </div>
                  <button type="button" class="cta-btn product-cta add-to-cart" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-input="qty-${p.id}" data-icon="${p.icon || 'package'}">Agregar</button>
                `}
              </div>
              <button type="button" class="product-quick-view-btn" data-action="open-detail" data-id="${p.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Ver Detalles</span>
              </button>
            </div>
          </div>`;
            })
            .join('');

        initScrollReveal();
    }

    public openProductModal(product: CatalogProduct): void {
        this.currentModalProduct = product;
        const modal = document.getElementById('product-detail-modal');
        if (!modal) return;

        const imgEl = document.getElementById('pdm-image') as HTMLImageElement | null;
        if (imgEl) {
            imgEl.src = product.image_url
                ? (product.image_url.startsWith('http') || product.image_url.startsWith('/') ? product.image_url : `/${product.image_url}`)
                : '/assets/favicon.svg';
            imgEl.alt = product.name;
        }

        const titleEl = document.getElementById('pdm-title');
        if (titleEl) titleEl.textContent = product.name;

        const catEl = document.getElementById('pdm-category');
        if (catEl) {
            const catKey = product.category || product.type_id || 'general';
            catEl.textContent = this.categoryNames[catKey] || catKey;
        }

        const brandModelEl = document.getElementById('pdm-brand-model');
        if (brandModelEl) {
            const parts: string[] = [];
            if (product.brand) parts.push(`Marca: ${product.brand}`);
            if (product.model) parts.push(`Modelo: ${product.model}`);
            brandModelEl.textContent = parts.join(' · ');
        }

        const priceUsdEl = document.getElementById('pdm-price-usd');
        if (priceUsdEl) {
            priceUsdEl.textContent = product.price > 0 ? `$${parseFloat(String(product.price)).toFixed(2)}` : 'A consultar';
        }

        // Descuento en modal
        const priceOrigEl = document.getElementById('pdm-price-original');
        const discountBadgeEl = document.getElementById('pdm-discount-badge');
        if (product.original_price && product.original_price > product.price) {
            if (priceOrigEl) {
                priceOrigEl.textContent = `$${parseFloat(String(product.original_price)).toFixed(2)}`;
                priceOrigEl.classList.remove('store-meta-hidden');
            }
            if (discountBadgeEl) {
                const pct = Math.round(((product.original_price - product.price) / product.original_price) * 100);
                discountBadgeEl.textContent = `-${pct}% OFF`;
                discountBadgeEl.classList.remove('store-meta-hidden');
            }
        } else {
            if (priceOrigEl) priceOrigEl.classList.add('store-meta-hidden');
            if (discountBadgeEl) discountBadgeEl.classList.add('store-meta-hidden');
        }

        const currentRate = this.currencyService.getRate();
        const priceBcvEl = document.getElementById('pdm-price-bcv');
        if (priceBcvEl) {
            priceBcvEl.textContent = product.price > 0 ? `~Bs. ${(product.price * currentRate).toFixed(2)}` : '';
        }

        const descEl = document.getElementById('pdm-description');
        if (descEl) {
            descEl.textContent = product.description || 'Sin descripción detallada para este producto.';
        }

        // Badges en modal
        const badgesEl = document.getElementById('pdm-badges');
        if (badgesEl) {
            let bHtml = '';
            if (product.stock === 0) {
                bHtml += '<span class="product-stock-badge-danger">Agotado</span>';
            } else if (product.stock !== undefined && product.stock > 0 && product.stock <= 5) {
                bHtml += `<span class="product-stock-badge-warning">¡Últimas ${product.stock} disp.!</span>`;
            }
            badgesEl.innerHTML = bHtml;
        }

        // Variantes y atributos en modal con valor en label
        const attrsContainer = document.getElementById('pdm-attributes-container');
        if (attrsContainer) {
            let html = '';
            if (product.attributes && product.attributes.length > 0) {
                html = product.attributes.map(attr => {
                    const firstVal = attr.values[0] || '';
                    const opts = attr.type === 'color_swatch'
                        ? `<div class="color-swatch-container" data-attribute="${attr.key}" data-label="${attr.label}" data-product="${product.id}">${attr.values.map((val: string, idx: number) => {
                            const slug = val.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                            return `<button type="button" class="color-swatch-btn color-swatch-${slug} ${idx === 0 ? 'active' : ''}" data-value="${val}" title="${val}"></button>`;
                        }).join('')}</div>`
                        : `<div class="attribute-selector" data-attribute="${attr.key}" data-label="${attr.label}" data-product="${product.id}">${attr.values.map((val: string, idx: number) => {
                            return `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${val}">${val}</button>`;
                        }).join('')}</div>`;
                    return `<div class="attribute-options-group"><label>${attr.label}: <strong class="attr-selected-value">${firstVal}</strong></label>${opts}</div>`;
                }).join('');
            } else if (product.sizes) {
                const sizesList = product.sizes.split(',').map(s => s.trim()).filter(Boolean);
                const firstSize = sizesList[0] || '';
                html = `<div class="attribute-options-group"><label>Opciones: <strong class="attr-selected-value">${firstSize}</strong></label><div class="attribute-selector" data-attribute="opcion" data-label="Opción" data-product="${product.id}">${sizesList.map((size: string, idx: number) => `<button type="button" class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${size}">${size}</button>`).join('')}</div></div>`;
            }
            attrsContainer.innerHTML = html;
        }

        // Reset cantidad
        const qtyIn = document.getElementById('pdm-qty-input') as HTMLInputElement | null;
        if (qtyIn) {
            qtyIn.value = '1';
            qtyIn.max = String((product.stock !== undefined && product.stock > 0) ? product.stock : 99);
        }

        // WhatsApp directo
        const btnWa = document.getElementById('pdm-btn-whatsapp') as HTMLAnchorElement | null;
        if (btnWa) {
            const cleanPhone = String(this.config.whatsappNumber).replace(/[^\d]/g, '');
            const msg = `¡Hola! Me interesa el producto *${product.name}* ($${parseFloat(String(product.price)).toFixed(2)}). ¿Tienen disponibilidad inmediata?`;
            btnWa.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }

        // Botón Compartir
        const btnShare = document.getElementById('pdm-btn-share');
        if (btnShare) {
            btnShare.style.display = this.config.productDetailShareBtn === 'disabled' ? 'none' : 'flex';
        }

        // Botón Agregar al carrito estado de stock
        const btnAdd = document.getElementById('pdm-btn-add-cart') as HTMLButtonElement | null;
        if (btnAdd) {
            if (product.stock === 0) {
                btnAdd.disabled = true;
                btnAdd.textContent = 'Agotado';
            } else {
                btnAdd.disabled = false;
                btnAdd.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="8" cy="21" r="1"></circle>
                        <circle cx="19" cy="21" r="1"></circle>
                        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                    </svg>
                    <span>Agregar al Pedido</span>
                `;
            }
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // URL history update
        const url = new URL(window.location.href);
        url.searchParams.set('p', product.id);
        window.history.pushState({ modalOpen: true, productId: product.id }, '', url.toString());
    }

    public closeProductModal(): void {
        const modal = document.getElementById('product-detail-modal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        this.currentModalProduct = null;

        const url = new URL(window.location.href);
        if (url.searchParams.has('p') || url.searchParams.has('producto')) {
            url.searchParams.delete('p');
            url.searchParams.delete('producto');
            window.history.pushState({}, '', url.pathname + (url.search ? url.search : ''));
        }
    }

    public async shareProduct(product: CatalogProduct): Promise<void> {
        const shareUrl = this.config.productDetailViewMode === 'page'
            ? `${window.location.origin}${this.getProductUrl(product.id)}`
            : `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(product.id)}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${product.name} | ${this.config.businessName}`,
                    text: `Mira ${product.name} en ${this.config.businessName}`,
                    url: shareUrl,
                });
                return;
            } catch {
                // Fallback al portapapeles si el usuario cancela o no es compatible
            }
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            this.toastService.show('¡Enlace del producto copiado al portapapeles!');
        } catch {
            prompt('Copia este enlace directo del producto:', shareUrl);
        }
    }

    private setupModalEvents(): void {
        const modal = document.getElementById('product-detail-modal');
        if (!modal) return;

        // Botón cerrar
        document.getElementById('pdm-close-btn')?.addEventListener('click', () => {
            this.closeProductModal();
        });

        // Clic en backdrop
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeProductModal();
            }
        });

        // Tecla Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                this.closeProductModal();
            }
        });

        // Navegación historial
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const pId = urlParams.get('p') || urlParams.get('producto');
            if (!pId && modal.classList.contains('active')) {
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
                this.currentModalProduct = null;
            } else if (pId) {
                const product = this.products.find(p => p.id === pId);
                if (product) this.openProductModal(product);
            }
        });

        // Cantidad +/- en modal
        const qtyInput = document.getElementById('pdm-qty-input') as HTMLInputElement | null;
        document.getElementById('pdm-qty-minus')?.addEventListener('click', () => {
            if (!qtyInput) return;
            let v = parseInt(qtyInput.value) || 1;
            if (v > 1) qtyInput.value = String(v - 1);
        });

        document.getElementById('pdm-qty-plus')?.addEventListener('click', () => {
            if (!qtyInput) return;
            let v = parseInt(qtyInput.value) || 1;
            const max = parseInt(qtyInput.max) || 99;
            if (v < max) qtyInput.value = String(v + 1);
        });

        // Selección de opciones/atributos en modal
        const attrsBox = document.getElementById('pdm-attributes-container');
        attrsBox?.addEventListener('click', (e) => {
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

        // Botón agregar al carrito en modal con micro-animación de éxito
        document.getElementById('pdm-btn-add-cart')?.addEventListener('click', () => {
            if (!this.currentModalProduct) return;
            const p = this.currentModalProduct;
            const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

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

            this.cartService.addItem(p.id, p.name, p.price, qty, p.icon || 'package', options, optionLabels);
            const optList = Object.values(options).filter(Boolean);
            this.toastService.show(
                `¡Añadido ${qty}x ${p.name}${optList.length ? ` (${optList.join(', ')})` : ''}!`
            );

            const btnAdd = document.getElementById('pdm-btn-add-cart') as HTMLButtonElement | null;
            const btnText = document.getElementById('pdm-btn-add-text');
            if (btnAdd) {
                btnAdd.classList.add('btn-added-state');
                if (btnText) btnText.textContent = '✓ ¡Añadido!';
            }

            setTimeout(() => {
                if (btnAdd) btnAdd.classList.remove('btn-added-state');
                if (btnText) btnText.textContent = 'Agregar al Pedido';
                this.closeProductModal();
            }, 350);
        });

        // Botón compartir en modal
        document.getElementById('pdm-btn-share')?.addEventListener('click', () => {
            if (this.currentModalProduct) {
                this.shareProduct(this.currentModalProduct);
            }
        });
    }

    private bindEvents(): void {
        // Event delegation para productos (atributos, selector de cantidad, agregar al carrito, abrir detalle)
        document.getElementById('catalog-container')?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Abrir detalle de producto (clic en imagen, encabezado o botón "Ver Detalles")
            const detailTrigger = target.closest('[data-action="open-detail"]') as HTMLElement | null;
            if (detailTrigger) {
                const id = detailTrigger.getAttribute('data-id');
                if (id) {
                    if (this.config.productDetailViewMode === 'page') {
                        window.location.href = this.getProductUrl(id);
                    } else {
                        const product = this.products.find(p => p.id === id);
                        if (product) this.openProductModal(product);
                    }
                }
                return;
            }

            // Selección de variantes/atributos
            const optionBtn = target.closest('.attribute-btn, .color-swatch-btn') as HTMLElement | null;
            if (optionBtn) {
                const selector = optionBtn.parentElement!;
                selector
                    .querySelectorAll('.attribute-btn, .color-swatch-btn')
                    .forEach((b) => b.classList.remove('active'));
                optionBtn.classList.add('active');
                return;
            }

            // Botones +/- de cantidad
            const qtyBtn = target.closest('.qty-btn-main') as HTMLElement | null;
            if (qtyBtn) {
                const id = qtyBtn.getAttribute('data-id')!;
                const input = document.getElementById(`qty-${id}`) as HTMLInputElement | null;
                if (input) {
                    let val = parseInt(input.value) || 1;
                    if (qtyBtn.classList.contains('plus')) val++;
                    else if (qtyBtn.classList.contains('minus') && val > 1) val--;
                    input.value = String(val);
                }
                return;
            }

            // Botón Agregar al Carrito
            const addBtn = target.closest('.add-to-cart') as HTMLElement | null;
            if (addBtn) {
                const id = addBtn.getAttribute('data-id')!;
                const name = addBtn.getAttribute('data-name')!;
                const price = parseFloat(addBtn.getAttribute('data-price') || '0');
                const icon = addBtn.getAttribute('data-icon') || 'package';
                const input = document.getElementById(
                    addBtn.getAttribute('data-input')!
                ) as HTMLInputElement | null;
                const qty = input ? parseInt(input.value) || 1 : 1;

                const options: Record<string, string> = {};
                const optionLabels: Record<string, string> = {};
                const card = addBtn.closest('.product-card');
                card?.querySelectorAll<HTMLElement>('[data-attribute]').forEach((sel) => {
                    const key = sel.getAttribute('data-attribute')!;
                    const label = sel.getAttribute('data-label') || key;
                    const activeBtn = sel.querySelector<HTMLElement>('.active');
                    const val = activeBtn?.getAttribute('data-value');
                    if (val) {
                        options[key] = val;
                        optionLabels[key] = label;
                    }
                });

                this.cartService.addItem(id, name, price, qty, icon, options, optionLabels);
                if (input) input.value = '1';

                const optList = Object.values(options).filter(Boolean);
                this.toastService.show(
                    `¡Añadido ${qty}x ${name}${optList.length ? ` (${optList.join(', ')})` : ''}!`
                );
            }
        });

        // Filtro de categorías
        document.getElementById('category-filters')?.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('.category-filter-btn') as HTMLElement | null;
            if (!btn) return;
            this.activeCategory = btn.getAttribute('data-category')!;
            document
                .querySelectorAll('.category-filter-btn')
                .forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            this.visibleCount = this.pageSize;
            this.renderProducts();
        });

        // Buscador
        const searchInput = document.getElementById('product-search') as HTMLInputElement | null;
        const clearSearchBtn = document.getElementById('clear-search');

        searchInput?.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = this.searchQuery.length > 0 ? 'flex' : 'none';
            }
            this.visibleCount = this.pageSize;
            this.renderProducts();
        });

        clearSearchBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                this.searchQuery = '';
                clearSearchBtn.style.display = 'none';
                this.visibleCount = this.pageSize;
                this.renderProducts();
                searchInput.focus();
            }
        });

        // Botón Cargar Más
        document.getElementById('load-more-btn')?.addEventListener('click', () => {
            this.visibleCount += this.pageSize;
            this.renderProducts();
        });
    }
}
