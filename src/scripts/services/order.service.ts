import type { CartItem, OrderSubmissionData, StoreMetaConfig } from '../types/catalog.types';
import type { ICurrencyService } from './bcv.service';

export interface IOrderService {
    submitOrder(data: OrderSubmissionData, items: CartItem[]): Promise<{ orderId: string }>;
    buildWhatsAppUrl(orderId: string, data: OrderSubmissionData, items: CartItem[]): string;
}

export class OrderService implements IOrderService {
    private config: StoreMetaConfig;
    private currencyService: ICurrencyService;

    constructor(config: StoreMetaConfig, currencyService: ICurrencyService) {
        this.config = config;
        this.currencyService = currencyService;
    }

    async submitOrder(data: OrderSubmissionData, items: CartItem[]): Promise<{ orderId: string }> {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientName: data.clientName,
                clientPhone: data.clientPhone,
                deliveryType: data.deliveryType,
                deliveryAddress: data.deliveryAddress,
                paymentMethod: data.paymentMethod,
                paymentReference: data.paymentReference,
                paymentReceipt: data.paymentReceipt,
                bcvRate: this.currencyService.getRate(),
                storePrefix: this.config.storePrefix,
                template: this.config.template,
                items: items,
            }),
        });

        const result = (await res.json()) as {
            success: boolean;
            orderId?: string;
            error?: string;
        };

        if (!res.ok || !result.success || !result.orderId) {
            throw new Error(result.error || 'Error al procesar el pedido.');
        }

        return { orderId: result.orderId };
    }

    buildWhatsAppUrl(orderId: string, data: OrderSubmissionData, items: CartItem[]): string {
        const labels: Record<string, string> = {
            size: 'Tamaño',
            proteina: 'Proteína',
            punto: 'Punto',
            salsa: 'Salsa',
            cantidad: 'Cantidad',
        };

        let msg = `¡Hola ${this.config.businessName}! 🛍️\n\nHe realizado una orden desde la web.\n*Número de Pedido:* #${orderId}\n*Cliente:* ${data.clientName} (${data.clientPhone})\n\n*Detalle de artículos:*\n`;

        items.forEach((item) => {
            const opts = Object.entries(item.options || {})
                .filter(([, v]) => v)
                .map(([k, v]) => `${labels[k] || k}: ${v}`)
                .join(', ');
            const itemTotal =
                item.price && item.price > 0
                    ? (item.price * item.qty).toFixed(2)
                    : 'A consultar';
            msg += `✅ ${item.qty}x ${item.name}${opts ? ` [${opts}]` : ''} - $${itemTotal}\n`;
        });

        const totalCount = items.reduce((s, i) => s + i.qty, 0);
        const deliveryCost = data.deliveryType === 'delivery' ? this.config.deliveryPrice : 0;
        const subtotal = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
        const totalPrice = subtotal + deliveryCost;

        msg += `\n*Total ${this.config.itemNounPlural}:* ${totalCount}`;
        msg += `\n*Entrega:* ${data.deliveryType === 'delivery' ? `🛵 ${this.config.deliveryName} (+$${this.config.deliveryPrice})` : `🏪 ${this.config.pickupName}`}`;
        if (data.deliveryType === 'delivery') {
            msg += `\n*Dirección:* ${data.deliveryAddress}`;
        }

        const paymentLabels: Record<string, string> = {
            pago_movil: '📱 Pago Móvil',
            zelle: '🇺🇸 Zelle',
            efectivo: '💵 Efectivo',
            punto: '💳 Punto de Venta',
        };
        msg += `\n*Pago:* ${paymentLabels[data.paymentMethod] || data.paymentMethod}`;
        if (data.paymentReference) {
            msg += `\n*Referencia:* ${data.paymentReference}`;
        }

        if (data.paymentReceipt) {
            msg += `\n*Comprobante:* ✅ Adjuntado en el sistema web`;
        }

        const totalBsFormatted = this.currencyService.formatBs(totalPrice);
        const bcvRate = this.currencyService.getRate();

        msg += `\n\n*Total USD:* $${totalPrice.toFixed(2)}`;
        msg += `\n*Tasa Oficial BCV:* Bs. ${bcvRate.toFixed(2)}`;
        msg += `\n*Total en Bolívares:* Bs. ${totalBsFormatted}`;
        msg += `\n\n🚀 *Por favor confirmen el pedido. ¡Gracias!*`;

        return `https://wa.me/${this.config.whatsappNumber}?text=${encodeURIComponent(msg)}`;
    }
}
