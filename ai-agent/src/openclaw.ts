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
  const events = ["gateway.message_in", "run_attempt_begin", "agent_start", "assistant tool call", "tool_execution_end ×k", "steering_drain", "agent_end", "post_agent_run: settle", "agent_settled", "persisted session state"];
  const notes = [
    "Telegram 消息经 Gateway 路由，先由对应会话的 mailbox 准入。",
    "外层 runner 开始第一个 attempt，并为失败恢复建立独立预算。",
    "session 层启动 logical prompt；内层广播 agent_start 与首个 turn_start。",
    "模型提出工具调用；本例工具结果允许内层继续。",
    "工具通过执行入口和钩子，再按批次的并行或串行约束执行。",
    "在检查点消费已接受的插话。顺序批的未开始尾部可跳过，已启动调用保留结果。",
    "模型已答完，工具与输入队列均已处理，内核发出 agent_end。",
    "handlePostAgentRun：非重试、未触发压缩、无排队 → settled。",
    "这里发 agent_settled，移交路径会发独立的 agent_handoff。",
    "持久转录保留已经提交的事件，会话等待下次输入。",
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
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察一条 Telegram 消息怎样穿过三层循环，并结束这轮任务。"; draw(); };
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
      trace: [{ rule: 0, hit: true, text: "R1 ✓ endedForTurnHandoff→ 控制权移交外部投递方", kind: "tool" }],
      verdict: "handoff",
      tail: "会话发出 agent_handoff，后续投递由外部所有者处理。",
    },
    abort: {
      intro: "输入：stopReason === \"aborted\"",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: true, text: "R2 ✓ 无消息或 aborted→ 收束", kind: "tool" },
      ],
      verdict: "settled",
      tail: "abort 会把半截回合以 aborted 结果落进消息流，不能假装本轮从未发生。",
    },
    overloaded: {
      intro: "输入：overloaded 错误，仍有会话重试配额",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: true, text: "R3 ✓ isRetryableError && prepareRetry→ 指数退避后续跑", kind: "tool" },
      ],
      verdict: "continue",
      tail: "本例使用会话级退避。服务端若给出可接受的短期等待建议，会取建议与退避延迟中的较长值。",
    },
    exhausted: {
      intro: "输入：错误且 retryCount ≥ maxRetries",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ prepareRetry 失败：该层恢复预算已耗尽", kind: "warn" },
        { rule: 3, hit: true, text: "R4 ✓ 发 auto_retry_end、清理该层计数 → 落入 R5", kind: "tool" },
        { rule: 4, hit: false, text: "R5 ✗ 无需压缩" },
        { rule: 5, hit: false, text: "R6 ✗ 仍是错误，排队输入由执行所有者处理 → settled" },
      ],
      verdict: "settled",
      tail: "成功响应会清零会话重试连击；是否还要继续由收束裁决统一决定。",
    },
    overflow: {
      intro: "输入：msg = error(overflow)",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ 上下文溢出交给 compaction" },
        { rule: 3, hit: false, text: "R4 ✗ 不经过重试" },
        { rule: 4, hit: true, text: "R5 ✓ overflow 进入自动压缩恢复 → continue", kind: "tool" },
      ],
      verdict: "continue",
      tail: "会话拥有 overflow 恢复时最多三次。若由外层 attempt 接管，使用对应外层策略。",
    },
    queued: {
      intro: "输入：agent_end 钩子排了一条消息",
      trace: [
        { rule: 0, hit: false, text: "R1 ✗ 非 handoff" },
        { rule: 1, hit: false, text: "R2 ✗ 有消息、未 abort" },
        { rule: 2, hit: false, text: "R3 ✗ 非错误" },
        { rule: 3, hit: false, text: "R4 ✗ 无重试" },
        { rule: 4, hit: false, text: "R5 ✗ 未触发压缩" },
        { rule: 5, hit: true, text: "R6 ✓ 仍有排队消息 → agent.continue()", kind: "tool" },
      ],
      verdict: "continue",
      tail: "本例响应成功。内核结束后新排入的消息由会话层续跑。",
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
    if (type === "settle") { render("agent_settled", "这里只显示会话收束。已提交的事件在这之前已有各自的落库结果。"); return; }
    if (type === "session-retry") { state.retry += 1; render("auto_retry_start", "会话 retryCount +1", "warn"); return; }
    if (type === "recovery") { state.budget += 1; render("外层失败 attempt", "外层计数 +1", "warn"); return; }
    if (type === "progress") { render("progress_continuation", "有进展的续跑不占用失败恢复预算", "model"); return; }
    if (type === "overflow") {
      if (state.overflow >= 3) { render("overflow 再压缩", "溢出恢复上限已到 → 显形报错，阻止压缩死循环", "warn"); return; }
      state.overflow += 1; render("会话溢出压缩后重试", "会话溢出恢复计数 +1", "warn"); return;
    }
    if (type === "intent") {
      if (state.fires >= 3) { render("standing intent 命中", "示例意图已到默认 3 次上限，本次不再注入", "warn"); return; }
      state.fires += 1; render("standing intent 命中", "假定这次命中已满足冷却与有效期条件，持久触发数加 1。", "model"); return;
    }
    if (type === "crash") {
      state.retry = 0; state.budget = 0; state.overflow = 0;
      render("进程崩溃", "进程计数丢失，已提交的转录事件和意图状态可读。未决工具的外部结果还需确认。", "warn"); return;
    }
    if (type === "restart") { render("重启读账本", "本例假定运行落在崩溃时间窗内、无活动执行者，并通过范围和权限检查。Gateway 投递恢复输入，助手先核实未决动作。", "sys"); return; }
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
      render("run 重试预算耗尽：有 fallback 就切换模型；没有可用候选则向用户显形失败", "warn");
    }
  };
  const reset = (message?: string) => {
    used = 0;
    rlStreak = 0;
    idleStreak = 0;
    halted = false;
    log?.replaceChildren();
    render(message);
  };
  qsa<HTMLButtonElement>(root, "[data-evt]").forEach((button) => button.addEventListener("click", () => {
    const evt = button.dataset.evt;
    if (evt === "reset") {
      reset();
      return;
    }
    if (halted) {
      render("本次运行已停止，请重置后再试。", "warn");
      return;
    }
    if (evt === "ok") { used = 1; rlStreak = 0; idleStreak = 0; render("已完成的模型响应：外层连续计数重置为 1，限流与空闲连击清零", "model"); return; }
    if (evt === "rate") {
      rlStreak += 1;
      if (rlStreak < 16) {
        charge(`第 ${rlStreak} 次限流失败。若允许同模型重试，按带抖动的退避等待。采纳 Retry-After 时还须检查剩余时间。`);
        return;
      }
      charge("原地限流分支已到示例上限。策略可轮换凭证、切候选模型或返回错误。");
      rlStreak = 0;
      return;
    }
    if (evt === "auth") { charge("auth 失败：消耗一次 recovery 预算"); return; }
    if (evt === "switch") { charge("profile 轮换：后续 attempt 计入外层预算"); return; }
    if (evt === "compact") { charge("外层溢出恢复：重试 attempt 计入外层预算"); return; }
    if (evt === "progress") { render("progress_continuation：有进展的推进，不占用失败恢复预算", "model"); return; }
    if (evt === "idle") {
      idleStreak += 1;
      if (idleStreak >= 5) { halted = true; render(`idle 连击 ${idleStreak}/5 → 活性断路器跳闸，停止继续消耗`, "warn"); return; }
      render(`idle 无输出 ${idleStreak}/5（断路器尚未跳闸）`, "warn"); return;
    }
    if (evt === "wall") { halted = true; render("此模拟启用 48 小时默认墙钟。到达时结束 run。", "warn"); return; }
  }));
  qsa<HTMLButtonElement>(root, "[data-profile] [data-v]").forEach((button) => button.addEventListener("click", () => {
    const selected = Number(button.dataset.v);
    if (profiles === selected) return;
    profiles = selected;
    qsa<HTMLButtonElement>(root, "[data-profile] [data-v]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    reset(`开始新的模拟运行，候选凭证数 ${profiles}，尝试上限 ${maxOf(profiles)}。`);
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
      status: "通道入口 · 会话准入",
      rows: [
        ["是不是唤醒", "Gateway 将通道输入路由到目标会话。空闲时可起跑，活跃时按会话策略 steering 或排队。"],
        ["进入哪条队列", "同一物理会话共享 mailbox，独立回合再争取全局并发容量。"],
        ["怎么计预算", "新 run 建自己的 attempt 账本。插话复用活跃 run 的预算。"],
      ],
    },
    heartbeat: {
      title: "Proactive check：普通巡检作业",
      status: "Automations · 默认禁用",
      rows: [
        ["是不是唤醒", "启用后由 Automations 按约定节奏触发，首次设置通常提供 30 分钟间隔。"],
        ["进入哪条队列", "默认巡检等主会话空闲；旧 heartbeat monitor 已迁为普通作业。"],
        ["怎么计预算", "按照作业类型、会话和 timeoutSeconds 配置应用普通自动化预算。"],
      ],
    },
    cron: {
      title: "automations（旧名 cron）：到点再点火",
      status: "Gateway 发出 · 独立 run",
      rows: [
        ["是不是唤醒", "是：持久计划到点后被调度器认领。agentTurn 执行模型回合，command/script 作业走自己的入口。"],
        ["进入哪条队列", "到期作业仍须取得调度容量。模型型作业按配置使用主会话或专用会话。"],
        ["怎么计预算", "模型型作业的 run 有自身治理。默认作业墙钟是 agentTurn 60 分钟，其它作业 10 分钟。"],
      ],
    },
    intent: {
      title: "Standing intent：在用户回合中匹配",
      status: "提示词钩子 · 复用当前回合",
      rows: [
        ["是不是唤醒", "对符合条件的用户触发回合做关键词匹配，命中后把提示放入当前上下文。"],
        ["进入哪条 lane", "与当前回合共用会话和执行位置。"],
        ["怎么计预算", "用当前回合的执行预算，匹配另有冷却、触发次数与过期限制。"],
      ],
    },
    tick: {
      title: "tick：Gateway 连接活性",
      status: "Gateway 广播 · 客户端订阅",
      rows: [
        ["是不是唤醒", "Gateway 定期广播 <code>tick</code>，客户端用它观察连接活性。"],
        ["送到哪里", "走 WebSocket 事件流。"],
        ["run 预算", "连接维护没有 agent attempt 预算。"],
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
  const resolutions = {
    allow: {
      trace: "授权人批准。宿主仍需按当前策略和请求绑定复核，再尝试执行。",
      note: "批准结束了人工等待。命令是否执行，以宿主校验和执行回执为准。",
      status: "已批准，待宿主复核",
    },
    deny: {
      trace: "授权人拒绝。宿主拒绝执行，工具结果携带原因。",
      note: "模型收到拒绝结果，可以改用其他路径或停下。",
      status: "已拒绝",
    },
    timeout: {
      trace: "等待超时。本例的 askFallback 为 deny，工具返回拒绝结果。",
      note: "无人给出决议，宿主按本例的默认回退策略拒绝执行。",
      status: "超时，默认拒绝",
    },
  };
  const gates = [
    { ev: "telegram inbound", kind: "user", text: "已获通道访问权限的发送者发来消息。会话路由定位目标会话，再准入 run。" },
    { ev: "agent → exec proposal", kind: "model", text: "模型提出命令。工具执行入口先按本轮权限检查，并运行相关钩子。" },
    { ev: "approval policy evaluates", kind: "sys", text: "此例的宿主 exec 策略要求人审，审批管理器登记请求。若超时，默认拒绝。" },
    { ev: "forward → user channel", kind: "sys", text: "此例已配置 Telegram 审批目标，并有授权审批人。" },
    { ev: "await authorized decision", kind: "warn", text: "现在可以模拟批准、拒绝或等待超时。" },
    { ev: "resolution → execute / block", kind: "sys", text: "决议回注，闸门开或关。" },
  ];
  let cursor = 0;
  let decided: keyof typeof resolutions | null = null;
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
    if (cursor === 4) emit(4, gates[4].text);
    draw();
    if (note) note.textContent = cursor === 4 ? "等待授权人决议。请选择批准、拒绝或超时。" : gates[Math.min(cursor, 3)].text;
    if (status) status.textContent = `闸门 ${Math.min(cursor + 1, 6)}/6 · ${cursor === 4 ? "等待批复" : "推进中"}`;
    led?.classList.add("is-run");
    led?.classList.remove("is-done", "is-halt");
  };
  const verdict = (kind: keyof typeof resolutions) => {
    if (decided !== null) return;
    if (cursor < 4) { log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="k-warn">链还没走到 G5（审批转发进频道），先点「下一闸门」。</span></span>`); return; }
    decided = kind;
    cursor = 5;
    const resolution = resolutions[kind];
    emit(5, resolution.trace);
    steps.forEach((item, i) => { item.classList.toggle("is-done", i <= 4); item.classList.toggle("is-now", i === 5); });
    if (note) note.textContent = resolution.note;
    if (status) status.textContent = `闸门 6/6 · ${resolution.status}`;
    led?.classList.remove("is-run");
    led?.classList.add(kind === "allow" ? "is-done" : "is-halt");
    qsa<HTMLButtonElement>(root, "[data-verdict]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.verdict === kind)));
  };
  const reset = () => {
    cursor = 0; decided = null;
    if (log) log.innerHTML = "";
    steps.forEach((item) => item.classList.remove("is-now", "is-done"));
    if (note) note.textContent = "本例使用 Telegram 互动审批和默认拒绝回退。推进到等待决议后，比较批准、拒绝和超时。";
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
  qsa<HTMLButtonElement>(root, "[data-verdict]").forEach((button) => button.addEventListener("click", () => {
    const decision = button.dataset.verdict;
    if (decision === "allow" || decision === "deny" || decision === "timeout") verdict(decision);
  }));
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute("aria-pressed", "true");
    window.setTimeout(() => button.setAttribute("aria-pressed", "false"), 150);
    reset();
  });
  draw();
}

function initMemoryResume(): void {
  const root = document.querySelector("#oclaw-memory");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const eventLabels: Record<string, string> = {
    chat: "通道新消息",
    heartbeat: "巡检作业",
    dream: "记忆整理后的新消息",
  };
  const eventNotes: Record<string, string> = {
    chat: "新通道消息在空闲会话开启一轮。常驻意图只在符合条件且命中时才注入。",
    heartbeat: "启用的默认巡检使用自己的作业 prompt，等主会话空闲后执行。",
    dream: "本轮由新消息触发，检索可以找到已晋升且完成索引的内容。",
  };
  let carrier = "";
  let wake = "";

  const render = () => {
    if (!carrier || !wake || !detail) return;
    const transcript = carrier === "sqlite";
    const rows = transcript
      ? [
          ["进度", "从已提交的转录事件还原选中的会话分支。"],
          ["恢复", "崩溃后还要检查持久运行标记、恢复范围和缺失回执。"],
        ]
      : [
          ["日记预载", "此例采用近 2 天，每份最多 1,200 字符，总计 2,800 字符。"],
          ["按需检索", "用关键词和向量查找长期记忆，再读取真正相关的段落。"],
        ];
    rows.push(["本轮输入", eventNotes[wake]]);
    const title = transcript ? "会话转录" : "工作区记忆";
    detail.innerHTML = `<span class="label-mono">输入与证据</span><h3>${title}</h3><div class="stage-note">${rows.map(([term, value]) => `<span><strong>${term}</strong>　${value}</span>`).join("")}</div>`;
    if (status) status.textContent = eventLabels[wake];
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
    telegram: [["协议角色", "Gateway 宿主侧通道扩展（grammY）"], ["消息进出", "inbound debounce → 会话路由 → run；outbound 走通道插件"], ["审批与交互", "已配置的审批目标可由授权人批复"], ["断线语义", "Telegram 连接中断会影响这条通道的收发，可从 Gateway 核对会话状态。"]],
    discord: [["协议角色", "Gateway 通道扩展"], ["消息进出", "会话路由与通道输出使用对应集成"], ["审批与交互", "在支持且按配置可达的审批面批复"], ["断线语义", "查看 Discord 入站与出站状态，再查 Gateway 中的会话。"]],
    ui: [["协议角色", "Gateway 的 WebSocket 客户端"], ["消息进出", "聊天与历史通过统一协议读写"], ["审批与交互", "审批面板 + ask_user 回答框"], ["断线语义", "纯客户端，断线不应删除 Gateway 持久状态"]],
    cli: [["协议角色", "可连接 Gateway，或用本地内置后端"], ["消息进出", "Gateway 模式读取目标会话，回发聊天通道需单独开启"], ["审批与交互", "查看待审批需相应 operator 作用域"], ["断线语义", "重连后核对 Gateway 身份、会话 ID 和历史"]],
    macos: [["协议角色", "WS 客户端（control-plane）"], ["消息进出", "同左 + canvas.* 部件命令"], ["审批与交互", "系统通知 + 审批"], ["断线语义", "node 配对重连（device pairing store）"]],
  });
  initChoiceDetail("#oclaw-atlas", {
    silent: { title: "核对 Gateway 和到期作业", body: "确认 Gateway 在线，再查作业是否启用、是否已经到期，以及是否在等主会话空闲。上一次运行的结果与下一次调度分别核对。", status: "先查唤醒" },
    expensive: { title: "确认哪些重试消耗了预算", body: "区分单请求重试、run 内 recovery、跨 run 探测与凭证冷却；再检查副作用证据。外层连续计数遇到完整模型响应会回到 1。", status: "先分账" },
    dreaming: { title: "记忆晋升与手工内容要分开看", body: "夜间任务会把满足分数、召回次数、查询多样性和时效门槛的碎片晋升；回收器只删除能确认由系统生成的自动分节。", status: "先看来源" },
    loopy: { title: "检查同名同参是否连续重复", body: "重复守卫默认开启。连续同名同参第 3 次提示，第 20 次执行前拦截。换调用或新用户输入重置连击，声明可重复的轮询豁免。", status: "查看 tool_repeat_limit" },
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
