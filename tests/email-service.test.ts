// tests/email-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateWelcomeEmailHtml,
    generateWelcomeEmailText,
    sendWelcomeEmail
} from '../functions/api/_services/email.service';
import type { Env } from '../functions/types';

describe('Transactional Email Service & Welcome Template (email.service.ts)', () => {
    const sampleData = {
        to: 'owner@elrestaurante.com',
        tenantName: 'El Fogón Criollo',
        tenantSlug: 'fogon',
        template: 'restaurant',
        storeUrl: 'https://fogon.ventrina.app',
        adminUrl: 'https://ventrina.app/admin?tenant=fogon'
    };

    describe('generateWelcomeEmailHtml', () => {
        it('renders store details, URLs and recipient email in the HTML', () => {
            const html = generateWelcomeEmailHtml(sampleData);
            expect(html).toContain('El Fogón Criollo');
            expect(html).toContain('owner@elrestaurante.com');
            expect(html).toContain('https://fogon.ventrina.app');
            expect(html).toContain('https://ventrina.app/admin?tenant=fogon');
            expect(html).toContain('Restaurante / Comida');
        });

        it('contains the 4 quickstart instructions for store owners', () => {
            const html = generateWelcomeEmailHtml(sampleData);
            expect(html).toContain('Personaliza tus productos de ejemplo');
            expect(html).toContain('Verifica tu número de WhatsApp');
            expect(html).toContain('Configura métodos de pago y tasa BCV');
            expect(html).toContain('Comparte tu tienda en redes sociales');
        });
    });

    describe('generateWelcomeEmailText', () => {
        it('renders clean plaintext with instructions and links', () => {
            const text = generateWelcomeEmailText(sampleData);
            expect(text).toContain('El Fogón Criollo');
            expect(text).toContain('https://fogon.ventrina.app');
            expect(text).toContain('https://ventrina.app/admin?tenant=fogon');
            expect(text).toContain('PRIMEROS PASOS PARA EMPEZAR A VENDER:');
            expect(text).toContain('1. Revisa tu catálogo inicial');
            expect(text).toContain('2. Conecta tu WhatsApp para recibir pedidos');
            expect(text).toContain('3. Configura tus pagos y tasa de cambio');
            expect(text).toContain('4. Comparte el enlace de tu tienda');
        });
    });

    describe('sendWelcomeEmail Delivery Modes', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('simulates email sending when RESEND_API_KEY is not configured', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const mockEnv = {} as Env;

            const result = await sendWelcomeEmail(mockEnv, sampleData);
            expect(result.success).toBe(true);
            expect(result.mocked).toBe(true);
            expect(result.messageId).toContain('simulated-');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[EmailService] Clave RESEND_API_KEY no configurada. Simulando envío de bienvenida a: owner@elrestaurante.com')
            );
        });

        it('sends email via Resend API when RESEND_API_KEY is configured', async () => {
            const mockEnv = {
                RESEND_API_KEY: 're_test_123456',
                EMAIL_FROM: 'Ventrina <hola@ventrina.app>'
            } as Env;

            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ id: 'msg_resend_98765' }), { status: 200 })
            );

            const result = await sendWelcomeEmail(mockEnv, sampleData);
            expect(result.success).toBe(true);
            expect(result.messageId).toBe('msg_resend_98765');
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.resend.com/emails',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer re_test_123456'
                    })
                })
            );
        });

        it('handles Resend API error responses gracefully without crashing', async () => {
            const mockEnv = {
                RESEND_API_KEY: 're_invalid_key'
            } as Env;

            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response('Invalid API key', { status: 401 })
            );

            const result = await sendWelcomeEmail(mockEnv, sampleData);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Resend error 401');
        });
    });
});
