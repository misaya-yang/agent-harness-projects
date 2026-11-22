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
  const events = ["agent_start", "turn_start", "message_start/end: user", "transformContext → convertToLlm", "start → delta* → done", "message_end: assistant", "tool_execution_start/update/end", "message_start/end: toolResult", "turn_end → turn_start → assistant message_end → turn_end", "agent_end"];
  const notes = ["一次 Agent run 开始。", "Pi 的 Turn 是一次模型调用加工具批次。", "用户消息先进入 Agent transcript。", "应用消息在 LLM 边界转换成标准 Message。", "Provider events 用 contentIndex 关联交错 block。", "Committed assistant message 是工具 preflight 的 barrier。", "Tool body 可并发，生命周期事件仍可观察。", "最终 ToolResult transcript 按模型 source order 写入。", "工具结果促成第二次模型请求。本例第二次直接给出答案，队列为空。", "agent_end 是核心循环结束信号，基础 Agent 仍等待结束监听器。"];
  let index = -1; let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]"); const note = qs<HTMLElement>(root, "[data-note]"); const phase = qs<HTMLElement>(root, "[data-phase]"); const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => { steps.forEach((item, i) => { item.classList.toggle("is-now", i === index); item.classList.toggle("is-done", i < index); }); if (index >= 0) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 6 || index === 7 ? "tool" : "sys"}">${events[index]}</span></span>`); if (note) note.textContent = notes[index]; } if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`; led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1); led?.classList.toggle("is-done", index === steps.length - 1); };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "观察 Provider event 怎样被提升为 Agent lifecycle。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step); qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 520); }); qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset); window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initState(): void {
  const root = document.querySelector("#pi-state");
  if (!root) return;
  let phase: "idle" | "draft" | "message" | "tool" | "result" | "settling" = "idle";
  let messages = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");

  const render = (event?: string, note?: string) => {
    const counters = {
      streaming: phase === "idle" ? "NO" : "YES",
      messages,
      tools: phase === "tool" ? 1 : 0,
    };
    for (const [name, value] of Object.entries(counters)) {
      const counter = qs<HTMLElement>(root, `[data-${name}]`);
      if (counter) counter.textContent = String(value);
    }
    if (status) status.textContent = phase;
    led?.classList.toggle("is-run", phase !== "idle");
    if (event && log) {
      const line = document.createElement("span");
      line.className = "ev";
      line.textContent = note ? `${event} · ${note}` : event;
      log.append(line);
    }
  };

  qsa<HTMLButtonElement>(root, "[data-state-event]").forEach((button) => button.addEventListener("click", () => {
    const event = button.dataset.stateEvent;
    if (event === "reset") {
      phase = "idle";
      messages = 0;
      log?.replaceChildren();
      render();
      return;
    }
    if (event === "idle" && phase === "settling") {
      phase = "idle";
      render("idle", "等待型监听器已完成，waitForIdle() 可返回");
    } else if (event === "agent_end" && phase === "message") {
      phase = "settling";
      render(event, "循环结束，运行状态仍在等待监听器");
    } else if (event === "message_start" && (phase === "idle" || phase === "message")) {
      phase = "draft";
      render(event, "partial 进入 streamingMessage");
    } else if (event === "message_update" && phase === "draft") {
      render(event, "更新 partial，消息数不变");
    } else if (event === "message_end" && phase === "draft") {
      phase = "message";
      messages += 1;
      render(event, "清除 partial，将消息追加到 Agent 内存状态");
    } else if (event === "tool_start" && phase === "message") {
      phase = "tool";
      render("tool_execution_start", "调用进入处理流程，工具体可能尚未执行");
    } else if (event === "tool_end" && phase === "tool") {
      phase = "result";
      render("tool_execution_end", "调用结束通知，结果消息仍待写入");
    } else if (event === "tool_result" && phase === "result") {
      phase = "message";
      messages += 1;
      render("message_start → message_end · toolResult", "工具结果成为下一次请求的历史");
    } else {
      render(phase === "settling" ? "先等监听器完成" : "当前阶段还不能发出这个事件");
    }
  }));
}

