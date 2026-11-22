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

type ModuleGroup = { title: string; note: string; ids: string[] };

const courseGroups: Record<string, ModuleGroup[]> = {
  codex: [
    { title: "运行内核", note: "循环、状态与工具如何推进一次任务。", ids: ["loop", "protocol", "tools"] },
    { title: "控制与上下文", note: "副作用、模型输入与平台职责如何分层。", ids: ["safety", "context", "platform"] },
    { title: "连续性系统", note: "恢复、记忆与扩展如何跨时间工作。", ids: ["state", "extensions", "customization"] },
    { title: "生产治理", note: "子任务在哪里运行，客户端如何确认成功、取消或失败？", ids: ["environments", "surfaces", "practice"] },
  ],
  grok: [
    { title: "内核运行", note: "谁保存会话状态，谁决定继续或停止？", ids: ["architecture", "turn", "protocol"] },
    { title: "工具与副作用", note: "从一次工具请求追到工作区的实际改动。", ids: ["tools", "workspace", "safety"] },
    { title: "连续性", note: "会话持久化、上下文与记忆。", ids: ["sessions", "context"] },
    { title: "扩展与协作", note: "谁可以注册新工具，子任务怎样把结果交回父任务？", ids: ["extensions", "agents"] },
    { title: "产品化", note: "客户端如何接入，进程中断后从哪里排查？", ids: ["surfaces", "practice"] },
  ],
  deepseek: [
    { title: "组合与控制", note: "启用的插件如何决定宿主可以执行哪些步骤？", ids: ["composition", "loop"] },
    { title: "事实与请求", note: "同一段运行记录如何变成下一次模型请求？", ids: ["session", "prompt"] },
    { title: "工具与执行", note: "工具由哪个组件执行，执行前在哪里检查权限？", ids: ["tools", "capabilities", "safety"] },
    { title: "配置与窗口", note: "作用域、预算和压缩事务。", ids: ["profiles", "context"] },
    { title: "协作与恢复", note: "子任务、终端和服务端如何共享一次执行？", ids: ["extensions", "surfaces", "practice"] },
  ],
  pi: [
    { title: "最小内核", note: "如何从事件还原状态，并决定下一步是否请求模型？", ids: ["layers", "state", "loop"] },
    { title: "输入与工具", note: "新输入何时送达，工具结果怎样按调用顺序写回？", ids: ["queues", "providers", "tools"] },
    { title: "持久上下文", note: "分支会话与模型窗口。", ids: ["sessions", "compaction"] },
    { title: "扩展与表面", note: "扩展权限、TUI 与协议接入。", ids: ["extensions", "tui", "protocol"] },
    { title: "工程判断", note: "从事故反推实现边界。", ids: ["practice"] },
  ],
  opencode: [
    { title: "循环与宿主", note: "从请求入队追到模型步骤完成，再看状态如何留存。", ids: ["loop", "server", "projection"] },
    { title: "工具与指令", note: "工具视图、审批和提示词。", ids: ["tools", "permission", "system"] },
    { title: "长会话与协作", note: "压缩和子会话的取舍。", ids: ["compaction", "subagent"] },
    { title: "资源治理", note: "模型、扩展和预算控制。", ids: ["models", "extensions", "governance"] },
    { title: "工程判断", note: "从持久状态定位失败。", ids: ["practice"] },
  ],
  openclaw: [
    { title: "控制与状态", note: "运行中插话和进程重启时，同一会话由谁接手？", ids: ["loop-stack", "settle", "state"] },
    { title: "长期运行", note: "记忆、唤醒和重试预算。", ids: ["memory", "wake", "budget"] },
    { title: "上下文与工具", note: "历史何时压缩，工具的实际效果何时可以确认？", ids: ["compaction", "tools"] },
    { title: "网关与防线", note: "多客户端接入与权限分层。", ids: ["gateway", "approval"] },
    { title: "协作与诊断", note: "异步子任务与综合排障。", ids: ["soul", "practice"] },
  ],
  hermes: [
    { title: "回合内核", note: "模型失败与工具调度。", ids: ["loop", "transports", "tools"] },
    { title: "执行与状态", note: "后端、转录与学习闭环。", ids: ["environments", "state", "learning"] },
    { title: "扩展与窗口", note: "扩展权力、缓存和压缩。", ids: ["skills", "compaction"] },
    { title: "宿主与投递", note: "多客户端和后台消息回流。", ids: ["gateway", "cron", "surfaces"] },
    { title: "工程判断", note: "从已保存的回合状态判断由谁恢复、何时可以重试。", ids: ["practice"] },
  ],
};

