import { distillationGradient, preferenceVotes } from "./preference-studies.mjs";

const formatInteger = new Intl.NumberFormat("en-US");
const indices = count => Array.from({ length: count }, (_, i) => i);

const residualStream = {
  title: "残差流里的增量会被稀释多少？",
  question: "把层数从 12 拉到 48。标准 Pre-LN 的残差 RMS 和最后一层写入的相对幅度，各往哪个方向走？",
  check: {
    question: "把每层写入的 RMS 从 0.6 减到 0.3，标准 Pre-LN 在同一深度的残差 RMS 也会减半吗？",
    answer: "以本实验为例，新增的方差变为原来的 1/4，起始方差仍为 1。残差 RMS 是两者之和开平方，所以降幅小于一半。",
  },
  controls: [
    { key: "depth", label: "模块深度", min: 12, max: 96, step: 4, initial: 48, unit: "层" },
    { key: "gain", label: "归一化后支路的写入 RMS", min: 0.1, max: 0.6, step: 0.05, initial: 0.35 },
  ],
  evaluate({ depth, gain }) {
    const post = [[0, 1]];
    const pre = [[0, 1]];
    const scaled = [[0, 1]];
    let scaledVariance = 1;
    for (let layer = 1; layer <= depth; layer++) {
      scaledVariance += gain ** 2 / layer;
      post.push([layer, 1]);
      pre.push([layer, Math.sqrt(1 + layer * gain ** 2)]);
      scaled.push([layer, Math.sqrt(scaledVariance)]);
    }
    const relativeWrite = 100 * gain / pre[depth - 1][1];
    const scaledWrite = 100 * gain / (Math.sqrt(depth) * scaled[depth - 1][1]);

    return {
      type: "lines",
      series: [
        { label: "标准 Pre-LN", points: pre },
        { label: "Pre-LN + 层缩放", points: scaled },
        { label: "Post-LN", points: post },
      ],
      xLabel: "已经过的层数",
      yLabel: "残差流 RMS",
      domainY: [0, Math.ceil(pre[depth][1])],
      readout: `第 ${depth} 层后，Pre-LN 的残差 RMS 为 ${pre[depth][1].toFixed(2)}，支路缩放后为 ${scaled[depth][1].toFixed(2)}。最后一层的写入 RMS 分别相当于写入前残差的 ${relativeWrite.toFixed(1)}% 和 ${scaledWrite.toFixed(1)}%。`,
      explanation: "这个方差模型假设初始 RMS 为 1，支路写入零均值、互不相关。每层将写入方差加到残差上。支路乘 1/√层号后，方差增量再除以层号。Post-LN 将合并后的状态归一到单位 RMS。",
    };
  },
};

