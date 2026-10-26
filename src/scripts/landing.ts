// src/scripts/landing.ts
// Lógica de interacción para la Landing Page de Ventrina (FAQ accordion, smooth scroll, etc.)
import { BcvCurrencyService, formatBsCurrency } from './services/bcv.service';

document.addEventListener('DOMContentLoaded', () => {
    // 1. FAQ Accordion Interactivo
    const faqButtons = document.querySelectorAll('.faq-question-btn');
    faqButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const currentItem = btn.closest('.faq-item-modern');
            if (!currentItem) return;

            const isOpen = currentItem.classList.contains('active');

            // Cierra todos los demás
            document.querySelectorAll('.faq-item-modern').forEach(item => {
                item.classList.remove('active');
            });

            // Alterna el actual
            if (!isOpen) {
                currentItem.classList.add('active');
            }
        });
    });

    // 2. Navbar scroll effect
    const navbar = document.querySelector('.glass-nav');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }, { passive: true });
    }

    // 3. Sincronización en vivo de la Tasa Oficial BCV para mockups interactivos
    const heroWaTotal = document.getElementById('hero-wa-total');
    const dashBcvRate = document.getElementById('dash-bcv-rate');

    if (heroWaTotal || dashBcvRate) {
        const currencyService = new BcvCurrencyService();

        const updateLandingRates = (rate: number) => {
            if (rate <= 0) return;
            if (heroWaTotal) {
                const totalBs = 45.00 * rate;
                heroWaTotal.textContent = `Total: $45.00 ≈ Bs. ${formatBsCurrency(totalBs)}`;
            }
            if (dashBcvRate) {
                dashBcvRate.textContent = `${formatBsCurrency(rate)} Bs`;
            }
        };

        currencyService.onRateChange(updateLandingRates);
        currencyService.fetchRate().then(rate => {
            updateLandingRates(rate);
        }).catch(() => {
            // Preservar valores pre-renderizados
        });
    }
});
