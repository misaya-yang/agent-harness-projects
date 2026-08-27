import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/opencode.css";

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

function initLoop(): void {
  const root = document.querySelector("#oc-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = [
    "message.updated (user)",
    "session.status → busy",
    "filterCompacted · 历史重建",
    "终止判定 · 三条件合取",
    "SessionTools.resolve · 装工具",
    "message.part.updated (text/reasoning delta)",
    "permission.asked",
    "message.part.updated (step-finish)",
    "message.updated (assistant, mode:\"compaction\")",
    "session.idle",
  ];
  const notes = [
    "SessionPrompt.prompt 先清理 revert 残留，再把 user 消息与附件 parts 写入事件流（prompt.ts:1052-1070）。",
    "ensureRunning 保证同 session 单飞，runLoop 进入 while(true)（run-state.ts:88 / prompt.ts:1088-1089）。",
    "filterCompacted 从最近一条摘要消息之后重放 parts，压缩对循环透明（message-v2.ts:521-578）。",
    "三条合取：finish 非 tool-calls/unknown ∧ 无待处理工具 ∧ parentID 匹配，即 break（prompt.ts:1111-1115）；孤儿中断工具不阻断退出，只先打告警（:1116-1127）。",
    "SessionTools.resolve：注册表按模型/agent 过滤 ∪ MCP ∪ 自定义，每个 execute 内嵌权限纤（tools.ts:41-121）。",
    "system 五段拼装完成后 handle.process 开流，AI SDK fullStream 适配成 LLMEvent（prompt.ts:1257-1286 / llm.ts:280-378）。",
    "bash 命令被 tree-sitter 提取 pattern，ask 挂 Deferred——这一步循环纤真的停在半空（permission/index.ts:67-110）。",
    "写 usage/cost 进 assistant 消息，顺手判定 isOverflow → needsCompaction（processor.ts:435-460,478-482）。",
    "摘要消息落库后注入合成 \"Continue if you have next steps…\"，回到第 3 步（compaction.ts:340-355,519-547）。",
    "break → 异步 prune → status idle → SSE /event 通知所有客户端回合结束（prompt.ts:1334-1339 / status.ts:42-43）。",
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
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 4 || index === 6 ? "tool" : "sys"}">${events[index]}</span></span>`);
      if (note) note.textContent = notes[index];
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `step ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察一个回合怎样被展开成事件流。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initProjection(): void {
  const root = document.querySelector("#oc-projection");
  if (!root) return;
  let rows = 0;
  let sse = 0;
  let pending = 0;
  let cost = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const render = (name?: string, note?: string) => {
    const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; };
    set("[data-sqlite]", String(rows)); set("[data-sse]", String(sse)); set("[data-pending]", String(pending)); set("[data-cost]", `¥${cost.toFixed(2)}`);
    if (name) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">e${sse}</span> <span class="k-${name.startsWith("permission") ? "tool" : "sys"}">${name}</span>${note ? ` <span class="t">${note}</span>` : ""}</span>`);
  };
  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event;
    if (type === "reset") { rows = 0; sse = 0; pending = 0; cost = 0; if (log) log.innerHTML = ""; render(); return; }
    if (type === "created") { rows += 1; sse += 1; render("session.created", "投影器 insert SessionTable"); return; }
    if (type === "user") { rows += 1; sse += 1; render("message.updated (user)", "parentID 链就绪"); return; }
    if (type === "part") { sse += 1; render("part.updated (text delta)", "节流合并，终态才进 PartTable"); return; }
    if (type === "stepfinish") { sse += 1; cost += 0.05; render("step-finish", "usage/cost UPDATE 既有 assistant 行，不新增行"); return; }
    if (type === "asked") { pending += 1; sse += 1; render("permission.asked", "Deferred 挂起，投影器不动"); return; }
    if (type === "replied") { pending = 0; sse += 1; render("permission.replied (always)", "级联放行同 session pending"); return; }
    if (type === "idle") { sse += 1; render("session.idle", "TUI 输入框解灰"); }
  }));
}

