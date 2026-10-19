// functions/api/_middleware.ts
// Middleware global para toda la API (/api/*): Manejo dinámico de CORS y Preflights OPTIONS (S-01)
import type { PagesContext } from '../types';

const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/ventrina\.app$/,
    /^https:\/\/[a-z0-9-]+\.ventrina\.app$/,
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/[a-z0-9-]+\.localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

/**
 * Valida si un origen HTTP está autorizado para acceder a la API de Ventrina (S-01)
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Superadmin-Key, X-Requested-With, X-Request-Id',
        'Access-Control-Expose-Headers': 'X-Request-Id, X-Response-Time, X-API-Version, Content-Disposition, ETag',
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
 * Intercepta todas las peticiones a /api/* y asegura cabeceras CORS, X-Request-Id y telemetría de latencia (M-04, O-02)
 */
export async function onRequest(context: PagesContext): Promise<Response> {
    const start = performance.now();

    // M-04 & O-02: Asignar o propagar X-Request-Id para trazabilidad correlacionada
    const incomingReqId = context.request.headers.get('X-Request-Id');
    const requestId = (incomingReqId && incomingReqId.trim()) ? incomingReqId.trim() : crypto.randomUUID();

    if (!context.data) {
        context.data = {};
    }
    context.data.requestId = requestId;
    context.data.startTime = start;

    if (context.request.method === 'OPTIONS') {
        const optionsResponse = await onRequestOptions(context);
        const headers = new Headers(optionsResponse.headers);
        headers.set('X-Request-Id', requestId);
        return new Response(null, {
            status: 204,
            headers
        });
    }

    const response = await context.next();
    const durationMs = Math.round(performance.now() - start);

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

    // M-04 & O-02: Telemetría de correlación y tiempo de respuesta
    newHeaders.set('X-Request-Id', requestId);
    newHeaders.set('X-Response-Time', `${durationMs}ms`);

    // O-01 & O-02: Logging estructurado en formato JSON
    try {
        const url = new URL(context.request.url);
        console.log(JSON.stringify({
            type: 'request_timing',
            requestId,
            method: context.request.method,
            path: url.pathname,
            status: response.status,
            durationMs,
            tenantId: context.data?.tenantId || undefined
        }));
    } catch {}

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

