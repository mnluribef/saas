// functions/api/upload.ts
// POST /api/upload - Subir una imagen a Cloudflare R2
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth";
import type { Env, PagesHandler } from '../types';

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;

    // Para subir imágenes de productos se requiere admin.
    // Para comprobantes de pago el endpoint debe ser público.
    const url = new URL(request.url);
    const type = url.searchParams.get("type"); // 'product' o 'receipt'

    if (type !== 'receipt') {
        const user = await verifySession(context);
        if (!user) return unauthorizedResponse();
        if (user.role !== 'admin') return forbiddenResponse();
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file === 'string') {
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

        // Validar tipo de imagen con magic bytes para evitar bypass
        const buffer = await file.arrayBuffer();
        const arr = new Uint8Array(buffer).subarray(0, 4);
        let header = "";
        for (let i = 0; i < arr.length; i++) {
            header += arr[i].toString(16);
        }
        
        let isValidType = false;
        if (header.startsWith("89504e47")) isValidType = true; // PNG
        else if (header.startsWith("ffd8ff")) isValidType = true; // JPEG
        else if (header.startsWith("52494646")) isValidType = true; // WEBP
        else if (header.startsWith("47494638")) isValidType = true; // GIF

        if (!isValidType) {
            return new Response(JSON.stringify({ error: "El archivo debe ser una imagen válida." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar nombre de archivo único
        const ext = file.name.split('.').pop() || 'jpg';
        const randomString = Math.random().toString(36).substring(2, 10);
        const fileName = `${type || 'upload'}_${Date.now()}_${randomString}.${ext}`;

        // Si R2 está activo, subir al bucket
        const storage = env.STORAGE || env.BUCKET;
        if (storage) {
            await storage.put(fileName, buffer, {
                httpMetadata: { contentType: file.type }
            });
            const publicUrl = `/api/assets/${fileName}`;
            return new Response(JSON.stringify({ success: true, url: publicUrl, fileName }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Respaldo para entornos sin bucket R2 conectado:
        // Convertimos el buffer validado a Data URL segura
        const uint8 = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(binary);
        const dataUrl = `data:${file.type || 'image/jpeg'};base64,${base64}`;

        return new Response(JSON.stringify({ success: true, url: dataUrl, fileName }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en POST /api/upload:", err);
        return new Response(JSON.stringify({ error: "Error interno al subir el archivo." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
