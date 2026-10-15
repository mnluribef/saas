// functions/api/assets/[key].ts
// Sirve archivos almacenados en Cloudflare R2 (bucket STORAGE)
import type { Env, PagesHandler } from '../../types';

export const onRequestGet: PagesHandler<Env, 'key'> = async (context) => {
    const { params, env } = context;
    const key = params.key as string;

    if (!key) {
        return new Response("Asset not found", { status: 404 });
    }

    if (!env.STORAGE) {
        return new Response("R2 Storage not configured", { status: 500 });
    }

    try {
        const object = await env.STORAGE.get(key);

        if (!object) {
            return new Response("Asset not found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers as any);
        if (object.httpEtag) {
            headers.set("etag", object.httpEtag);
        }
        // Cache de 1 año en navegador/CDN para nombres de archivo con timestamp
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(object.body as any, {
            headers
        });
    } catch (err) {
        console.error("Error al servir asset desde R2:", err);
        return new Response("Internal Server Error", { status: 500 });
    }
};
