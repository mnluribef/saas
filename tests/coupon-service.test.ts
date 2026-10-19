import { describe, it, expect, vi } from 'vitest';
import { applyCoupon } from '../functions/api/_services/coupon.service';
import type { D1Database } from '@cloudflare/workers-types';

describe('Coupon Service (coupon.service.ts)', () => {
    it('returns empty result when code is empty', async () => {
        const dummyDb = {} as D1Database;
        const result = await applyCoupon(dummyDb, 'demo', '', 50);
        expect(result.isValid).toBe(false);
        expect(result.discountAmount).toBe(0);
    });

    it('calculates percentage discount accurately', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue({
                        id: 1,
                        code: 'PROMO20',
                        discount_type: 'percentage',
                        discount_value: 20,
                        min_order_amount: 10,
                        max_uses: -1,
                        uses_count: 5,
                        expires_at: null,
                        active: 1
                    })
                })
            })
        } as unknown as D1Database;

        const result = await applyCoupon(mockDb, 'demo', 'PROMO20', 100);
        expect(result.isValid).toBe(true);
        expect(result.appliedCouponCode).toBe('PROMO20');
        expect(result.discountAmount).toBe(20.0);
    });

    it('clamps fixed discount to items total to avoid negative values', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue({
                        id: 2,
                        code: 'REGALO50',
                        discount_type: 'fixed',
                        discount_value: 50,
                        min_order_amount: 0,
                        max_uses: 100,
                        uses_count: 0,
                        expires_at: null,
                        active: 1
                    })
                })
            })
        } as unknown as D1Database;

        const result = await applyCoupon(mockDb, 'demo', 'REGALO50', 30);
        expect(result.isValid).toBe(true);
        expect(result.discountAmount).toBe(30); // Máximo descontable es el total
    });

    it('rejects coupon when min_order_amount is not met', async () => {
        const mockDb = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    first: vi.fn().mockResolvedValue({
                        id: 3,
                        code: 'BIGSPENDER',
                        discount_type: 'fixed',
                        discount_value: 10,
                        min_order_amount: 50,
                        max_uses: -1,
                        uses_count: 0,
                        expires_at: null,
                        active: 1
                    })
                })
            })
        } as unknown as D1Database;

        const result = await applyCoupon(mockDb, 'demo', 'BIGSPENDER', 25);
        expect(result.isValid).toBe(false);
        expect(result.discountAmount).toBe(0);
        expect(result.errorReason).toContain('Monto mínimo');
    });
});
