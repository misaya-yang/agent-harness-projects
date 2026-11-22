// 6.4–6.5: analytic teaching models, not fitted predictions of a language model.
const pct = x => `${(100 * x).toFixed(1)}%`;
const grid = (n, fn) => Array.from({ length: n + 1 }, (_, i) => [i, fn(i)]);

// E[x²] under x <- x - η(x + ξ), with E[ξ]=0 and Var[ξ]=σ².
function noiseSchedule(peak, decay, noise) {
  const T = 120, warmup = 10;
  const eta = (mode, t) => {
    if (t <= warmup) return peak * t / warmup;
    if (mode === "cosine") return peak * (1 + Math.cos(Math.PI * (t - warmup) / (T - warmup))) / 2;
    return t <= T - decay ? peak : peak * (T - t) / decay;
  };
  const simulate = mode => {
    let secondMoment = 1;
    const lr = [[0, 0]], loss = [[0, .5]];
    for (let t = 1; t <= T; t++) {
      const e = eta(mode, t);
      secondMoment = (1 - e) ** 2 * secondMoment + e ** 2 * noise ** 2;
      lr.push([t, e]);
      loss.push([t, secondMoment / 2]);
    }
    return { lr, loss };
  };
  return { cosine: simulate("cosine"), wsd: simulate("wsd") };
}

const schedule = {
  title: "同一预算：余弦衰减和 WSD 在何时降温？",
  question: "在含随机梯度噪声的一维二次问题里，两条曲线共用 warmup、峰值学习率和 120 步预算；拖动噪声和退火长度，比较学习率与期望 loss。",
  controls: [
    { key: "peak", label: "峰值学习率 η", min: .1, max: .8, step: .05, initial: .3, format: v => v.toFixed(2) },
    { key: "decay", label: "WSD 线性退火长度", min: 10, max: 50, step: 5, initial: 20, format: v => `${v} 步` },
    { key: "noise", label: "梯度噪声标准差 σ", min: 0, max: 1, step: .05, initial: .6, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "有噪声 · 短退火", values: { peak: .3, decay: 20, noise: .6 } },
    { label: "无噪声", values: { peak: .3, decay: 20, noise: 0 } },
    { label: "高噪声 · 长退火", values: { peak: .5, decay: 50, noise: 1 } },
  ],
  evaluate({ peak, decay, noise }) {
    const { cosine, wsd } = noiseSchedule(peak, decay, noise);
    const wEnd = wsd.loss.at(-1)[1], cEnd = cosine.loss.at(-1)[1];
    const lossMax = Math.max(.05, ...wsd.loss.slice(10).map(([, value]) => value), ...cosine.loss.slice(10).map(([, value]) => value)) * 1.05;
    return {
      type: "panels",
      panels: [
        { title: "学习率（灰：余弦 / 蓝：WSD）", domainX: [0, 120], domainY: [0, .85], xLabel: "优化步", yLabel: "η", series: [{ label: "余弦", points: cosine.lr }, { label: "WSD", points: wsd.lr }] },
        { title: "warmup 后期望 loss（灰：余弦 / 青：WSD）", domainX: [10, 120], domainY: [0, lossMax], xLabel: "优化步", yLabel: "E[x²]/2", series: [{ label: "余弦", points: cosine.loss }, { label: "WSD", points: wsd.loss }] },
      ],
      readout: `第 120 步：余弦期望 loss ${cEnd.toFixed(4)}，WSD ${wEnd.toFixed(4)}；WSD 从第 ${120-decay} 步之后开始退火。`,
      explanation: "这是可解析的噪声二次模型，展示退火可压低噪声底；曲线不是语言模型实测。σ=0 时没有噪声底，退火未必使 loss 骤降；真实比较还要固定数据、batch、优化器和训练预算。WSD 从平台 checkpoint 分叉退火仍需额外步数，不能把平台点当作已退火终点。",
    };
  },
  check: {
    question: "平台 checkpoint 可以不花额外算力就变成已经退火的终点吗？",
    answer: "不能。必须保存模型和优化器等状态，再从选定的平台点继续跑退火；不同分叉各自消耗算力。退火常改善评估 loss，但幅度依任务、数据与优化动态而定。",
  },
};

