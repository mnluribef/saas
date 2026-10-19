// functions/api/assets/[key].ts
// Sirve archivos almacenados en Cloudflare R2 (bucket STORAGE)
import type { Env, PagesHandler } from '../../types';

export const onRequestGet: PagesHandler<Env, 'key'> = async (context) => {
    const { params, env } = context;
    const key = params.key as string;

    if (!key) {
        return new Response("Asset not found", { status: 404 });
    }

    const storage = env.STORAGE || env.BUCKET;
    if (!storage) {
        return new Response("R2 Storage not configured", { status: 500 });
    }

    try {
        const object = await storage.get(key);

        if (!object) {
            return new Response("Asset not found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers as any);
        if (object.httpEtag) {
            headers.set("etag", object.httpEtag);
            // P-05: Validación condicional de ETag para ahorrar transferencia en cliente/CDN
            if (context.request.headers.get("if-none-match") === object.httpEtag) {
                return new Response(null, { status: 304, headers });
            }
        }
        // P-05: Cache de 1 año en navegador/CDN para nombres de archivo inmutables
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(object.body as any, {
            headers
        });
    } catch (err) {
        console.error("Error al servir asset desde R2:", err);
        return new Response("Internal Server Error", { status: 500 });
    }
};
