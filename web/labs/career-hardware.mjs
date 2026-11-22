// Assumption-explicit arithmetic models used by the two M5 lessons.
// Times are hypothetical estimates, not measurements of any GPU.
const f = (x, digits = 2) => x.toFixed(digits);
const percent = x => `${f(100 * x, 1)}%`;

function pipeline({ recall, hit }) {
  const miss = 0.10;
  const success = recall * hit + (1 - recall) * miss;
  return { miss, success };
}

const diagnostic = {
  title: "检索命中更多，最终任务就一定更好吗？",
  question: "在假设练习中，命中充分证据的概率为 R；命中和未命中后的成功率分别为 H 和 10%。调 R 与 H，比较最终成功率。此处的条件成功率是观察量。",
  controls: [
    { key: "recall", label: "证据命中率 R", min: 0.20, max: 0.95, step: 0.05, initial: 0.60, format: percent },
    { key: "hit", label: "命中后成功率 H", min: 0.20, max: 1, step: 0.05, initial: 0.75, format: percent },
  ],
  presets: [
    { label: "原方案", values: { recall: 0.60, hit: 0.75 } },
    { label: "仅提高召回", values: { recall: 0.80, hit: 0.75 } },
    { label: "新方案观测", values: { recall: 0.80, hit: 0.60 } },
  ],
  check: {
    question: "R 从 60% 升到 80%，H 从 75% 降到 60%，最终成功率如何变化？",
    answer: "从 49% 到 50%。前者是 0.6×0.75+0.4×0.10；后者是 0.8×0.60+0.2×0.10。不同方案命中的题可能不同，不能直接把 H 的变化归因于生成模型。",
  },
  evaluate(state) {
    const { recall, hit } = state, { miss, success } = pipeline(state);
    const original = pipeline({ recall: 0.6, hit: 0.75 }).success;
    const heldHit = pipeline({ recall, hit: 0.75 }).success;
    return {
      type: "bars", unit: "任务成功率（%）", maxValue: 100,
      rows: [
        { label: "当前条件下的总体成功率", value: 100 * success, display: percent(success) },
        { label: "固定 H 为 75% 的预测", value: 100 * heldHit, display: percent(heldHit) },
        { label: "原方案", value: 100 * original, display: percent(original) },
      ],
      readout: `R=${percent(recall)}，H=${percent(hit)}：总体 ${percent(success)}；固定 H=75% 时预测 ${percent(heldHit)}。`,
      explanation: `总成功率 = R×H + (1−R)×${percent(miss)}。固定 H 的预测需要条件成功率也保持不变；不同命中集合的 H 不能直接解释为同一批任务的因果效应。`,
    };
  },
};

function paired(k) {
  const n = 200, aOnly = 6 + k, bOnly = 18 + k;
  const delta = (bOnly - aOnly) / n;
  const q = (aOnly + bOnly) / n;
  const se = Math.sqrt((q - delta ** 2) / (n - 1));
  return { aOnly, bOnly, delta, low: delta - 1.96 * se, high: delta + 1.96 * se };
}
const pairedLab = {
  title: "分数差相同，证据强度为何不同？",
  question: "固定 200 道相同任务上的 B−A 差值为 6 个百分点；增加双方互相翻转的任务数 k，查看配对差的近似 95% 区间。",
  controls: [{ key: "k", label: "双方各增加的互斥成功数 k", min: 0, max: 80, step: 1, initial: 18 }],
  scrub: { key: "k" },
  presets: [
    { label: "少量分歧", values: { k: 0 } },
    { label: "诊断题", values: { k: 18 } },
    { label: "大量分歧", values: { k: 80 } },
  ],
  check: {
    question: "只看 B 比 A 高 6 个百分点，能判断区间是否跨零吗？",
    answer: "不能。k=0 时只有 A 对 6 题、只有 B 对 18 题，区间约 [1.26, 10.74] 个百分点；k=18 时分别是 24 和 36 题，区间约 [−1.56, 13.56]。两者都要求任务可视作独立抽样。",
  },
  evaluate({ k }) {
    const row = paired(k);
    const xs = Array.from({ length: 81 }, (_, i) => i);
    return {
      type: "lines", xLabel: "双方各增加的互斥成功数 k", yLabel: "B − A 的正确率差（百分点）", domainX: [0, 80], domainY: [-10, 22],
      series: [
        { label: "区间下界", points: xs.map(x => [x, 100 * paired(x).low]) },
        { label: "差值", points: xs.map(x => [x, 100 * paired(x).delta]) },
        { label: "区间上界", points: xs.map(x => [x, 100 * paired(x).high]) },
      ],
      point: { x: k, y: 100 * row.low, label: "当前下界" },
      readout: `仅 A 对 ${row.aOnly}，仅 B 对 ${row.bOnly}：差 ${f(100 * row.delta)} 个百分点，近似区间 [${f(100 * row.low)}, ${f(100 * row.high)}]。`,
      explanation: "同对和同错的配对差都为零；互相翻转越多，差值方差越大。此区间按 200 个独立任务的样本方差计算；同仓库或同文档相关时须按组估计。",
    };
  },
};

