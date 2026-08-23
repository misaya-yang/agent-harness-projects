/**
 * 章节滚动定位（scrollspy）：
 * 以视口中部为判定带，命中章节时同步桌面轨与移动菜单的 aria-current。
 */
export function initSpy(): void {
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("section[id][data-spy]"),
  );
  if (sections.length === 0 || !("IntersectionObserver" in window)) return;

  const links = new Map<string, HTMLAnchorElement[]>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-spy-link]")) {
    const id = a.getAttribute("href")?.replace(/^#/, "");
    if (!id) continue;
    const list = links.get(id) ?? [];
    list.push(a);
    links.set(id, list);
  }

  const setCurrent = (id: string): void => {
    for (const [sid, els] of links) {
      for (const el of els) {
        if (sid === id) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      }
    }
  };

  let current = "";
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).id;
        if (id !== current) {
          current = id;
          setCurrent(id);
        }
      }
    },
    { rootMargin: "-38% 0px -55% 0px", threshold: 0 },
  );

  for (const s of sections) io.observe(s);
}
