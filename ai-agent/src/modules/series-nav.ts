import { getCourseProgress } from "./learning-progress";

type AgentCourse = {
  id: string;
  name: string;
  path: string;
  code: string;
  description: string;
};

// 新课程只需在这里增加一项；所有页面的顶部选择器与侧栏会同步更新。
const courses: AgentCourse[] = [
  {
    id: "codex",
    name: "Codex",
    path: "/codex",
    code: "OPENAI / RUST",
    description: "模型步骤、ThreadStore 与权限配置",
  },
  {
    id: "grok",
    name: "Grok Build",
    path: "/grok",
    code: "XAI / RUST",
    description: "会话 Actor、ACP 和工作区快照",
  },
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    path: "/deepseek",
    code: "DEEPSEEK / TYPESCRIPT",
    description: "Cordis 插件、事件投影与工具管线",
  },
  {
    id: "pi",
    name: "Pi Agent",
    path: "/pi",
    code: "PI / TYPESCRIPT",
    description: "工具批次、会话树与进程内扩展",
  },
  {
    id: "opencode",
    name: "OpenCode",
    path: "/opencode",
    code: "OPENCODE / BUN",
    description: "持久收件箱、执行协调与事件流",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    path: "/openclaw",
    code: "OPENCLAW / TYPESCRIPT",
    description: "会话邮箱、运行预算与自动化",
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    path: "/hermes",
    code: "HERMES / PYTHON",
    description: "回合租约、执行后端与后台学习",
  },
];

function courseItems(currentId: string): string {
  return courses
    .map((course, index) => {
      const stats = getCourseProgress(course.id);
      return `
    <a class="series-option" href="${course.path}" ${course.id === currentId ? 'aria-current="page"' : ""}>
      <span class="series-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="series-copy">
        <strong>${course.name}</strong>
        <small>${course.description}</small>
      </span>
      <span class="series-meta">
        <small>${course.code}</small>
        <b>${stats.totalCount} ${course.id === "codex" ? "模块" : "课"}</b>
        <span class="series-progress-pill ${stats.percent === 100 ? "is-complete" : ""}" data-course-progress="${course.id}">${stats.completedCount}/${stats.totalCount} (${stats.percent}%)</span>
      </span>
    </a>`;
    })
    .join("");
}

function courseTabs(currentId: string): string {
  const home = `<a href="/" ${currentId === "home" ? 'aria-current="page"' : ""}>全部课程</a>`;
  return home + courses.map((course, index) => `
    <a href="${course.path}" ${course.id === currentId ? 'aria-current="page"' : ""}>
      <span>${String(index + 1).padStart(2, "0")}</span>${course.name}
    </a>`).join("");
}

export function initSeriesNav(): void {
  const currentId = document.body.dataset.agent ?? "codex";
  const current = courses.find((course) => course.id === currentId);

  const renderNav = () => {
    document.querySelectorAll<HTMLElement>("[data-series-nav]").forEach((root) => {
      const variant = root.dataset.variant ?? "top";
      root.classList.remove("series-nav-top", "series-nav-tabs");
      root.classList.add("series-nav", `series-nav-${variant}`);

      if (variant === "tabs") {
        root.innerHTML = `<nav class="course-tabs" aria-label="选择 Agent 课程"><span class="label-mono">课程</span>${courseTabs(currentId)}</nav>`;
        return;
      }

      root.innerHTML = `
        <details class="series-menu">
          <summary aria-label="选择 Agent 课程">
            <span class="series-summary-label">Agent 系列</span>
            <strong>${current?.name ?? "学习路径"}</strong>
            <span class="series-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="series-panel">
            <div class="series-panel-head"><span>开源 Agent 工程课程</span><small>${courses.length} 门已上线</small></div>
            <nav aria-label="选择 Agent 课程">${courseItems(currentId)}</nav>
            <p>统一用问题、运行轨迹与交互实验讲清工程取舍</p>
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
  };

  renderNav();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    document.querySelectorAll<HTMLDetailsElement>(".series-menu[open]").forEach((details) => {
      if (!details.contains(target)) details.open = false;
    });
  });

  // 学习进度变化时只刷新课程下拉中的摘要；顶部 Tabs 保持安静。
  window.addEventListener("learning-progress-update", () => {
    courses.forEach((c) => {
      const stats = getCourseProgress(c.id);
      document.querySelectorAll<HTMLElement>(`[data-course-progress="${c.id}"]`).forEach((el) => {
        el.textContent = `${stats.completedCount}/${stats.totalCount} (${stats.percent}%)`;
        el.classList.toggle("is-complete", stats.percent === 100);
      });
    });
  });
}
