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
  const notes = [
    "受持久协调保护的回合先准入会话租约，执行期间续租，退出时释放。",
    "恢复历史与冻结的 system prompt。回合条件决定是否在序章做上下文预检。",
    "检查中断、调用上限、共享迭代预算与一次收尾机会，再准备本轮输入。",
    "从当前历史、冻结 prompt 与工具定义装配发送副本，避免把临时输入改动写进规范转录。",
    "判断请求压力与 provider 证据。压缩或恢复可能改变历史，装配阶段随后重跑。",
    "调用当前 transport，选择流式或非流式；重试阶段根据失败类型决定恢复动作。",
    "归一响应与 usage，辨认工具调用、文本、截断及其他异常。",
    "持久会话先提交调用块，再执行并配对调用结果。提交失败会中止本轮；本例提交成功并再次请求模型。",
    "接到可交付文本后结束循环；意外空响应或丢失工具调用可能触发补救。",
    "收尾持久化回合结果。退出原因用于观察终态，记忆或技能复盘要另过派发条件。",
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
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 7 ? "tool" : "sys"}">${steps[index]?.textContent ?? ""}</span></span>`);
      if (note) note.textContent = notes[index];
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "沿一次有工具调用的通用回合，查看请求与回写。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initStateProjection(): void {
  const root = document.querySelector("#hm-state");
  if (!root) return;
  const limit = 20_000;
  let active = 0;
  let archived = 0;
  let ancestorRows = 0;
  let continuationCount = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const badgeLabel = qs<HTMLElement>(root, "[data-verdict-label]");
  type Check = { verdict: "ok" | "ask" | "deny"; label: string };
  const render = (event?: string, note?: string, check?: Check) => {
    const set = (selector: string, value: number) => {
      const el = qs<HTMLElement>(root, selector);
      if (el) el.textContent = String(value);
    };
    set("[data-active]", active);
    set("[data-lineage]", continuationCount);
    set("[data-archived]", archived);
    if (event) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">db</span> <span class="${check?.verdict === "deny" ? "k-warn" : "k-sys"}">${event}</span> <span class="t">${note}</span></span>`);
    if (badge && badgeLabel) {
      badge.dataset.verdict = check?.verdict ?? (active > 0 ? "ok" : "ask");
      badgeLabel.textContent = check?.label ?? (active > 0 ? "已有会话样本" : "待操作");
    }
  };
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    switch (button.dataset.event) {
      case "reset":
        active = archived = ancestorRows = continuationCount = 0;
        if (log) log.textContent = "";
        render();
        break;
      case "msg":
        active += 1;
        render("msg.append", "末段新增一条活跃消息。");
        break;
      case "bulk":
        active += limit + 1;
        render("生成 20,001 条样本", "当前段已超过默认限额，压缩后再比较末段与全链读取。");
        break;
      case "compact":
      case "rotate": {
        if (active < 2) {
          render("略过压缩", "教学模型至少需要两条活跃消息。", { verdict: "ask", label: "样本不足" });
          break;
        }
        const previousActive = active;
        active = Math.min(3, previousActive - 1);
        if (button.dataset.event === "compact") {
          archived += previousActive;
          render("原地压缩", "会话 id 保持，旧行软归档，摘要进入活跃视图。");
        } else {
          ancestorRows += previousActive;
          continuationCount += 1;
          render("滚动到子段", "当前物理段换到 continuation，父段保留历史。");
        }
        break;
      }
      case "resume": {
        const tipOverLimit = active > limit;
        const lineageOverLimit = active + archived + ancestorRows > limit;
        const tip = tipOverLimit ? "末段活跃行超过 20,000" : "末段读取通过";
        const lineage = lineageOverLimit ? "全链展示读取保护拒绝" : "全链读取保护通过";
        const check: Check = { verdict: "ok", label: "两种读取通过" };
        if (tipOverLimit) {
          check.verdict = "deny";
          check.label = "末段与全链都超限";
        } else if (lineageOverLimit) {
          check.verdict = "ask";
          check.label = "末段通过 · 全链超限";
        }
        render("resume(id)", `${tip}。 ${lineage}。`, check);
        break;
      }
      case "export":
        render("读取导出范围", `读取保护所见累积样本行数为 ${active + archived + ancestorRows}。实际导出有自己的行范围和限额。`);
        break;
    }
  }));
  render();
}

