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
      detail.innerHTML = `<span class="label-mono">OWNING PATH</span><h3>${item.title}</h3><p>${item.body}</p>`;
      if (status) status.textContent = item.status ?? button.textContent ?? "selected";
    });
  });
}

function initTurn(): void {
  const root = document.querySelector("#grok-turn");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const logs = [
    "session.append(user_prompt)", "AgentBuilder.build(tools + prompt)", "sampling.request(messages, tools)",
    "SessionUpdate::AgentMessageChunk", "tool_call: run_terminal_command", "PermissionManager → Workspace.call",
    "tool_result appended to Conversation", "stop_reason=end_turn → persist",
  ];
  const notes = [
    "Prompt 先成为会话事实。", "Agent 在本回合得到明确的提示词、模型与工具面。", "宿主向模型发起一次可取消的流式采样。",
    "消息、thinking 与调用增量被转换为事件。", "模型只提出结构化调用，不直接碰工作区。", "权限决策后，Workspace 承担真实副作用。",
    "输出经过归一化，再进入下一次采样的消息历史。", "没有新工具调用时，回合完成并持久化。",
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
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察控制权在模型与宿主之间如何交接。"; draw(); };
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
    if (action === "checkpoint") { checkpoint = updates; render("CompactionCheckpoint persisted"); }
    if (action === "rewind") { if (checkpoint !== null) { updates = checkpoint; render("RewindMarker restored checkpoint boundary"); } else render("rewind ignored: no checkpoint"); }
    if (action === "fork") { session += 1; updates += 1; render("child session created with parent relationship"); }
    if (action === "resume") { updates += 1; render("ACP + XAI updates replayed into host"); }
    if (action === "reset") { session = 1; updates = 0; checkpoint = null; if (log) log.innerHTML = ""; render(); }
  }));
}

function initContext(): void {
  const root = document.querySelector("#grok-context"); if (!root) return; let percent = 42;
  const render = (note?: string) => { const fill = qs<HTMLElement>(root, "[data-fill]"); if (fill) fill.style.width = `${percent}%`; const p = qs<HTMLElement>(root, "[data-percent]"); if (p) p.textContent = `${percent}%`; const s = qs<HTMLElement>(root, "[data-status]"); if (s) s.textContent = `${percent}%`; const policy = qs<HTMLElement>(root, "[data-policy]"); if (policy) policy.textContent = percent >= 85 ? "触发 auto compact" : percent >= 72 ? "接近阈值" : "继续采样"; if (note) { const n = qs<HTMLElement>(root, "[data-note]"); if (n) n.textContent = note; } };
  qsa<HTMLButtonElement>(root, "[data-add]").forEach((b) => b.addEventListener("click", () => { percent = Math.min(100, percent + Number(b.dataset.add)); render(); }));
  qs<HTMLButtonElement>(root, "[data-compact]")?.addEventListener("click", () => { percent = 31; render("历史被摘要化，并记录 compaction checkpoint；不是简单删除最旧消息。"); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => { percent = 42; render("85% 是当前文档中的默认配置值，真实触发还受模型窗口、估算与版本影响。"); });
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
    render: { title: "xai-grok-pager", body: "先检查 scrollback block、布局约束和 render snapshot；Session 事件可能完全正确。", status: "PAGER" },
    stall: { title: "xai-grok-shell / sampling", body: "核对 stop reason、pending tool call、取消状态和回合完成事件。", status: "SHELL" },
    missing: { title: "AgentBuilder → ToolRegistry", body: "核对 definition 的 allowlist/denylist、tool name override 与最终 tool_definitions。", status: "AGENT / TOOLS" },
    dirty: { title: "xai-grok-workspace", body: "检查命令进程、VCS 状态、checkpoint 与工具完成通知是否一致。", status: "WORKSPACE" },
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
    rules: { title: "AGENTS.md · 行为约束", body: "从全局与项目路径发现，注入系统提示；它不新增可执行工具。" },
    skills: { title: "Skills · 渐进式流程知识", body: "按名称或匹配发现 SKILL.md，向 Agent 注入专门工作流；仍需现有工具执行。" },
    mcp: { title: "MCP · 外部能力协议", body: "发现服务器工具并纳入 registry；调用仍经过权限、通知与输出归一化。" },
    plugins: { title: "Plugins · 可分发扩展包", body: "把 Skills、Hooks、MCP 等能力组织成安装和市场分发单元。" },
    hooks: { title: "Hooks · 确定性生命周期代码", body: "在明确事件上执行脚本或策略，适合审计和阻断，不应冒充模型推理。" },
    memory: { title: "Memory · 跨 Session 检索层", body: "通过观察、索引与 memory_search 提供长期事实；命中仍需接受当前上下文验证。" },
  });
  initSurface("#grok-surfaces", {
    tui: [["消费者", "开发者"], ["输入", "全屏 Prompt / slash commands"], ["输出", "Scrollback、diff、modal"], ["共享内核", "Session + Agent + Workspace"]],
    headless: [["消费者", "脚本与 CI"], ["输入", "grok -p"], ["输出", "plain / JSON / streaming JSON"], ["关键边界", "非交互授权必须显式配置"]],
    acp: [["消费者", "IDE 与 Agent 客户端"], ["输入", "ACP PromptRequest"], ["输出", "SessionUpdate / ToolCallUpdate"], ["关键边界", "客户端不拥有运行时状态"]],
    serve: [["消费者", "本地网络客户端"], ["输入", "WebSocket"], ["输出", "ACP 会话流"], ["关键边界", "本地 server 生命周期与访问边界"]],
    leader: [["消费者", "多个 CLI/会话"], ["输入", "本地传输协议"], ["输出", "复用常驻宿主"], ["关键边界", "锁、认证刷新与进程生命周期"]],
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
