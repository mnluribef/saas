// functions/api/_coupon-service.ts
// Lógica de consulta, validación y cálculo de cupones de descuento
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export interface CouponRow {
    id: number;
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    min_order_amount: number;
    max_uses: number;
    uses_count: number;
    expires_at: string | null;
    active: number;
}

export interface CouponApplicationResult {
    isValid: boolean;
    appliedCouponCode: string | null;
    discountAmount: number;
    couponId?: number;
    updateStatement?: D1PreparedStatement;
    errorReason?: string;
}

/**
 * Valida un código de cupón y calcula el descuento correspondiente
 */
export async function applyCoupon(
    db: D1Database,
    tenantId: string,
    rawCode: string | undefined | null,
    itemsTotal: number
): Promise<CouponApplicationResult> {
    if (!rawCode || !rawCode.trim()) {
        return { isValid: false, appliedCouponCode: null, discountAmount: 0 };
    }

    const code = rawCode.trim().toUpperCase();

    try {
        const coupon = await db.prepare(
            "SELECT * FROM coupons WHERE code = ? AND tenant_id = ? AND active = 1"
        ).bind(code, tenantId).first<CouponRow>();

        if (!coupon) {
            return { isValid: false, appliedCouponCode: null, discountAmount: 0, errorReason: 'Cupón no encontrado o inactivo.' };
        }

        const isExpired = coupon.expires_at ? new Date(coupon.expires_at).getTime() < Date.now() : false;
        if (isExpired) {
            return { isValid: false, appliedCouponCode: null, discountAmount: 0, errorReason: 'Cupón expirado.' };
        }

        const reachedLimit = coupon.max_uses > 0 && coupon.uses_count >= coupon.max_uses;
        if (reachedLimit) {
            return { isValid: false, appliedCouponCode: null, discountAmount: 0, errorReason: 'Límite de usos alcanzado.' };
        }

        const minAmount = coupon.min_order_amount || 0;
        if (itemsTotal < minAmount) {
            return {
                isValid: false,
                appliedCouponCode: null,
                discountAmount: 0,
                errorReason: `Monto mínimo de compra no alcanzado ($${minAmount.toFixed(2)}).`
            };
        }

        let discountAmount = 0.0;
        if (coupon.discount_type === 'percentage') {
            discountAmount = Math.round((itemsTotal * (coupon.discount_value / 100)) * 100) / 100;
        } else {
            discountAmount = Math.min(itemsTotal, coupon.discount_value);
        }

        const updateStatement = db.prepare(
            "UPDATE coupons SET uses_count = uses_count + 1 WHERE id = ? AND tenant_id = ?"
        ).bind(coupon.id, tenantId);

        return {
            isValid: true,
            appliedCouponCode: coupon.code,
            discountAmount,
            couponId: coupon.id,
            updateStatement
        };
    } catch (err) {
        console.error("Error al validar cupón:", err);
        return { isValid: false, appliedCouponCode: null, discountAmount: 0, errorReason: 'Error al procesar cupón.' };
    }
}
