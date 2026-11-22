import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";

import { initReveal } from "./modules/reveal";
import { initChapterReader } from "./modules/chapter-reader";
import { initNavMenu } from "./modules/navmenu";
import { initHeroPause } from "./modules/hero-pause";
import { initLoopMachine } from "./modules/loop-machine";
import { initEventStream } from "./modules/event-stream";
import { initSandboxSim } from "./modules/sandbox-sim";
import { initContextMeter } from "./modules/context-meter";
import { initPlatformMap } from "./modules/platform-map";
import { initTheme } from "./modules/theme";
import { initStateModel } from "./modules/state-model";
import { initExtensionAtlas } from "./modules/extension-atlas";
import { initSurfaceSwitchboard } from "./modules/surface-switchboard";
import { initSeriesNav } from "./modules/series-nav";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function boot(): void {
  initTheme();
  initSeriesNav();
  initReveal(reducedMotion.matches);
  initNavMenu();
  initHeroPause();

  initLoopMachine(document.querySelector("#machine-loop"), reducedMotion);
  initEventStream(document.querySelector("#machine-stream"), reducedMotion);
  initSandboxSim(document.querySelector("#machine-sandbox"));
  initContextMeter(document.querySelector("#machine-context"));
  initPlatformMap(document.querySelector("#machine-platform"));
  initStateModel(document.querySelector("#machine-state"));
  initExtensionAtlas(document.querySelector("#machine-extensions"));
  initSurfaceSwitchboard(document.querySelector("#machine-surfaces"));
  initCxPromptLayers(document.querySelector("#cx-prompt"));
  initCxToolPipeline(document.querySelector("#cx-tools"));
  initCxConfigOrder(document.querySelector("#cx-customization"));
  initCxMultiAgent(document.querySelector("#cx-environments"));
  initChapterReader();
}

/* ------------------------------------------------------------------
 * 以下三台教学机器（cx-*）为本页专属，接线保留在入口文件、不进共享模块。
 * 全部纯点击驱动，不使用任何定时器。
 * ------------------------------------------------------------------ */

type ConsoleLogClass = "k-sys" | "k-user" | "k-warn" | "k-tool" | "k-model";

/** 生成一行控制台输出（与 loop-machine 的行结构一致）。 */
function consoleLine(cls: ConsoleLogClass, text: string): HTMLSpanElement {
  const line = document.createElement("span");
  line.className = "ev";
  const body = document.createElement("span");
  body.className = cls;
  body.textContent = text;
  line.append(body);
  return line;
}

/** 同步一组 data-v 按钮的 aria-pressed。 */
function syncPressed(scope: Element | null | undefined, current: string): void {
  scope?.querySelectorAll<HTMLButtonElement>("[data-v]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.v === current));
  });
}

const CX_PROMPT_LAYERS: Record<string, { title: string; role: string; wire: string; boundary: string }> = {
  base: {
    title: "Base Instructions",
    role: "会话级行为基线与模型指令。它独立于普通对话历史，不应被误画成一条用户消息。",
    wire: "request.instructions / BaseInstructions",
    boundary: "会话配置或明确的模型设置改变；普通 compaction 不把它折进摘要。",
  },
  dynamic: {
    title: "Dynamic Context",
    role: "AGENTS.md、环境、权限、时间与扩展贡献的具名 World State 区块，按 Known / Unknown 前态做差分或全量重注入。",
    wire: "request.input[] · contextual fragments",
    boundary: "每个 step 重新捕获；本 step 中途变化到下一 step 才生效。",
  },
  history: {
    title: "Active History",
    role: "用户消息、模型输出、工具调用与回执的当前工作集，由完整 transcript 或最新 compaction checkpoint 派生。",
    wire: "request.input[] · normalized history",
    boundary: "工具回注、steer、rollback 或 compaction 会改变；不是完整 rollout 的逐轮重放。",
  },
  tools: {
    title: "Tool Specs",
    role: "本 step 可见工具的结构化 schema；MCP 与延迟发现工具按 exposure 进入，不属于保留用户消息预算。",
    wire: "request.tools[]",
    boundary: "ToolRouter 随 step 重建；工具注册变化不会改写旧历史。",
  },
  schema: {
    title: "Output Schema",
    role: "需要结构化结果时约束本次模型输出；它控制出口形状，不是长期记忆或安全策略。",
    wire: "request.text.format / output_schema",
    boundary: "只作用于对应请求；Guardian 等专用会话可能选择自由文本或不同 schema。",
  },
};

