import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/pi.css";

import { initNavMenu } from "./modules/navmenu";
import { initReveal } from "./modules/reveal";
import { initSeriesNav } from "./modules/series-nav";
import { initChapterReader } from "./modules/chapter-reader";
import { initTheme } from "./modules/theme";
import { initHeroPause } from "./modules/hero-pause";

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
    detail.innerHTML = `<span class="label-mono">OWNING LAYER</span><h3>${item.title}</h3><p>${item.body}</p>`;
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

function initCompaction(): void {
  const root = document.querySelector("#pi-compaction"); if (!root) return;
  type CpEntry = { id: string; kind: "user" | "assistant" | "tool"; tokens: number };
  const WINDOW = 65536; const KEEP = 20000; const SUMMARY = 1200; const LABEL = { user: "u", assistant: "a", tool: "tr" };
  let reserve = 16384; let seq = 0; let entries: CpEntry[] = []; let keptFrom = -1;
  const log = qs<HTMLElement>(root, "[data-log]"); const strip = qs<HTMLElement>(root, "[data-strip]"); const status = qs<HTMLElement>(root, "[data-status]"); const led = qs<HTMLElement>(root, "[data-led]");
  const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
  const total = () => entries.reduce((sum, entry) => sum + entry.tokens, 0);
  const line = (note: string, cls = "k-sys") => log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="${cls}">${note}</span></span>`);
  const render = () => {
    const ctx = total(); const projected = keptFrom >= 0 ? SUMMARY + entries.slice(keptFrom).reduce((sum, entry) => sum + entry.tokens, 0) : ctx;
    const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; };
    set("[data-entries]", String(entries.length)); set("[data-tokens]", k(ctx)); set("[data-projected]", k(projected));
    if (status) status.textContent = keptFrom >= 0 ? `firstKept ${entries[keptFrom]?.id ?? "-"}` : `阈值 ${k(WINDOW - reserve)}`;
    led?.classList.toggle("is-done", keptFrom >= 0);
    if (strip) strip.innerHTML = (keptFrom >= 0 ? `<span class="pi-chip is-summary">Σ summary ${k(SUMMARY)}</span>` : "") + (entries.length ? entries.map((entry, index) => `<span class="pi-chip is-${entry.kind}${keptFrom >= 0 && index < keptFrom ? " is-cut" : ""}">${LABEL[entry.kind]} ${k(entry.tokens)}</span>`).join("") : `<span class="pi-chip">追加 Turn 后出现 entry 条</span>`);
  };
  qsa<HTMLButtonElement>(root, "[data-reserve] button").forEach((button) => button.addEventListener("click", () => {
    reserve = Number(button.dataset.r); // 换 reserve 只移动下次触发线，不撤销既有 compaction 投影
    qsa<HTMLButtonElement>(root, "[data-reserve] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    line(`reserveTokens=${k(reserve)}：触发线 window−reserve=${k(WINDOW - reserve)}`); render();
  }));
  qsa<HTMLButtonElement>(root, "[data-cp]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.cp;
    if (action === "reset") { reserve = 16384; seq = 0; entries = []; keptFrom = -1; if (log) log.innerHTML = ""; qsa<HTMLButtonElement>(root, "[data-reserve] button").forEach((candidate) => candidate.setAttribute("aria-pressed", "false")); render(); return; }
    if (action === "heavy" || action === "light") { const tool = action === "heavy" ? 9000 : 2400; entries.push({ id: `e${++seq}`, kind: "user", tokens: 420 }, { id: `e${++seq}`, kind: "assistant", tokens: 1800 }, { id: `e${++seq}`, kind: "tool", tokens: tool }); line(`turn 追加：u 0.4k + a 1.8k + toolResult ${k(tool)}，context=${k(total())}${keptFrom >= 0 ? "（落在 firstKept 之后，投影随之增长）" : ""}`); render(); return; }
    if (action === "compact") {
      if (!entries.length) { line("空 transcript，无可压缩段", "k-warn"); return; }
      const ctx = total(); const threshold = WINDOW - reserve;
      line(`shouldCompact(${k(ctx)}, ${k(WINDOW)}, reserve ${k(reserve)}) → ${ctx > threshold ? "true" : "false"}`, ctx > threshold ? "k-tool" : "k-warn");
      if (ctx <= threshold) line("未达阈值：auto-compaction 不触发；这次走手动 AgentSession.compact()");
      let acc = 0; let cut = 0;
      for (let index = entries.length - 1; index >= 0; index -= 1) { acc += entries[index].tokens; if (acc >= KEEP) { cut = index; while (cut < entries.length && entries[cut].kind === "tool") cut += 1; break; } }
      if (cut >= entries.length) { line("窗口内只剩 toolResult，切点推至末尾：本次不追加 compaction", "k-warn"); render(); return; }
      if (cut === 0) { line("全量都在 keep 预算内：无早期段可摘要，投影不变", "k-warn"); render(); return; }
      keptFrom = cut;
      line(`findCutPoint：从后向前累计 ≥ ${k(KEEP)} → cut@${entries[cut].id}（toolResult 不作切点，向后让位）`);
      line("摘要输入：单个 tool result 截到 2000 字符；独立会话 + toolChoice none + cacheRetention none");
      line(`appendCompaction：firstKeptEntryId=${entries[cut].id}，tokensBefore=${k(ctx)}；entries 数不变，旧 entry 仍在 JSONL`);
      render(); return;
    }
  }));
  render();
}

function initTuiDiff(): void {
  const root = document.querySelector("#pi-tui-diff"); if (!root) return;
  const base = ["$ pi \"审阅配置并给最小修复\"", "user · 检查错误处理并给最小修复建议", "⏳ read 配置文件", "assistant · 错误处理集中在 load() 的"];
  let rows = base.slice(); let streamStep = 0; let toolDone = false;
  const screen = qs<HTMLElement>(root, "[data-screen]"); const log = qs<HTMLElement>(root, "[data-log]"); const status = qs<HTMLElement>(root, "[data-status]");
  const draw = (changed: number[]) => { if (screen) screen.innerHTML = rows.map((row, index) => `<span class="pi-row${changed.includes(index) ? " is-changed" : ""}"><span class="t">${index + 1}</span>${row.replace(/</g, "&lt;")}</span>`).join(""); };
  const apply = (name: string, changed: number[], mode: string) => {
    draw(changed); if (status) status.textContent = `${changed.length} 行重写`;
    const note = changed.length ? `${mode}：${name} → 重写行 ${changed.map((index) => index + 1).join(",")}，整段包在 ESC[?2026h/l` : "本帧与 previousLines 相同：差分不输出任何字节";
    log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="${changed.length ? "k-tool" : "k-warn"}">${note}</span></span>`);
  };
  qsa<HTMLButtonElement>(root, "[data-frame] button").forEach((button) => button.addEventListener("click", () => {
    qsa<HTMLButtonElement>(root, "[data-frame] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    const frame = button.dataset.f;
    if (frame === "reset") { rows = base.slice(); streamStep = 0; toolDone = false; if (log) log.innerHTML = ""; draw([]); if (status) status.textContent = "等待帧"; return; }
    if (frame === "stream") { streamStep += 1; if (streamStep === 1) { rows[3] = "assistant · 错误处理集中在 load() 的 catch 分支"; apply("文本 delta", [3], "差分"); return; } if (streamStep === 2) { rows.push("· 建议：补 timeout 与 retry 预算"); apply("换行追加", [rows.length - 1], "差分"); return; } apply("空闲帧", [], "差分"); return; }
    if (frame === "tool") { if (!toolDone) { rows[2] = "✔ read 配置文件 · 327 行 · 1.2s"; toolDone = true; apply("工具行更新", [2], "差分"); return; } apply("工具行重复帧", [], "差分"); return; }
    if (frame === "resize") { apply("宽度变化", rows.map((_, index) => index), "full redraw"); return; }
  }));
  draw([]);
}

