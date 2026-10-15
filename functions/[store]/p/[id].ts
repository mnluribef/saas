// functions/[store]/p/[id].ts
// Enrutador dinámico de Ficha de Producto con Open Graph y SEO: /[store]/p/[id]
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from '../../api/_helpers';
import type { Env, PagesHandler, TenantRow } from '../../types';

interface ProductRow {
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

export const onRequest: PagesHandler<Env, 'store' | 'id'> = async (context) => {
    const { request, env, params } = context;
    const storeParam = params.store;
    const idParam = params.id;

    const store = (typeof storeParam === 'string' ? storeParam : '').toLowerCase().trim();
    const productId = (typeof idParam === 'string' ? idParam : '').trim();

    if (!store || !productId) {
        return new Response('Ruta de producto inválida', { status: 400 });
    }

    let db: D1Database;
    try {
        db = getDB(env);
    } catch {
        if (env.ASSETS) return env.ASSETS.fetch(request);
        return new Response('Base de datos no disponible', { status: 500 });
    }

    try {
        // 1. Buscar si la tienda existe y está activa
        const tenant = (await db.prepare(
            'SELECT id, name, template, config_json, active FROM tenants WHERE id = ? AND active = 1'
        ).bind(store).first()) as TenantRow | null;

        if (!tenant) {
            return new Response('Tienda no encontrada', { status: 404 });
        }

        // 2. Buscar si el producto existe
        const product = (await db.prepare(
            'SELECT id, name, description, price, image_url, category, brand, model, template FROM products WHERE tenant_id = ? AND id = ? AND active = 1'
        ).bind(tenant.id, productId).first()) as ProductRow | null;

        // 3. Cargar la página estática base /producto desde ASSETS
        const url = new URL(request.url);
        let pageResponse = await env.ASSETS!.fetch(new Request(new URL('/producto/index.html', url.origin)));
        if (!pageResponse.ok) {
            pageResponse = await env.ASSETS!.fetch(new Request(new URL('/producto', url.origin)));
        }

        if (!pageResponse.ok) {
            return new Response('Error al cargar la plantilla de producto', { status: 500 });
        }

        // 4. Inyectar metadatos SEO y Open Graph mediante HTMLRewriter
        const businessName = tenant.name || 'Vendly Store';
        const configJson = tenant.config_json || '{}';
        const productName = product ? product.name : 'Detalle de Producto';
        const productDesc = product?.description || `Consulta precio, detalles y disponibilidad de ${productName} en ${businessName}.`;
        
        let productImg = product?.image_url || '/assets/favicon.svg';
        if (productImg && !productImg.startsWith('http://') && !productImg.startsWith('https://')) {
            productImg = new URL(productImg.startsWith('/') ? productImg : `/${productImg}`, url.origin).toString();
        }

        const canonicalUrl = `${url.origin}/${tenant.id}/p/${encodeURIComponent(productId)}`;

        interface RewriterElement {
            setInnerContent(content: string): void;
            setAttribute(name: string, value: string): void;
            remove(): void;
            append(content: string, options?: { html?: boolean }): void;
        }

        const rewriter = new HTMLRewriter()
            .on('title', {
                element(e: RewriterElement) {
                    e.setInnerContent(`${productName} | ${businessName}`);
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
                }
            })
            .on('head', {
                element(e: RewriterElement) {
                    e.append(`<meta name="vendly-tenant" content="${tenant.id}" />`, { html: true });
                    e.append(`<meta name="vendly-product-id" content="${productId}" />`, { html: true });
                    e.append(`<meta name="vendly-business" content="${businessName}" />`, { html: true });
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

    } catch (err) {
        console.error('Error en router dinámico de producto /[store]/p/[id]:', err);
        return new Response('Error interno al cargar el producto', { status: 500 });
    }
};
