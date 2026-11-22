// A fixed miniature corpus is shared by the deduplication and audit labs.
// These are whitespace-delimited toy tokens, not a production tokenizer.
import { figure, text } from "./math-kit.mjs";

const docs = [
  { id: "A1", text: "how to reset an account password using email verification safely", score: .90 },
  { id: "A2", text: "How to reset an account password using email verification safely!", score: .90 },
  { id: "A3", text: "how to reset an account password using email verification securely", score: .86 },
  { id: "B1", text: "python read csv file handle missing values and write report", score: .88 },
  { id: "B2", text: "python read csv file handle missing values and export report", score: .82 },
  { id: "C", text: "recetas de arroz para la familia con verduras y especias", score: .62 },
  { id: "D", text: "click now win prize click now win prize click now", score: .10 },
  { id: "E", text: "which planet is known as the red planet mars", score: .75 },
  { id: "F", text: "read the passage and answer this question what is three plus seven", score: .55 },
];
const tokens = s => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const shingles = (s, n) => {
  const words = tokens(s), out = new Set();
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
};
const intersectionSize = (a, b) => [...a].filter(x => b.has(x)).length;
const jaccard = (a, b) => {
  const x = shingles(a, 3), y = shingles(b, 3), intersection = intersectionSize(x, y);
  return intersection / (x.size + y.size - intersection);
};
const countTokens = rows => rows.reduce((sum, row) => sum + tokens(row.text).length, 0);
const percent = value => (100 * value).toFixed(1) + "%";

// Fixed shingle IDs and 100 affine hashes make the LSH example reproducible.
// This is an instructional hash family, not a claim of independent permutations.
const shingleIds = new Map([...new Set(docs.flatMap(doc => [...shingles(doc.text, 3)]))]
  .sort().map((shingle, i) => [shingle, i + 1]));
const PRIME = 65521, BANDS = 20, ROWS = 5;
function minhash(doc) {
  const ids = [...shingles(doc.text, 3)].map(value => shingleIds.get(value));
  let state = 3;
  return Array.from({ length: BANDS * ROWS }, () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const a = 1 + state % (PRIME - 1);
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const b = state % PRIME;
    return Math.min(...ids.map(id => (a * id + b) % PRIME));
  });
}
const signatures = new Map(docs.map(doc => [doc.id, minhash(doc)]));
const bandKeys = signature => Array.from({ length: BANDS }, (_, i) =>
  `${i}:${signature.slice(i * ROWS, (i + 1) * ROWS).join(",")}`);

function funnel(nearThreshold, qualityThreshold, mode) {
  const seen = new Set(), exact = [];
  for (const doc of docs) {
    const key = tokens(doc.text).join(" ");
    if (!seen.has(key)) { seen.add(key); exact.push(doc); }
  }
  const near = [], buckets = new Map();
  let candidates = 0, comparisons = 0;
  for (const doc of exact) {
    const keys = bandKeys(signatures.get(doc.id));
    const found = new Set();
    if (mode === "lsh") for (const key of keys) for (const i of buckets.get(key) ?? []) found.add(i);
    const pool = mode === "lsh" ? [...found].sort((a, b) => a - b).map(i => near[i]) : near;
    candidates += pool.length;
    let duplicate = false;
    for (const previous of pool) {
      comparisons++;
      if (jaccard(doc.text, previous.text) >= nearThreshold) { duplicate = true; break; }
    }
    if (!duplicate) {
      const i = near.length;
      near.push(doc);
      if (mode === "lsh") for (const key of keys) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
      }
    }
  }
  return { stages: [docs, exact, near, near.filter(doc => doc.score >= qualityThreshold)], candidates, comparisons };
}

function bars(label, rows) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return figure(320, rows.length * 39 + 8, label, rows.map((row, i) => {
    // Keep the bar's right edge well clear of the right-aligned number column.
    const y = 7 + i * 39, width = 70 * row.value / max;
    return `${text(1, y + 14, row.label, "lab-fig-label")}<rect x="105" y="${y}" width="70" height="17" class="lab-fig-gridline is-faint"/><rect x="105" y="${y}" width="${width}" height="17" class="lab-fill-blue"/>${text(315, y + 14, row.display, "lab-fig-value", "end")}`;
  }).join(""));
}

