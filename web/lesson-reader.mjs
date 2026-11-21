export function setupLessonReader(record, save) {
  const parts = [...document.querySelectorAll("[data-part]")];
  if (!parts.length) return;
  const folds = [...document.querySelectorAll(".lesson-supplement, .practice-note")];
  const foldId = fold => fold.dataset.note || fold.dataset.part;
  const links = [...document.querySelectorAll(".lesson-outline a")];
  const byId = id => document.getElementById(id);
  const clamp = n => Math.max(0, Math.min(1, n));
  const top = el => el.getBoundingClientRect().top + scrollY;
  const offset = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  let active;
  let frame;
  let timer;
  let ready = false;
  let changed = false;

  function reveal(target) {
    const fold = target?.closest(".lesson-supplement, .practice-note, .intro-notes");
    if (fold) fold.open = true;
  }
  function track() {
    frame = 0;
    const line = scrollY + offset() + 2;
    const part = parts.findLast(item => top(item) <= line) ?? parts[0];
    if (active === part) return;
    active = part;
    for (const link of links) {
      if (link.hash.slice(1) === part.dataset.part) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function bounds(part) {
    const start = part === parts[0] ? 0 : top(part) - offset();
    const next = parts[parts.indexOf(part) + 1];
    const end = next ? top(next) - offset() : document.documentElement.scrollHeight - innerHeight;
    return { start, length: Math.max(1, end - start) };
  }
  function remember() {
    if (!ready || !changed) return;
    track();
    const { start, length } = bounds(active);
    save({ scroll: Math.round(scrollY), position: {
      section: active.dataset.part, fraction: clamp((scrollY - start) / length),
      open: folds.filter(fold => fold.open).map(foldId),
      notes: document.querySelector(".intro-notes")?.open ?? false,
    } });
  }
  function update() {
    if (!ready) return;
    changed = true;
    if (!frame) frame = requestAnimationFrame(track);
    clearTimeout(timer);
    timer = setTimeout(remember, 180);
  }

  // Open a folded destination before the browser performs its native anchor jump.
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) reveal(byId(link.hash.slice(1)));
  });
  const fragment = () => byId(location.hash.slice(1));
  const follow = () => {
    const target = fragment();
    if (target?.closest("[data-part]")) {
      reveal(target);
      target.scrollIntoView();
    }
    update();
  };
  addEventListener("hashchange", follow);
  const position = record.position;
  const reload = performance.getEntriesByType("navigation")[0]?.type === "reload";
  const resume = (!location.hash && new URLSearchParams(location.search).has("resume")) ||
    (reload && (!location.hash || fragment()?.closest("[data-part]")?.dataset.part === position?.section));
  const savedPart = parts.find(part => part.dataset.part === (position?.section || "lesson-intro"));
  if (resume && position) {
    if (Array.isArray(position.open)) {
      for (const fold of folds) fold.open = position.open.includes(foldId(fold));
    } else reveal(savedPart);
    const notes = document.querySelector(".intro-notes");
    if (notes) notes.open = Boolean(position.notes);
  }
  if (!resume || !savedPart) reveal(fragment());

  function restore() {
    if (resume && savedPart && position) {
      const { start, length } = bounds(savedPart);
      // The paginated reader stored pageFraction; the continuous reader stores fraction.
      scrollTo(0, start + clamp(position.fraction ?? position.pageFraction ?? 0) * length);
    } else if (fragment()) {
      reveal(fragment());
      fragment().scrollIntoView();
    } else if (resume && Number.isFinite(record.scroll)) scrollTo(0, record.scroll);
    ready = true;
    changed = Boolean(location.hash || resume);
    track();
  }
  document.fonts.ready.then(restore);
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", () => { if (ready) track(); });
  document.querySelector(".paper-reader-main").addEventListener("toggle", update, true);
  addEventListener("pagehide", remember);
}
