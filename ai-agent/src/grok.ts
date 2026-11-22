import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";
import "./styles/grok.css";

import { initReveal } from "./modules/reveal";
import { initChapterReader } from "./modules/chapter-reader";
import { initNavMenu } from "./modules/navmenu";
import { initTheme } from "./modules/theme";
import { initSeriesNav } from "./modules/series-nav";
import { initHeroPause } from "./modules/hero-pause";

type Detail = { title: string; body: string; status?: string };

const qs = <T extends Element>(root: ParentNode, selector: string): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(root: ParentNode, selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));

function initChoiceDetail(id: string, data: Record<string, Detail>): void {
  const root = document.querySelector(id);
  if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]");
  const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = data[button.dataset.key ?? ""];
      if (!item || !detail) return;
      qsa<HTMLButtonElement>(root, "[data-key]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      detail.innerHTML = `<span class="label-mono">OWNING LAYER</span><h3>${item.title}</h3><p>${item.body}</p>`;
      if (status) status.textContent = item.status ?? button.textContent ?? "selected";
    });
  });
}

function initTurn(): void {
  const root = document.querySelector("#grok-turn");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const logs = [
    "session/prompt → queue", "round → 当前会话状态", "采样请求 → messages + tools",
    "session/update → agent_message_chunk", "tool_use → run_terminal_command", "准备 → 审批 → 执行",
    "tool_result ↔ call ID → 再次采样", "文本候选 → 待办、插话与外层续跑检查",
  ];
  const notes = [
    "SessionActor 接纳普通 prompt，按会话队列安排。", "这一轮使用会话当前的模型、工具和对话状态。", "宿主启动一次可取消的流式采样。",
    "客户端可先显示增量，宿主仍需检查该采样的提交权。", "工具请求带调用 ID，后面的结果用同一 ID 配对。", "批准的调用进入执行，实际进程和文件状态由 Workspace 管理。",
    "工具结果进入对话，可供下一次采样读取。", "下一次采样给出文本后，先检查待办提醒与插话。自然结束的候选结果仍受 Stop hook 和 goal 状态影响。",
  ];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const draw = () => {
    steps.forEach((step, i) => { step.classList.toggle("is-now", i === index); step.classList.toggle("is-done", i < index); });
    if (index >= 0 && log) log.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(index + 1).padStart(2, "0")}</span> <span class="k-${index === 4 || index === 5 ? "tool" : "model"}">${logs[index]}</span></span>`);
    if (note && index >= 0) note.textContent = notes[index];
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `step ${index + 1}/8`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 650); });
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "逐步观察提议、裁决、执行、证据回填与终止如何交接。"; draw(); };
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
}

function initEvents(): void {
  const root = document.querySelector("#grok-events");
  if (!root) return;
  const events = [
    ["client", "initialize"], ["sys", "ACP capabilities"], ["client", "session/new"], ["sys", "sessionId: s1"],
    ["client", "session/prompt → s1"], ["model", "session/update · agent_message_chunk"],
    ["model", "session/update · agent_thought_chunk"], ["client", "session/cancel → s1"],
    ["warn", "宿主清除在途采样的请求归属"], ["sys", "PromptResponse · stopReason: cancelled"],
    ["sys", "模拟旧请求的结果晚到"], ["warn", "没有请求归属，旧结果及其统计被忽略"],
  ];
  let cursor = 0;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const restart = () => { clearInterval(timer); cursor = 0; if (log) log.innerHTML = ""; if (phase) phase.textContent = `0/${events.length}`; };
  const tick = () => {
    const event = events[cursor]; if (!event) { clearInterval(timer); return; }
    log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(cursor).padStart(2, "0")}</span> <span class="k-${event[0]}">${event[1]}</span></span>`);
    cursor += 1; if (phase) phase.textContent = `${cursor}/${events.length}`; log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  };
  qs<HTMLButtonElement>(root, "[data-play]")?.addEventListener("click", () => { if (cursor >= events.length) restart(); clearInterval(timer); tick(); timer = window.setInterval(tick, 430); });
  qs<HTMLButtonElement>(root, "[data-restart]")?.addEventListener("click", restart);
}

