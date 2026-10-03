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

    constructor(initialRate = 853.50) {
        this.currentRate = initialRate;
    }

    getRate(): number {
        return this.currentRate;
    }

    async fetchRate(): Promise<number> {
        try {
            const res = await fetch('/api/bcv');
            if (res.ok) {
                const data = (await res.json()) as { rate?: number | string };
                if (data.rate && parseFloat(String(data.rate)) > 0) {
                    this.currentRate = parseFloat(String(data.rate));
                    this.notifyListeners();
                }
            }
        } catch {
            // Preservar la tasa por defecto en caso de falla de red
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