function initCxPromptLayers(root: HTMLElement | null): void {
  if (!root) return;
  const title = root.querySelector<HTMLElement>("[data-prompt-title]");
  const role = root.querySelector<HTMLElement>("[data-prompt-role]");
  const wire = root.querySelector<HTMLElement>("[data-prompt-wire]");
  const boundary = root.querySelector<HTMLElement>("[data-prompt-boundary]");
  const select = (id: string): void => {
    const layer = CX_PROMPT_LAYERS[id];
    if (!layer || !title || !role || !wire || !boundary) return;
    title.textContent = layer.title;
    role.textContent = layer.role;
    wire.textContent = layer.wire;
    boundary.textContent = layer.boundary;
    root.querySelectorAll<HTMLButtonElement>("[data-prompt-layer]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.promptLayer === id)),
    );
  };
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-prompt-layer]");
    if (button?.dataset.promptLayer) select(button.dataset.promptLayer);
  });
  select("base");
}

/* ========== 机器一：cx-tools 工具管线步进器 ========== */

interface ToolStage {
  title: string;
  note: string;
  trace: string;
  log: [ConsoleLogClass, string];
}

const CX_TOOL_STAGES: ToolStage[] = [
  {
    title: "发现",
    note: "注册表保存全部能力，但模型只看到当前 step 的可见集。直接、延迟、仅模型、仅 code mode 与隐藏等暴露档决定工具何时、以何种方式出现。",
    trace: "发现：内建 + MCP + 动态工具 → 按 exposure 生成本 step 可见集",
    log: ["k-sys", "step snapshot → 已生成当前可见工具集"],
  },
  {
    title: "校验",
    note: "结构化调用先按 schema 解析。参数不合法时，错误作为可行动文本回给模型，让它修正；只有程序性 Fatal 才终止整个 Turn。",
    trace: "校验：FunctionCall → schema 检查 → 合法调用或可纠正错误",
    log: ["k-warn", "schema check → 参数合法"],
  },
  {
    title: "授权",
    note: "命令规则先分类，再结合审批策略和权限画像决定放行、请示或拒绝。Granular 中被关闭的询问类别会自动拒绝，不再打扰用户。",
    trace: "授权：规则分类 → 审批策略 → 权限画像 → 放行 / 请示 / 拒绝",
    log: ["k-user", "approval decision → 需要明确授权"],
  },
  {
    title: "执行",
    note: "命令进入实际执行宿主的系统沙箱；本地、云端与远程环境的强制者不同，但都要采集标准输出、标准错误与退出状态。",
    trace: "执行：宿主应用权限边界 → 启动 → 采集输出与退出状态",
    log: ["k-tool", "execution boundary applied → exit 0"],
  },
  {
    title: "归一化",
    note: "长输出在写入历史时就按预算截断，保留高信号的头尾并明确声明缺失规模。模型后续看到的是归一化后的版本。",
    trace: "归一化：控制体积 → 保留头尾 → 标记截断规模",
    log: ["k-sys", "214 行输出 → 已按预算截断并入档"],
  },
  {
    title: "回注",
    note: "工具结果按 call id 与调用配对进入历史，下一次请求再从权威历史派生。取消的调用也必须合成回执，否则恢复时会出现孤儿调用。",
    trace: "回注：工具输出与 call id 配对 → 历史 → 下一 step",
    log: ["k-sys", "tool output paired → 模型继续判断"],
  },
];

const CX_TOOLS_IDLE_NOTE =
  "以一次 cargo test 调用为例：沿六个检查点逐段前进，右侧同步留下该段 trace。";

