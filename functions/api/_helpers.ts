// functions/api/_helpers.ts
// Utilidades compartidas para todos los handlers de la API de Vendly SaaS
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';

/**
 * Obtiene el binding de la base de datos D1.
 * Elimina la duplicación de `env.DB || env.vendly` en cada archivo.
 */
export function getDB(env: Env): D1Database {
    const db = env.DB || env.vendly;
    if (!db) {
        throw new Error("No D1 Database binding found in environment (expected DB or vendly)");
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
