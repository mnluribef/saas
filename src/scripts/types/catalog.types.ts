export interface StoreMetaConfig {
    whatsappNumber: string;
    defaultCurrency: string;
    businessName: string;
    template: string;
    itemNounSingular: string;
    itemNounPlural: string;
    emptyCartEmoji: string;
    deliveryName: string;
    deliveryPrice: number;
    pickupName: string;
    storePrefix: string;
}

export interface CartItem {
    id: string;
    key: string;
    name: string;
    price?: number;
    qty: number;
    icon: string;
    options: Record<string, string>;
    optionLabels?: Record<string, string>;
}

export interface CatalogProductAttribute {
    key: string;
    label: string;
    type: string;
    values: string[];
}

export interface CatalogProduct {
    id: string;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
    type_id?: string;
    category?: string;
    icon?: string;
    brand?: string;
    model?: string;
    attributes?: CatalogProductAttribute[];
    sizes?: string;
}

export interface TemplateCategory {
    id: string;
    name: string;
    icon?: string;
}

export interface OrderSubmissionData {
    clientName: string;
    clientPhone: string;
    deliveryType: 'retiro' | 'delivery';
    deliveryAddress: string;
    paymentMethod: string;
    paymentReference: string;
    paymentReceipt: string | null;
}
