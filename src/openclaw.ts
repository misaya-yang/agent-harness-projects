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
      tail: "退避会尊重 provider 的 Retry-After 下界，再由本层预算决定是否续跑。",
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
      tail: "本例响应成功，来自 agent_end 处理器的排队消息会触发会话续跑。",
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
      state.fires += 1; render("standing intent 命中", "fires+1（24h cooldown / 90 天过期）", "model"); return;
    }
    if (type === "crash") {
      state.retry = 0; state.budget = 0; state.overflow = 0;
      render("进程崩溃", "进程计数丢失，已提交的转录事件和意图状态可读。未决工具的外部结果还需确认。", "warn"); return;
    }
    if (type === "restart") { render("重启读账本", "符合条件的孤立运行可从持久 run 标记恢复，Gateway 发出一条恢复输入，先核实未决动作。", "sys"); return; }
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
  const blocked = () => { if (halted) { render("断路器已跳闸：先重置再模拟下一局", "warn"); return true; } return false; };
  qsa<HTMLButtonElement>(root, "[data-evt]").forEach((button) => button.addEventListener("click", () => {
    const evt = button.dataset.evt;
    if (evt === "reset") { used = 0; rlStreak = 0; idleStreak = 0; halted = false; if (log) log.innerHTML = ""; render(); return; }
    if (blocked()) return;
    if (evt === "ok") { used = 1; rlStreak = 0; idleStreak = 0; render("已完成的模型响应：外层连续计数重置为 1，限流与空闲连击清零", "model"); return; }
    if (evt === "rate") {
      rlStreak += 1;
      if (rlStreak < 16) {
        charge(`第 ${rlStreak} 次限流失败。若允许同模型重试，指数退避加抖动，并以 Retry-After 为下界。`);
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
    profiles = Number(button.dataset.v) || 1;
    qsa<HTMLButtonElement>(root, "[data-profile] [data-v]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render(`按候选 profile 重算本次 run 预算：max = ${maxOf(profiles)}`, "model");
    if (!halted && used >= maxOf(profiles)) { halted = true; render("新预算低于已耗 → 预算闸门立即终止后续 recovery", "warn"); }
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
        ["怎么计预算", "不另开 run，因此不领取新预算；它有自己的冷却、触发次数与过期限制"],
      ],
    },
    tick: {
      title: "tick：Gateway 连接活性",
      status: "Gateway 广播 · 客户端订阅",
      rows: [
        ["是不是唤醒", "Gateway 定期广播 <code>tick</code>，客户端用它观察连接活性。"],
        ["进入哪条 lane", "走 WebSocket 事件流。"],
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
  const gates = [
    { ev: "telegram inbound", kind: "user", text: "已获通道访问权限的发送者发来消息。会话路由定位目标会话，再准入 run。" },
    { ev: "agent → dangerous exec proposal", kind: "model", text: "模型只提出动作；真正进入实现体前必须通过统一工具策略壳。" },
    { ev: "approval policy evaluates", kind: "sys", text: "此例的宿主 exec 策略要求人审，审批管理器登记请求。若超时，默认拒绝。" },
    { ev: "forward → user channel", kind: "sys", text: "此例已配置 Telegram 审批目标，并有授权审批人。" },
    { ev: "await authorized decision", kind: "warn", text: "请模拟授权人在 Telegram 批复，选择「✓ 批复执行」或「✗ 批复拒绝」。" },
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
    if (note) note.textContent = cursor === 4 ? "审批待授权人决定。点 ✓ 或 ✗ 给出批复。" : gates[Math.min(cursor, 3)].text;
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
      ? "批复 ✓：按当前策略和请求绑定复核后尝试执行，实际结果记进转录。"
      : "批复 ✗：宿主拒绝执行，工具结果携带失败原因。");
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
    if (note) note.textContent = "一条危险命令提案，逐闸门点过去，看它在哪一步被谁裁决。";
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
    chat: ["本次点火", "用户消息开启 run；standing intent 只有匹配成功才追加到当前 prompt"],
    heartbeat: ["本次点火", "启用的 Proactive check 读取作业 prompt 与 scratch，满足空闲条件后执行。"],
    dream: ["本次点火", "夜间记忆晋升完成后的第一次醒来：检索语料已包含新晋升的耐久事实"],
  };
  const render = () => {
    if (!carrier || !wake || !detail) return;
    const rows: Array<[string, string]> = [
      ["人格与规则", "工作区规则、用户偏好与长期记忆在预算内装配；超限时会给出截断提示"],
    ];
    let tables = 0;
    let chars = "";
    if (carrier === "sqlite") {
      rows.push(
        ["账本事实", "会话记录和已提交的转录事件提供事实。重启还要检查持久 run 身份与未决副作用。"],
        ["检索索引", "全文与向量索引共同提供候选，再经去冗余和时间衰减排序"],
        ["常驻意图", "意图记录自带冷却、触发次数和过期状态，避免永久反复插入"],
        ["全局审计", "关键控制动作进入独立审计事件面，不依赖聊天文字猜测"],
      );
      tables = 5;
      chars = "注入按需";
    } else {
      rows.push(
        ["文件上下文", "工作区规则与记忆按启动策略装配。示例日记预载默认近 2 天。"],
        ["字符预算", "默认日记预载每份 1,200 字符、总计 2,800 字符，完整文件可按需读取。"],
        ["边界", "日记文件提供提示词材料，会话进度由持久转录记录。"],
      );
      tables = 0;
      chars = "≤2800 字符";
    }
    rows.push(wakeRow[wake]);
    const projection: MemoryProjection = {
      title: `${carrier === "sqlite" ? "会话账本（SQLite 示例）" : "文件记忆"} × ${wake === "chat" ? "通道消息" : wake === "heartbeat" ? "Proactive check" : "dreaming 之后"}`,
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
    telegram: [["协议角色", "Gateway 宿主侧通道扩展（grammY）"], ["消息进出", "inbound debounce → 会话路由 → run；outbound 走通道插件"], ["审批与交互", "已配置的审批目标可由授权人批复"], ["断线语义", "Gateway 在则助理在“睡”，run 仍由唤醒驱动"]],
    discord: [["协议角色", "Gateway 通道扩展"], ["消息进出", "会话路由与通道输出使用对应集成"], ["审批与交互", "在支持且按配置可达的审批面批复"], ["断线语义", "同左：断的是通道，不是内核"]],
    ui: [["协议角色", "Gateway 的 WebSocket 客户端"], ["消息进出", "聊天与历史通过统一协议读写"], ["审批与交互", "审批面板 + ask_user 回答框"], ["断线语义", "纯客户端，断线不应删除 Gateway 持久状态"]],
    cli: [["协议角色", "WS 客户端"], ["消息进出", "同左，TUI 渲染器复用会话工具"], ["审批与交互", "交互式提示"], ["断线语义", "同左：持久会话可在 Gateway 重连后继续查看"]],
    macos: [["协议角色", "WS 客户端（control-plane）"], ["消息进出", "同左 + canvas.* 部件命令"], ["审批与交互", "系统通知 + 审批"], ["断线语义", "node 配对重连（device pairing store）"]],
  });
  initChoiceDetail("#oclaw-atlas", {
    silent: { title: "先分清死亡与长眠", body: "跨天存活本来就靠“不跑”实现：有界 run 结束后落盘等待。先验证 Gateway 是否在线、精确定时是否进入待执行队列，再看 Proactive check 作业是否启用，是否进入允许时段或在等会话空闲。", status: "先查唤醒" },
    expensive: { title: "先找正在计费的预算主人", body: "区分单请求重试、run 内 recovery、跨 run 探测与凭证冷却；再检查副作用证据。外层连续计数遇到完整模型响应会回到 1。", status: "先分账" },
    dreaming: { title: "记忆晋升与手工内容要分开看", body: "夜间任务会把满足分数、召回次数、查询多样性和时效门槛的碎片晋升；回收器只删除能确认由系统生成的自动分节。", status: "先看来源" },
    loopy: { title: "检查同名同参是否连续重复", body: "重复守卫默认开启。连续同名同参第 3 次提示，第 20 次执行前拦截。换调用或新用户输入重置连击，声明可重复的轮询豁免。", status: "查看 tool_repeat_limit" },
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
