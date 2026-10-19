// functions/api/upload.ts
// POST /api/upload - Subir una imagen a Cloudflare R2 (S-04, S-05)
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth";
import { getDB, problemResponse, jsonResponse } from "./_helpers";
import { ErrorTypes } from "./_errors";
import type { Env, PagesHandler, UserSession } from '../types';

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;

    // Para subir imágenes de productos se requiere admin.
    // Para comprobantes de pago el endpoint debe ser público pero con rate limit estricto (S-04).
    const url = new URL(request.url);
    const type = url.searchParams.get("type"); // 'product' o 'receipt'
    let user: UserSession | null = null;

    if (type !== 'receipt') {
        user = await verifySession(context);
        if (!user) return unauthorizedResponse();
        if (user.role !== 'admin') return forbiddenResponse();
    } else {
        // S-04: Rate limiting por IP para subida de comprobantes públicos (máx 10 por hora)
        try {
            const db = getDB(env);
            const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";
            const rateLimitKey = `upload_rcpt_${clientIp}`;
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;

            const record = await db.prepare(
                "SELECT * FROM rate_limits WHERE ip = ?"
            ).bind(rateLimitKey).first<{ ip: string; count: number; first_attempt: number; lockout_until: number }>();

            if (record) {
                if (now - record.first_attempt > ONE_HOUR) {
                    await db.prepare("UPDATE rate_limits SET count = 1, first_attempt = ?, lockout_until = 0 WHERE ip = ?")
                        .bind(now, rateLimitKey).run();
                } else if (record.count >= 10) {
                    return problemResponse({
                        type: ErrorTypes.RATE_LIMIT_EXCEEDED,
                        title: 'Límite de subida alcanzado',
                        status: 429,
                        detail: 'Ha alcanzado el límite de 10 comprobantes por hora. Intente más tarde.'
                    });
                } else {
                    await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE ip = ?")
                        .bind(rateLimitKey).run();
                }
            } else {
                await db.prepare("INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)")
                    .bind(rateLimitKey, now).run();
            }
        } catch (rlErr) {
            console.error("Error verificando rate limit en upload:", rlErr);
        }
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file === 'string') {
            return jsonResponse({ error: "No se proporcionó ningún archivo válido." }, 400);
        }

        // Validar tamaño (máx 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return jsonResponse({ error: "El archivo es demasiado grande. Máximo 5MB." }, 400);
        }

        // Validar tipo de imagen con magic bytes para evitar bypass
        const buffer = await file.arrayBuffer();
        const arr = new Uint8Array(buffer).subarray(0, 4);
        let header = "";
        for (let i = 0; i < arr.length; i++) {
            header += arr[i].toString(16);
        }
        
        // S-05: Mapear magic bytes estrictamente a extensiones permitidas
        let ext = "";
        if (header.startsWith("89504e47")) ext = "png";
        else if (header.startsWith("ffd8ff")) ext = "jpg";
        else if (header.startsWith("52494646")) ext = "webp";
        else if (header.startsWith("47494638")) ext = "gif";

        if (!ext) {
            return jsonResponse({ error: "El archivo debe ser una imagen válida (PNG, JPG, WEBP o GIF)." }, 400);
        }

        // S-05: Sanitización total del nombre del archivo (sin usar file.name)
        const tenantFolder = (user?.tenant_id || url.searchParams.get("tenant") || "pub")
            .replace(/[^a-z0-9_-]/gi, '')
            .toLowerCase() || 'pub';
        const uniqueId = crypto.randomUUID().slice(0, 10);
        const fileName = `${tenantFolder}_${type || 'upload'}_${Date.now()}_${uniqueId}.${ext}`;

        // Si R2 está activo, subir al bucket
        const storage = env.STORAGE || env.BUCKET;
        if (storage) {
            await storage.put(fileName, buffer, {
                httpMetadata: { contentType: file.type || `image/${ext}` }
            });
            const publicUrl = `/api/assets/${fileName}`;
            return jsonResponse({ success: true, url: publicUrl, fileName });
        }

        // Respaldo para entornos locales sin bucket R2 conectado:
        const uint8 = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(binary);
        const dataUrl = `data:${file.type || `image/${ext}`};base64,${base64}`;

        return jsonResponse({ success: true, url: dataUrl, fileName });

    } catch (err) {
        console.error("Error en POST /api/upload:", err);
        return jsonResponse({ error: "Error interno al subir el archivo." }, 500);
    }
};
