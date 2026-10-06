// Intersection Observer for reveal animations
document.addEventListener("DOMContentLoaded", () => {
    const reveals = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("active");
                    observer.unobserve(entry.target);
                }
            });
        },
        { rootMargin: "0px 0px -50px 0px" }
    );

    if (reveals.length > 0) {
        reveals.forEach((reveal) => revealObserver.observe(reveal));
    }
});
