import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/deepseek.css";

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

function initPromptAssembly(): void {
  const root = document.querySelector("#dsh-prompt");
  if (!root) return;
  type Sec = { name: string; order: number; text: string };
  const identity: Sec = { name: "harness:identity", order: -100, text: "You are an AI agent powered by DeepSeek Harness." };
  const personaText = (rewritten: boolean): Sec => ({ name: "deployment:persona", order: 0, text: rewritten ? "改写后的 persona" : "默认部署 persona" });
  const optional: Record<string, Sec> = {
    repo: { name: "repo-rules", order: 10, text: "仓库规则" },
    shell: { name: "shell-rules", order: 10, text: "Shell 规则" },
    audit: { name: "audit-note", order: 100, text: "审计说明" },
    early: { name: "urgent-hint", order: -200, text: "高优先级提示（插队到 identity 之前）" },
  };
  const mounted = new Set<string>();
  let personaRewritten = false;
  let snapshot = false;
  let previous = "";
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const render = () => {
    const sections: Sec[] = [identity, personaText(personaRewritten)];
    mounted.forEach((key) => { const sec = optional[key]; if (sec) sections.push(sec); });
    sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const signature = sections.map((section) => `${section.name}:${section.text}`).join("|");
    const before = previous ? previous.split("|") : [];
    const now = signature.split("|");
    let boundary = before.length ? 0 : sections.length;
    while (boundary < before.length && boundary < now.length && before[boundary] === now[boundary]) boundary += 1;
    const baseline = mounted.size === 0 && !personaRewritten && !snapshot;
    const pureAppend = boundary >= before.length && now.length >= before.length;
    const pureTrim = boundary === now.length && now.length < before.length;
    const lines = sections.map((section, i) => {
      const sig = `${section.name}:${section.text}`;
      const tag = i < boundary
        ? `<span class="t">缓存命中</span>`
        : before.includes(sig)
          ? `<span class="k-warn">前缀失效 ←</span>`
          : before.some((line) => line.startsWith(`${section.name}:`))
            ? `<span class="k-warn">内容变更 · 触发断裂</span>`
            : pureAppend
              ? `<span class="t">新增 · 不动已缓存前缀</span>`
              : `<span class="k-warn">插队新增 · 触发断裂</span>`;
      return `<span class="ev"><span class="t">sys${String(i + 1).padStart(2, "0")}</span> <span class="k-sys">order ${section.order} · ${section.name}</span> ${tag}</span>`;
    });
    lines.push(`<span class="ev"><span class="k-tool">tool schemas · 按 Agent scope 排序追加</span> <span class="t">request/header 记录顺序，可重建</span></span>`);
    if (snapshot) lines.push(`<span class="ev"><span class="k-user">user snapshot · runtime context（cwd / branch）</span> <span class="t">pre-step 注入，不碰 system 前缀</span></span>`);
    else lines.push(`<span class="ev"><span class="t">runtime context：未注入。注入时以 user-role 加入，不进 system</span></span>`);
    if (log) log.innerHTML = lines.join("");
    const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; };
    set("[data-sections]", String(sections.length));
    set("[data-prefix]", `${boundary}/${sections.length} 行`);
    set("[data-snap]", snapshot ? "1（user role）" : "0");
    if (status) status.textContent = !previous && baseline
      ? "基线：两段 system"
      : pureAppend
        ? now.length > before.length ? "前缀稳定 · 新增不破坏缓存" : "与上次一致 · 缓存不动"
        : pureTrim
          ? `前缀稳定 · tail 收缩至 ${boundary} 行`
          : `前缀断裂 @第 ${boundary + 1} 行 · 已缓存 ${boundary} 行仍命中，此后 ${sections.length - boundary} 行重算`;
    previous = signature;
  };
  qsa<HTMLButtonElement>(root, "[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.toggle ?? "";
    if (key === "ctx") snapshot = !snapshot;
    else if (key === "persona") personaRewritten = !personaRewritten;
    else if (mounted.has(key)) mounted.delete(key);
    else mounted.add(key);
    button.setAttribute("aria-pressed", String(key === "ctx" ? snapshot : key === "persona" ? personaRewritten : mounted.has(key)));
    render();
  }));
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => {
    mounted.clear(); personaRewritten = false; snapshot = false; previous = "";
    qsa<HTMLButtonElement>(root, "[data-toggle]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    render(); // 刷新计数器，并把 previous 落回基线签名——下一次 toggle 才能对真实状态做 diff
  });
  render();
}