function initQueues(): void {
  const root = document.querySelector("#pi-queues"); if (!root) return;
  let stage: "idle" | "tool" | "model" | "aborting tool" | "aborting model" = "idle";
  let steer = 0;
  let follow = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");

  const render = (note?: string) => {
    const counters = { tool: stage === "tool" ? "running" : stage === "aborting tool" ? "cancel requested" : "idle", steer, follow };
    for (const [name, value] of Object.entries(counters)) {
      const counter = qs<HTMLElement>(root, `[data-${name}]`);
      if (counter) counter.textContent = String(value);
    }
    if (phase) phase.textContent = stage === "idle" && (steer || follow) ? "queued" : stage;
    led?.classList.toggle("is-run", stage !== "idle");
    if (note && log) {
      const line = document.createElement("span");
      line.className = "ev";
      line.textContent = note;
      log.append(line);
    }
  };

  qsa<HTMLButtonElement>(root, "[data-queue]").forEach((button) => button.addEventListener("click", () => {
    switch (button.dataset.queue) {
      case "reset":
        stage = "idle";
        steer = 0;
        follow = 0;
        log?.replaceChildren();
        render();
        return;
      case "start":
        if (stage !== "idle" && stage !== "model") return;
        stage = "tool";
        render("模型发出调用，工具批次开始。");
        return;
      case "steer":
        steer += 1;
        render("Steer 入队，已经开始的工具继续运行。");
        return;
      case "follow":
        follow += 1;
        render("Follow-up 入队，等待当前任务自然收口。");
        return;
      case "abort":
        if (stage !== "tool" && stage !== "model") return;
        stage = stage === "tool" ? "aborting tool" : "aborting model";
        render("已发取消信号，仍需等待当前执行体响应。");
        return;
      case "turn":
        if (stage === "aborting tool") {
          stage = "idle";
          render("本例工具响应了取消，run 结束。已发生的副作用还需核对。");
          return;
        }
        if (stage !== "tool") return;
        stage = "model";
        if (steer > 0) {
          steer -= 1;
          render("结果按序写入，下一次模型请求同时带入一条 Steer。");
        } else {
          render("结果按序写入，下一次模型请求先处理工具结果，Follow-up 等待。");
        }
        return;
      case "answer":
        if (stage === "aborting model") {
          stage = "idle";
          render("本例模型流以 aborted 结束。");
          return;
        }
        if (stage !== "model") return;
        if (steer > 0) {
          steer -= 1;
          render("本轮无新工具，仍有 Steer，下一请求带入一条。");
        } else if (follow > 0) {
          follow -= 1;
          render("当前任务自然收口，取一条 Follow-up 开始下一轮。");
        } else {
          stage = "idle";
          render("本轮无新工具，队列为空，run 结束。");
        }
    }
  }));
}

function initTools(): void {
  const root = document.querySelector("#pi-tools"); if (!root) return;
  let mode = "parallel";
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-mode] button").forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.v ?? "parallel";
    qsa<HTMLButtonElement>(root, "[data-mode] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (status) status.textContent = button.textContent;
  }));
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => {
    if (log) log.innerHTML = "";
    const lines = mode === "length"
      ? ["stopReason: length", "start slow_read → end · body 未执行", "transcript: slow_read 错误结果", "start fast_grep → end · body 未执行", "transcript: fast_grep 错误结果"]
      : mode === "parallel"
        ? ["start slow_read · 参数校验", "start fast_grep · 参数校验", "执行两个获准的工具", "end fast_grep", "end slow_read", "transcript: slow_read result", "transcript: fast_grep result"]
        : ["start slow_read · 校验后执行", "end slow_read", "transcript: slow_read result", "start fast_grep · 校验后执行", "end fast_grep", "transcript: fast_grep result"];
    lines.forEach((line, index) => log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${line.startsWith("transcript") ? "sys" : "tool"}">${line}</span></span>`));
  });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => { if (log) log.innerHTML = ""; });
}