function initSafety(): void {
  const root = document.querySelector("#grok-safety");
  if (!root) return;
  let op = "";
  let mode = "";
  let sandbox = "off";
  for (const group of ["op", "mode", "sandbox"]) {
    const buttons = qsa<HTMLButtonElement>(root, `[data-${group}] button`);
    buttons.forEach((button) => button.addEventListener("click", () => {
      buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      const value = button.dataset.v ?? "";
      if (group === "op") op = value;
      else if (group === "mode") mode = value;
      else sandbox = value;
      evaluate();
    }));
  }
  const evaluate = () => {
    if (!op || !mode) return;
    let verdict: "ok" | "ask" | "deny" = "ask";
    let label = "请求批准";
    const trace = [`审批模式 ${mode} · 样例无额外规则、授权或钩子`];

    if (op === "read") {
      verdict = "ok";
      label = "审批层放行";
      trace.push("普通只读文件调用按内置规则放行。");
    } else if (mode === "always-approve") {
      verdict = "ok";
      label = "跳过普通询问";
      trace.push("always-approve 放行普通调用。真实会话仍检查 deny、钩子、匹配的 shell ask 和组织策略。");
    } else if (mode === "dontAsk") {
      verdict = "deny";
      label = "拒绝未获准的调用";
      trace.push("dontAsk 拒绝原本必须询问的操作。");
    } else if (mode === "auto") {
      label = "等待分类器";
      trace.push("根据分类结果和会话是否可交互，调用可以放行、拒绝或进入确认。");
    } else {
      trace.push("default 模式下，未提前授权的副作用进入审批。");
    }
    if (verdict !== "deny") {
      const sandboxBlocks = (op === "edit" && sandbox === "read-only")
        || (op === "network" && sandbox !== "off");
      if (sandboxBlocks) {
        trace.push(op === "edit"
          ? "即使获批，read-only 仍禁止写入这个项目文件。"
          : `即使获批，Linux 上已生效的 ${sandbox} 仍阻断命令的子进程网络。`);
        if (verdict === "ok") {
          verdict = "deny";
          label = "审批放行，沙箱阻断";
        }
      } else {
        trace.push(sandbox === "off"
          ? "这次未启用 Grok OS 沙箱。实际访问仍由运行环境决定。"
          : `这个项目内操作符合所选 Linux ${sandbox} 示例的范围。`);
      }
    }
    const badge = qs<HTMLElement>(root, "[data-verdict]"); if (badge) badge.dataset.verdict = verdict;
    const out = qs<HTMLElement>(root, "[data-verdict-label]"); if (out) out.textContent = label;
    const list = qs<HTMLElement>(root, "[data-trace]"); if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
}

function initSession(): void {
  const root = document.querySelector("#grok-session"); if (!root) return;
  const log = qs<HTMLElement>(root, "[data-log]");
  const sessionOutput = qs<HTMLElement>(root, "[data-session]");
  const updatesOutput = qs<HTMLElement>(root, "[data-updates]");
  const checkpointOutput = qs<HTMLElement>(root, "[data-checkpoint]");
  let session = 1;
  let updates = 0;
  let prompts = 0;
  const checkpoints: number[] = [];

  const render = (message?: string) => {
    if (sessionOutput) sessionOutput.textContent = String(session);
    if (updatesOutput) updatesOutput.textContent = String(updates);
    const latestCheckpoint = checkpoints.at(-1);
    if (checkpointOutput) checkpointOutput.textContent = latestCheckpoint === undefined ? "—" : `P${latestCheckpoint}`;
    if (message) log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">P${prompts}</span> <span class="k-sys">${message}</span></span>`);
  };

  qsa<HTMLButtonElement>(root, "[data-action]").forEach((button) => button.addEventListener("click", () => {
    switch (button.dataset.action) {
      case "prompt":
        prompts += 1;
        updates += 1;
        render("追加一轮对话与工具事件（演示合为一条）。");
        break;
      case "checkpoint":
        if (prompts === 0) {
          render("先添加一轮对话。");
          break;
        }
        checkpoints.push(prompts);
        updates += 1;
        render("写入压缩历史文件，追加 CompactionCheckpoint 引用。");
        break;
      case "rewind":
        if (prompts === 0) {
          render("当前没有可回退的对话。");
          break;
        }
        prompts -= 1;
        while ((checkpoints.at(-1) ?? 0) > prompts) checkpoints.pop();
        updates += 1;
        render("追加 RewindMarker。回退到最后一条 prompt 执行前，文件保持原状。");
        break;
      case "fork":
        session += 1;
        render("为分支分配新 Session ID，从当前可见历史起步。后续追加写入新会话。");
        break;
      case "resume":
        render("从既有记录恢复视图，过滤已放弃的对话分支。");
        break;
      case "reset":
        session = 1;
        updates = 0;
        prompts = 0;
        checkpoints.length = 0;
        log?.replaceChildren();
        render();
        break;
    }
  }));
}

function initContext(): void {
  const root = document.querySelector("#grok-context"); if (!root) return; let percent = 42;
  const render = (note?: string) => { const fill = qs<HTMLElement>(root, "[data-fill]"); if (fill) fill.style.width = `${percent}%`; const p = qs<HTMLElement>(root, "[data-percent]"); if (p) p.textContent = `${percent}%`; const s = qs<HTMLElement>(root, "[data-status]"); if (s) s.textContent = `${percent}%`; const policy = qs<HTMLElement>(root, "[data-policy]"); if (policy) policy.textContent = percent >= 85 ? "进入自动压缩检查" : "继续采样"; if (note) { const n = qs<HTMLElement>(root, "[data-note]"); if (n) n.textContent = note; } };
  qsa<HTMLButtonElement>(root, "[data-add]").forEach((b) => b.addEventListener("click", () => { percent = Math.min(100, percent + Number(b.dataset.add)); render(); }));
  qs<HTMLButtonElement>(root, "[data-compact]")?.addEventListener("click", () => { percent = 31; render("模拟手动压缩成功。重建约束与运行态，再记录指向压缩历史的引用。"); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => { percent = 42; render("使用 85% 回退阈值做演示。手动压缩可低于阈值触发，成功后的占用变化仅为示意。"); });
}

function initSurface(id: string, data: Record<string, Array<[string, string]>>): void {
  const root = document.querySelector(id); if (!root) return;
  const detail = qs<HTMLElement>(root, "[data-detail]"); const status = qs<HTMLElement>(root, "[data-status]");
  qsa<HTMLButtonElement>(root, "[data-key]").forEach((button) => button.addEventListener("click", () => { const item = data[button.dataset.key ?? ""]; if (!item || !detail) return; qsa<HTMLButtonElement>(root, "[data-key]").forEach((b) => b.setAttribute("aria-pressed", String(b === button))); detail.innerHTML = item.map(([term, desc]) => `<div><dt>${term}</dt><dd>${desc}</dd></div>`).join(""); if (status) status.textContent = button.textContent ?? "selected"; }));
}

function boot(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  initTheme();
  initSeriesNav();
  initReveal(reduced.matches);
  initNavMenu();
  initHeroPause();
  initTurn();
  initEvents();
  initSafety();
  initSession();
  initContext();
  initChoiceDetail("#grok-architecture", {
    render: { title: "展示与承载层", body: "先比较客户端收到的事件与最终布局；会话事实可能完全正确，只是投影错了。", status: "SURFACE" },
    stall: { title: "会话与采样层", body: "先检查当前采样是否已完成，再核对待回填工具、待办提醒或插话。看到 TurnOutcome 后查外层有没有触发下一 round。", status: "SESSION" },
    missing: { title: "能力装配与工具注册层", body: "区分工具是否被发现、是否可见、是否可派发，以及是否被当前工具集裁掉。", status: "CAPABILITY" },
    dirty: { title: "执行世界与工作区层", body: "若工具只返回后台任务句柄，先查进程终态。再用命令 cwd 和实际 VCS 或文件状态核对结果。", status: "WORKSPACE" },
  });
  initChoiceDetail("#grok-tools", {
    hidden: { title: "Agent capability selection", body: "读取最终 tool definitions，确认工具没有被 allowlist、denylist、mode 或 feature gate 裁掉。" },
    schema: { title: "Tool schema validation", body: "比较模型发出的参数与 canonical schema；名称映射不应改变内部身份。" },
    permission: { title: "PermissionManager", body: "检查审批模式、有效规则、组织策略和待审批调用。用户拒绝可中止后续准备；单条策略拒绝后，准备阶段可以继续。" },
    output: { title: "Normalization / truncation", body: "命令可能成功，但关键 stdout 被截断、折叠或转换错误，导致回注证据不完整。" },
  });
  initChoiceDetail("#grok-workspace", {
    file: { title: "ToolBridge → Workspace filesystem", body: "路径校验、权限、编辑实现、diff 通知与 checkpoint 共同形成可恢复证据。" },
    command: { title: "Permission → PTY/process", body: "命令获得会话上下文和取消句柄，stdout/stderr 流式产生 ToolNotification。" },
    background: { title: "ProcessManager → BackgroundHandle", body: "启动后返回任务句柄；后续通过 task log、get output 与 kill 跟踪，而不是阻塞回合。" },
    rewind: { title: "预览冲突与文件恢复", body: "工作区先列出可能被恢复的文件和外部修改冲突。执行后分别核对文件、可选 Git 与 hunk 恢复，可能出现部分成功。" },
  });
  initChoiceDetail("#grok-extensions", {
    rules: { title: "AGENTS.md · 行为约束", body: "规则以独立的项目指令项注入，并在压缩后逐字重建；它不新增可执行工具。" },
    skills: { title: "Skills · 渐进式流程知识", body: "SKILL.md 提供专门工作流；同名项按来源优先级去重，执行仍依赖已有工具。" },
    mcp: { title: "MCP · 外部能力协议", body: "项目来源在加载时检查信任。工具注册后可内联或延迟发现，实际派发还需通过权限检查。" },
    plugins: { title: "Plugins · 可分发扩展包", body: "把 agents、Skills、Hooks 与 MCP 组合为分发单元；项目来源仍要过目录信任。" },
    hooks: { title: "Hooks · 确定性生命周期代码", body: "PreToolUse 可拒绝、请求审批或改写参数。超时和崩溃通常放行，改写后的输入未通过 schema 则阻断。" },
    memory: { title: "Memory · 跨会话证据层", body: "V2 在启用时把观察写进收件箱，再独立整理为主题与汇总。检索所得信息仍需和当前工作区核对。" },
  });
  initSurface("#grok-surfaces", {
    tui: [["承载", "进程内嵌 Agent"], ["输入", "全屏 Prompt / slash commands"], ["输出", "Scrollback、diff、modal"], ["关键边界", "沙箱约束与启动进程绑定"]],
    headless: [["消费者", "远端与无人值守客户端"], ["输入", "relay 会话消息"], ["输出", "流式会话事件"], ["关键边界", "ping、半开检测与重连"]],
    acp: [["消费者", "IDE 与 Agent 客户端"], ["输入", "ACP PromptRequest"], ["输出", "SessionUpdate / ToolCallUpdate"], ["关键边界", "客户端不拥有运行时状态"]],
    serve: [["消费者", "可信远端执行消费者"], ["输入", "JSON-RPC 工具调用"], ["输出", "本地工作区工具结果"], ["关键边界", "本地工作区通过反向连接暴露工具。与 agent serve 承载 ACP 会话分开"]],
    leader: [["消费者", "多个 CLI/会话"], ["输入", "本地传输协议"], ["输出", "复用常驻宿主"], ["关键边界", "锁与就绪决定能否连接。只有较新的可解析版本触发版本替换"]],
  });
  initChapterReader();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