const ropeSpectrum = {
  title: "RoPE 延长上下文时，哪些钟要减速？",
  question: "保持目标长度为 8 倍，对比原频率、位置插值和 YaRN。哪种方案保留了最快一对的每 token 转角？",
  check: {
    question: "保持基数 10,000，把旋转维度从 128 减到 64。低频对的数量和比例会同时减半吗？",
    answer: "在 4K 训练窗口下，转不满一圈的频率对从 18 对变为 9 对，但总数从 64 对缩到 32 对，比例仍约为 28%。",
  },
  controls: [
    { key: "base", label: "RoPE 基数", options: [{ value: "10000", label: "10,000" }, { value: "500000", label: "500,000" }], initial: "10000" },
    { key: "dimensions", label: "旋转维度", options: [{ value: "64", label: "64 维" }, { value: "128", label: "128 维" }], initial: "128" },
    { key: "stretch", label: "目标长度 / 训练长度", min: 1, max: 16, step: 1, initial: 8, unit: "倍" },
    { key: "method", label: "频率缩放", options: [{ value: "original", label: "原频率" }, { value: "pi", label: "位置插值" }, { value: "ntk", label: "NTK-aware" }, { value: "yarn", label: "YaRN" }], initial: "yarn" },
  ],
  evaluate({ base, dimensions, stretch, method }) {
    const trainLength = 4096;
    const pairCount = Number(dimensions) / 2;
    const training = [];
    const target = [];
    let slowCount = 0;
    let untrained = 0;
    let fastestAngle = 0;

    const pairIndex = turns => pairCount * Math.log(trainLength / (2 * Math.PI * turns)) / Math.log(Number(base));
    const fast = Math.floor(pairIndex(32)), slow = Math.ceil(pairIndex(1));
    for (let i = 0; i < pairCount; i++) {
      const angle = Number(base) ** (-i / pairCount);
      const trainTurns = trainLength * angle / (2 * Math.PI);
      const yarnRamp = Math.max(0, Math.min(1, (slow - i) / (slow - fast)));
      const frequencyRatio = {
        original: 1,
        pi: 1 / stretch,
        ntk: stretch ** (-i / (pairCount - 1)),
        yarn: yarnRamp + (1 - yarnRamp) / stretch,
      }[method];
      const targetTurns = trainTurns * stretch * frequencyRatio;
      training.push([i, Math.log10(trainTurns)]);
      target.push([i, Math.log10(targetTurns)]);
      if (i === 0) fastestAngle = angle * frequencyRatio;
      if (trainTurns < 1) {
        slowCount++;
        if (targetTurns > trainTurns * (1 + 1e-9)) untrained++;
      }
    }

    return {
      type: "lines",
      series: [
        { label: "训练窗口 4,096 token", points: training },
        { label: `目标窗口 ${formatInteger.format(trainLength * stretch)} token`, points: target },
        { label: "转满一圈", points: [[0, 0], [pairCount - 1, 0]] },
      ],
      xLabel: "频率对序号（由快到慢）",
      yLabel: "旋转圈数的 log₁₀",
      domainY: [-3, 4.2],
      readout: `训练内转不满一圈的有 ${slowCount} / ${pairCount} 对，其中 ${untrained} 对在目标窗口会进入训练未覆盖的相位。推理时最快一对每 token 旋转 ${fastestAngle.toFixed(3)} 弧度。`,
      explanation: "横线对应一圈。对还没转满一圈的频率，目标曲线高于训练曲线意味着途中会经过训练未覆盖的相位。图按本课公式计算转角，YaRN 的注意力温度另在正文推导。",
    };
  },
};

const cacheBudget = {
  title: "同一个 KV 预算，能容纳多少条序列？",
  question: "先在 128K、BF16 下比较 GQA 和 MLA，再把批量翻倍。每种架构的缓存量和它们的比值分别怎么变？",
  check: {
    question: "把上下文从 128K 提到 256K，同时将 BF16 KV 换成 FP8，500 GB 能容纳的序列数怎么变？",
    answer: "在这个只计缓存元素的模型中，条目数翻倍而每元素字节数减半。单条用量相同，所以 GQA 仍为 11 条，MLA 仍为 41 条。",
  },
  controls: [
    { key: "length", label: "每条序列的上下文", options: [4096, 16384, 32768, 65536, 131072, 262144].map(value => ({ value: String(value), label: `${value / 1024}K token` })), initial: "131072" },
    { key: "batch", label: "并发序列数", min: 1, max: 64, step: 1, initial: 11, unit: "条" },
    { key: "bytes", label: "每个 KV 元素的存储精度", options: [{ value: "2", label: "BF16（2 字节）" }, { value: "1", label: "FP8（1 字节）" }], initial: "2" },
  ],
  evaluate({ length, batch, bytes }) {
    const perElement = (80 * Number(length) * Number(bytes)) / 1e9;
    const gqa = perElement * 2 * 8 * 128;
    const mqa = perElement * 2 * 128;
    const mla = perElement * (512 + 64);

    return {
      type: "bars",
      rows: [
        { label: "GQA（8 个 KV 头）", value: gqa * batch, display: `${(gqa * batch).toFixed(2)} GB` },
        { label: "V3 式 MLA", value: mla * batch, display: `${(mla * batch).toFixed(2)} GB` },
        { label: "MQA（1 个 KV 头）", value: mqa * batch, display: `${(mqa * batch).toFixed(2)} GB` },
      ],
      unit: "GB",
      maxValue: Math.max(600, Math.ceil(gqa * batch / 500) * 500),
      reference: { value: 500, label: "缓存预算" },
      readout: `并发 ${batch} 条时，GQA 的 KV 用量是 MLA 的 ${(gqa / mla).toFixed(2)} 倍。若 500 GB 全给 KV，分别可容纳 ${Math.floor(500 / gqa)} 条和 ${Math.floor(500 / mla)} 条同长度序列。`,
      explanation: "统一取 80 层和 128 维的常规 KV 头。每层每 token 的 MLA 缓存含 512 维内容与 64 维共享位置。GB 按 10⁹ 字节计，只算缓存数据本身。每个请求的缓存单独存取，批量翻倍会翻倍用量。",
    };
  },
};

