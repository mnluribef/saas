// src/scripts/services/store-sync.service.ts
// Sincroniza dinámicamente todos los textos, imágenes y secciones de la tienda desde /api/settings

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

const STAR_SVG = '<svg viewBox="0 0 24 24" class="star-svg" style="width:16px;height:16px;fill:#fbbf24;"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>';

export function syncStoreWithSettings(cfg: any): void {
    if (!cfg) return;

    const b = cfg.business || {};
    const c = cfg.contact || {};
    const lnd = cfg.landing || {};
    const h = lnd.hero || {};
    const cat = lnd.catalog || {};
    const ben = lnd.benefits || {};
    const prc = lnd.process || {};
    const tst = lnd.testimonials || {};
    const fq = lnd.faq || {};

    // 1. IDENTIDAD / BRANDING
    if (b.name) {
        document.title = `${b.name} | Catálogo & Pedidos`;
    }

    // Logo Textos en Header y Footer
    if (b.logoTextPrimary !== undefined || b.logoTextSecondary !== undefined) {
        const logoTextEls = document.querySelectorAll('.logo-text');
        logoTextEls.forEach(el => {
            const primary = b.logoTextPrimary || '';
            const secondary = b.logoTextSecondary || '';
            el.innerHTML = `${primary}<span>${secondary}</span>`;
        });
    }

    // Logo Imagen en Header
    if (b.logoImage) {
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
                imgEl.src = b.logoImage;
                imgEl.alt = b.name || 'Logo';
            }
        });
    }

    // Descripción en Footer
    if (b.description) {
        const footerDesc = document.querySelector('.footer-info > p');
        if (footerDesc) footerDesc.textContent = b.description;
    }

    // 2. HERO
    if (h.badgeText) {
        const badgeEl = document.querySelector('.hero-label span');
        if (badgeEl) badgeEl.textContent = h.badgeText;
    }

    if (h.headline !== undefined || h.headlineHighlight !== undefined) {
        const h1El = document.querySelector('.hero-content h1');
        if (h1El) {
            const headline = h.headline !== undefined ? h.headline : (h1El.childNodes[0]?.textContent?.trim() || '');
            const highlight = h.headlineHighlight !== undefined ? h.headlineHighlight : (h1El.querySelector('em')?.textContent || '');
            h1El.innerHTML = `${headline} <em>${highlight}</em>`;
        }
    }

    if (h.subheadline) {
        const subheadlineEl = document.querySelector('.hero-content p');
        if (subheadlineEl) subheadlineEl.textContent = h.subheadline;
    }

    if (h.ctaPrimaryText || h.ctaPrimaryLink) {
        const cta1 = document.querySelector('.hero-content a.btn-primary') as HTMLAnchorElement | null;
        if (cta1) {
            if (h.ctaPrimaryLink) cta1.href = h.ctaPrimaryLink;
            const span = cta1.querySelector('span');
            if (span && h.ctaPrimaryText) span.textContent = h.ctaPrimaryText;
        }
    }

    if (h.ctaSecondaryText || h.ctaSecondaryLink) {
        const cta2 = document.querySelector('.hero-content a.btn-secondary') as HTMLAnchorElement | null;
        if (cta2) {
            if (h.ctaSecondaryLink) cta2.href = h.ctaSecondaryLink;
            const span = cta2.querySelector('span');
            if (span && h.ctaSecondaryText) span.textContent = h.ctaSecondaryText;
        }
    }

    // Slides del Hero
    if (Array.isArray(h.slides) && h.slides.length > 0) {
        const sliderContainer = document.querySelector('.hero-slider');
        if (sliderContainer) {
            sliderContainer.innerHTML = '';
            h.slides.forEach((slide: any, idx: number) => {
                if (!slide.image) return;
                const slideDiv = document.createElement('div');
                slideDiv.className = `slide ${idx === 0 ? 'active' : ''}`;
                slideDiv.innerHTML = `<img src="${slide.image}" alt="${slide.alt || 'Portada'}" loading="${idx === 0 ? 'eager' : 'lazy'}" />`;
                sliderContainer.appendChild(slideDiv);
            });
        }
    }

    // Stats de Confianza
    if (Array.isArray(h.stats) && h.stats.length > 0) {
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            statsGrid.innerHTML = '';
            h.stats.forEach((st: any) => {
                const item = document.createElement('div');
                item.className = 'stat-item reveal';
                item.innerHTML = `<h3>${st.value || ''}</h3><p>${st.label || ''}</p>`;
                statsGrid.appendChild(item);
            });
        }
    }

    // 3. CATÁLOGO
    if (cat.title !== undefined || cat.titleHighlight !== undefined) {
        const catH2 = document.querySelector('#menu .section-header h2');
        if (catH2) {
            const title = cat.title !== undefined ? cat.title : '';
            const highlight = cat.titleHighlight !== undefined ? cat.titleHighlight : '';
            catH2.innerHTML = `${title} <span>${highlight}</span>`;
        }
    }

    if (cat.subtitle) {
        const catSub = document.querySelector('#menu .section-header p');
        if (catSub) catSub.textContent = cat.subtitle;
    }

    if (cat.searchPlaceholder) {
        const searchInput = document.getElementById('product-search') as HTMLInputElement | null;
        if (searchInput) searchInput.placeholder = cat.searchPlaceholder;
    }

    // 4. BENEFICIOS
    if (ben.title !== undefined || ben.titleHighlight !== undefined) {
        const benH2 = document.querySelector('#nosotros .section-header h2');
        if (benH2) {
            const title = ben.title !== undefined ? ben.title : '';
            const highlight = ben.titleHighlight !== undefined ? ben.titleHighlight : '';
            benH2.innerHTML = `${title} <span>${highlight}</span>?`;
        }
    }

    if (ben.subtitle) {
        const benSub = document.querySelector('#nosotros .section-header p');
        if (benSub) benSub.textContent = ben.subtitle;
    }

    if (Array.isArray(ben.items) && ben.items.length > 0) {
        const benefitsGrid = document.querySelector('.benefits-grid');
        if (benefitsGrid) {
            benefitsGrid.innerHTML = '';
            ben.items.forEach((b: any) => {
                const card = document.createElement('div');
                card.className = 'benefit-card reveal';
                const svgIcon = ICON_SVGS[b.icon] || ICON_SVGS.award;
                card.innerHTML = `
                    <div class="benefit-icon">${svgIcon}</div>
                    <h3>${b.title || ''}</h3>
                    <p>${b.description || ''}</p>
                `;
                benefitsGrid.appendChild(card);
            });
        }
    }

    // 5. PROCESO ("¿CÓMO PEDIR?")
    if (prc.title !== undefined || prc.titleHighlight !== undefined) {
        const prcH2 = document.querySelector('#como-pedir .section-header h2');
        if (prcH2) {
            const title = prc.title !== undefined ? prc.title : '';
            const highlight = prc.titleHighlight !== undefined ? prc.titleHighlight : '';
            prcH2.innerHTML = `${title} <span>${highlight}</span>`;
        }
    }

    if (prc.subtitle) {
        const prcSub = document.querySelector('#como-pedir .section-header p');
        if (prcSub) prcSub.textContent = prc.subtitle;
    }

    if (Array.isArray(prc.steps) && prc.steps.length > 0) {
        const processGrid = document.querySelector('.process-grid');
        if (processGrid) {
            processGrid.innerHTML = '';
            prc.steps.forEach((s: any) => {
                const stepEl = document.createElement('div');
                stepEl.className = 'reveal process-step';
                stepEl.innerHTML = `
                    <div class="process-number">${s.number ?? ''}</div>
                    <h3>${s.title || ''}</h3>
                    <p>${s.description || ''}</p>
                `;
                processGrid.appendChild(stepEl);
            });
        }
    }

    // 6. TESTIMONIOS
    if (tst.title !== undefined || tst.titleHighlight !== undefined) {
        const tstH2 = document.querySelector('#testimonios .section-header h2');
        if (tstH2) {
            const title = tst.title !== undefined ? tst.title : '';
            const highlight = tst.titleHighlight !== undefined ? tst.titleHighlight : '';
            tstH2.innerHTML = `${title} <span>${highlight}</span>`;
        }
    }

    if (tst.subtitle) {
        const tstSub = document.querySelector('#testimonios .section-header p');
        if (tstSub) tstSub.textContent = tst.subtitle;
    }

    if (Array.isArray(tst.items) && tst.items.length > 0) {
        const testGrid = document.querySelector('.testimonials-grid');
        if (testGrid) {
            testGrid.innerHTML = '';
            tst.items.forEach((t: any) => {
                const card = document.createElement('div');
                card.className = 'testimonial-card reveal';
                const starsCount = Math.max(1, Math.min(5, t.rating || 5));
                const starsHtml = STAR_SVG.repeat(starsCount);
                const avatar = t.avatar || '/assets/client_maria.webp';
                card.innerHTML = `
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
                `;
                testGrid.appendChild(card);
            });
        }
    }

    // 7. PREGUNTAS FRECUENTES (FAQ)
    if (fq.title !== undefined || fq.titleHighlight !== undefined) {
        const fqH2 = document.querySelector('#faq .section-header h2');
        if (fqH2) {
            const title = fq.title !== undefined ? fq.title : '';
            const highlight = fq.titleHighlight !== undefined ? fq.titleHighlight : '';
            fqH2.innerHTML = `${title} <span>${highlight}</span>`;
        }
    }

    if (fq.subtitle) {
        const fqSub = document.querySelector('#faq .section-header p');
        if (fqSub) fqSub.textContent = fq.subtitle;
    }

    if (Array.isArray(fq.items) && fq.items.length > 0) {
        const faqWrapper = document.querySelector('.faq-wrapper');
        if (faqWrapper) {
            faqWrapper.innerHTML = '';
            fq.items.forEach((item: any) => {
                const card = document.createElement('div');
                card.className = 'faq-card reveal';
                card.innerHTML = `
                    <h4>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; margin-right:6px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                        ${item.q || ''}
                    </h4>
                    <p>${item.a || ''}</p>
                `;
                faqWrapper.appendChild(card);
            });
        }
    }

    // 8. CONTACTO & FOOTER
    if (c.hours) {
        const hoursEl = document.querySelector('.footer-hours');
        if (hoursEl) hoursEl.textContent = `🕐 ${c.hours}`;
    }

    if (c.address) {
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
}
