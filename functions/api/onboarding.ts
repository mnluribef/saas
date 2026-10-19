// functions/api/onboarding.ts
// Registro de nuevos clientes (Creación de Tenant + Admin)
import type { D1Database } from '@cloudflare/workers-types';
import { z } from "zod";
import { generateSalt, hashPasswordPBKDF2 } from "./_auth";
import { strongPasswordSchema } from "./auth";
import { getDB, jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const onboardingSchema = z.object({
    tenantName: z.string().min(2, "El nombre del negocio es muy corto").max(100),
    tenantSlug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, "El slug solo puede contener minúsculas, números y guiones."),
    template: z.enum(['restaurant', 'hardware', 'fashion', 'tech', 'autoparts']).default('restaurant'),
    username: z.string().min(4, "El usuario debe tener al menos 4 caracteres").max(50),
    password: strongPasswordSchema,
    email: z.email("Formato de correo electrónico inválido").optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
    acceptTerms: z.boolean().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

const MAX_REGISTRATIONS_PER_HOUR = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hora

interface RateLimitRow {
    ip: string;
    count: number;
    first_attempt: number;
    lockout_until: number;
}

/**
 * Verifica el rate limit de registros por IP.
 */
async function checkRegistrationRateLimit(
    db: D1Database,
    ip: string
): Promise<{ allowed: boolean; remaining: number; resetInMinutes?: number }> {
    const key = `reg_${ip}`;
    const now = Date.now();

    try {
        const record = await db.prepare(
            "SELECT * FROM rate_limits WHERE ip = ?"
        ).bind(key).first<RateLimitRow>();

        if (!record) return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - 1 };

        // Ventana expirada → limpiar y permitir
        if (now - record.first_attempt > REGISTRATION_WINDOW_MS) {
            await db.prepare("DELETE FROM rate_limits WHERE ip = ?").bind(key).run();
            return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - 1 };
        }

        if (record.count >= MAX_REGISTRATIONS_PER_HOUR) {
            const resetInMinutes = Math.ceil((REGISTRATION_WINDOW_MS - (now - record.first_attempt)) / 60000);
            return { allowed: false, remaining: 0, resetInMinutes };
        }

        return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR - record.count - 1 };
    } catch {
        return { allowed: true, remaining: MAX_REGISTRATIONS_PER_HOUR };
    }
}

/**
 * Registra un intento de registro para calcular el rate limit.
 */
async function recordRegistrationAttempt(db: D1Database, ip: string): Promise<void> {
    const key = `reg_${ip}`;
    const now = Date.now();
    try {
        const record = await db.prepare("SELECT * FROM rate_limits WHERE ip = ?").bind(key).first<RateLimitRow>();
        if (!record) {
            await db.prepare(
                "INSERT INTO rate_limits (ip, count, first_attempt, lockout_until) VALUES (?, 1, ?, 0)"
            ).bind(key, now).run();
        } else {
            await db.prepare(
                "UPDATE rate_limits SET count = count + 1 WHERE ip = ?"
            ).bind(key).run();
        }
    } catch {
        // Ignorar fallas secundarias de registro de rate limit
    }
}

