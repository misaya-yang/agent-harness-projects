// M8 examples: all figures are calculated from explicit, small fixtures.
import { figure, text, xy } from "./math-kit.mjs";

const pct = value => (100 * value).toFixed(1) + "%";
const order = (a, b) => a.d - b.d || a.i - b.i;

/* InfoNCE with one positive and two negatives. */
const contrast = {
  title: "困难负样本怎样改变对比学习的梯度？",
  question: "查询的正样本相似度固定为 0.8，简单负样本固定为 0.2。先猜：把困难负样本从 0.2 移到 0.7，再降低温度，正样本概率与梯度会怎样变？柱子由三项 softmax 实算。",
  controls: [
    { key: "hard", label: "困难负样本相似度", min: 0.1, max: 1, step: 0.05, initial: 0.7, format: v => v.toFixed(2) },
    { key: "tau", label: "温度 τ", min: 0.05, max: 0.5, step: 0.05, initial: 0.2, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "困难负样本", values: { hard: 0.7, tau: 0.2 } },
    { label: "只有简单负样本", values: { hard: 0.2, tau: 0.2 } },
    { label: "困难且低温", values: { hard: 0.7, tau: 0.05 } },
    { label: "负样本超过正样本", values: { hard: 0.95, tau: 0.2 } },
  ],
  check: {
    question: "困难负样本越像正样本就一定越好吗？",
    answer: "只有它确实不相关时，较大的负样本概率才提供有用的区分信号。若它其实也回答了问题，把它当负样本会把同义证据推远；当假负例接近或超过正样本时，低温可能放大这种错误。应去重、检查标签并评估困难负样本挖掘策略。",
  },
  evaluate({ hard, tau }) {
    const scores = [0.8, hard, 0.2], scaled = scores.map(s => s / tau), max = Math.max(...scaled);
    const exp = scaled.map(s => Math.exp(s - max)), total = exp.reduce((a, b) => a + b, 0);
    const p = exp.map(x => x / total), loss = -Math.log(p[0]);
    return {
      type: "bars", unit: "softmax 概率（%）", maxValue: 100,
      rows: ["正样本 · 0.80", `困难负样本 · ${hard.toFixed(2)}`, "简单负样本 · 0.20"].map((label, i) => ({ label, value: 100 * p[i], display: pct(p[i]) })),
      readout: `正样本概率 ${pct(p[0])} · InfoNCE 损失 ${loss.toFixed(3)} · 正样本分数梯度 ${((p[0] - 1) / tau).toFixed(3)} · 困难负样本分数梯度 ${(p[1] / tau).toFixed(3)}`,
      explanation: `梯度对的是未除温度的相似度：∂L/∂s⁺ = (p⁺−1)/τ，∂L/∂s⁻ = p⁻/τ。困难负样本分到 ${pct(p[1])} 的概率，因此获得相应的排斥梯度；它如果是漏标的正样本，这个信号就会推错方向。`,
    };
  },
};