function initDecision(): void {
  const root = document.querySelector("#oc-permission");
  if (!root) return;
  let perm = "";
  let agent = "";
  let rulepos = "";
  let reply = "";
  type Rule = { permission: string; action: "allow" | "deny" };
  const baseChain = (name: string): Rule[] => {
    if (name === "plan") return [{ permission: "edit", action: "deny" }];
    if (name === "explore") return [{ permission: "*", action: "deny" }, ...["read", "grep", "glob", "bash", "webfetch", "websearch"].map((p) => ({ permission: p, action: "allow" as const }))];
    if (name === "subagent") return [{ permission: "task", action: "deny" }, { permission: "todowrite", action: "deny" }];
    return [];
  };
  const evaluate = () => {
    const badge = qs<HTMLElement>(root, "[data-verdict]");
    const label = qs<HTMLElement>(root, "[data-verdict-label]");
    const trace = qs<HTMLElement>(root, "[data-trace]");
    const status = qs<HTMLElement>(root, "[data-status]");
    if (!perm || !agent || !rulepos || !reply) {
      if (status) status.textContent = `已选 ${[perm, agent, rulepos, reply].filter(Boolean).length}/4 维`;
      return;
    }
    const chain = [...baseChain(agent)];
    if (rulepos === "pre") chain.unshift({ permission: perm, action: "allow" });
    if (rulepos === "post") chain.push({ permission: perm, action: "allow" });
    const matched = [...chain].reverse().find((rule) => rule.permission === perm || rule.permission === "*");
    const action = matched?.action ?? "ask";
    const lines: string[] = [];
    if (perm === "bash") lines.push("tree-sitter 提取命令 pattern，arity 决定 always 前缀粒度");
    lines.push(`规则链 findLast → ${matched ? `命中 ${matched.permission}:${matched.action}` : "无匹配 → 默认 ask"}`);
    let verdict = "ask";
    let outcome = "";
    if (action === "deny") { verdict = "deny"; outcome = "DeniedError 直接回给模型，不弹审批"; }
    else if (action === "allow") { verdict = "ok"; outcome = "通过，工具执行纤不停留"; }
    else {
      lines.push("pending.push(Deferred) → publish permission.asked（SSE 广播）→ 工具纤 await");
      if (reply === "once") { verdict = "ok"; outcome = "Deferred 解开，仅放行本次"; }
      if (reply === "always") { verdict = "ok"; outcome = "放行 + 会话级白名单追加，已匹配 pending 级联放行"; }
      if (reply === "reject") { verdict = "deny"; outcome = "拒绝 + 级联拒绝同 session 全部 pending，CorrectedError 带用户反馈回注"; }
    }
    lines.push(`裁决：${outcome}`);
    if (verdict === "ok" && action === "ask" && reply === "always") lines.push("示例：下一条 rm -rf other 命中 bash:rm -rf * = allow，不再弹窗");
    if (badge) badge.dataset.verdict = verdict;
    if (label) label.textContent = verdict === "ok" ? "放行" : verdict === "deny" ? "拒绝" : "挂起等待";
    if (trace) trace.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
    if (status) status.textContent = `已选 4/4 · ${verdict === "ok" ? "放行" : verdict === "deny" ? "拒绝" : "挂起等待"}`;
  };
  const select = (group: string, value: string, button: HTMLButtonElement) => {
    qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (group === "perm") perm = value; else if (group === "agentgrp") agent = value; else if (group === "rulepos") rulepos = value; else reply = value;
    evaluate();
  };
  (["perm", "agentgrp", "rulepos", "replygrp"] as const).forEach((group) => qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((button) => button.addEventListener("click", () => select(group, button.dataset.v ?? "", button))));
}