function getStarterProducts(tenantId: string, template: string) {
    switch (template) {
        case 'restaurant':
            return [
                {
                    id: `${tenantId}-burger-especial`,
                    name: 'Hamburguesa Especial Ventrina',
                    description: 'Carne 100% res 180g, queso cheddar fundido, tocineta crujiente, lechuga y salsa especial de la casa.',
                    price: 8.50,
                    category: 'principales',
                    icon: 'utensils',
                    image_url: '/assets/hero_grill.webp',
                    stock: -1
                },
                {
                    id: `${tenantId}-papas-crispy`,
                    name: 'Papas Rústicas Crispy',
                    description: 'Papas sazonadas con pimentón dulce, sal marina y dip de queso fundido.',
                    price: 3.50,
                    category: 'acompañantes',
                    icon: 'package',
                    image_url: '/assets/hero_grill.webp',
                    stock: 50
                },
                {
                    id: `${tenantId}-refresco-355ml`,
                    name: 'Bebida Refrescante 355ml',
                    description: 'Refresco en lata frío, variedad de sabores disponibles.',
                    price: 1.50,
                    category: 'bebidas',
                    icon: 'coffee',
                    image_url: '/assets/hero_grill.webp',
                    stock: 100
                }
            ];
        case 'hardware':
            return [
                {
                    id: `${tenantId}-taladro-650w`,
                    name: 'Taladro Percutor 1/2 650W',
                    description: 'Velocidad variable reversible, empuñadura ergonómica, mandril metálico de 13mm.',
                    price: 45.00,
                    category: 'herramientas',
                    icon: 'tool',
                    image_url: '/assets/product_taladro.webp',
                    stock: 15
                },
                {
                    id: `${tenantId}-destornilladores-x6`,
                    name: 'Juego de Destornilladores x6 Piezas',
                    description: 'Puntas magnéticas de cromo vanadio, mangos bimateriales antideslizantes.',
                    price: 12.00,
                    category: 'manuales',
                    icon: 'wrench',
                    image_url: '/assets/product_taladro.webp',
                    stock: 30
                }
            ];
        case 'fashion':
            return [
                {
                    id: `${tenantId}-camisa-lino`,
                    name: 'Camisa Casual Lino Premium',
                    description: 'Confeccionada en 100% lino fresco, corte slim fit, botones de madera natural.',
                    price: 28.00,
                    category: 'camisas',
                    icon: 'tag',
                    image_url: '/assets/hero_fashion.webp',
                    stock: 25
                },
                {
                    id: `${tenantId}-pantalon-chino`,
                    name: 'Pantalón Chino Gabardina',
                    description: 'Algodón elástico de alta resistencia, bolsillos laterales y traseros.',
                    price: 35.00,
                    category: 'pantalones',
                    icon: 'tag',
                    image_url: '/assets/hero_fashion.webp',
                    stock: 20
                }
            ];
        case 'tech':
            return [
                {
                    id: `${tenantId}-auriculares-bt`,
                    name: 'Auriculares Inalámbricos Pro ANC',
                    description: 'Cancelación activa de ruido, Bluetooth 5.3, autonomía de 32 horas con estuche.',
                    price: 29.99,
                    category: 'audio',
                    icon: 'headphones',
                    image_url: '/assets/product_laptop.webp',
                    stock: 20
                },
                {
                    id: `${tenantId}-mouse-gamer`,
                    name: 'Mouse Gamer RGB 6400 DPI',
                    description: 'Sensor óptico de alta precisión, 6 botones programables y cable trenzado.',
                    price: 16.50,
                    category: 'perifericos',
                    icon: 'mouse',
                    image_url: '/assets/product_laptop.webp',
                    stock: 40
                }
            ];
        case 'autoparts':
        default:
            return [
                {
                    id: `${tenantId}-pastillas-freno`,
                    name: 'Pastillas de Freno Cerámicas Delanteras',
                    description: 'Compuesto cerámico de alta duración, frenado silencioso y baja emisión de polvo.',
                    price: 26.00,
                    category: 'frenos',
                    icon: 'disc',
                    image_url: '/assets/product_frenos.webp',
                    stock: 18
                },
                {
                    id: `${tenantId}-aceite-20w50`,
                    name: 'Aceite de Motor 20W-50 Mineral 1L',
                    description: 'Protección antidesgaste para altas temperaturas en motores a gasolina.',
                    price: 7.50,
                    category: 'lubricantes',
                    icon: 'droplet',
                    image_url: '/assets/product_frenos.webp',
                    stock: 60
                }
            ];
    }
}