/* A directed single-layer M-nearest-neighbor graph, not a full HNSW index. */
const points = Array.from({ length: 36 }, (_, i) => {
  const x = i % 6, y = Math.floor(i / 6);
  return [x + 0.24 * Math.sin(3 * x + 7 * y), y + 0.21 * Math.cos(5 * x - 2 * y)];
});
const query = [4.3, 4.5];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function graphSearch(m, ef) {
  const graph = points.map((p, i) => points.map((other, j) => ({ d: dist(p, other), i: j })).filter(o => o.i !== i).sort(order).slice(0, m).map(o => o.i));
  const start = { d: dist(query, points[0]), i: 0 }, seen = new Set([0]), expanded = [], candidates = [start], best = [start];
  while (candidates.length) {
    candidates.sort(order);
    const current = candidates.shift();
    if (best.length >= ef && current.d > best[best.length - 1].d) break;
    expanded.push(current.i);
    for (const i of graph[current.i]) {
      if (seen.has(i)) continue;
      seen.add(i);
      const next = { d: dist(query, points[i]), i };
      if (best.length < ef || order(next, best[best.length - 1]) < 0) {
        candidates.push(next); best.push(next); best.sort(order);
        if (best.length > ef) best.pop();
      }
    }
  }
  const exact = points.map((p, i) => ({ d: dist(query, p), i })).sort(order).slice(0, 3).map(o => o.i);
  const found = best.slice(0, 3).map(o => o.i);
  return { graph, seen, expanded, exact, found, hits: found.filter(i => exact.includes(i)).length };
}
const graphLab = {
  title: "图搜索：更宽的候选池能不能走出局部区域？",
  question: "36 个点组成单层有向近邻图，入口固定为 0，查询 Q 的精确 top-3 用金圈标出。每点保留 M 条出边；搜索最多保留 ef 个当前最佳候选。先猜 M=3 时，把 ef 从 3 调到 6，能否找到精确近邻？",
  controls: [
    { key: "m", label: "每个点的出边数 M", min: 2, max: 6, step: 1, initial: 3 },
    { key: "ef", label: "候选池大小 ef（至少等于 k=3）", min: 3, max: 12, step: 1, initial: 3 },
  ],
  presets: [
    { label: "局部陷阱 · M 3 / ef 3", values: { m: 3, ef: 3 } },
    { label: "扩大候选池 · ef 6", values: { m: 3, ef: 6 } },
    { label: "加边 · M 4", values: { m: 4, ef: 3 } },
    { label: "入口不可达 · M 2", values: { m: 2, ef: 12 } },
  ],
  check: {
    question: "M=2 时即使 ef=12 仍漏召，为什么？",
    answer: "从入口可沿有向边到达的部分没有任何精确 top-3 点；扩大候选池不能跨越缺失的边。实际 HNSW 用多层、增量插入和邻居选择来改善导航，这个单层有向近邻图只隔离了边数、搜索宽度与可达性的作用。",
  },
  evaluate({ m, ef }) {
    const r = graphSearch(m, ef), X = p => 27 + (p[0] + 0.3) * 51, Y = p => 295 - (p[1] + 0.3) * 51;
    const edges = r.expanded.flatMap(i => r.graph[i].map(j => `<path d="M${xy(X(points[i]))} ${xy(Y(points[i]))} L${xy(X(points[j]))} ${xy(Y(points[j]))}" stroke="var(--lab-neutral)" stroke-opacity=".28" stroke-width="1"/>`)).join("");
    const circles = points.map((p, i) => {
      const fill = r.found.includes(i) ? "var(--lab-teal)" : r.seen.has(i) ? "var(--lab-blue)" : "var(--lab-grid)";
      return `<circle cx="${xy(X(p))}" cy="${xy(Y(p))}" r="${r.exact.includes(i) ? 7 : 5}" fill="${fill}" stroke="${r.exact.includes(i) ? "var(--lab-amber)" : "var(--lab-neutral)"}" stroke-width="${r.exact.includes(i) ? 3 : 0.6}"/>`;
    }).join("");
    const qx = X(query), qy = Y(query), start = points[0];
    const body = `${edges}${circles}<path d="M${xy(qx-6)} ${xy(qy-6)} l12 12 m-12 0 l12 -12" stroke="var(--lab-rose)" stroke-width="3"/>${text(qx+9, qy+4, "Q", "lab-fig-label")}${text(X(start)+8, Y(start)+4, "入口 0", "lab-fig-note")}${text(12, 324, "蓝：已算距离　绿：返回　金圈：精确 top-3", "lab-fig-note")}`;
    return {
      type: "svg", svg: figure(360, 338, `单层近邻图，召回 ${r.hits} / 3，计算 ${r.seen.size} 个点的距离`, body),
      readout: `精确 top-3：${r.exact.join("、")}；返回：${r.found.join("、")}；召回 ${r.hits}/3（${pct(r.hits / 3)}），计算距离 ${r.seen.size}/36 次`,
      explanation: `线段只显示已展开节点的出边；发现节点时计一次查询距离。ef=${ef} 限制保留的最佳候选，并非距离计算次数上限。此单层有向 M 近邻图不是 HNSW，实际 HNSW 的层级、建图和搜索开销需在目标数据上测量。`,
    };
  },
};

