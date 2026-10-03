import type { CartItem, StoreMetaConfig } from '../types/catalog.types';
import type { ICartStorage } from './storage.service';

export class CartService {
    private storage: ICartStorage;
    private config: StoreMetaConfig;
    private items: CartItem[];
    private listeners: Array<(items: CartItem[]) => void> = [];

    constructor(storage: ICartStorage, config: StoreMetaConfig) {
        this.storage = storage;
        this.config = config;
        this.items = this.storage.getItems();
    }

    getItems(): CartItem[] {
        return [...this.items];
    }

    getTotalCount(): number {
        return this.items.reduce((sum, item) => sum + item.qty, 0);
    }

    getItemsSubtotal(): number {
        return this.items.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
    }

    calculateTotal(deliveryType: 'retiro' | 'delivery'): {
        subtotal: number;
        deliveryCost: number;
        total: number;
    } {
        const subtotal = this.getItemsSubtotal();
        const deliveryCost = deliveryType === 'delivery' ? this.config.deliveryPrice : 0;
        const total = subtotal + deliveryCost;
        return { subtotal, deliveryCost, total };
    }

    addItem(
        id: string,
        name: string,
        price: number,
        qty = 1,
        icon = 'package',
        options: Record<string, string> = {},
        optionLabels: Record<string, string> = {}
    ): { itemKey: string; isNew: boolean } {
        const optionsKey = Object.keys(options)
            .sort()
            .map((k) => options[k])
            .join('-');
        const itemKey = optionsKey ? `${id}-${optionsKey}` : id;

        const existing = this.items.find((i) => i.key === itemKey);
        let isNew = false;

        if (existing) {
            existing.qty += qty;
            if (existing.price === undefined) existing.price = price;
            if (Object.keys(optionLabels).length > 0) {
                existing.optionLabels = { ...(existing.optionLabels || {}), ...optionLabels };
            }
        } else {
            this.items.push({ id, key: itemKey, name, price, qty, icon, options, optionLabels });
            isNew = true;
        }

        this.persistAndNotify();
        return { itemKey, isNew };
    }

    updateQuantity(key: string, delta: number): void {
        const item = this.items.find((i) => i.key === key);
        if (!item) return;

        item.qty += delta;
        if (item.qty <= 0) {
            this.removeItem(key);
        } else {
            this.persistAndNotify();
        }
    }

    removeItem(key: string): void {
        this.items = this.items.filter((i) => i.key !== key);
        this.persistAndNotify();
    }

    clear(): void {
        this.items = [];
        this.persistAndNotify();
    }

    subscribe(listener: (items: CartItem[]) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    private persistAndNotify(): void {
        this.storage.saveItems(this.items);
        this.listeners.forEach((listener) => listener([...this.items]));
    }
}
