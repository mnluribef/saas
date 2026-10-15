// functions/api/coupons.ts
// Gestión y Validación de Cupones de Descuento (Multi-Tenant)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const couponSchema = z.object({
    code: z.string().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, "El código solo debe tener letras, números y guiones."),
    discountType: z.enum(['percentage', 'fixed']).default('percentage'),
    discountValue: z.number().positive("El descuento debe ser mayor a 0"),
    minOrderAmount: z.number().min(0).optional().default(0),
    maxUses: z.number().int().min(-1).optional().default(-1),
    expiresAt: z.string().optional().nullable(),
    active: z.number().int().min(0).max(1).optional().default(1),
});

export type CouponInput = z.infer<typeof couponSchema>;

export interface CouponRow {
    id: number;
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    min_order_amount: number;
    max_uses: number;
    uses_count: number;
    active: number;
    expires_at: string | null;
    tenant_id: string;
    created_at: string;
}

/**
 * GET /api/coupons
 * - Si se pasa ?code=XYZ: Público, valida el cupón en el checkout
 * - Si no: Admin only, lista todos los cupones del tenant
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim().toUpperCase();

    // Modo 1: Validación pública en checkout
    if (code) {
        try {
            const coupon = await db.prepare(
                "SELECT * FROM coupons WHERE code = ? AND tenant_id = ? AND active = 1"
            ).bind(code, tenantId).first<CouponRow>();

            if (!coupon) {
                return jsonResponse({ valid: false, error: "El cupón no existe o no está activo." }, 404);
            }

            // Validar expiración
            if (coupon.expires_at) {
                const expiresMs = new Date(coupon.expires_at).getTime();
                if (Date.now() > expiresMs) {
                    return jsonResponse({ valid: false, error: "Este cupón ya ha expirado." }, 400);
                }
            }

            // Validar límite de usos
            if (coupon.max_uses !== -1 && coupon.uses_count >= coupon.max_uses) {
                return jsonResponse({ valid: false, error: "Este cupón ha agotado su número máximo de usos." }, 400);
            }

            return jsonResponse({
                valid: true,
                code: coupon.code,
                discountType: coupon.discount_type,
                discountValue: coupon.discount_value,
                minOrderAmount: coupon.min_order_amount
            });

        } catch (err) {
            console.error("Error al validar cupón:", err);
            return jsonResponse({ valid: false, error: "Error al validar el cupón." }, 500);
        }
    }

    // Modo 2: Listar cupones (Admin Only)
    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const { results } = await db.prepare(
            "SELECT * FROM coupons WHERE tenant_id = ? ORDER BY created_at DESC"
        ).bind(tenantId).all<CouponRow>();

        return jsonResponse({ data: results || [] });
    } catch (err) {
        console.error("Error al listar cupones:", err);
        return jsonResponse({ error: "Error al consultar cupones." }, 500);
    }
};

/**
 * POST /api/coupons - Crear nuevo cupón (Admin Only)
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const bodyJson = await request.json();
        const parseResult = couponSchema.safeParse(bodyJson);

        if (!parseResult.success) {
            return jsonResponse({ error: "Datos del cupón inválidos", details: parseResult.error.issues }, 400);
        }

        const { code, discountType, discountValue, minOrderAmount, maxUses, expiresAt, active } = parseResult.data;
        const normalizedCode = code.toUpperCase().trim();

        // Verificar unicidad por tenant
        const existing = await db.prepare(
            "SELECT id FROM coupons WHERE code = ? AND tenant_id = ?"
        ).bind(normalizedCode, tenantId).first();

        if (existing) {
            return jsonResponse({ error: `El código "${normalizedCode}" ya existe para esta tienda.` }, 400);
        }

        await db.prepare(`
            INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at, active, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            normalizedCode,
            discountType,
            discountValue,
            minOrderAmount,
            maxUses,
            expiresAt || null,
            active,
            tenantId
        ).run();

        return jsonResponse({
            success: true,
            message: `Cupón "${normalizedCode}" creado exitosamente.`
        }, 201);

    } catch (err) {
        console.error("Error al crear cupón:", err);
        return jsonResponse({ error: "Error al registrar el cupón." }, 500);
    }
};

/**
 * DELETE /api/coupons - Eliminar cupón (Admin Only)
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return jsonResponse({ error: "ID de cupón requerido." }, 400);

        await db.prepare("DELETE FROM coupons WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
        return jsonResponse({ success: true, message: "Cupón eliminado correctamente." });

    } catch (err) {
        console.error("Error al eliminar cupón:", err);
        return jsonResponse({ error: "Error interno al eliminar cupón." }, 500);
    }
};
