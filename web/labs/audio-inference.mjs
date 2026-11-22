// Small, deterministic models used by 3.4 and 7.5. They are teaching examples,
// not measured performance curves for a particular codec or language model.
const pct = x => `${(100 * x).toFixed(1)}%`;
const sci = x => x.toExponential(3);

// Greedy scalar RVQ; each odd-sized codebook contains zero. The codebook at
// each stage spans the largest residual of the preceding uniform quantizer.
function rvqCurve(k, shape) {
  const xs = Array.from({ length: 201 }, (_, i) => {
    const x = (i - 100) / 100;
    return shape === "peaked" ? Math.sign(x) * x * x : x;
  });
  const rec = xs.map(() => 0), mse = [];
  for (let layer = 1; layer <= 6; layer++) {
    const radius = (1 / (k - 1)) ** (layer - 1);
    const codes = Array.from({ length: k }, (_, j) => -radius + 2 * radius * j / (k - 1));
    for (let i = 0; i < xs.length; i++) {
      const residual = xs[i] - rec[i];
      let best = codes[0];
      for (const c of codes.slice(1)) if (Math.abs(residual - c) < Math.abs(residual - best)) best = c;
      rec[i] += best;
    }
    mse.push(xs.reduce((sum, x, i) => sum + (x - rec[i]) ** 2, 0) / xs.length);
  }
  return mse;
}

const rvqLab = {
  title: "RVQ：多一层残差，值回多少码率？",
  question: "用 201 个确定的标量样本模拟潜变量，每层在真实残差上选最近码字；这些玩具码本都含零。曲线是逐层重建的均方误差，读数同时给出每秒码字索引与定长编码的比特数。换样本分布、码本大小和层数，比较误差与码率。",
  controls: [
    { key: "layers", label: "启用的码本层数", min: 1, max: 6, step: 1, initial: 3 },
    { key: "k", label: "每层码本大小 K", initial: 3, options: [{ value: 3, label: "3 个码字" }, { value: 5, label: "5 个码字" }, { value: 9, label: "9 个码字" }] },
    { key: "fps", label: "帧率（帧/秒）", initial: 50, options: [{ value: 25, label: "25" }, { value: 50, label: "50" }, { value: 75, label: "75" }] },
    { key: "shape", label: "标量样本分布", initial: "uniform", options: [{ value: "uniform", label: "均匀网格" }, { value: "peaked", label: "更集中于零" }] },
  ],
  presets: [
    { label: "正文：3 层", values: { layers: 3, k: 3, fps: 50, shape: "uniform" } },
    { label: "多两层", values: { layers: 5, k: 3, fps: 50, shape: "uniform" } },
    { label: "更大码本", values: { layers: 3, k: 9, fps: 50, shape: "uniform" } },
    { label: "零附近更密", values: { layers: 3, k: 3, fps: 50, shape: "peaked" } },
  ],
  check: {
    question: "为什么本实验再加一层不会增大均方误差？可以据此断言真实语音主观质量一定提高吗？",
    answer: "每层都把 0 作为可选码字，逐样本选择最接近残差的码字，误差至少不会比加 0 差。真实向量码本不一定含 0，也可能独立训练；即使 MSE 降低，感知质量、语音可懂度和声码器效果也不由标量 MSE 保证。",
  },
  evaluate({ layers, k, fps, shape }) {
    const errors = rvqCurve(k, shape), bits = Math.ceil(Math.log2(k)), tokens = fps * layers, rate = tokens * bits;
    return {
      type: "lines", scaleY: "log", xLabel: "残差码本层数", yLabel: "均方误差（对数轴）", domainX: [1, 6], domainY: [1e-12, 1],
      series: [{ label: "玩具标量 RVQ", points: errors.map((v, i) => [i + 1, v]) }],
      point: { x: layers, y: errors[layers - 1], label: `${layers} 层` },
      readout: `${layers} 层：MSE ${sci(errors[layers - 1])}；${tokens} 个索引/秒 × ${bits} bit = ${rate} bit/s（定长编码）`,
      explanation: `每层 ${fps} 个索引，K = ${k} 需要向上取整为 ${bits} bit/索引。这里码本逐层量化残差且含 0，所以误差不会增大；码率线性增加。标量网格不是实际语音的失真或主观质量。`,
    };
  },
};

