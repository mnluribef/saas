// functions/_store.ts
// Lógica compartida de renderizado de Tiendas y Fichas de Producto para Subdominios y Rutas
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, TenantRow } from './types';
import { generatePaletteCss } from '../src/config/palettes';

export interface ProductRow {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url: string | null;
    category: string | null;
    brand: string | null;
    model: string | null;
    template: string;
}

interface RewriterElement {
    setInnerContent(content: string, options?: { html?: boolean }): void;
    setAttribute(name: string, value: string): void;
    remove(): void;
    append(content: string, options?: { html?: boolean }): void;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Renderiza la página 404 cuando una tienda no existe
 */
export function renderStoreNotFound(store: string): Response {
    return new Response(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tienda no encontrada | Ventrina</title>
    <link rel="stylesheet" href="/store-404.css">
</head>
<body class="store-404-body">
    <div class="store-404-card">
        <div class="store-404-icon">🏬</div>
        <h1 class="store-404-title">Tienda no encontrada</h1>
        <p class="store-404-desc">La tienda <span class="store-404-slug">${store}</span> no existe o aún no ha sido registrada en Ventrina.</p>
        <a href="https://ventrina.app/register" class="store-404-btn">Crear mi tienda en Ventrina</a>
    </div>
</body>
</html>`, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

/**
 * Renderiza el catálogo principal de una tienda a partir de su plantilla demo
 */
export async function renderStorePage(request: Request, env: Env, tenant: TenantRow): Promise<Response> {
    try {
        const template = tenant.template || 'restaurant';
        const url = new URL(request.url);

        if (!env.ASSETS) {
            return new Response('Assets binding no disponible', { status: 500 });
        }

        let templateResponse = await env.ASSETS.fetch(new Request(new URL(`/demo/${template}/index.html`, url.origin)));
    if (!templateResponse.ok) {
        templateResponse = await env.ASSETS.fetch(new Request(new URL(`/demo/${template}`, url.origin)));
    }

    if (!templateResponse.ok) {
        return new Response(`Error al cargar la plantilla base "${template}"`, { status: 500 });
    }

    const configJson = tenant.config_json || '{}';
    let parsedConfig: any = {};
    try {
        parsedConfig = typeof tenant.config_json === 'string' ? JSON.parse(tenant.config_json) : (tenant.config_json || {});
    } catch {}

    const b = parsedConfig?.business || {};
    const businessName = b.name || tenant.name || 'Tienda';
    const logoPrimary = b.logoTextPrimary || b.name || tenant.name || 'Tienda';
    const logoSecondary = b.logoTextSecondary || '';

    const paletteId = parsedConfig?.palette || parsedConfig?.theme?.palette || null;
    const paletteCss = generatePaletteCss(paletteId);

    const rewriter = new HTMLRewriter()
        .on('title', {
            element(e: RewriterElement) {
                e.setInnerContent(`${businessName} | Catálogo & Pedidos`);
            }
        })
        .on('.logo-text', {
            element(e: RewriterElement) {
                const safePrimary = escapeHtml(logoPrimary);
                const safeSecondary = escapeHtml(logoSecondary);
                if (safeSecondary) {
                    e.setInnerContent(`<span class="logo-primary">${safePrimary}</span><span class="logo-secondary">${safeSecondary}</span>`, { html: true });
                } else {
                    e.setInnerContent(`<span class="logo-primary">${safePrimary}</span>`, { html: true });
                }
            }
        })
        .on('.footer-copyright', {
            element(e: RewriterElement) {
                const currentYear = new Date().getFullYear();
                e.setInnerContent(`&copy; ${currentYear} ${escapeHtml(businessName)}. Todos los derechos reservados.`, { html: true });
            }
        })
        .on('#catalog-store-meta', {
            element(e: RewriterElement) {
                e.setAttribute('data-tenant', tenant.id);
                e.setAttribute('data-business-name', businessName);
                e.setAttribute('data-template', template);
                try {
                    const cat = parsedConfig?.landing?.catalog || {};
                    const contact = parsedConfig?.contact || {};
                    const labels = parsedConfig?.labels || {};

                    if (contact.whatsapp || tenant.whatsapp) {
                        e.setAttribute('data-whatsapp', contact.whatsapp || tenant.whatsapp);
                    }
                    if (labels.deliveryOptionPrice !== undefined) {
                        e.setAttribute('data-delivery-price', String(labels.deliveryOptionPrice));
                    }
                    if (labels.deliveryOptionName) {
                        e.setAttribute('data-delivery-name', labels.deliveryOptionName);
                    }
                    if (labels.pickupOptionName) {
                        e.setAttribute('data-pickup-name', labels.pickupOptionName);
                    }
                    if (labels.itemNounSingular) {
                        e.setAttribute('data-item-noun-singular', labels.itemNounSingular);
                    }
                    if (labels.itemNounPlural) {
                        e.setAttribute('data-item-noun-plural', labels.itemNounPlural);
                    }
                    if (labels.emptyCartEmoji) {
                        e.setAttribute('data-empty-cart-emoji', labels.emptyCartEmoji);
                    }
                    if (parsedConfig.storePrefix) {
                        e.setAttribute('data-store-prefix', parsedConfig.storePrefix);
                    }
                    if (cat.productDetailViewMode) {
                        e.setAttribute('data-product-detail-view-mode', cat.productDetailViewMode);
                    }
                    if (cat.productDetailShareBtn) {
                        e.setAttribute('data-product-detail-share-btn', cat.productDetailShareBtn);
                    }
                } catch {}
            }
        })
        .on('.ventrina-template-bar, #ventrina-template-bar, .template-switcher', {
            element(e: RewriterElement) {
                e.remove();
            }
        })
        .on('body', {
            element(e: RewriterElement) {
                e.setAttribute('data-is-tenant', 'true');
            }
        })
        .on('head', {
            element(e: RewriterElement) {
                e.append(`<meta name="ventrina-tenant" content="${tenant.id}" />`, { html: true });
                e.append(`<meta name="ventrina-business" content="${businessName}" />`, { html: true });
                if (paletteCss) {
                    e.append(`<style id="server-palette-override">${paletteCss}</style>`, { html: true });
                }
                if (configJson && configJson !== '{}') {
                    e.append(`<script id="injected-tenant-config" type="application/json">${configJson}</script>`, { html: true });
                }
            }
        });

        const transformedResponse = rewriter.transform(templateResponse);

        return new Response(transformedResponse.body, {
            status: 200,
            headers: transformedResponse.headers
        });
    } catch (err: unknown) {
        console.error(JSON.stringify({
            type: 'ssr_render_error',
            target: 'store_page',
            tenantId: tenant.id,
            error: err instanceof Error ? err.message : String(err)
        }));
        return new Response('Error al procesar y renderizar el catálogo de la tienda.', { status: 500 });
    }
}

/**
 * Renderiza la ficha de producto con metadatos SEO y Open Graph
 */
export async function renderProductPage(
    request: Request,
    env: Env,
    tenant: TenantRow,
    productId: string,
    db: D1Database
): Promise<Response> {
    try {
        if (!env.ASSETS) {
            return new Response('Assets binding no disponible', { status: 500 });
        }

    const product = (await db.prepare(
        'SELECT id, name, description, price, image_url, category, brand, model, template FROM products WHERE tenant_id = ? AND id = ? AND active = 1'
    ).bind(tenant.id, productId).first()) as ProductRow | null;

    const url = new URL(request.url);
    let pageResponse = await env.ASSETS.fetch(new Request(new URL('/producto/index.html', url.origin)));
    if (!pageResponse.ok) {
        pageResponse = await env.ASSETS.fetch(new Request(new URL('/producto', url.origin)));
    }

    if (!pageResponse.ok) {
        return new Response('Error al cargar la plantilla de producto', { status: 500 });
    }

    let parsedConfig: any = {};
    try {
        parsedConfig = typeof tenant.config_json === 'string' ? JSON.parse(tenant.config_json) : (tenant.config_json || {});
    } catch {}

    const b = parsedConfig?.business || {};
    const businessName = b.name || tenant.name || 'Ventrina Store';
    const logoPrimary = b.logoTextPrimary || b.name || tenant.name || 'Ventrina Store';
    const logoSecondary = b.logoTextSecondary || '';

    const paletteId = parsedConfig?.palette || parsedConfig?.theme?.palette || null;
    const paletteCss = generatePaletteCss(paletteId);

    const configJson = tenant.config_json || '{}';
    const productName = product ? product.name : 'Detalle de Producto';
    const productDesc = product?.description || `Consulta precio, detalles y disponibilidad de ${productName} en ${businessName}.`;

    let productImg = product?.image_url || '/assets/favicon.svg';
    if (productImg && !productImg.startsWith('http://') && !productImg.startsWith('https://')) {
        productImg = new URL(productImg.startsWith('/') ? productImg : `/${productImg}`, url.origin).toString();
    }

    const rawHost = request.headers.get('x-forwarded-host') || url.hostname;
    const effectiveOrigin = request.headers.get('x-forwarded-host') 
        ? `${url.protocol}//${rawHost}` 
        : url.origin;
    const canonicalUrl = `${effectiveOrigin}/p/${encodeURIComponent(productId)}`;

    const rewriter = new HTMLRewriter()
        .on('title', {
            element(e: RewriterElement) {
                e.setInnerContent(`${productName} | ${businessName}`);
            }
        })
        .on('.logo-text', {
            element(e: RewriterElement) {
                const safePrimary = escapeHtml(logoPrimary);
                const safeSecondary = escapeHtml(logoSecondary);
                if (safeSecondary) {
                    e.setInnerContent(`<span class="logo-primary">${safePrimary}</span><span class="logo-secondary">${safeSecondary}</span>`, { html: true });
                } else {
                    e.setInnerContent(`<span class="logo-primary">${safePrimary}</span>`, { html: true });
                }
            }
        })
        .on('.footer-copyright', {
            element(e: RewriterElement) {
                const currentYear = new Date().getFullYear();
                e.setInnerContent(`&copy; ${currentYear} ${escapeHtml(businessName)}. Todos los derechos reservados.`, { html: true });
            }
        })
        .on('meta[name="description"]', {
            element(e: RewriterElement) {
                e.setAttribute('content', productDesc);
            }
        })
        .on('meta[property="og:title"]', {
            element(e: RewriterElement) {
                e.setAttribute('content', `${productName} | ${businessName}`);
            }
        })
        .on('meta[property="og:description"]', {
            element(e: RewriterElement) {
                e.setAttribute('content', productDesc);
            }
        })
        .on('meta[property="og:image"]', {
            element(e: RewriterElement) {
                e.setAttribute('content', productImg);
            }
        })
        .on('meta[property="og:url"]', {
            element(e: RewriterElement) {
                e.setAttribute('content', canonicalUrl);
            }
        })
        .on('#catalog-store-meta', {
            element(e: RewriterElement) {
                e.setAttribute('data-tenant', tenant.id);
                e.setAttribute('data-business-name', businessName);
                e.setAttribute('data-template', tenant.template || 'restaurant');
                try {
                    const contact = parsedConfig?.contact || {};
                    const labels = parsedConfig?.labels || {};
                    if (contact.whatsapp || tenant.whatsapp) {
                        e.setAttribute('data-whatsapp', contact.whatsapp || tenant.whatsapp);
                    }
                    if (labels.deliveryOptionPrice !== undefined) {
                        e.setAttribute('data-delivery-price', String(labels.deliveryOptionPrice));
                    }
                    if (labels.deliveryOptionName) {
                        e.setAttribute('data-delivery-name', labels.deliveryOptionName);
                    }
                    if (labels.pickupOptionName) {
                        e.setAttribute('data-pickup-name', labels.pickupOptionName);
                    }
                    if (parsedConfig.storePrefix) {
                        e.setAttribute('data-store-prefix', parsedConfig.storePrefix);
                    }
                } catch {}
            }
        })
        .on('.ventrina-template-bar, #ventrina-template-bar, .template-switcher', {
            element(e: RewriterElement) {
                e.remove();
            }
        })
        .on('body', {
            element(e: RewriterElement) {
                e.setAttribute('data-is-tenant', 'true');
            }
        })
        .on('head', {
            element(e: RewriterElement) {
                e.append(`<meta name="ventrina-tenant" content="${tenant.id}" />`, { html: true });
                e.append(`<meta name="ventrina-product-id" content="${productId}" />`, { html: true });
                e.append(`<meta name="ventrina-business" content="${businessName}" />`, { html: true });
                if (paletteCss) {
                    e.append(`<style id="server-palette-override">${paletteCss}</style>`, { html: true });
                }
                if (product?.price) {
                    e.append(`<meta property="product:price:amount" content="${product.price}" />`, { html: true });
                    e.append(`<meta property="product:price:currency" content="USD" />`, { html: true });
                }
                if (configJson && configJson !== '{}') {
                    e.append(`<script id="injected-tenant-config" type="application/json">${configJson}</script>`, { html: true });
                }
            }
        });

        const transformed = rewriter.transform(pageResponse);
        return new Response(transformed.body, {
            status: 200,
            headers: transformed.headers
        });
    } catch (err: unknown) {
        console.error(JSON.stringify({
            type: 'ssr_render_error',
            target: 'product_page',
            tenantId: tenant.id,
            productId,
            error: err instanceof Error ? err.message : String(err)
        }));
        return new Response('Error al cargar la ficha del producto.', { status: 500 });
    }
}