function initSessionTree(): void {
  const root = document.querySelector("#pi-session");
  if (!root) return;

  type Entry = { id: number; parent: number | null } & (
    | { kind: "message" | "call" | "result" }
    | { kind: "context_edit" | "compaction"; target: number }
  );
  const entries: Entry[] = [];
  const tips = new Set<number>();
  const log = qs<HTMLElement>(root, "[data-log]");
  let leaf: number | null = null;

  const getPath = (): Entry[] => {
    const path: Entry[] = [];
    for (let id = leaf; id !== null; id = entries[id - 1].parent) path.push(entries[id - 1]);
    return path.reverse();
  };

  const getProjection = (path: Entry[]): Entry[] => {
    const compacted = path.slice().reverse().find((entry) => entry.kind === "compaction");
    const start = compacted?.kind === "compaction" ? path.findIndex((entry) => entry.id === compacted.target) : 0;
    const selected = path.slice(start);
    const omitted = new Set(selected.flatMap((entry) => entry.kind === "context_edit" ? [entry.target] : []));
    const kept = selected.filter((entry) =>
      entry.kind !== "context_edit" && entry.kind !== "compaction" && !omitted.has(entry.id),
    );
    return compacted ? [compacted, ...kept] : kept;
  };

  const append = (change: { kind: "message" | "call" | "result" } | { kind: "context_edit" | "compaction"; target: number }) => {
    const entry = { ...change, id: entries.length + 1, parent: leaf };
    entries.push(entry);
    if (leaf !== null) tips.delete(leaf);
    tips.add(entry.id);
    leaf = entry.id;
    return entry.id;
  };

  const render = (message?: string) => {
    const projection = getProjection(getPath());
    const counts = { entries: entries.length, branches: Math.max(1, tips.size), context: projection.length };
    for (const [name, value] of Object.entries(counts)) {
      const counter = qs<HTMLElement>(root, `[data-${name}]`);
      if (counter) counter.textContent = String(value);
    }
    if (message && log) {
      const line = document.createElement("span");
      line.className = "ev";
      const visible = projection.map((entry) => entry.kind === "compaction" ? "摘要" : `e${entry.id}`);
      line.textContent = `${message} · 模型可见 ${visible.join(" → ") || "空"}`;
      log.append(line);
    }
  };

  qsa<HTMLButtonElement>(root, "[data-tree]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.tree;
    if (action === "reset") {
      entries.length = 0;
      tips.clear();
      leaf = null;
      log?.replaceChildren();
      render();
      return;
    }
    if (action === "message") {
      render(`e${append({ kind: "message" })} · message 追加到当前 leaf`);
    } else if (action === "tool") {
      const call = append({ kind: "call" });
      const result = append({ kind: "result" });
      render(`e${call} tool call → e${result} toolResult`);
    } else if (action === "branch") {
      const path = getPath();
      // Only touch the active pointer. A later append creates the new branch.
      leaf = path[0]?.id ?? null;
      render(leaf === null ? "先追加一条消息" : `leaf 移到 e${leaf}，原分支仍在`);
    } else if (action === "omit") {
      const target = getProjection(getPath()).reverse().find((entry) => entry.kind === "message");
      render(target
        ? `e${append({ kind: "context_edit", target: target.id })} · 省略 e${target.id}，原 entry 可回读`
        : "先追加一条可省略的消息");
    } else if (action === "compact") {
      const projection = getProjection(getPath()).filter((entry) => entry.kind !== "compaction");
      const retained = projection.slice(-2);
      const firstKept = retained.find((entry) => entry.kind !== "result");
      render(firstKept && firstKept !== projection[0]
        ? `e${append({ kind: "compaction", target: firstKept.id })} · 摘要 + firstKeptEntryId=e${firstKept.id}`
        : "没有新的历史前缀可压缩，当前投影不变");
    }
  }));
}

