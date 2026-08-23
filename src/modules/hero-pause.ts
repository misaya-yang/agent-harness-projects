/**
 * 首屏签名图的暂停控件：
 * 环绕动画属于持续非必要动效，必须可暂停（WCAG 2.2.2）。
 * SMIL 动画用 svg.pauseAnimations() 原生暂停；
 * 减弱动效下默认暂停，保持静态构图。
 */
export function initHeroPause(): void {
  const fig = document.querySelector<HTMLElement>("[data-hero-loop]");
  const svg = fig?.querySelector<SVGSVGElement>("svg");
  const btn = document.querySelector<HTMLButtonElement>("[data-loop-pause]");
  if (!fig || !btn) return;

  const setPaused = (paused: boolean): void => {
    fig.classList.toggle("is-paused", paused);
    btn.setAttribute("aria-pressed", String(paused));
    btn.textContent = paused ? "▶ 恢复" : "⏸ 暂停";
    svg?.pauseAnimations?.();
    if (!paused) svg?.unpauseAnimations?.();
  };

  btn.addEventListener("click", () => {
    setPaused(!fig.classList.contains("is-paused"));
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setPaused(true);
  }
}
