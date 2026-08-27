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
    "run_agent.py:8546 转发进 agent/conversation_loop.py:1822；用户原文先存档，任何 nudge/系统文本都不污染它。",
    "conversation_loop.py:865 从 session DB 取冻结的 system prompt，校验 runtime 匹配（:1087）才复用——每回合省钱的第一道闸。",
    "conversation_loop.py:2684 用 request_pressure_tokens 对比 50% 有效窗口阈值；超线先 compress 再进循环（:2729）。",
    "conversation_loop.py:2017；max_iterations 默认 sys.maxsize，真实约束是 IterationBudget。",
    "chat_completion_helpers.py:3288 起 daemon 线程，主线程 join(0.3) 轮询中断标志；transport 按 api_mode 分发四种协议（:926-1000）。",
    "run_agent.py:6989 只有存在展示/TTS 消费者才真流式（conversation_loop.py:3160）；单写者仲裁 _claim_stream_writer（:6899）。",
    "run_agent.py:8377：单调用直走顺序；多调用切“并行安全段/顺序屏障段”，去重 _deduplicate_tool_calls（:5047）。",
    "tools/approval.py：12 条 hardline 直接拒（rm -rf / 类 :490）、47 条危险模式进审批；并发批用 _ConcurrentToolAuthorizationGate 序列化，人类等待从批 deadline 扣除（tool_executor.py:441）。",
    "role=tool 消息 append 进 messages（tool_dispatch_helpers.py:541），continue 回步骤 4；写文件前还有 _ensure_file_checkpoint 快照。",
    "无 tool_calls 分支 conversation_loop.py:7667 → turn_finalizer.py:121；收尾处检查 memory/skill nudge（:796-803），满足就 fork 后台 review——学习的入口在循环外。",
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
    if (type === "bulk") { active += 20001; bytes += 42000; render("import --resume @claude", "外部会话 JSON 批量导入"); return; }
    if (type === "compact") {
      if (active === 0) { render("compact 拒绝：无 active 消息可压", "压缩对象不存在，不推进血统", true); return; }
      lineage += 1; bytes += 800;
      const summary = Math.min(3, active);
      active = summary; compacted = true;
      render("compact", `旧消息置 compacted=1 · fork 子会话 parent_session_id · 冻结 prompt hash 命中不重存 · lineage_depth=${lineage}`);
      return;
    }
    if (type === "resume") {
      if (active > LIMIT) { render("resume(id)", "沿链 active>20,000 → SessionResumeTooLargeError（:107/:11930）拒绝加载", true); return; }
      render("resume(id)", compacted && lineage > 0 ? "resolve_resume_session_id（:11556）沿压缩 fork 链前跳到最近有消息的后代" : "直接命中链头会话");
      return;
    }
    if (type === "export") { render("export(lineage)", "export_session_lineage → JSON：sessions + messages + parent 链（portability.py:277）"); return; }
  }));
  render();
}

type DeliveryProbe = { verdict: "ok" | "deny"; label: string; status: string; lines: Array<[string, string]> };

