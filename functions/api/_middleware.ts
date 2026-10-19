// functions/api/_middleware.ts
// Middleware global para toda la API (/api/*): Manejo dinámico de CORS y Preflights OPTIONS (S-01)
import type { PagesContext } from '../types';

const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/vendly\.app$/,
    /^https:\/\/[a-z0-9-]+\.vendly\.app$/,
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

/**
 * Valida si un origen HTTP está autorizado para acceder a la API de Vendly (S-01)
 */
export function getAllowedOrigin(origin: string | null): string | null {
    if (!origin) return null;
    try {
        const url = new URL(origin);
        const originClean = url.origin;

        for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
            if (pattern.test(originClean)) {
                return originClean;
            }
        }
    } catch {
        return null;
    }
    return null;
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
    const allowed = getAllowedOrigin(origin);
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Superadmin-Key, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };

    if (allowed) {
        headers['Access-Control-Allow-Origin'] = allowed;
        headers['Access-Control-Allow-Credentials'] = 'true';
    }

    return headers;
}

/**
 * Responde a las peticiones preflight OPTIONS con 204 No Content y cabeceras CORS dinámicas
 */
export async function onRequestOptions(context: PagesContext): Promise<Response> {
    const origin = context.request.headers.get('Origin');
    const corsHeaders = buildCorsHeaders(origin);

    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

/**
 * Intercepta todas las peticiones a /api/* y asegura que las respuestas contengan cabeceras CORS
 */
export async function onRequest(context: PagesContext): Promise<Response> {
    if (context.request.method === 'OPTIONS') {
        return onRequestOptions(context);
    }

    const response = await context.next();
    const origin = context.request.headers.get('Origin');
    const corsHeaders = buildCorsHeaders(origin);

    // Copiar y agregar las cabeceras CORS sin alterar el body ni el status original
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        if (!newHeaders.has(key)) {
            newHeaders.set(key, value);
        }
    }

    // U-02: Información de versionado de API en todas las respuestas
    newHeaders.set('X-API-Version', '1.0.0');
    newHeaders.set('X-API-Supported-Versions', 'v1');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

