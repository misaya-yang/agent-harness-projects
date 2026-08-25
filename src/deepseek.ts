import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/deepseek.css";

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
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = `<span class="label-mono">OWNING PATH</span><h3>${item.title}</h3><p>${item.body}</p>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLoop(): void {
  const root = document.querySelector("#dsh-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = ["turn/start", "agent/inbox/claimed", "step/start", "user/message", "request/header + request/context", "assistant/chunk*", "assistant/message", "tool/call → tool/result", "step/end → turn/end"];
  const notes = ["先记录持久 Turn，再开始认领输入。", "Inbox 同时承担排队和可恢复 splice 事实。", "一个 Step 对应一次模型请求及其工具批次。", "进入本步的消息成为可投影 Surface 节点。", "有效配置、Prompt 与工具顺序被记录后再请求模型。", "Chunk 保留回放证据，但不直接进入模型历史。", "成功 Provider 调用落成 committed assistant message。", "工具经过策略管线，唯一结果按模型顺序写回日志。", "没有欠下的 next-step 工作时，Turn 才关闭。"];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => {
    steps.forEach((item, i) => { item.classList.toggle("is-now", i === index); item.classList.toggle("is-done", i < index); });
    if (index >= 0) {
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 7 ? "tool" : "sys"}">${events[index]}</span></span>`);
      if (note) note.textContent = notes[index];
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察“活的控制”怎样留下“持久事实”。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initSessionProjection(): void {
  const root = document.querySelector("#dsh-session");
  if (!root) return;
  let events = 0;
  let surface = 0;
  let messages = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const render = (name?: string, note?: string) => {
    const set = (selector: string, value: number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); };
    set("[data-events]", events); set("[data-surface]", surface); set("[data-messages]", messages);
    if (name) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">e${events}</span> <span class="k-sys">${name}</span>${note ? ` <span class="t">${note}</span>` : ""}</span>`);
  };
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event;
    if (type === "reset") { events = 0; surface = 0; messages = 0; if (log) log.innerHTML = ""; render(); return; }
    if (type === "compact") { events += 3; surface = surface > 0 ? 1 : 0; messages = surface; render("compaction/start → replacement → end", "原事件保留"); return; }
    events += 1;
    if (type === "chunk") render("assistant/chunk", "log only");
    else { surface += 1; messages += 1; render(type === "user" ? "user/message" : type === "assistant" ? "assistant/message" : "tool/result", "surface + model"); }
  }));
}

