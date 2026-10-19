// functions/api/_helpers.ts
// Utilidades compartidas para todos los handlers de la API de Ventrina SaaS
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';

/**
 * Obtiene el binding de la base de datos D1.
 * Elimina la duplicación de `env.DB || env.ventrina` en cada archivo.
 */
export function getDB(env: Env): D1Database {
    const db = env.DB || env.ventrina;
    if (!db) {
        throw new Error("No D1 Database binding found in environment (expected DB or ventrina)");
    }
    return db;
}

/**
 * Parsea correctamente un header Cookie.
 * Maneja valores que contienen '=' (como tokens Base64, JWTs o UUIDs con padding).
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) return acc;
        const key = part.slice(0, eqIdx).trim();
        const value = part.slice(eqIdx + 1).trim();
        if (key) acc[key] = value;
        return acc;
    }, {});
}

/**
 * Genera una respuesta JSON estándar.
 */
export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
    });
}

export interface ProblemDetailsOptions {
    type?: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    invalidParams?: Record<string, unknown> | unknown[];
}

/**
 * Genera una respuesta estructurada de error bajo el estándar RFC 7807 (Problem Details) (U-01)
 * Mantiene la propiedad `error` para compatibilidad retroactiva total con clientes existentes.
 */
export function problemResponse(opts: ProblemDetailsOptions, extraHeaders: Record<string, string> = {}): Response {
    const payload = {
        type: opts.type || 'about:blank',
        title: opts.title,
        status: opts.status,
        ...(opts.detail ? { detail: opts.detail } : {}),
        ...(opts.instance ? { instance: opts.instance } : {}),
        ...(opts.invalidParams ? { invalidParams: opts.invalidParams } : {}),
        error: opts.detail || opts.title
    };

    return new Response(JSON.stringify(payload), {
        status: opts.status,
        headers: {
            'Content-Type': 'application/problem+json',
            ...extraHeaders
        }
    });
}

/**
 * Genera una respuesta JSON comprimida con Gzip (P-04)
 * Utiliza CompressionStream disponible en Cloudflare Workers para payloads superiores a 2KB.
 */
export function compressedJsonResponse(
    body: unknown,
    status = 200,
    extraHeaders: Record<string, string> = {}
): Response {
    const json = JSON.stringify(body);

    // Para payloads pequeños (< 2KB) o si no hay soporte de stream, responder JSON estándar
    if (json.length < 2048 || typeof CompressionStream === 'undefined') {
        return jsonResponse(body, status, extraHeaders);
    }

    try {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        writer.write(new TextEncoder().encode(json));
        writer.close();

        return new Response(stream.readable as any, {
            status,
            headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'Vary': 'Accept-Encoding',
                ...extraHeaders,
            },
        });
    } catch {
        return jsonResponse(body, status, extraHeaders);
    }
}
