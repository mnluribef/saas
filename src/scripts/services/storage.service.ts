import type { CartItem } from '../types/catalog.types';

export interface ICartStorage {
    getItems(): CartItem[];
    saveItems(items: CartItem[]): void;
    clear(): void;
}

export class LocalStorageCartStorage implements ICartStorage {
    private storageKey: string;

    constructor(storageKey: string) {
        this.storageKey = storageKey;
    }

    getItems(): CartItem[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    saveItems(items: CartItem[]): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(items));
        } catch {
            // Ignorar errores de cuota en navegadores privados
        }
    }

    clear(): void {
        try {
            localStorage.removeItem(this.storageKey);
        } catch {
            // No-op
        }
    }
}
