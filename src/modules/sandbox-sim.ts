/**
 * 沙箱 × 审批决策模拟器：
 * 操作 × SandboxPolicy × ApprovalPolicy → 判定路径与结果。
 * 语义为教学简化版，忠实于「沙箱决定能不能，审批策略决定要不要问」的分层。
 */

type Op = {
  id: string;
  label: string;
  cmd: string;
  reads: boolean;
  writeIn: boolean;
  writeOut: boolean;
  net: boolean;
  riskNote: string;
};

type Sandbox = "ro" | "ww" | "dfa";
type Approval = "untrusted" | "on-request" | "never";

const OPS: Op[] = [
  { id: "read", label: "读取源码", cmd: 'cat src/main.rs', reads: true, writeIn: false, writeOut: false, net: false, riskNote: "纯读操作" },
  { id: "test", label: "跑测试", cmd: "cargo test", reads: true, writeIn: true, writeOut: false, net: false, riskNote: "写入 target/（工作区内）" },
  { id: "patch", label: "改工作区文件", cmd: "apply_patch tests/login.rs", reads: true, writeIn: true, writeOut: false, net: false, riskNote: "写入工作区内文件" },
  { id: "net", label: "访问网络", cmd: "curl -s https://api.example.com", reads: true, writeIn: false, writeOut: false, net: true, riskNote: "出站网络请求" },
  { id: "outside", label: "写工作区之外", cmd: "echo note > ~/Desktop/x.txt", reads: true, writeIn: false, writeOut: true, net: false, riskNote: "越出工作区边界" },
  { id: "purge", label: "删除依赖目录", cmd: "rm -rf target/", reads: true, writeIn: true, writeOut: false, net: false, riskNote: "破坏性写（工作区内）" },
];

const VERDICTS = {
  allow: { tag: "沙箱内放行", cls: "ok", desc: "操作落在沙箱允许范围内，直接执行，无需打扰用户。" },
  ask: { tag: "升级请示", cls: "ask", desc: "先在沙箱内尝试；被拦截或策略要求确认时，内核向 UI 发出审批请求，由用户裁决是否越权重跑。" },
  deny: { tag: "直接拒绝", cls: "deny", desc: "不打扰用户：Granular 未放行的类别自动拒绝，Never 遇阻直接失败返回，回合继续但命令未执行。" },
} as const;

type VerdictKey = keyof typeof VERDICTS;

function decide(op: Op, sbx: Sandbox, apr: Approval): { key: VerdictKey; trace: string[] } {
  const trace: string[] = [];
  const sandboxAllows =
    sbx === "dfa" ||
    (sbx === "ww" && !op.net && !op.writeOut) ||
    (sbx === "ro" && !op.writeIn && !op.writeOut && !op.net);

  if (sbx === "dfa") {
    trace.push("sandbox=DangerFullAccess → OS 层无限制");
    if (apr === "untrusted" && (op.net || op.writeOut)) {
      trace.push("approval=Untrusted → 非白名单命令仍需用户确认");
      return { key: "ask", trace };
    }
    trace.push("approval 策略不触发（无阻碍）→ 直接执行");
    return { key: "allow", trace };
  }

  if (sandboxAllows) {
    trace.push(`sandbox=${sbx} 内允许：${op.riskNote}`);
    if (apr === "untrusted" && op.id !== "read") {
      trace.push("approval=Untrusted → 白名单外命令先请示");
      return { key: "ask", trace };
    }
    trace.push("无需审批 → 执行并回传输出");
    return { key: "allow", trace };
  }

  const reason =
    sbx === "ro"
      ? "ReadOnly 沙箱拒绝一切写入/网络"
      : op.net
        ? "WorkspaceWrite 默认断网"
        : "WorkspaceWrite 拒绝工作区外写入";
  trace.push(reason);

  switch (apr) {
    case "on-request":
      trace.push("approval=OnRequest → 模型可发起升级请示，交用户裁决");
      return { key: "ask", trace };
    case "untrusted":
      trace.push("approval=UnlessTrusted → 未放行命令在执行前就请示");
      return { key: "ask", trace };
    case "never":
      trace.push("approval=Never → 不请示，直接以失败收场");
      return { key: "deny", trace };
  }
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
      k.className = res.key === "allow" ? "k-tool" : res.key === "ask" ? "k-warn" : "k-sys";
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