type DeliveryProbe = { verdict: "ok" | "deny"; label: string; status: string; lines: Array<[string, string]> };

const DELIVERY_PROBES: Record<string, DeliveryProbe> = {
  telegram: { verdict: "ok", label: "可识别 · 平台插件", status: "telegram · 插件声明", lines: [
    ["k-sys", "Telegram 注册 TELEGRAM_HOME_CHANNEL。发送还需要有效的目标和可用适配器。"],
  ] },
  webhook: { verdict: "ok", label: "可识别 · 固定目标", status: "webhook · 固定目标", lines: [
    ["k-sys", "webhook 在两项固定目标集合里。仍须验证路由配置与实际投递结果。"],
  ] },
  ntfy: { verdict: "ok", label: "可识别 · 平台插件", status: "ntfy · 插件声明", lines: [
    ["k-sys", "ntfy 注册 NTFY_HOME_CHANNEL，由平台注册表提供识别。"],
  ] },
  wecom_callback: { verdict: "ok", label: "可识别 · 固定目标", status: "wecom_callback · 固定目标", lines: [
    ["k-sys", "wecom_callback 在固定集合里，通过配置中的 home_channel 定位目标。"],
  ] },
  raft: { verdict: "deny", label: "未识别为 cron 目标", status: "raft · 缺少交付声明", lines: [
    ["k-warn", "raft 在固定集合之外，随仓库提供的平台条目也未声明 cron_deliver_env_var。"],
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
      `<li>① 技能复盘间隔大于零且循环迭代数到位：${mark(t)}</li>`,
      `<li>② skill_manage 在本会话工具面中：${mark(k)}</li>`,
    ];
    if (t === 1 && k === 1) {
      rows.push("<li>→ 技能复盘到期。收尾重置计数。有最终回复、既未中断也未被 veto，且自动复盘与当前作用域允许时才派发。</li>");
    } else if (t === 1 && k === 0) {
      rows.push("<li>→ 本会话缺少 skill_manage，技能到期条件未满足。</li>");
    } else if (t === 1) {
      rows.push("<li>→ 先选本例的循环迭代数，再检查 skill_manage 是否可用。</li>");
    } else if (t === 0) {
      rows.push("<li>→ 技能间隔未到；记忆仍按自己的用户轮计数。</li>");
    } else {
      rows.push("<li>用左侧两段按钮配条件，看它何时被推着复盘。</li>");
    }
    rows.push("<li>写入沿用记忆或技能工具的策略。固定项保护、扫描与审批按各自的工具和配置生效。</li>");
    rows.push("<li>用户也可以主动发起学习，把材料编纂成技能，不必等待自动间隔。</li>");
    if (trace) trace.innerHTML = rows.join("");
    let verdict = "ask";
    let label = "待两段选择";
    let bar = "待两段选择";
    if (t === 1 && k === 1) { verdict = "ok"; label = "技能复盘到期"; bar = "interval ✓ · 工具册 ✓"; }
    else if (t === 1 && k === 0) { verdict = "deny"; label = "未到期 · 缺少 skill_manage"; bar = "interval ✓ · 工具册 ✗"; }
    else if (t === 1) { label = "间隔已到 · 待第二段"; bar = "interval ✓ · 工具册 —"; }
    else if (t === 0) { label = "技能间隔未到"; bar = `interval ✗ · 工具册 ${mark(k)}`; }
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
    extend: { title: "LADDER 1 · 扩展现有命令", body: "已有命令覆盖主要动作，只差一个清晰选项。扩展现有接口即可，沿用原来的配置与权限制约。", status: "EXTEND" },
    spotify: { title: "LADDER 4 · 带凭据的服务插件", body: "判断 trace：需要新 schema → 只对已连接账户有意义 → 有多项相关工具与独立凭据 → 放进插件。可延迟 schema 还能走 Tool Search。", status: "PLUGIN" },
    ha: { title: "LADDER 3 · 按服务可用性门控", body: "判断 trace：能力需要 schema，但只有本地服务在线时才成立 → 用 check_fn 控制是否展示。瞬态失败可短时沿用 last-good，避免服务抖动让整组工具突然消失。", status: "CHECK_FN" },
    seq: { title: "LADDER 2 · CLI 命令 + SKILL.md", body: "判断 trace：这只是模型可以学习的稳定操作序列 → 不新增工具，把步骤写成按需加载的技能。知识扩展与执行权限保持分离。", status: "CLI + SKILL" },
    mcp: { title: "LADDER 5 · 第三方 MCP 目录", body: "判断 trace：schema 与生命周期由第三方维护 → 接入统一目录并渐进披露。Hermes 负责作用域、审批和结果治理，不接管上游契约。", status: "MCP CATALOG" },
    codeexec: { title: "LADDER 6 · 核心工具（最后手段）", body: "判断 trace：能力跨所有后端、无法由技能或外部服务表达，并且每个会话都需要 → 才进入核心。常驻核心定义会占用每次请求的工具预算。", status: "CORE TOOL" },
  }, "LADDER TRACE");
  initChoiceDetail("#hm-envs", {
    local: { title: "Local · 最低摩擦，最低隔离", body: "普通 shell 执行经过本机进程，工作目录和环境由会话管理。路径可见性受宿主权限约束。", status: "LOCAL" },
    docker: { title: "Docker · 容器边界", body: "命令在容器内执行，适合需要可重复环境的任务。挂载与网络策略决定容器能接触哪些宿主资源。", status: "DOCKER" },
    ssh: { title: "SSH · 远端执行", body: "SSH 连接可复用，命令发往远端。同一 execute 接口返回工具结果，路径必须按远端环境解析。", status: "SSH" },
    singularity: { title: "Singularity · 官方插件", body: "HPC 后端已迁出核心。旧配置可通过更新迁移识别，当前由安装后的终端环境 provider 提供。", status: "PLUGIN" },
    modal: { title: "Modal · 可快照的按需运行", body: "开启持久化时，可在清理前尝试保存文件系统快照。恢复标识写入当前 profile 的存储。", status: "MODAL" },
    daytona: { title: "Daytona · 挂起与双向同步", body: "远端工作区生命周期有停止与恢复路径，文件同步层在工作区之间同步文件。", status: "DAYTONA" },
    vercel: { title: "Vercel Sandbox · 短生命周期隔离", body: "开启持久化时，可通过 sandbox 快照保存工作现场。连接、镜像与快照生命周期由 Vercel 后端实现。", status: "VERCEL" },
  }, "BACKEND FACTS");
  initDeliveryMatrix();
  initReviewTrigger();
  initLineage("#hm-lineage", {
    soul: { hermes: "SOUL.md 作为会话身份的稳定输入，恢复时应保持字节一致。", openclaw: "使用同名人格文件作为可迁移资产。", diff: "人格文件适合复制，因为它描述用户资产，而不是某次运行的锁和租约。", status: "SOUL.md" },
    memory: { hermes: "MEMORY.md 与 USER.md 分离环境经验和用户偏好，条目可独立整合。", openclaw: "保留同类文件并采用追加式导入。", diff: "记忆可以搬运，但合并语义必须由目标系统解释；复制不等于理解。", status: "§ MEMORY" },
    skills: { hermes: "SKILL.md 是按需加载的操作知识包。", openclaw: "同样把技能作为工作区内容发现。", diff: "技能最接近开放内容协议：迁移知识，不迁移进程内权限。", status: "SKILL.md" },
    config: { hermes: "导入配置时要核对模型、传输方言和凭据对应关系。", openclaw: "导入时需要把来源协议翻译为目标配置。", diff: "配置不是原样复制；必须确认认证、端点和传输语义仍等价。", status: "CONFIG" },
    cron: { hermes: "OpenClaw 导入说明把旧任务归档，操作者在 Hermes 中重新建立 cron。", openclaw: "Hermes 的 cron 目录归档保存，任务需在 OpenClaw 中重新建立。", diff: "归档保留复核材料。启用新任务前要重新检查时区、目标与权限，旧运行回执留在原调度器。", status: "AUTOMATION" },
    migrate: { hermes: "官方 agent-importers 插件提供 hermes import-agent openclaw，兼容 hermes claw migrate。", openclaw: "也能从 Hermes 导入可移植内容。", diff: "双向迁移说明文件格式是用户资产接口；双方同时在线不是必要条件。", status: "MIGRATORS" },
    notmine: { hermes: "凭据与命令白名单只能选择性导入。", openclaw: "插件、会话、日志等运行时私有状态不直接激活。", diff: "不迁移清单就是安全边界：内容可搬，权力与活状态要重新授权。", status: "BOUNDARY" },
  });
  initSurface("#hm-surfaces", {
    cli: [["宿主职责", "终端交互、显示与审批"], ["接入协议", "Classic CLI 默认用共享网关的本地会话协议"], ["执行所有者", "共享网关持有准入和运行状态"], ["关键区分", "主动 detach 只撤销订阅。停止回合使用独立控制，断线还可能触发无订阅者回收。"]],
    gateway: [["宿主职责", "平台消息路由与 busy 仲裁"], ["接入协议", "平台 adapter 与注册表"], ["执行所有者", "按平台会话键与 profile 选择会话和执行范围"], ["关键区分", "消息路由键与本地客户端的逻辑 session id 各司其职"]],
    tui: [["宿主职责", "Ink 终端展示与控制"], ["接入协议", "共享网关 WebSocket JSON-RPC"], ["执行所有者", "SessionAuthority 管理会话、执行和订阅"], ["关键区分", "单独运行的 stdio 传输仍可进入传统分发器"]],
    desktop: [["宿主职责", "Electron 客户端与图形交互"], ["接入协议", "共享网关 WebSocket"], ["执行所有者", "目标网关持有活动会话"], ["关键区分", "已授权客户端可重接尚未收尾的回合，再按执行世代和提示 id 响应审批。"]],
    acp: [["宿主职责", "编辑器内对话与审批"], ["接入协议", "Agent Client Protocol"], ["执行所有者", "ACP 适配器连接对应会话后端"], ["关键区分", "编辑器协议 id 和内核会话 identity 分层"]],
    mcp: [["宿主职责", "把消息会话操作暴露给 MCP 客户端"], ["接入协议", "官方 mcp-serve 插件提供 stdio 服务"], ["执行所有者", "工具操作经 active profile 的消息会话"], ["关键区分", "Codex App Server 的 Hermes 工具桥是另一条路径"]],
  });
  initChoiceDetail("#hm-atlas", {
    cost: { title: "同一会话 API 费用突然翻倍 → 先查缓存前缀", body: "最高区分度证据是 cache hit 与真实 prompt 用量。若每回合都重建系统提示、工具面或历史摘要，前缀缓存会持续失效；切换 provider 与正式 compaction 会发生一次合法边界变化。", status: "高频" },
    vanish: { title: "远端环境下整套工具突然没了 → 先查能力门控", body: "先查工具是否折叠在 Tool Search，再看服务探针、last-good 宽限以及宿主工具面。", status: "偶发" },
    resume: { title: "恢复旧会话被拒 → 先判断它是不是保护性失败", body: "检查恢复使用末段活跃视图还是整条展示血缘，再看 sessions.max_resume_messages；全链保护可因压缩归档行而拒绝，同时末段仍可加载。", status: "低频" },
    cron: { title: "后台任务到点没触发 → 拆成调度、认领、执行、交付", body: "先确认调度器是否活着，再查是否被旧 claim 占用、执行是否形成终态、目标平台是否声明交付能力。四层不要混成一句“cron 坏了”。", status: "高频" },
  }, "FIRST EVIDENCE");
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
