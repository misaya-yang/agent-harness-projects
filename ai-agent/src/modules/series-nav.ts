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
    description: "提示词分层、记忆分账与可重放 Agent Loop",
  },
  {
    id: "grok",
    name: "Grok Build",
    path: "/grok",
    code: "XAI / RUST",
    description: "单写者 Actor、工作区副作用与崩溃恢复",
  },
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    path: "/deepseek",
    code: "DEEPSEEK / TYPESCRIPT",
    description: "事件日志、插件组合与可替换执行环境",
  },
  {
    id: "pi",
    name: "Pi Agent",
    path: "/pi",
    code: "PI / TYPESCRIPT",
    description: "纯函数循环、源序回填与可分支会话树",
  },
  {
    id: "opencode",
    name: "OpenCode",
    path: "/opencode",
    code: "OPENCODE / BUN",
    description: "持久循环判据、上下文纪元与事件审批",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    path: "/openclaw",
    code: "OPENCLAW / TYPESCRIPT",
    description: "常驻网关、异步回流与跨天记忆",
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    path: "/hermes",
    code: "HERMES / PYTHON",
    description: "三段回合、缓存经济与摘要式委派",
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
  const home = `<a href="/" ${currentId === "home" ? 'aria-current="page"' : ""}>学习路径</a>`;
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