function initCxToolPipeline(root: HTMLElement | null): void {
  if (!root) return;
  const status = root.querySelector<HTMLElement>("[data-status]");
  const steps = Array.from(root.querySelectorAll<HTMLElement>(".m-steps li"));
  const note = root.querySelector<HTMLElement>("[data-stage-note]");
  const trace = root.querySelector<HTMLElement>("[data-trace]");
  const log = root.querySelector<HTMLElement>("[data-log]");
  const advance = root.querySelector<HTMLButtonElement>("[data-advance]");
  const back = root.querySelector<HTMLButtonElement>("[data-back]");
  const reset = root.querySelector<HTMLButtonElement>("[data-reset]");
  let cursor = -1;

  const render = (): void => {
    steps.forEach((li, i) => {
      li.classList.toggle("is-now", i === cursor);
      li.classList.toggle("is-done", i < cursor);
    });
    if (status) {
      const last = CX_TOOL_STAGES.length - 1;
      status.textContent =
        cursor < 0
          ? "0/6 · 待步进"
          : cursor === last
            ? `6/6 · ${CX_TOOL_STAGES[cursor].title} · 完成`
            : `${cursor + 1}/6 · ${CX_TOOL_STAGES[cursor].title}`;
    }
    if (note) {
      note.textContent = cursor < 0 ? CX_TOOLS_IDLE_NOTE : CX_TOOL_STAGES[cursor].note;
    }
    if (trace) {
      trace.replaceChildren();
      if (cursor < 0) {
        const li = document.createElement("li");
        li.textContent = "等待第一步……";
        trace.append(li);
      } else {
        for (const stage of CX_TOOL_STAGES.slice(0, cursor + 1)) {
          const li = document.createElement("li");
          li.textContent = stage.trace;
          trace.append(li);
        }
      }
    }
    if (log) {
      log.replaceChildren();
      for (const stage of CX_TOOL_STAGES.slice(0, cursor + 1)) {
        log.append(consoleLine(stage.log[0], stage.log[1]));
      }
    }
    if (advance) advance.disabled = cursor >= CX_TOOL_STAGES.length - 1;
    if (back) back.disabled = cursor < 0;
  };

  advance?.addEventListener("click", () => {
    if (cursor < CX_TOOL_STAGES.length - 1) cursor += 1;
    render();
  });
  back?.addEventListener("click", () => {
    if (cursor >= 0) cursor -= 1;
    render();
  });
  reset?.addEventListener("click", () => {
    cursor = -1;
    render();
  });
  render();
}

/* ========== 机器二：cx-environments 多代理委派边界 ========== */

type CxTask = "independent" | "dependent" | "shared-write";
type CxFork = "none" | "2" | "all";
type CxDelivery = "queue" | "wake";
type CxTarget = "idle" | "busy" | "evicted";

function initCxMultiAgent(root: HTMLElement | null): void {
  if (!root) return;
  let task: CxTask = "independent";
  let fork: CxFork = "2";
  let delivery: CxDelivery = "queue";
  let target: CxTarget = "idle";

  const status = root.querySelector<HTMLElement>("[data-status]");
  const cmdLine = root.querySelector<HTMLElement>("[data-cmd]");
  const badge = root.querySelector<HTMLElement>("[data-verdict]");
  const desc = root.querySelector<HTMLElement>("[data-verdict-desc]");
  const trace = root.querySelector<HTMLElement>("[data-trace]");
  const log = root.querySelector<HTMLElement>("[data-log]");
  let touched = false;
  let lastTrial = "";

  const render = (): void => {
    const steps: string[] = [];
    let verdict: { tag: string; cls: "ok" | "ask" | "deny"; desc: string };
    if (task === "dependent") {
      verdict = { tag: "留在主线", cls: "ask", desc: "这项工作阻塞下一步判断，委派只会增加等待与交接成本。" };
      steps.push("任务依赖主线当前结论 → 不 spawn");
    } else if (task === "shared-write") {
      verdict = { tag: "写集冲突", cls: "deny", desc: "并行代理共享文件系统；没有明确所有权时不要同时修改同一写集。" };
      steps.push("共享写集没有唯一 owner → 拒绝并行编辑");
    } else {
      verdict = { tag: "适合委派", cls: "ok", desc: "独立、有界、可用一段最终答案回传的任务适合子代理。" };
      steps.push("独立子问题 → spawn_agent");
    }
    steps.push(
      fork === "none"
        ? "fork_turns=none → 任务描述必须自包含"
        : fork === "2"
          ? "fork_turns=2 → 只继承最近两轮并洗除工具过程"
          : "fork_turns=all → 保留完整父历史，但上下文更重",
    );
    steps.push(
      delivery === "wake"
        ? "followup_task → 消息排队，目标空闲时触发新 Turn"
        : "send_message → 只排队，不主动唤醒目标",
    );
    steps.push(
      target === "busy"
        ? "目标 busy → 在消息边界或当前工具完成后接收"
        : target === "evicted"
          ? "目标 evicted → 校验属主与权限后从 rollout 重载"
          : "目标 idle → 是否启动由 delivery mode 决定",
    );

    if (status) status.textContent = `${task} · fork ${fork} · ${delivery} · ${target}`;
    if (cmdLine)
      cmdLine.textContent = task === "independent" ? `spawn_agent({ fork_turns: "${fork}" })` : "continue locally";
    if (badge) {
      badge.dataset.verdict = verdict.cls;
      badge.textContent = verdict.tag;
    }
    if (desc) desc.textContent = verdict.desc;
    if (trace) {
      trace.replaceChildren(...steps.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
    }
    if (log && touched) {
      const trial = `${task} × fork ${fork} × ${delivery} × ${target} → ${verdict.tag}`;
      if (trial !== lastTrial) {
        lastTrial = trial;
        log.append(consoleLine(verdict.cls === "ok" ? "k-tool" : verdict.cls === "ask" ? "k-warn" : "k-sys", trial));
        while (log.children.length > 8) log.firstElementChild?.remove();
      }
    }
    syncPressed(root.querySelector("[data-group-task]"), task);
    syncPressed(root.querySelector("[data-group-fork]"), fork);
    syncPressed(root.querySelector("[data-group-delivery]"), delivery);
    syncPressed(root.querySelector("[data-group-target]"), target);
  };

  const wire = (group: string, set: (value: string) => void): void => {
    root.querySelector(group)?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-v]");
      if (!button?.dataset.v) return;
      touched = true;
      set(button.dataset.v);
      render();
    });
  };
  wire("[data-group-task]", (value) => (task = value as CxTask));
  wire("[data-group-fork]", (value) => (fork = value as CxFork));
  wire("[data-group-delivery]", (value) => (delivery = value as CxDelivery));
  wire("[data-group-target]", (value) => (target = value as CxTarget));
  render();
}

