type AgentCourse = {
  id: string;
  name: string;
  path: string;
  code: string;
  description: string;
  chapters: number;
};

// 新课程只需在这里增加一项；所有页面的顶部选择器与侧栏会同步更新。
const courses: AgentCourse[] = [
  {
    id: "codex",
    name: "Codex",
    path: "/codex",
    code: "OPENAI / RUST",
    description: "Thread、Turn、Item 与 App Server 运行时",
    chapters: 12,
  },
  {
    id: "grok",
    name: "Grok Build",
    path: "/grok",
    code: "XAI / RUST",
    description: "Session Actors、ACP、Tools 与 Workspace",
    chapters: 12,
  },
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    path: "/deepseek",
    code: "DEEPSEEK / TYPESCRIPT",
    description: "Cordis 插件树、Turn / Step、Session Log 与能力缝",
    chapters: 12,
  },
  {
    id: "pi",
    name: "Pi Agent",
    path: "/pi",
    code: "PI / TYPESCRIPT",
    description: "Agent Loop、统一 LLM、Session Tree 与扩展运行时",
    chapters: 12,
  },
];

function courseItems(currentId: string): string {
  return courses.map((course, index) => `
    <a class="series-option" href="${course.path}" ${course.id === currentId ? 'aria-current="page"' : ""}>
      <span class="series-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="series-copy"><strong>${course.name}</strong><small>${course.description}</small></span>
      <span class="series-meta"><small>${course.code}</small><b>${course.chapters} 章</b></span>
    </a>`).join("");
}

function courseTabs(currentId: string): string {
  return courses.map((course, index) => `
    <a href="${course.path}" ${course.id === currentId ? 'aria-current="page"' : ""}>
      <span>${String(index + 1).padStart(2, "0")}</span>${course.name}
    </a>`).join("");
}

export function initSeriesNav(): void {
  const currentId = document.body.dataset.agent ?? "codex";
  const current = courses.find((course) => course.id === currentId) ?? courses[0];

  document.querySelectorAll<HTMLElement>("[data-series-nav]").forEach((root) => {
    const variant = root.dataset.variant ?? "top";
    root.className = `series-nav series-nav-${variant}`;

    if (variant === "tabs") {
      root.innerHTML = `<nav class="course-tabs" aria-label="选择 Agent 课程"><span class="label-mono">课程</span>${courseTabs(currentId)}</nav>`;
      return;
    }

    root.innerHTML = `
      <details class="series-menu">
        <summary aria-label="选择 Agent 课程">
          <span class="series-summary-label">Agent 系列</span>
          <strong>${current.name}</strong>
          <span class="series-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="series-panel">
          <div class="series-panel-head"><span>顶级开源 Agent 教学系列</span><small>${courses.length} 门已上线</small></div>
          <nav aria-label="选择 Agent 课程">${courseItems(currentId)}</nav>
          <p>持续增加新的开源 Agent · 统一采用源码事实与交互实验</p>
        </div>
      </details>`;

    const details = root.querySelector<HTMLDetailsElement>("details");
    details?.addEventListener("toggle", () => {
      if (!details.open) return;
      document.querySelectorAll<HTMLDetailsElement>(".series-menu[open]").forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    document.querySelectorAll<HTMLDetailsElement>(".series-menu[open]").forEach((details) => {
      if (!details.contains(target)) details.open = false;
    });
  });
}
