// tests/email-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateWelcomeEmailHtml,
    generateWelcomeEmailText,
    sendWelcomeEmail,
    generateOrderStatusEmailHtml,
    generateOrderStatusEmailText,
    sendOrderStatusEmail
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

    describe('sendOrderStatusEmail (Fix #18)', () => {
        const orderEmailData = {
            to: 'cliente@ejemplo.com',
            clientName: 'María Pérez',
            orderId: 'ord_998877',
            tenantName: 'El Fogón Criollo',
            newStatus: 'listo_entrega',
            totalPrice: 25.50,
            totalBs: 930.75,
            note: 'Retirar por ventanilla 2'
        };

        it('generates email HTML with order details, status label and totals without inline styles', () => {
            const html = generateOrderStatusEmailHtml(orderEmailData);
            expect(html).toContain('María Pérez');
            expect(html).toContain('ord_998877');
            expect(html).toContain('Listo para entrega / retiro');
            expect(html).toContain('$25.50');
            expect(html).toContain('Bs. 930.75');
            expect(html).toContain('Retirar por ventanilla 2');
            expect(html).not.toContain('style=');
        });

        it('generates email plaintext with order details', () => {
            const text = generateOrderStatusEmailText(orderEmailData);
            expect(text).toContain('María Pérez');
            expect(text).toContain('ord_998877');
            expect(text).toContain('Listo para entrega / retiro');
            expect(text).toContain('$25.50');
        });

        it('simulates order email sending when RESEND_API_KEY is missing', async () => {
            const mockEnv = {} as Env;
            const res = await sendOrderStatusEmail(mockEnv, orderEmailData);
            expect(res.success).toBe(true);
            expect(res.mocked).toBe(true);
            expect(res.messageId).toContain('simulated-order-');
        });

        it('sends order email via Resend when API key is provided', async () => {
            const mockEnv = { RESEND_API_KEY: 're_valid_key' } as Env;
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ id: 'msg_order_12345' }), { status: 200 })
            );

            const res = await sendOrderStatusEmail(mockEnv, orderEmailData);
            expect(res.success).toBe(true);
            expect(res.messageId).toBe('msg_order_12345');
        });
    });
});
