import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/pi.css";

import { initNavMenu } from "./modules/navmenu";
import { initReveal } from "./modules/reveal";
import { initSeriesNav } from "./modules/series-nav";
import { initSpy } from "./modules/spy";
import { initTheme } from "./modules/theme";

type Detail = { title: string; body: string; status?: string };
type SurfaceData = Record<string, Array<[string, string]>>;
const qs = <T extends Element>(root: ParentNode, selector: string): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(root: ParentNode, selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));

function initChoiceDetail(id: string, data: Record<string, Detail>): void {
  const root = document.querySelector(id); if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""]; if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = `<span class="label-mono">OWNING PATH</span><h3>${item.title}</h3><p>${item.body}</p>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLoop(): void {
  const root = document.querySelector("#pi-loop"); if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = ["agent_start", "turn_start", "message_start/end: user", "transformContext → convertToLlm", "start → delta* → done", "message_end: assistant", "tool_execution_start/update/end", "message_start/end: toolResult", "steer / follow-up / next turn", "agent_end"];
  const notes = ["一次 Agent run 开始。", "Pi 的 Turn 是一次模型调用加工具批次。", "用户消息先进入 Agent transcript。", "应用消息在 LLM 边界转换成标准 Message。", "Provider events 用 contentIndex 关联交错 block。", "Committed assistant message 是工具 preflight 的 barrier。", "Tool body 可并发，生命周期事件仍可观察。", "最终 ToolResult transcript 按模型 source order 写入。", "Steer 优先；没有 Steering 才检查 Follow-up。", "等待型 agent_end listeners 完成后 run 才 settle。"];
  let index = -1; let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]"); const note = qs<HTMLElement>(root, "[data-note]"); const phase = qs<HTMLElement>(root, "[data-phase]"); const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => { steps.forEach((item, i) => { item.classList.toggle("is-now", i === index); item.classList.toggle("is-done", i < index); }); if (index >= 0) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 6 || index === 7 ? "tool" : "sys"}">${events[index]}</span></span>`); if (note) note.textContent = notes[index]; } if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`; led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1); led?.classList.toggle("is-done", index === steps.length - 1); };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "观察 Provider event 怎样被提升为 Agent lifecycle。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step); qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 520); }); qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset); window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initState(): void {
  const root = document.querySelector("#pi-state"); if (!root) return;
  let streaming = false; let messages = 0; let tools = 0;
  const log = qs<HTMLElement>(root, "[data-log]"); const phase = qs<HTMLElement>(root, "[data-phase]"); const led = qs<HTMLElement>(root, "[data-led]");
  const render = (event?: string, note?: string) => { const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; }; set("[data-streaming]", streaming ? "YES" : "NO"); set("[data-messages]", String(messages)); set("[data-tools]", String(tools)); if (phase) phase.textContent = streaming ? "running" : "idle"; led?.classList.toggle("is-run", streaming); if (event) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-sys">${event}</span>${note ? ` <span class="t">${note}</span>` : ""}</span>`); };
  qsa<HTMLButtonElement>(root, "[data-state-event]").forEach((button) => button.addEventListener("click", () => { const event = button.dataset.stateEvent; if (event === "reset") { streaming = false; messages = 0; tools = 0; if (log) log.innerHTML = ""; render(); return; } if (event === "message_start") { streaming = true; render(event, "partial 进入 streamingMessage"); } if (event === "message_update") render(event, "更新 partial，不追加 transcript"); if (event === "tool_start") { streaming = true; tools += 1; render(event); } if (event === "tool_end") { tools = Math.max(0, tools - 1); render(event); } if (event === "message_end") { messages += 1; render(event, "完成消息追加到 public state"); } if (event === "agent_end") { streaming = false; tools = 0; render(event, "listener barrier 之后才 idle"); } }));
}

function initQueues(): void {
  const root = document.querySelector("#pi-queues"); if (!root) return;
  let running = false; let steer = 0; let follow = 0;
  const log = qs<HTMLElement>(root, "[data-log]"); const phase = qs<HTMLElement>(root, "[data-phase]"); const led = qs<HTMLElement>(root, "[data-led]");
  const render = (line?: string) => { const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; }; set("[data-tool]", running ? "running" : "idle"); set("[data-steer]", String(steer)); set("[data-follow]", String(follow)); if (phase) phase.textContent = running ? "tool running" : steer || follow ? "queued" : "idle"; led?.classList.toggle("is-run", running); if (line) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-sys">${line}</span></span>`); };
  qsa<HTMLButtonElement>(root, "[data-queue]").forEach((button) => button.addEventListener("click", () => { const action = button.dataset.queue; if (action === "reset") { running = false; steer = 0; follow = 0; if (log) log.innerHTML = ""; render(); return; } if (action === "start") { running = true; render("tool batch started"); } if (action === "steer") { steer += 1; render("steer queued; current tool keeps running"); } if (action === "follow") { follow += 1; render("follow-up queued behind steering"); } if (action === "abort") { running = false; render("abort signal fired; cooperation still required"); } if (action === "turn") { running = false; if (steer > 0) { steer -= 1; render("drain steer → next turn"); } else if (follow > 0) { follow -= 1; render("no steer/tool → drain follow-up"); } else render("no queued work → agent_end"); } }));
}

