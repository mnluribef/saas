// functions/[store]/p/[id].ts
// Redirige la ruta heredada /[store]/p/[id] al respectivo subdominio: mitienda.ventrina.app/p/:id
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from '../../api/_helpers';
import { renderProductPage, renderStoreNotFound } from '../../_store';
import type { Env, PagesHandler, TenantRow } from '../../types';

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
            return renderStoreNotFound(store);
        }

        // 2. Redirigir permanentemente (301) a la ruta de producto en el subdominio
        const url = new URL(request.url);
        const host = url.hostname.toLowerCase();
        const isLocal = host.includes('localhost');
        const targetHost = isLocal
            ? `${tenant.id}.localhost${url.port ? ':' + url.port : ''}`
            : `${tenant.id}.ventrina.app`;
        const targetProto = isLocal ? (url.protocol.replace(':', '') || 'http') : 'https';

        if (host === targetHost) {
            return renderProductPage(request, env, tenant, productId, db);
        }

        return Response.redirect(`${targetProto}://${targetHost}/p/${encodeURIComponent(productId)}${url.search}`, 301);

    } catch (err) {
        console.error('Error en router dinámico de producto /[store]/p/[id]:', err);
        return new Response('Error interno al cargar el producto', { status: 500 });
    }
};
