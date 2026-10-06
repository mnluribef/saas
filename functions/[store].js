// functions/[store].js
// Enrutador dinámico de tiendas por ruta: vendly-20w.pages.dev/[store]

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
    'favicon.ico',
    'favicon.svg',
    '_astro'
]);

export async function onRequest(context) {
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

    const db = env.DB || env.vendly;
    if (!db) {
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }
        return new Response('Base de datos no disponible', { status: 500 });
    }

    try {
        // 2. Buscar si el tenant existe y está activo en la base de datos
        const tenant = await db.prepare(
            'SELECT id, name, template, config_json, active FROM tenants WHERE id = ? AND active = 1'
        ).bind(store).first();

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
        
        let templateResponse = await env.ASSETS.fetch(new Request(new URL(`/demo/${template}/index.html`, url.origin)));
        if (!templateResponse.ok) {
            templateResponse = await env.ASSETS.fetch(new Request(new URL(`/demo/${template}`, url.origin)));
        }

        if (!templateResponse.ok) {
            return new Response(`Error al cargar la plantilla base "${template}"`, { status: 500 });
        }

        // 4. Inyectar metadatos y configuración del tenant en el HTML mediante HTMLRewriter
        const configJson = tenant.config_json || '{}';
        const businessName = tenant.name || 'Tienda';

        const rewriter = new HTMLRewriter()
            .on('title', {
                element(e) {
                    e.setInnerContent(`${businessName} | Catálogo & Pedidos`);
                }
            })
            .on('#catalog-store-meta', {
                element(e) {
                    e.setAttribute('data-tenant', tenant.id);
                    e.setAttribute('data-business-name', businessName);
                    e.setAttribute('data-template', template);
                }
            })
            .on('.template-switcher', {
                element(e) {
                    // Remover selector de demostración en tiendas reales
                    e.remove();
                }
            })
            .on('head', {
                element(e) {
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
}
