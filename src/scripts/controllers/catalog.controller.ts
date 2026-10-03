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

    private readonly colorMap: Record<string, string> = {
        pequeno: '#FFD4C2',
        mediano: '#FF6B35',
        grande: '#C1121F',
        familiar: '#7B2D00',
        res: '#8B1A1A',
        pollo: '#D4822A',
        cerdo: '#C0504D',
        mixto: '#FF6B35',
        veggie: '#2A9D4E',
        blanco: '#F8FAFC',
        negro: '#0F172A',
        nude: '#E8CBB5',
        beige: '#F5F5DC',
        camel: '#C19A6B',
        rojo: '#EF4444',
        azul: '#3B82F6',
        verde: '#10B981',
        amarillo: '#EAB308',
    };

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
        this.currencyService.onRateChange(() => {
            if (this.products.length > 0) {
                this.renderProducts();
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
            const res = await fetch(`/api/products?template=${encodeURIComponent(this.config.template)}`);
            if (!res.ok) throw new Error();
            const responseData: any = await res.json();
            const products: CatalogProduct[] = Array.isArray(responseData)
                ? responseData
                : responseData?.data || [];

            this.products = products;
            this.renderCategoryFilters();
            this.renderProducts();
        } catch {
            const container = document.getElementById('catalog-container');
            if (container) {
                container.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;background:var(--bg-section);border-radius:12px;border:1px solid var(--border-subtle);">
                        ${renderIconSvg('x-circle', { size: 48, stroke: 'var(--primary)', style: 'margin-bottom:1rem;opacity:0.8;' })}
                        <h3 style="color:var(--text-heading);margin-bottom:0.5rem;font-family:var(--font-heading);">No pudimos cargar el catálogo</h3>
                        <p style="color:var(--text-muted);margin-bottom:1.5rem;">Hubo un error de conexión con el servidor. Por favor, intenta de nuevo.</p>
                        <button onclick="window.location.reload()" style="background:var(--primary);color:var(--bg-card);border:none;padding:0.75rem 1.5rem;border-radius:50px;font-weight:600;cursor:pointer;transition:all 0.2s;">Recargar Página</button>
                    </div>`;
            }
        }
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
            container.innerHTML =
                '<div style="grid-column:1/-1;text-align:center;padding:3rem 0;color:var(--text-secondary)"><p>No se encontraron productos que coincidan con tu búsqueda.</p></div>';
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
                                              const hex =
                                                  this.colorMap[val.toLowerCase().trim()] || val;
                                              const lightClass = [
                                                  'blanco',
                                                  'amarillo',
                                                  'beige',
                                                  'white',
                                                  'yellow',
                                              ].includes(val.toLowerCase().trim())
                                                  ? 'light-color'
                                                  : '';
                                              return `<button class="color-swatch-btn ${idx === 0 ? 'active' : ''} ${lightClass}" style="background-color:${hex};" data-value="${val}" title="${val}"></button>`;
                                          })
                                          .join('')}</div>`
                                    : `<div class="attribute-selector" data-attribute="${attr.key}" data-label="${attr.label}" data-product="${p.id}">${attr.values
                                          .map(
                                              (val: string, idx: number) =>
                                                  `<button class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${val}">${val}</button>`
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
                                      `<button class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${size.trim()}">${size.trim()}</button>`
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
                        ? `$${parseFloat(String(p.price)).toFixed(2)} <span style="font-size:0.85rem; font-weight:normal; color:var(--text-light); margin-left:4px;">(~Bs. ${(p.price * currentBcvRate).toFixed(2)})</span>`
                        : 'A consultar';

                return `
          <div class="product-card reveal">
            <div class="product-img"><img src="${productImg}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='/assets/favicon.svg';"></div>
            <div class="product-info">
              <div class="product-header"><h3>${p.name}</h3></div>
              <div class="product-price" style="font-size:1.3rem;font-weight:700;color:var(--accent);margin:.5rem 0 .8rem;font-family:'Outfit',sans-serif;">${priceDisplay}</div>
              <p class="product-desc" style="min-height:auto;margin-bottom:1.2rem;">${p.description || ''}</p>
              ${attributesHtml}${legacySizesHtml}
              <div class="product-actions">
                <div class="main-qty-selector">
                  <button class="qty-btn-main minus" data-id="${p.id}">-</button>
                  <input type="number" value="1" min="1" id="qty-${p.id}" class="qty-input">
                  <button class="qty-btn-main plus" data-id="${p.id}">+</button>
                </div>
                <button class="cta-btn product-cta add-to-cart" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-input="qty-${p.id}" data-icon="${p.icon || 'package'}">Agregar</button>
              </div>
            </div>
          </div>`;
            })
            .join('');

        initScrollReveal();
    }

    private bindEvents(): void {
        // Event delegation para productos (atributos, selector de cantidad, agregar al carrito)
        document.getElementById('catalog-container')?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

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
