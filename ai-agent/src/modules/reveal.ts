export function initReveal(reducedMotion: boolean): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (els.length === 0) return;

  if (reducedMotion || !("IntersectionObserver" in window)) {
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const delay = Number.parseInt(el.dataset.revealDelay ?? "0", 10);
        if (Number.isFinite(delay) && delay > 0) {
          el.style.setProperty("--d", `${delay}ms`);
        }
        el.classList.add("is-in");
        io.unobserve(el);
      }
    },
    { threshold: 0, rootMargin: "0px 0px -7% 0px" },
  );

  for (const el of els) io.observe(el);
}