const latencyLab = {
  title: "语音首包：重叠流水线的关键路径",
  question: "从用户说完最后一个音频样本计时。端点确认和剩余输入处理同时进行；两者都完成后，再依次计算回复、合成首个可播放块和经网络缓冲送达。曲线对比输入处理与端点确认并行或顺序等待，其他耗时固定。",
  controls: [
    { key: "endpoint", label: "端点确认完成时刻 E（ms）", min: 0, max: 400, step: 10, initial: 180 },
    { key: "tail", label: "输入剩余处理完成时刻 R（ms）", min: 0, max: 400, step: 10, initial: 120 },
    { key: "think", label: "回复首个可合成单元 G（ms）", min: 0, max: 400, step: 10, initial: 100 },
    { key: "synth", label: "首块合成 S（ms）", min: 0, max: 300, step: 10, initial: 80 },
    { key: "output", label: "下行与播放缓冲 N（ms）", min: 0, max: 200, step: 10, initial: 60 },
  ],
  presets: [
    { label: "正文：420 ms", values: { endpoint: 180, tail: 120, think: 100, synth: 80, output: 60 } },
    { label: "长端点等待", values: { endpoint: 350, tail: 120, think: 100, synth: 80, output: 60 } },
    { label: "输入处理成瓶颈", values: { endpoint: 80, tail: 280, think: 100, synth: 80, output: 60 } },
    { label: "慢首块合成", values: { endpoint: 180, tail: 120, think: 100, synth: 250, output: 60 } },
  ],
  check: {
    question: "E = 180 ms、R = 120 ms 时，把 R 再缩短 50 ms，首包快多少？",
    answer: "在这个依赖图里首包不变：关键路径先等 max(E, R) = 180 ms，缩短非关键分支没有效果。先减少端点等待或后续生成、合成和下行时间；实际端点策略还要测误切和可打断性。",
  },
  evaluate({ endpoint, tail, think, synth, output }) {
    const after = think + synth + output;
    const overlapped = Math.max(endpoint, tail) + after, serial = endpoint + tail + after;
    const points = Array.from({ length: 41 }, (_, i) => i * 10);
    return {
      type: "lines", xLabel: "端点确认完成时刻 E（ms）", yLabel: "说完到播放首块（ms）", domainX: [0, 400], domainY: [0, Math.max(100, Math.ceil((400 + tail + after) / 100) * 100)],
      series: [
        { label: "端点与输入处理重叠", points: points.map(e => [e, Math.max(e, tail) + after]) },
        { label: "假设输入处理在端点之后才开始", points: points.map(e => [e, e + tail + after]) },
      ],
      point: { x: endpoint, y: overlapped, label: `E = ${endpoint} ms` },
      readout: `重叠：max(${endpoint}, ${tail}) + ${think} + ${synth} + ${output} = ${overlapped} ms；顺序基线 ${serial} ms`,
      explanation: `这个依赖图只计算说完以后触发的回复；端点与输入处理重叠节约 ${serial - overlapped} ms。E、R 是以同一个用户端时刻为零的完成时刻；真实系统需实测网络、排队、误切和播放缓冲。`,
    };
  },
};

function binomialMajority(n, p) {
  let choose = 1, result = 0;
  for (let k = 0; k <= n; k++) {
    const mass = choose * p ** k * (1 - p) ** (n - k);
    if (2 * k > n) result += mass;
    else if (2 * k === n) result += 0.5 * mass;
    choose *= (n - k) / (k + 1);
  }
  return result;
}
function verified(n, p, t, f) {
  const accept = p * t + (1 - p) * f;
  if (accept < 1e-12) return p;
  if (1 - accept < 1e-12) return p * t / accept;
  const none = (1 - accept) ** n;
  return (1 - none) * p * t / accept + none * p * (1 - t) / (1 - accept);
}
const bestOfLab = {
  title: "Best-of-N：有了候选，谁来挑？",
  question: "同一题的 N 个候选独立生成、每个正确率 p 相同。比较可识别正确答案的理想上界、二元答案多数投票（平票随机），以及二值验证器选解：有通过者均匀抽一个，否则从全部候选随机选一个。",
  controls: [
    { key: "n", label: "采样数 N", min: 1, max: 31, step: 1, initial: 5 },
    { key: "p", label: "单次正确率 p", min: 0.2, max: 0.9, step: 0.01, initial: 0.6, format: v => v.toFixed(2) },
    { key: "t", label: "验证器真阳性率 TPR", min: 0.2, max: 1, step: 0.01, initial: 0.8, format: v => v.toFixed(2) },
    { key: "f", label: "验证器假阳性率 FPR", min: 0, max: 1, step: 0.01, initial: 0.2, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "正文：N = 5", values: { n: 5, p: 0.6, t: 0.8, f: 0.2 } },
    { label: "验证器分不清", values: { n: 25, p: 0.6, t: 0.6, f: 0.6 } },
    { label: "多数票不可靠", values: { n: 25, p: 0.4, t: 0.8, f: 0.2 } },
    { label: "无假阳性", values: { n: 25, p: 0.6, t: 0.8, f: 0 } },
  ],
  check: {
    question: "TPR = 0.8、FPR = 0.2、p = 0.6 时，N 越大为什么不能让本验证器的正确率趋于 100%？",
    answer: "通过者仍包括误判通过的错误答案。N 很大时通过者几乎肯定存在，而我们均匀选择通过者；其中正确者比例趋于 0.6×0.8/(0.6×0.8 + 0.4×0.2) = 85.7%。这是本实验的二值选择规则的极限，不是所有排序验证器的普遍上限。",
  },
  evaluate({ n, p, t, f }) {
    const ns = Array.from({ length: 31 }, (_, i) => i + 1);
    const oracle = x => 1 - (1 - p) ** x;
    const maj = x => binomialMajority(x, p), val = x => verified(x, p, t, f);
    const accepted = p * t + (1 - p) * f;
    const limit = accepted > 0 ? p * t / accepted : p;
    return {
      type: "lines", xLabel: "候选数 N", yLabel: "最终正确率（%）", domainX: [1, 31], domainY: [0, 100],
      series: [
        { label: "理想选解上界", points: ns.map(x => [x, 100 * oracle(x)]) },
        { label: "二元多数票", points: ns.map(x => [x, 100 * maj(x)]) },
        { label: "二值验证器", points: ns.map(x => [x, 100 * val(x)]) },
      ],
      point: { x: n, y: 100 * val(n), label: `验证器 N = ${n}` },
      readout: `N = ${n}：理想 ${pct(oracle(n))}；多数票 ${pct(maj(n))}；验证器 ${pct(val(n))}；本规则 N→∞ 极限 ${pct(limit)}`,
      explanation: `理想上界只要求至少一个候选正确，实际还要选得出来。多数票是二元且平票随机的模型；验证器先随机选通过者。结果依赖独立性，真实的共享系统性错误会让实际收益变小。`,
    };
  },
};