function coverageFor(view: HTMLElement): string[] {
  const coverage = ["概念"];
  if (view.querySelector(".lesson-brief")) coverage.push("案例");
  if (view.querySelector(".machine")) coverage.push("实验");
  if (view.querySelector(".decision, .fact-boundary, .environment-matrix")) coverage.push("权衡");
  if (view.querySelector(".interview")) coverage.push("自测");
  return coverage;
}

function chapterLabel(id: string): string {
  const link =
    document.querySelector<HTMLAnchorElement>(`.rail a[href="#${id}"]`) ??
    document.querySelector<HTMLAnchorElement>(`.chapter-nav a[href="#${id}"]`);
  const no = link?.querySelector(".no")?.textContent ?? "";
  return link?.textContent?.replace(no, "").trim() || id;
}

function buildCourseMap(chapters: Chapter[], courseId: string): HTMLElement {
  const groups = courseGroups[courseId] ?? [{ title: "全部模块", note: "按自己的问题选择入口。", ids: chapters.map((chapter) => chapter.id) }];
  const structure = courseId === "codex"
    ? `${chapters.length} MODULES · ${groups.length} TRACKS`
    : `${groups.length} MODULES · ${chapters.length} LESSONS`;
  const map = document.createElement("section");
  map.className = "reader-map";
  map.id = "reader-map";
  map.setAttribute("aria-labelledby", "reader-map-title");
  map.innerHTML = `
    <header class="reader-map-head">
      <span class="label-mono">PROJECT CASE · ${structure}</span>
      <h2 id="reader-map-title">本课学习目录</h2>
      <p>可以按顺序阅读，也可以从最接近当前问题的一章开始。</p>
    </header>`;
  groups.forEach((group) => {
    const members = group.ids.map((id) => chapters.find((chapter) => chapter.id === id)).filter((chapter): chapter is Chapter => Boolean(chapter));
    if (!members.length) return;
    const phase = document.createElement("article");
    phase.className = "reader-phase";
    phase.innerHTML = `<span class="label-mono">${members[0].no}—${members[members.length - 1].no}</span><div class="reader-phase-title-wrap"><h3>${group.title}</h3><span class="phase-completion-tag label-mono">0/${members.length} 完成</span></div><p>${group.note}</p>`;
    const list = document.createElement("div");
    list.className = "reader-phase-list";
    members.forEach((chapter) => {
      const link = document.createElement("a");
      link.href = `#${chapter.id}`;
      link.title = chapter.title;
      link.innerHTML = `<span>${chapter.no}</span><strong>${chapter.label}</strong><small>${chapter.coverage.join(" · ")}</small>`;
      list.append(link);
    });
    phase.append(list);
    map.append(phase);
  });
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

  hero.append(buildCourseMap(chapters.slice(1), getCurrentCourseId()));

  const toolbar = document.createElement("div");
  toolbar.className = "reader-toolbar shell";
  toolbar.innerHTML = `
    <a class="reader-map-link" href="#reader-map"><span class="label-mono">课程</span><strong>模块目录</strong></a>
    <div class="reader-current" aria-live="polite">
      <span class="label-mono" data-reader-position>00 / ${sections.length}</span>
      <strong data-reader-title>课程地图</strong>
      <span data-reader-coverage>全景 · 学习路径</span>
      <i aria-hidden="true"><b data-reader-progress></b></i>
    </div>
    <div class="reader-actions">
      <button class="cbtn reader-complete-btn" type="button" data-reader-complete aria-label="标记当前章节完成">
        <span class="chk-box" aria-hidden="true">✓</span>
        <span class="btn-text">完成这一节</span>
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
  tabs.after(stage);
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
    let requestedId: string;
    try {
      requestedId = decodeURIComponent(location.hash.slice(1)) || "top";
    } catch {
      return { index: 0 };
    }
    const id = requestedId === "kernel-atlas" ? "reader-map" : requestedId;
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
    chapter.view.append(toolbar);
    stage.scrollTop = 0;
    if (!nestedTarget) chapter.view.scrollTop = 0;

    document.querySelectorAll<HTMLAnchorElement>("a[data-spy-link]").forEach((link) => {
      if (link.getAttribute("href") === `#${chapter.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    if (position) position.textContent = `${chapter.no} / ${sections.length}`;
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
        if (txt) txt.textContent = "完成这一节";
      } else {
        const isDone = isChapterCompleted(currentCourseId, chapter.id);
        completeBtn.setAttribute("aria-pressed", String(isDone));
        completeBtn.classList.toggle("primary", isDone);
        const txt = completeBtn.querySelector(".btn-text");
        if (txt) txt.textContent = isDone ? "已学完" : "完成这一节";
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
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const requestedId = link.getAttribute("href")?.slice(1);
    const id = requestedId === "kernel-atlas" ? "reader-map" : requestedId;
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
