import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/openclaw.css";

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
    detail.innerHTML = `<span class="label-mono">FIRST EVIDENCE</span><h3>${item.title}</h3><p>${item.body}</p>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLoopStepper(): void {
  const root = document.querySelector("#oclaw-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = ["gateway.message_in", "run_attempt_begin", "agent_start", "message_end → turn_end", "tool_execution_end ×k", "steering_drain", "agent_end", "post_agent_run: settle", "agent_settled", "state_flushed"];
  const notes = [
    "Telegram 消息到达 Gateway；为该会话发起一次有界 run。",
    "runPreparedEmbeddedLoop while(true) 第 1 圈，beginRunAttempt（run-loop.ts:351），预算 = clamp(24+8×N, 32, 160)。",
    "runAgentPrompt 调 agent.prompt()；agent_start + 首个 turn_start（agent-loop.ts:228-229）。",
    "模型返回 tool call；shouldTerminateToolBatch=false，内层 while 继续。",
    "before/afterToolCall 钩子夹住每个工具；parallel/sequential 按 executionMode。",
    "用户 steer() 的消息在下一检查点 getSteeringAtCheckpoint（:76）注入内层。",
    "无更多 tool call 且队列空；内层→外层→agent_end（:523）。",
    "handlePostAgentRun：非重试、未触发压缩、无排队 → settled。",
    "finally 里 emit（agent-session-prompting.ts:47-48）；handoff 时跳过，外部投递接管。",
    "transcript / 状态已在 SQLite；进程不需要空转，等下一次唤醒。",
  ];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => {
    steps.forEach((item, i) => { item.classList.toggle("is-now", i === index); item.classList.toggle("is-done", i < index); });
    if (index >= 0) {
      const kind = index === 4 ? "tool" : index === 5 ? "user" : "sys";
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${kind}">${events[index]}</span></span>`);
      if (note) note.textContent = notes[index];
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察一条 Telegram 消息怎样穿过三层循环再回到睡眠。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

