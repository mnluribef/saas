// functions/_middleware.ts
// Middleware raíz de Cloudflare Pages: Detección de subdominios de tenants, enrutamiento dinámico y redirecciones
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from './api/_helpers';
import { extractSubdomain, getTenantByIdCached, getTenantByDomainCached, SYSTEM_PATHS } from './api/_tenant';
import { renderStorePage, renderProductPage, renderStoreNotFound } from './_store';
import type { Env, PagesContext } from './types';

export const onRequest = async (context: PagesContext<Env>): Promise<Response> => {
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

        // Acceso administrativo o auth desde subdominio -> redirigir a dominio raíz
        const isLocal = host.includes('localhost');
        const mainDomain = isLocal ? `localhost:${url.port || '8788'}` : 'ventrina.app';
        const protocol = url.protocol;

        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
            const adminUrl = new URL(pathname, `${protocol}//${mainDomain}`);
            adminUrl.search = url.search;
            adminUrl.searchParams.set('tenant', tenant.id);
            return Response.redirect(adminUrl.toString(), 302);
        }

        if (pathname === '/login') {
            const loginUrl = new URL('/login', `${protocol}//${mainDomain}`);
            loginUrl.search = url.search;
            loginUrl.searchParams.set('tenant', tenant.id);
            return Response.redirect(loginUrl.toString(), 302);
        }

        if (pathname === '/register') {
            return Response.redirect(`${protocol}//${mainDomain}/register`, 302);
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

        // En caso de solicitar /producto?id=... en subdominio
        if (pathname === '/producto') {
            const pId = url.searchParams.get('id');
            if (pId) {
                return renderProductPage(request, env, tenant, pId, db);
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

    // 6. Caso C: Petición al Dominio Raíz (ventrina.app o localhost) con ruta de tienda tipo /[store]
    // Redirigir permanentemente (301) a su nuevo subdominio (ej: mitienda.ventrina.app)
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
        const storeCandidate = pathParts[0].toLowerCase();
        if (!SYSTEM_PATHS.has(storeCandidate) && !storeCandidate.includes('.')) {
            const tenant = await getTenantByIdCached(db, storeCandidate, env.KV);
            if (tenant) {
                const isLocal = host.includes('localhost');
                const targetHost = isLocal
                    ? `${tenant.id}.localhost${url.port ? ':' + url.port : ''}`
                    : `${tenant.id}.ventrina.app`;
                const targetProto = isLocal ? (url.protocol.replace(':', '') || 'http') : 'https';

                // Si es /[store]/p/:id -> https://[store].ventrina.app/p/:id
                if (pathParts.length >= 3 && pathParts[1] === 'p') {
                    const productId = pathParts.slice(2).join('/');
                    return Response.redirect(`${targetProto}://${targetHost}/p/${productId}${url.search}`, 301);
                }

                // Si es /[store] -> https://[store].ventrina.app/
                return Response.redirect(`${targetProto}://${targetHost}/${url.search}`, 301);
            }
        }
    }

    // Continuar a la página correspondiente (landing page, admin, login, precios, etc.)
    return next();
};
