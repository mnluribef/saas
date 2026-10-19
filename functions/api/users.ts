// functions/api/users.ts
// Gestión de usuarios y roles (Admin / Staff) multi-tenant (F-04)
import { z } from "zod";
import { verifySession, unauthorizedResponse, forbiddenResponse, validateCsrf, generateSalt, hashPasswordPBKDF2 } from "./_auth";
import { resolveTenant } from "./_tenant";
import { getDB, jsonResponse } from "./_helpers";
import { strongPasswordSchema } from "./auth";
import type { Env, PagesHandler } from '../types';

export const createUserSchema = z.object({
    email: z.email("Correo electrónico válido requerido"),
    password: strongPasswordSchema,
    role: z.enum(['admin', 'staff']).default('staff')
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

interface UserListRow {
    id: number;
    username: string;
    email: string | null;
    role: string;
    created_at: string;
    tenant_id: string;
}

/**
 * GET /api/users - Listar usuarios del tenant (Solo admin)
 */
export const onRequestGet: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId } = await resolveTenant(request, db);

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const { results: users } = await db.prepare(
            "SELECT id, username, email, role, created_at, tenant_id FROM users WHERE tenant_id = ? ORDER BY created_at ASC"
        ).bind(tenantId).all<UserListRow>();

        return jsonResponse({
            success: true,
            users: users || []
        });
    } catch (err) {
        console.error("Error en GET /api/users:", err);
        return jsonResponse({ error: "Error al consultar usuarios." }, 500);
    }
};

/**
 * POST /api/users - Crear nuevo usuario (admin o staff) para el tenant (Solo admin)
 */
export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const user = await verifySession(context, tenantId);
    if (!user) return unauthorizedResponse();
    if (user.role !== 'admin') return forbiddenResponse();

    try {
        const bodyJson = await request.json();
        const parseResult = createUserSchema.safeParse(bodyJson);
        if (!parseResult.success) {
            return jsonResponse({ error: "Datos de usuario inválidos.", details: parseResult.error.issues }, 400);
        }

        const { email, password, role } = parseResult.data;
        const normalizedEmail = email.trim().toLowerCase();

        // Verificar si el usuario ya existe en este tenant
        const existing = await db.prepare(
            "SELECT id FROM users WHERE tenant_id = ? AND email = ?"
        ).bind(tenantId, normalizedEmail).first();

        if (existing) {
            return jsonResponse({ error: `El correo "${normalizedEmail}" ya está en uso en esta tienda.` }, 409);
        }

        // Hasheo seguro PBKDF2
        const salt = generateSalt();
        const hash = await hashPasswordPBKDF2(password, salt);

        await db.prepare(
            "INSERT INTO users (username, email, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(normalizedEmail, normalizedEmail, hash, salt, role, tenantId).run();

        return jsonResponse({
            success: true,
            message: `Usuario "${normalizedEmail}" creado con rol "${role}".`
        }, 201);

    } catch (err) {
        console.error("Error en POST /api/users:", err);
        return jsonResponse({ error: "Error interno al crear usuario." }, 500);
    }
};

/**
 * DELETE /api/users - Eliminar usuario del tenant (Solo admin)
 */
export const onRequestDelete: PagesHandler<Env> = async (context) => {
    const { env, request } = context;
    const db = getDB(env);
    const { id: tenantId, tenant } = await resolveTenant(request, db);

    if (!validateCsrf(request, tenant?.domain)) {
        return forbiddenResponse("Verificación de seguridad CSRF fallida.");
    }

    const currentUser = await verifySession(context, tenantId);
    if (!currentUser) return unauthorizedResponse();
    if (currentUser.role !== 'admin') return forbiddenResponse();

    try {
        const url = new URL(request.url);
        const targetEmail = (url.searchParams.get("email") || url.searchParams.get("username"))?.trim().toLowerCase();
        const targetId = url.searchParams.get("id");

        if (!targetEmail && !targetId) {
            return jsonResponse({ error: "Debe especificar el id o correo electrónico del usuario a eliminar." }, 400);
        }

        // Buscar al usuario
        let targetUser: UserListRow | null = null;
        if (targetId) {
            targetUser = await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").bind(targetId, tenantId).first<UserListRow>();
        } else if (targetEmail) {
            targetUser = await db.prepare("SELECT * FROM users WHERE (email = ? OR username = ?) AND tenant_id = ?").bind(targetEmail, targetEmail, tenantId).first<UserListRow>();
        }

        if (!targetUser) {
            return jsonResponse({ error: "Usuario no encontrado en esta tienda." }, 404);
        }

        // Impedir que un admin se elimine a sí mismo
        const currentIdentifier = (currentUser.email || currentUser.username).toLowerCase();
        const targetIdentifier = (targetUser.email || targetUser.username).toLowerCase();
        if (targetIdentifier === currentIdentifier) {
            return jsonResponse({ error: "No puedes eliminar tu propia cuenta de usuario activa." }, 400);
        }

        // Impedir eliminar el último administrador del tenant
        if (targetUser.role === 'admin') {
            const adminCountRow = await db.prepare(
                "SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND role = 'admin'"
            ).bind(tenantId).first<{ count: number }>();

            if ((adminCountRow?.count ?? 0) <= 1) {
                return jsonResponse({ error: "No es posible eliminar al único administrador de la tienda." }, 400);
            }
        }

        // Eliminar sesiones activas del usuario y luego el usuario
        await db.batch([
            db.prepare("DELETE FROM sessions WHERE (username = ? OR username = ?) AND tenant_id = ?").bind(targetUser.username, targetUser.email || targetUser.username, tenantId),
            db.prepare("DELETE FROM users WHERE id = ? AND tenant_id = ?").bind(targetUser.id, tenantId)
        ]);

        return jsonResponse({
            success: true,
            message: `Usuario "${targetUser.email || targetUser.username}" eliminado exitosamente.`
        });

    } catch (err) {
        console.error("Error en DELETE /api/users:", err);
        return jsonResponse({ error: "Error al eliminar usuario." }, 500);
    }
};
