// functions/[store].ts
// Redirige la ruta heredada /[store] a su respectivo subdominio: mitienda.ventrina.app
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from './api/_helpers';
import { SYSTEM_PATHS } from './api/_tenant';
import { renderStoreNotFound, renderStorePage } from './_store';
import type { Env, PagesHandler, TenantRow } from './types';

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

        if (!tenant) {
            return renderStoreNotFound(store);
        }

        // 3. Redirigir permanentemente (301) al subdominio del tenant
        const url = new URL(request.url);
        const rawHost = request.headers.get('x-forwarded-host') || url.hostname;
        const host = rawHost.split(':')[0].toLowerCase();
        const isLocal = host.includes('localhost');
        const targetHost = isLocal
            ? `${tenant.id}.localhost${url.port ? ':' + url.port : ''}`
            : `${tenant.id}.ventrina.app`;
        const targetProto = isLocal ? (url.protocol.replace(':', '') || 'http') : 'https';

        // Si la petición ya viene dirigida al subdominio o no se puede redirigir, renderizar
        if (host === targetHost) {
            return renderStorePage(request, env, tenant);
        }

        return Response.redirect(`${targetProto}://${targetHost}/${url.search}`, 301);

    } catch (err) {
        console.error('Error en router dinámico de tiendas /[store]:', err);
        return new Response('Error interno al cargar la tienda.', { status: 500 });
    }
};
