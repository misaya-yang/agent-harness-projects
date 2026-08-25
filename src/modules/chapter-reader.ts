import {
  initLearningProgress,
  isChapterCompleted,
  toggleChapterCompletion,
  getCurrentCourseId,
} from "./learning-progress";
import { initMachineFullscreen } from "./machine-fullscreen";

type Chapter = {
  id: string;
  no: string;
  label: string;
  title: string;
  coverage: string[];
  view: HTMLElement;
};

function coverageFor(view: HTMLElement): string[] {
  const coverage = ["原理"];
  if (view.querySelector(".lesson-brief, .source-route, .source-notes")) coverage.push("源码");
  if (view.querySelector(".machine")) coverage.push("实验");
  if (view.querySelector(".decision, .fact-boundary, .environment-matrix")) coverage.push("边界");
  if (view.querySelector(".interview")) coverage.push("面试");
  return coverage;
}

function chapterLabel(id: string): string {
  const link =
    document.querySelector<HTMLAnchorElement>(`.rail a[href="#${id}"]`) ??
    document.querySelector<HTMLAnchorElement>(`.chapter-nav a[href="#${id}"]`);
  const no = link?.querySelector(".no")?.textContent ?? "";
  return link?.textContent?.replace(no, "").trim() || id;
}

function buildCourseMap(chapters: Chapter[]): HTMLElement {
  const map = document.createElement("section");
  map.className = "reader-map";
  map.id = "reader-map";
  map.setAttribute("aria-labelledby", "reader-map-title");
  map.innerHTML = `
    <header class="reader-map-head">
      <span class="label-mono">COURSE MAP · 12 CHAPTERS</span>
      <h2 id="reader-map-title">不是一条滑到底的长页，而是三段可以完成的学习路径。</h2>
      <p>每章都标明实际覆盖的原理、源码、交互实验、工程边界与面试输出；选一章进入，完成后打卡继续下一章。</p>
    </header>`;

  const phases = [
    ["01—04", "建立系统模型", "先认清结构、状态与一次运行的控制权。"],
    ["05—08", "追踪运行证据", "沿工具、上下文与持久化事实定位问题。"],
    ["09—12", "进入生产边界", "理解扩展、运行表面、安全与实践。"],
  ];
  const grid = document.createElement("div");
  grid.className = "reader-map-grid";

  phases.forEach(([range, title, note], phaseIndex) => {
    const phase = document.createElement("article");
    phase.className = "reader-phase";
    phase.innerHTML = `
      <span class="label-mono">${range}</span>
      <div class="reader-phase-title-wrap">
        <h3>${title}</h3>
        <span class="phase-completion-tag label-mono">0/4 完成</span>
      </div>
      <p>${note}</p>
    `;
    const list = document.createElement("div");
    list.className = "reader-phase-list";
    chapters.slice(phaseIndex * 4, phaseIndex * 4 + 4).forEach((chapter) => {
      const link = document.createElement("a");
      link.href = `#${chapter.id}`;
      link.title = chapter.title;
      link.innerHTML = `<span>${chapter.no}</span><strong>${chapter.label}</strong><small>${chapter.coverage.join(" · ")}</small>`;
      list.append(link);
    });
    phase.append(list);
    grid.append(phase);
  });
  map.append(grid);
  return map;
}