const transfer = {
  title: "宽度迁移：为什么同一个数字未必是同一个步长？",
  question: "玩具网络把 n 个标量求平均，目标输出为 1。小网络 n=16 上选 η=8，放宽之后比较原封不动的 η 与按 n/16 缩放的 η。",
  controls: [
    { key: "width", label: "宽度 n", min: 16, max: 256, step: 16, initial: 128, format: v => `${v}` },
    { key: "steps", label: "训练步数", min: 1, max: 20, step: 1, initial: 4, format: v => `${v} 步` },
  ],
  presets: [
    { label: "原宽度 16", values: { width: 16, steps: 4 } },
    { label: "扩大 8 倍", values: { width: 128, steps: 4 } },
    { label: "扩大 16 倍", values: { width: 256, steps: 4 } },
  ],
  evaluate({ width, steps }) {
    const naive = t => 1 - (1 - 8 / width) ** t;
    const scaled = t => 1 - (1 - 8 / 16) ** t;
    return {
      type: "lines", domainX: [0, 20], domainY: [0, 1.02],
      series: [{ label: "η 随宽度缩放", points: grid(20, scaled) }, { label: "η 固定为 8", points: grid(20, naive) }],
      point: { x: steps, y: scaled(steps), label: `缩放后 f=${scaled(steps).toFixed(3)}` },
      xLabel: "梯度步数", yLabel: "模型输出 f",
      readout: `n=${width}，第 ${steps} 步：η 缩放后 f=${scaled(steps).toFixed(3)}，固定 η 时 f=${naive(steps).toFixed(3)}。`,
      explanation: `在这个平均模型中，输出有效步长是 η/n：固定 η=8 时为 ${(8/width).toFixed(3)}；令 η=8n/16 后恒为 0.5。它只说明参数化决定迁移规律，不是 Transformer 或 AdamW 的 μP 配方。真正的 μP 还需按参数类型和优化器配置初始化、乘子与学习率，并实验核验。`,
    };
  },
  check: {
    question: "这个例子能否证明所有 Transformer 的学习率都应乘宽度？",
    answer: "不能。例子使用特定的输出平均和 SGD；换输出归一化、层类型或 AdamW 后梯度与步长的尺度都不同。μP 必须匹配其参数化和优化器规则，并在多个宽度上检查特征更新和最优超参是否稳定。",
  },
};

const LAYERS = 32, WIDTH = 4096, PARAMS = 8e9, SHORT = 4096;
const tokenCost = length => 6 * PARAMS + 6 * LAYERS * WIDTH * length;
const budget = {
  title: "长度课程：10% 的长 token 需要多少算力？",
  question: "固定 100B token，用 4K 和选定的长窗口混合；改变长 token 比例，比较 token 占比和注意力计入后的 FLOPs 占比。",
  controls: [
    { key: "share", label: "长窗口 token 占比", min: 0, max: 50, step: 1, initial: 10, format: v => `${v}%` },
    { key: "length", label: "长窗口长度", options: [{ value: "32768", label: "32K" }, { value: "65536", label: "64K" }, { value: "131072", label: "128K" }], initial: "131072" },
  ],
  presets: [
    { label: "10% · 128K", values: { share: 10, length: "131072" } },
    { label: "10% · 32K", values: { share: 10, length: "32768" } },
    { label: "25% · 128K", values: { share: 25, length: "131072" } },
  ],
  evaluate({ share, length }) {
    const p = share / 100, s = tokenCost(SHORT), l = tokenCost(Number(length));
    const frac = q => q * l / ((1 - q) * s + q * l);
    const ratio = ((1 - p) * s + p * l) / s;
    return {
      type: "lines", domainX: [0, 50], domainY: [0, 100],
      series: [{ label: "长窗口 FLOPs 占比", points: grid(50, x => 100 * frac(x / 100)) }, { label: "长窗口 token 占比", points: grid(50, x => x) }],
      point: { x: share, y: 100 * frac(p), label: `长窗口算力 ${pct(frac(p))}` },
      xLabel: "长窗口 token 比例（%）", yLabel: "占总量（%）",
      readout: `长 token ${share}%、窗口 ${Number(length)/1024}K：约消耗总 FLOPs 的 ${pct(frac(p))}；总算力是全 4K 的 ${ratio.toFixed(3)} 倍。`,
      explanation: "按每 token 6N + 6·层数·隐藏宽度·长度估算，8B 参数、32 层、宽 4096，长短样本都填满窗口。只比较理想稠密因果注意力的算术量；实际内核、padding、重计算、吞吐和通信会改变成本。token 占比也不保证存在跨远距的有用关系。",
    };
  },
  check: {
    question: "长样本只占 10% 的 token，能否据此说它只花 10% 的训练时间？",
    answer: "不能。长序列注意力在每 token 上的计算随长度增长，即使只算 FLOPs，长样本份额也可能远高于 10%；实际耗时还要测内核效率、通信、显存和重计算。",
  },
};

