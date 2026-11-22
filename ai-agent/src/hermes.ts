import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/hermes.css";

import { initNavMenu } from "./modules/navmenu";
import { initReveal } from "./modules/reveal";
import { initSeriesNav } from "./modules/series-nav";
import { initChapterReader } from "./modules/chapter-reader";
import { initTheme } from "./modules/theme";
import { initHeroPause } from "./modules/hero-pause";

type Detail = { title: string; body: string; status?: string };
type SurfaceData = Record<string, Array<[string, string]>>;
type LineageData = Record<string, { hermes: string; openclaw: string; diff: string; status?: string }>;

const qs = <T extends Element>(root: ParentNode, selector: string): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(root: ParentNode, selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));

function initChoiceDetail(id: string, data: Record<string, Detail>, label = "FIRST EVIDENCE"): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = `<span class="label-mono">${label}</span><h3>${item.title}</h3><p>${item.body}</p>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLineage(id: string, data: LineageData): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = `<span class="label-mono">HERMES · PYTHON</span><p>${item.hermes}</p>`
      + `<span class="label-mono">OPENCLAW · TYPESCRIPT</span><p>${item.openclaw}</p>`
      + `<div class="decision"><span class="label-mono">一句话差异</span><p>${item.diff}</p></div>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLoop(): void {
  const root = document.querySelector("#hm-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = [
    "run_conversation()",
    "_restore_or_build_system_prompt()",
    "should_compress()",
    "while(api_calls&lt;max &amp;&amp; budget&gt;0)",
    "interruptible_streaming_api_call()",
    "_fire_stream_delta()",
    "_execute_tool_calls()",
    "check_all_command_guards()",
    "make_tool_result_message()",
    "finalize_turn()",
  ];
  const notes = [
    "序章先清理用户输入、恢复会话并建立可持久化现场；临时脚手架不写进用户原文。",
    "系统提示优先复用会话内冻结快照；只有恢复、压缩或明确的能力变化才重新建立边界。",
    "进入循环前先估算请求压力；过线时先尝试安全压缩，失败则保留原历史。",
    "每次模型自主决策都消耗独立迭代预算；预算耗尽会生成可读收尾，不把半截状态冒充完成。",
    "模型请求始终暴露可观测的进度和截止期；流式首先服务健康检测，其次才是视觉体验。",
    "输出事件只负责展示，不拥有回合状态；同一份内核事件可以被终端、网关或桌面消费。",
    "单工具顺序执行；多工具按路径读写冲突切成并行段和屏障段，并保持原始结果顺序。",
    "审批、护栏和 deadline 在工具真正执行前完成；人类等待时间单独核算，不吞掉机器执行预算。",
    "每个工具调用 id 都必须得到一个结果；写入类工具先做可恢复检查点，再允许副作用发生。",
    "模型不再请求工具后进入尾声：持久化退出原因、发布状态，并把后台复盘与主回复解耦。",
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
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 6 || index === 7 || index === 8 ? "tool" : "sys"}">${events[index]}</span></span>`);
      if (note) note.textContent = notes[index];
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察一个回合怎样在“无 tool_calls”处正常终结。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initStateProjection(): void {
  const root = document.querySelector("#hm-state");
  if (!root) return;
  const LIMIT = 20000;
  let active = 0;
  let lineage = 0;
  let bytes = 12;
  let compacted = false;
  const log = qs<HTMLElement>(root, "[data-log]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const badgeLabel = qs<HTMLElement>(root, "[data-verdict-label]");
  const render = (event?: string, note?: string, warn = false) => {
    const set = (selector: string, value: number) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = String(value); };
    set("[data-active]", active); set("[data-lineage]", lineage); set("[data-bytes]", bytes);
    if (event) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">db</span> <span class="${warn ? "k-warn" : "k-sys"}">${event}</span>${note ? ` <span class="t">${note}</span>` : ""}</span>`);
    if (badge && badgeLabel) {
      const fail = active > LIMIT;
      badge.dataset.verdict = fail ? "deny" : active > 0 ? "ok" : "ask";
      badgeLabel.textContent = fail ? "血统链超限" : active > 0 ? "血统健康" : "待操作";
    }
  };
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event;
    if (type === "reset") { active = 0; lineage = 0; bytes = 12; compacted = false; if (log) log.innerHTML = ""; render(); return; }
    if (type === "msg") { active += 1; bytes += 2; render("msg.append", "messages.active+1 · FTS5 同步索引"); return; }
    if (type === "bulk") { active += 20001; bytes += 42000; render("bulk import", "一次导入大量历史，主动制造恢复压力"); return; }
    if (type === "compact") {
      if (active === 0) { render("compact 拒绝：无 active 消息可压", "压缩对象不存在，不推进血统", true); return; }
      lineage += 1; bytes += 800;
      const summary = Math.min(3, active);
      active = summary; compacted = true;
      render("compact", `旧消息软归档 · 新活动集合保留摘要与现场 · lineage_depth=${lineage}`);
      return;
    }
    if (type === "resume") {
      if (active > LIMIT) { render("resume(id)", "活动历史超过安全上限 → 拒绝加载，先处理压缩与会话健康", true); return; }
      render("resume(id)", compacted && lineage > 0 ? "沿压缩血缘解析到最近仍可继续的活动会话" : "直接命中当前活动会话");
      return;
    }
    if (type === "export") { render("export(lineage)", "导出会话、消息与血缘关系，用于审计和迁移"); return; }
  }));
  render();
}

