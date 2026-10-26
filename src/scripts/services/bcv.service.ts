export const DEFAULT_BCV_FALLBACK_RATE = 886.23;
export const EXTERNAL_BCV_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial";

export function formatBsCurrency(amount: number): string {
    return new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

export interface ICurrencyService {
    getRate(): number;
    fetchRate(): Promise<number>;
    toBs(usdAmount: number): number;
    formatBs(usdAmount: number): string;
    onRateChange(listener: (rate: number) => void): void;
}

export class BcvCurrencyService implements ICurrencyService {
    private currentRate: number;
    private listeners: Array<(rate: number) => void> = [];

    constructor(initialRate = DEFAULT_BCV_FALLBACK_RATE) {
        this.currentRate = initialRate;
    }

    getRate(): number {
        return this.currentRate;
    }

    async fetchRate(): Promise<number> {
        // 1. Intentar endpoint interno del SaaS
        try {
            const res = await fetch('/api/bcv');
            if (res.ok) {
                const data = (await res.json()) as { rate?: number | string };
                if (data.rate && parseFloat(String(data.rate)) > 0) {
                    this.currentRate = parseFloat(String(data.rate));
                    this.notifyListeners();
                    return this.currentRate;
                }
            }
        } catch {
            // Continuar con fallback directo
        }

        // 2. Fallback a la API oficial externa si /api/bcv no responde (ej. en desarrollo local estático)
        try {
            const extRes = await fetch(EXTERNAL_BCV_API_URL);
            if (extRes.ok) {
                const data = (await extRes.json()) as { promedio?: number; price?: number };
                const fetchedRate = parseFloat(String(data.promedio || data.price || 0));
                if (fetchedRate > 0) {
                    this.currentRate = Math.round(fetchedRate * 100) / 100;
                    this.notifyListeners();
                    return this.currentRate;
                }
            }
        } catch {
            // Preservar la tasa por defecto en caso de falla de red total
        }

        return this.currentRate;
    }

    toBs(usdAmount: number): number {
        return usdAmount * this.currentRate;
    }

    formatBs(usdAmount: number): string {
        return this.toBs(usdAmount).toFixed(2);
    }

    onRateChange(listener: (rate: number) => void): void {
        this.listeners.push(listener);
    }

    private notifyListeners(): void {
        document.querySelectorAll('.bcv-rate-text').forEach((el) => {
            el.textContent = this.currentRate.toFixed(2);
        });
        this.listeners.forEach((listener) => listener(this.currentRate));
    }
}
