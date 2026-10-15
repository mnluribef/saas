// src/scripts/landing.ts
// Lógica de interacción para la Landing Page de Vendly (FAQ accordion, smooth scroll, etc.)

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
});
