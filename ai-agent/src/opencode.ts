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

type SurfaceData = Record<string, Array<[string, string]>>;
type Verdict = { state: "ok" | "deny" | "ask"; label: string; trace: string[] };

const qs = <T extends Element>(root: ParentNode, selector: string): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(root: ParentNode, selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));

function element(tag: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function onPick(root: Element, selector: string, onSelect: (button: HTMLButtonElement) => void): void {
  const buttons = qsa<HTMLButtonElement>(root, selector);
  buttons.forEach((button) => button.addEventListener("click", () => {
    buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    onSelect(button);
  }));
}

function initSurface(id: string, data: SurfaceData): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  onPick(root, "[data-key]", (button) => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    detail.replaceChildren(...item.map(([term, value]) => {
      const row = document.createElement("div");
      row.append(element("dt", term), element("dd", value));
      return row;
    }));
    if (status) status.textContent = button.textContent;
  });
}

function initMatrix(
  id: string,
  groups: string[],
  evaluate: (choices: Record<string, string>) => Verdict,
): void {
  const root = document.querySelector(id);
  if (!root) return;
  const badge = qs<HTMLElement>(root, "[data-verdict]");
  const label = qs<HTMLElement>(root, "[data-verdict-label]");
  const trace = qs<HTMLElement>(root, "[data-trace]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const choices: Record<string, string> = {};
  groups.forEach((group) => onPick(root, `[data-${group}] button`, (button) => {
    const value = button.dataset.v;
    if (!value) return;
    choices[group] = value;
    const selected = Object.keys(choices).length;
    if (selected < groups.length) {
      if (status) status.textContent = `已选 ${selected}/${groups.length} 个维度`;
      return;
    }
    const result = evaluate(choices);
    if (badge) badge.dataset.verdict = result.state;
    if (label) label.textContent = result.label;
    trace?.replaceChildren(...result.trace.map((line) => element("li", line)));
    if (status) status.textContent = result.label;
  }));
}

function appendEvent(log: HTMLElement | null, index: number, name: string, note = ""): void {
  if (!log) return;
  const entry = document.createElement("span");
  entry.className = "ev";
  const order = element("span", String(index).padStart(2, "0"));
  const event = element("span", name);
  order.className = "t";
  event.className = "k-sys";
  entry.append(order, " ", event, note ? ` · ${note}` : "");
  log.append(entry);
  log.scrollTop = log.scrollHeight;
}

function initLoop(): void {
  const root = document.querySelector("#oc-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const walkthrough = [
    ["session.inbox.enqueued", "受理写入持久 Inbox。客户端此时已能收到成功响应。"],
    ["session.execution.started", "唤醒按 Session ID 合并。在同一进程中，同一个 Session 由一个协调器负责运行。"],
    ["session.inbox.delivered", "安全边界中移除 Inbox 待处理项并写入用户消息。"],
    ["SessionContext.load", "按 Location 加载工具视图、指令与本模型兼容的历史。"],
    ["session.step.started", "Runner 用一次 llm.stream 发起这个模型 Step。"],
    ["session.tool.called", "先发布调用，再启动本地工具。需要审批时，工具挂在自己的 Deferred。"],
    ["session.step.streamed", "Provider 流已读完，Step 仍要等工具结算。这个示例的等待跨过模型输出边界。"],
    ["session.tool.success → session.step.ended", "审批放行，工具结算，记录模型用量。本地调用使结果需要回注。"],
    ["session.step.started → session.step.ended", "第二个 Step 重读历史并读取工具结果。本例的模型答复无需再调用工具。"],
    ["session.execution.succeeded", "Runner 检查 Inbox 和适用的 idle hook。无后续工作，结束该轮执行。"],
  ];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const initialNote = note?.textContent ?? "";
  const draw = () => {
    steps.forEach((item, i) => {
      item.classList.toggle("is-now", i === index);
      item.classList.toggle("is-done", i < index);
    });
    const current = walkthrough[index];
    if (current) appendEvent(log, index + 1, current[0]);
    if (note) note.textContent = current?.[1] ?? initialNote;
    const done = index === steps.length - 1;
    if (phase) phase.textContent = index < 0 ? "idle" : done ? "完成" : `进度 ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && !done);
    led?.classList.toggle("is-done", done);
  };
  const reset = () => {
    clearInterval(timer);
    index = -1;
    log?.replaceChildren();
    draw();
  };
  const step = () => {
    if (index >= steps.length - 1) return;
    index += 1;
    draw();
    if (index === steps.length - 1) clearInterval(timer);
  };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => {
    clearInterval(timer);
    if (index === steps.length - 1) reset();
    step();
    if (index < steps.length - 1) timer = window.setInterval(step, 700);
  });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initProjection(): void {
  const root = document.querySelector("#oc-projection");
  if (!root) return;
  const events: Record<string, { name: string; note: string; durable?: true; pending?: number }> = {
    enqueued: { name: "session.inbox.enqueued", note: "受理后有待处理 Inbox 行", durable: true },
    delivered: { name: "session.inbox.delivered", note: "同事务消费待处理项并写入用户消息", durable: true },
    delta: { name: "session.text.delta", note: "实时文本片段" },
    ended: { name: "session.text.ended", note: "完整文本进入投影", durable: true },
    asked: { name: "permission.asked", note: "待批项在进程内", pending: 1 },
    replied: { name: "permission.replied", note: "本例仅答复一条 once 审批", pending: -1 },
    stepfinish: { name: "session.step.ended", note: "写入 Step 结算和用量投影", durable: true },
    idle: { name: "session.execution.succeeded", note: "投影显示本次执行达到成功终态", durable: true },
  };
  let durable = 0;
  let retained = 0;
  let frames = 0;
  let pending = 0;
  let logIndex = 0;
  let retainEvents = false;
  let connected = true;
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const retention = qs<HTMLButtonElement>(root, '[data-event="retention"]');
  const connection = qs<HTMLButtonElement>(root, '[data-event="connection"]');
  const counters = ["[data-sqlite]", "[data-retained]", "[data-sse]", "[data-pending]"].map((name) =>
    qs<HTMLElement>(root, name),
  );
  const render = () => {
    [durable, retained, frames, pending].forEach((value, i) => {
      const node = counters[i];
      if (node) node.textContent = String(value);
    });
    if (status) status.textContent = `${connected ? "SSE 已连接" : "SSE 已断线"} · ${retainEvents ? "留存正文" : "正文留存关闭"}`;
    retention?.setAttribute("aria-pressed", String(retainEvents));
    connection?.setAttribute("aria-pressed", String(!connected));
  };

  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event ?? "";
    if (type === "reset") {
      durable = 0;
      retained = 0;
      frames = 0;
      pending = 0;
      logIndex = 0;
      retainEvents = false;
      connected = true;
      log?.replaceChildren();
      render();
      return;
    }
    if (type === "retention") {
      retainEvents = !retainEvents;
      appendEvent(log, ++logIndex, "服务留存设置", retainEvents ? "后续持久类事件将额外留存正文" : "后续提交仍更新查询投影");
      render();
      return;
    }
    if (type === "connection") {
      connected = !connected;
      const message = connected ? "继续接收新帧，遗漏状态由快照或已留存日志补齐" : "后续帧将被错过，服务器照常处理事件";
      appendEvent(log, ++logIndex, connected ? "SSE 重连" : "SSE 断线", message);
      render();
      return;
    }
    const event = events[type];
    if (!event) return;
    if (event.pending === -1 && pending === 0) return;
    if (event.durable) durable += 1;
    if (event.durable && retainEvents) retained += 1;
    if (connected) frames += 1;
    pending += event.pending ?? 0;
    const delivery = connected ? "已收实时帧" : "实时帧遗漏";
    appendEvent(log, ++logIndex, event.name, `${event.note} · ${delivery}`);
    render();
  }));
}

function initDecision(): void {
  initMatrix("#oc-permission", ["perm", "agentgrp", "rulepos", "savedgrp", "replygrp"], ({ perm, agentgrp, rulepos, savedgrp, replygrp }) => {
    const resource = perm === "protected" ? "protected/guide.md" : "docs/guide.md";
    const denied = agentgrp === "deny" && perm === "protected";
    const trace = [`请求 action=edit，resource=${resource}。`];
    if (rulepos === "allow") {
      trace.push("Session 的资源级 allow 后置，覆盖同资源的其他配置匹配。");
      return { state: "ok", label: "规则直接放行", trace };
    }
    if (denied) {
      trace.push("Agent 的 protected/* deny 是此资源的最后一条配置匹配。先拒绝，已有项目级保存规则也无法覆盖。");
      return { state: "deny", label: "配置直接拒绝", trace };
    }
    if (savedgrp === "allow") {
      trace.push("无生效的配置 deny，项目保存的 allow 匹配当前资源。本例直接放行。");
      return { state: "ok", label: "项目历史批准放行", trace };
    }
    trace.push("无匹配，且本例没有已保存的 allow。发布 permission.asked，工具等待 Deferred。");
    if (replygrp === "always") {
      trace.push("本例的请求附带可保存资源。持久保存项目级 allow，并重评当前 Location 内待批项。");
      return { state: "ok", label: "放行并保存", trace };
    }
    if (replygrp === "once") {
      trace.push("仅完成本次 Deferred。");
      return { state: "ok", label: "放行本次", trace };
    }
    trace.push("拒绝同 Session、同来源消息的审批批次。");
    trace.push(replygrp === "reject" ? "反馈可作为工具失败交给模型。" : "无反馈的拒绝可中断当前 Step。");
    return { state: "deny", label: "用户拒绝", trace };
  });
}

function initTools(): void {
  initMatrix("#oc-tools", ["modelgrp", "rulegrp"], ({ modelgrp, rulegrp }) => {
    const list = modelgrp === "patch" ? "patch" : "edit、write";
    const trace = [`模型政策选出 ${list}。这组工具都受 edit action 的权限约束。`];
    if (rulegrp === "deny") {
      trace.push("最后的 edit 规则为 resource=* 的 deny，工具快照移除整类编辑工具。");
      return { state: "deny", label: "编辑工具隐藏", trace };
    }
    trace.push("保留在可访问工具快照中。Code Mode 设置决定工具是直接定义还是目录入口。");
    if (rulegrp === "scoped") {
      trace.push("调用落到 protected/guide.md 时检查到资源级 deny。其他资源仍按自身匹配裁决。");
      return { state: "ask", label: "可见 · 路径单独裁决", trace };
    }
    trace.push("本例的 edit:* allow 在配置检查时满足所有文件资源。");
    return { state: "ok", label: "可见 · 示例规则放行", trace };
  });
}

function initTaskLab(): void {
  initMatrix("#oc-subagent", ["parentgrp", "budgetgrp", "grantgrp"], ({ parentgrp, budgetgrp, grantgrp }) => {
    const depth = parentgrp === "child" ? 1 : 0;
    const limit = budgetgrp === "one" ? 1 : 2;
    const trace = [`沿 parentID 上溯：当前深度 ${depth}，配置上限 ${limit}。`];
    if (depth >= limit) {
      trace.push("深度达到上限，在创建或复用子会话前失败。");
      return { state: "deny", label: "深度已满", trace };
    }
    trace.push("教学示例选择可作子代理的 agent。权限请求是 subagent:<agent ID>。");
    if (grantgrp === "deny") {
      trace.push("父会话调用被权限规则拒绝。");
      return { state: "deny", label: "派生被拒绝", trace };
    }
    if (grantgrp === "ask") {
      trace.push("等待审批回复，获批才启动子任务。");
      return { state: "ask", label: "等待派生审批", trace };
    }
    trace.push(
      "新 child 继承 Location 和显式父会话权限。子代理的后续工具还要按子 agent/session 规则裁决。",
      "先受理子输入，再交给后台 Job；工具迅速返回 child ID。",
      "子任务结算时写入待交付报告，父 Inbox 用通知 ID 受理。下一安全边界才进入父历史。",
    );
    return { state: "ok", label: "启动后台子任务", trace };
  });
}

function initAtlas(): void {
  const root = document.querySelector("#oc-atlas");
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const data: Record<string, [string, string]> = {
    stuck: ["查 Inbox 交付与 Step 边界", "已受理但未交付时，核对 delivery、当前运行与控制项。已出现 session.step.streamed 但缺结算时，检查工具状态和待批请求。"],
    approve: ["查本次请求资源和保存字段", "检查 action/resource 的末条配置匹配、项目保存范围和客户端回复。没有可保存资源时，always 只完成本次。"],
    dumb: ["查压缩记录与模型兼容性", "比较旧窗口记录中的 Provider ID、模型 ID 与新模型。跳过不兼容窗口时，确认 Runner 是否重新读取较早的历史。"],
    model: ["查未结算的本地或托管调用", "用 Step 与工具终态确定是否卡在旧记录清理。核对执行 claim 的恢复状态及外部工具实际是否已提交。"],
  };
  onPick(root, "[data-key]", (button) => {
    const item = data[button.dataset.key ?? ""];
    if (!item || !detail) return;
    detail.replaceChildren(element("h3", item[0]), element("p", item[1]));
    if (status) status.textContent = button.textContent;
  });
}

function boot(): void {
  initTheme();
  initSeriesNav();
  initReveal(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  initNavMenu();
  initHeroPause();
  initLoop();
  initProjection();
  initDecision();
  initTools();
  initTaskLab();
  initSurface("#oc-surfaces", {
    tui: [["启动", "默认连接托管本地服务"], ["边界", "TUI 持有视图状态，通过客户端提交 prompt 并监听事件"]],
    remote: [["启动", "--server 显式指向已有服务"], ["边界", "客户端先查询服务信息，实际执行由目标服务和会话 Location 决定"]],
    serve: [["启动", "opencode serve 独立提供服务，可指定 STDIO"], ["边界", "服务端运行 Session 与投影，接入端消费响应与状态"]],
    run: [["启动", "opencode run 是一次性客户端"], ["审批", "非交互模式默认带反馈拒绝；自动通过时回复 once"], ["输出", "由客户端读取状态和事件后输出"]],
    acp: [["宿主", "IDE 等 ACP 客户端"], ["适配", "ACP 入口通过内部客户端提交会话输入并转换 Step、工具和审批事件"]],
    desktop: [["宿主", "桌面应用与服务连接"], ["边界", "渲染器使用 sidecar 或已保存的服务器连接，服务端持有 Session"]],
  });
  initSurface("#oc-system", {
    default: [["基础 system", "默认 system.txt 随工具视图渲染专用指导"], ["指令基线", "按通用到会话专有的顺序合并指令"], ["请求", "历史转换后交给会话 hook 与模型路由"]],
    custom: [["基础 system", "agent.system 替换基础文本"], ["指令基线", "独立保留指令来源与 Session 历史"], ["请求", "同样应用会话 hook"]],
    changed: [["基础 system", "agent 及工具视图保持时可复用"], ["指令更新", "指令状态记录变化，后续历史可带更新"], ["压缩", "压缩完成后推进指令 epoch"]],
  });
  initSurface("#oc-models", {
    compatible: [["工具", "示例模型用 edit、write，隐藏 patch"], ["传输", "利用所选模型的 HTTP 路由"], ["观测", "模型事件规范化后由 Step 归档"]],
    patch: [["工具", "模型 ID 符合策略时提供 patch；权限仍叫 edit"], ["模型参数", "variant 与 Provider 路由一起解析"], ["观测", "对照请求快照与工具策略分辨不可见还是被拒绝"]],
    websocket: [["传输", "模型选择和传输配置允许时使用 Session 的 Provider WebSocket"], ["回退", "建立连接失败后，会话固定使用 HTTP，直到服务重启或会话迁移等让连接所有者重建"], ["观测", "客户端的服务器 SSE 独立于 Provider 的连接"]],
  });
  initAtlas();
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