type RuleHit = { rule: number; hit: boolean; text: string; kind?: string };
function initDecisionMatrix(): void {
  const root = document.querySelector("#oclaw-decision");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const scenarios: Record<string, { intro: string; trace: RuleHit[]; verdict: string; tail: string }> = {
    handoff: {
      intro: "输入：endedForTurnHandoff = true",
      trace: [{ rule: 0, hit: true, text: "R1 ✓ endedForTurnHandoff（:57-60）→ 控制权移交外部投递方", kind: "tool" }],
      verdict: "handoff",
      tail: "不发 agent_settled：finally 里的 emit 只在非 handoff 时执行（:47）。",
    },
    abort: {
      intro: "输入：stopReason === \"aborted\"",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: true, text: "R2 ✓ 无消息或 aborted（:63-65）→ 收束", kind: "tool" },
      ],
      verdict: "settled",
      tail: "abort 走 stopIfAborted（agent-loop.ts:320）已把半截回合落进消息流。",
    },
    overloaded: {
      intro: "输入：overloaded 错误，retryCount 1/3",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: true, text: "R3 ✓ isRetryableError && prepareRetry（:68-70）→ 指数退避后续跑", kind: "tool" },
      ],
      verdict: "continue",
      tail: "退避 baseDelayMs * 2 ** (retryCount - 1)，与 provider Retry-After 取 max（agent-session-execution.ts:53/:59）。",
    },
    exhausted: {
      intro: "输入：错误且 retryCount ≥ maxRetries",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ prepareRetry 失败：已达 maxRetries（:68）", kind: "warn" },
        { rule: 3, hit: true, text: "R4 ✓ 发 auto_retry_end、清计数（:73-80）→ 落入 R5", kind: "tool" },
        { rule: 4, hit: false, text: "R5 ✗ 无需压缩" },
        { rule: 5, hit: false, text: "R6 ✗ 无排队（:85）→ settled" },
      ],
      verdict: "settled",
      tail: "成功响应即清零 retryCount（agent-session-base.ts:450-456）；重试开关在 willRetryAfterAgentEnd（:462-464）。",
    },
    overflow: {
      intro: "输入：msg = error(overflow)",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ 上下文溢出不算 retryable，交给 compaction（:18-21 注释）" },
        { rule: 3, hit: false, text: "R4 ✗ 不经过重试" },
        { rule: 4, hit: true, text: "R5 ✓ checkCompaction → runAutoCompaction(\"overflow\", true)（:353）→ continue", kind: "tool" },
      ],
      verdict: "continue",
      tail: "溢出压缩重试第 3 次后 MAX_OVERFLOW_COMPACTION_ATTEMPTS 封顶报错（:335-341）。",
    },
    queued: {
      intro: "输入：agent_end 钩子排了一条消息",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ 非错误" },
        { rule: 3, hit: false, text: "R4 ✗ 无重试" },
        { rule: 4, hit: false, text: "R5 ✗ 未触发压缩" },
        { rule: 5, hit: true, text: "R6 ✓ hasQueuedMessages（:85）→ agent.continue()", kind: "tool" },
      ],
      verdict: "continue",
      tail: "队列空才 settled——会话层的“跑完了吗”永远比内核的 agent_end 晚一步。",
    },
  };
  let timer = 0;
  const reset = () => {
    clearInterval(timer);
    steps.forEach((item) => item.classList.remove("is-now", "is-done"));
    if (log) log.innerHTML = "";
    if (phase) phase.textContent = "idle";
    led?.classList.remove("is-run", "is-done");
  };
  const play = (key: string) => {
    const data = scenarios[key];
    if (!data) return;
    reset();
    qsa<HTMLButtonElement>(root, "[data-scen]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.scen === key)));
    if (note) note.textContent = data.intro;
    led?.classList.add("is-run");
    let cursor = 0;
    const tick = () => {
      if (cursor >= data.trace.length) {
        clearInterval(timer);
        // 只点亮真正被评估到的闸门：短路径场景（handoff/abort）在 R1/R2 就短路，
        // 后面的规则从未跑过，不能标成 is-done。
        const last = data.trace[data.trace.length - 1];
        const reached = last ? last.rule + 1 : 0;
        steps.forEach((item, i) => { item.classList.remove("is-now"); item.classList.toggle("is-done", i < reached); });
        log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-user">裁决 → ${data.verdict}</span> <span class="t">${data.tail}</span></span>`);
        if (phase) phase.textContent = data.verdict;
        led?.classList.remove("is-run");
        led?.classList.add("is-done");
        return;
      }
      const hit = data.trace[cursor];
      steps.forEach((item, i) => { item.classList.toggle("is-done", i < hit.rule); item.classList.toggle("is-now", i === hit.rule); });
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-${hit.kind ?? "sys"}">${hit.text}</span></span>`);
      if (phase) phase.textContent = `rule R${hit.rule + 1} ${hit.hit ? "hit" : "pass"}`;
      cursor += 1;
    };
    tick();
    timer = window.setInterval(tick, 640);
  };
  qsa<HTMLButtonElement>(root, "[data-scen]").forEach((button) => button.addEventListener("click", () => play(button.dataset.scen ?? "")));
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initStateProjection(): void {
  const root = document.querySelector("#oclaw-state");
  if (!root) return;
  const state = { retry: 0, budget: 0, overflow: 0, transcript: 0, fires: 0 };
  const log = qs<HTMLElement>(root, "[data-log]");
  const render = (name?: string, note?: string, kind = "sys") => {
    const set = (selector: string, value: number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); };
    set("[data-events-retry]", state.retry); set("[data-budget]", state.budget); set("[data-overflow]", state.overflow); set("[data-transcript]", state.transcript); set("[data-fires]", state.fires);
    if (name) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-${kind}">${name}</span>${note ? ` <span class="t">${note}</span>` : ""}</span>`);
  };
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event;
    if (type === "reset") { state.retry = 0; state.budget = 0; state.overflow = 0; state.transcript = 0; state.fires = 0; if (log) log.innerHTML = ""; render(); return; }
    if (type === "message") { state.transcript += 1; render("message_in", "user 消息进 transcript_events", "user"); return; }
    if (type === "turn") { state.transcript += 1; render("turn_end", "assistant/tool 结果落库"); return; }
    if (type === "settle") { state.retry = 0; render("agent_settled", "finally emit（:47）；成功即清零 retryCount——状态已是事实源，进程可退"); return; }
    if (type === "recovery") { state.retry += 1; state.budget += 1; render("失败 attempt / auth", "retryCount+1 · 预算 recovery −1", "warn"); return; }
    if (type === "progress") { render("progress_continuation", "有进展的续跑：不扣预算（retry-budget.ts:35-36）", "model"); return; }
    if (type === "overflow") {
      if (state.overflow >= 3) { render("overflow 再压缩", "MAX_OVERFLOW_COMPACTION_ATTEMPTS=3 封顶 → 报错（:335-341）", "warn"); return; }
      state.overflow += 1; state.budget += 1; render("溢出压缩后重试", "压缩 +1 · 预算 −1（recovery）", "warn"); return;
    }
    if (type === "intent") {
      if (state.fires >= 3) { render("standing intent 命中", "DEFAULT_INTENT_MAX_FIRES=3 封顶，不再唤醒", "warn"); return; }
      state.fires += 1; render("standing intent 命中", "fires+1（24h cooldown / 90 天过期）", "model"); return;
    }
    if (type === "crash") {
      state.retry = 0; state.budget = 0; state.overflow = 0;
      render("进程崩溃", "内存计数归零；transcript / intents / automations 在 SQLite 里原样保留", "warn"); return;
    }
    if (type === "restart") { render("重启读账本", "新 run 读旧账本 + 唤醒源再点火——不是续跑半截 run", "sys"); return; }
  }));
}

