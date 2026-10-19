// functions/[store].ts
// Enrutador dinámico de tiendas por ruta: vendly-20w.pages.dev/[store]
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from './api/_helpers';
import type { Env, PagesHandler, TenantRow } from './types';

const SYSTEM_PATHS = new Set([
    '',
    'api',
    'admin',
    'login',
    'register',
    'precios',
    'superadmin',
    'demo',
    'assets',
    'robots.txt',
    'sitemap.xml',
    '.well-known',
    'llms.txt',
    'ai-catalog.json',
    'favicon.ico',
    'favicon.svg',
    '_astro'
]);

export const onRequest: PagesHandler<Env, 'store'> = async (context) => {
    const { request, env, params } = context;
    const storeParam = params.store;
    const store = (typeof storeParam === 'string' ? storeParam : '').toLowerCase().trim();

    // 1. Descartar archivos estáticos o rutas reservadas del sistema
    if (!store || SYSTEM_PATHS.has(store) || store.includes('.')) {
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }
        return new Response('Recurso no encontrado', { status: 404 });
    }

    let db: D1Database;
    try {
        db = getDB(env);
    } catch {
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }
        return new Response('Base de datos no disponible', { status: 500 });
    }

    try {
        // 2. Buscar si el tenant existe y está activo en la base de datos
        const tenant = (await db.prepare(
            'SELECT id, name, template, config_json, active FROM tenants WHERE id = ? AND active = 1'
        ).bind(store).first()) as TenantRow | null;

        // Si no existe la tienda, devolver página 404 descriptiva
        if (!tenant) {
            return new Response(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tienda no encontrada | Vendly</title>
    <link rel="stylesheet" href="/store-404.css">
</head>
<body class="store-404-body">
    <div class="store-404-card">
        <div class="store-404-icon">🏬</div>
        <h1 class="store-404-title">Tienda no encontrada</h1>
        <p class="store-404-desc">La tienda <span class="store-404-slug">/${store}</span> no existe o aún no ha sido registrada en Vendly.</p>
        <a href="/register" class="store-404-btn">Crear mi tienda en Vendly</a>
    </div>
</body>
</html>`, {
                status: 404,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        // 3. Cargar la plantilla estática correspondiente desde ASSETS
        const template = tenant.template || 'restaurant';
        const url = new URL(request.url);
        
        let templateResponse = await env.ASSETS!.fetch(new Request(new URL(`/demo/${template}/index.html`, url.origin)));
        if (!templateResponse.ok) {
            templateResponse = await env.ASSETS!.fetch(new Request(new URL(`/demo/${template}`, url.origin)));
        }

        if (!templateResponse.ok) {
            return new Response(`Error al cargar la plantilla base "${template}"`, { status: 500 });
        }

        // 4. Inyectar metadatos y configuración del tenant en el HTML mediante HTMLRewriter
        const configJson = tenant.config_json || '{}';
        const businessName = tenant.name || 'Tienda';

        interface RewriterElement {
            setInnerContent(content: string): void;
            setAttribute(name: string, value: string): void;
            remove(): void;
            append(content: string, options?: { html?: boolean }): void;
        }

        const rewriter = new HTMLRewriter()
            .on('title', {
                element(e: RewriterElement) {
                    e.setInnerContent(`${businessName} | Catálogo & Pedidos`);
                }
            })
            .on('#catalog-store-meta', {
                element(e: RewriterElement) {
                    e.setAttribute('data-tenant', tenant.id);
                    e.setAttribute('data-business-name', businessName);
                    e.setAttribute('data-template', template);
                    try {
                        const parsed = JSON.parse(configJson);
                        const cat = parsed?.landing?.catalog || {};
                        if (cat.productDetailViewMode) {
                            e.setAttribute('data-product-detail-view-mode', cat.productDetailViewMode);
                        }
                        if (cat.productDetailShareBtn) {
                            e.setAttribute('data-product-detail-share-btn', cat.productDetailShareBtn);
                        }
                    } catch {}
                }
            })
            .on('.template-switcher', {
                element(e: RewriterElement) {
                    e.remove();
                }
            })
            .on('head', {
                element(e: RewriterElement) {
                    e.append(`<meta name="vendly-tenant" content="${tenant.id}" />`, { html: true });
                    e.append(`<meta name="vendly-business" content="${businessName}" />`, { html: true });
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

    } catch (err) {
        console.error('Error en router dinámico de tiendas /[store]:', err);
        return new Response('Error interno al cargar la tienda.', { status: 500 });
    }
};