/* BM25 and weighted reciprocal-rank fusion on a small, explicit corpus. */
const paragraphs = [
  { doc: "A", part: 1, words: "e42 means card payment failed", vector: [0.8, 0.6], facts: ["A"] },
  { doc: "A", part: 2, words: "failed card payment refund deadline thirty days", vector: [1, 0.1], facts: ["B"] },
  { doc: "B", part: 1, words: "e42 refund exception was superseded", vector: [0.2, 0.98], facts: [] },
  { doc: "B", part: 2, words: "refund deadline seven days", vector: [0.3, 0.95], facts: [] },
  { doc: "C", part: 1, words: "e24 card shipment failed", vector: [0.5, 0.8], facts: [] },
  { doc: "C", part: 2, words: "shipment tracking delivery", vector: [0, 1], facts: [] },
];
function retrieve(chunkSize, alpha, k) {
  const chunks = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const parts = paragraphs.slice(i, i + chunkSize);
    chunks.push({ label: parts[0].doc + (chunkSize === 1 ? parts[0].part : ""),
      terms: parts.flatMap(p => p.words.split(" ")), vector: [0, 1].map(j => parts.reduce((sum, p) => sum + p.vector[j], 0)), facts: parts.flatMap(p => p.facts) });
  }
  const n = chunks.length, avg = chunks.reduce((s, p) => s + p.terms.length, 0) / n;
  for (const p of chunks) {
    p.bm25 = ["e42", "refund", "deadline"].reduce((sum, term) => {
      const df = chunks.filter(c => c.terms.includes(term)).length, tf = p.terms.filter(t => t === term).length;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      return sum + idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * p.terms.length / avg));
    }, 0);
    p.dense = p.vector[0] / Math.hypot(...p.vector); // Query vector is [1, 0].
  }
  const ranks = key => chunks.map((c, i) => ({ i, score: c[key] })).sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.i);
  const sparse = ranks("bm25"), dense = ranks("dense");
  chunks.forEach((c, i) => { c.rrf = (1 - alpha) / (60 + sparse.indexOf(i) + 1) + alpha / (60 + dense.indexOf(i) + 1); c.i = i; });
  chunks.sort((a, b) => b.rrf - a.rrf || a.i - b.i);
  const selected = chunks.slice(0, Math.min(k, n)), covered = new Set(selected.flatMap(c => c.facts));
  return { chunks, selected, covered };
}
const hybridLab = {
  title: "切块与混合检索：两条事实能一起回来吗？",
  question: "问题为 e42 refund deadline。A1 说明 E42 是支付失败，A2 给出退款期；B 是已过时或无关文本。小块各取一段，大块把同一文档两段合并。调整稀疏/稠密融合权重和 top-k，先猜何时能覆盖两个事实。",
  controls: [
    { key: "size", label: "每块的段落数", initial: "1", options: [{ value: "1", label: "小块 · 1 段" }, { value: "2", label: "大块 · 2 段" }] },
    { key: "alpha", label: "稠密排名权重 α（0 为 BM25，1 为稠密）", min: 0, max: 1, step: 0.1, initial: 0.5, format: v => v.toFixed(1) },
    { key: "k", label: "取回的块数 top-k", min: 1, max: 4, step: 1, initial: 2 },
  ],
  presets: [
    { label: "小块 · 混合 top-2", values: { size: "1", alpha: 0.5, k: 2 } },
    { label: "小块 · 纯稠密", values: { size: "1", alpha: 1, k: 2 } },
    { label: "小块 · 纯 BM25", values: { size: "1", alpha: 0, k: 2 } },
    { label: "大块 · 混合 top-1", values: { size: "2", alpha: 0.5, k: 1 } },
  ],
  check: {
    question: "大块 top-1 覆盖两条事实，是否意味着永远应该用大块？",
    answer: "这里两条事实恰好相邻且在同一文档。大块也带入更多无关文字，会占上下文与重排预算；若答案跨文档，大块也不能保证合并。应按证据跨度、延迟、上下文长度及端到端评测共同选块，必要时扩展相邻块。",
  },
  evaluate({ size, alpha, k }) {
    const r = retrieve(Number(size), alpha, k);
    return {
      type: "bars", unit: "加权 RRF 分数 × 1000", rows: r.chunks.map((c, i) => ({ label: `${i < r.selected.length ? "已取" : "未取"} ${c.label}${c.facts.length ? ` · 事实 ${c.facts.join("+")}` : " · 无关"}`, value: c.rrf * 1000, display: (c.rrf * 1000).toFixed(3) })),
      readout: `取回 ${r.selected.map(c => c.label).join("、")}；覆盖事实 ${r.covered.size}/2（${pct(r.covered.size / 2)}）；实际返回 ${r.selected.length} 块`,
      explanation: `对每块先分别算 BM25 和二维向量的余弦排名，再按 (1−α)/(60+稀疏排名)+α/(60+稠密排名) 融合。二维向量是手工指定的教学数据，不是模型输出；事实标签用于评估，不参与排序。`,
    };
  },
};