function initBudgetBreaker(): void {
  const root = document.querySelector("#oclaw-budget");
  if (!root) return;
  let profiles = 2;
  let used = 0;
  let rlStreak = 0;
  let idleStreak = 0;
  let halted = false;
  const maxOf = (n: number) => Math.min(160, Math.max(32, 24 + 8 * Math.max(1, n)));
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const render = (line?: string, kind = "sys") => {
    const max = maxOf(profiles);
    const set = (selector: string, value: number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); };
    set("[data-max]", max); set("[data-used]", used); set("[data-remain]", Math.max(0, max - used)); set("[data-rl]", rlStreak); set("[data-idle]", idleStreak);
    const fill = qs<HTMLElement>(root, "[data-bar-fill]");
    if (fill) { fill.style.flexGrow = String(Math.min(used, max)); fill.classList.toggle("is-hot", used / max >= 0.75); }
    const remainder = qs<HTMLElement>(root, "[data-bar-tail]");
    if (remainder) remainder.style.flexGrow = String(Math.max(0, max - used));
    if (status) status.textContent = halted ? "断路器已跳闸" : `候选 profile = ${profiles}（profileCandidateCount）`;
    led?.classList.toggle("is-run", !halted);
    led?.classList.toggle("is-halt", halted);
    if (line) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-${kind}">${line}</span></span>`);
  };
  const charge = (label: string, kind = "warn") => {
    used += 1;
    render(label, kind);
    if (used >= maxOf(profiles)) {
      halted = true;
      render("isRunRetryBudgetExhausted → handleRetryLimitExhaustion（run-loop.ts:331）：有 fallback_model 抛 FailoverError 切模型继续；否则“Request failed after repeated internal retries”（retry-limit.ts:43）", "warn");
    }
  };
  const blocked = () => { if (halted) { render("断路器已跳闸：先重置再模拟下一局", "warn"); return true; } return false; };
  qsa<HTMLButtonElement>(root, "[data-evt]").forEach((button) => button.addEventListener("click", () => {
    const evt = button.dataset.evt;
    if (evt === "reset") { used = 0; rlStreak = 0; idleStreak = 0; halted = false; if (log) log.innerHTML = ""; render(); return; }
    if (blocked()) return;
    if (evt === "ok") { rlStreak = 0; idleStreak = 0; render("attempt 成功：retryCount 清零（agent-session-base.ts:450-456），连击计数复位", "model"); return; }
    if (evt === "rate") {
      rlStreak += 1;
      if (rlStreak <= 3) { render(`同模型 rate-limit 原地重试 ${rlStreak}/3 · 线性退避 ${rlStreak * 10}s（helpers.ts:48-51），与 Retry-After 取 max`, "warn"); return; }
      render("原地重试超 3 次 → 进入 profile 轮换"); rlStreak = 0; charge("profile 轮换：recovery −1"); return;
    }
    if (evt === "auth") { charge("auth 失败：recovery −1（retry-budget.ts:35）"); return; }
    if (evt === "switch") { charge("profile 轮换：recovery −1"); return; }
    if (evt === "compact") { charge("溢出压缩后重试：recovery −1（溢出走 compaction，不进会话重试）"); return; }
    if (evt === "progress") { render("progress_continuation：有进展的续跑，不扣预算（实现上先扣后退，retry-budget.ts:35-38）", "model"); return; }
    if (evt === "idle") {
      idleStreak += 1;
      if (idleStreak >= 5) { halted = true; render(`idle 连击 ${idleStreak}/5 → MAX_CONSECUTIVE_IDLE_TIMEOUTS_BEFORE_OUTPUT 断路器跳闸（idle-timeout-breaker.ts:16）`, "warn"); return; }
      render(`idle 无输出 ${idleStreak}/5（断路器尚未跳闸）`, "warn"); return;
    }
    if (evt === "wall") { halted = true; render("48h 墙钟到（timeout.ts:13；0 = 不限 sentinel 时此项不触发）→ run 终止", "warn"); return; }
  }));
  qsa<HTMLButtonElement>(root, "[data-profile] [data-v]").forEach((button) => button.addEventListener("click", () => {
    profiles = Number(button.dataset.v) || 1;
    qsa<HTMLButtonElement>(root, "[data-profile] [data-v]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render(`重算预算：max = clamp(24 + 8×${profiles}, 32, 160) = ${maxOf(profiles)}（helpers.ts:120-132）`, "model");
    if (!halted && used >= maxOf(profiles)) { halted = true; render("新预算已低于已耗 → isRunRetryBudgetExhausted 即刻跳闸（run-loop.ts:331）", "warn"); }
  }));
  render();
}

