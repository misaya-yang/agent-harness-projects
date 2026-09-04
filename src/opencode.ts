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
    "先清理撤销后的残留，再把用户消息与附件写成可恢复的 parts。",
    "同一会话只允许一条活动循环；新的调用等待当前执行，不另开一套状态。",
    "从最近一次压缩边界之后重建有效历史，让循环只面对一条合法时间线。",
    "三条合取：正常结束 ∧ 没有本地工具 part ∧ 回复属于最新用户；孤儿中断工具只告警，不阻断退出。",
    "汇入内建、自定义、插件与 MCP 工具，再按模型、agent 与权限生成本轮视图。",
    "稳定指令与动态上下文组装完成后开流，provider 事件被统一为可结算的 LLMEvent。",
    "工具解析出真实资源后发起 ask；等待只挂起该工作单元，不冻结整个进程。",
    "把 usage 与 cost 记入回复，同时判断上下文是否需要压缩。",
    "摘要与近期原文形成新历史；当前 v1 可能注入一条合成“继续”消息再跑。",
    "退出后异步修剪旧输出，状态转 idle，并通过事件流通知所有表面。",
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
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察一个请求如何展开为多个轮次。"; draw(); };
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
    if (type === "created") { rows += 1; sse += 1; render("session.created", "建立可查询的会话状态"); return; }
    if (type === "user") { rows += 1; sse += 1; render("message.updated (user)", "最新用户与父子关系就绪"); return; }
    if (type === "part") { sse += 1; render("part.updated (text delta)", "增量服务实时 UI，终态才成为权威 part"); return; }
    if (type === "stepfinish") { sse += 1; cost += 0.05; render("step-finish", "把 usage/cost 合并进本轮回复"); return; }
    if (type === "asked") { pending += 1; sse += 1; render("permission.asked", "等待审批；工具尚未结算"); return; }
    if (type === "replied") { pending = 0; sse += 1; render("permission.replied (always)", "级联放行同 session pending"); return; }
    if (type === "idle") { sse += 1; render("session.idle", "所有表面都可恢复可输入状态"); }
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
    if (perm === "bash") lines.push("先把命令归一成可复用的资源 pattern，再决定 always 的授权粒度");
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
    if (verdict === "ok" && action === "ask" && reply === "always") lines.push("下一条匹配同一授权模式的请求会直接放行；范围过宽会放大风险");
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
    build: { verdict: "ok", label: "清单最宽", lines: ["build 没有额外的全局 deny；高风险循环、外部目录和敏感读取仍会进入 ask。"] },
    plan: { verdict: "deny", label: "edit 现场被拒", lines: ["plan 预置 edit deny。deny 不一定改变广告清单；它也可以在调用现场直接拒绝。"] },
    explore: { verdict: "deny", label: "白名单只读", lines: ["explore 先全拒绝，再对白名单工具放行；名单外调用直接失败。"] },
    subagent: { verdict: "deny", label: "禁再派生", lines: ["子代理只继承父级 deny 与外部目录限制，allow 不继承，并默认补上 task 与 todowrite deny。"] },
  };
  const evaluate = () => {
    if (!model || !agent) {
      if (status) status.textContent = `已选 ${[model, agent].filter(Boolean).length}/2 维`;
      return;
    }
    const view = views[agent];
    const lines = ["入口：内建、自定义、插件与 MCP 工具汇入同一装配阶段。"];
    lines.push(model === "gpt5"
      ? "模型视图：GPT 新模型拿到 apply_patch，edit/write 在广告前被过滤；模型从未见过它们。"
      : "模型视图：Claude 系保留 edit/write，并过滤 apply_patch。");
    lines.push(...view.lines);
    if (agent === "plan" && model === "gpt5") lines.push("叠加效应：清单里本就没有 edit，因此 edit deny 没有目标；执行权限不能复活不可见工具。");
    if (agent === "plan") lines.push("task 对特定子代理的 deny 会直接改变 task 描述中的可选名单；可见性与执行控制使用同一份规则。");
    lines.push("MCP 工具当前通常在每次调用前强制 ask，不能把“出现在清单”理解为“已授权”。");
    lines.push("装配终点：agent 规则与会话规则合并；工具在执行现场用真实资源再次裁决。");
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
    ["② ENV", "环境块每轮重新观察：目录、平台与日期等事实"],
    ["③ RULES", "项目规则按发现链装入，读到子目录时还可按需追加更近的规则"],
    ["④ MCP", "只有当前服务提供说明时才出现对应指令段"],
    ["⑤ SKILLS", "只常驻名称与描述，正文由模型按需加载"],
    ["段序", "基础指令在前，动态事实随后；插件钩子可在末端变换 system 数组"],
    ["迁移提醒", "这是当前 v1 的重组模型；v2 把 agent 指令和 context epoch 基线明确分开"],
  ];
  const data: Record<string, { base: string; head: Array<[string, string]> }> = {
    claude: { base: "Anthropic 基础段", head: [["① BASE", "Claude 家族选择对应基础指令；agent 自定义指令存在时可整体替代它"]] },
    gpt: { base: "GPT 基础段", head: [["① BASE", "GPT 家族选择自己的基础指令；较老模型可能进入另一套兼容指令"]] },
    codex: { base: "Codex 基础段", head: [["① BASE", "Codex 在 OpenAI 家族内选择专用基础指令；环境和项目规则仍按同一顺序叠加"]] },
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
      ["工具面", "Claude 系保留 edit/write，过滤 apply_patch"],
      ["system 段", "选择 Anthropic 基础指令；动态上下文继续按固定顺序叠加"],
      ["reasoning 方言", "新模型支持自适应思考档位，旧模型不会收到不兼容参数"],
      ["判断提示", "行为突变时先比较实际工具视图，再讨论模型偏好"],
    ],
    gpt5: [
      ["工具面", "GPT 新模型只拿 apply_patch；edit/write 在广告前已被过滤"],
      ["system 段", "选择 GPT 基础指令；部分老模型进入兼容分支"],
      ["reasoning 方言", "reasoning_effort 会按模型能力裁剪，避免发送不兼容档位"],
      ["判断提示", "先查清单，再判断模型为何不用某工具"],
    ],
    codex: [
      ["工具面", "Codex 同样使用 apply_patch 视图，edit/write 不进入本轮广告"],
      ["system 段", "在 GPT 家族内选择 Codex 专用基础指令"],
      ["reasoning 方言", "沿用 OpenAI 参数方言；认证能力由对应插件接入"],
      ["判断提示", "工具视图和基础指令会同时变化，排障必须分开比较"],
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
    clean: { lines: ["父会话无覆盖：没有额外 deny 需要下传；子会话仍按自身规则求值。"], inherited: [] },
    deny: { lines: ["父含 edit deny：限制会跟进子会话，防止通过派生绕过父级禁令。"], inherited: ["edit:*→deny（继承父）"] },
    allow: { lines: ["父含 edit allow：能力不会自动下放；子会话仍需依据自身规则获批。"], inherited: [] },
  };
  const budgets: Record<string, { verdict: string; label: string; wall: string; lines: string[] }> = {
    d1sinf: {
      verdict: "deny", label: "递归封死", wall: "深度墙 depth=1",
      lines: ["深度墙：默认 depth=1，子会话再派生会在入口失败；即使权限放开，也过不了结构限制。", "步数墙：steps 未设意味着没有有限轮次预算。"],
    },
    d2s5: {
      verdict: "ok", label: "孙会话可派生", wall: "深度墙 depth=2 · steps=5",
      lines: ["深度墙：depth=2 允许再派生一层，第三层才被拦。", "步数墙：第 5 步进入收尾，要求停止工具并用文本交接。"],
    },
    d1s3: {
      verdict: "deny", label: "递归封死", wall: "深度墙 depth=1 · steps=3",
      lines: ["深度墙：depth=1，子会话无再派生权。", "步数墙：第 3 步就进入文本收尾，预算更紧。"],
    },
  };
  const evaluate = () => {
    if (!parent || !budget) {
      if (status) status.textContent = `已选 ${[parent, budget].filter(Boolean).length}/2 维`;
      return;
    }
    const p = parents[parent];
    const view = budgets[budget];
    const lines = ["入口：task 沿 parent 链计算深度，再创建普通子会话；子代理不是第二套引擎。"];
    lines.push(...p.lines);
    lines.push("派生时默认补上 task 与 todowrite deny，避免子代理继续扩张任务树或改写父级计划。");
    const chain = [...p.inherited, "task:*→deny", "todowrite:*→deny（general 预置）"];
    lines.push(`子会话规则集 = [ ${chain.join(" ， ")} ]。`);
    lines.push(...view.lines);
    lines.push("子会话递归复用主循环；事件带自己的 session 身份，父界面可折叠观察而不混写状态。");
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
    tui: [["进程形态", "主线程 UI + Worker 内的 server"], ["传输", "进程内 fetch 与 RPC 事件，不占 TCP 端口"], ["共同内核", "仍经过同一套路由和会话契约"], ["判断提示", "界面卡住先分 Worker、事件桥与会话状态"]],
    serve: [["进程形态", "独立 headless server"], ["传输", "HTTP + SSE；WebSocket 只服务交互终端"], ["共同内核", "与本地 TUI 使用同一业务路由"], ["安全提示", "局域网绑定与可选认证必须单独核对"]],
    run: [["进程形态", "一次性 headless CLI"], ["传输", "文本输出或结构化事件行"], ["审批", "无人值守模式必须显式设计批准或拒绝策略"], ["判断提示", "静默退出先查权限、过滤与重试耗尽"]],
    github: [["进程形态", "自动化进程启动 server 子进程"], ["传输", "生成 SDK 通过 HTTP 调用"], ["触发", "评论提及或工作流输入"], ["判断提示", "先证明事件与退出码契约，再谈自动化成功"]],
    acp: [["协议", "Agent Client Protocol"], ["角色", "OpenCode 作为 Agent 端"], ["能力", "新建、提示、切换模式、派生会话"], ["判断提示", "编辑器只是协议表面，不拥有另一套循环"]],
    desktop: [["进程形态", "桌面或 Web 应用"], ["传输", "同一 SDK + SSE"], ["复用", "共享终端 UI 组件与会话状态"], ["判断提示", "只换表面，不应改变持久状态语义"]],
  });
  initChoiceDetail("#oc-atlas", {
    stuck: { title: "会话被上一轮占着，或事件流断了", body: "同一会话单飞是设计。先查 idle/busy/retry，再确认客户端是否仍收到心跳与事件；不要先重启模型。", status: "FIRST CHECK · SESSION STATUS" },
    approve: { title: "默认 ask，后写规则又覆盖了 allow", body: "检查 asked 是否缺 replied，再按从后向前的命中顺序重算规则；always 只应保存必要范围。", status: "FIRST CHECK · PENDING APPROVAL" },
    dumb: { title: "压缩或修剪丢了当前任务细节", body: "检查最新摘要是否包含目标、阻塞与下一步，再看近期尾部和被清理的旧工具输出；不要把 prune 当 compaction。", status: "FIRST CHECK · MEMORY BOUNDARY" },
    model: { title: "工具视图、基础指令和参数方言一起变了", body: "先比较模型实际收到的工具清单，再比较基础指令与 reasoning 参数；模型不是不用一个从未看见的工具。", status: "FIRST CHECK · REQUEST SHAPE" },
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