const dataFunnel = {
  title: "去重与过滤漏斗：每一步究竟删掉了什么？",
  question: "九篇网页先做精确去重，再选择穷举或固定种子 MinHash/LSH 生成近重候选；每个候选都用精确 3-gram Jaccard 核验，最后按预设质量分过滤。两侧分别显示所选漏斗及两种策略的比较数。",
  controls: [
    { key: "near", label: "判为近重的 Jaccard 下限", min: .4, max: .95, step: .05, initial: .7, format: v => v.toFixed(2) },
    { key: "quality", label: "质量分下限", min: 0, max: .95, step: .05, initial: .5, format: v => v.toFixed(2) },
    { key: "mode", label: "近重候选策略", initial: "exhaustive", options: [{ value: "exhaustive", label: "穷举" }, { value: "lsh", label: "MinHash / LSH" }] },
  ],
  presets: [
    { label: "默认筛选", values: { near: .7, quality: .5, mode: "exhaustive" } },
    { label: "穷举 · 0.60", values: { near: .6, quality: .5, mode: "exhaustive" } },
    { label: "LSH 漏召 · 0.60", values: { near: .6, quality: .5, mode: "lsh" } },
    { label: "候选未达阈值 · 0.80", values: { near: .8, quality: .5, mode: "lsh" } },
    { label: "质量门槛更高", values: { near: .7, quality: .65, mode: "exhaustive" } },
  ],
  check: {
    question: "阈值为 0.60 时为什么 B1/B2 会被 LSH 漏掉？阈值为 0.80 时 A1/A3 为什么仍能保留？",
    answer: "固定种子下 B1/B2 的 20 个 band 均未命中，因此不会被送到精确比较；A1/A3 命中了 band，但精确 Jaccard 约 0.778，低于 0.80。候选召回和精确阈值分别决定能不能比较、比较后是否合并。",
  },
  evaluate({ near, quality, mode = "exhaustive" }) {
    const all = funnel(near, quality, "exhaustive"), index = funnel(near, quality, "lsh");
    const stages = (mode === "lsh" ? index : all).stages, names = ["原始", "精确去重", "近重", "质量过滤"];
    const rows = stages.map((s, i) => ({ label: names[i], value: countTokens(s), display: `${countTokens(s)} token / ${s.length} 篇` }));
    const bruteIds = new Set(all.stages[2].map(doc => doc.id));
    const indexIds = new Set(index.stages[2].map(doc => doc.id));
    const extra = index.stages[2].filter(doc => !bruteIds.has(doc.id)).map(doc => doc.id);
    const missing = all.stages[2].filter(doc => !indexIds.has(doc.id)).map(doc => doc.id);
    const difference = extra.length || missing.length
      ? `LSH 相比穷举${extra.length ? `多保留 ${extra.join("、")}` : ""}${extra.length && missing.length ? "，" : ""}${missing.length ? `额外删除 ${missing.join("、")}` : ""}`
      : "两种策略的近重保留结果相同";
    const comparisons = [
      { label: "穷举精确比较", value: all.comparisons, display: `${all.comparisons} 对` },
      { label: "LSH 候选", value: index.candidates, display: `${index.candidates} 对` },
      { label: "LSH 精确比较", value: index.comparisons, display: `${index.comparisons} 对` },
    ];
    const kept = stages[3].map(d => d.id).join("、") || "无";
    return {
      type: "panels", panels: [
        { title: mode === "lsh" ? "LSH 漏斗 · 空格 token" : "穷举漏斗 · 空格 token", shape: "svg", svg: bars("各阶段剩余 token", rows) },
        { title: "候选与精确比较 · 文档对", shape: "svg", svg: bars("两种策略的候选与比较数", comparisons), detail: "各自按固定顺序贪心处理；未计签名和建索引开销。" },
      ],
      readout: `原始 ${countTokens(docs)} → 精确 ${countTokens(stages[1])} → 近重 ${countTokens(stages[2])} → 过滤 ${countTokens(stages[3])} token；保留 ${kept}；${difference}`,
      explanation: `固定种子 3、100 个仿射哈希组成 20 组 × 5 行；LSH 命中才执行精确 Jaccard 阈值核验。穷举精比 ${all.comparisons} 对，LSH 检索 ${index.candidates} 对候选并精比 ${index.comparisons} 对。小语料的比较数不代表生产耗时；质量分是人为设定，评测污染需另行审计。`,
    };
  },
};

