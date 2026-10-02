/**
 * GET /api/assets/[key]
 * Sirve archivos almacenados en Cloudflare R2 (bucket STORAGE)
 */
export async function onRequestGet(context) {
    const { params, env } = context;
    const key = params.key;

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
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        // Cache de 1 año en navegador/CDN para nombres de archivo con timestamp
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(object.body, {
            headers
        });
    } catch (err) {
        console.error("Error al servir asset desde R2:", err);
        return new Response("Internal Server Error", { status: 500 });
    }
}
