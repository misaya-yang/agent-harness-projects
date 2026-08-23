/**
 * 上下文窗口计量与自动压缩演示：
 * 每轮对话向窗口追加负载；越过阈值触发 auto-compact——
 * 旧历史折叠为摘要段，缓存前缀失效部分被标出。
 * 数字为教学示意（真实窗口随模型而定）。
 */

interface Turn {
  kind: "user" | "assistant" | "tool";
  tok: number;
}

const WINDOW = 100_000;
const SYSTEM = 9_400;
const DOCS = 3_600;
const THRESHOLD = 0.86;

let turns: Turn[] = [];
let summaryTok = 0;
let compactCount = 0;

const rand = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

const nextTurn = (): Turn[] => {
  const out: Turn[] = [
    { kind: "user", tok: rand(40, 220) },
    { kind: "tool", tok: rand(900, 4200) },
    { kind: "assistant", tok: rand(180, 900) },
  ];
  return out;
};

const used = (): number =>
  SYSTEM + DOCS + summaryTok + turns.reduce((a, t) => a + t.tok, 0);

export function initContextMeter(root: HTMLElement | null): void {
  if (!root) return;

  const bar = root.querySelector<HTMLElement>("[data-bar]");
  const counter = root.querySelector<HTMLElement>("[data-counter]");
  const cacheEl = root.querySelector<HTMLElement>("[data-cache]");
  const log = root.querySelector<HTMLElement>("[data-log]");
  const nextBtn = root.querySelector<HTMLButtonElement>("[data-next]");
  const compactBtn = root.querySelector<HTMLButtonElement>("[data-compact]");
  const resetBtn = root.querySelector<HTMLButtonElement>("[data-reset]");
  if (!bar || !counter || !nextBtn) return;

  const seg = (cls: string, flex: number, title: string): HTMLElement => {
    const el = document.createElement("span");
    el.className = `cseg ${cls}`;
    el.style.flexGrow = String(Math.max(flex, 0.4));
    el.dataset.title = title;
    el.textContent = flex > WINDOW * 0.06 ? title : "";
    return el;
  };

  const logLine = (cls: string, text: string): void => {
    if (!log) return;
    const span = document.createElement("span");
    span.className = "ev";
    const k = document.createElement("span");
    k.className = cls;
    k.textContent = text;
    span.append(k);
    log.append(span);
    log.scrollTop = log.scrollHeight;
  };

  const render = (cachedPrefix = true): void => {
    const u = used();
    const pct = Math.min(u / WINDOW, 1);

    bar.replaceChildren();
    bar.append(seg("seg-system", SYSTEM, "系统指令"));
    bar.append(seg("seg-docs", DOCS, "AGENTS.md+环境"));
    if (summaryTok > 0) bar.append(seg("seg-summary", summaryTok, "摘要"));
    for (const t of turns) {
      bar.append(
        seg(
          t.kind === "user" ? "seg-user" : t.kind === "tool" ? "seg-tool" : "seg-asst",
          t.tok,
          "",
        ),
      );
    }
    bar.append(seg("seg-free", WINDOW - u, "剩余"));

    counter.textContent = `${(u / 1000).toFixed(1)}k / ${(WINDOW / 1000).toFixed(0)}k tok · ${Math.round(pct * 100)}%`;
    counter.dataset.level = pct >= THRESHOLD ? "hot" : pct >= THRESHOLD - 0.14 ? "warm" : "cool";

    const cached = cachedPrefix ? Math.round(pct * 100 - compactCount * 7) : Math.round((u - (turns.at(-1)?.tok ?? 0)) / WINDOW * 100);
    if (cacheEl) cacheEl.textContent = `prefix cache ≈ ${Math.max(cached, 12)}%`;

    if (compactBtn) compactBtn.disabled = turns.length < 6;

    // 越过阈值：自动压缩
    if (pct >= THRESHOLD && turns.length >= 8) {
      autoCompact();
    }
  };

  const autoCompact = (): void => {
    const before = used();
    const keep = turns.slice(-4);
    const folded = turns.slice(0, -4);
    const foldedTok = folded.reduce((a, t) => a + t.tok, 0);

    turns = keep;
    summaryTok += Math.round(foldedTok * 0.09);
    compactCount += 1;

    logLine("k-warn", `threshold ${Math.round(THRESHOLD * 100)}% crossed → EventMsg::ContextCompacted`);
    logLine("k-sys", `summarize ${folded.length} turns (${(foldedTok / 1000).toFixed(1)}k → 摘要 ${(summaryTok / 1000).toFixed(1)}k)`);
    logLine(
      "k-model",
      `history replaced · freed ${((before - used()) / 1000).toFixed(1)}k tok · 缓存前缀部分失效`,
    );
    render(false);
  };

  const manualCompact = (): void => {
    if (turns.length < 2) return;
    autoCompact();
    logLine("k-user", "▸ 手动触发 /compact —— 同一条路径，只是由你按下");
  };

  const reset = (): void => {
    turns = [
      { kind: "user", tok: 120 },
      { kind: "tool", tok: 1600 },
      { kind: "assistant", tok: 420 },
    ];
    summaryTok = 0;
    compactCount = 0;
    if (log) log.replaceChildren();
    logLine("k-sys", "new session · system+docs 常驻，历史从零累积");
    render();
  };

  nextBtn.addEventListener("click", () => {
    const t = nextTurn();
    turns.push(...t);
    logLine(
      "k-user",
      `turn +${t.reduce((a, x) => a + x.tok, 0)} tok（输入+工具输出+回复）`,
    );
    render();
  });
  compactBtn?.addEventListener("click", manualCompact);
  resetBtn?.addEventListener("click", reset);

  reset();
}
