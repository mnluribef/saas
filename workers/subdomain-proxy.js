/**
 * Cloudflare Worker: Proxy Wildcard para Subdominios de Ventrina
 * 
 * Enrutamiento: *.ventrina.app/*
 * Destino: ventrina.app (Backend en Cloudflare Pages)
 */

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const originalHost = url.hostname.toLowerCase();

        // 1. Si la petición ya es el dominio raíz o www, permitir que continúe
        if (originalHost === 'ventrina.app' || originalHost === 'www.ventrina.app') {
            return fetch(request);
        }

        // 2. Destino real de Cloudflare Pages
        url.hostname = 'vendly-20w.pages.dev';

        // 3. Clonar y preparar cabeceras para que el middleware identifique la tienda
        const newHeaders = new Headers(request.headers);
        newHeaders.set('X-Forwarded-Host', originalHost);
        newHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', '') || 'https');
        newHeaders.set('Host', 'vendly-20w.pages.dev');

        // 4. Construir la petición modificada preservando método y body (excepto GET/HEAD)
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const modifiedRequest = new Request(url.toString(), {
            method: request.method,
            headers: newHeaders,
            body: hasBody ? request.body : undefined,
            redirect: 'manual' // Permite que los redirects 301/302 del backend lleguen directamente al cliente
        });

        try {
            return await fetch(modifiedRequest);
        } catch (err) {
            return new Response(`Error en Worker Proxy de subdominios: ${err.message}`, {
                status: 502,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    }
};