type WakeSourceInfo = { title: string; status: string; rows: Array<[string, string]> };
function initWakeSources(): void {
  const root = document.querySelector("#oclaw-wake");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const data: Record<string, WakeSourceInfo> = {
    chat: {
      title: "通道消息：最常见的那次唤醒",
      status: "Gateway 发出 · 新 run",
      rows: [
        ["发出还是订阅", "发出：<code>chat</code> 在 Gateway emit 面（docs/concepts/architecture.md:31）"],
        ["进入哪条 lane", "先会话道 <code>enqueueSession</code>（lane-controller.ts:205，run-orchestrator.ts:197 调用），再嵌套全局道 <code>enqueueGlobal</code>（:116，:209 调用）——双轨排队"],
        ["run 预算", "点火新 run：预算 <code>clamp(24+8N,32,160)</code> 另起；progress_continuation 不计费（retry-budget.ts:35-38）"],
      ],
    },
    heartbeat: {
      title: "heartbeat：活着就定期看一眼",
      status: "Gateway 发出 · 独立 run",
      rows: [
        ["发出还是订阅", "发出：<code>heartbeat</code> 在 emit 面（architecture.md:31）；调度在 <code>startHeartbeatRunner</code>（heartbeat-runner-scheduler.ts:62）"],
        ["进入哪条 lane", "心跳 run 与消息 run 走同一条双轨入队（run-orchestrator.ts:197/:209）"],
        ["run 预算", "每次心跳是独立 run：预算各计各的；单次超时与间隔挂钩、封顶 10 分钟（heartbeat-runner-config.ts:29）"],
      ],
    },
    cron: {
      title: "automations（旧名 cron）：到点再点火",
      status: "Gateway 发出 · 独立 run",
      rows: [
        ["发出还是订阅", "发出：<code>cron</code> 在 emit 面（architecture.md:31）；armTimer（timer-scheduler.ts:50）到点批处理 dueJobs（:183）"],
        ["进入哪条 lane", "agentTurn 作业到点后同样经会话道→全局道入队（run-orchestrator.ts:197/:209）"],
        ["run 预算", "新 run 新预算；墙钟普通 job 10 分钟、agentTurn 安全阀 60 分钟（timeout-policy.ts:10/:16）——时长红线不在预算里"],
      ],
    },
    intent: {
      title: "standing intent：不点火，只搭车",
      status: "既非发出也非订阅 · 不点火",
      rows: [
        ["发出还是订阅", "都不是：匹配挂在别的 run 里——<code>before_prompt_build</code> 钩子调 <code>matchStandingIntents</code>（memory-core/index.ts:288；standing-intents.ts:394），只在 <code>trigger === \"user\"</code> 时生效"],
        ["进入哪条 lane", "不入队、不开新 run；命中结果 prepend 进当前用户消息 run 的 prompt"],
        ["run 预算", "不消耗任何预算；24h cooldown / 最多 3 发 / 90 天过期（standing-intents.ts:12-14）是它自己的限量"],
      ],
    },
    tick: {
      title: "tick：连接的心跳，不是助理的心跳",
      status: "客户端订阅 · 不点火",
      rows: [
        ["发出还是订阅", "订阅：<code>tick</code> 在客户端订阅面（architecture.md:37），不在 emit 事件名里——这是最常见的误读"],
        ["进入哪条 lane", "不入 lane：它只是 WS 客户端订阅的节奏事件，用来感知连接活性"],
        ["run 预算", "永不点火：tick 不产生 run，也就永远碰不到预算"],
      ],
    },
  };
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = `<span class="label-mono">WAKE SOURCE</span><h3>${item.title}</h3><div class="stage-note">${item.rows.map(([term, value]) => `<span><strong>${term}</strong>　${value}</span>`).join("")}</div>`;
    if (status) status.textContent = item.status;
  }));
}