function initTools(): void {
  const root = document.querySelector("#oc-tools");
  if (!root) return;
  let model = "";
  let agent = "";
  const trace = qs<HTMLElement>(root, "[data-trace]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const label = qs<HTMLElement>(root, "[data-verdict-label]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const views: Record<string, { verdict: string; label: string; lines: string[] }> = {
    build: { verdict: "ok", label: "清单最宽", lines: ["agent 刀：build 无额外 deny——直接吃 defaults 规则集：*→allow，只有 doom_loop、external_directory、.env 读取会被 ask（agent.ts:119-134,141-154）。"] },
    plan: { verdict: "deny", label: "edit 现场被拒", lines: ["agent 刀：plan 预置 edit:*→deny（agent.ts:171-173）。注意 deny 不改清单——edit 照样交给模型，只是调用时 DeniedError 直接回给模型，不弹审批。"] },
    explore: { verdict: "deny", label: "白名单只读", lines: ["agent 刀：explore 预置 *:deny + read/grep/glob/bash/webfetch/websearch 白名单 allow（agent.ts:201-208）——名单外工具每次调用即拒。"] },
    subagent: { verdict: "deny", label: "禁再派生", lines: ["agent 刀：subagent 派生只继承父 deny 与 external_directory，allow 不继承；再补 task:*→deny + todowrite:*→deny（agent/subagent-permissions.ts:14-27）。"] },
  };
  const evaluate = () => {
    if (!model || !agent) {
      if (status) status.textContent = `已选 ${[model, agent].filter(Boolean).length}/2 维`;
      return;
    }
    const view = views[agent];
    const lines = ["入口：SessionTools.resolve 调 registry.tools()，内建 + 自定义 + 插件工具一起进过滤（tools.ts:41,92）。"];
    lines.push(model === "gpt5"
      ? "模型刀：usePatch=true（id 含 gpt-、非 oss、非 gpt-4）→ apply_patch 进清单，edit/write 在这里就被过滤，模型根本没见过（registry.ts:297-300）。"
      : "模型刀：usePatch=false → edit/write 保留，apply_patch 被过滤（registry.ts:297-300）。");
    lines.push(...view.lines);
    if (agent === "plan" && model === "gpt5") lines.push("叠加效应：清单里本就没有 edit——plan 的 edit:deny 落了空。deny 规则不能复活被模型刀过滤掉的工具，它管的是调用，不是可见性。");
    if (agent === "plan") lines.push("同一身份还带 task:general→deny（agent.ts:165-166）——这条改的才是可见性：general 从 task 工具描述的可用子代理清单里消失（registry.ts:266-268）。");
    lines.push("MCP 刀：MCP 工具全部进清单、不做预过滤，每次调用前 ctx.ask 强制闸门（tools.ts:390,409）。");
    lines.push("装配终点：每个 execute 内嵌 ctx.ask，规则集 = agent.permission ∪ session.permission（tools.ts:87）——权限裁决发生在调用现场，不在清单装配时。");
    const eff = { verdict: view.verdict, label: view.label };
    if (agent === "plan" && model === "gpt5") { eff.verdict = "ask"; eff.label = "edit 不在清单 · deny 落空"; }
    if (trace) trace.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
    if (badge) badge.dataset.verdict = eff.verdict;
    if (label) label.textContent = eff.label;
    if (status) status.textContent = `${model === "gpt5" ? "GPT-5 系" : "claude 系"} × ${agent} · ${eff.label}`;
  };
  const select = (group: string, value: string, button: HTMLButtonElement) => {
    qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (group === "modelgrp") model = value; else agent = value;
    evaluate();
  };
  (["modelgrp", "agentgrp"] as const).forEach((group) => qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((button) => button.addEventListener("click", () => select(group, button.dataset.v ?? "", button))));
}

function initSystem(): void {
  const root = document.querySelector("#oc-system");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const base = qs<HTMLElement>(root, "[data-base]");
  const tail: Array<[string, string]> = [
    ["② ENV", "&lt;env&gt; 块每次 step 现生成：工作目录、平台、时间（prompt.ts:1258 sys.environment）"],
    ["③ RULES", "AGENTS.md 指令链 instruction.system()（prompt.ts:1259）"],
    ["④ MCP", "&lt;mcp_instructions&gt;：无挂起 server 时整段缺席（prompt.ts:1260）"],
    ["⑤ SKILLS", "&lt;available_skills&gt;：只给目录清单，模型按需读全文（prompt.ts:1257 sys.skills）"],
    ["段序", "[agent.prompt|BASE, ...env, ...instructions, mcp?, skills?] 在请求组装处定形（prompt.ts:1257-1269 → session/llm/request.ts:58-66）；experimental.chat.system.transform 还能在末端改段（:69-73）"],
    ["池子", "14 个内嵌 .txt，system.ts 只 import 其中 9 个；plan/build-switch/plan-mode 走 reminders.ts 作回合提醒、不进 system（reminders.ts:11-13）；copilot-gpt-5 与 plan-reminder-anthropic 两个文件在当前 checkout 已无引用点"],
  ];
  const data: Record<string, { base: string; head: Array<[string, string]> }> = {
    claude: { base: "anthropic.txt", head: [["① BASE", "provider() 命中 claude 分支 → anthropic.txt（system.ts:41）。agent.prompt 存在则整段替换基础段（request.ts:60）"]] },
    gpt: { base: "gpt.txt", head: [["① BASE", "gpt 分支 → gpt.txt（system.ts:34-38）。老模型先被截走：gpt-4/o1/o3 在 :32-33 绕进 beast.txt"]] },
    codex: { base: "codex.txt", head: [["① BASE", "gpt 分支内嵌 codex 子判定 → codex.txt（system.ts:35-37）。同一个 openai provider，换的只是文案段"]] },
  };
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = [...item.head, ...tail].map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");
    if (base) base.textContent = item.base;
    if (status) status.textContent = `${button.textContent ?? "已选"} · 只换 BASE 段`;
  }));
}