function routeTokens(affinities, bias, topK) {
  const experts = indices(bias.length);
  const loads = experts.map(() => 0);
  for (const scores of affinities) {
    experts.sort((a, b) => (scores[b] + bias[b]) - (scores[a] + bias[a]) || a - b);
    for (let i = 0; i < topK; i++) loads[experts[i]]++;
  }
  return loads;
}

const expertRouting = {
  title: "只改排名偏置，能让最忙的专家闲一点吗？",
  question: "把均衡更新步数设为 0，再调到 20。哪些专家的负载变化最大？所有柱子的总和变了吗？",
  check: {
    question: "若把 Top-k 从 2 提到 4，均衡后专家处理的 token 总次数会减少吗？",
    answer: "同样 192 个 token，会从 384 次增到 768 次。偏置只调整这些工作分给谁。这里统计路由专家的计算次数。",
  },
  controls: [
    { key: "topK", label: "每个 token 选几个专家", min: 1, max: 4, step: 1, initial: 2 },
    { key: "bonus", label: "前两个专家的初始 logit 优势", min: 0, max: 2.5, step: 0.25, initial: 1.5 },
    { key: "steps", label: "均衡更新步数", min: 0, max: 40, step: 2, initial: 20, unit: "步" },
  ],
  evaluate({ topK, bonus, steps }) {
    const tokenCount = 192;
    const expertCount = 8;
    const average = tokenCount * topK / expertCount;
    let seed = 137;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const affinities = indices(tokenCount).map(() => indices(expertCount).map(expert => {
      const logit = 2 * (random() + random() - 1) + (expert < 2 ? bonus : 0);
      return 1 / (1 + Math.exp(-logit));
    }));

    let bias = indices(expertCount).map(() => 0);
    let loads = routeTokens(affinities, bias, topK);
    const originalMax = Math.max(...loads) / average;
    for (let step = 0; step < steps; step++) {
      bias = bias.map((value, expert) => value + 0.018 * Math.sign(average - loads[expert]));
      loads = routeTokens(affinities, bias, topK);
    }

    return {
      type: "bars",
      rows: loads.map((value, i) => ({ label: `专家 ${i + 1}${i < 2 && bonus > 0 ? "（初始优先）" : ""}`, value, display: `${value} 次` })),
      unit: "次",
      maxValue: tokenCount,
      reference: { value: average, label: "平均负载" },
      readout: `最忙专家处理平均负载的 ${(Math.max(...loads) / average).toFixed(2)} 倍，均衡前为 ${originalMax.toFixed(2)} 倍。${tokenCount} 个 token 共分发 ${tokenCount * topK} 次，平均每个专家 ${average} 次。`,
      explanation: "同一批 token 的亲和分数始终固定。每轮用亲和分数加偏置选 Top-k，再给过载专家减偏置、给欠载专家加偏置。这里观察分发次数。被选中后用于求和的权重仍由原亲和分数计算。",
    };
  },
};

function scoreSums(scores, values, start, end, max) {
  let sum = 0;
  let numerator = 0;
  for (let i = start; i < end; i++) {
    const weight = Math.exp(scores[i] - max);
    sum += weight;
    numerator += weight * values[i];
  }
  return { sum, numerator };
}

