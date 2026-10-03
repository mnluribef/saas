import { renderIconSvg } from '../../components/common/icons';

export interface IToastService {
    show(message: string, durationMs?: number): void;
}

export class ToastService implements IToastService {
    private containerId: string;

    constructor(containerId = 'toast-container') {
        this.containerId = containerId;
    }

    show(message: string, durationMs = 3500): void {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        const toast = document.createElement('div');
        toast.className = 'toast';

        const span = document.createElement('span');
        span.textContent = message;

        toast.innerHTML = renderIconSvg('check-circle', { size: 18, stroke: '#25D366' });
        toast.appendChild(span);
        container.appendChild(toast);

        setTimeout(() => toast.remove(), durationMs);
    }
}