function initModels(): void {
  const root = document.querySelector("#oc-models");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const data: SurfaceData = {
    claude: [
      ["工具面", "usePatch=false：edit/write 在清单、apply_patch 被过滤（registry.ts:297-300）"],
      ["system 段", "anthropic.txt（system.ts:41）；五段里只有 BASE 随家族换"],
      ["reasoning 方言", "新 claude 走 adaptive thinking 档位 low..max，老模型不下发该参数（transform.ts:655-682）"],
      ["排查提示", "换模型行为突变，先 diff 两家的 registry.tools() 输出"],
    ],
    gpt5: [
      ["工具面", "usePatch=true：只给 apply_patch，edit/write 在 registry.tools() 就被过滤（registry.ts:297-300）——模型不是不想用 edit，是从没见过"],
      ["system 段", "gpt.txt；gpt-4/o1/o3 先绕 beast.txt（system.ts:32-38）"],
      ["reasoning 方言", "reasoning_effort 档位按发布日期裁剪，老模型对 none/xhigh 直接 400（transform.ts:584-644）"],
      ["排查提示", "对照第 04 章流水线：先查清单，再怪模型"],
    ],
    codex: [
      ["工具面", "同受 usePatch 刀口：id 含 gpt- → edit/write 出局，只剩 apply_patch（registry.ts:297-300）"],
      ["system 段", "codex.txt：gpt 分支内嵌 codex 子判定（system.ts:35-37）"],
      ["reasoning 方言", "同 openai 方言系；OAuth 来自内置 codex 插件（plugin/index.ts:12），插件钩子汇集于 provider/auth.ts:116-125"],
      ["排查提示", "工具面与文案同时换——第 12 章症状定位器 model 行的完整链路"],
    ],
  };
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    detail.innerHTML = item.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");
    if (status) status.textContent = `${button.textContent ?? "已选"} · 视图已切换`;
  }));
}

