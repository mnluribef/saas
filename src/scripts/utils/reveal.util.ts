export function initScrollReveal(selector = '.reveal', threshold = 0.15): void {
    const reveals = document.querySelectorAll<HTMLElement>(selector);
    if (!reveals.length) return;

    const observer = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    obs.unobserve(entry.target);
                }
            });
        },
        { threshold }
    );

    reveals.forEach((el) => observer.observe(el));
}
