// Exact toy models for M9. Inputs are synthetic counts and abstract labels, never real prompts.
import { parameterStudy } from "./parameter-study.mjs";

const pct = x => `${(100 * x).toFixed(1)}%`;
const study = ({ title, question, key, label, initial, labels, measure, explanation, check, answer }) =>
  parameterStudy({ title, question,
    control: { key, label, min: 0, max: 1, step: 0.05, initial },
    axis: "比例", labels, measure, explanation, check, answer,
  });

// Two groups, each has five cases in each fixed, abstract policy category.
const groups = [
  { reject: [.55, .65, .75, .85, .95], allow: [.05, .15, .25, .35, .45] },
  { reject: [.35, .45, .70, .80, .90], allow: [.10, .20, .40, .50, .60] },
];
const confusion = (g, threshold) => ({
  missed: g.reject.filter(score => score < threshold).length,
  over: g.allow.filter(score => score >= threshold).length,
});
const pooled = threshold => {
  const counts = groups.map(g => confusion(g, threshold));
  return [counts.reduce((n, x) => n + x.missed, 0) / 10,
          counts.reduce((n, x) => n + x.over, 0) / 10];
};
const stratified = threshold => {
  const first = confusion(groups[0], .5), second = confusion(groups[1], threshold);
  return [second.missed / 5, second.over / 5,
          (first.missed + second.missed) / 10, (first.over + second.over) / 10];
};

// Counts per fixed proposed answer-confidence group, not token probabilities.
const confidenceGroups = [
  { p: .2, n: 10, correct: 2 },
  { p: .6, n: 10, correct: 6 },
  { p: .9, n: 10, correct: 7 },
];
function calibration(scale) {
  const bins = Array.from({ length: 5 }, (_, i) => ({ index: i + 1, n: 0, correct: 0, sumP: 0 }));
  let brier = 0;
  for (const g of confidenceGroups) {
    const p = .5 + scale * (g.p - .5);
    const bin = bins[Math.min(4, Math.floor(p * 5))];
    bin.n += g.n;
    bin.correct += g.correct;
    bin.sumP += g.n * p;
    brier += g.correct * (1 - p) ** 2 + (g.n - g.correct) * p ** 2;
  }
  const occupied = bins.filter(b => b.n);
  const ece = occupied.reduce((s, b) => s + b.n / 30 * Math.abs(b.correct / b.n - b.sumP / b.n), 0);
  return { occupied, ece, brier: brier / 30 };
}
// A dedicated reliability diagram: numbered circles and a text key keep the
// bin counts readable even when a mobile viewport puts points close together.
function reliabilityFigure(occupied) {
  const x = p => 52 + 260 * p;
  const y = p => 232 - 198 * p;
  const ticks = [0, .5, 1];
  const grid = ticks.map(t => `
    <path d="M${x(0)} ${y(t)}H${x(1)} M${x(t)} ${y(0)}V${y(1)}" class="lab-grid"/>
    <text x="43" y="${y(t) + 4}" text-anchor="end" class="lab-fig-mono">${t.toFixed(1)}</text>
    <text x="${x(t)}" y="253" text-anchor="middle" class="lab-fig-mono">${t.toFixed(1)}</text>`).join("");
  const points = occupied.map(b => {
    const confidence = b.sumP / b.n, accuracy = b.correct / b.n;
    return `<g><title>箱 ${b.index}：平均置信度 ${pct(confidence)}，正确率 ${pct(accuracy)}，样本 ${b.n}</title>
      <circle cx="${x(confidence)}" cy="${y(accuracy)}" r="10" fill="var(--lab-blue)" stroke="var(--lab-stage)" stroke-width="1.5"/>
      <text x="${x(confidence)}" y="${y(accuracy) + 4.5}" text-anchor="middle" style="fill:var(--lab-stage);font-size:13px;font-weight:700">${b.index}</text></g>`;
  }).join("");
  const labels = occupied.map(b => `<div><strong>箱 ${b.index}</strong> · 预测 ${pct(b.sumP / b.n)} · 实际 ${pct(b.correct / b.n)} · n=${b.n}</div>`).join("");
  return `<svg class="lab-figure" viewBox="0 0 350 282" role="img" aria-label="可靠性图。横轴为平均置信度，纵轴为实际正确率，虚线为理想校准。编号圆点对应下方每箱的预测、实际和数量。">
    <text x="52" y="18" class="lab-fig-label">实际正确率</text>${grid}
    <path d="M${x(0)} ${y(0)}V${y(1)} M${x(0)} ${y(0)}H${x(1)}" class="lab-axis"/>
    <path d="M${x(0)} ${y(0)}L${x(1)} ${y(1)}" class="lab-guide"/>${points}
    <text x="${x(1)}" y="277" text-anchor="end" class="lab-fig-label">平均置信度</text>
  </svg><div style="font-size:.85rem;line-height:1.75;color:var(--body)" aria-label="各占用箱的统计">
    <div>虚线：理想校准；圆点编号对应下列箱。</div>${labels}</div>`;
}
const calibrationLab = {
  title: "校准图：压扁置信度会发生什么？",
  question: "固定 30 个问题的答案与正确性，仅把原置信度 p 映射为 0.5 + k(p−0.5)。看编号圆点的平均置信度、实际正确率及每箱样本数，再比较 ECE 与 Brier。",
  controls: [{ key: "scale", label: "置信度伸缩 k", min: 0, max: 1, step: .05, initial: 1 }],
  presets: [{ label: "原置信度", values: { scale: 1 } }, { label: "全部压到 0.5", values: { scale: 0 } }],
  check: { question: "k=0 时 ECE 为零就能说明每组都可靠么？", answer: "不能。所有样本被放进同一箱，总体正确率恰好为 50%；原三组正确率仍为 20%、60%、70%，Brier 分数也从 0.217 恶化到 0.250。" },
  evaluate({ scale }) {
    const { occupied, ece, brier } = calibration(scale);
    return {
      type: "svg", svg: reliabilityFigure(occupied),
      readout: `ECE ${ece.toFixed(3)} · Brier ${brier.toFixed(3)} · 答案正确率 50.0% · 占用 ${occupied.length} 箱`,
      explanation: "等宽 5 箱；每个箱以样本数加权，空箱不画点。答案没有改变，只有概率读数变化；ECE 会因合箱抵消，Brier 同时包含概率质量与分辨能力。",
    };
  },
};