const queries = [
  { label: "原题", text: "which planet is known as the red planet" },
  { label: "同事实改写", text: "name the rust colored world" },
  { label: "共同模板", text: "read the passage and answer this question what is ten divided by two" },
  { label: "潮汐新题", text: "which force causes earth ocean tides" },
];
function overlap(query, n) {
  const q = shingles(query, n);
  return Math.max(...docs.map(doc => intersectionSize(q, shingles(doc.text, n)) / q.size));
}
const audit = {
  title: "污染审计：词面命中与真正泄漏有多大距离？",
  question: "在同一份原始语料里，逐题找单篇训练文档的最大 n-gram 覆盖率；阈值以上标记复核。四道玩具题依次为原题、同事实改写、共同模板但题目不同、潮汐新题。移动 n 和阈值，观察命中数，注意命中既不是泄漏的证明，也不能查出所有改写。",
  controls: [
    { key: "n", label: "连续词的个数 n", min: 2, max: 5, step: 1, initial: 3 },
    { key: "threshold", label: "复核覆盖率阈值", min: .1, max: 1, step: .05, initial: .6, format: percent },
  ],
  presets: [
    { label: "3-gram · 60%", values: { n: 3, threshold: .6 } },
    { label: "更严格", values: { n: 3, threshold: .8 } },
    { label: "5-gram", values: { n: 5, threshold: .6 } },
  ],
  scrub: { key: "threshold" },
  check: {
    question: "为什么 3-gram、60% 时命中两题，却不能说泄漏率为 50%？",
    answer: "原题与训练文本完全重合，但共同模板也触发；改写同一事实的题目却没有词面命中。共享事实也不一定是测试集泄漏：要查具体题目、时间、来源、训练快照和人工复核。",
  },
  evaluate({ n, threshold }) {
    const scores = queries.map(q => overlap(q.text, n));
    const points = Array.from({ length: 19 }, (_, i) => {
      const t = (i + 2) / 20;
      return [t, scores.filter(s => s + 1e-12 >= t).length];
    });
    const hits = scores.filter(s => s + 1e-12 >= threshold).length;
    return {
      type: "lines", xLabel: "复核阈值", yLabel: "标记题数（四题）", domainX: [.1, 1], domainY: [0, 4],
      series: [{ label: `${n}-gram 复核数`, points }], point: { x: threshold, y: hits, label: "当前阈值" },
      readout: `原题 ${percent(scores[0])} · 改写 ${percent(scores[1])} · 模板 ${percent(scores[2])} · 潮汐 ${percent(scores[3])}；标记 ${hits}/4`,
      explanation: "每题分母是题目本身的不重复 n-gram 数；分子来自单篇训练文档，避免不同文档拼接误报。玩具例子中同事实改写没有词面交集，模板命中的是题干套话，二者都需要进一步核查。",
    };
  },
};