function initContextProjection(): void {
  const root = document.querySelector("#dsh-context");
  if (!root) return;
  type Evt = { label: string; tok: number; visible: boolean; pair?: "call" | "result" };
  const events: Evt[] = [
    { label: "user/message · 检查 config/app.json 超时", tok: 40, visible: true },
    { label: "assistant/chunk ×12 · 流式证据", tok: 0, visible: false },
    { label: "assistant/message · 结论 + tool-call read_file", tok: 180, visible: true, pair: "call" },
    { label: "tool/result · read_file 文件内容", tok: 300, visible: true, pair: "result" },
    { label: "assistant/message · 需要修改 + tool-call write_file", tok: 200, visible: true, pair: "call" },
    { label: "tool/result · write ok", tok: 60, visible: true, pair: "result" },
    { label: "user/message · 再跑一遍测试", tok: 30, visible: true },
    { label: "assistant/message · 测试输出（长文本）", tok: 500, visible: true },
  ];
  const summaryTokens = 120;
  let replayed = 0;
  let budget = 0;
  let tailStart = -1;
  const status = qs<HTMLElement>(root, "[data-status]");
  const render = () => {
    const visible = events.slice(0, replayed).filter((event) => event.visible);
    const compacted = tailStart >= 0;
    const nodes = compacted ? 1 + (visible.length - tailStart) : visible.length;
    const usage = compacted
      ? summaryTokens + visible.slice(tailStart).reduce((sum, event) => sum + event.tok, 0)
      : visible.reduce((sum, event) => sum + event.tok, 0);
    let verdict = "ask";
    let label = "等待选择";
    const foldableMore = visible.length - (compacted ? tailStart : 0) > 2; // recent tail 之外还有可折叠的稳定段
    if (!budget) label = "先选预算";
    else if (replayed === 0) label = "等待重放";
    else if (usage <= budget) { verdict = "ok"; label = `可发起请求 ${usage}/${budget}`; }
    else if (!compacted) label = `超预算 ${usage}/${budget} · compaction 候选`;
    else if (foldableMore) label = `仍超预算 ${usage}/${budget} · 可再压缩`;
    else { verdict = "deny"; label = `仍超预算 ${usage}/${budget} · tail 不可再切`; }
    const badge = qs<HTMLElement>(root, "[data-verdict]");
    if (badge) badge.dataset.verdict = verdict;
    const out = qs<HTMLElement>(root, "[data-verdict-label]");
    if (out) out.textContent = label;
    if (status) status.textContent = label;
    const trace = [
      `LOG：${replayed}/${events.length} 条事件已重放${replayed >= events.length ? "（turn/end 后 idle）" : ""}`,
      `SURFACE：${nodes} 个节点 · deriveMessages 投影${compacted ? "（含 summary 节点）" : ""}`,
      `model-visible：${usage} tok / 预算 ${budget || "?"}`,
    ];
    if (replayed >= 2) trace.push("assistant/chunk 计入日志，不入历史：投影时 0 成本。");
    if (compacted) {
      trace.push(`选区 = 最早 ${tailStart} 个稳定节点 → summary(${summaryTokens} tok)；replacement 引用原事件 seq，原事件保留。`);
      const kept = visible[tailStart];
      if (kept) trace.push(`tail 自 “${kept.label.slice(0, 24)}” 保留；tool-call / result 配对未切断。`);
      if (foldableMore) trace.push("回合压力还在：recent tail 之外的稳定段可再折叠——再次 compaction 会推进选区边界。");
    } else if (budget && replayed > 0 && usage > budget) {
      trace.push("选区规则：最早连续稳定段 + 保留 recent tail；被切断的 call / result 对整对后移。");
      if (!foldableMore) trace.push("选区为空：日志尚短，没有可替换的稳定前缀——这正是锁外的正常拒绝。");
    }
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
  qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((button) => button.addEventListener("click", () => {
    budget = Number(button.dataset.v) || 0;
    qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render();
  }));
  qs<HTMLButtonElement>(root, "[data-replay]")?.addEventListener("click", () => { if (replayed < events.length) replayed += 1; render(); });
  qs<HTMLButtonElement>(root, "[data-compact]")?.addEventListener("click", () => {
    const visible = events.slice(0, replayed).filter((event) => event.visible);
    const from = tailStart >= 0 ? tailStart : 0; // 已有 summary 时，在旧边界之上继续推进
    let next = Math.max(from, visible.length - 2);
    if (visible[next]?.pair === "result") next += 1;
    if (next > from && next < visible.length) tailStart = next;
    render();
  });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => {
    replayed = 0; budget = 0; tailStart = -1;
    qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
    render();
    if (status) status.textContent = "选择 context 预算";
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = "<li>重放 = 往 append-only log 追加事件；投影 = <code>deriveMessages()</code>。</li>";
  });
  render();
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
  initTheme();
  initSeriesNav();
  initReveal(reduced.matches);
  initNavMenu();
  initHeroPause();
  initLoop();
  initSessionProjection();
  initPromptAssembly();
  initContextProjection();
  initSafety();
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
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