function thoughtCurve(u0, decay, corrupt, cost) {
  let p = 0.6;
  const rows = [];
  for (let i = 0; i <= 20; i++) {
    rows.push({ step: i, p, utility: p - cost * i });
    p = p * (1 - corrupt) + (1 - p) * u0 * Math.exp(-decay * i);
  }
  return rows;
}
const thinkingLab = {
  title: "顺序思考：什么时候停止更值？",
  question: "固定起点正确率 60%，每轮有机会修正错误，也可能把正确答案改错；修正率随轮数衰减，改错率固定。曲线画出群体正确率和减去每轮成本后的效用，从 0 到 20 轮选择固定停止点。",
  controls: [
    { key: "rounds", label: "思考轮数", min: 0, max: 20, step: 1, initial: 3 },
    { key: "u0", label: "第一轮修错率 u₀", min: 0, max: 0.5, step: 0.01, initial: 0.3, format: v => v.toFixed(2) },
    { key: "decay", label: "修错率衰减 d", min: 0, max: 0.6, step: 0.01, initial: 0.35, format: v => v.toFixed(2) },
    { key: "corrupt", label: "每轮改错率 v", min: 0, max: 0.2, step: 0.01, initial: 0.04, format: v => v.toFixed(2) },
    { key: "cost", label: "每轮成本 λ（正确率单位）", min: 0, max: 0.02, step: 0.001, initial: 0.005, format: v => v.toFixed(3) },
  ],
  presets: [
    { label: "正文：第 3 轮", values: { rounds: 3, u0: 0.3, decay: 0.35, corrupt: 0.04, cost: 0.005 } },
    { label: "过度思考：第 12 轮", values: { rounds: 12, u0: 0.3, decay: 0.35, corrupt: 0.04, cost: 0.005 } },
    { label: "无改错风险", values: { rounds: 12, u0: 0.3, decay: 0.35, corrupt: 0, cost: 0.005 } },
    { label: "高成本", values: { rounds: 5, u0: 0.3, decay: 0.35, corrupt: 0.04, cost: 0.02 } },
  ],
  check: {
    question: "为什么第 12 轮可能比第 3 轮差？这里的最佳轮数是否代表能预知每条题何时答对？",
    answer: "后期修错率下降，而每轮仍可能把正确答案改错，群体正确率因而可能下降。最佳轮数只是在这个已知分布上，0–20 轮中使平均正确率减成本最大的固定轮数；实际应在验证集估计，再到独立测试集评估，不能读取每题真值。",
  },
  evaluate({ rounds, u0, decay, corrupt, cost }) {
    const rows = thoughtCurve(u0, decay, corrupt, cost), cur = rows[rounds];
    const best = rows.reduce((a, b) => b.utility > a.utility ? b : a);
    const bottom = Math.min(0, Math.floor(Math.min(...rows.map(r => r.utility)) * 10) * 10);
    return {
      type: "lines", xLabel: "顺序思考轮数", yLabel: "正确率 / 成本调整效用（百分点）", domainX: [0, 20], domainY: [bottom, 100],
      series: [
        { label: "群体正确率", points: rows.map(r => [r.step, 100 * r.p]) },
        { label: "效用 = 正确率 − 每轮成本", points: rows.map(r => [r.step, 100 * r.utility]) },
      ],
      point: { x: rounds, y: 100 * cur.p, label: `${rounds} 轮` },
      readout: `${rounds} 轮：正确率 ${pct(cur.p)}，效用 ${(100 * cur.utility).toFixed(1)}；0–20 轮固定停止策略中效用最高为 ${best.step} 轮（${(100 * best.utility).toFixed(1)}）`,
      explanation: `每轮修正概率递减，改错概率为 ${pct(corrupt)}；成本按每轮 ${(100 * cost).toFixed(1)} 个百分点计。该最优轮数来自群体平均，不需要也不能假设预知单题答案。`,
    };
  },
};

export {
  rvqLab as "3.4",
  latencyLab as "3.4-latency",
  bestOfLab as "7.5",
  thinkingLab as "7.5-stopping",
};