/* ========== 机器三：cx-customization 配置覆盖判定器 ========== */

interface CxScenario {
  conflict: string;
  question: string;
  candidates: Array<{ id: string; label: string }>;
  winner: string;
  ladder: string[];
  why: string;
}

const CX_SCENARIOS: CxScenario[] = [
  {
    conflict: "model = ?　四层各说了一份",
    question: "打包默认、用户配置、项目配置与 -c 参数都写了 model。本轮听谁的？",
    candidates: [
      { id: "pack", label: "打包默认 PackagedDefaults" },
      { id: "user", label: "用户配置层" },
      { id: "proj", label: "项目配置层" },
      { id: "flag", label: "-c model=…（会话参数）" },
    ],
    winner: "flag",
    ladder: [
      "-c model=… → SessionFlags · 优先级 30　← 胜",
      "项目配置层 → Project · 25",
      "用户配置层 → User · 20",
      "打包默认 → PackagedDefaults · −10",
    ],
    why: "SessionFlags 是当次会话意图，压过项目与用户层；只有 legacy managed（40 / 50）在它之上。",
  },
  {
    conflict: "sandbox_mode = ?　MDM 也发了一份",
    question: "MDM 偏好层下发 read-only，用户与项目都写了 workspace-write。谁生效？",
    candidates: [
      { id: "mdm", label: "MDM 偏好层下发（Mdm）" },
      { id: "user", label: "用户配置层（User）" },
      { id: "proj", label: "项目配置层（Project）" },
    ],
    winner: "proj",
    ladder: [
      "项目配置层 → Project · 25　← 胜",
      "用户配置层 → User · 20",
      "MDM 下发偏好 → Mdm · 0",
    ],
    why: "普通 Mdm 层（0）压不过用户与项目层——它只是偏好下发通道；合规锁在 managed config（40 / 50）。",
  },
  {
    conflict: "approval_policy = ?　共享受管机器",
    question: "公司受管机器上：-c 指定 never，托管配置文件指定 untrusted，MDM 又推送了 legacy managed config。谁说了算？",
    candidates: [
      { id: "flag", label: "-c approval_policy=never" },
      { id: "legacy-file", label: "托管配置文件（legacy · 40）" },
      { id: "legacy-mdm", label: "MDM 推送托管配置（legacy · 50）" },
    ],
    winner: "legacy-mdm",
    ladder: [
      "MDM 推送托管配置 → LegacyManagedConfigTomlFromMdm · 50　← 胜",
      "托管配置文件 → LegacyManagedConfigTomlFromFile · 40",
      "-c approval_policy=never → SessionFlags · 30",
    ],
    why: "企业合规层在阶梯顶端，50 > 40 > 30。共享机器上命令行赢不过推送的合规配置——把个人机的 -c 直觉搬过去，就是最常见的误判。",
  },
  {
    conflict: "AGENTS.md　模型看到的是哪几层？",
    question: "项目根、中间目录和当前目录都有项目指令；当前目录还提供 override。哪些指令进入上下文？",
    candidates: [
      { id: "root-only", label: "只有仓库根的生效" },
      { id: "nearest", label: "只有当前目录主文件生效" },
      { id: "concat", label: "根 → 当前目录逐层拼接，override 替换同层主文件" },
      { id: "budget", label: "全部拼接，超预算随机丢" },
    ],
    winner: "concat",
    ladder: [
      "项目根指令（最先加载）",
      "中间目录指令（按目录顺序拼接）",
      "当前目录 override（替换同目录主文件，最后加载）",
      "总量预算 project_doc_max_bytes，超限截尾而非随机丢弃",
    ],
    why: "项目指令不是跨层覆盖，而是从项目根到当前目录逐层拼接；override 只替换所在目录的主文件，总量超预算时从尾部截断。",
  },
];