const tiledSoftmax = {
  title: "新块出现更大分数，旧账该怎么换算？",
  question: "先升高第 7 个 token 的分数，再换块大小。哪条曲线的最终输出能始终和整行 softmax 对上？",
  check: {
    question: "把第 7 个分数的增量设为 0，块大小由 3 改成 2。省略重标定仍能得到正确结果吗？",
    answer: "块大小为 3 时，首块已经看到整行最大值 1。块大小为 2 时，这个最大值出现在第二块，第一块的累计必须换算一次。",
  },
  controls: [
    { key: "tile", label: "每块 token 数", options: [2, 3, 4, 6].map(value => ({ value: String(value), label: `${value} token` })), initial: "3" },
    { key: "boost", label: "第 7 个分数的增量", min: 0, max: 12, step: 0.5, initial: 6 },
  ],
  evaluate({ tile, boost }) {
    const scores = [-1.5, -0.8, 1, 0.6, -0.7, -0.2, 0.1 + boost, 0.9, 1, 1, 0.5, -0.8];
    const values = [1, 1, 0.9, 1.1, 0.8, 1, -1, 0.1, -0.3, -0.1, 0.1, -0.2];
    let previousMax = -Infinity;
    let sum = 0;
    let numerator = 0;
    let unscaledSum = 0;
    let unscaledNumerator = 0;
    let previousWeightAtSpike = 1;
    const online = [];
    const unscaled = [];

    for (let start = 0; start < scores.length; start += Number(tile)) {
      const end = Math.min(start + Number(tile), scores.length);
      const max = Math.max(previousMax, ...scores.slice(start, end));
      const previousWeight = Math.exp(previousMax - max);
      const current = scoreSums(scores, values, start, end, max);
      sum = previousWeight * sum + current.sum;
      numerator = previousWeight * numerator + current.numerator;
      unscaledSum += current.sum;
      unscaledNumerator += current.numerator;
      online.push([end, numerator / sum]);
      unscaled.push([end, unscaledNumerator / unscaledSum]);
      if (start <= 6 && end > 6) previousWeightAtSpike = previousWeight;
      previousMax = max;
    }
    const full = scoreSums(scores, values, 0, scores.length, Math.max(...scores));
    const error = Math.abs(online.at(-1)[1] - full.numerator / full.sum);

    return {
      type: "lines",
      series: [
        { label: "按新最大值重标定", points: online },
        { label: "省略旧累计的重标定", points: unscaled },
      ],
      xLabel: "已扫描 token 数（每个点对应一次整块更新）",
      yLabel: "当前已读前缀的加权输出",
      domainX: [0, scores.length],
      domainY: [-1.1, 1.1],
      markers: [{ x: 7, label: "改动的分数" }],
      readout: `包含第 7 个 token 的块将旧累计乘以 ${previousWeightAtSpike.toFixed(4)}。重标定后的最终输出 ${online.at(-1)[1].toFixed(3)}，与整行 softmax 的绝对误差${error < 1e-12 ? "低于 10⁻¹²" : "为 " + error.toExponential(1)}。省略重标定则得到 ${unscaled.at(-1)[1].toFixed(3)}。`,
      explanation: "示例是一条查询、12 个分数和标量 value。新块有更大分数时，旧分母与旧分子一起乘 exp(旧最大值 − 新最大值)。当最大值保持不变，两种累计方式重合。",
    };
  },
};

