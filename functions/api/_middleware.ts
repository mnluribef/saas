// functions/api/_middleware.ts
// Middleware global para toda la API (/api/*): Manejo de CORS y Preflights OPTIONS
import type { PagesContext } from '../types';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Superadmin-Key, X-Requested-With',
    'Access-Control-Max-Age': '86400',
};

/**
 * Responde a las peticiones preflight OPTIONS con 204 No Content y cabeceras CORS
 */
export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

/**
 * Intercepta todas las peticiones a /api/* y asegura que las respuestas contengan cabeceras CORS
 */
export async function onRequest(context: PagesContext): Promise<Response> {
    if (context.request.method === 'OPTIONS') {
        return onRequestOptions();
    }

    const response = await context.next();

    // Copiar y agregar las cabeceras CORS sin alterar el body ni el status original
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        if (!newHeaders.has(key)) {
            newHeaders.set(key, value);
        }
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}
