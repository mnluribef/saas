// functions/p/[id].ts
// Enrutador de Ficha de Producto para Subdominios: mitienda.ventrina.app/p/:id
import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from '../api/_helpers';
import { resolveTenant } from '../api/_tenant';
import { renderProductPage, renderStoreNotFound } from '../_store';
import type { Env, PagesHandler } from '../types';

export const onRequest: PagesHandler<Env, 'id'> = async (context) => {
    const { request, env, params } = context;
    const idParam = params.id;
    const productId = (typeof idParam === 'string' ? idParam : '').trim();

    if (!productId) {
        return new Response('Identificador de producto no especificado', { status: 400 });
    }

    let db: D1Database;
    try {
        db = getDB(env);
    } catch {
        if (env.ASSETS) return env.ASSETS.fetch(request);
        return new Response('Base de datos no disponible', { status: 500 });
    }

    try {
        const { id: tenantId, tenant } = await resolveTenant(request, db, env.KV);

        if (!tenant || tenantId === 'demo') {
            return renderStoreNotFound(tenantId);
        }

        return renderProductPage(request, env, tenant, productId, db);
    } catch (err) {
        console.error('Error en /p/[id]:', err);
        return new Response('Error interno al cargar la ficha del producto.', { status: 500 });
    }
};
