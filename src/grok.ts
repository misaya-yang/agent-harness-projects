import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/grok.css";

import { initReveal } from "./modules/reveal";
import { initChapterReader } from "./modules/chapter-reader";
import { initNavMenu } from "./modules/navmenu";
import { initTheme } from "./modules/theme";
import { initSeriesNav } from "./modules/series-nav";
import { initHeroPause } from "./modules/hero-pause";

type Detail = { title: string; body: string; status?: string };

const qs = <T extends Element>(root: ParentNode, selector: string): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(root: ParentNode, selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));

function initChoiceDetail(id: string, data: Record<string, Detail>): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = data[button.dataset.key ?? ""];
      if (!item || !detail) return;
      qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      detail.innerHTML = `<span class="label-mono">OWNING LAYER</span><h3>${item.title}</h3><p>${item.body}</p>`;
      if (status) status.textContent = item.status ?? button.textContent ?? "selected";
    });
  });
}

function initTurn(): void {
  const root = document.querySelector("#grok-turn");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const logs = [
    "authoritative_queue.push(user_prompt)", "assemble(stable prompt + effective tools)", "sampling.request(messages, tools)",
    "stream event → client + usage ledger", "tool proposal: run command", "hook → plan gate → permission",
    "terminal result paired and appended", "TurnOutcome → round decision",
  ];
  const notes = [
    "输入先进入唯一权威队列。", "稳定前缀、现场上下文与裁剪后的工具面在这里汇合。", "宿主发起一次可取消的流式采样。",
    "增量先被消费；终端确认到达后才允许提交响应。", "模型只提出结构化动作，不直接碰执行世界。", "动作依次经过 hook、计划模式与权限闸门。",
    "每个 tool_use 都得到配对结果，再进入下一次采样。", "模型提出结束，harness 再检查插话、待办与外层续跑条件。",
  ];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => {
    steps.forEach((step, i) => { step.classList.toggle("is-now", i === index); step.classList.toggle("is-done", i < index); });
    if (index >= 0 && log) log.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 4 || index === 5 ? "tool" : "model"}">${logs[index]}</span></span>`);
    if (note && index >= 0) note.textContent = notes[index];
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `step ${index + 1}/8`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 650); });
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察提议、裁决、执行、证据回填与终止如何交接。"; draw(); };
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
}