export const onRequestPost: PagesHandler<Env> = async (context) => {
    const { request, env } = context;
    const db = getDB(env);

    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // 1. Verificar rate limit antes de procesar el registro
    const rateCheck = await checkRegistrationRateLimit(db, clientIp);
    if (!rateCheck.allowed) {
        return jsonResponse({
            error: `Demasiados registros desde esta IP. Por favor espera ${rateCheck.resetInMinutes} minuto(s) antes de intentar nuevamente.`
        }, 429);
    }

    try {
        const rawData = await request.json();
        const result = onboardingSchema.safeParse(rawData);

        if (!result.success) {
            return jsonResponse({ error: 'Datos inválidos', details: result.error.issues }, 400);
        }

        const { tenantName, tenantSlug, template, username, password, email, whatsapp } = result.data;
        
        // Normalizar número de WhatsApp a formato internacional (E.164 Venezuela / LatAm)
        let cleanWhatsApp = whatsapp ? whatsapp.replace(/[^0-9]/g, '') : null;
        if (cleanWhatsApp) {
            if (cleanWhatsApp.startsWith('0')) {
                cleanWhatsApp = '58' + cleanWhatsApp.substring(1);
            } else if (cleanWhatsApp.length === 10 && !cleanWhatsApp.startsWith('58')) {
                cleanWhatsApp = '58' + cleanWhatsApp;
            }
        }

        // 2. Verificar disponibilidad de Slug y Username
        const existingTenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantSlug).first();
        if (existingTenant) {
            return jsonResponse({ error: `El subdominio o dirección "${tenantSlug}" ya está en uso.` }, 400);
        }

        const existingUser = await db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ?')
            .bind(username.toLowerCase().trim(), tenantSlug).first();
        if (existingUser) {
            return jsonResponse({ error: `El nombre de usuario "${username}" ya está registrado en esta tienda.` }, 400);
        }

        // 3. Hash de contraseña directo con PBKDF2 + salt (Fix #5)
        const salt = generateSalt();
        const finalHash = await hashPasswordPBKDF2(password, salt);

        // 4. Generar sesión automática para que el onboarding no requiera re-login
        const sessionToken = crypto.randomUUID();
        const maxAge = 7 * 24 * 60 * 60; // 7 días
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        const legalMetadata = {
            legal: {
                terms_version: 'v1.0',
                terms_accepted: true,
                accepted_at: new Date().toISOString(),
                registration_ip: clientIp
            }
        };

        const statements: D1PreparedStatement[] = [
            db.prepare(
                'INSERT INTO tenants (id, name, plan, template, config_json, whatsapp, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(tenantSlug, tenantName, 'basic', template, JSON.stringify(legalMetadata), cleanWhatsApp || null, 1),
            
            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_rate', '853.50', ?)"
            ).bind(tenantSlug),

            db.prepare(
                "INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_auto_update', '1', ?)"
            ).bind(tenantSlug),

            db.prepare(
                'INSERT INTO users (username, email, password_hash, password_salt, role, tenant_id) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(username.toLowerCase().trim(), email ? email.toLowerCase().trim() : null, finalHash, salt, 'admin', tenantSlug),

            db.prepare(
                'INSERT INTO sessions (token, username, expires_at, tenant_id) VALUES (?, ?, ?, ?)'
            ).bind(sessionToken, username.toLowerCase().trim(), expiresAt, tenantSlug)
        ];

        // 5. Sembrar productos iniciales de ejemplo para eliminar el efecto de "tablero vacío"
        const starterProducts = getStarterProducts(tenantSlug, template);
        for (const p of starterProducts) {
            statements.push(
                db.prepare(
                    'INSERT INTO products (id, name, description, price, category, icon, image_url, template, stock, active, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(p.id, p.name, p.description, p.price, p.category, p.icon, p.image_url, template, p.stock, 1, tenantSlug)
            );
        }

        await db.batch(statements);

        // 6. Registrar el intento exitoso en el rate limiter
        await recordRegistrationAttempt(db, clientIp);

        // Notificar via webhook (asíncrono)
        if (env.WEBHOOK_URL) {
            try {
                context.waitUntil(fetch(env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'new_tenant_registered', tenantSlug, tenantName, username, email })
                }));
            } catch (e) {
                console.error("Webhook error:", e);
            }
        }

        const url = new URL(request.url);
        const isVentrinaApp = url.hostname.endsWith('ventrina.app');
        const domainAttr = isVentrinaApp ? '; Domain=.ventrina.app' : '';
        const cookie = `ventrina_session=${sessionToken}; Path=/${domainAttr}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

        const storeHost = isVentrinaApp 
            ? `${tenantSlug}.ventrina.app` 
            : (url.hostname.includes('localhost') ? `${tenantSlug}.localhost:${url.port || '8788'}` : `${tenantSlug}.${url.host}`);

        return jsonResponse({
            success: true,
            message: `¡Registro exitoso! Tu tienda está disponible en https://${storeHost}`,
            tenantId: tenantSlug
        }, 201, { "Set-Cookie": cookie });

    } catch (err: any) {
        console.error('Error en POST /api/onboarding:', err);
        return jsonResponse({ 
            error: err?.message || 'Error interno al registrar el negocio.',
            detail: err?.cause?.message || err?.message || String(err)
        }, 500);
    }
};