function initApprovalGates(): void {
  const root = document.querySelector("#oclaw-approval");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const gates = [
    { ev: "telegram inbound", kind: "user", text: "陌生 DM 按不可信输入处理；会话路由定位 conversation，排进 run。" },
    { ev: "agent → tool call: exec(\"rm -rf …\")", kind: "model", text: "模型提案危险 shell；执行前必须过 beforeToolCall 钩子（agent-core types.ts:54）。" },
    { ev: "ExecApprovalManager 裁决", kind: "sys", text: "ask 三态 off|on-miss|always（exec-approvals-config.ts:257-259）；默认 ask:\"off\" / askFallback:\"deny\"（:122-125）——off 根本不转发，危险命令要么直放要么直接拒，所以这条链要 ask:on-miss/always。" },
    { ev: "forward → Telegram", kind: "sys", text: "审批请求转发进频道（exec-approval-forwarder.ts）；reaction 批复由 plugin-sdk/approval-reaction-runtime.ts 承接。" },
    { ev: "await reaction ✓ / ✗", kind: "warn", text: "等用户在 Telegram 点 reaction——现在轮到你批：点「✓ 批复执行」或「✗ 批复拒绝」。" },
    { ev: "resolution → execute / block", kind: "sys", text: "决议回注，闸门开或关。" },
  ];
  let cursor = 0;
  let decided: string | null = null;
  const draw = () => {
    steps.forEach((item, i) => { item.classList.toggle("is-now", i === cursor); item.classList.toggle("is-done", i < cursor); });
  };
  const emit = (index: number, line: string) => {
    const g = gates[index];
    log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${g.kind}">${g.ev}</span> <span class="t">${line}</span></span>`);
  };
  const advance = () => {
    if (decided !== null) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-warn">本局已裁决，先「重置」再走一遍。</span></span>`); return; }
    if (cursor >= gates.length - 2) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-warn">停在 G5：批复未回，链不会自己走完。</span></span>`); return; }
    emit(cursor, gates[cursor].text);
    cursor += 1;
    if (cursor === 4) { emit(4, gates[4].text); cursor = 4; }
    draw();
    if (note) note.textContent = cursor === 4 ? "六道闸只欠一个 reaction。点 ✓ 或 ✗ 给出批复。" : gates[Math.min(cursor, 3)].text;
    if (status) status.textContent = `闸门 ${Math.min(cursor + 1, 6)}/6 · ${cursor === 4 ? "等待批复" : "推进中"}`;
    led?.classList.add("is-run");
    led?.classList.remove("is-done", "is-halt");
  };
  const verdict = (kind: "allow" | "deny") => {
    if (decided !== null) return;
    if (cursor < 4) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-warn">链还没走到 G5（审批转发进频道），先点「下一闸门」。</span></span>`); return; }
    decided = kind;
    cursor = 5;
    emit(5, kind === "allow"
      ? "批复 ✓：放行，工具执行，结果作为 tool result 回注 transcript。"
      : "批复 ✗：BeforeToolCallResult { block:true, reason }，由 loop 代投一条 error tool result（types.ts:51 注释）——命令从未执行，模型只见被拒结果。");
    steps.forEach((item, i) => { item.classList.toggle("is-done", i <= 4); item.classList.toggle("is-now", i === 5); });
    if (note) note.textContent = kind === "allow" ? "闸门全开：危险的不是 shell 本身，是没有裁决的 shell。" : "闸门落下：拒绝也是回注进 loop 的一等公民，模型会换路或认输。";
    if (status) status.textContent = kind === "allow" ? "闸门 6/6 · 已放行" : "闸门 6/6 · 已拒绝";
    led?.classList.remove("is-run");
    led?.classList.add(kind === "allow" ? "is-done" : "is-halt");
    qsa<HTMLButtonElement>(root, "[data-verdict]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.verdict === kind)));
  };
  const reset = () => {
    cursor = 0; decided = null;
    if (log) log.innerHTML = "";
    steps.forEach((item) => item.classList.remove("is-now", "is-done"));
    if (note) note.textContent = "一条要跑 rm -rf 的提案，逐闸门点过去，看它在哪一步被谁裁决。";
    if (status) status.textContent = "闸门 0/6 · idle";
    led?.classList.remove("is-run", "is-done", "is-halt");
    // 不碰 [data-reset]：它自己的 150ms 脉冲会被这里的同步清除杀掉
    qsa<HTMLButtonElement>(root, "[data-verdict], [data-gate]").forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
  };
  qs<HTMLButtonElement>(root, "[data-gate]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute("aria-pressed", "true");
    window.setTimeout(() => button.setAttribute("aria-pressed", "false"), 150);
    advance();
  });
  qsa<HTMLButtonElement>(root, "[data-verdict]").forEach((button) => button.addEventListener("click", () => verdict(button.dataset.verdict === "deny" ? "deny" : "allow")));
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute("aria-pressed", "true");
    window.setTimeout(() => button.setAttribute("aria-pressed", "false"), 150);
    reset();
  });
  draw();
}