function initSurface(id: string, data: SurfaceData): void {
  const root = document.querySelector(id); if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => { const item = data[button.dataset.key ?? ""]; if (!item || !detail) return; qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button))); detail.innerHTML = item.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join(""); if (status) status.textContent = button.textContent ?? "selected"; }));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  initTheme();
  initSeriesNav();
  initReveal(reduced.matches);
  initNavMenu();
  initHeroPause();
  initState();
  initLoop();
  initQueues();
  initTools();
  initSessionTree();
  initCompaction();
  initTuiDiff();
  initChoiceDetail("#pi-layers", { provider: { title: "模型适配层", body: "先核对目标 API 的请求形状、认证解析、流事件映射与最终错误消息。", status: "PI AI" }, loop: { title: "Agent 循环层", body: "查看助手消息是否已提交、工具批次是否回填、双队列是否排空，以及最终 stopReason。", status: "AGENT CORE" }, session: { title: "会话投影层", body: "核对当前 leaf、父子关系与压缩边界，确认恢复出的活动路径是否正确。", status: "SESSION TREE" }, render: { title: "终端呈现层", body: "比较前后帧、可用宽度与完整重绘条件；画面异常不等于 Agent 状态异常。", status: "TUI" } });
  initSurface("#pi-providers", { anthropic: [["统一层", "Model + Context + AssistantMessageEventStream"], ["Adapter", "system block、thinking signature、tool_result"], ["Auth", "Provider auth resolution"], ["Wire", "Anthropic Messages SSE"]], openai: [["统一层", "同一 Agent / Pi AI contracts"], ["Adapter", "system/developer role、image URL、tool ids"], ["Compat", "endpoint-specific stop/toolUse mapping"], ["Wire", "OpenAI-compatible streaming"]], google: [["统一层", "同一 provider-neutral events"], ["Adapter", "Google content parts 与 reasoning options"], ["模型", "catalog 由 Provider 提供"], ["Wire", "Google API-specific payload"]], faux: [["用途", "确定性测试"], ["响应", "scripted tool call / text / error"], ["网络", "不访问真实 Provider"], ["证据", "验证标准事件与最终 Message"]] });
  initChoiceDetail("#pi-extensions", { tool: { title: "ExtensionAPI.registerTool", body: "注册 TypeBox schema、execute、progress 与 TUI renderers；异常才成为 isError。" }, skill: { title: "ResourceLoader + Skill", body: "System Prompt 先暴露 name/description，模型按需用 read 加载完整 SKILL.md。" }, hook: { title: "tool_call event", body: "执行前可改参数或 block；这是一项 Extension policy，不是 Pi 内建 Sandbox。" }, state: { title: "Session custom entry", body: "custom 持久扩展状态但不进 LLM；custom_message 才会进入 context。" } });
  initSurface("#pi-surfaces", { sdk: [["消费者", "Node / TypeScript 应用"], ["入口", "createAgentSession"], ["进程", "同进程"], ["状态", "AgentSession + SessionManager"]], json: [["消费者", "日志与轻量观察器"], ["入口", "--mode json"], ["协议", "逐行 Agent events"], ["控制", "没有 RPC command plane"]], rpc: [["消费者", "IDE / 跨语言子进程"], ["Framing", "LF-only JSONL"], ["响应", "accepted / queued"], ["结果", "后续 events / messages"]], protocol: [["消费者", "自建远程服务"], ["Framing", "uint32-be + definite CBOR"], ["状态", "Server / Session snapshots 权威"], ["边界", "experimental；Transport 负责认证"]], client: [["消费者", "远程 Pi session client"], ["连接", "Transport-neutral ByteTransport"], ["所有权", "shared / exclusive SessionLease"], ["恢复", "不自动 reconnect"]] });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