function initTaskLab(): void {
  const root = document.querySelector("#oc-subagent");
  if (!root) return;
  let parent = "";
  let budget = "";
  const trace = qs<HTMLElement>(root, "[data-trace]");
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const label = qs<HTMLElement>(root, "[data-verdict-label]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const parents: Record<string, { lines: string[]; inherited: string[] }> = {
    clean: { lines: ["父会话无覆盖：session.permission 为空，继承过滤器无 deny 可抄（subagent-permissions.ts:21-23）。"], inherited: [] },
    deny: { lines: ["父含 edit:deny → 命中继承过滤器（只留 deny 与 external_directory），进子会话规则集（subagent-permissions.ts:21-23）——父的禁令跟着子代理走。"], inherited: ["edit:*→deny（继承父）"] },
    allow: { lines: ["父含 edit:allow → 不满足过滤器条件：allow 不继承（subagent-permissions.ts:21-23）——子会话照样按自身规则弹审批，父会话的白名单帮不上忙。"], inherited: [] },
  };
  const budgets: Record<string, { verdict: string; label: string; wall: string; lines: string[] }> = {
    d1sinf: {
      verdict: "deny", label: "递归封死", wall: "深度墙 depth=1",
      lines: ["深度墙：subagent_depth 缺省 1。子会话再调 task 时沿 parentID 数到 depth=1 ≥ 1 → 入口直接 fail “Subagent depth limit reached”（task.ts:104-117）——就算规则集被放开，套娃也过不了计数。", "步数墙：agent.steps 未设 → maxSteps=Infinity，时间墙立不起来（prompt.ts:1178）。"],
    },
    d2s5: {
      verdict: "ok", label: "孙会话可派生", wall: "深度墙 depth=2 · steps=5",
      lines: ["深度墙：subagent_depth=2 → 子会话再派生一层合法，第三层调用才被拦（task.ts:111-117）。", "步数墙：steps=5 → 第 5 步 isLastStep，messages 尾部注入 MAX_STEPS_PROMPT：禁工具、要求文本总结（prompt.ts:1178-1179,1281）。"],
    },
    d1s3: {
      verdict: "deny", label: "递归封死", wall: "深度墙 depth=1 · steps=3",
      lines: ["深度墙：subagent_depth=1 → 子会话无派生权（task.ts:104-117）。", "步数墙：steps=3 → 预算更紧，第 3 步就注入 MAX_STEPS_PROMPT 逼模型收口（prompt.ts:1178-1179,1281）。"],
    },
  };
  const evaluate = () => {
    if (!parent || !budget) {
      if (status) status.textContent = `已选 ${[parent, budget].filter(Boolean).length}/2 维`;
      return;
    }
    const p = parents[parent];
    const view = budgets[budget];
    const lines = ["入口：task 工具沿 parentID 链上溯计 depth（task.ts:104-110），再 sessions.create 出带 parentID 的子会话（:155-170）——子代理只是一个普通会话。"];
    lines.push(...p.lines);
    lines.push("派生追加：task:*→deny——general 自身没声明 task 规则（task.ts:144-150）。todowrite 已由 general 预置 deny（agent.ts:188），经合并后的规则集在调用现场生效（tools.ts:87）。");
    const chain = [...p.inherited, "task:*→deny", "todowrite:*→deny（general 预置）"];
    lines.push(`子会话规则集 = [ ${chain.join(" ， ")} ]。`);
    lines.push(...view.lines);
    lines.push("回合复用：子会话走 promptOps.prompt() 递归调用主链路（task.ts:202-213）；事件在共享总线以子 sessionID 发布，TUI 靠 parentSessionId 折叠渲染（:186）。");
    if (trace) trace.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
    if (badge) badge.dataset.verdict = view.verdict;
    if (label) label.textContent = view.label;
    if (status) status.textContent = `已选 2/2 维 · 规则集 deny×${chain.length} · ${view.wall}`;
  };
  const select = (group: string, value: string, button: HTMLButtonElement) => {
    qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (group === "parentgrp") parent = value; else budget = value;
    evaluate();
  };
  (["parentgrp", "budgetgrp"] as const).forEach((group) => qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((button) => button.addEventListener("click", () => select(group, button.dataset.v ?? "", button))));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  initTheme();
  initSeriesNav();
  initReveal(reduced.matches);
  initNavMenu();
  initHeroPause();
  initLoop();
  initProjection();
  initDecision();
  initTools();
  initSystem();
  initModels();
  initTaskLab();
  initSurface("#oc-surfaces", {
    tui: [["进程形态", "主线程 Solid UI + Bun Worker server"], ["传输", "in-worker app.fetch + RPC 事件（零 TCP）"], ["证据", "cli/cmd/tui.ts:54-56,240 / cli/tui/worker.ts:31-49"], ["开关", "--port 才真 listen（worker.ts:56）"]],
    serve: [["进程形态", "opencode serve 独立进程"], ["传输", "HTTP + SSE /event；WS 仅 PTY"], ["证据", "server.ts:73 / groups/event.ts:9-14"], ["鉴权", "OPENCODE_SERVER_PASSWORD，缺省裸奔警告（serve.ts）"]],
    run: [["进程形态", "opencode run \"…\" 一次性"], ["传输", "stdout 文本或 --format json 事件行"], ["证据", "cli/cmd/run.ts:127,174-178,679"], ["审批", "--auto/--yolo 即时 reply once，否则自动 reject（run.ts:274,801-816）"]],
    github: [["进程形态", "node 编排进程 spawn opencode serve 子进程"], ["传输", "SDK HTTP"], ["证据", "github/index.ts:235-236 / action.yml"], ["触发", "@opencode/@oc mention + prompt input"]],
    acp: [["协议", "ACP（Agent Client Protocol）ndJSON"], ["角色", "opencode 是 agent 端"], ["证据", "acp/agent.ts:19（@agentclientprotocol/sdk）"], ["方法", "newSession/prompt/setSessionMode/forkSession…"]],
    desktop: [["进程形态", "Electron / Vite SPA"], ["传输", "同一 SDK + SSE（baseUrl 指向 serve）"], ["证据", "electron.vite.config.ts / tui/context/sdk.tsx:23-29"], ["复用", "desktop 内嵌 TUI 组件（@opentui）"]],
  });
  initChoiceDetail("#oc-atlas", {
    stuck: { title: "会话被上一轮占着，或 SSE 断了", body: "ensureRunning 对 busy 会话抛 BusyError，单飞是设计而非 bug。先查 session.status 事件流，再查 TUI 的 SSE 重连日志（retryDelay 1s→30s）。", status: "SESSION · run-state.ts:74-107" },
    approve: { title: "默认动作就是 ask", body: "evaluate 无匹配规则时返回 {action:\"ask\"}，且 findLast 让后置规则覆盖前置——你的 allow 可能写在上面被压掉了。查 permission 配置顺序与 Reply: always 白名单。", status: "PERMISSION · index.ts:28-37,67-110" },
    dumb: { title: "压缩边界吃掉了关键上下文", body: "每轮只重放“最后一条摘要之后”的消息，PRUNE 还会清空 40k token 之外的老工具输出。看 MessageTable 里 mode:\"compaction\" 行与 [Old tool result content cleared] 占位。", status: "COMPACTION · message-v2.ts:521 + compaction.ts:273-317" },
    model: { title: "工具视图和 prompt 都随模型家族换了", body: "GPT-5 系只拿 apply_patch 没有 edit/write，system 段从 anthropic.txt 换成 gpt/codex.txt，reasoning 参数翻译成各家方言。对比 registry.tools() 与 SystemPrompt.provider() 的分支。", status: "MODEL · registry.ts:297-300 + system.ts:27-49" },
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