const linearMemory = {
  title: "第二次写入，为什么会改掉第一个键的读数？",
  question: "先把内积设为 0，再设为 1，始终查询先写的键。两种写法能在哪种条件下保住原值 1？",
  check: {
    question: "两键正交时，改查新键并重复写入。两种写法都能保住新值 −1 吗？",
    answer: "朴素方法会反复累加 −1。delta rule 每次只修正一半的预测误差，读数逐步趋近 −1，同时保住正交方向上的旧值。",
  },
  controls: [
    { key: "overlap", label: "两键的内积", min: 0, max: 1, step: 0.05, initial: 0.6 },
    { key: "writes", label: "新键写入次数", min: 2, max: 12, step: 1, initial: 6, unit: "次" },
    { key: "query", label: "读取哪个键", options: [{ value: "first", label: "先写的键（原值 1）" }, { value: "second", label: "后来写的键（新值 −1）" }], initial: "first" },
  ],
  evaluate({ overlap, writes, query }) {
    const firstKey = [1, 0];
    const nextKey = [overlap, Math.sqrt(1 - overlap ** 2)];
    const queryKey = query === "first" ? firstKey : nextKey;
    const target = query === "first" ? 1 : -1;
    const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
    let sumState = firstKey;
    let deltaState = firstKey;
    const sum = [[0, dot(sumState, queryKey)]];
    const delta = [[0, dot(deltaState, queryKey)]];
    for (let write = 1; write <= writes; write++) {
      const error = -1 - dot(deltaState, nextKey);
      sumState = sumState.map((value, i) => value - nextKey[i]);
      deltaState = deltaState.map((value, i) => value + 0.5 * nextKey[i] * error);
      sum.push([write, dot(sumState, queryKey)]);
      delta.push([write, dot(deltaState, queryKey)]);
    }

    return {
      type: "lines",
      series: [
        { label: "朴素线性累加", points: sum },
        { label: "delta rule 误差修正", points: delta },
        { label: "所查关联的原目标值", points: [[0, target], [writes, target]] },
      ],
      xLabel: "新键写入次数",
      yLabel: "查询读数",
      readout: `写入 ${writes} 次后，朴素累加读出 ${sum.at(-1)[1].toFixed(3)}，delta rule 读出 ${delta.at(-1)[1].toFixed(3)}。这组关联原先要存的值是 ${target}。`,
      explanation: "两个单位键写入同一个二维状态，value 为标量，取遗忘系数 1。普通方法每次写入整个新值。delta rule 以步长 0.5 写入预测误差。两键内积为 1 时是同一个方向，单一状态无法同时返回两个不同的值。",
    };
  },
};

const normalPdf = z => Math.exp(-0.5 * z ** 2) / Math.sqrt(2 * Math.PI);

// Normal CDF via the error-function approximation of Abramowitz and Stegun 7.1.26.
function normalCdf(z) {
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const complement = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(a ** 2));
  return z < 0 ? complement / 2 : 1 - complement / 2;
}

const teacherStd = 1.5;
const density = (x, mean, std) => normalPdf((x - mean) / std) / std;
const standardNormalGrid = indices(161).map(i => {
  const z = (i - 80) / 10;
  return { z, weight: normalPdf(z) / 10 };
});

function reverseObjective(mean, logStd, left, right, leftMass) {
  const std = Math.exp(logStd);
  const leftLogMass = Math.log(leftMass);
  const rightLogMass = Math.log1p(-leftMass);
  const variance = teacherStd ** 2;
  let loss = Math.log(teacherStd) - logStd - 0.5;
  let meanDerivative = 0;
  let logStdDerivative = -1;
  for (const { z, weight } of standardNormalGrid) {
    const x = mean + std * z;
    const leftLog = leftLogMass - 0.5 * (x - left) ** 2 / variance;
    const rightLog = rightLogMass - 0.5 * (x - right) ** 2 / variance;
    const max = Math.max(leftLog, rightLog);
    const leftWeight = Math.exp(leftLog - max);
    const rightWeight = Math.exp(rightLog - max);
    const logDensity = max + Math.log(leftWeight + rightWeight);
    const conditionalMean = (leftWeight * left + rightWeight * right) / (leftWeight + rightWeight);
    const gradient = (x - conditionalMean) / variance;
    loss -= weight * logDensity;
    meanDerivative += weight * gradient;
    logStdDerivative += weight * std * z * gradient;
  }
  return { loss, meanDerivative, logStdDerivative };
}