type DeliveryProbe = { verdict: "ok" | "deny"; label: string; status: string; lines: Array<[string, string]> };

const DELIVERY_PROBES: Record<string, DeliveryProbe> = {
  telegram: { verdict: "ok", label: "可投递 · 双通道", status: "telegram · 白名单+插件", lines: [
    ["k-sys", "telegram 在内建交付白名单中 ✓"],
    ["k-sys", "对应平台扩展也声明了交付能力；白名单与扩展注册是两条独立证据"],
  ] },
  qqbot: { verdict: "ok", label: "可投递 · 内建", status: "qqbot · 内建枚举", lines: [
    ["k-sys", "qqbot 在内建白名单中 ✓；它由网关原生支持，不依赖平台扩展目录"],
  ] },
  ntfy: { verdict: "ok", label: "可投递 · 随插件", status: "ntfy · 插件注册", lines: [
    ["k-warn", "ntfy ∉ 白名单"],
    ["k-sys", "回退判定发现扩展声明了交付环境 → 启用扩展后仍可投递"],
  ] },
  homeassistant: { verdict: "ok", label: "可投递 · 白名单", status: "homeassistant · 反例", lines: [
    ["k-sys", "homeassistant ∈ 白名单 ✓"],
    ["k-sys", "它使用专用进程外发送；扩展数量不等于可投递目标数量"],
  ] },
  raft: { verdict: "deny", label: "只是插件壳", status: "raft · 无交付路径", lines: [
    ["k-warn", "raft ∉ 白名单"],
    ["k-warn", "平台壳没有声明交付能力 → 能被发现，不代表能成为后台任务的目的地"],
  ] },
};

function initDeliveryMatrix(): void {
  const root = document.querySelector("#hm-cron");
  if (!root) return;
  const log = qs<HTMLElement>(root, "[data-log]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const badgeLabel = qs<HTMLElement>(root, "[data-verdict-label]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const checked = qs<HTMLElement>(root, "[data-checked]");
  const probed = new Set<string>(); // 已探测按平台去重：重复点同一平台不虚增覆盖数
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event ?? "";
    if (type === "reset") {
      probed.clear();
      if (log) log.innerHTML = "";
      if (checked) checked.textContent = "0";
      qsa<HTMLButtonElement>(root, "[data-event]").forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
      if (badge) badge.dataset.verdict = "ask";
      if (badgeLabel) badgeLabel.textContent = "待探测";
      if (status) status.textContent = "选择平台探测";
      return;
    }
    const probe = DELIVERY_PROBES[type];
    if (!probe) return;
    qsa<HTMLButtonElement>(root, "[data-event]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    probed.add(type);
    if (checked) checked.textContent = String(probed.size);
    if (log) log.insertAdjacentHTML("beforeend", probe.lines.map(([cls, text]) => `<span class="ev"><span class="t">probe</span> <span class="${cls}">${type}：${text}</span></span>`).join(""));
    if (badge) badge.dataset.verdict = probe.verdict;
    if (badgeLabel) badgeLabel.textContent = probe.label;
    if (status) status.textContent = probe.status;
  }));
}

