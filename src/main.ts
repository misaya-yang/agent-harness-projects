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
  initCxToolPipeline(document.querySelector("#cx-tools"));
  initCxConfigOrder(document.querySelector("#cx-customization"));
  initCxEvironments(document.querySelector("#cx-environments"));
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

/* ========== 机器二：cx-environments 环境 × 沙箱 × 审批 ========== */

type CxEnv = "local" | "worktree" | "cloud" | "remote";
type CxSbx = "read-only" | "workspace-write" | "danger-full-access";
type CxApr = "untrusted" | "on-request" | "never";
type CxCmd = "test" | "net" | "outside";

const CX_ENV_CMDS: Record<CxCmd, { cmd: string; allowlisted: boolean }> = {
  test: { cmd: "cargo test", allowlisted: true },
  net: { cmd: "curl -s https://api.example.com", allowlisted: false },
  outside: { cmd: "write <outside-workspace>", allowlisted: false },
};

const CX_ENV_SHORT: Record<CxEnv, string> = {
  local: "当前机器执行，系统沙箱在本地强制",
  worktree: "独立 Git 工作树执行，改动与主检出隔离",
  cloud: "托管环境执行，隔离与网络由环境模板共同决定",
  remote: "远程宿主执行，沙箱在宿主侧生效",
};

const CX_ENV_VERDICTS = {
  ok: { tag: "沙箱内放行", cls: "ok", desc: "执行环境已覆盖操作所需边界，命令直接跑，无需请示。" },
  ask: {
    tag: "升级请示",
    cls: "ask",
    desc: "当前边界不足且策略允许询问：系统发出审批请求。批准只处理这次明确的权限需求，不应被理解为永久关闭沙箱。",
  },
  deny: {
    tag: "直接拒绝",
    cls: "deny",
    desc: "审批通道关闭：失败作为工具结果回注模型，回合继续，但命令没有跑。",
  },
} as const;

function cxEnvDecide(
  env: CxEnv,
  cmd: CxCmd,
  sbx: CxSbx,
  apr: CxApr,
): { key: "ok" | "ask" | "deny"; trace: string[] } {
  const trace: string[] = [`环境=${env}：${CX_ENV_SHORT[env]}`];
  let blocked: string | null = null;
  if (sbx === "read-only") {
    blocked = cmd === "net" ? "当前网络权限不覆盖该访问" : "read-only 不允许这次写入";
  } else if (sbx === "workspace-write") {
    if (cmd === "net") blocked = "当前网络权限不覆盖该访问";
    else if (cmd === "outside") blocked = "写入目标越出工作区可写根";
  }

  if (blocked) {
    trace.push(`sandbox=${sbx}：${blocked}`);
    if (apr === "never") {
      trace.push("approval=never：不请示，失败直接回注模型");
      return { key: "deny", trace };
    }
    trace.push(
      apr === "untrusted"
        ? "approval=untrusted：白名单外命令执行前请示"
        : "approval=on-request：模型发起升级请示",
    );
    if (env === "remote") trace.push("审批决定回传后，仍由远程宿主执行最终边界");
    else trace.push("批准只覆盖明确权限，不整体解除系统沙箱");
    return { key: "ask", trace };
  }

  trace.push(`sandbox=${sbx} 允许该操作`);
  if (env === "worktree" && cmd === "test")
    trace.push("测试产生的改动留在独立工作树，主检出不受影响");
  if (env === "cloud") trace.push("文件寿命由托管环境的持久化契约决定");
  if (env === "remote") trace.push("可写边界由远程宿主解析，客户端视图不能代替宿主事实");
  if (apr === "untrusted" && !CX_ENV_CMDS[cmd].allowlisted) {
    trace.push("approval=untrusted：exec policy 未放行 → 仍要请示");
    return { key: "ask", trace };
  }
  trace.push("无需请示 → 执行并采集输出");
  return { key: "ok", trace };
}

function initCxEvironments(root: HTMLElement | null): void {
  if (!root) return;
  let cmd: CxCmd = "test";
  let env: CxEnv = "local";
  let sbx: CxSbx = "workspace-write";
  let apr: CxApr = "on-request";

  const status = root.querySelector<HTMLElement>("[data-status]");
  const cmdLine = root.querySelector<HTMLElement>("[data-cmd]");
  const badge = root.querySelector<HTMLElement>("[data-verdict]");
  const desc = root.querySelector<HTMLElement>("[data-verdict-desc]");
  const trace = root.querySelector<HTMLElement>("[data-trace]");
  const log = root.querySelector<HTMLElement>("[data-log]");
  let touched = false; // 日志 = 用户真实试验的历史：boot 首渲染与重复组合不记行
  let lastTrial = "";

  const render = (): void => {
    const res = cxEnvDecide(env, cmd, sbx, apr);
    const v = CX_ENV_VERDICTS[res.key];
    if (status) status.textContent = `${env} · ${sbx} · ${apr}`;
    if (cmdLine) cmdLine.textContent = CX_ENV_CMDS[cmd].cmd;
    if (badge) {
      badge.dataset.verdict = v.cls;
      badge.textContent = v.tag;
    }
    if (desc) desc.textContent = v.desc;
    if (trace) {
      trace.replaceChildren();
      for (const t of res.trace) {
        const li = document.createElement("li");
        li.textContent = t;
        trace.append(li);
      }
    }
    if (log && touched) {
      const trial = `[${CX_ENV_CMDS[cmd].cmd}] × ${env} × ${sbx} × ${apr} → ${v.tag}`;
      if (trial !== lastTrial) {
        lastTrial = trial;
        log.append(
          consoleLine(
            res.key === "ok" ? "k-tool" : res.key === "ask" ? "k-warn" : "k-sys",
            trial,
          ),
        );
        while (log.children.length > 8) log.firstElementChild?.remove();
      }
    }
    syncPressed(root.querySelector("[data-group-cmd]"), cmd);
    syncPressed(root.querySelector("[data-group-env]"), env);
    syncPressed(root.querySelector("[data-group-sbx]"), sbx);
    syncPressed(root.querySelector("[data-group-apr]"), apr);
  };

  const wire = (groupSel: string, set: (v: string) => void): void => {
    root.querySelector(groupSel)?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-v]");
      if (!btn?.dataset.v) return;
      touched = true;
      set(btn.dataset.v);
      render();
    });
  };
  wire("[data-group-cmd]", (v) => {
    cmd = v as CxCmd;
  });
  wire("[data-group-env]", (v) => {
    env = v as CxEnv;
  });
  wire("[data-group-sbx]", (v) => {
    sbx = v as CxSbx;
  });
  wire("[data-group-apr]", (v) => {
    apr = v as CxApr;
  });
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