// Effective hypothetical rates: scalar FP32 10 TFLOP/s, global memory 1 TB/s,
// 5 microseconds per launch. One fused throughput factor scales both rates.
const BYTES_PER_US = 1e6, FLOPS_PER_US = 1e7, LAUNCH_US = 5;
function simple(n) {
  return { separate: 3 * (LAUNCH_US + 8 * n / BYTES_PER_US), fused: LAUNCH_US + 8 * n / BYTES_PER_US };
}
function fanout(n, eta) {
  const fStage = Math.max(8 * n / BYTES_PER_US, 80 * n / FLOPS_PER_US);
  const reluStage = 8 * n / BYTES_PER_US;
  const addStage = Math.max(8 * n / BYTES_PER_US, n / FLOPS_PER_US);
  const separate = 3 * LAUNCH_US + fStage + reluStage + addStage;
  const fused = LAUNCH_US + Math.max(12 * n / (eta * BYTES_PER_US), 81 * n / (eta * FLOPS_PER_US));
  return { separate, fused };
}
const sizeFormat = e => `${(2 ** e).toLocaleString("en-US")} 个`;
const fusion = {
  title: "三次访存和三次启动，融合以后剩下什么？",
  question: "FP32 向量计算 y=ReLU(a×x+b)。设每步先落地中间结果，分别读写一次；调向量大小，比较三次 kernel 与一次融合。所有时间均为模型估算。",
  controls: [{ key: "logN", label: "向量长度 N", min: 8, max: 25, step: 1, initial: 20, format: sizeFormat }],
  check: {
    question: "为什么本实验不管向量多长都恰好加速 3 倍？",
    answer: "这里三次独立 kernel 的每次读写量和启动成本完全相同，融合一次刚好只有其中一次的流量与启动。真实硬件的缓存、融合后的吞吐和计算差异会打破这一比例。",
  },
  evaluate({ logN }) {
    const n = 2 ** logN, r = simple(n);
    const xs = Array.from({ length: 69 }, (_, i) => 8 + i / 4);
    return {
      type: "lines", xLabel: "向量长度的指数 log₂ N", yLabel: "估算耗时（微秒）", scaleY: "log", domainX: [8, 25], domainY: [1, 1000],
      series: [
        { label: "三次 kernel", points: xs.map(x => [x, simple(2 ** x).separate]) },
        { label: "融合一次", points: xs.map(x => [x, simple(2 ** x).fused]) },
      ],
      point: { x: logN, y: r.separate, label: "当前三次 kernel" },
      readout: `N=${n.toLocaleString("en-US")}：三次 ${f(r.separate, 3)} μs，融合 ${f(r.fused, 3)} μs；比值 ${f(r.separate / r.fused)}×。`,
      explanation: `假设每次启动 5 μs、有效带宽 1 TB/s、三步都真实访问全局内存，分离与融合分别搬 24N 与 8N 字节。三次启动占分离估算的 ${percent(15 / r.separate)}。忽略缓存、资源损失与额外工作；这些数字不是 GPU 实测。`,
    };
  },
};
const fusionPenalty = {
  title: "融合有多大的吞吐损失才会亏？",
  question: "中间值同时被两个输出使用，融合后在同一线程复用它。独立阶段的有效带宽设为 1 TB/s、算力为 10 TFLOP/s；融合后的两者均乘 η。比较不同 η 和 N 的估算，η 是假设，必须实测。",
  controls: [
    { key: "eta", label: "融合后相对吞吐 η", min: 0.20, max: 1, step: 0.01, initial: 0.35, format: percent },
    { key: "logN", label: "向量长度 N", min: 8, max: 25, step: 1, initial: 20, format: sizeFormat },
  ],
  presets: [
    { label: "假设吞吐 100%", values: { eta: 1, logN: 20 } },
    { label: "吞吐 35%", values: { eta: .35, logN: 20 } },
    { label: "小向量也为 35%", values: { eta: .35, logN: 10 } },
  ],
  check: {
    question: "吞吐只剩 35%，为什么小向量仍可能从融合中受益？",
    answer: "小向量的访存和计算时间很短，减少两次 5 μs 启动能超过吞吐下降的代价。较大向量中额外执行时间随 N 增长，可能超过启动节省。",
  },
  evaluate({ eta, logN }) {
    const n = 2 ** logN, r = fanout(n, eta);
    const xs = Array.from({ length: 81 }, (_, i) => (20 + i) / 100);
    const ymax = Math.max(...xs.map(x => fanout(n, x).fused), r.separate) * 1.08;
    const threshold = 12 * n / BYTES_PER_US / (r.separate - LAUNCH_US);
    return {
      type: "lines", xLabel: "融合后的相对吞吐 η", yLabel: "估算耗时（微秒）", domainX: [.2, 1], domainY: [0, ymax],
      series: [
        { label: "融合一次", points: xs.map(x => [x, fanout(n, x).fused]) },
        { label: "三个独立 kernel", points: xs.map(x => [x, r.separate]) },
      ],
      point: { x: eta, y: r.fused, label: "当前融合耗时" },
      readout: `N=${n.toLocaleString("en-US")}，η=${percent(eta)}：独立 ${f(r.separate, 3)} μs，融合 ${f(r.fused, 3)} μs；独立/融合 ${f(r.separate / r.fused, 3)}×。`,
      explanation: `此假设模型下的持平阈值 η≈${percent(threshold)}；低于阈值融合变慢。资源使用与缓存可能改变有效吞吐，η 本身必须用目标设备测量。`,
    };
  },
};

export {
  diagnostic as "5.5",
  pairedLab as "5.5-diagnosis",
  fusion as "5.6",
  fusionPenalty as "5.6-fusion-budget",
};
