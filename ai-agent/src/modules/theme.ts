const STORAGE_KEY = "codex-atlas-theme";

type Theme = "light" | "dark";

export function initTheme(): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]"),
  );
  if (buttons.length === 0) return;

  const effectiveTheme = (): Theme =>
    root.dataset.theme === "dark" ||
    (!root.dataset.theme && systemDark.matches)
      ? "dark"
      : "light";

  const render = (): void => {
    const current = effectiveTheme();
    const next = current === "dark" ? "light" : "dark";
    for (const button of buttons) {
      button.setAttribute("aria-label", `切换到${next === "dark" ? "深色" : "浅色"}模式`);
      const label = button.querySelector<HTMLElement>("[data-theme-label]");
      const icon = button.querySelector<HTMLElement>("[data-theme-icon]");
      if (label) label.textContent = `${next === "dark" ? "深色" : "浅色"}模式`;
      if (icon) icon.textContent = next === "dark" ? "◐" : "☀";
    }
  };

  const setTheme = (theme: Theme): void => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    render();
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      setTheme(effectiveTheme() === "dark" ? "light" : "dark");
    });
  }
  systemDark.addEventListener("change", render);
  render();
}