function initReviewTrigger(): void {
  const root = document.querySelector("#hm-learn");
  if (!root) return;
  const trace = qs<HTMLElement>(root, "[data-trace]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const badgeLabel = qs<HTMLElement>(root, "[data-verdict-label]");
  const status = qs<HTMLElement>(root, "[data-status]");
  let turns = "";
  let tools = "";
  const mark = (value: number) => value === 1 ? "✓" : value === 0 ? "✗" : "—";
  const render = () => {
    const t = turns === "over" ? 1 : turns === "under" ? 0 : -1;
    const k = tools === "in" ? 1 : tools === "out" ? 0 : -1;
    const rows = [
      `<li>① 复盘间隔有效且回合数到位：${mark(t)}</li>`,
      `<li>② skill_manage 确实在受限工具面中：${mark(k)}</li>`,
    ];
    if (t === 1 && k === 1) {
      rows.push("<li>→ 两个条件都满足：计数清零，fork 后台 review；主回复无需等待。</li>");
    } else if (t === 1 && k === 0) {
      rows.push("<li>→ 到间隔也不触发：模型手里没有 skill_manage，复盘了没笔可用。</li>");
    } else if (t === 1) {
      rows.push("<li>→ 间隔已到，等第二段：skill_manage 在不在工具册上决定一切。</li>");
    } else if (t === 0) {
      rows.push("<li>→ 间隔未到：计数继续累加，什么都不发生。</li>");
    } else {
      rows.push("<li>用左侧两段按钮配条件，看它何时被推着复盘。</li>");
    }
    rows.push("<li>落笔通道仍要经过安全扫描、固定项保护和写审批；后台复盘没有绕过权限。</li>");
    rows.push("<li>用户也可以主动发起学习，把材料编纂成技能，不必等待自动间隔。</li>");
    if (trace) trace.innerHTML = rows.join("");
    let verdict = "ask";
    let label = "待两段选择";
    let bar = "待两段选择";
    if (t === 1 && k === 1) { verdict = "ok"; label = "触发 skill 复盘"; bar = "interval ✓ · 工具册 ✓"; }
    else if (t === 1 && k === 0) { verdict = "deny"; label = "不触发：skill_manage 不在工具册"; bar = "interval ✓ · 工具册 ✗"; }
    else if (t === 1) { label = "间隔已到 · 待第二段"; bar = "interval ✓ · 工具册 —"; }
    else if (t === 0) { label = "间隔未到，不触发"; bar = `interval ✗ · 工具册 ${mark(k)}`; }
    if (badge) badge.dataset.verdict = verdict;
    if (badgeLabel) badgeLabel.textContent = label;
    if (status) status.textContent = bar;
  };
  (["turns", "tools"] as const).forEach((attr) => {
    qsa<HTMLButtonElement>(root, `[data-${attr}]`).forEach((button) => button.addEventListener("click", () => {
      if (attr === "turns") turns = button.dataset.turns ?? "";
      else tools = button.dataset.tools ?? "";
      qsa<HTMLButtonElement>(root, `[data-${attr}]`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      render();
    }));
  });
  qs<HTMLButtonElement>(root, "[data-clear]")?.addEventListener("click", () => {
    turns = "";
    tools = "";
    qsa<HTMLButtonElement>(root, "[data-turns], [data-tools]").forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
    render();
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
  initStateProjection();
  initChoiceDetail("#hm-decision", {
    spotify: { title: "LADDER 4 · 带凭据的服务插件", body: "判断 trace：需要新 schema → 只对已连接账户有意义 → 需要多项相关工具与独立凭据 → 放进插件。核心工具面不为单一服务永久膨胀。", status: "PLUGIN" },
    ha: { title: "LADDER 3 · 按服务可用性门控", body: "判断 trace：能力需要 schema，但只有本地服务在线时才成立 → 用 check_fn 控制是否展示。瞬态失败可短时沿用 last-good，避免服务抖动让整组工具突然消失。", status: "CHECK_FN" },
    seq: { title: "LADDER 2 · CLI 命令 + SKILL.md", body: "判断 trace：这只是模型可以学习的稳定操作序列 → 不新增工具，把步骤写成按需加载的技能。知识扩展与执行权限保持分离。", status: "CLI + SKILL" },
    mcp: { title: "LADDER 5 · 第三方 MCP 目录", body: "判断 trace：schema 与生命周期由第三方维护 → 接入统一目录并渐进披露。Hermes 负责作用域、审批和结果治理，不接管上游契约。", status: "MCP CATALOG" },
    codeexec: { title: "LADDER 6 · 核心工具（最后手段）", body: "判断 trace：能力跨所有后端、无法由技能或外部服务表达，并且每个会话都需要 → 才进入核心。因为核心定义会随每次模型请求反复付费。", status: "CORE TOOL" },
  }, "LADDER TRACE");
  initChoiceDetail("#hm-envs", {
    local: { title: "Local · 最低摩擦，最低隔离", body: "每次调用启动新 shell，工作目录和环境从会话快照恢复。它直接接触宿主文件系统；审批和环境消毒不是操作系统沙箱。", status: "LOCAL" },
    docker: { title: "Docker · 容器边界", body: "命令在容器内执行，适合需要可重复环境的任务。服务短暂抖动时，工具门控可沿用最近成功状态，避免工具面闪烁。", status: "DOCKER" },
    ssh: { title: "SSH · 远端执行", body: "复用远端连接，但保持同一执行接口。距离改变的是传输和路径可见性，不是回合如何理解工具结果。", status: "SSH" },
    singularity: { title: "Singularity · HPC 约束环境", body: "面向共享集群，强调最小可见文件系统。适合把“哪些目录能看见”当成明确部署契约。", status: "SINGULARITY" },
    modal: { title: "Modal · 可快照的按需运行", body: "销毁计算实例前保存文件系统状态，下一次按需恢复。持久的是工作现场，不是常开机器。", status: "MODAL" },
    daytona: { title: "Daytona · 挂起与双向同步", body: "远端工作区可以暂停和恢复，文件同步层让读写工具维持相同语义。快照传递状态，而不是整台机器。", status: "DAYTONA" },
    vercel: { title: "Vercel Sandbox · 短生命周期隔离", body: "按需沙箱通过快照保留现场。它与其他 serverless 后端共享同一判断：计算可丢弃，状态必须可恢复。", status: "VERCEL" },
  }, "BACKEND FACTS");
  initDeliveryMatrix();
  initReviewTrigger();
  initLineage("#hm-lineage", {
    soul: { hermes: "SOUL.md 作为会话身份的稳定输入，恢复时应保持字节一致。", openclaw: "使用同名人格文件作为可迁移资产。", diff: "人格文件适合复制，因为它描述用户资产，而不是某次运行的锁和租约。", status: "SOUL.md" },
    memory: { hermes: "MEMORY.md 与 USER.md 分离环境经验和用户偏好，条目可独立整合。", openclaw: "保留同类文件并采用追加式导入。", diff: "记忆可以搬运，但合并语义必须由目标系统解释；复制不等于理解。", status: "§ MEMORY" },
    skills: { hermes: "SKILL.md 是按需加载的操作知识包。", openclaw: "同样把技能作为工作区内容发现。", diff: "技能最接近开放内容协议：迁移知识，不迁移进程内权限。", status: "SKILL.md" },
    config: { hermes: "配置描述模型、供应商和传输方言。", openclaw: "导入时需要把来源协议翻译为目标配置。", diff: "配置不是原样复制；必须确认认证、端点和传输语义仍等价。", status: "CONFIG" },
    cron: { hermes: "定时任务带调度和交付状态。", openclaw: "automation 概念相近，但运行状态所有权不同。", diff: "任务定义可迁移，运行中的 claim、锁和交付游标不应直接搬走。", status: "AUTOMATION" },
    migrate: { hermes: "提供反向导入工具识别历史资产。", openclaw: "也能从 Hermes 导入可移植内容。", diff: "双向迁移说明文件格式是用户资产接口；双方同时在线不是必要条件。", status: "MIGRATORS" },
    notmine: { hermes: "凭据与命令白名单只能选择性导入。", openclaw: "插件、会话、日志等运行时私有状态不直接激活。", diff: "不迁移清单就是安全边界：内容可搬，权力与活状态要重新授权。", status: "BOUNDARY" },
  });
  initSurface("#hm-surfaces", {
    cli: [["宿主职责", "前台交互与审批"], ["接入协议", "终端 REPL 与命令"], ["共享核心", "同一回合引擎与会话库"], ["适合场景", "本机操作，用户可即时 redirect 或 interrupt"]],
    gateway: [["宿主职责", "常驻消息路由与 busy 仲裁"], ["接入协议", "平台适配器把消息归一"], ["共享核心", "会话键命中同一内核状态"], ["适合场景", "远程渠道、后台任务与异步完成"]],
    tui: [["宿主职责", "富交互终端展示"], ["接入协议", "换行分隔 JSON-RPC"], ["共享核心", "前端拥有屏幕，Python 拥有会话"], ["适合场景", "需要步骤、工具与流式状态的终端工作"]],
    desktop: [["宿主职责", "图形壳与本地预览"], ["接入协议", "复用 WebSocket 传输"], ["共享核心", "已有网关时路由到同一会话"], ["适合场景", "桌面操作，但不复制回合逻辑"]],
    acp: [["宿主职责", "编辑器协议适配"], ["接入协议", "Agent Client Protocol"], ["共享核心", "编辑器会话映射到内核会话"], ["适合场景", "IDE 中加载、恢复和继续同一个助理"]],
    mcp: [["宿主职责", "把消息会话反向暴露为工具"], ["接入协议", "MCP 会话、消息、事件与权限操作"], ["共享核心", "驱动的是既有网关会话"], ["适合场景", "让其他 agent 产品操作 Hermes 的消息面"]],
  });
  initChoiceDetail("#hm-atlas", {
    cost: { title: "同一会话 API 费用突然翻倍 → 先查缓存前缀", body: "最高区分度证据是 cache hit 与真实 prompt 用量。若每回合都重建系统提示、工具面或历史摘要，前缀缓存会持续失效；切换 provider 与正式 compaction 会发生一次合法边界变化。", status: "高频" },
    vanish: { title: "远端环境下整套工具突然没了 → 先查能力门控", body: "确认服务探针是否失败、last-good 宽限是否耗尽，以及当前宿主是否具备对应工具面。工具不展示通常是能力判断，不一定是模型忘记了名字。", status: "偶发" },
    resume: { title: "恢复旧会话被拒 → 先判断它是不是保护性失败", body: "查看活动历史规模、上次压缩是否提交、会话血缘能否解析，以及是否有悬挂副作用调用。宁可拒绝恢复，也不能无声丢历史或重放未知副作用。", status: "低频" },
    cron: { title: "后台任务到点没触发 → 拆成调度、认领、执行、交付", body: "先确认调度器是否活着，再查是否被旧 claim 占用、执行是否形成终态、目标平台是否声明交付能力。四层不要混成一句“cron 坏了”。", status: "高频" },
  }, "FIRST EVIDENCE");
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