function initSafety(): void {
  const root = document.querySelector("#dsh-safety");
  if (!root) return;
  let op = "";
  let mode = "";
  let approval = "";
  const select = (group: string, value: string, button: HTMLButtonElement) => {
    qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (group === "op") op = value; else if (group === "mode") mode = value; else approval = value;
    evaluate();
  };
  const evaluate = () => {
    if (!op || !mode || !approval) return;
    const sandboxAllows = op === "read" || mode === "dfa" || (mode === "ww" && op === "write");
    const label = sandboxAllows ? "Sandbox 允许" : "Sandbox 拒绝";
    const badge = qs<HTMLElement>(root, "[data-verdict]");
    if (badge) badge.dataset.verdict = sandboxAllows ? "ok" : "deny";
    const output = qs<HTMLElement>(root, "[data-verdict-label]");
    if (output) output.textContent = label;
    const trace = [
      `文件效果：${mode} × ${op} → ${sandboxAllows ? "allow" : "deny"}`,
      approval === "ask" ? "审批通道可返回 allowed-once / rejected / cancelled / unavailable" : "无 answerer 或 never：需要人工决定的升级失败关闭",
      sandboxAllows ? "本实验到此放行；工具仍要经过其余 pre/guard/post 策略" : "Approval 不会自动改写 Sandbox；owner 必须显式设计一次升级请求",
    ];
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
  (["op", "mode", "approval"] as const).forEach((group) => qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((button) => button.addEventListener("click", () => select(group, button.dataset.v ?? "", button))));
}

function initSurface(id: string, data: SurfaceData): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = item.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");
    if (status) status.textContent = button.textContent ?? "selected";
  }));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  initTheme(); initSeriesNav(); initReveal(reduced.matches); initSpy(); initNavMenu(); initLoop(); initSessionProjection(); initSafety();
  initChoiceDetail("#dsh-composition", {
    model: { title: "ctx.llm · LlmAdapter", body: "注册或替换 Provider adapter；Loop 只通过 LLM service 发起流式调用。", status: "LLM PROVIDER" },
    prompt: { title: "ctx.systemPrompt · section/context", body: "新增 Prompt plugin 或 scoped section；模型可见内容必须同时留下可重建事实。", status: "SYSTEM PROMPT" },
    tool: { title: "ctx.tools · ToolRuntime", body: "注册 Definition 与 Consumer，并让 Provider seam 提供真实能力；不要把工具分支写进 Loop。", status: "TOOLS" },
    history: { title: "ctx.sessions · persistence / repair", body: "先查 append-only log、flush、load repair 与 Surface projection，不从 UI 文本反推真相。", status: "SESSION" },
  });
  initChoiceDetail("#dsh-tools", {
    hidden: { title: "Prompt assembly / Agent scope", body: "检查当前 Preset 的 scoped ToolRuntime layer，以及最终写入 request/header 的工具顺序。" },
    denied: { title: "tools/pre-execute → approval → guard", body: "body 没运行时先看 pre decision、answerer outcome 与 monotonic guard，不要查实现输出。" },
    timeout: { title: "tools/execute waterfall", body: "timeout、retry 与 metrics 在 around-dispatch 层；同时核对进程取消是否由 Provider 正确处理。" },
    distorted: { title: "tools/post-execute → finalizeContent", body: "比较 lossless result、post replacement 与最终 model-facing content，确认哪一层改写了证据。" },
  });
  initChoiceDetail("#dsh-profiles", {
    base: { title: "@deepseek-ai/dsh-base Bundle", body: "进程级基础插件层；改变它会影响使用该 Bundle 的 Profile 新启动实例。", status: "BUNDLE" },
    surface: { title: "web-app / headless Bundle", body: "它们叠在 base 之上：一个加入 Web Host，一个只提交一次任务并等待 idle。", status: "SURFACE BUNDLE" },
    profile: { title: "profile cordis.patch.yml", body: "用户层按 row id 替换整份 config，不是深合并；先 dump-config 再改。", status: "PROFILE PATCH" },
    preset: { title: "AgentPresets standing scope", body: "只影响加入该 Preset 的 Agent；已有输出的 Agent 不允许随意 recompose。", status: "AGENT PRESET" },
  });
  initSurface("#dsh-capabilities", {
    local: [["Definition", "ctx.fs + ctx.subprocess"], ["Provider", "fs-local + subprocess-local"], ["Consumers", "Bash、PTY、LSP、文件工具"], ["位置", "宿主工作区与进程树"]],
    sandbox: [["Definition", "同一 ctx.fs / ctx.subprocess"], ["Provider", "fs-sandbox + sandbox-local"], ["Consumers", "上层工具无需分叉"], ["限制", "文件效果模式；runner 不可用时失败关闭"]],
    e2b: [["Definition", "同一 provider-neutral interfaces"], ["Provider", "E2BFileSystem + E2BSubprocessRuntime"], ["Consumers", "Bash、PTY、LSP 复用"], ["边界", "实验性 POC；只搬执行世界，不搬 Agent/Session"]],
  });
  initSurface("#dsh-surfaces", {
    web: [["消费者", "人类开发者"], ["交互", "Web UI、审批、问题、命令"], ["组合", "base + web-app Bundle"], ["状态", "从 session/event 投影"]],
    headless: [["消费者", "一次性脚本 / CI"], ["输入", "一个普通 user message"], ["输出", "idle 后最后非空 assistant 文本"], ["网络", "不启动 HTTP Server"]],
    acp: [["消费者", "自动化 Agent Client"], ["传输", "JSON-RPC stdio"], ["输出", "committed assistant message updates"], ["限制", "automation-only；不等于 Web UI"]],
    sdk: [["消费者", "TypeScript 产品集成"], ["传输", "newline-delimited JSON-RPC"], ["运行", "启动完整 runtime 子进程"], ["生命周期", "initialize settle / shutdown flush"]],
    python: [["消费者", "Python 调用方"], ["传输", "同一 JSON-RPC runtime"], ["运行", "bundled runtime 子进程"], ["收集", "prompt admission 至 Agent idle 的活动区间"]],
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