const selected = [
  [.95, 1], [.90, 1], [.85, 0], [.80, 1], [.75, 1],
  [.70, 0], [.65, 1], [.60, 0], [.55, 1], [.50, 0],
];
function riskCoverage(threshold) {
  const answered = selected.filter(([p]) => p >= threshold);
  const errors = answered.filter(([, correct]) => !correct).length;
  return [answered.length / selected.length, errors / answered.length];
}

const featureInterference = /* @__PURE__ */ study({
  title: "三种特征挤进二维：稀疏度与干扰",
  question: "三个单位特征方向在二维相隔 120°。目标特征已开启，其他两个各自独立地以概率 p 开启；对比叠加读出误差与三维正交基。",
  key: "p", label: "其他特征的开启概率 p", initial: .2,
  labels: ["二维叠加的条件均方误差", "三维正交的条件均方误差"],
  measure: p => [(p + p * p) / 2, 0],
  explanation: "二维读出使用与目标方向的点积，两个干扰方向的点积都是 −1/2，故误差平方期望为 (p+p²)/2。正交比较使用三个维度，模型只展示几何干扰，不代表训练好的 SAE 的真实误差。",
  check: "p=0.2 时，二维均方误差为什么是 0.12？", answer: "两个干扰独立出现；展开 E[(−K/2)²]=[2p(1−p)+4p²]/4=0.12。若干扰相关则要重新计算。",
});

const causalIntervention = /* @__PURE__ */ study({
  title: "相关还是因果：同样的观测，两种干预",
  question: "观测中二元特征 z 等于背景 c，输出 y 也等于 c，两个假设都预测完全相关。以随机比例 q 把 z 钳为 0，比较两种结构模型的输出率。",
  key: "q", label: "钳制 z 的样本比例 q", initial: .5,
  labels: ["y 由 z 决定", "y 由 c 决定"],
  measure: q => [.5 * (1 - q), .5],
  explanation: "c 在样本中有一半为 1；随机钳制独立于 c。两个模型自然观测完全一致，但 do(z=0) 后一个下降、另一个不变。真实干预仍需排查分布外副作用、替代路径与对照。",
  check: "q=1 时两个输出率分别是多少？", answer: "如果 y=z，钳制后为 0%；如果 y=c，仍为 50%。仅靠观测时的相关系数无法区分。",
});

