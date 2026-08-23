/**
 * 移动端章节菜单：真实按钮 + aria-expanded，
 * Escape 关闭、点击外部关闭、点击链接后关闭；不锁定页面滚动。
 */
export function initNavMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>("[data-menu-btn]");
  const panel = document.querySelector<HTMLElement>("[data-menu-panel]");
  if (!btn || !panel) return;

  const setOpen = (open: boolean): void => {
    btn.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
  };

  btn.addEventListener("click", () => {
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      setOpen(false);
      btn.focus();
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (panel.hidden) return;
    const t = e.target as Node;
    if (!panel.contains(t) && !btn.contains(t)) setOpen(false);
  });

  panel.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  });
}