function initCompaction(): void {
  const root = document.querySelector("#pi-compaction"); if (!root) return;
  type CpEntry = { id: string; kind: "user" | "assistant" | "tool"; tokens: number };
  const WINDOW = 65536; const KEEP = 20000; const SUMMARY = 1200; const LABEL = { user: "u", assistant: "a", tool: "tr" };
  let reserve = 16384; let seq = 0; let entries: CpEntry[] = []; let keptFrom = -1; let compactions = 0;
  const log = qs<HTMLElement>(root, "[data-log]"); const strip = qs<HTMLElement>(root, "[data-strip]"); const status = qs<HTMLElement>(root, "[data-status]"); const led = qs<HTMLElement>(root, "[data-led]");
  const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
  const tokensFrom = (index: number) => entries.slice(index).reduce((sum, entry) => sum + entry.tokens, 0);
  const total = () => tokensFrom(0);
  const projectedTotal = () => keptFrom >= 0 ? SUMMARY + tokensFrom(keptFrom) : total();
  const line = (note: string, cls = "k-sys") => log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="${cls}">${note}</span></span>`);
  const render = () => {
    const ctx = total(); const projected = projectedTotal();
    const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; };
    set("[data-entries]", String(entries.length + compactions)); set("[data-tokens]", k(ctx)); set("[data-projected]", k(projected));
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
    if (action === "reset") { reserve = 16384; seq = 0; entries = []; keptFrom = -1; compactions = 0; if (log) log.innerHTML = ""; qsa<HTMLButtonElement>(root, "[data-reserve] button").forEach((candidate) => candidate.setAttribute("aria-pressed", "false")); render(); return; }
    if (action === "heavy" || action === "light") { const tool = action === "heavy" ? 26000 : 2400; entries.push({ id: `e${++seq}`, kind: "user", tokens: 420 }, { id: `e${++seq}`, kind: "assistant", tokens: 1800 }, { id: `e${++seq}`, kind: "tool", tokens: tool }); line(`turn 追加：u 0.4k + a 1.8k + toolResult ${k(tool)}，context=${k(projectedTotal())}${keptFrom >= 0 ? "（落在 firstKept 之后，投影随之增长）" : ""}`); render(); return; }
    if (action === "compact") {
      if (!entries.length) { line("空 transcript，无可压缩段", "k-warn"); return; }
      const ctx = projectedTotal(); const threshold = WINDOW - reserve;
      line(`shouldCompact(${k(ctx)}, ${k(WINDOW)}, reserve ${k(reserve)}) → ${ctx > threshold ? "true" : "false"}`, ctx > threshold ? "k-tool" : "k-warn");
      if (ctx <= threshold) line("未达阈值：auto-compaction 不触发；这次走手动 AgentSession.compact()");
      const start = Math.max(0, keptFrom);
      let accumulated = 0;
      let cut = start;
      for (let index = entries.length - 1; index >= start; index -= 1) {
        accumulated += entries[index].tokens;
        if (accumulated < KEEP) continue;
        cut = index;
        while (cut < entries.length && entries[cut].kind === "tool") cut += 1;
        if (cut === entries.length) {
          cut = index;
          while (cut > start && entries[cut].kind === "tool") cut -= 1;
        }
        break;
      }
      if (cut <= start) { line("没有更早的段可摘要，投影不变", "k-warn"); render(); return; }
      keptFrom = cut;
      compactions += 1;
      line(`预算约 ${k(KEEP)}。首个保留条目为 ${entries[cut].id}，历史保留的工具结果仍有对应调用。`);
      line("摘要输入：单个 tool result 截到 2000 字符；不声明工具，cacheRetention none");
      line(`appendCompaction：firstKeptEntryId=${entries[cut].id}，tokensBefore=${k(ctx)}；追加一条 compaction，旧 entry 仍在 JSONL`);
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
  initChoiceDetail("#pi-layers", { provider: { title: "模型适配层", body: "例如同一张图片只在纯文本模型被拒绝，先检查该模型的图片能力和实际请求，再看循环。", status: "PI AI" }, loop: { title: "Agent 循环层", body: "工具已经结束却没有下一轮时，核对工具结果是否写入、是否整批 terminate，以及队列是否仍有输入。", status: "AGENT CORE" }, session: { title: "会话投影层", body: "核对当前 leaf、父子关系与压缩边界，确认恢复出的活动路径是否正确。", status: "SESSION TREE" }, render: { title: "终端呈现层", body: "比较前后帧、可用宽度与完整重绘条件；画面异常不等于 Agent 状态异常。", status: "TUI" } });
  initSurface("#pi-providers", { anthropic: [["统一层", "Model + Context + AssistantMessageEventStream"], ["Adapter", "system block、thinking signature、tool_result"], ["Auth", "Provider auth resolution"], ["Wire", "支持 Message Threads 时，前缀匹配则只发新消息"]], openai: [["统一层", "同一 Agent / Pi AI contracts"], ["Adapter", "system/developer role、image URL、tool ids"], ["Compat", "endpoint-specific stop/toolUse mapping"], ["Wire", "OpenAI-compatible streaming"]], google: [["统一层", "同一 provider-neutral events"], ["Adapter", "Google content parts 与 reasoning options"], ["模型", "catalog 由 Provider 提供"], ["Wire", "Google API-specific payload"]], faux: [["用途", "确定性测试"], ["响应", "scripted tool call / text / error"], ["网络", "不访问真实 Provider"], ["证据", "验证标准事件与最终 Message"]] });
  initChoiceDetail("#pi-extensions", { tool: { title: "ExtensionAPI.registerTool", body: "注册 TypeBox schema、execute、progress 与 TUI renderers；工具执行异常会变成 isError 结果，参数校验和调用前政策也能生成错误结果。" }, skill: { title: "ResourceLoader + Skill", body: "System Prompt 先暴露 name/description，模型按需用 read 加载完整 SKILL.md。" }, hook: { title: "tool_call event", body: "执行前可改参数或 block。文件、网络和进程权限由宿主环境控制。" }, state: { title: "Session custom entry", body: "custom 持久扩展状态但不进 LLM；custom_message 才会进入 context。" } });
  initSurface("#pi-mcp-exposure", {
    codemode: [["模型工具清单", "默认没有该 MCP 工具声明"], ["调用路径", "默认启用 Codemode 后，脚本可查找并调用。若 tool_search 已启用，它也可以激活该工具"], ["边界", "脚本受 QuickJS 限制，宿主工具仍按真实权限执行"]],
    deferred: [["模型工具清单", "开始时没有，tool_search 激活后下一次请求可见"], ["调用路径", "搜索激活后模型可直接调用。已启用的 Codemode 脚本在搜索前也可访问"], ["恢复", "已激活的工具声明跟随当前分支"]],
    direct: [["模型工具清单", "连接并准备好后直接声明"], ["调用路径", "模型或 Codemode 脚本都可调用"], ["取舍", "模型立即看到 schema，工具越多上下文越长"]],
    hidden: [["模型工具清单", "没有声明"], ["调用路径", "已注册但模型和脚本均无法调用"], ["配置", "可以用 toolExposure 为单个工具配置不同方式"]],
  });
  initSurface("#pi-surfaces", {
    sdk: [["消费者", "Node / TypeScript 应用"], ["入口", "createAgentSession"], ["进程", "同进程"], ["状态", "AgentSession + SessionManager"]],
    json: [["消费者", "一次性脚本与观察器"], ["入口", "--mode json"], ["协议", "逐行会话事件"], ["控制", "单次运行，没有命令入口"]],
    rpc: [["消费者", "IDE / 跨语言子进程"], ["分帧", "LF-only JSONL"], ["响应", "started 开始，queued 入队，handled 由扩展消费"], ["结束信号", "先订阅，started 或 queued 时继续读到 agent_settled"]],
    durable: [["消费者", "需要恢复运行的应用"], ["入口", "Harness.open() / resume()"], ["恢复点", "任务从已提交 checkpoint 恢复。中断的工具按 replay 策略处理"], ["防重复提交", "同一 conversation 与 requestId 找回原 submission。外部效果另需幂等"]],
    chord: [["消费者", "跨宿主插件与应用"], ["状态", "contract、引用与文档事务"], ["p2", "实验性的自托管 Durable UI"], ["p3", "Chord v2 上的 headless server，按会话开 worker"]],
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