const refusalThreshold = /* @__PURE__ */ study({
  title: "拒答边界：聚合漏过率与过度拒答率",
  question: "20 个虚构样本各有固定评分与人工类别，10 个标为需拒绝，10 个标为应回答。评分大于或等于阈值就拒答。拖动阈值，比较两种错误的条件比例。",
  key: "threshold", label: "拒答阈值", initial: .5,
  labels: ["需拒绝类的漏过率", "应回答类的过度拒答率"], measure: pooled,
  explanation: "漏过率以需拒绝类为分母，过度拒答率以应回答类为分母；两条曲线由同一批固定评分精确计数。分类器分数不是风险概率，也不是对真实系统的预测。",
  check: "阈值 0.5 时两类错误各多少？", answer: "需拒绝类漏过 2/10=20%；应回答类被误拒 2/10=20%。阈值提高，漏过通常增加而误拒减少。",
});

const stratifiedThreshold = /* @__PURE__ */ study({
  title: "分层阈值：总体比例会藏住什么？",
  question: "沿用相同样本，按预先定义的场景分为 G1、G2；G1 阈值固定为 0.5，只改变 G2 阈值，比较 G2 与总体两类错误。",
  key: "threshold", label: "G2 的拒答阈值", initial: .5,
  labels: ["G2 漏过率", "G2 过度拒答率", "总体漏过率", "总体过度拒答率"],
  measure: stratified,
  explanation: "每层各有五个需拒绝和五个应回答样本；总比率按计数加权，而非无条件地平均组率。阈值必须在开发集选择，再在独立样本盲审；分层没有自动保证公平或泛化。",
  check: "G2 阈值 0.4 时，总体比例是多少？", answer: "G2 漏过 1/5、误拒 3/5；G1 两者均为 0/5，因此总体漏过 1/10、误拒 3/10。样本太少，不能视作部署性能。",
});

const selectiveCoverage = {
  title: "置信度门槛：覆盖率与选择性风险",
  question: "10 个固定回答有置信度与真值；达到门槛才回答，其余弃答。拖动门槛看回答覆盖率和已回答部分的错误率。",
  controls: [{ key: "threshold", label: "最低置信度", min: .5, max: .95, step: .05, initial: .75 }],
  scrub: { key: "threshold" },
  check: { question: "门槛 0.90 时错误率为零意味着系统可靠么？", answer: "只说明这 10 题中被选中的 2 题都对；覆盖率仅 20%，样本量也太小，未知分布上的风险不能由此保证。" },
  evaluate({ threshold }) {
    const points = Array.from({ length: 10 }, (_, i) => Number((.5 + .05 * i).toFixed(2)));
    const [coverage, risk] = riskCoverage(threshold);
    return {
      type: "lines", domainX: [.5, .95], domainY: [0, 1], xLabel: "最低置信度", yLabel: "比例",
      series: [
        { label: "回答覆盖率", points: points.map(x => [x, riskCoverage(x)[0]]) },
        { label: "已回答部分的错误率", points: points.map(x => [x, riskCoverage(x)[1]]) },
      ],
      point: { x: threshold, y: coverage, label: "当前覆盖率" },
      readout: `覆盖率 ${pct(coverage)} · 已回答错误率 ${pct(risk)} · 全部样本正确率 60.0%`,
      explanation: "评分等于门槛时回答，范围保证至少回答 1 题；有限样本的选择性风险不一定随阈值单调下降，不能用训练集挑选结果当部署保证。",
    };
  },
};

export {
  featureInterference as "9.1",
  causalIntervention as "9.1-intervention",
  refusalThreshold as "9.2",
  stratifiedThreshold as "9.2-strata",
  calibrationLab as "9.3",
  selectiveCoverage as "9.3-coverage",
};