const initialHard = .30, easyPass = .90;
function trajectory(hardPass, retention) {
  const out = [initialHard];
  for (let round = 0; round < 8; round++) {
    const hard = out.at(-1), accepted = hard * hardPass / ((1 - hard) * easyPass + hard * hardPass);
    out.push((1 - retention) * accepted + retention * initialHard);
  }
  return out;
}
const selfTrain = {
  title: "自训练的分布收缩：通过率上升，难题去哪了？",
  question: "假设每轮任务来源的易、难比例复制上一轮训练集，易题通过率固定 90%。通过的样本按原比例用于训练，并混入一定比例的原始人工任务（难题占 30%）。拖动难题通过率和人工样本占比，观察后续训练分布；这是显式简化模型，不是神经网络训练的预测。",
  controls: [
    { key: "hardPass", label: "难题的固定通过率", min: .05, max: .9, step: .05, initial: .2, format: percent },
    { key: "retention", label: "每轮人工任务混入比例", min: 0, max: .5, step: .05, initial: .2, format: percent },
  ],
  presets: [
    { label: "无原始任务锚定", values: { hardPass: .2, retention: 0 } },
    { label: "混入 20%", values: { hardPass: .2, retention: .2 } },
    { label: "难题也容易通过", values: { hardPass: .75, retention: .2 } },
  ],
  check: {
    question: "当易题与难题通过率都为 90% 时，为何没有选择导致的难题比例收缩？",
    answer: "两组被同比例保留，条件化之后比例仍为 30%；这并不表示两组的答案都正确，验证器错判等问题另算。",
  },
  evaluate({ hardPass, retention }) {
    const pure = trajectory(hardPass, 0), mixed = trajectory(hardPass, retention);
    const pass0 = (1 - initialHard) * easyPass + initialHard * hardPass;
    const selected0 = initialHard * hardPass / pass0;
    return {
      type: "lines", xLabel: "自训练轮数", yLabel: "下轮训练集的难题占比", domainX: [0, 8], domainY: [0, .35],
      series: [
        { label: "不混原始任务", points: pure.map((v, i) => [i, v]) },
        { label: "按当前比例混入", points: mixed.map((v, i) => [i, v]) },
      ],
      point: { x: 8, y: mixed[8], label: "第 8 轮" },
      readout: `第 1 轮总通过率 ${percent(pass0)}，通过集中难题 ${percent(selected0)}；第 8 轮难题：未混入 ${percent(pure[8])}，当前混入 ${percent(mixed[8])}`,
      explanation: "每轮生成任务的类别分布等于上轮训练分布；通过率固定，不模拟模型能力变化、有限样本、长度或真实数据。混入的是原始任务和标注，并非宣称只要加噪声就能防止收缩。",
    };
  },
};

const coverage = {
  title: "多采样既扩大覆盖，也会放大误验机会",
  question: "假设每次独立采样正确概率 p，验证器对正确答案的召回率固定 90%，对错误答案的误通过率为 f。每题生成 k 个候选：画出至少一个正确且通过、至少一个错误却通过的概率。两事件可能同时发生，不能相减。",
  controls: [
    { key: "p", label: "单次生成正确率 p", min: .05, max: .9, step: .05, initial: .2, format: percent },
    { key: "falsePass", label: "错误答案的误通过率 f", min: 0, max: .2, step: .01, initial: .05, format: percent },
    { key: "k", label: "每题候选数 k", min: 1, max: 40, step: 1, initial: 16 },
  ],
  presets: [
    { label: "16 次 · 有误验", values: { p: .2, falsePass: .05, k: 16 } },
    { label: "难题更难", values: { p: .05, falsePass: .05, k: 16 } },
    { label: "无误验", values: { p: .2, falsePass: 0, k: 16 } },
  ],
  scrub: { key: "k" },
  check: {
    question: "至少存在一个正确通过的候选，为什么不等于最后选出的答案一定正确？",
    answer: "同一组还可能有错误通过的候选；没有规定排序与选择规则就不能推断最终被选中的答案。独立假设也可能被高度相似的样本破坏。",
  },
  evaluate({ p, falsePass, k }) {
    const recall = .9, good = p * recall, bad = (1 - p) * falsePass;
    const trueAt = n => 1 - (1 - good) ** n, falseAt = n => 1 - (1 - bad) ** n;
    const precision = good / (good + bad);
    return {
      type: "lines", xLabel: "每题候选数 k", yLabel: "至少发生一次的概率", domainX: [1, 40], domainY: [0, 1],
      series: [
        { label: "正确且通过至少一次", points: Array.from({ length: 40 }, (_, i) => [i + 1, trueAt(i + 1)]) },
        { label: "错误却通过至少一次", points: Array.from({ length: 40 }, (_, i) => [i + 1, falseAt(i + 1)]) },
      ],
      point: { x: k, y: trueAt(k), label: "正确通过" },
      readout: `k=${k}：至少一次正确通过 ${percent(trueAt(k))}，至少一次错误通过 ${percent(falseAt(k))}；单候选通过后的正确率 ${percent(precision)}`,
      explanation: "假设采样和验题误差跨候选独立。不同候选常共享错误与验证器漏洞，真实覆盖要逐题实测；图中两个事件可同时发生，不能把两条曲线相减当最终正确率。",
    };
  },
};

export {
  dataFunnel as "6.2",
  audit as "6.2-audit",
  selfTrain as "2.9",
  coverage as "2.9-coverage",
};