function fitReverse(start, left, right, leftMass) {
  let mean = start;
  let logStd = Math.log(teacherStd);
  let current = reverseObjective(mean, logStd, left, right, leftMass);
  for (let i = 0; i < 150; i++) {
    const { meanDerivative, logStdDerivative } = current;
    if (Math.hypot(meanDerivative, logStdDerivative) < 1e-7) break;
    let accepted = false;
    for (let rate = 0.5; rate >= 0.0001; rate /= 2) {
      const nextMean = mean - rate * meanDerivative;
      const nextLogStd = logStd - rate * logStdDerivative;
      const next = reverseObjective(nextMean, nextLogStd, left, right, leftMass);
      if (next.loss < current.loss) {
        mean = nextMean;
        logStd = nextLogStd;
        current = next;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  return { mean, std: Math.exp(logStd), loss: current.loss };
}

const distillationDivergences = {
  title: "同一位双成分教师，两种 KL 下的学生",
  question: "把反向 KL 的初始均值从左峰移到右峰，再拉近两峰。哪种学生始终匹配教师的整体均值？",
  check: {
    question: "两个成分中心维持在 12 和 28，左成分权重从 50% 调到 80%。前向学生的均值会直接移到 12 吗？",
    answer: "它匹配教师的加权均值，因此均值由 20 移到 15.2。右成分仍有 20% 的质量。",
  },
  controls: [
    { key: "gap", label: "教师两成分中心的距离", min: 3, max: 16, step: 1, initial: 16 },
    { key: "mass", label: "教师左成分权重", min: 20, max: 80, step: 5, initial: 50, unit: "%" },
    { key: "start", label: "反向 KL 的初始均值", options: [{ value: "left", label: "左成分中心" }, { value: "center", label: "两成分正中" }, { value: "right", label: "右成分中心" }], initial: "left" },
  ],
  evaluate({ gap, mass, start }) {
    const center = 20;
    const left = center - gap / 2;
    const right = center + gap / 2;
    const leftMass = mass / 100;
    const forward = {
      mean: leftMass * left + (1 - leftMass) * right,
      std: Math.sqrt(teacherStd ** 2 + leftMass * (1 - leftMass) * gap ** 2),
    };
    const reverse = fitReverse({ left, center, right }[start], left, right, leftMass);
    const xs = indices(161).map(i => i / 4);
    const teacher = { label: "同一位教师", points: xs.map(x => [x, leftMass * density(x, left, teacherStd) + (1 - leftMass) * density(x, right, teacherStd)]) };
    const interval = [left + gap / 3, right - gap / 3];
    const intervalMass = (mean, std) => normalCdf((interval[1] - mean) / std) - normalCdf((interval[0] - mean) / std);
    const panel = (title, student, percent) => ({
      title,
      shape: "distribution",
      series: [teacher, { label: "单高斯学生", points: xs.map(x => [x, density(x, student.mean, student.std)]) }],
      xLabel: "样本取值",
      yLabel: "概率密度",
      domainX: [0, 40],
      domainY: [0, 0.3],
      markers: [{ x: left, label: "左成分" }, { x: right, label: "右成分" }],
      headline: `${percent}% 落在中间区间`,
    });
    const pForward = (100 * intervalMass(forward.mean, forward.std)).toFixed(2);
    const pReverse = (100 * intervalMass(reverse.mean, reverse.std)).toFixed(2);

    return {
      type: "panels",
      panels: [panel("前向 KL · 教师 → 学生", forward, pForward), panel("反向 KL · 学生 → 教师", reverse, pReverse)],
      readout: `前向学生均值 ${forward.mean.toFixed(2)}、标准差 ${forward.std.toFixed(2)}，反向学生均值 ${reverse.mean.toFixed(2)}、标准差 ${reverse.std.toFixed(2)}。当前反向 KL 为 ${reverse.loss.toFixed(3)} nat。`,
      explanation: "教师的两个成分标准差均为 1.5，学生只能用一个高斯。图下比较学生落在两成分中心之间的中间三分之一的概率。前向 KL 匹配教师的均值和方差。反向 KL 经数值积分和局部优化，可能随初始化停在不同的驻点。",
    };
  },
};

function normalQuantile(probability) {
  let low = -9;
  let high = 9;
  for (let step = 0; step < 28; step++) {
    const middle = (low + high) / 2;
    if (normalCdf(middle) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

const candidateCounts = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096];
const quadratureCount = 192;
const bestOfNSamples = candidateCounts.map(n => n > 1
  ? indices(quadratureCount).map(i => normalQuantile(((i + 0.5) / quadratureCount) ** (1 / n)))
  : []);

function bestOfNPoint(n, scores, bias, penalty) {
  const kl = Math.log(n) - (n - 1) / n;
  if (n === 1) return { kl, proxy: 0, gold: -penalty / 2 };

  const std = Math.hypot(1, bias);
  const lengthStd = 1 / std;
  let proxy = 0;
  let gold = 0;
  for (const z of scores) {
    const lengthMean = bias * z / std;
    const standardized = lengthMean / lengthStd;
    const positiveSquare = (lengthMean ** 2 + lengthStd ** 2) * normalCdf(standardized)
      + lengthMean * lengthStd * normalPdf(standardized);
    proxy += std * z;
    gold += z / std - penalty * positiveSquare;
  }
  return { kl, proxy: proxy / quadratureCount, gold: gold / quadratureCount };
}

const rewardOveroptimization = {
  title: "候选越多，挑中的回答真的越好吗？",
  question: "先提高候选数，找出真实分开始回落的档位。再把奖励模型的长度偏置调到 0，真实分还会回落吗？",
  check: {
    question: "保留代理的长度偏置，将真实偏好的过长惩罚设为 0。继续加候选，会出现真实分下降吗？",
    answer: "在本实验的独立高斯假设下，两个分数都涨，真实分涨得更慢。它只取质量，而代理同时受质量和长度影响。",
  },
  controls: [
    { key: "bias", label: "RM 的长度偏置", min: 0, max: 1.5, step: 0.1, initial: 1 },
    { key: "penalty", label: "真实偏好的过长惩罚", min: 0, max: 1.2, step: 0.1, initial: 0.6 },
    { key: "candidates", label: "标记的候选数", options: [1, 2, 3, 4, 6, 8, 16, 64, 256, 1024, 4096].map(value => ({ value: String(value), label: `n = ${formatInteger.format(value)}` })), initial: "64" },
  ],
  evaluate({ bias, penalty, candidates }) {
    const points = candidateCounts.map((n, i) => ({ n, ...bestOfNPoint(n, bestOfNSamples[i], bias, penalty) }));
    const selected = points.find(({ n }) => n === Number(candidates));
    const peak = points.reduce((best, point) => point.gold > best.gold ? point : best);
    const turn = peak.n === points.at(-1).n ? `到 n = ${peak.n} 仍在上升` : `最高点在 n = ${peak.n}`;

    return {
      type: "lines",
      series: [
        { label: "奖励模型评分", points: points.map(({ kl, proxy }) => [kl, proxy]) },
        { label: "真实偏好评分", points: points.map(({ kl, gold }) => [kl, gold]) },
      ],
      xLabel: "best-of-n 相对原分布的 KL（nat）",
      yLabel: "被选中回答的期望评分",
      domainX: [0, 7.4],
      markers: [{ x: selected.kl, label: `n = ${selected.n}` }],
      readout: `n = ${selected.n} 时，KL 为 ${selected.kl.toFixed(2)} nat，代理分为 ${selected.proxy.toFixed(2)}，真实分为 ${selected.gold.toFixed(2)}。在图中采样的候选数上，真实分${turn}。`,
      explanation: "候选的质量和长度特征为独立的标准高斯。按质量加长度偏置选最高分，真实分从质量中扣除过长惩罚。曲线是对被选中样本分布的数值积分。长度偏置为 0 时，选择只抬高真实质量，过长惩罚的期望值保持不变。",
    };
  },
};

export {
  residualStream as "1.1",
  ropeSpectrum as "1.2",
  cacheBudget as "1.3",
  expertRouting as "1.4",
  tiledSoftmax as "1.5",
  linearMemory as "1.6",
  distillationDivergences as "2.1",
  rewardOveroptimization as "2.2",
  distillationGradient as "2.1-gradient",
  preferenceVotes as "2.2-votes",
};
export * from "./architecture-core.mjs";
export * from "./architecture-studies.mjs";
