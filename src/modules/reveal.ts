/**
 * 滚动触发的进场揭示。
 * 契约：JS 失败或 prefers-reduced-motion 下内容完整可见（CSS 只在 html.js:not(.rm)
 * 下预隐藏）；进入视口后一次性加入 .is-in，之后不再重复触发。
 */
export function initReveal(reducedMotion: boolean): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (els.length === 0) return;

  // 减弱动效：直接呈现最终状态，不隐藏、不观察。
  if (reducedMotion || !("IntersectionObserver" in window)) {
    for (const el of els) el.classList.add("is-in");
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
    { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
  );

  for (const el of els) io.observe(el);
}
