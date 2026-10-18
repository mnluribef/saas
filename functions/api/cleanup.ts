// functions/api/cleanup.ts
// Tarea de mantenimiento: Purga de rate limits expirados y sesiones inactivas (Fix #8)
import { getDB, jsonResponse } from "./_helpers";
import { purgeExpiredRateLimits } from "./auth";
import type { Env, PagesHandler } from '../types';

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    // Protección de endpoint de mantenimiento: requiere SUPERADMIN_KEY o autorización de Worker/Cron
    const authKey = request.headers.get("X-Superadmin-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!env.SUPERADMIN_KEY || authKey !== env.SUPERADMIN_KEY) {
        return jsonResponse({ error: "No autorizado para ejecutar tareas de mantenimiento." }, 401);
    }

    try {
        const nowSec = Math.floor(Date.now() / 1000);

        // 1. Purgar rate limits expirados
        const purgedRateLimits = await purgeExpiredRateLimits(db);

        // 2. Purgar sesiones expiradas
        const sessionRes = await db.prepare(
            "DELETE FROM sessions WHERE expires_at < ?"
        ).bind(nowSec).run();
        const purgedSessions = sessionRes?.meta?.changes ?? 0;

        return jsonResponse({
            success: true,
            purged: {
                rateLimits: purgedRateLimits,
                sessions: purgedSessions
            },
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error("Error en mantenimiento de base de datos:", err);
        return jsonResponse({ error: "Error interno al ejecutar purga." }, 500);
    }
};
