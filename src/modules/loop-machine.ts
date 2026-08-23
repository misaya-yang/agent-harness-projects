/**
 * 回合循环步进机（首屏之后的签名教学装置）。
 * 以真实 Codex 回合生命周期的九个阶段为脚本：
 * 高亮节点 → 数据包沿边行进 → 控制台追加事件日志。
 * 运行可中断（重置取消全部待处理定时器）；减弱动效下跳过行进动画。
 */

interface Stage {
  /** SVG 节点 id（不带前缀） */
  node?: string;
  /** SVG 边路径 id */
  edge?: string;
  /** 阶段标题 */
  title: string;
  /** 侧栏解说 */
  note: string;
  /** 控制台日志 [class, text][] */
  log: Array<[string, string]>;
}

const STAGES: Stage[] = [
  {
    node: "submit",
    title: "提交入队",
    note: "用户输入被封装为 Op::UserTurn 投入提交队列——UI 与内核解耦的唯一入口。",
    log: [
      ["k-sys", "session.submit(Op::TurnInput)"],
      ["k-user", "▸ input: \"修复失败的测试并解释原因\""],
      ["k-sys", "EventMsg::TurnStarted (task_started)"],
    ],
  },
  {
    node: "context",
    edge: "submit-context",
    title: "组装上下文",
    note: "内核拼接 base instructions、环境信息、AGENTS.md 与历史记录，构造本轮请求负载。",
    log: [
      ["k-sys", "build_prompt(): instructions + env + project_doc + history"],
      ["k-warn", "context: 14,208 tok / window 272,000 tok"],
    ],
  },
  {
    node: "model",
    edge: "context-model",
    title: "模型流式响应",
    note: "请求经 SSE 流式返回，增量文本以 AgentMessageContentDelta 即时转发给 UI。",
    log: [
      ["k-sys", "POST /responses (stream=true)"],
      ["k-model", "◂ response.output_text.delta …"],
      ["k-model", "AgentMessageContentDelta ×37"],
    ],
  },
  {
    node: "tool",
    edge: "model-tool",
    title: "工具调用决策",
    note: "模型输出 function_call。是否需要动用工具？不需要则直接进入完成阶段。",
    log: [
      ["k-model", "◂ function_call: shell {\"cmd\":[\"cargo\",\"test\"]}"],
      ["k-sys", "handle_function_call()"],
    ],
  },
  {
    node: "approval",
    edge: "tool-approval",
    title: "审批判定",
    note: "依据 ApprovalPolicy 与 SandboxPolicy 判定：放行、请示用户，还是直接拒绝。",
    log: [
      ["k-warn", "policy=OnRequest sandbox=WorkspaceWrite"],
      ["k-warn", "command touches network → EscalateForApproval"],
      ["k-user", "▸ user approves (apply to session)"],
    ],
  },
  {
    node: "exec",
    edge: "approval-exec",
    title: "沙箱执行",
    note: "命令落入 OS 级沙箱（macOS Seatbelt / Linux Landlock）中执行，输出被截断采集。",
    log: [
      ["k-sys", "exec: seatbelt profile applied"],
      ["k-tool", "ExecCommandBegin → stdout 214 lines"],
      ["k-sys", "ExecCommandExit { exit_code: 0 }"],
    ],
  },
  {
    node: "inject",
    edge: "exec-inject",
    title: "结果回注",
    note: "工具输出包装为 function_call_output 追加进对话，再次调用模型。",
    log: [
      ["k-sys", "history.push(function_call_output)"],
      ["k-sys", "POST /responses (stream=true)"],
    ],
  },
  {
    node: "converge",
    edge: "inject-converge",
    title: "收敛判断",
    note: "模型综合测试输出给出结论文本。若仍有工具调用则回到第 3 步继续循环。",
    log: [
      ["k-model", "◂ message: \"测试已修复，原因是……\""],
      ["k-model", "no further function_call"],
    ],
  },
  {
    node: "done",
    edge: "converge-done",
    title: "回合完成",
    note: "TurnComplete 收尾，TokenCount 更新计量；若逼近窗口上限则调度自动压缩。",
    log: [
      ["k-sys", "EventMsg::TurnComplete (task_complete)"],
      ["k-sys", "TokenCount { total: 31,842, cache: 78% }"],
    ],
  },
];

interface Parts {
  root: HTMLElement;
  led: HTMLElement | null;
  phase: HTMLElement | null;
  runBtn: HTMLButtonElement | null;
  stepBtn: HTMLButtonElement | null;
  resetBtn: HTMLButtonElement | null;
  steps: HTMLOListElement | null;
  log: HTMLElement | null;
  svg: SVGSVGElement | null;
  note: HTMLElement | null;
}

const EDGE_MS = 620;