type MemoryProjection = { title: string; status: string; rows: Array<[string, string]>; parts: number; tables: number; chars: string };
function initMemoryResume(): void {
  const root = document.querySelector("#oclaw-memory");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  let carrier = "";
  let wake = "";
  const wakeRow: Record<string, [string, string]> = {
    chat: ["本次点火", "用户消息 run + standing intent prepend：<code>before_prompt_build</code> 命中才注入（memory-core/index.ts:288；standing-intents.ts:394）"],
    heartbeat: ["本次点火", "心跳 prompt + <code>heartbeat_respond</code> 工具（heartbeat-tool-response.ts:10）；HEARTBEAT.md 属可选 bootstrap 面（types.agent-defaults.ts:24）"],
    dream: ["本次点火", "凌晨 \"0 3 * * *\" 固化后的第一次醒来（dreaming.ts:28）：检索命中的已是整理过的记忆"],
  };
  const render = () => {
    if (!carrier || !wake || !detail) return;
    const rows: Array<[string, string]> = [
      ["人格层", "<code>SOUL.md</code> / <code>USER.md</code> / <code>MEMORY.md</code> 每次 session 载入（agent-workspace.md:71-72）"],
    ];
    let tables = 0;
    let chars = "";
    if (carrier === "sqlite") {
      rows.push(
        ["账本事实", "<code>transcript_events</code> 最后落库事件（openclaw-agent-schema.sql:372）——崩溃恢复的唯一事实源"],
        ["检索索引", "<code>memory_index_chunks</code>（:524）+ <code>memory_embedding_cache</code>（:554），按需 <code>memory_search</code>（tools.ts:272）"],
        ["常驻意图", "<code>standing_intents</code> 表（:570）；注意旧 <code>commitments</code> 表 v7 已 retire（openclaw-state-db-contract.ts:6）"],
        ["全局审计", "<code>audit_events</code> 在全局 openclaw.sqlite（state/openclaw-state-schema.sql:154）"],
      );
      tables = 5;
      chars = "注入按需";
    } else {
      rows.push(
        ["日记文件", "<code>memory/YYYY-MM-DD.md</code> 最近 2 天预载（startup-context.ts:194/:293）"],
        ["字符预算", "单文件 1200 / 总量 2800 字符封顶（startup-context.ts:12-13）"],
        ["边界", "SQLite 账本仍是事实源；文件面只解决“醒来第一眼看到什么”"],
      );
      tables = 0;
      chars = "≤2800 字符";
    }
    rows.push(wakeRow[wake]);
    const projection: MemoryProjection = {
      title: `${carrier === "sqlite" ? "SQLite 账本" : "文件记忆"} × ${wake === "chat" ? "通道消息" : wake === "heartbeat" ? "heartbeat" : "dreaming 之后"}`,
      status: "唤醒 = 新 run：旧预算零消耗",
      rows, parts: rows.length, tables, chars,
    };
    detail.innerHTML = `<span class="label-mono">RESUME PROJECTION</span><h3>${projection.title}</h3><div class="stage-note">${projection.rows.map(([term, value]) => `<span><strong>${term}</strong>　${value}</span>`).join("")}</div>`;
    if (status) status.textContent = projection.status;
    const set = (selector: string, value: string | number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); };
    set("[data-parts]", projection.parts);
    set("[data-tables]", projection.tables);
    set("[data-chars]", projection.chars);
    set("[data-budget]", 0);
  };
  qsa<HTMLButtonElement>(root, "[data-carrier] [data-v]").forEach((button) => button.addEventListener("click", () => {
    carrier = button.dataset.v ?? "";
    qsa<HTMLButtonElement>(root, "[data-carrier] [data-v]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render();
  }));
  qsa<HTMLButtonElement>(root, "[data-wake] [data-v]").forEach((button) => button.addEventListener("click", () => {
    wake = button.dataset.v ?? "";
    qsa<HTMLButtonElement>(root, "[data-wake] [data-v]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render();
  }));
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
  initLoopStepper();
  initDecisionMatrix();
  initStateProjection();
  initBudgetBreaker();
  initWakeSources();
  initApprovalGates();
  initMemoryResume();
  initSurface("#oclaw-surface", {
    telegram: [["协议角色", "Gateway 宿主侧通道扩展（grammY）"], ["消息进出", "inbound debounce → 会话路由 → run；outbound 走通道插件"], ["审批与交互", "exec 审批转发进聊天，文本 / reaction 批复"], ["断线语义", "Gateway 在则助理在“睡”，run 仍由唤醒驱动"]],
    discord: [["协议角色", "Gateway 通道扩展"], ["消息进出", "同 Telegram + reaction 审批"], ["审批与交互", "频道内批复与 reaction"], ["断线语义", "同左：断的是通道，不是内核"]],
    ui: [["协议角色", "WS 客户端（127.0.0.1:18789）"], ["消息进出", "聊天历史读写走 Gateway WS"], ["审批与交互", "审批面板 + ask_user 回答框"], ["断线语义", "纯客户端，断线无状态损失"]],
    cli: [["协议角色", "WS 客户端"], ["消息进出", "同左，TUI 渲染器复用会话工具"], ["审批与交互", "交互式提示"], ["断线语义", "同左：状态在 Gateway 与 SQLite，不在这个进程"]],
    macos: [["协议角色", "WS 客户端（control-plane）"], ["消息进出", "同左 + canvas.* 部件命令"], ["审批与交互", "系统通知 + 审批"], ["断线语义", "node 配对重连（device pairing store）"]],
  });
  initChoiceDetail("#oclaw-atlas", {
    silent: { title: "先分清死亡与长眠", body: "跨天存活本来就靠“不跑”实现：run 有界，结束即落库等唤醒。先查 <code>openclaw gateway status</code> 与 cron 是否 arm（armTimer，timer-scheduler.ts:50），再看 heartbeat 是否在 active hours 内。", status: "设计如此" },
    expensive: { title: "run 重试预算在吃失败 attempt", body: "预算只计失败 / recovery（retry-budget.ts:35），“有进展的续跑”progress_continuation 不吃预算；若每次都在涨，看 handleRetryLimitExhaustion（run-loop.ts:331）前的 profile 轮换与 auto_retry_end 事件。", status: "需配置" },
    dreaming: { title: "Memory Dreaming 到点固化", body: "默认 cron \"0 3 * * *\"（dreaming.ts:28）做 consolidation；dreaming-consolidation.ts / dreaming-phases.ts 是阶段实现；频率可配。", status: "设计如此" },
    loopy: { title: "工具循环检测默认关", body: "tool-loop-detection.ts:54 enabled:false，opt-in 后才有 warn10（:56）/ critical20（:51）/ breaker30（:52）；默认唯一兜底是 compaction 后窗口守卫（window 3）与 idle 断路器 5——它们都不是防重复调用的。", status: "默认关闭" },
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
