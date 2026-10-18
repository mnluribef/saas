// functions/api/_whatsapp.ts
// Generación y normalización de notificaciones WhatsApp para pedidos

/**
 * Normaliza un número de teléfono a formato internacional E.164 (Venezuela / LatAm)
 */
export function normalizePhoneForWhatsApp(phone: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return '';
    if (cleanPhone.startsWith('0')) {
        return '58' + cleanPhone.slice(1);
    }
    if (cleanPhone.length === 10 && !cleanPhone.startsWith('58')) {
        return '58' + cleanPhone;
    }
    return cleanPhone;
}

export interface OrderStatusNotificationData {
    id: string;
    client_name: string;
    client_phone?: string | null;
    status: string;
    delivery_type?: string | null;
    delivery_address?: string | null;
}

/**
 * Construye la URL de WhatsApp para notificar cambios de estado al cliente
 */
export function buildOrderStatusWhatsAppUrl(order: OrderStatusNotificationData): string | null {
    if (!order.client_phone) return null;
    const formattedPhone = normalizePhoneForWhatsApp(order.client_phone);
    if (!formattedPhone) return null;

    let messageText = `Hola ${order.client_name}, el estado de tu pedido #${order.id} es: ${order.status}.`;
    if (order.status === 'en_produccion') {
        messageText = `¡Hola ${order.client_name}! 👩‍🍳 Tu pedido #${order.id} ya está en preparación. Te avisaremos apenas esté listo.`;
    } else if (order.status === 'listo_entrega') {
        messageText = order.delivery_type === 'delivery'
            ? `¡Hola ${order.client_name}! 🛵 Tu pedido #${order.id} ya está listo y va en camino a tu dirección: ${order.delivery_address || ''}.`
            : `¡Hola ${order.client_name}! 🛍️ Tu pedido #${order.id} ya está listo para ser retirado en tienda.`;
    } else if (order.status === 'completado') {
        messageText = `¡Hola ${order.client_name}! 🎉 Tu pedido #${order.id} ha sido completado con éxito. ¡Muchas gracias por tu compra!`;
    } else if (order.status === 'cancelado') {
        messageText = `Hola ${order.client_name}. Te informamos que tu pedido #${order.id} ha sido cancelado. Si tienes alguna duda, estamos a la orden.`;
    }

    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageText)}`;
}