/* Fixed candidate and reranker scores; two explicit, deterministic readers. */
const traces = [
  { id: "Q1", gold: 30, retrieval: ["R", "A", "B", "C", "D", "E"], scores: { R: 0.6, A: 0.9, B: 0.3, C: 0.2, D: 0.1, E: 0.05 } },
  { id: "Q2", gold: 60, retrieval: ["A", "R", "B", "C", "D", "E"], scores: { R: 0.9, A: 0.3, B: 0.2, C: 0.1, D: 0.08, E: 0.05 } },
  { id: "Q3", gold: 90, retrieval: ["A", "B", "R", "C", "D", "E"], scores: { R: 0.5, A: 0.9, B: 0.8, C: 0.2, D: 0.1, E: 0.05 } },
  { id: "Q4", gold: 15, retrieval: ["A", "B", "C", "R", "D", "E"], scores: { R: 0.9, A: 0.5, B: 0.4, C: 0.3, D: 0.2, E: 0.1 } },
  { id: "Q5", gold: 45, retrieval: ["A", "B", "C", "D", "R", "E"], scores: { R: 0.8, A: 0.9, B: 0.5, C: 0.4, D: 0.3, E: 0.1 } },
  { id: "Q6", gold: 21, retrieval: ["A", "B", "C", "D", "E", "R"], scores: { R: 0.8, A: 0.9, B: 0.5, C: 0.4, D: 0.3, E: 0.1 } },
];
const traceLab = {
  title: "分段诊断：漏召、重排漏选，还是看到却没用？",
  question: "六道合成题各有一条标注证据 R 和五条干扰文档 A–E。检索顺序与重排分数固定；重排只排序候选。两个简化阅读器分别取第一块的数字，或查找题号匹配的块。先猜 top-3 → top-2 时哪一步丢了哪些题。",
  controls: [
    { key: "candidate", label: "候选数", min: 1, max: 6, step: 1, initial: 3 },
    { key: "ranker", label: "重排", initial: "on", options: [{ value: "off", label: "沿用检索顺序" }, { value: "on", label: "按固定分数重排" }] },
    { key: "context", label: "最多放入上下文的块数", min: 1, max: 3, step: 1, initial: 2 },
    { key: "reader", label: "简化阅读器", initial: "first", options: [{ value: "first", label: "只取第一块" }, { value: "matched", label: "匹配题号" }] },
  ],
  presets: [
    { label: "候选 3 · 重排 2 · 首块", values: { candidate: 3, ranker: "on", context: 2, reader: "first" } },
    { label: "匹配题号", values: { candidate: 3, ranker: "on", context: 2, reader: "matched" } },
    { label: "扩大候选至 6", values: { candidate: 6, ranker: "on", context: 2, reader: "matched" } },
    { label: "不重排", values: { candidate: 3, ranker: "off", context: 2, reader: "first" } },
  ],
  check: {
    question: "某题的标注证据没进上下文，真实系统仍可能答对吗？",
    answer: "可能：模型已有参数知识、题目有别的有效证据，或标签不完整。因此真实答案正确率没有被标注证据召回率统一限定。这里两个阅读器没有参数知识且干扰答案都错，所以仅在这个封闭玩具条件下，正确必须以标注证据进入上下文为前提。",
  },
  evaluate({ candidate, ranker, context, reader }) {
    const rows = traces.map(t => {
      const candidates = t.retrieval.slice(0, candidate), ranked = [...candidates];
      if (ranker === "on") ranked.sort((a, b) => t.scores[b] - t.scores[a]);
      const selected = ranked.slice(0, Math.min(context, candidate));
      const passages = selected.map(id => id === "R" ? { owner: t.id, value: t.gold } :
        { owner: "other", value: { A: 7, B: 9, C: 11, D: 13, E: 17 }[id] });
      const answer = reader === "first" ? passages[0] : passages.find(p => p.owner === t.id);
      const retrieved = candidates.includes("R"), present = selected.includes("R"), correct = answer?.value === t.gold;
      return { ...t, retrieved, present, correct, selected, rank: ranked.indexOf("R") + 1 };
    });
    const count = key => rows.filter(row => row[key]).length;
    const names = row => `${row.id} · ${row.retrieved ? `候选有 R / 排名 ${row.rank}` : "候选无 R"}`;
    return {
      type: "bars", unit: "阶段（0 漏召 · 1 重排漏选 · 2 利用错 · 3 答对）", maxValue: 3,
      rows: rows.map(row => ({ label: names(row), value: row.correct ? 3 : row.present ? 2 : row.retrieved ? 1 : 0, display: `${row.selected.join("→")} · ${row.correct ? "答对" : "答错"}` })),
      readout: `6 题中：候选含标注证据 ${count("retrieved")} 题 → 上下文含证据 ${count("present")} 题 → 答对 ${count("correct")} 题；${ranker === "on" ? "按分数重排" : "沿用检索顺序"}，${reader === "first" ? "只取第一块" : "匹配题号"}`,
      explanation: `每一行都保留题号与选入顺序；候选阶段 ${count("retrieved")}、上下文阶段 ${count("present")} 是同一批题的证据覆盖。这里预设 R 是唯一正确证据、干扰项的数字都不同于答案，阅读器也没有背景知识；这些是可控假设，不是真实语言模型的测量。`,
    };
  },
};

export default { "8.1": contrast, "8.1-graph": graphLab, "8.2": hybridLab, "8.2-trace": traceLab };
