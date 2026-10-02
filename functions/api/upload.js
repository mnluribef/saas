import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth.js";

/**
 * POST /api/upload - Subir una imagen a Cloudflare R2
 * Se espera recibir form-data con el archivo en el campo 'file'.
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    // Verificar sesión. Para subir imágenes de productos se requiere admin.
    // Para comprobantes de pago el endpoint debe ser público, por lo que usaremos
    // un parámetro en la URL o verificaremos el origen para permitir subir recibos públicamente.
    const url = new URL(request.url);
    const type = url.searchParams.get("type"); // 'product' o 'receipt'

    if (type !== 'receipt') {
        const user = await verifySession(context);
        if (!user) return unauthorizedResponse();
        if (user.role !== 'admin') return forbiddenResponse();
    }

    // Rate limit simple para recibos públicos (mitigar spam)
    if (type === 'receipt') {
        const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
        // Aquí deberíamos implementar un rate limit robusto con CF Rate Limiting,
        // pero por ahora limitaremos el tamaño del archivo a 5MB.
    }

    if (!env.STORAGE) {
        return new Response(JSON.stringify({ error: "El almacenamiento de archivos (R2) no está activo en esta versión demo. Usa la URL de la imagen directamente." }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return new Response(JSON.stringify({ error: "No se proporcionó ningún archivo válido." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Validar tamaño (máx 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return new Response(JSON.stringify({ error: "El archivo es demasiado grande. Máximo 5MB." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Validar tipo de imagen
        if (!file.type.startsWith("image/")) {
            return new Response(JSON.stringify({ error: "El archivo debe ser una imagen." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar nombre de archivo único
        const ext = file.name.split('.').pop();
        const randomString = Math.random().toString(36).substring(2, 10);
        const fileName = `${type || 'upload'}_${Date.now()}_${randomString}.${ext}`;

        // Subir a R2
        await env.STORAGE.put(fileName, file.stream(), {
            httpMetadata: { contentType: file.type }
        });

        // La URL pública del bucket (si está configurada) o usar un worker de assets
        // Asumiendo que configuraremos un custom domain en R2 o usaremos el worker para servirlo:
        const publicUrl = `/api/assets/${fileName}`;

        return new Response(JSON.stringify({ success: true, url: publicUrl, fileName }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en POST /api/upload:", err);
        return new Response(JSON.stringify({ error: "Error interno al subir el archivo." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