export function initLoopMachine(
  root: HTMLElement | null,
  reducedMotion: MediaQueryList,
): void {
  if (!root) return;

  const parts: Parts = {
    root,
    led: root.querySelector("[data-led]"),
    phase: root.querySelector("[data-phase]"),
    runBtn: root.querySelector("[data-run]"),
    stepBtn: root.querySelector("[data-step]"),
    resetBtn: root.querySelector("[data-reset]"),
    steps: root.querySelector("[data-steps]"),
    log: root.querySelector("[data-log]"),
    svg: root.querySelector("svg[data-diagram]"),
    note: root.querySelector("[data-stage-note]"),
  };

  const packets = parts.svg ? buildPackets(parts.svg) : [];
  let cursor = -1;
  let timers: number[] = [];
  let cancelTravels: Array<() => void> = [];
  let running = false;

  const clearTimers = (): void => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    for (const cancel of cancelTravels) cancel();
    cancelTravels = [];
  };

  const setLed = (state: "idle" | "run" | "done"): void => {
    if (!parts.led) return;
    parts.led.className = `led${state === "idle" ? "" : ` is-${state}`}`;
  };

  const logLine = (cls: string, text: string, i: number): void => {
    if (!parts.log) return;
    const span = document.createElement("span");
    span.className = "ev";
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = String(i).padStart(2, "0") + " ";
    const k = document.createElement("span");
    k.className = cls;
    k.textContent = text;
    span.append(t, k);
    parts.log.append(span);
    parts.log.scrollTop = parts.log.scrollHeight;
  };

  const activateStage = (idx: number): void => {
    const stage = STAGES[idx];
    cursor = idx;

    root.querySelectorAll(".loop-node").forEach((n) =>
      n.classList.remove("is-active"),
    );
    if (stage.node) {
      root
        .querySelector(`[data-node="${stage.node}"]`)
        ?.classList.add("is-active");
    }

    if (parts.phase) parts.phase.textContent = `${pad(idx + 1)}/9 · ${stage.title}`;
    if (parts.note) parts.note.textContent = stage.note;
    if (parts.steps) {
      parts.steps.querySelectorAll("li").forEach((li, i) => {
        li.classList.toggle("is-now", i === idx);
        li.classList.toggle("is-done", i < idx);
      });
    }
    stage.log.forEach(([cls, text], i) => {
      if (reducedMotion.matches) {
        logLine(cls, text, idx * 10 + i);
      } else {
        timers.push(
          window.setTimeout(() => logLine(cls, text, idx * 10 + i), 140 + i * 190),
        );
      }
    });

    if (stage.edge && !reducedMotion.matches) {
      cancelTravels.push(travel(packets, stage.edge));
    }

    if (parts.stepBtn) parts.stepBtn.disabled = idx >= STAGES.length - 1;
  };

  const finish = (): void => {
    running = false;
    setLed("done");
    if (parts.runBtn) parts.runBtn.disabled = false;
  };

  const runAll = (): void => {
    clearTimers();
    reset(false);
    running = true;
    setLed("run");
    if (parts.runBtn) parts.runBtn.disabled = true;

    let acc = 260;
    for (let i = 0; i < STAGES.length; i++) {
      const idx = i;
      timers.push(
        window.setTimeout(() => {
          activateStage(idx);
          if (idx === STAGES.length - 1) finish();
        }, acc),
      );
      acc += reducedMotion.matches ? 340 : 1150;
    }
  };

  const stepOnce = (): void => {
    clearTimers();
    if (running) return;
    if (cursor >= STAGES.length - 1) return;
    setLed("run");
    activateStage(cursor + 1);
    if (cursor === STAGES.length - 1) finish();
  };

  const reset = (clearLog = true): void => {
    clearTimers();
    running = false;
    cursor = -1;
    setLed("idle");
    root.querySelectorAll(".loop-node").forEach((n) => n.classList.remove("is-active"));
    if (parts.phase) parts.phase.textContent = "idle";
    if (parts.note) parts.note.textContent = "按“单步”观察每个阶段的职责，再用“连续运行”看完整闭环。";
    if (parts.steps) {
      parts.steps.querySelectorAll("li").forEach((li) =>
        li.classList.remove("is-now", "is-done"),
      );
    }
    if (parts.log && clearLog) parts.log.replaceChildren();
    if (parts.runBtn) parts.runBtn.disabled = false;
    if (parts.stepBtn) parts.stepBtn.disabled = false;
    for (const p of packets) p.removeAttribute("transform");
  };

  parts.runBtn?.addEventListener("click", runAll);
  parts.stepBtn?.addEventListener("click", stepOnce);
  parts.resetBtn?.addEventListener("click", () => reset());
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 在每条边上预置一个数据包圆点，沿路径按长度参数移动。 */
function buildPackets(svg: SVGSVGElement): SVGCircleElement[] {
  const ns = "http://www.w3.org/2000/svg";
  const circles: SVGCircleElement[] = [];
  for (const path of Array.from(svg.querySelectorAll<SVGPathElement>("path[data-edge]"))) {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("class", "loop-packet");
    c.setAttribute("r", "3.4");
    c.setAttribute("opacity", "0");
    svg.appendChild(c);
    circles.push(c);
    path.dataset.len = String(path.getTotalLength());
    path.dataset.packet = String(circles.length - 1);
  }
  return circles;
}

function travel(packets: SVGCircleElement[], edgeId: string): () => void {
  const svg = packets[0]?.closest("svg");
  const path = svg?.querySelector<SVGPathElement>(`[data-edge="${edgeId}"]`);
  if (!path) return () => {};
  const idx = Number.parseInt(path.dataset.packet ?? "-1", 10);
  const packet = packets[idx];
  if (!packet) return () => {};

  const len = Number.parseFloat(path.dataset.len ?? "0");
  const start = performance.now();
  let frameId = 0;
  let cancelled = false;

  const frame = (now: number): void => {
    if (cancelled) return;
    const t = Math.min((now - start) / EDGE_MS, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const pt = path.getPointAtLength(eased * len);
    packet.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
    packet.setAttribute("opacity", t < 0.08 ? String(t / 0.08) : t > 0.92 ? String((1 - t) / 0.08) : "1");
    if (t < 1) frameId = requestAnimationFrame(frame);
    else packet.setAttribute("opacity", "0");
  };
  frameId = requestAnimationFrame(frame);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frameId);
    packet.setAttribute("opacity", "0");
  };
}
