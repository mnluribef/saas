// functions/_middleware.ts
// Middleware raíz de Cloudflare Pages: Detección de subdominios de tenants, enrutamiento dinámico y redirecciones
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from './api/_helpers';
import { extractSubdomain, getTenantByIdCached, getTenantByDomainCached, SYSTEM_PATHS } from './api/_tenant';
import { renderStorePage, renderProductPage, renderStoreNotFound } from './_store';
import type { Env, PagesContext } from './types';

export const onRequest = async (context: PagesContext<Env>): Promise<Response> => {
    const startTime = performance.now();
    const { request, env, next } = context;
    const url = new URL(request.url);
    const rawHost = request.headers.get('x-forwarded-host') || url.hostname;
    const host = rawHost.split(':')[0].toLowerCase();
    const pathname = url.pathname;

    // 1. Descartar archivos estáticos del sistema y bundles compilados
    if (
        pathname.startsWith('/_astro/') ||
        pathname.startsWith('/assets/') ||
        pathname.startsWith('/.well-known/') ||
        pathname === '/favicon.ico' ||
        pathname === '/favicon.svg' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml' ||
        pathname === '/llms.txt' ||
        pathname === '/ai-catalog.json' ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.jpeg') ||
        pathname.endsWith('.webp') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.woff2')
    ) {
        return next();
    }

    // 2. Las rutas /api/* son procesadas por functions/api/*
    if (pathname.startsWith('/api/')) {
        return next();
    }

    const routeRequest = async (): Promise<Response> => {
        // 3. Obtener conexión a D1
        let db: D1Database;
        try {
            db = getDB(env);
        } catch {
            return next();
        }

        // 4. Caso A: Petición a un Subdominio de Tenant (ej: mitienda.ventrina.app o mitienda.localhost)
        const tenantSubdomain = extractSubdomain(host);

        if (tenantSubdomain) {
            const tenant = await getTenantByIdCached(db, tenantSubdomain, env.KV);

            if (!tenant) {
                return renderStoreNotFound(tenantSubdomain);
            }

            // Acceso administrativo o login en el subdominio: servir directamente sin redirigir al dominio raíz
            if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/login') {
                return next();
            }

            // Rutas de plataforma (registro, términos, precios) se redirigen al dominio principal
            const isLocal = host.includes('localhost');
            const mainDomain = isLocal ? `localhost:${url.port || '8788'}` : 'ventrina.app';
            const protocol = url.protocol;

            if (pathname === '/register' || pathname === '/terminos' || pathname === '/precios') {
                return Response.redirect(`${protocol}//${mainDomain}${pathname}`, 302);
            }

            // Ficha de Producto en subdominio: /p/:id
            if (pathname.startsWith('/p/')) {
                const productId = decodeURIComponent(pathname.slice('/p/'.length).replace(/\/$/, ''));
                if (productId) {
                    return renderProductPage(request, env, tenant, productId, db);
                }
            }

            // Catálogo principal de la tienda en subdominio: / o /index.html
            if (pathname === '/' || pathname === '/index.html') {
                return renderStorePage(request, env, tenant);
            }

            // Retrocompatibilidad: redirigir /producto?id=... al formato canónico /p/:id
            if (pathname === '/producto') {
                const pId = url.searchParams.get('id');
                if (pId) {
                    return Response.redirect(`${url.origin}/p/${encodeURIComponent(pId)}`, 301);
                }
            }

            return next();
        }

        // 5. Caso B: Petición a Dominio Customizado (ej: mitienda.com)
        if (!host.includes('ventrina') && !host.includes('localhost') && !host.includes('pages.dev')) {
            const tenant = await getTenantByDomainCached(db, host, env.KV);
            if (tenant) {
                if (pathname.startsWith('/p/')) {
                    const productId = decodeURIComponent(pathname.slice('/p/'.length).replace(/\/$/, ''));
                    if (productId) {
                        return renderProductPage(request, env, tenant, productId, db);
                    }
                }
                if (pathname === '/' || pathname === '/index.html') {
                    return renderStorePage(request, env, tenant);
                }
            }
        }

        // 6. Caso C: Petición al Dominio Raíz (ventrina.app o localhost) con ruta de tienda tipo /[store] o /s/[store]
        // Redirigir permanentemente (301) a su respectivo subdominio (ej: mitienda.ventrina.app)
        const pathParts = pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            let storeCandidate = pathParts[0].toLowerCase();
            let pIndex = 1;

            if (storeCandidate === 's' && pathParts.length > 1) {
                storeCandidate = pathParts[1].toLowerCase();
                pIndex = 2;
            }

            if (!SYSTEM_PATHS.has(storeCandidate) && !storeCandidate.includes('.')) {
                const tenant = await getTenantByIdCached(db, storeCandidate, env.KV);
                if (tenant) {
                    const isLocal = host.includes('localhost');
                    const targetHost = isLocal
                        ? `${tenant.id}.localhost${url.port ? ':' + url.port : ''}`
                        : `${tenant.id}.ventrina.app`;
                    const targetProto = isLocal ? (url.protocol.replace(':', '') || 'http') : 'https';

                    // Si es /[store]/p/:id o /s/[store]/p/:id -> https://[store].ventrina.app/p/:id
                    if (pathParts.length >= pIndex + 2 && pathParts[pIndex] === 'p') {
                        const productId = pathParts.slice(pIndex + 1).join('/');
                        return Response.redirect(`${targetProto}://${targetHost}/p/${productId}${url.search}`, 301);
                    }

                    // Si es /[store] o /s/[store] -> https://[store].ventrina.app/
                    return Response.redirect(`${targetProto}://${targetHost}/${url.search}`, 301);
                }
            }
        }

        // Continuar a la página correspondiente (landing page, admin, login, precios, etc.)
        return next();
    };

    const response = await routeRequest();
    const durationMs = Math.round(performance.now() - startTime);

    // NF-02: Telemetría de latencia y logging estructurado
    try {
        console.log(JSON.stringify({
            type: 'root_routing_timing',
            method: request.method,
            path: pathname,
            host,
            status: response.status,
            durationMs
        }));
    } catch {}

    if (response.status >= 300 && response.status < 400) {
        return response;
    }

    try {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('X-Response-Time', `${durationMs}ms`);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch {
        return response;
    }
};
