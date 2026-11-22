/**
 * 沙箱 × 审批决策模拟器：
 * 选定沙箱示例和审批策略，对照有效执行边界与请示路径。
 */

type Op = {
  id: string;
    cmd: string;
  writeIn: boolean;
  writeOut: boolean;
  net: boolean;
  riskNote: string;
};

type Sandbox = "ro" | "ww" | "dfa";
type Approval = "untrusted" | "on-request" | "never";

const OPS: Op[] = [
  { id: "read", cmd: "read project-file", writeIn: false, writeOut: false, net: false, riskNote: "纯读操作" },
  { id: "test", cmd: "run test-suite", writeIn: true, writeOut: false, net: false, riskNote: "写入工作区内构建缓存" },
  { id: "patch", cmd: "patch workspace-file", writeIn: true, writeOut: false, net: false, riskNote: "写入工作区内文件" },
  { id: "net", cmd: "fetch external-api", writeIn: false, writeOut: false, net: true, riskNote: "出站网络请求" },
  { id: "outside", cmd: "write outside-workspace", writeIn: false, writeOut: true, net: false, riskNote: "越出工作区边界" },
  { id: "purge", cmd: "delete build-output", writeIn: true, writeOut: false, net: false, riskNote: "破坏性写（工作区内）" },
];

const VERDICTS = {
  allow: { tag: "当前权限放行", cls: "ok", desc: "示例操作在当前权限内。执行后读取工具结果和命令退出状态。" },
  ask: { tag: "可请示", cls: "ask", desc: "请查看判定路径。命令规则可以要求执行前确认；按需审批也可由模型另行发起明确的权限申请。" },
  request: { tag: "本次越界失败 · 可另行申请", cls: "ask", desc: "这次执行的失败先返回给模型。明确请求其他权限才会进入审批决策，是否获批另行判断。" },
  deny: { tag: "越界失败", cls: "deny", desc: "当前权限不足，普通升级审批已关闭。失败结果回到模型。" },
} as const;

type VerdictKey = keyof typeof VERDICTS;

function decide(op: Op, sbx: Sandbox, apr: Approval): { key: VerdictKey; trace: string[] } {
  const trace: string[] = [];
  const sandboxAllows =
    sbx === "dfa" ||
    (sbx === "ww" && !op.net && !op.writeOut) ||
    (sbx === "ro" && !op.writeIn && !op.writeOut && !op.net);

  if (apr === "untrusted" && op.id !== "read") {
    trace.push("approval=Untrusted → 示例规则未显式放行，执行前请示");
    trace.push(sandboxAllows ? "当前执行边界覆盖该操作" : "当前边界不足，须查获批尝试使用的权限");
    return { key: "ask", trace };
  }

  if (sandboxAllows) {
    trace.push(sbx === "dfa" ? "Codex 不再施加外层沙箱" : `sandbox=${sbx} 内允许：${op.riskNote}`);
    trace.push("无需审批 → 执行并回传输出");
    return { key: "allow", trace };
  }

  const reason =
    sbx === "ro"
      ? "本实验的 ReadOnly 不允许写入或出站网络"
      : op.net
        ? "本实验的 WorkspaceWrite 关闭出站网络"
        : "WorkspaceWrite 拒绝工作区外写入";
  trace.push(reason);

  if (apr === "on-request") {
    trace.push("普通越界失败先返回模型。模型可另行发起显式权限请求");
    return { key: "request", trace };
  }
  trace.push("当前策略与示例规则未提供升级路径");
  return { key: "deny", trace };
}

export function initSandboxSim(root: HTMLElement | null): void {
  if (!root) return;

  let opId = "test";
  let sbx: Sandbox = "ww";
  let apr: Approval = "on-request";

  const verdictEl = root.querySelector<HTMLElement>("[data-verdict]");
  const traceEl = root.querySelector<HTMLElement>("[data-trace]");
  const log = root.querySelector<HTMLElement>("[data-log]");

  const bindGroup = <T extends string>(
    sel: string,
    get: () => T,
    set: (v: T) => void,
    render: () => void,
  ): void => {
    const group = root.querySelector(sel);
    if (!group) return;
    group.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-v]");
      if (!btn) return;
      set(btn.dataset.v as T);
      group.querySelectorAll("[data-v]").forEach((b) => {
        b.setAttribute("aria-pressed", String((b as HTMLButtonElement).dataset.v === get()));
      });
      render();
    });
    group.querySelectorAll("[data-v]").forEach((b) => {
      b.setAttribute("aria-pressed", String((b as HTMLButtonElement).dataset.v === get()));
    });
  };

  const render = (): void => {
    const op = OPS.find((o) => o.id === opId)!;
    const res = decide(op, sbx, apr);
    const v = VERDICTS[res.key];

    root.querySelectorAll("[data-cmd]").forEach((el) => {
      el.textContent = op.cmd;
    });

    if (verdictEl) {
      verdictEl.dataset.verdict = v.cls;
      verdictEl.textContent = v.tag;
    }

    const descEl = root.querySelector<HTMLElement>("[data-verdict-desc]");
    if (descEl) descEl.textContent = v.desc;

    if (traceEl) {
      traceEl.replaceChildren();
      for (const t of res.trace) {
        const li = document.createElement("li");
        li.textContent = t;
        traceEl.append(li);
      }
    }

    if (log) {
      const span = document.createElement("span");
      span.className = "ev";
      const k = document.createElement("span");
      k.className = res.key === "allow" ? "k-tool" : res.key === "deny" ? "k-sys" : "k-warn";
      k.textContent = `[${op.cmd}] × [${sbx} · ${apr}] → ${v.tag}`;
      span.append(k);
      log.append(span);
      while (log.children.length > 6) log.firstElementChild?.remove();
    }
  };

  bindGroup("[data-group-op]", () => opId, (v) => (opId = v), render);
  bindGroup("[data-group-sbx]", () => sbx, (v) => (sbx = v as Sandbox), render);
  bindGroup("[data-group-apr]", () => apr, (v) => (apr = v as Approval), render);

  render();
}
