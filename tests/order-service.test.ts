import { describe, it, expect } from 'vitest';
import {
    generateOrderId,
    calculateOrderTotals,
    generateWebhookSignature,
    verifyTurnstile
} from '../functions/api/_services/order.service';

describe('Order Service Logic (order.service.ts)', () => {
    it('generates order IDs with expected format and prefix', () => {
        const id1 = generateOrderId('VEN');
        const id2 = generateOrderId('FOG');
        expect(id1).toMatch(/^VEN-[A-Z0-9]{5}$/);
        expect(id2).toMatch(/^FOG-[A-Z0-9]{5}$/);
        expect(id1).not.toBe(id2);
    });

    it('calculates order totals correctly for pickup without coupon', () => {
        const totals = calculateOrderTotals(100.0, 0, 'retiro', 5.0, 850.0);
        expect(totals.itemsTotal).toBe(100.0);
        expect(totals.discountAmount).toBe(0);
        expect(totals.deliveryPrice).toBe(0);
        expect(totals.finalTotalPrice).toBe(100.0);
        expect(totals.totalBs).toBe(85000.0);
    });

    it('calculates order totals correctly with delivery and coupon discount', () => {
        const totals = calculateOrderTotals(50.0, 10.0, 'delivery', 5.0, 800.0);
        expect(totals.itemsTotal).toBe(50.0);
        expect(totals.discountAmount).toBe(10.0);
        expect(totals.deliveryPrice).toBe(5.0);
        expect(totals.finalTotalPrice).toBe(45.0); // 50 - 10 + 5
        expect(totals.totalBs).toBe(36000.0); // 45 * 800
    });

    it('generates consistent HMAC-SHA256 signature for webhooks (Fix #19)', async () => {
        const payload = JSON.stringify({ event: 'new_order', orderId: 'VEN-TEST1' });
        const secret = 'super-secret-key-12345';
        const signature1 = await generateWebhookSignature(payload, secret);
        const signature2 = await generateWebhookSignature(payload, secret);

        expect(signature1).toBe(signature2);
        expect(signature1.length).toBe(64); // 32 bytes hex encoded = 64 chars

        // Distinto payload produce distinta firma
        const differentSig = await generateWebhookSignature('other payload', secret);
        expect(differentSig).not.toBe(signature1);
    });

    it('handles Turnstile verification test bypass cleanly (Fix #1)', async () => {
        const passed = await verifyTurnstile('TEST_PASS_TOKEN', 'dummy-secret', '127.0.0.1', true);
        expect(passed).toBe(true);

        const emptyFailed = await verifyTurnstile('', '', '127.0.0.1', false);
        expect(emptyFailed).toBe(false);
    });
});
