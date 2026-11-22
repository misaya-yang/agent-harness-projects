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
    detail.innerHTML = `<span class="label-mono">MECHANISM OWNER</span><h3>${item.title}</h3><p>${item.body}</p>`;
    if (status) status.textContent = item.status ?? button.textContent ?? "selected";
  }));
}

function initLoop(): void {
  const root = document.querySelector("#dsh-loop");
  if (!root) return;
  const steps = qsa<HTMLElement>(root, "[data-steps] li");
  const events = [
    ["turn/start", "Turn 先于输入认领打开。"],
    ["agent/inbox/spliced + live claim", "队列删除写入 agent/inbox/spliced，认领另有实时通知。pre-step 可改写或拒绝输入。"],
    ["step/start", "接纳输入后才开始 Step。重试仍归这个 Step。"],
    ["system/message + user/message", "固定 adapter 后，将 system 和本步用户输入记入历史。"],
    ["request/header + request/context", "按需记录有效模型与工具配置、上下文窗口等，再冻结实际请求。"],
    ["agent/assistant-stream · live chunk", "UI 先收到临时增量。此刻可能还没有持久的助手消息。"],
    ["assistant/message", "结算事件携带已组装消息与压缩存储的流帧；flush 为日志提供持久化检查点。"],
    ["tool/call → tool/result", "Native 执行器把工具调用与结果写入日志，结果按模型调用顺序提交。"],
    ["step/end", "当前 Step 结束，本例还欠一次读取工具结果的模型请求。"],
    ["step/start → assistant/message → step/end", "第二个 Step 读取已记录的工具结果并总结，本次没有新工具调用。"],
    ["turn/end", "收尾时没有新的 next-step 输入，回合结束。"],
  ];
  let index = -1;
  let timer = 0;
  const log = qs<HTMLElement>(root, "[data-log]");
  const note = qs<HTMLElement>(root, "[data-note]");
  const phase = qs<HTMLElement>(root, "[data-phase]");
  const led = qs<HTMLElement>(root, "[data-led]");
  const draw = (blocked = false) => {
    steps.forEach((item, i) => {
      item.classList.toggle("is-now", i === index);
      item.classList.toggle("is-done", i < index && (!blocked || i < 2));
    });
    const frame = blocked
      ? ["turn/end · blocked", "pre-step 拒绝了输入。这次 Turn 保留回合边界和 Inbox 认领记录，没有 Step 或模型调用。"]
      : events[index];
    if (frame) {
      const [event, explanation] = frame;
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${String(log.childElementCount + 1).padStart(2, "0")}</span> <span class="k-${index === 7 ? "tool" : "sys"}">${event}</span></span>`);
      if (note) note.textContent = explanation;
    }
    if (phase) phase.textContent = index < 0 ? "idle" : index === steps.length - 1 ? "done" : `event ${index + 1}/${steps.length}`;
    led?.classList.toggle("is-run", index >= 0 && index < steps.length - 1);
    led?.classList.toggle("is-done", index === steps.length - 1);
  };
  const reset = () => { clearInterval(timer); index = -1; if (log) log.innerHTML = ""; if (note) note.textContent = "观察哪些事件进入日志，哪些只发给当前连接。"; draw(); };
  const step = () => { if (index < steps.length - 1) { index += 1; draw(); } else clearInterval(timer); };
  qs<HTMLButtonElement>(root, "[data-step]")?.addEventListener("click", step);
  qs<HTMLButtonElement>(root, "[data-blocked]")?.addEventListener("click", () => {
    reset();
    step();
    step();
    index = steps.length - 1;
    draw(true);
  });
  qs<HTMLButtonElement>(root, "[data-run]")?.addEventListener("click", () => { clearInterval(timer); if (index === steps.length - 1) reset(); step(); timer = window.setInterval(step, 560); });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", reset);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
}

function initSessionProjection(): void {
  const root = document.querySelector("#dsh-session");
  if (!root) return;
  let events = 0;
  let surface = 0;
  let messages = 0;
  let toolStage: "proposed" | "recorded" | "answered" | null = null;
  const log = qs<HTMLElement>(root, "[data-log]");

  const render = (name?: string, note?: string, live = false) => {
    const counts = { events, surface, messages };
    for (const [key, count] of Object.entries(counts)) {
      const counter = qs<HTMLElement>(root, `[data-${key}]`);
      if (counter) counter.textContent = String(count);
    }
    if (name) {
      const position = live ? "LIVE" : `e${events}`;
      log?.insertAdjacentHTML("beforeend", `<span class="ev"><span class="t">${position}</span> <span class="k-sys">${name}</span> <span class="t">${note ?? ""}</span></span>`);
    }
  };

  const appendMessage = (name: string, note: string) => {
    events += 1;
    surface += 1;
    messages += 1;
    render(name, note);
  };

  qsa<HTMLButtonElement>(root, "[data-event]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.event;
    switch (type) {
      case "reset":
        events = 0;
        surface = 0;
        messages = 0;
        toolStage = null;
        log?.replaceChildren();
        render();
        break;
      case "chunk":
        render("agent/assistant-stream · chunk", "实时帧，三个计数均不增加", true);
        break;
      case "attempt":
        events += 1;
        render("assistant/attempt", "记录一次尝试及其流帧，模型消息不变");
        break;
      case "user":
        appendMessage("user/message", "加入当前模型历史");
        break;
      case "assistant":
        appendMessage("assistant/message", "结算后的助手消息进入当前模型历史");
        break;
      case "proposal":
        if (toolStage !== null) {
          render("先处理当前 Step", "完成本次恢复或重置后再演示下一次", true);
          break;
        }
        events += 2;
        toolStage = "proposed";
        render("turn/start → step/start", "打开本次崩溃演示的边界");
        appendMessage("assistant/message · 提议 read", "模型历史已有工具提议，执行器还没有记录调用");
        break;
      case "call":
        if (toolStage !== "proposed") {
          render("记录调用需要尚未记录调用的工具提议", undefined, true);
          break;
        }
        events += 1;
        toolStage = "recorded";
        render("tool/call", "调用已记入日志，工具体现在可能尚未启动或已产生效果");
        break;
      case "tool":
        if (toolStage !== "recorded") {
          render("记录结果前先点击「记录调用」", undefined, true);
          break;
        }
        toolStage = "answered";
        appendMessage("tool/result", "模型下一次请求可读取结果");
        break;
      case "recover":
        if (toolStage === null) {
          render("没有需要恢复的打开回合", "先点击「模型提议 read」", true);
          break;
        }
        if (toolStage === "proposed") {
          appendMessage("tool/result · TOOL_NOT_STARTED", "没有调用记录，补结果以闭合工具配对");
        } else if (toolStage === "recorded") {
          appendMessage("tool/result · TOOL_OUTCOME_UNKNOWN", "调用已记录，先核对实际效果再决定是否重做");
        }
        toolStage = null;
        events += 2;
        render("step/end → turn/end · interrupted", "已保存的结果保持原样；本次恢复只补齐日志");
        break;
      case "compact":
        if (surface === 0 || toolStage !== null) {
          render("等待可压缩历史", "先记录消息，并结算打开的工具步骤", true);
          break;
        }
        events += 4;
        surface = 1;
        messages = 1;
        render("compaction/start → summary → replacement → end", "本例用一个摘要代表这段历史。第 9 章演示完整选区规则。");
        break;
    }
  }));
}

function initSafety(): void {
  const root = document.querySelector("#dsh-safety");
  if (!root) return;
  let op = "";
  let mode = "";
  let approval = "";
  const select = (group: string, value: string, button: HTMLButtonElement) => {
    qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    if (group === "op") op = value; else if (group === "mode") mode = value; else approval = value;
    evaluate();
  };
  const evaluate = () => {
    if (!op || !mode || !approval) return;
    const sandboxAllows = op === "read" || mode === "dfa" || (mode === "ww" && op === "write");
    const explicitRetry = approval !== "ordinary";
    const validRetry = explicitRetry && !sandboxAllows;
    const granted = validRetry && approval === "approved";
    const allowed = explicitRetry ? granted : sandboxAllows;
    const badge = qs<HTMLElement>(root, "[data-verdict]");
    if (badge) badge.dataset.verdict = allowed ? "ok" : "deny";
    const output = qs<HTMLElement>(root, "[data-verdict-label]");
    if (output) {
      if (granted) output.textContent = "仅本次按获批策略放行";
      else if (allowed) output.textContent = "按当前策略放行";
      else if (validRetry) output.textContent = "升级被拒绝";
      else output.textContent = explicitRetry ? "请改选普通调用" : "当前策略拒绝";
    }
    const trace = [`按当前策略评估文件效果：${sandboxAllows ? "允许" : "拒绝"}。`];
    if (!explicitRetry) {
      trace.push(sandboxAllows ? "直接尝试执行，文件策略保持不变。" : "普通写入返回 FS_SANDBOX_DENIED；可另行发起显式升级请求。");
    } else if (!validRetry) {
      trace.push("本实验只对普通策略已拒绝的写入模拟升级。");
    } else {
      if (approval === "no-service") {
        trace.push("缺少 ApprovalService，直接返回 SANDBOX_ESCALATION_UNAVAILABLE；没有 asked / decided 审计对。");
      } else {
        const outcome = granted ? "allowed-once" : approval === "never" ? "rejected（策略禁止提示）" : "unavailable（无答复渠道）";
        trace.push(`审批日志：approval/asked → approval/decided（${outcome}）。`);
      }
      trace.push(granted
        ? `本次按 ${op === "write" ? "workspace-write" : "danger-full-access"} 尝试，下一次仍沿用当前 Session 策略。`
        : "未获得一次性授权，写入未执行。");
    }
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
  (["op", "mode", "approval"] as const).forEach((group) => qsa<HTMLButtonElement>(root, `[data-${group}] button`).forEach((button) => button.addEventListener("click", () => select(group, button.dataset.v ?? "", button))));
}

function initPromptAssembly(): void {
  const root = document.querySelector("#dsh-prompt");
  if (!root) return;
  type Sec = { name: string; order: number; text: string };
  const identity: Sec = { name: "harness:identity", order: -1000, text: "You are an AI agent powered by DeepSeek Harness." };
  const personaText = (rewritten: boolean): Sec => ({ name: "deployment:persona-prefix", order: 0, text: rewritten ? "改写后的 persona" : "默认部署 persona" });
  const optional: Record<string, Sec> = {
    repo: { name: "repo-rules", order: 10, text: "仓库规则" },
    shell: { name: "shell-rules", order: 10, text: "Shell 规则" },
    audit: { name: "audit-note", order: 100, text: "审计说明" },
    early: { name: "urgent-hint", order: -1100, text: "高优先级提示" },
  };
  const mounted = new Set<string>();
  let personaRewritten = false;
  let snapshot = false;
  let previous = "";
  const log = qs<HTMLElement>(root, "[data-log]");
  const status = qs<HTMLElement>(root, "[data-status]");
  const render = () => {
    const sections: Sec[] = [identity, personaText(personaRewritten)];
    mounted.forEach((key) => { const sec = optional[key]; if (sec) sections.push(sec); });
    sections.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const signature = sections.map((section) => `${section.name}:${section.text}`).join("|");
    const before = previous ? previous.split("|") : [];
    const now = signature.split("|");
    let boundary = before.length ? 0 : sections.length;
    while (boundary < before.length && boundary < now.length && before[boundary] === now[boundary]) boundary += 1;
    const baseline = mounted.size === 0 && !personaRewritten && !snapshot;
    const pureAppend = boundary >= before.length && now.length >= before.length;
    const pureTrim = boundary === now.length && now.length < before.length;
    const lines = sections.map((section, i) => {
      const sig = `${section.name}:${section.text}`;
      const tag = i < boundary
        ? `<span class="t">前缀相同</span>`
        : before.includes(sig)
          ? `<span class="k-warn">前缀改变 ←</span>`
          : before.some((line) => line.startsWith(`${section.name}:`))
            ? `<span class="k-warn">内容变更 · 触发断裂</span>`
            : pureAppend
              ? `<span class="t">新增 · 保留稳定前缀</span>`
              : `<span class="k-warn">插队新增 · 触发断裂</span>`;
      return `<span class="ev"><span class="t">sys${String(i + 1).padStart(2, "0")}</span> <span class="k-sys">order ${section.order} · ${section.name}</span> ${tag}</span>`;
    });
    lines.push(`<span class="ev"><span class="k-tool">工具声明默认按名称排序</span> <span class="t">排序后的工具签名属于请求头；system 文本单独写入会话历史</span></span>`);
    if (snapshot) lines.push(`<span class="ev"><span class="k-user">user snapshot · runtime policy state</span> <span class="t">变化时追加，不碰 system 前缀</span></span>`);
    else lines.push(`<span class="ev"><span class="t">runtime context：未注入。注入时以 user-role 加入，不进 system</span></span>`);
    if (log) log.innerHTML = lines.join("");
    const set = (selector: string, value: string) => { const el = qs<HTMLElement>(root, selector); if (el) el.textContent = value; };
    set("[data-sections]", String(sections.length));
    set("[data-prefix]", `${boundary}/${sections.length} 行`);
    set("[data-snap]", snapshot ? "1（user role）" : "0");
    if (status) status.textContent = !previous && baseline
      ? "基线：两段 system"
      : pureAppend
        ? now.length > before.length ? "前缀稳定 · 末尾追加片段" : "与上次片段一致"
        : pureTrim
          ? `前缀稳定 · tail 收缩至 ${boundary} 行`
          : `前缀断裂 @第 ${boundary + 1} 行 · 前 ${boundary} 个片段一致`;
    previous = signature;
  };
  qsa<HTMLButtonElement>(root, "[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.toggle ?? "";
    if (key === "ctx") snapshot = !snapshot;
    else if (key === "persona") personaRewritten = !personaRewritten;
    else if (mounted.has(key)) mounted.delete(key);
    else mounted.add(key);
    button.setAttribute("aria-pressed", String(key === "ctx" ? snapshot : key === "persona" ? personaRewritten : mounted.has(key)));
    render();
  }));
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => {
    mounted.clear(); personaRewritten = false; snapshot = false; previous = "";
    qsa<HTMLButtonElement>(root, "[data-toggle]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    render(); // 刷新计数器，并把 previous 落回基线签名——下一次 toggle 才能对真实状态做 diff
  });
  render();
}

function initContextProjection(): void {
  const root = document.querySelector("#dsh-context");
  if (!root) return;
  type Evt = { label: string; tok: number; visible: boolean; pair?: "call" | "result" };
  const events: Evt[] = [
    { label: "user/message · 检查配置为何超时", tok: 40, visible: true },
    { label: "assistant/attempt · 结算失败的流", tok: 0, visible: false },
    { label: "assistant/message · 结论 + tool-call read", tok: 180, visible: true, pair: "call" },
    { label: "tool/result · read 文件内容", tok: 300, visible: true, pair: "result" },
    { label: "assistant/message · 需要修改 + tool-call edit", tok: 200, visible: true, pair: "call" },
    { label: "tool/result · edit ok", tok: 60, visible: true, pair: "result" },
    { label: "user/message · 再跑一遍测试", tok: 30, visible: true },
    { label: "assistant/message · 测试输出（长文本）", tok: 500, visible: true },
  ];
  const summaryTokens = 120;
  let replayed = 0;
  let budget = 0;
  let tailStart = -1;
  let replacements = 0;
  const replacementEnd = (visible: Evt[]): number => {
    const candidate = visible.length - 2;
    return visible[candidate]?.pair === "result" ? candidate - 1 : candidate;
  };
  const status = qs<HTMLElement>(root, "[data-status]");
  const render = () => {
    const visible = events.slice(0, replayed).filter((event) => event.visible);
    const compacted = tailStart >= 0;
    const nodes = compacted ? 1 + (visible.length - tailStart) : visible.length;
    const usage = compacted
      ? summaryTokens + visible.slice(tailStart).reduce((sum, event) => sum + event.tok, 0)
      : visible.reduce((sum, event) => sum + event.tok, 0);
    let verdict = "ask";
    let label = "等待选择";
    const foldableMore = replacementEnd(visible) > Math.max(tailStart, 0);
    const compactButton = qs<HTMLButtonElement>(root, "[data-compact]");
    if (compactButton) compactButton.disabled = !budget || usage < budget || !foldableMore;
    if (!budget) label = "选择历史压力阈值";
    else if (replayed === 0) label = "等待重放";
    else if (usage < budget) { verdict = "ok"; label = `低于压力阈值 ${usage}/${budget}`; }
    else if (foldableMore) label = `达到阈值 ${usage}/${budget} · 可压缩`;
    else { verdict = "deny"; label = `达到阈值 ${usage}/${budget} · 暂无可替换的稳定前缀`; }
    const badge = qs<HTMLElement>(root, "[data-verdict]");
    if (badge) badge.dataset.verdict = verdict;
    const out = qs<HTMLElement>(root, "[data-verdict-label]");
    if (out) out.textContent = label;
    if (status) status.textContent = label;
    const trace = [
      `日志：已读取 ${replayed}/${events.length} 条原事件${replacements ? `；另追加 ${replacements * 4} 条压缩记录` : ""}`,
      `SURFACE：${nodes} 个节点 · deriveMessages 投影${compacted ? "（含 summary 节点）" : ""}`,
      `model-visible：${usage} tok / 预算 ${budget || "?"}`,
    ];
    if (replayed >= 2) trace.push("assistant/attempt 的 stream 留在日志，模型历史跳过整个尝试。");
    if (compacted) {
      trace.push(`选区 = 最早 ${tailStart} 个稳定节点 → summary(${summaryTokens} tok)；replacement 引用原事件 seq，原事件保留。`);
      const kept = visible[tailStart];
      if (kept) trace.push(`保留区从 “${kept.label.slice(0, 24)}” 开始，工具调用与结果保持成对。`);
      if (foldableMore) trace.push("还有可折叠的节点。若超出预算，再次压缩会推进选区边界。");
    } else if (budget && replayed > 0 && usage >= budget) {
      trace.push("选取最早的连续稳定段。若切点落在 call 与 result 之间，两者都留在 tail。");
      if (!foldableMore) trace.push("当前没有可替换的稳定前缀。");
    }
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = trace.map((line) => `<li>${line}</li>`).join("");
  };
  qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((button) => button.addEventListener("click", () => {
    budget = Number(button.dataset.v) || 0;
    qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render();
  }));
  qs<HTMLButtonElement>(root, "[data-replay]")?.addEventListener("click", () => { if (replayed < events.length) replayed += 1; render(); });
  qs<HTMLButtonElement>(root, "[data-compact]")?.addEventListener("click", () => {
    const visible = events.slice(0, replayed).filter((event) => event.visible);
    const next = replacementEnd(visible);
    if (next > Math.max(tailStart, 0)) {
      tailStart = next;
      replacements += 1;
    }
    render();
  });
  qs<HTMLButtonElement>(root, "[data-reset]")?.addEventListener("click", () => {
    replayed = 0; budget = 0; tailStart = -1; replacements = 0;
    qsa<HTMLButtonElement>(root, "[data-budget] button").forEach((candidate) => candidate.setAttribute("aria-pressed", "false"));
    render();
    if (status) status.textContent = "选择历史压力阈值";
    const list = qs<HTMLElement>(root, "[data-trace]");
    if (list) list.innerHTML = "<li>按序读取现有事件，观察 <code>deriveMessages()</code> 的结果。</li>";
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
  initChapterReader({
    "loop": initLoop,
    "session": initSessionProjection,
    "prompt": initPromptAssembly,
    "context": initContextProjection,
    "safety": initSafety,
    "composition": () => initChoiceDetail("#dsh-composition", {
      model: { title: "模型适配服务", body: "替换提供方实现；Loop 仍通过同一模型服务发起流式调用。验证点是有效组合中的当前 Provider。", status: "LLM PROVIDER" },
      prompt: { title: "提示词注册与运行时快照", body: "静态规则进入有序片段，动态政策以历史快照追加；两者都必须能解释模型为何看见这段内容。", status: "SYSTEM PROMPT" },
      tool: { title: "工具注册与能力 Provider", body: "先核对当前 Agent 作用域的工具注册，再查该工具使用哪一种后端。", status: "TOOLS" },
      history: { title: "会话持久化与崩溃修补", body: "从实际保留的日志尾部开始，依序检查 flush、补齐的工具结果和当前消息投影。", status: "SESSION" },
    }),
    "tools": () => initChoiceDetail("#dsh-tools", {
      hidden: { title: "组装结果与 Agent 作用域", body: "先检查当前作用域的可见工具集，再核对请求 Header 记录的工具顺序。未注册与模型不调用是两种问题。" },
      denied: { title: "执行前政策链", body: "先看调用前决策（放行、拒绝、取消或请求审批），再检查审批结论和可独立拒绝的守卫。" },
      timeout: { title: "执行与取消边界", body: "找出哪一层发出了取消信号，确认工具是否停下。同进程工具要响应信号，已发生的修改需另查。" },
      distorted: { title: "执行后政策与结果收口", body: "比较规范化结果、post-execute 决策与最终模型文本；第一处发生变化的阶段就是责任层。" },
    }),
    "profiles": () => initChoiceDetail("#dsh-profiles", {
      base: { title: "共享基础 Bundle", body: "进程级基础插件层；改变它会影响所有使用该组合的新启动实例。", status: "BUNDLE" },
      surface: { title: "运行表面 Bundle", body: "不同表面在共享基础上增加自己的宿主能力；差异属于组合，不属于 Loop 分支。", status: "SURFACE BUNDLE" },
      profile: { title: "用户 Profile Patch", body: "用户层按行标识替换整份配置，不做字段级深合并；先导出最终组合再判断。", status: "PROFILE PATCH" },
      preset: { title: "AgentPresetRegistry", body: "修改 dsh-agent-preset 的 config.plugins。已经开始首个 Turn 的 Session 会拒绝切换。子 Agent 可以显式继承父代组合。", status: "AGENT PRESET" },
    }),
    "capabilities": () => initSurface("#dsh-capabilities", {
      local: [["Definition", "文件与子进程的稳定能力接口"], ["Provider", "本地文件系统与本地进程"], ["Consumers", "Bash、PTY、LSP、文件工具"], ["判断", "执行发生在宿主工作区与进程树"]],
      sandbox: [["Definition", "仍是同一组能力接口"], ["Provider", "平台沙箱 runner + 进程内写围栏"], ["Consumers", "上层工具无需分叉"], ["判断", "检查平台报告的文件约束；受限执行缺后端时返回错误"]],
      ssh: [["Definition", "ctx.fs、ctx.subprocess 与 ctx.sandbox"], ["Provider", "fs-ssh、subprocess-ssh、sandbox-ssh 共用一个远端 helper"], ["Consumers", "文件工具、Bash 和 PTY 依赖同一服务接口"], ["执行位置", "文件与进程在远端，Harness、模型调用和 Session 存储在宿主"]],
    }),
    "surfaces": () => initSurface("#dsh-surfaces", {
      web: [["消费者", "人类开发者"], ["交互", "Web UI、审批、问题、命令"], ["组合", "base + web-app Bundle"], ["状态", "持久事件页与实时助手帧"]],
      desktop: [["消费者", "桌面开发者"], ["交互", "Electron 窗口加载 Web 应用"], ["组合", "打包的 Host 与保留的 Desktop Profile"], ["传输", "本地 carrier 连接 Host，继续使用 Web RPC 与流"]],
      headless: [["消费者", "一次性脚本 / CI"], ["输入", "一个普通 user message"], ["输出", "活跃子代理收尾及会话 flush 后，取本次运行的末条非空助手文本"], ["网络", "不启动 HTTP Server"]],
      acp: [["消费者", "自动化 Agent Client"], ["传输", "JSON-RPC stdio"], ["输出", "committed assistant message updates"], ["限制", "automation-only；不等于 Web UI"]],
      sdk: [["消费者", "TypeScript 产品集成"], ["传输", "newline-delimited JSON-RPC"], ["运行", "启动完整 runtime 子进程"], ["生命周期", "initialize settle / shutdown flush"]],
      python: [["消费者", "Python 调用方"], ["传输", "同一 JSON-RPC runtime"], ["运行", "bundled runtime 子进程"], ["收集", "prompt admission 至 Agent idle 的活动区间"]],
    }),
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