function initTools(): void {
  const root = document.querySelector("#pi-tools"); if (!root) return;
  let mode = "parallel"; const log = qs<HTMLElement>(root, "[data-log]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-mode] button").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.v ?? "parallel"; qsa<HTMLButtonElement>(root, "[data-mode] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button))); if (status) status.textContent = mode; }));
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { if (log) log.innerHTML = ""; const lines = mode === "parallel" ? ["start slow_read", "start fast_grep", "end fast_grep", "end slow_read", "transcript: slow_read result", "transcript: fast_grep result"] : ["start slow_read", "end slow_read", "transcript: slow_read result", "start fast_grep", "end fast_grep", "transcript: fast_grep result"]; lines.forEach((line, index) => log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${line.startsWith("transcript") ? "sys" : "tool"}">${line}</span></span>`)); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => { if (log) log.innerHTML = ""; });
}

function initSessionTree(): void {
  const root = document.querySelector("#pi-session"); if (!root) return;
  let entries = 0; let branches = 1; let context = 0; const log = qs<HTMLElement>(root, "[data-log]");
  const render = (line?: string) => { const set = (selector: string, value: number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); }; set("[data-entries]", entries); set("[data-branches]", branches); set("[data-context]", context); if (line) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">e${entries}</span> <span class="k-sys">${line}</span></span>`); };
  qsa<HTMLButtonElement>(root, "[data-tree]").forEach((button) => button.addEventListener("click", () => { const action = button.dataset.tree; if (action === "reset") { entries = 0; branches = 1; context = 0; if (log) log.innerHTML = ""; render(); return; } if (action === "message") { entries += 1; context += 1; render("message appended to current leaf"); } if (action === "tool") { entries += 1; context += 1; render("toolResult appended; source call remains paired"); } if (action === "branch") { entries += 1; branches += 1; context = Math.max(1, Math.ceil(context / 2)); render("leaf moved earlier; old branch remains"); } if (action === "compact") { entries += 1; context = context > 0 ? Math.min(3, context) : 0; render("compaction entry appended; old entries remain"); } }));
}

function initSurface(id: string, data: SurfaceData): void {
  const root = document.querySelector(id); if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => { const item = data[button.dataset.key ?? ""]; if (!item || !detail) return; qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button))); detail.innerHTML = item.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join(""); if (status) status.textContent = button.textContent ?? "selected"; }));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)"); initTheme(); initSeriesNav(); initReveal(reduced.matches); initSpy(); initNavMenu(); initState(); initLoop(); initQueues(); initTools(); initSessionTree();
  initChoiceDetail("#pi-layers", { provider: { title: "packages/ai · API adapter", body: "检查目标 model.api 的 payload conversion、auth、SSE mapping 与 in-band error event。", status: "PI AI" }, loop: { title: "packages/agent · runLoop", body: "查看 committed assistant、tool batch、steering/follow-up drain 与 stopReason。", status: "AGENT CORE" }, session: { title: "coding-agent · SessionManager", body: "检查 leaf、parentId、buildContextEntries 与 branch/compaction projection。", status: "SESSION TREE" }, render: { title: "packages/tui · differential renderer", body: "比较 previousLines/previousScreen、viewport width 与 full redraw 条件。", status: "TUI" } });
  initSurface("#pi-providers", { anthropic: [["统一层", "Model + Context + AssistantMessageEventStream"], ["Adapter", "system block、thinking signature、tool_result"], ["Auth", "Provider auth resolution"], ["Wire", "Anthropic Messages SSE"]], openai: [["统一层", "同一 Agent / Pi AI contracts"], ["Adapter", "system/developer role、image URL、tool ids"], ["Compat", "endpoint-specific stop/toolUse mapping"], ["Wire", "OpenAI-compatible streaming"]], google: [["统一层", "同一 provider-neutral events"], ["Adapter", "Google content parts 与 reasoning options"], ["模型", "catalog 由 Provider 提供"], ["Wire", "Google API-specific payload"]], faux: [["用途", "确定性测试"], ["响应", "scripted tool call / text / error"], ["网络", "不访问真实 Provider"], ["证据", "验证标准事件与最终 Message"]] });
  initChoiceDetail("#pi-extensions", { tool: { title: "ExtensionAPI.registerTool", body: "注册 TypeBox schema、execute、progress 与 TUI renderers；异常才成为 isError。" }, skill: { title: "ResourceLoader + Skill", body: "System Prompt 先暴露 name/description，模型按需用 read 加载完整 SKILL.md。" }, hook: { title: "tool_call event", body: "执行前可改参数或 block；这是一项 Extension policy，不是 Pi 内建 Sandbox。" }, state: { title: "Session custom entry", body: "custom 持久扩展状态但不进 LLM；custom_message 才会进入 context。" } });
  initSurface("#pi-surfaces", { sdk: [["消费者", "Node / TypeScript 应用"], ["入口", "createAgentSession"], ["进程", "同进程"], ["状态", "AgentSession + SessionManager"]], json: [["消费者", "日志与轻量观察器"], ["入口", "--mode json"], ["协议", "逐行 Agent events"], ["控制", "没有 RPC command plane"]], rpc: [["消费者", "IDE / 跨语言子进程"], ["Framing", "LF-only JSONL"], ["响应", "accepted / queued"], ["结果", "后续 events / messages"]], protocol: [["消费者", "自建远程服务"], ["Framing", "uint32-be + definite CBOR"], ["状态", "Server / Session snapshots 权威"], ["边界", "experimental；Transport 负责认证"]], client: [["消费者", "远程 Pi session client"], ["连接", "Transport-neutral ByteTransport"], ["所有权", "shared / exclusive SessionLease"], ["恢复", "不自动 reconnect"]] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
