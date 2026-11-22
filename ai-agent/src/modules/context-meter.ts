/** 区分 append-only transcript 与 compact 后被替换的模型工作集。 */

interface HistoryItem {
  kind: "user" | "assistant" | "tool";
  tok: number;
}

const WINDOW = 100_000;
const SYSTEM = 9_400;
const DOCS = 3_600;
const THRESHOLD = 0.86;
const RETAINED_ITEMS = 6; // Two example turns of three items each.

let items: HistoryItem[] = [];
let summaryTok = 0;
let compactCount = 0;
let transcriptTok = 0;

const rand = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

const nextTurn = (): HistoryItem[] => {
  const out: HistoryItem[] = [
    { kind: "user", tok: rand(40, 220) },
    { kind: "tool", tok: rand(900, 4200) },
    { kind: "assistant", tok: rand(180, 900) },
  ];
  return out;
};

const used = (): number =>
  SYSTEM + DOCS + summaryTok + items.reduce((a, t) => a + t.tok, 0);

export function initContextMeter(root: HTMLElement | null): void {
  if (!root) return;

  const bar = root.querySelector<HTMLElement>("[data-bar]");
  const counter = root.querySelector<HTMLElement>("[data-counter]");
  const cacheEl = root.querySelector<HTMLElement>("[data-cache]");
  const transcriptEl = root.querySelector<HTMLElement>("[data-transcript]");
  const activeEl = root.querySelector<HTMLElement>("[data-active]");
  const checkpointEl = root.querySelector<HTMLElement>("[data-checkpoint]");
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
    el.textContent = flex > WINDOW * 0.015 ? title : "";
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

  const render = (prefixChanged = false): void => {
    const u = used();
    const pct = Math.min(u / WINDOW, 1);

    bar.replaceChildren();
    bar.append(seg("seg-system", SYSTEM, "基础指令"));
    bar.append(seg("seg-docs", DOCS, "动态上下文"));
    if (summaryTok > 0) bar.append(seg("seg-summary", summaryTok, `checkpoint ${compactCount}`));
    for (const t of items) {
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
    if (transcriptEl) transcriptEl.textContent = `${(transcriptTok / 1000).toFixed(1)}k · append-only`;
    if (activeEl) activeEl.textContent = `${(u / 1000).toFixed(1)}k · replaceable`;
    if (checkpointEl) checkpointEl.textContent = compactCount ? `window ${compactCount + 1} · compact ${compactCount}` : "window 1 · none";
    if (cacheEl) cacheEl.textContent = prefixChanged ? "基础指令保留 · 历史前缀更新" : "基础指令保持 · 实际命中由服务端报告";

    if (compactBtn) compactBtn.disabled = items.length <= RETAINED_ITEMS;

    // 越过阈值：自动压缩
    if (pct >= THRESHOLD && items.length > RETAINED_ITEMS) {
      compact("auto");
    }
  };

  const compact = (trigger: "auto" | "manual"): void => {
    if (items.length <= RETAINED_ITEMS) return;
    const before = used();
    const keep = items.slice(-RETAINED_ITEMS);
    const folded = items.slice(0, -RETAINED_ITEMS);
    const foldedTok = folded.reduce((a, t) => a + t.tok, 0);
    const previousSummaryTok = summaryTok;
    const sourceTok = previousSummaryTok + foldedTok;

    items = keep;
    compactCount += 1;
    // 教学模型：新 checkpoint 替换旧 checkpoint，并保持有界；不是摘要累加器。
    summaryTok = Math.max(900, Math.min(3_600, Math.round(sourceTok * 0.12)));

    logLine(
      trigger === "auto" ? "k-warn" : "k-user",
      trigger === "auto" ? `超过示例阈值 ${Math.round(THRESHOLD * 100)}% → 自动压缩` : "用户手动请求压缩",
    );
    logLine(
      "k-sys",
      `checkpoint ${compactCount} replaces ${compactCount === 1 ? "none" : `checkpoint ${compactCount - 1}`} · source ${(sourceTok / 1000).toFixed(1)}k → ${(summaryTok / 1000).toFixed(1)}k`,
    );
    logLine(
      "k-model",
      `active history replaced · freed ${((before - used()) / 1000).toFixed(1)}k · transcript remains ${(transcriptTok / 1000).toFixed(1)}k`,
    );
    render(true);
  };

  const reset = (): void => {
    items = [
      { kind: "user", tok: 120 },
      { kind: "tool", tok: 1600 },
      { kind: "assistant", tok: 420 },
    ];
    summaryTok = 0;
    compactCount = 0;
    transcriptTok = items.reduce((a, t) => a + t.tok, 0);
    if (log) log.replaceChildren();
    logLine("k-sys", "same thread · rollout 持续追加，active history 单独派生");
    render();
  };

  nextBtn.addEventListener("click", () => {
    const t = nextTurn();
    items.push(...t);
    transcriptTok += t.reduce((a, x) => a + x.tok, 0);
    logLine(
      "k-user",
      `turn +${t.reduce((a, x) => a + x.tok, 0)} tok（输入+工具输出+回复）`,
    );
    render();
  });
  compactBtn?.addEventListener("click", () => compact("manual"));
  resetBtn?.addEventListener("click", reset);

  reset();
}