const CX_SC_NAMES = ["一", "二", "三", "四"] as const;

function initCxConfigOrder(root: HTMLElement | null): void {
  if (!root) return;
  let scIndex = 0;

  const status = root.querySelector<HTMLElement>("[data-status]");
  const scenarioRow = root.querySelector<HTMLElement>("[data-scenarios]");
  const candRow = root.querySelector<HTMLElement>("[data-candidates]");
  const note = root.querySelector<HTMLElement>("[data-scenario-note]");
  const conflict = root.querySelector<HTMLElement>("[data-conflict]");
  const badge = root.querySelector<HTMLElement>("[data-verdict]");
  const desc = root.querySelector<HTMLElement>("[data-verdict-desc]");
  const trace = root.querySelector<HTMLElement>("[data-trace]");
  const log = root.querySelector<HTMLElement>("[data-log]");

  const renderScenario = (): void => {
    const sc = CX_SCENARIOS[scIndex];
    if (status) status.textContent = `题 ${scIndex + 1}/4 · 待判定`;
    if (conflict) conflict.textContent = sc.conflict;
    if (note) note.textContent = sc.question;
    if (badge) {
      badge.removeAttribute("data-verdict");
      badge.textContent = "等待作答";
    }
    if (desc) desc.textContent = "在左侧点出你认为生效的文件或规则，右侧揭示判定阶梯。";
    if (trace) {
      trace.replaceChildren();
      const li = document.createElement("li");
      li.textContent = "判定后这里展开优先级阶梯。";
      trace.append(li);
    }
    if (candRow) {
      candRow.replaceChildren();
      for (const c of sc.candidates) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cbtn";
        btn.dataset.v = c.id;
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = c.label;
        candRow.append(btn);
      }
    }
    scenarioRow?.querySelectorAll<HTMLButtonElement>("[data-sc]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.sc) === scIndex));
    });
  };

  scenarioRow?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-sc]");
    if (!btn?.dataset.sc) return;
    scIndex = Number(btn.dataset.sc);
    renderScenario();
  });

  candRow?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-v]");
    if (!btn?.dataset.v) return;
    const sc = CX_SCENARIOS[scIndex];
    const correct = btn.dataset.v === sc.winner;
    syncPressed(candRow, btn.dataset.v);
    if (badge) {
      badge.dataset.verdict = correct ? "ok" : "deny";
      badge.textContent = correct ? "判对：胜出行" : "判错：重看阶梯";
    }
    if (desc) desc.textContent = sc.why;
    if (trace) {
      trace.replaceChildren();
      for (const line of sc.ladder) {
        const li = document.createElement("li");
        li.textContent = line;
        trace.append(li);
      }
    }
    if (status) status.textContent = `题 ${scIndex + 1}/4 · ${correct ? "答对" : "答错"}`;
    if (log) {
      log.append(
        consoleLine(
          correct ? "k-tool" : "k-warn",
          `题${CX_SC_NAMES[scIndex]}：选「${btn.textContent}」${correct ? " ✓" : " ✗"}`,
        ),
      );
    }
  });

  renderScenario();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