function initEvents(): void {
  const root = document.querySelector("#grok-events");
  if (!root) return;
  const events = [
    ["client", "session/new { cwd, mcpServers }"], ["sys", "session created + capabilities"], ["client", "session/prompt { content }"],
    ["model", "AgentMessageChunk: 我先检查…"], ["model", "AgentThoughtChunk: locating owner"], ["tool", "ToolCall: grep → pending"],
    ["warn", "permission request"], ["tool", "ToolCallUpdate: in_progress"], ["tool", "ToolCallUpdate: completed"],
    ["model", "AgentMessageChunk: 根因位于…"], ["sys", "SessionInfoUpdate: title/usage"], ["sys", "PromptResponse: end_turn"],
  ];
  let cursor = 0;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const restart = () => { clearInterval(timer); cursor = 0; if (log) log.innerHTML = ""; if (phase) phase.textContent = `0/${events.length}`; };
  const tick = () => {
    const event = events[cursor]; if (!event) { clearInterval(timer); return; }
    log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(cursor).padStart(2, "0")}</span> <span class="k-${event[0]}">${event[1]}</span></span>`);
    cursor += 1; if (phase) phase.textContent = `${cursor}/${events.length}`; log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  };
  qs<HTMLButtonElement>(root, "[data-play]")?.addEventListener("click", () => { if (cursor >= events.length) restart(); clearInterval(timer); tick(); timer = window.setInterval(tick, 430); });
  qs<HTMLButtonElement>(root, "[data-restart]")?.addEventListener("click", restart);
}

function initSafety(): void {
  const root = document.querySelector("#grok-safety");
  if (!root) return;
  let op = ""; let mode = "";
  const select = (group: string, value: string, button: HTMLButtonElement) => { qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((b) => b.setAttribute("aria-pressed", String(b === button))); if (group === "op") op = value; else mode = value; evaluate(); };
  qsa<HTMLButtonElement>(root, "[data-op] button").forEach((b) => b.addEventListener("click", () => select("op", b.dataset.v ?? "", b)));
  qsa<HTMLButtonElement>(root, "[data-mode] button").forEach((b) => b.addEventListener("click", () => select("mode", b.dataset.v ?? "", b)));
  const evaluate = () => {
    if (!op || !mode) return;
    let verdict: "ok" | "ask" | "deny" = "ask"; let label = "请求批准"; const trace: string[] = [];
    trace.push(`Agent permission mode = ${mode}`);
    if (mode === "plan" && op !== "read") { verdict = "deny"; label = "计划模式拒绝副作用"; trace.push("plan 只保留分析与只读能力"); }
    else if (op === "read") { verdict = "ok"; label = "允许读取"; trace.push("只读操作通过基础策略"); }
    else if (mode === "acceptEdits" && op === "edit") { verdict = "ok"; label = "允许编辑"; trace.push("acceptEdits 预先接受文件修改"); }
    else if (mode === "dontAsk") { verdict = "deny"; label = "无法询问则拒绝"; trace.push("dontAsk 不是自动允许，遇到需审批能力时失败关闭"); }
    else { trace.push("PermissionManager 生成交互请求"); }
    trace.push("即使获批，sandbox 仍独立限制 OS 能力");
    const badge = qs<HTMLElement>(root, "[data-verdict]"); if (badge) badge.dataset.verdict = verdict;
    const out = qs<HTMLElement>(root, "[data-verdict-label]"); if (out) out.textContent = label;
    const list = qs<HTMLElement>(root, "[data-trace]"); if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
}

function initSession(): void {
  const root = document.querySelector("#grok-session"); if (!root) return;
  let session = 1; let updates = 0; let checkpoint: number | null = null;
  const log = qs<HTMLElement>(root, "[data-log]");
  const render = (message?: string) => { const set = (s: string, v: string) => { const el = qs<HTMLElement>(root, s); if (el) el.textContent = v; }; set("[data-session]", String(session)); set("[data-updates]", String(updates)); set("[data-checkpoint]", checkpoint === null ? "—" : `u${checkpoint}`); if (message) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">u${updates}</span> <span class="k-sys">${message}</span></span>`); };
  qsa<HTMLButtonElement>(root, "[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "prompt") { updates += 3; render("prompt → message chunks → end_turn"); }
    if (action === "checkpoint") { checkpoint = updates; render("recoverable boundary persisted"); }
    if (action === "rewind") { if (checkpoint !== null) { updates = checkpoint; render("conversation restored to the recorded boundary"); } else render("rewind ignored: no checkpoint"); }
    if (action === "fork") { session += 1; updates += 1; render("new session derived without a second active writer"); }
    if (action === "resume") { updates += 1; render("persisted conversation repaired and resumed"); }
    if (action === "reset") { session = 1; updates = 0; checkpoint = null; if (log) log.innerHTML = ""; render(); }
  }));
}