export function initChapterReader(): void {
  const main = document.querySelector<HTMLElement>("main");
  const tabs = main?.querySelector<HTMLElement>(":scope > .series-nav-tabs");
  const hero = main?.querySelector<HTMLElement>(":scope > .hero#top");
  const sections = main ? Array.from(main.querySelectorAll<HTMLElement>(":scope > section.chapter")) : [];
  if (!main || !tabs || !hero || sections.length === 0) return;

  const chapters: Chapter[] = [
    {
      id: "top",
      no: "00",
      label: "课程地图",
      title: hero.querySelector("h1")?.textContent?.trim() ?? "课程地图",
      coverage: ["全景", "学习路径"],
      view: hero,
    },
    ...sections.map((view, index) => ({
      id: view.id,
      no: String(index + 1).padStart(2, "0"),
      label: chapterLabel(view.id),
      title: view.querySelector("h2")?.textContent?.trim() ?? chapterLabel(view.id),
      coverage: coverageFor(view),
      view,
    })),
  ];

  hero.append(buildCourseMap(chapters.slice(1)));

  const toolbar = document.createElement("div");
  toolbar.className = "reader-toolbar shell";
  toolbar.innerHTML = `
    <a class="reader-map-link" href="#reader-map"><span class="label-mono">课程地图</span><strong>12 章全景</strong></a>
    <div class="reader-current" aria-live="polite">
      <span class="label-mono" data-reader-position>00 / 12</span>
      <strong data-reader-title>课程地图</strong>
      <span data-reader-coverage>全景 · 学习路径</span>
      <i aria-hidden="true"><b data-reader-progress></b></i>
    </div>
    <div class="reader-actions">
      <button class="cbtn reader-complete-btn" type="button" data-reader-complete aria-label="标记当前章节完成">
        <span class="chk-box" aria-hidden="true">✓</span>
        <span class="btn-text">完成本章</span>
      </button>
      <button type="button" data-reader-prev>← <span>上一章</span></button>
      <button type="button" data-reader-next><span>下一章</span> →</button>
    </div>`;

  const stage = document.createElement("div");
  stage.className = "reader-stage";
  stage.id = "reader-stage";
  chapters.forEach((chapter) => {
    chapter.view.classList.add("reader-view");
    stage.append(chapter.view);
  });
  tabs.after(toolbar, stage);
  main.classList.add("reader-main");
  document.body.classList.add("reader-mode");

  const position = toolbar.querySelector<HTMLElement>("[data-reader-position]");
  const title = toolbar.querySelector<HTMLElement>("[data-reader-title]");
  const coverage = toolbar.querySelector<HTMLElement>("[data-reader-coverage]");
  const progress = toolbar.querySelector<HTMLElement>("[data-reader-progress]");
  const completeBtn = toolbar.querySelector<HTMLButtonElement>("[data-reader-complete]");
  const prev = toolbar.querySelector<HTMLButtonElement>("[data-reader-prev]");
  const next = toolbar.querySelector<HTMLButtonElement>("[data-reader-next]");
  let current = -1;

  const currentCourseId = getCurrentCourseId();

  // 绑定工具栏打卡完成按钮
  completeBtn?.addEventListener("click", () => {
    if (current > 0 && current < chapters.length) {
      const activeChapter = chapters[current];
      toggleChapterCompletion(currentCourseId, activeChapter.id);
    }
  });

  const indexFromHash = (): { index: number; target?: HTMLElement } => {
    const id = decodeURIComponent(location.hash.slice(1)) || "top";
    const direct = chapters.findIndex((chapter) => chapter.id === id);
    if (direct >= 0) return { index: direct };
    const target = document.getElementById(id);
    const owner = target?.closest<HTMLElement>(".reader-view");
    const nested = chapters.findIndex((chapter) => chapter.view === owner);
    return nested >= 0 ? { index: nested, target: target ?? undefined } : { index: 0 };
  };

  const activate = (index: number, push = false, nestedTarget?: HTMLElement, focus = false): void => {
    const nextIndex = Math.max(0, Math.min(chapters.length - 1, index));
    const chapter = chapters[nextIndex];
    if (push) history.pushState(null, "", `#${nestedTarget?.id || chapter.id}`);
    if (current !== nextIndex) {
      chapters.forEach((item, itemIndex) => {
        const active = itemIndex === nextIndex;
        item.view.hidden = !active;
        item.view.inert = !active;
        item.view.classList.toggle("is-active", active);
      });
      current = nextIndex;
    }
    stage.scrollTop = 0;
    if (!nestedTarget) chapter.view.scrollTop = 0;

    document.querySelectorAll<HTMLAnchorElement>("a[data-spy-link]").forEach((link) => {
      if (link.getAttribute("href") === `#${chapter.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    if (position) position.textContent = `${chapter.no} / 12`;
    if (title) title.textContent = chapter.label;
    if (coverage) coverage.textContent = chapter.coverage.join(" · ");
    if (progress) progress.style.inlineSize = `${Math.max(2, (nextIndex / (chapters.length - 1)) * 100)}%`;

    // 更新工具栏完成按钮状态
    if (completeBtn) {
      const isTop = nextIndex === 0;
      completeBtn.disabled = isTop;
      if (isTop) {
        completeBtn.setAttribute("aria-pressed", "false");
        completeBtn.classList.remove("primary");
        const txt = completeBtn.querySelector(".btn-text");
        if (txt) txt.textContent = "完成本章";
      } else {
        const isDone = isChapterCompleted(currentCourseId, chapter.id);
        completeBtn.setAttribute("aria-pressed", String(isDone));
        completeBtn.classList.toggle("primary", isDone);
        const txt = completeBtn.querySelector(".btn-text");
        if (txt) txt.textContent = isDone ? "已学完" : "完成打卡";
      }
    }

    if (prev) {
      prev.disabled = nextIndex === 0;
      prev.setAttribute("aria-label", nextIndex === 0 ? "已经在课程地图" : `上一章：${chapters[nextIndex - 1].label}`);
    }
    if (next) {
      next.disabled = nextIndex === chapters.length - 1;
      next.setAttribute("aria-label", nextIndex === chapters.length - 1 ? "已经是最后一章" : `下一章：${chapters[nextIndex + 1].label}`);
    }

    requestAnimationFrame(() => {
      if (nestedTarget) {
        const targetTop = nestedTarget.getBoundingClientRect().top;
        const viewTop = chapter.view.getBoundingClientRect().top;
        chapter.view.scrollTo({
          top: Math.max(0, chapter.view.scrollTop + targetTop - viewTop - 16),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }
      if (!focus) return;
      const heading = chapter.view.querySelector<HTMLElement>("h1, h2");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    });
  };

  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href")?.slice(1);
    const target = id ? document.getElementById(id) : null;
    const owner = target?.closest<HTMLElement>(".reader-view");
    const index = chapters.findIndex((chapter) => chapter.view === target || chapter.view === owner);
    if (index < 0) return;
    event.preventDefault();
    activate(index, true, target && target !== chapters[index].view ? target : undefined, true);
  });
  prev?.addEventListener("click", () => activate(current - 1, true, undefined, true));
  next?.addEventListener("click", () => activate(current + 1, true, undefined, true));
  window.addEventListener("popstate", () => {
    const state = indexFromHash();
    activate(state.index, false, state.target);
  });

  const initial = indexFromHash();
  activate(initial.index, false, initial.target);

  // 初始化学习进度与全屏模块
  initLearningProgress();
  initMachineFullscreen();
}
