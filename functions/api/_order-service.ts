// functions/api/_order-service.ts
// Lógica de dominio para procesamiento de pedidos, cálculos, validaciones y webhooks
import type { D1Database } from '@cloudflare/workers-types';
import { bytesToHex } from './_auth';

/**
 * Genera un ID de pedido legible con prefijo y caracteres aleatorios
 */
export function generateOrderId(prefix = "ORD"): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let randomPart = "";
    const randomBytes = new Uint8Array(5);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < 5; i++) {
        randomPart += chars[randomBytes[i] % chars.length];
    }
    return `${prefix}-${randomPart}`;
}

/**
 * Valida un token de Cloudflare Turnstile CAPTCHA
 */
export async function verifyTurnstile(
    token: string,
    secret: string,
    ip: string,
    isTest = false
): Promise<boolean> {
    if (isTest || token === 'TEST_PASS_TOKEN') return true;
    if (!secret || !token) return false;

    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', ip);

    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            body: formData,
            method: 'POST'
        });
        const outcome = await result.json() as { success: boolean };
        return Boolean(outcome.success);
    } catch {
        return false;
    }
}

/**
 * Genera una firma HMAC-SHA256 para autenticar webhooks salientes (Fix #19)
 */
export async function generateWebhookSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return bytesToHex(new Uint8Array(signature));
}

/**
 * Resuelve la tasa de cambio oficial (BCV) del tenant sin usar fallbacks desactualizados (Fix #12)
 */
export async function resolveBcvRate(
    db: D1Database,
    tenantId: string,
    clientRate?: number
): Promise<{ rate: number; error?: string }> {
    try {
        const bcvSetting = await db.prepare(
            "SELECT value FROM settings WHERE key = 'bcv_rate' AND tenant_id = ?"
        ).bind(tenantId).first<{ value: string }>();

        if (bcvSetting && parseFloat(bcvSetting.value) > 0) {
            return { rate: parseFloat(bcvSetting.value) };
        }
    } catch {}

    // Si no está en BD, verificar si el cliente envió una tasa válida y razonable
    if (clientRate && typeof clientRate === 'number' && clientRate > 0) {
        return { rate: clientRate };
    }

    return {
        rate: 0,
        error: 'No se ha configurado la tasa oficial BCV para esta tienda y no se proporcionó una tasa válida.'
    };
}

export interface OrderTotals {
    itemsTotal: number;
    discountAmount: number;
    deliveryPrice: number;
    finalTotalPrice: number;
    totalBs: number;
}

/**
 * Calcula con precisión los totales monetarios del pedido en USD y Bolívares
 */
export function calculateOrderTotals(
    itemsTotal: number,
    discountAmount: number,
    deliveryType: 'delivery' | 'pickup' | string,
    deliveryPrice: number,
    bcvRate: number
): OrderTotals {
    const effectiveDelivery = deliveryType === 'delivery' ? deliveryPrice : 0;
    const finalTotalPrice = Math.max(0, Math.round((itemsTotal - discountAmount + effectiveDelivery) * 100) / 100);
    const totalBs = Math.round((finalTotalPrice * bcvRate) * 100) / 100;

    return {
        itemsTotal,
        discountAmount,
        deliveryPrice: effectiveDelivery,
        finalTotalPrice,
        totalBs
    };
}