const DELIVERY_PROBES: Record<string, DeliveryProbe> = {
  telegram: { verdict: "ok", label: "可投递 · 双通道", status: "telegram · 白名单+插件", lines: [
    ["k-sys", "telegram ∈ _KNOWN_DELIVERY_PLATFORMS（scheduler.py:500，19 项硬编码）✓"],
    ["k-sys", "plugins/platforms/telegram/ 也注册了 cron_deliver_env_var——白名单与插件目录是两个独立事实"],
  ] },
  qqbot: { verdict: "ok", label: "可投递 · 内建", status: "qqbot · 内建枚举", lines: [
    ["k-sys", "qqbot ∈ 白名单 ✓；plugins/platforms/ 下没有 qqbot 目录——它是 gateway 内建 Platform，不靠插件"],
  ] },
  ntfy: { verdict: "ok", label: "可投递 · 随插件", status: "ntfy · 插件注册", lines: [
    ["k-warn", "ntfy ∉ 白名单"],
    ["k-sys", "回退路径 _is_known_delivery_platform（scheduler.py:2057）：查 PlatformEntry.cron_deliver_env_var（NTFY_HOME_CHANNEL）→ 插件启用即可投递"],
  ] },
  homeassistant: { verdict: "ok", label: "可投递 · 白名单", status: "homeassistant · 反例", lines: [
    ["k-sys", "homeassistant ∈ 白名单 ✓"],
    ["k-sys", "插件适配器反而不填 cron_deliver_env_var，走专用进程外发送（adapter.py:479）——22 个目录 ≠ 22 个可投递"],
  ] },
  raft: { verdict: "deny", label: "只是插件壳", status: "raft · 无交付路径", lines: [
    ["k-warn", "raft ∉ 白名单"],
    ["k-warn", "plugins/platforms/raft/ 没有 cron_deliver_env_var → 22 个插件目录里唯一纯壳：能挂载，不能当 cron 交付目标"],
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
      `<li>① 间隔 > 0 且回合数数到位（codex_runtime.py:887-888）：${mark(t)}</li>`,
      `<li>② skill_manage ∈ valid_tool_names（:889）：${mark(k)}</li>`,
    ];
    if (t === 1 && k === 1) {
      rows.push("<li>→ :891 should_review_skills = True，计数清零 → fork 后台 review（review_skills=True，:919）。</li>");
    } else if (t === 1 && k === 0) {
      rows.push("<li>→ 到间隔也不触发：模型手里没有 skill_manage，复盘了没笔可用。</li>");
    } else if (t === 1) {
      rows.push("<li>→ 间隔已到，等第二段：skill_manage 在不在工具册上决定一切。</li>");
    } else if (t === 0) {
      rows.push("<li>→ 间隔未到：计数继续累加，什么都不发生。间隔来自 skills.creation_nudge_interval，默认 10（agent_init.py:1955/:1959）。</li>");
    } else {
      rows.push("<li>用左侧两段按钮配条件，看它何时被推着复盘。</li>");
    }
    rows.push("<li>落笔通道：skill_manage（skill_manager_tool.py:1543），写前过 security scan（:125）与 pinned guard（:274）；后台写比前台删更严（:301）。</li>");
    rows.push("<li>旁路：/learn 由用户主动发起——build_learn_prompt（learn_prompt.py:165）把材料编纂成技能，不等 nudge。</li>");
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
    spotify: { title: "LADDER 4 · plugin：plugins/spotify/，核心足迹 0", body: "trace：需要新 schema？是 → 只有登录用户可用？是 → check_fn 门控（spotify/tools.py:20）→ 工具数 7 > 核心容忍？→ 定为 plugin。带凭据/多工具的新服务走 provides_tools，不进 _HERMES_CORE_TOOLS。", status: "PLUGIN" },
    ha: { title: "LADDER 3 · service-gated tool", body: "trace：需要 schema 但按服务可用性开关 → check_fn（homeassistant_tool.py:485）。服务不在线时 30s TTL 缓存 + last-good 60s（registry.py:269/:256-273）决定它整段时间是否出现在模型面前。", status: "CHECK_FN" },
    seq: { title: "LADDER 2 · CLI 命令 + SKILL.md，零核心足迹", body: "trace：操作序列可被模型学会？是 → 不新增注册点，写进技能让模型按需 skill_view 读全文（第 07 章三层披露）。背景 review 的 skill nudge 也会主动提议这条路（agent_init.py:1956）。", status: "CLI + SKILL" },
    mcp: { title: "LADDER 5 · MCP 目录，自动生成 toolset 别名", body: "trace：第三方维护？是 → 进 MCP 目录（registry.py:572 自动生成别名）。schema 归上游演进，Hermes 侧不背维护成本，也不占 60 个核心名额。", status: "MCP CATALOG" },
    codeexec: { title: "LADDER 6 · new core tool（last resort）", body: "trace：跨全部执行后端？单工具多能力？→ 前五级皆装不下 → 进 _HERMES_CORE_TOOLS（toolsets.py:31），附带动用 60 名额的书面理由（toolsets.py:68 注释 “narrow waist”）。execute_code 正是这个反例判例。", status: "CORE TOOL" },
  }, "LADDER TRACE");
  initChoiceDetail("#hm-envs", {
    local: { title: "LocalEnvironment · local.py:1716", body: "每次调用新起 bash 子进程：_run_bash（local.py:1788）→ subprocess.Popen（:1834）。进程本身不持有状态——cwd/env 靠会话快照延续。起步最快、零隔离：手就长在宿主上。", status: "LOCAL · local.py:1716" },
    docker: { title: "DockerEnvironment · docker.py:860", body: "容器隔离，配 s6 镜像部署。Docker daemon 抖动时靠工具门控的 last-good 60s 撑过（第 03 章）——后端与工具册共用同一套弹性策略。", status: "DOCKER · docker.py:860" },
    ssh: { title: "SSHEnvironment · ssh.py:46", body: "ControlMaster 连接复用，远端仍执行同一 _run_bash 协议。模板方法不因距离改形状：变的只是 socket，不是接口。", status: "SSH · ssh.py:46" },
    singularity: { title: "SingularityEnvironment · singularity.py:162", body: "--containall --no-home：HPC 共享登录节点上的最小可见文件系统。只看得见该看见的。", status: "SINGULARITY · :162" },
    modal: { title: "ModalEnvironment · modal.py:454", body: "销毁前 snapshot_filesystem（modal.py:454）给文件系统拍照，快照 id 持久在 ~/.hermes/modal_snapshots.json（:34）。闲时休眠、按需唤醒——后端自己也可以睡觉。", status: "MODAL · modal.py:454" },
    daytona: { title: "DaytonaEnvironment · daytona.py:30", body: "serverless 挂起/恢复；FileSyncManager 双向同步，read_file / write_file 因此跨后端工作。快照传的是状态，不是机器。", status: "DAYTONA · daytona.py:30" },
    vercel: { title: "VercelSandboxEnvironment · vercel_sandbox.py:243", body: "sandbox.snapshot() 同族快照语义。三个 serverless 后端（Modal / Daytona / Vercel）共享同一种哲学：状态可以打包带走，机器不必一直开着。", status: "VERCEL · :243" },
  }, "BACKEND FACTS");
  initDeliveryMatrix();
  initReviewTrigger();
  initLineage("#hm-lineage", {
    soul: { hermes: "SOUL.md 首启种子（hermes_cli/default_soul.py），进 system prompt stable 首要身份层（system_prompt.py:377）。", openclaw: "同名 SOUL.md，migrate 时直接复制进 workspace。", diff: "概念与文件名原样继承——人格是两代共同血统里最不可翻译的部分。", status: "SOUL.md" },
    memory: { hermes: "memories/MEMORY.md + USER.md，条目用 § 分隔（memory_tool.py:78）。", openclaw: "同名双文件，append 合并而非覆盖；或走 imports/hermes/。", diff: "delimiter 一致发生在 hermes 仓库内部（memory_tool.py:78 == openclaw_to_hermes.py:30，迁移器对齐目标 store）；OpenClaw 侧对 § 零命中——搬运，不解析。", status: "§ MEMORY" },
    skills: { hermes: "skills/**/SKILL.md（agentskills.io 标准），另有 openclaw-imports/ 收容目录。", openclaw: "workspace skills，递归发现扁平化。", diff: "技能是两代共享最强的概念：迁移器只搬运，标准由 agentskills.io 持有。", status: "SKILL.md" },
    config: { hermes: "config.yaml 的 model/providers/custom_providers；三种 transport（chat_completions / codex responses / anthropic messages）。", openclaw: "导入时逐条识别 Hermes 的三种 transport（迁移文档点名 Hermes schema）。", diff: "配置迁移不是字段映射而是协议认领：OpenClaw 认识 Hermes 的 wire 语言。", status: "CONFIG" },
    cron: { hermes: "cron/jobs.json + 19 平台白名单交付。", openclaw: "automations（同源概念，文档声明）。", diff: "定时 automation 是概念族成员；但 Hermes-only 的 claim 字段刻意不迁移。", status: "AUTOMATION" },
    migrate: { hermes: "hermes claw migrate 反向导入 OpenClaw；认 .openclaw/.clawdbot/.moltbot 三代目录名（claw.py:56）。", openclaw: "openclaw migrate apply hermes 从 ~/.hermes 导入。", diff: "双向迁移器互认对方家目录——连旧名都认，说明“认历史”本身就是竞争策略。", status: "MIGRATORS" },
    notmine: { hermes: "Hermes 侧对命令白名单/凭据有选择导入。", openclaw: "plugins/、sessions/、logs/ 在 openclaw 侧 archive-only 不加载；honcho 记为 manual-review。", diff: "运行时私有资产两边都不带走——不迁移清单即产品差异化清单。", status: "BOUNDARY" },
  });
  initSurface("#hm-surfaces", {
    cli: [["进程形态", "前台单进程（cli.py:5011 HermesCLI，prompt_toolkit）"], ["接入协议", "终端 REPL + slash 命令（cli.py:11812）"], ["会话落点", "agent:main:cli… → ~/.hermes/state.db"], ["场景", "本机干活，interrupt-and-redirect 最顺手"]],
    gateway: [["进程形态", "常驻 asyncio 进程（gateway/run.py:30478）"], ["接入协议", "Telegram/Discord/Slack/WhatsApp/Signal/微信… 23+ 适配器"], ["会话落点", "build_session_key = agent:main:&lt;platform&gt;:&lt;chat_type&gt;:&lt;chat_id&gt;"], ["场景", "人在外面，agent 在云上 VM 干活"]],
    tui: [["进程形态", "TS(Ink) 前端 + Python 子进程"], ["接入协议", "stdio 换行分隔 JSON-RPC（tui_gateway/server.py:2463）"], ["会话落点", "同内核同 DB，“TS owns the screen”"], ["场景", "富交互终端体验"]],
    desktop: [["进程形态", "Electron + headless hermes serve"], ["接入协议", "复用 tui_gateway 的 WS 变体（/api/ws，ws.py handle_ws）"], ["会话落点", "已有 gateway 时路由过去而非本地 spawn（connection-config.ts:692）"], ["场景", "图形壳，同一记忆"]],
    acp: [["进程形态", "被 Zed 拉起的 stdio 进程"], ["接入协议", "Agent Client Protocol（acp_adapter/server.py:1317：load/fork/list/resume/image）"], ["会话落点", "ACP session ↔ 内核会话"], ["场景", "在 IDE 里用同一个助理；console script hermes-acp"]],
    mcp: [["进程形态", "stdio MCP server（mcp_serve.py:623）"], ["接入协议", "MCP 10 工具（:645-1003：conversations/messages/events/permissions）"], ["会话落点", "暴露的是网关侧会话"], ["场景", "让 Claude/其他 agent 指挥 Hermes 的聊天面"]],
  });
  initChoiceDetail("#hm-atlas", {
    cost: { title: "同一会话 API 费用突然翻倍 → 先查 prompt cache 边界", body: "大概率 prompt cache 被打断：检查是否有代码在会话中途改动工具集/重建 system prompt（宪法禁止，AGENTS.md:24-29），合法破例只有压缩。定位：agent/prompt_caching.py:170 标记是否还在；_restore_or_build_system_prompt（conversation_loop.py:865）是否回退到 rebuild 路径；换过供应商触发重贴标记（:1607）属正常。若开了 compression.micro_compact，每回合重写历史都会破缓存（docs/micro-compaction.md 明示）。", status: "高频" },
    vanish: { title: "Docker/SSH 环境下整套工具突然没了 → 先查 check_fn", body: "check_fn 进程级门控：registry.py:1044 get_definitions 只放行 check_fn()=True 的工具；TTL 30s 缓存（:364）+ 瞬态失败 last-good 60s（:256-273）——Docker daemon 抖 60 秒以上就会剥工具。定位：对应工具的 check_fn（terminal_tool.py 环境注册、homeassistant_tool.py:485 等）与服务健康；另有会话级第二闸（model_tools.py:580-593，browser_exec 无 terminal 时被剥）。", status: "偶发" },
    resume: { title: "hermes --resume 老会话报 SessionResumeTooLargeError → 这是保护不是 bug", body: "沿血统链统计 active=1 消息数超 MAX_SAFE_RESUME_MESSAGES=20,000（hermes_state.py:107，assert_resume_safe :11930）。transcript 太大说明压缩没跟上。定位：compression_locks 表（common.py:496）与 should_compress 阈值（context_compressor.py:3103）；确认目标 id 是链头还是已被 fork——resolve_resume_session_id（:11556）会自动前跳，但总量仍超就拒。", status: "低频" },
    cron: { title: "one-shot 定时任务到点没触发 → 三种死法各查一处", body: "(a) 过期超 ONESHOT_GRACE_SECONDS 被拒（job 建早了/机器停了，jobs.py:2055）；(b) 活体 run_claim/fire_claim 占着（上次执行没收尾，:442/:213）；(c) 进程根本没起调度——tick 循环在 scheduler.py:7196，确认 gateway/cron 服务活着。复活命令：hermes cron rearm &lt;id&gt; → rearm_oneshot（jobs.py:2422，仅 kind==once，会重置 completed 计数）。交付没到看 _KNOWN_DELIVERY_PLATFORMS 白名单（scheduler.py:500）和 [SILENT] 标记（:552）。", status: "高频" },
  }, "FIRST EVIDENCE");
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
