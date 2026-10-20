import { describe, it, expect } from 'vitest';
import { paymentSettingsSchema, pagoMovilAccountSchema } from '../functions/api/settings';
import { OrderService } from '../src/scripts/services/order.service';
import type { OrderSubmissionData, CartItem, StoreMetaConfig } from '../src/scripts/types/catalog.types';

describe('Multi-Account Pago Móvil Feature Tests', () => {
    describe('Zod Validation Schemas (settings.ts)', () => {
        it('validates a single valid Pago Movil account', () => {
            const account = {
                id: 'pm_1',
                banco: 'Banesco (0134)',
                telefono: '0412-4756191',
                cedula: 'V-12345678',
                titular: 'Mi Tienda C.A.',
                isDefault: true,
            };

            const result = pagoMovilAccountSchema.safeParse(account);
            expect(result.success).toBe(true);
        });

        it('validates payment settings with multiple pagoMovilAccounts', () => {
            const paymentPayload = {
                pagoMovilAccounts: [
                    {
                        id: 'pm_1',
                        banco: 'Banesco (0134)',
                        telefono: '0412-1111111',
                        cedula: 'V-11111111',
                        titular: 'Cuenta Principal',
                        isDefault: true,
                    },
                    {
                        id: 'pm_2',
                        banco: 'Banco de Venezuela (0102)',
                        telefono: '0416-2222222',
                        cedula: 'J-22222222-0',
                        titular: 'Cuenta Secundaria BDV',
                        isDefault: false,
                    },
                ],
                pagoMovil: {
                    banco: 'Banesco (0134)',
                    telefono: '0412-1111111',
                    cedula: 'V-11111111',
                    titular: 'Cuenta Principal',
                },
                efectivo: true,
                punto: true,
            };

            const result = paymentSettingsSchema.safeParse(paymentPayload);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.pagoMovilAccounts).toHaveLength(2);
                expect(result.data.pagoMovilAccounts?.[0].banco).toBe('Banesco (0134)');
                expect(result.data.pagoMovilAccounts?.[1].banco).toBe('Banco de Venezuela (0102)');
            }
        });

        it('enforces maximum 10 accounts constraint', () => {
            const accounts = Array.from({ length: 11 }, (_, i) => ({
                id: `pm_${i}`,
                banco: `Banco ${i}`,
                telefono: '0412-0000000',
                cedula: 'V-00000000',
            }));

            const result = paymentSettingsSchema.safeParse({ pagoMovilAccounts: accounts });
            expect(result.success).toBe(false);
        });
    });

    describe('OrderService WhatsApp URL Building with Selected Pago Móvil Account', () => {
        const mockConfig: StoreMetaConfig = {
            whatsappNumber: '584121234567',
            defaultCurrency: '$',
            businessName: 'Ventrina Store',
            template: 'tech',
            itemNounSingular: 'Producto',
            itemNounPlural: 'Productos',
            emptyCartEmoji: '🛒',
            deliveryName: 'Delivery Express',
            deliveryPrice: 3.5,
            pickupName: 'Retiro en Tienda',
            storePrefix: 'VEN',
        };

        const mockCurrencyService: any = {
            formatBs: (usd: number) => `Bs. ${(usd * 60).toFixed(2)}`,
            getRate: () => 60.0,
        };

        it('formats WhatsApp message with specific Pago Móvil bank', () => {
            const orderService = new OrderService(mockConfig, mockCurrencyService);

            const submissionData: OrderSubmissionData = {
                clientName: 'María Pérez',
                clientPhone: '0414-9998877',
                deliveryType: 'retiro',
                deliveryAddress: '',
                paymentMethod: 'pago_movil:Banco de Venezuela (0102)',
                paymentReference: '7654321',
                paymentReceipt: null,
            };

            const items: CartItem[] = [
                {
                    id: 'prod_1',
                    key: 'prod_1',
                    name: 'Mouse Gamer RGB',
                    price: 25.0,
                    qty: 1,
                    icon: 'package',
                    options: {},
                },
            ];

            const waUrl = orderService.buildWhatsAppUrl('VEN-99881', submissionData, items);
            expect(waUrl).toContain('https://wa.me/584121234567?text=');
            const decoded = decodeURIComponent(waUrl);

            expect(decoded).toContain('*Pago:* 📱 Pago Móvil (Banco de Venezuela (0102))');
            expect(decoded).toContain('*Referencia:* 7654321');
            expect(decoded).toContain('Mouse Gamer RGB');
        });

        it('formats generic pago_movil without specific bank gracefully', () => {
            const orderService = new OrderService(mockConfig, mockCurrencyService);

            const submissionData: OrderSubmissionData = {
                clientName: 'Carlos Gómez',
                clientPhone: '0412-3334455',
                deliveryType: 'retiro',
                deliveryAddress: '',
                paymentMethod: 'pago_movil',
                paymentReference: '123456',
                paymentReceipt: null,
            };

            const items: CartItem[] = [
                {
                    id: 'prod_2',
                    key: 'prod_2',
                    name: 'Teclado Mecánico',
                    price: 50.0,
                    qty: 1,
                    icon: 'package',
                    options: {},
                },
            ];

            const waUrl = orderService.buildWhatsAppUrl('VEN-99882', submissionData, items);
            const decoded = decodeURIComponent(waUrl);

            expect(decoded).toContain('*Pago:* 📱 Pago Móvil');
            expect(decoded).toContain('*Referencia:* 123456');
        });
    });
});