function initContext(): void {
  const root = document.querySelector("#grok-context"); if (!root) return; let percent = 42;
  const render = (note?: string) => { const fill = qs<HTMLElement>(root, "[data-fill]"); if (fill) fill.style.width = `${percent}%`; const p = qs<HTMLElement>(root, "[data-percent]"); if (p) p.textContent = `${percent}%`; const s = qs<HTMLElement>(root, "[data-status]"); if (s) s.textContent = `${percent}%`; const policy = qs<HTMLElement>(root, "[data-policy]"); if (policy) policy.textContent = percent >= 85 ? "触发 auto compact" : percent >= 72 ? "接近阈值" : "继续采样"; if (note) { const n = qs<HTMLElement>(root, "[data-note]"); if (n) n.textContent = note; } };
  qsa<HTMLButtonElement>(root, "[data-add]").forEach((b) => b.addEventListener("click", () => { percent = Math.min(100, percent + Number(b.dataset.add)); render(); }));
  qs<HTMLButtonElement>(root, "[data-compact]")?.addEventListener("click", () => { percent = 31; render("旧历史被摘要替换；规则、最新请求与运行态随后显式重建。"); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => { percent = 42; render("85% 是该快照的默认触发值，实际值可被配置覆盖。"); });
}

function initSurface(id: string, data: Record<string, Array<[string, string]>>): void {
  const root = document.querySelector(id); if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => { const item = data[button.dataset.key ?? ""]; if (!item || !detail) return; qsa<HTMLButtonElement>(root, "[data-key]").forEach((b) => b.setAttribute("aria-pressed", String(b === button))); detail.innerHTML = item.map(([term, desc]) => `<div><dt>${term}</dt><dd>${desc}</dd></div>`).join(""); if (status) status.textContent = button.textContent ?? "selected"; }));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  initTheme();
  initSeriesNav();
  initReveal(reduced.matches);
  initNavMenu();
  initHeroPause();
  initTurn();
  initEvents();
  initSafety();
  initSession();
  initContext();
  initChoiceDetail("#grok-architecture", {
    render: { title: "展示与承载层", body: "先比较客户端收到的事件与最终布局；会话事实可能完全正确，只是投影错了。", status: "SURFACE" },
    stall: { title: "会话与采样层", body: "核对 TurnOutcome、待回填工具结果、插话、取消和外层续跑闸门。", status: "SESSION" },
    missing: { title: "能力装配与工具注册层", body: "区分工具是否被发现、是否可见、是否可派发，以及是否被当前工具集裁掉。", status: "CAPABILITY" },
    dirty: { title: "执行世界与工作区层", body: "检查命令终态、实际 VCS/文件状态与回填证据是否一致。", status: "WORKSPACE" },
  });
  initChoiceDetail("#grok-tools", {
    hidden: { title: "Agent capability selection", body: "读取最终 tool definitions，确认工具没有被 allowlist、denylist、mode 或 feature gate 裁掉。" },
    schema: { title: "Tool schema validation", body: "比较模型发出的参数与 canonical schema；名称映射不应改变内部身份。" },
    permission: { title: "PermissionManager", body: "查看当前 permission mode、记忆授权、组织要求与 pending interaction。" },
    output: { title: "Normalization / truncation", body: "命令可能成功，但关键 stdout 被截断、折叠或转换错误，导致回注证据不完整。" },
  });
  initChoiceDetail("#grok-workspace", {
    file: { title: "ToolBridge → Workspace filesystem", body: "路径校验、权限、编辑实现、diff 通知与 checkpoint 共同形成可恢复证据。" },
    command: { title: "Permission → PTY/process", body: "命令获得会话上下文和取消句柄，stdout/stderr 流式产生 ToolNotification。" },
    background: { title: "ProcessManager → BackgroundHandle", body: "启动后返回任务句柄；后续通过 task log、get output 与 kill 跟踪，而不是阻塞回合。" },
    rewind: { title: "Checkpoint → VCS/filesystem restore", body: "回退应以已记录边界恢复副作用，再用 Session update 让客户端重建视图。" },
  });
  initChoiceDetail("#grok-extensions", {
    rules: { title: "AGENTS.md · 行为约束", body: "规则以独立的项目指令项注入，并在压缩后逐字重建；它不新增可执行工具。" },
    skills: { title: "Skills · 渐进式流程知识", body: "SKILL.md 提供专门工作流；同名项按来源优先级去重，执行仍依赖已有工具。" },
    mcp: { title: "MCP · 外部能力协议", body: "工具先注册和索引，模型再通过 search/use 两段式发现；调用仍经过权限与结果归一化。" },
    plugins: { title: "Plugins · 可分发扩展包", body: "把 agents、Skills、Hooks 与 MCP 组合为分发单元；项目来源仍要过目录信任。" },
    hooks: { title: "Hooks · 确定性生命周期代码", body: "在明确事件上裁决、改写或补充上下文；改写工具参数后必须重新通过 schema。" },
    memory: { title: "Memory · 跨会话证据层", body: "markdown 保存可审计真相，检索索引可重建；旧命中必须用当前现场复核。" },
  });
  initSurface("#grok-surfaces", {
    tui: [["消费者", "开发者"], ["输入", "全屏 Prompt / slash commands"], ["输出", "Scrollback、diff、modal"], ["共享内核", "Session + Agent + Workspace"]],
    headless: [["消费者", "远端与无人值守客户端"], ["输入", "relay 会话消息"], ["输出", "流式会话事件"], ["关键边界", "ping、半开检测与重连"]],
    acp: [["消费者", "IDE 与 Agent 客户端"], ["输入", "ACP PromptRequest"], ["输出", "SessionUpdate / ToolCallUpdate"], ["关键边界", "客户端不拥有运行时状态"]],
    serve: [["消费者", "可信远端执行消费者"], ["输入", "JSON-RPC 工具调用"], ["输出", "本地工作区工具结果"], ["关键边界", "完整提示与工具结果可能离开本机"]],
    leader: [["消费者", "多个 CLI/会话"], ["输入", "本地传输协议"], ["输出", "复用常驻宿主"], ["关键边界", "锁、认证刷新与进程生命周期"]],
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
