export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB || env.vendly;
    const url = new URL(request.url);

    // 1. Super-Admin Simple Authentication
    const authHeader = request.headers.get('Authorization') || '';
    const masterPassword = env.MASTER_PASSWORD || 'Vendly2026!'; // Contraseña por defecto para el MVP si no se configura en Cloudflare
    
    if (authHeader !== `Bearer ${masterPassword}`) {
        return new Response(JSON.stringify({ error: 'No autorizado.' }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'GET') {
        try {
            // Obtener lista de tenants
            const { results } = await db.prepare(`
                SELECT id, name, plan, active, created_at, template 
                FROM tenants 
                ORDER BY created_at DESC
            `).all();

            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500 });
        }
    }

    if (request.method === 'PUT') {
        try {
            const body = await request.json();
            const { tenantId, action, value } = body;

            if (!tenantId) {
                return new Response(JSON.stringify({ error: 'Falta tenantId.' }), { status: 400 });
            }

            if (action === 'change_plan') {
                const validPlans = ['basic', 'pro', 'enterprise'];
                if (!validPlans.includes(value)) return new Response(JSON.stringify({ error: 'Plan inválido.' }), { status: 400 });

                await db.prepare('UPDATE tenants SET plan = ? WHERE id = ?')
                    .bind(value, tenantId).run();
                
                return new Response(JSON.stringify({ success: true, message: `Plan actualizado a ${value}.` }));
            }

            if (action === 'toggle_status') {
                const newStatus = value === 1 ? 1 : 0;
                await db.prepare('UPDATE tenants SET active = ? WHERE id = ?')
                    .bind(newStatus, tenantId).run();

                return new Response(JSON.stringify({ success: true, message: `Estado actualizado a ${newStatus === 1 ? 'Activo' : 'Suspendido'}.` }));
            }

            return new Response(JSON.stringify({ error: 'Acción no válida.' }), { status: 400 });

        } catch (err) {
            return new Response(JSON.stringify({ error: 'Error interno al actualizar.' }), { status: 500 });
        }
    }

    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 });
}