const packing = {
  title: "拼接与天然长文：窗口内有多少可用的远距关系？",
  question: "两个长度为 m 的无关文档打包成 2m 窗口。比较不隔离时的跨文档配对、隔离后合法的文内远距配对，以及同长度天然长文的远距候选配对。",
  controls: [
    { key: "size", label: "每个短文档长度 m", min: 16, max: 512, step: 16, initial: 64, format: v => `${v} token` },
    { key: "distance", label: "远距阈值（m 的倍数）", min: .25, max: 1, step: .05, initial: 1, format: v => `${v.toFixed(2)}m` },
  ],
  presets: [
    { label: "远距 ≥ 1 个文档", values: { size: 64, distance: 1 } },
    { label: "远距 ≥ 半个文档", values: { size: 64, distance: .5 } },
    { label: "更长的短文档", values: { size: 256, distance: 1 } },
  ],
  evaluate({ size, distance }) {
    const m = size, k = Math.max(1, Math.round(distance * m));
    const total = m * (2 * m + 1), cross = m * m;
    const withinPacked = (m - k) * (m - k + 1);
    const withinLong = (2 * m - k) * (2 * m - k + 1) / 2;
    return {
      type: "bars", unit: "占 2m 窗口全部因果位置配对的百分比", maxValue: 100,
      rows: [
        { label: "不隔离：跨文档配对", value: 100 * cross / total, display: pct(cross / total) },
        { label: `隔离拼接：文内距离 ≥ ${k}`, value: 100 * withinPacked / total, display: pct(withinPacked / total) },
        { label: `天然长文：文内距离 ≥ ${k}`, value: 100 * withinLong / total, display: pct(withinLong / total) },
      ],
      readout: `m=${m}、远距 ≥ ${k}：不隔离的跨文档位置占 ${pct(cross/total)}；隔离拼接的文内远距位置占 ${pct(withinPacked/total)}，天然长文占 ${pct(withinLong/total)}。`,
      explanation: "共同分母是长度 2m 的下三角位置对数；第一行是泄漏风险，其余两行是合法远距候选，不能把它们加起来。边界标记不自动阻止注意力；需显式隔离掩码或等价的变长序列实现。天然长文中有远距位置也不代表它们含有有用依赖，更不保证模型会利用。",
    };
  },
  check: {
    question: "两个 64-token 无关文档拼成 128 token，隔离后还有距离至少 64 的文内配对吗？",
    answer: "没有：每个文档内最远两个位置相距 63。天然 128-token 文档有 2080 个这样的候选位置对，但还要检查这些位置之间有没有真正的语义或推理依赖。",
  },
};

export {
  schedule as "6.4",
  transfer as "6.4-transfer",
  budget as "6.5",
  packing as "6.5-packing",
};
