// src/scripts/services/store-sync.service.ts
// Sincroniza dinámicamente y con alto rendimiento todos los textos, imágenes y secciones de la tienda desde /api/settings

import { getPalette, generatePaletteCss } from '../../config/palettes';
import { initScrollReveal } from '../utils/reveal.util';

const ICON_SVGS: Record<string, string> = {
    flame: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    zap: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    award: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
    shield: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    truck: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    heart: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    package: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    'message-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>',
    sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>'
};

const STAR_SVG = '<svg viewBox="0 0 24 24" class="star-svg"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>';

// Control de firmas y caché en memoria para evitar mutaciones redundantes y layout thrashing
let lastAppliedPaletteId: string | null = null;
let lastFullConfigSig: string | null = null;
const sectionSignatures = new Map<string, string>();

function hasChanged(key: string, data: unknown): boolean {
    const sig = typeof data === 'object' ? JSON.stringify(data) : String(data);
    if (sectionSignatures.get(key) === sig) return false;
    sectionSignatures.set(key, sig);
    return true;
}

function safeSetText(elOrSelector: Element | string | null, text: string): void {
    const el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
    if (el && el.textContent !== text) {
        el.textContent = text;
    }
}

function safeSetHtml(elOrSelector: Element | string | null, html: string): void {
    const el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
    if (el && el.innerHTML !== html) {
        el.innerHTML = html;
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function applyPalette(paletteId?: string | null): void {
    const normalizedId = paletteId && paletteId !== 'default' ? paletteId : null;
    if (normalizedId === lastAppliedPaletteId) return;
    lastAppliedPaletteId = normalizedId;

    const existing = document.getElementById('dynamic-palette-override') as HTMLStyleElement | null;
    const root = document.documentElement;
    if (!normalizedId) {
        if (existing) existing.remove();
        root.style.removeProperty('--theme-primary');
        root.style.removeProperty('--rose');
        root.style.removeProperty('--theme-primary-hover');
        root.style.removeProperty('--rose-deep');
        root.style.removeProperty('--theme-accent');
        root.style.removeProperty('--gold');
        root.style.removeProperty('--theme-bg-page');
        root.style.removeProperty('--cream');
        root.style.removeProperty('--theme-text-heading');
        root.style.removeProperty('--brown-dark');
        root.style.removeProperty('--theme-hero-bg');
        root.style.removeProperty('--hero-bg');
        return;
    }

    const css = generatePaletteCss(normalizedId);
    if (!css) return;

    let styleEl = existing;
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-palette-override';
        document.head.appendChild(styleEl);
    }
    if (styleEl.textContent !== css) {
        styleEl.textContent = css;
    }

    const pal = getPalette(normalizedId);
    if (!pal || !pal.theme) return;

    const t = pal.theme;

    // Resguardo garantizado de variables CSS principales
    if (t.primaryColor) {
        root.style.setProperty('--theme-primary', t.primaryColor, 'important');
        root.style.setProperty('--rose', t.primaryColor, 'important');
    }
    if (t.primaryHover) {
        root.style.setProperty('--theme-primary-hover', t.primaryHover, 'important');
        root.style.setProperty('--rose-deep', t.primaryHover, 'important');
    }
    if (t.accentColor) {
        root.style.setProperty('--theme-accent', t.accentColor, 'important');
        root.style.setProperty('--gold', t.accentColor, 'important');
    }
    if (t.bgPage) {
        root.style.setProperty('--theme-bg-page', t.bgPage, 'important');
        root.style.setProperty('--cream', t.bgPage, 'important');
    }
    if (t.textHeading) {
        root.style.setProperty('--theme-text-heading', t.textHeading, 'important');
        root.style.setProperty('--brown-dark', t.textHeading, 'important');
    }
    if (t.heroBg) {
        root.style.setProperty('--theme-hero-bg', t.heroBg, 'important');
        root.style.setProperty('--hero-bg', t.heroBg, 'important');
    }
}

export function syncStoreWithSettings(cfg: any): void {
    if (!cfg) return;

    // Fast-exit si la configuración recibida es idéntica a la ya aplicada
    const currentSig = JSON.stringify(cfg);
    if (currentSig === lastFullConfigSig) return;
    lastFullConfigSig = currentSig;

    if (cfg.palette || cfg.theme?.palette) {
        applyPalette(cfg.palette || cfg.theme?.palette);
    }

    const b = cfg.business || {};
    const c = cfg.contact || {};
    const lnd = cfg.landing || {};
    const h = lnd.hero || {};
    const cat = lnd.catalog || {};
    const ben = lnd.benefits || {};
    const prc = lnd.process || {};
    const tst = lnd.testimonials || {};
    const fq = lnd.faq || {};

    const storeName = b.name || '';
    let needsRevealRefresh = false;

    // 1. IDENTIDAD / BRANDING
    if (storeName && document.title !== `${storeName} | Catálogo & Pedidos`) {
        document.title = `${storeName} | Catálogo & Pedidos`;
    }

    // Logo Textos en Header y Footer
    if (hasChanged('logo', { p: b.logoTextPrimary, s: b.logoTextSecondary, name: storeName })) {
        const logoTextEls = document.querySelectorAll('.logo-text');
        const primary = escapeHtml(b.logoTextPrimary || '');
        const secondary = escapeHtml(b.logoTextSecondary || '');
        const safeStoreName = escapeHtml(storeName || '');
        const targetHtml = (primary || secondary)
            ? (secondary ? `<span class="logo-primary">${primary}</span><span class="logo-secondary">${secondary}</span>` : `<span class="logo-primary">${primary}</span>`)
            : (safeStoreName ? `<span class="logo-primary">${safeStoreName}</span>` : '');

        if (targetHtml) {
            logoTextEls.forEach(el => safeSetHtml(el, targetHtml));
        }
    }

    // Footer Copyright
    if (storeName) {
        const footerCopyright = document.querySelector('.footer-copyright');
        if (footerCopyright) {
            safeSetText(footerCopyright, `© ${new Date().getFullYear()} ${storeName}. Todos los derechos reservados.`);
        }
    }

    // Logo Imagen en Header
    if (b.logoImage && hasChanged('logoImage', b.logoImage)) {
        const logoLinks = document.querySelectorAll('.logo');
        logoLinks.forEach(link => {
            const existingSvg = link.querySelector('svg');
            if (existingSvg) {
                let imgEl = link.querySelector('.custom-logo-img') as HTMLImageElement | null;
                if (!imgEl) {
                    imgEl = document.createElement('img');
                    imgEl.className = 'custom-logo-img';
                    imgEl.style.height = '32px';
                    imgEl.style.width = 'auto';
                    imgEl.style.marginRight = '0.5rem';
                    imgEl.style.borderRadius = '6px';
                    existingSvg.parentNode?.replaceChild(imgEl, existingSvg);
                }
                if (imgEl.src !== b.logoImage) imgEl.src = b.logoImage;
                imgEl.alt = storeName || 'Logo';
            }
        });
    }

    // Descripción en Footer
    if (b.description) {
        safeSetText('.footer-info > p', b.description);
    }

    // 2. HERO
    if (h.badgeText) {
        safeSetText('.hero-label span', h.badgeText);
    }

    if (h.headline !== undefined || h.headlineHighlight !== undefined) {
        const h1El = document.querySelector('.hero-content h1');
        if (h1El) {
            const headline = h.headline !== undefined ? h.headline : (h1El.childNodes[0]?.textContent?.trim() || '');
            const highlight = h.headlineHighlight !== undefined ? h.headlineHighlight : (h1El.querySelector('em')?.textContent || '');
            safeSetHtml(h1El, `${headline} <em>${highlight}</em>`);
        }
    }

    if (h.subheadline) {
        safeSetText('.hero-content p', h.subheadline);
    }

    if (h.ctaPrimaryText || h.ctaPrimaryLink) {
        const cta1 = document.querySelector('.hero-content a.btn-primary') as HTMLAnchorElement | null;
        if (cta1) {
            if (h.ctaPrimaryLink && cta1.getAttribute('href') !== h.ctaPrimaryLink) cta1.href = h.ctaPrimaryLink;
            if (h.ctaPrimaryText) safeSetText(cta1.querySelector('span'), h.ctaPrimaryText);
        }
    }

    if (h.ctaSecondaryText || h.ctaSecondaryLink) {
        const cta2 = document.querySelector('.hero-content a.btn-secondary') as HTMLAnchorElement | null;
        if (cta2) {
            if (h.ctaSecondaryLink && cta2.getAttribute('href') !== h.ctaSecondaryLink) cta2.href = h.ctaSecondaryLink;
            if (h.ctaSecondaryText) safeSetText(cta2.querySelector('span'), h.ctaSecondaryText);
        }
    }

    // Slides del Hero en un solo paso de innerHTML
    if (Array.isArray(h.slides) && h.slides.length > 0 && hasChanged('slides', h.slides)) {
        const sliderContainer = document.querySelector('.hero-slider');
        if (sliderContainer) {
            sliderContainer.innerHTML = h.slides.map((slide: any, idx: number) => {
                if (!slide.image) return '';
                return `<div class="slide ${idx === 0 ? 'active' : ''}"><img src="${slide.image}" alt="${slide.alt || 'Portada'}" loading="${idx === 0 ? 'eager' : 'lazy'}" /></div>`;
            }).join('');
        }
    }

    // Stats de Confianza en un solo paso de innerHTML
    if (Array.isArray(h.stats) && h.stats.length > 0 && hasChanged('stats', h.stats)) {
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = h.stats.map((st: any) =>
                `<div class="stat-item reveal"><h3>${st.value || ''}</h3><p>${st.label || ''}</p></div>`
            ).join('');
            needsRevealRefresh = true;
        }
    }

    // 3. CATÁLOGO
    if (cat.title !== undefined || cat.titleHighlight !== undefined) {
        const catH2 = document.querySelector('#menu .section-header h2');
        if (catH2) {
            const title = cat.title !== undefined ? cat.title : '';
            const highlight = cat.titleHighlight !== undefined ? cat.titleHighlight : '';
            safeSetHtml(catH2, `${title} <span>${highlight}</span>`);
        }
    }

    if (cat.subtitle) {
        safeSetText('#menu .section-header p', cat.subtitle);
    }

    if (cat.searchPlaceholder) {
        const searchInput = document.getElementById('product-search') as HTMLInputElement | null;
        if (searchInput && searchInput.placeholder !== cat.searchPlaceholder) {
            searchInput.placeholder = cat.searchPlaceholder;
        }
    }

    if (cat.productDetailViewMode || cat.productDetailShareBtn) {
        const storeMetaEl = document.getElementById('catalog-store-meta');
        if (storeMetaEl) {
            if (cat.productDetailViewMode && storeMetaEl.dataset.productDetailViewMode !== cat.productDetailViewMode) {
                storeMetaEl.dataset.productDetailViewMode = cat.productDetailViewMode;
            }
            if (cat.productDetailShareBtn && storeMetaEl.dataset.productDetailShareBtn !== cat.productDetailShareBtn) {
                storeMetaEl.dataset.productDetailShareBtn = cat.productDetailShareBtn;
            }
        }
    }

    // 4. BENEFICIOS en un solo paso de innerHTML
    if (ben.title !== undefined || ben.titleHighlight !== undefined) {
        const benH2 = document.querySelector('#nosotros .section-header h2');
        if (benH2) {
            const title = ben.title !== undefined ? ben.title : '';
            const highlight = ben.titleHighlight !== undefined ? ben.titleHighlight : '';
            safeSetHtml(benH2, `${title} <span>${highlight}</span>?`);
        }
    }

    if (ben.subtitle) {
        safeSetText('#nosotros .section-header p', ben.subtitle);
    }

    if (Array.isArray(ben.items) && ben.items.length > 0 && hasChanged('benefits', ben.items)) {
        const benefitsGrid = document.querySelector('.benefits-grid');
        if (benefitsGrid) {
            benefitsGrid.innerHTML = ben.items.map((b: any) => {
                const svgIcon = ICON_SVGS[b.icon] || ICON_SVGS.award;
                return `
                    <div class="benefit-card reveal">
                        <div class="benefit-icon">${svgIcon}</div>
                        <h3>${b.title || ''}</h3>
                        <p>${b.description || ''}</p>
                    </div>
                `;
            }).join('');
            needsRevealRefresh = true;
        }
    }

    // 5. PROCESO en un solo paso de innerHTML
    if (prc.title !== undefined || prc.titleHighlight !== undefined) {
        const prcH2 = document.querySelector('#como-pedir .section-header h2');
        if (prcH2) {
            const title = prc.title !== undefined ? prc.title : '';
            const highlight = prc.titleHighlight !== undefined ? prc.titleHighlight : '';
            safeSetHtml(prcH2, `${title} <span>${highlight}</span>`);
        }
    }

    if (prc.subtitle) {
        safeSetText('#como-pedir .section-header p', prc.subtitle);
    }

    if (Array.isArray(prc.steps) && prc.steps.length > 0 && hasChanged('process', prc.steps)) {
        const processGrid = document.querySelector('.process-grid');
        if (processGrid) {
            processGrid.innerHTML = prc.steps.map((s: any) => `
                <div class="reveal process-step">
                    <div class="process-number">${s.number ?? ''}</div>
                    <h3>${s.title || ''}</h3>
                    <p>${s.description || ''}</p>
                </div>
            `).join('');
            needsRevealRefresh = true;
        }
    }

    // 6. TESTIMONIOS en un solo paso de innerHTML
    if (tst.title !== undefined || tst.titleHighlight !== undefined) {
        const tstH2 = document.querySelector('#testimonios .section-header h2');
        if (tstH2) {
            const title = tst.title !== undefined ? tst.title : '';
            const highlight = tst.titleHighlight !== undefined ? tst.titleHighlight : '';
            safeSetHtml(tstH2, `${title} <span>${highlight}</span>`);
        }
    }

    if (tst.subtitle) {
        safeSetText('#testimonios .section-header p', tst.subtitle);
    }

    if (Array.isArray(tst.items) && tst.items.length > 0 && hasChanged('testimonials', tst.items)) {
        const testGrid = document.querySelector('.testimonials-grid');
        if (testGrid) {
            testGrid.innerHTML = tst.items.map((t: any) => {
                const starsCount = Math.max(1, Math.min(5, t.rating || 5));
                const starsHtml = STAR_SVG.repeat(starsCount);
                const avatar = t.avatar || '/assets/client_maria.webp';
                return `
                    <div class="testimonial-card reveal">
                        <div class="stars">${starsHtml}</div>
                        <p class="review">"${t.review || ''}"</p>
                        <div class="client-info">
                            <div class="client-avatar">
                                <img src="${avatar}" alt="${t.name || 'Cliente'}" loading="lazy" />
                            </div>
                            <div>
                                <h4>${t.name || ''}</h4>
                                <p>${t.role || 'Cliente'}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            needsRevealRefresh = true;
        }
    }

    // 7. PREGUNTAS FRECUENTES (FAQ) en un solo paso de innerHTML
    if (fq.title !== undefined || fq.titleHighlight !== undefined) {
        const fqH2 = document.querySelector('#faq .section-header h2');
        if (fqH2) {
            const title = fq.title !== undefined ? fq.title : '';
            const highlight = fq.titleHighlight !== undefined ? fq.titleHighlight : '';
            safeSetHtml(fqH2, `${title} <span>${highlight}</span>`);
        }
    }

    if (fq.subtitle) {
        safeSetText('#faq .section-header p', fq.subtitle);
    }

    if (Array.isArray(fq.items) && fq.items.length > 0 && hasChanged('faq', fq.items)) {
        const faqWrapper = document.querySelector('.faq-wrapper');
        if (faqWrapper) {
            faqWrapper.innerHTML = fq.items.map((item: any) => `
                <div class="faq-card reveal">
                    <h4>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="faq-icon"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                        ${item.q || ''}
                    </h4>
                    <p>${item.a || ''}</p>
                </div>
            `).join('');
            needsRevealRefresh = true;
        }
    }

    // 8. CONTACTO & FOOTER
    if (c.whatsapp && hasChanged('whatsapp', c.whatsapp)) {
        const waLinks = document.querySelectorAll('a[href*="wa.me"]');
        waLinks.forEach(a => {
            const el = a as HTMLAnchorElement;
            if (!el.classList.contains('float-wa') && !el.classList.contains('nav-cta-btn')) {
                el.href = `https://wa.me/${c.whatsapp}`;
                const textNodes = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                if (textNodes.length > 0) {
                    textNodes[textNodes.length - 1].textContent = ` ${c.whatsappDisplay || '+' + c.whatsapp}`;
                }
            }
        });
    }

    if ((c.instagram || c.instagramHandle) && hasChanged('instagram', { url: c.instagram, handle: c.instagramHandle })) {
        const igLinks = document.querySelectorAll('a[href*="instagram.com"]');
        igLinks.forEach(a => {
            const el = a as HTMLAnchorElement;
            if (c.instagram && el.href !== c.instagram) el.href = c.instagram;
            if (c.instagramHandle) {
                const textNodes = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                if (textNodes.length > 0 && textNodes[textNodes.length - 1].textContent !== ` ${c.instagramHandle}`) {
                    textNodes[textNodes.length - 1].textContent = ` ${c.instagramHandle}`;
                }
            }
        });
    }

    if (c.hours) {
        safeSetText('.footer-hours', `🕐 ${c.hours}`);
    }

    if (c.address && hasChanged('address', c.address)) {
        const addressEls = document.querySelectorAll('.footer-contact-link');
        addressEls.forEach(el => {
            if (el.textContent && el.querySelector('svg path[d*="20 10c0 6-8 12"]')) {
                const svg = el.querySelector('svg');
                el.innerHTML = '';
                if (svg) el.appendChild(svg);
                el.appendChild(document.createTextNode(` ${c.address}`));
            }
        });
    }

    // 9. LABELS Y OPCIONES DE ENTREGA EN EL CARRITO
    const lbl = cfg.labels || {};
    if (lbl.pickupOptionName) {
        const pickupRadio = document.querySelector('input[name="delivery-type"][value="retiro"]');
        if (pickupRadio && pickupRadio.parentElement) {
            const textNodes = Array.from(pickupRadio.parentElement.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            const target = ` 🏪 ${lbl.pickupOptionName}`;
            if (textNodes.length > 0 && textNodes[textNodes.length - 1].textContent !== target) {
                textNodes[textNodes.length - 1].textContent = target;
            }
        }
    }

    if (lbl.deliveryOptionName || lbl.deliveryOptionPrice !== undefined) {
        const deliveryRadio = document.querySelector('input[name="delivery-type"][value="delivery"]');
        if (deliveryRadio && deliveryRadio.parentElement) {
            const name = lbl.deliveryOptionName || 'Delivery';
            const price = lbl.deliveryOptionPrice !== undefined ? lbl.deliveryOptionPrice : 5;
            const target = ` 🛵 ${name} (+${price ? '$' + price : 'Gratis'})`;
            const textNodes = Array.from(deliveryRadio.parentElement.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            if (textNodes.length > 0 && textNodes[textNodes.length - 1].textContent !== target) {
                textNodes[textNodes.length - 1].textContent = target;
            }
        }
    }

    if (cat.addToCartText) {
        safeSetText('#pdm-btn-add-text', cat.addToCartText);
    }

    // Si se regeneraron elementos .reveal, re-observar con IntersectionObserver
    if (needsRevealRefresh) {
        initScrollReveal();
    }
}
