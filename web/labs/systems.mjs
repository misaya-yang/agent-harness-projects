const diffusionSchedule = [1];
for (let t = 0; t < 1000; t++) {
  const beta = 0.0001 + (0.02 - 0.0001) * t / 999;
  diffusionSchedule.push(diffusionSchedule.at(-1) * (1 - beta));
}

const cleanSD = 0.15;
const cleanVariance = cleanSD ** 2;
const noisyVariance = abar => abar * cleanVariance + 1 - abar;

const hardware = {
  "h100-bf16": { label: "H100 SXM · BF16", bandwidth: 3.35, peak: 989 },
  "h100-fp8": { label: "H100 SXM · FP8", bandwidth: 3.35, peak: 1979 },
  "b300-fp4": { label: "B300 · NVFP4", bandwidth: 8, peak: 15000 },
  "rubin-fp4": { label: "Rubin · NVFP4 训练（22 TB/s）", bandwidth: 22, peak: 35000 },
  "rubin-fp4-shipping": { label: "Rubin · NVFP4 训练（19.2 TB/s）", bandwidth: 19.2, peak: 35000 },
};

const zeroStages = ["普通 DP", "ZeRO-1", "ZeRO-2", "ZeRO-3 / FSDP"];
const intensityFormat = new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 3 });
const decimal = (value, places = 1) => value.toLocaleString("zh-CN", {
  minimumFractionDigits: places,
  maximumFractionDigits: places,
});

export default {
  "4.1": {
    title: "DDIM 的步数和随机项怎样改变方差？",
    question: "把步数保持在 20，比较 η=0 和 η=1 的终点标准差。增加步数后，哪条曲线更接近理论边际？",
    check: {
      question: "保留同一个初始噪声和去噪网络，重采样时还会生成同一个结果吗？",
      answer: "η=0 时每次更新都由当前样本确定，结果相同。η>0 时中间步骤会注入新噪声，只有也固定这些随机数，整条路径才可复现。",
    },
    controls: [
      { key: "steps", label: "反向采样步数", min: 2, max: 64, step: 1, initial: 20 },
      { key: "eta", label: "随机性 η", min: 0, max: 1, step: 0.1, initial: 0 },
    ],
    evaluate({ steps, eta }) {
      let variance = noisyVariance(diffusionSchedule[1000]);
      const sampled = [[1000, Math.sqrt(variance)]];
      for (let i = 0; i < steps; i++) {
        const t = Math.round(1000 * (steps - i) / steps);
        const s = Math.round(1000 * (steps - i - 1) / steps);
        const abarT = diffusionSchedule[t];
        const abarS = diffusionSchedule[s];
        const injectedVariance = eta ** 2 * (1 - abarS) / (1 - abarT) * (1 - abarT / abarS);
        const analyticVariance = noisyVariance(abarT);
        const cleanScale = Math.sqrt(abarT) * cleanVariance / analyticVariance;
        const noiseScale = Math.sqrt(1 - abarT) / analyticVariance;
        const gain = Math.sqrt(abarS) * cleanScale + Math.sqrt(Math.max(0, 1 - abarS - injectedVariance)) * noiseScale;
        variance = gain ** 2 * variance + injectedVariance;
        sampled.push([s, Math.sqrt(variance)]);
      }
      const std = Math.sqrt(variance);
      return {
        type: "lines",
        series: [
          { label: "理论边际", points: Array.from({ length: 101 }, (_, i) => [i * 10, Math.sqrt(noisyVariance(diffusionSchedule[i * 10]))]) },
          { label: `有限步采样（η=${eta}）`, points: sampled.reverse() },
        ],
        xLabel: "时刻 t（采样从右往左）",
        yLabel: "标准差",
        domainX: [0, 1000],
        domainY: [0, 1.05],
        point: { x: 0, y: std, label: "最终样本" },
        readout: `${steps} 步后标准差 ${decimal(std, 3)}，目标 ${cleanSD.toFixed(3)}，相差 ${decimal(Math.abs(cleanSD - std), 3)}。`,
        explanation: "这是标准差为 0.15 的一维高斯，从精确的带噪边际出发，每步使用精确 score。每次更新为线性缩放加独立高斯噪声，因此能直接算出标准差，曲线差距来自有限步更新。",
      };
    },
  },
  "4.2": {
    title: "独立配对和同向配对的一步落点",
    question: "先令 ρ=0、步数为 1，再只改步数。最后设回一步并把 ρ 调到 1，两条轨迹分别落在哪里？",
    check: {
      question: "如果把 ρ 设为 0.5，保持一步，两个粒子会到达数据端的哪两个位置？",
      answer: "会到达 ±1。起点的条件均值等于 2ρ 倍的噪声位置，一步 Euler 恰好把每个粒子移到这个均值。精确落点仍是 ±2。",
    },
    controls: [
      { key: "steps", label: "Euler 步数", min: 1, max: 32, step: 1, initial: 1 },
      { key: "coupling", label: "噪声与数据的相关系数 ρ", min: 0, max: 1, step: 0.05, initial: 0 },
    ],
    evaluate({ steps, coupling }) {
      const targetSD = 2;
      const covariance = coupling * targetSD;
      const variance = t => (1 - t) ** 2 * targetSD ** 2 + t ** 2 + 2 * t * (1 - t) * covariance;
      const exact = Array.from({ length: 61 }, (_, i) => [i / 60, Math.sqrt(variance(1 - i / 60))]);
      const euler = [[0, 1]];
      let x = 1;
      for (let i = 0; i < steps; i++) {
        const t = 1 - i / steps;
        const covVelocity = (1 - t) * (covariance - targetSD ** 2) + t * (1 - covariance);
        x -= x * covVelocity / variance(t) / steps;
        euler.push([(i + 1) / steps, x]);
      }
      const endpoints = x === 0 ? "都在 0" : `是 ±${decimal(Math.abs(x), 2)}`;
      return {
        type: "lines",
        series: [
          { label: "从 +1 出发 · 精确", points: exact },
          { label: "从 +1 出发 · Euler", points: euler },
          { label: "从 −1 出发 · 精确", points: exact.map(([t, value]) => [t, -value]) },
          { label: "从 −1 出发 · Euler", points: euler.map(([t, value]) => [t, -value]) },
        ],
        xLabel: "采样进度 1−t（噪声 → 数据）",
        yLabel: "粒子位置 x",
        domainX: [0, 1],
        domainY: [-2.2, 2.2],
        markers: [{ x: 1, label: "数据端" }],
        readout: `从 ±1 出发，${steps} 步的落点${endpoints}，精确积分的落点是 ±${targetSD.toFixed(2)}。`,
        explanation: "两个零均值高斯的标准差分别为 1 和 2。独立配对（ρ=0）时，一步 Euler 只会走到均值。完全同向配对（ρ=1）相当于让数据点等于噪声点的两倍，线性插值轨迹的速度恒定，一步就走准。",
      };
    },
  },
  "4.3": {
    title: "单独压低沿原方向的 CFG 更新",
    question: "设一个较大的 w，对比左右两图。逐渐降低 η，观察输出向量的长度和方向怎样变化。",
    check: {
      question: "把 η 设为 0 后继续提高 w，APG 的预测向量还会变吗？",
      answer: "会。被保留的正交更新仍随 w−1 增大，预测相对于原条件方向的偏转也会增加。",
    },
    controls: [
      { key: "guidance", label: "引导强度 w", min: 1, max: 8, step: 0.25, initial: 4 },
      { key: "parallelKeep", label: "平行分量保留比例 η", min: 0, max: 1, step: 0.05, initial: 0 },
    ],
    evaluate({ guidance, parallelKeep }) {
      const conditional = [1, 0.5];
      const difference = [0.6, 0.05];
      const projection = (difference[0] * conditional[0] + difference[1] * conditional[1]) / Math.hypot(...conditional) ** 2;
      const parallel = conditional.map(value => projection * value);
      const perpendicular = difference.map((value, i) => value - parallel[i]);
      const extraGuidance = guidance - 1;
      const parallelNorm = extraGuidance * Math.hypot(...parallel);
      const perpendicularNorm = extraGuidance * Math.hypot(...perpendicular);
      const output = keep => conditional.map((value, i) => value + extraGuidance * (perpendicular[i] + keep * parallel[i]));
      const revised = output(parallelKeep);
      const ordinary = output(1);
      const condition = { x: conditional[0], y: conditional[1], label: "有条件预测" };
      const panel = (title, target) => ({
        shape: "vectors", title, domain: 6,
        vectors: [condition, { x: target[0], y: target[1], label: "引导后的预测" }],
      });
      return {
        type: "panels",
        panels: [panel("普通 CFG", ordinary), panel("APG 投影", revised)],
        readout: `平行更新的长度从 ${decimal(parallelNorm, 2)} 降至 ${decimal(parallelKeep * parallelNorm, 2)}，两图的正交更新长度均为 ${decimal(perpendicularNorm, 2)}。总预测向量的长度分别为 ${decimal(Math.hypot(...ordinary), 2)} 和 ${decimal(Math.hypot(...revised), 2)}。`,
        explanation: "以有条件预测（1, 0.5）为基准。普通 CFG 同等放大两个分量，APG 把平行项再乘 η。w=1 时组合回到有条件预测，η=1 时两种组合等价。这里演示二维投影。",
      };
    },
  },
  "5.1": {
    title: "交互屋脊图",
    question: "把算术强度向右调到屋脊点，再从 H100 BF16 切换到同卡的 FP8。原来的工作负载现在受什么限制？",
    check: {
      question: "一个算术强度约 400 FLOP/B 的 kernel，H100 从 BF16 切换到 FP8，性能上限能翻倍吗？",
      answer: "如果算术强度和 HBM 带宽保持原值，BF16 档会触到 989 TFLOP/s 的平顶，FP8 档则在 400×3.35=1340 TFLOP/s 处受带宽限制。理论上限只增加约 35%。",
    },
    scrub: { key: "intensityExponent", transform: "log10" },
    presets: [
      { label: "小批量 decode", values: { intensityExponent: 0.4 } },
      { label: "高强度 GEMM", values: { intensityExponent: 3.3 } },
    ],
    controls: [
      { key: "hardware", label: "硬件与计算精度", options: Object.entries(hardware).map(([value, { label }]) => ({ value, label })), initial: "h100-bf16" },
      { key: "intensityExponent", label: "算术强度（对数刻度）", min: -1, max: 5, step: 0.05, initial: 0.4, format: value => `${intensityFormat.format(10 ** value)} FLOP/B` },
    ],
    evaluate({ hardware: selected, intensityExponent }) {
      const { bandwidth, peak } = hardware[selected];
      const intensity = 10 ** intensityExponent;
      const ridge = peak / bandwidth;
      const bandwidthLimit = bandwidth * intensity;
      const ceiling = Math.min(peak, bandwidthLimit);
      const bottleneck = Math.abs(bandwidthLimit - peak) <= peak * 1e-12 ? "两种上限相等"
        : bandwidthLimit < peak ? "带宽受限" : "算力受限";
      const domainX = [0.1, 100000];
      return {
        type: "lines",
        series: [{ label: "理论性能上限", points: [[domainX[0], bandwidth * domainX[0]], [ridge, peak], [domainX[1], peak]] }],
        xLabel: "算术强度（FLOP/B）",
        yLabel: "性能上限（TFLOP/s）",
        domainX,
        domainY: [0.1, 100000],
        scaleX: "log",
        scaleY: "log",
        regions: [{ from: domainX[0], to: ridge, label: "带宽受限" }, { from: ridge, to: domainX[1], label: "算力受限" }],
        markers: [{ x: ridge, label: "屋脊点" }],
        point: { x: intensity, y: ceiling, label: bottleneck },
        readout: `${decimal(intensity, 2)} FLOP/B，${bottleneck}。理论上限 ${decimal(ceiling, 2)} TFLOP/s，屋脊点 ${decimal(ridge, 1)} FLOP/B。`,
        explanation: `本档峰值 ${decimal(peak, 0)} TFLOP/s，HBM 带宽 ${decimal(bandwidth, 2)} TB/s。两轴采用对数刻度。小批量 decode 和高强度 GEMM 的示例强度分别约为 2.51 和 2000 FLOP/B，实际强度应由 kernel 的算术操作数和 HBM 读写量计算。`,
      };
    },
  },
  "5.2": {
    title: "ZeRO 从哪一级开始装得下？",
    question: "保持 70B、80 GB，先增大 DP 组，再提高每卡容量。哪种切分最早留出静态显存余量？",
    check: {
      question: "把 70B 模型的 ZeRO-3 从 64 卡改为 128 卡，每卡的静态显存和通信量会同时减半吗？",
      answer: "静态显存从 17.5 GB 降到 8.75 GB。ring 通信量随 (N−1)/N 增大，从每卡每步约 413 GB 略升至 417 GB。",
    },
    controls: [
      { key: "params", label: "模型参数量", min: 5, max: 400, step: 5, initial: 70, unit: "B" },
      { key: "ranks", label: "DP 组大小", options: [1, 8, 16, 32, 64, 128, 256].map(value => ({ value: String(value), label: `${value} 卡` })), initial: "64" },
      { key: "capacity", label: "单卡显存", options: [40, 80, 141, 192, 288].map(value => ({ value: String(value), label: `${value} GB` })), initial: "80" },
    ],
    evaluate({ params, ranks, capacity }) {
      const n = Number(ranks);
      const budget = Number(capacity);
      const values = [16, 4 + 12 / n, 2 + 14 / n, 16 / n].map(bytes => params * bytes);
      const firstFit = values.findIndex(memory => memory <= budget);
      const dpCommunication = 2 * (n - 1) / n * 2 * params;
      const fit = firstFit < 0
        ? `ZeRO-3 仍缺 ${decimal(values[3] - budget)} GB 静态显存。`
        : `${zeroStages[firstFit]} 开始满足静态容量，余量 ${decimal(budget - values[firstFit])} GB。`;
      return {
        type: "bars",
        rows: values.map((value, i) => ({ label: zeroStages[i], value, display: `${decimal(value)} GB` })),
        reference: { value: budget, label: "单卡容量" },
        unit: "GB/卡",
        readout: `${fit} ZeRO-3 的理想 ring 通信量约 ${decimal(1.5 * dpCommunication)} GB/卡/步。`,
        explanation: `混合精度 Adam 的权重、梯度、优化器状态分别占 2、2、12 B/参数。普通 DP 的 ring 通信量约 ${decimal(dpCommunication)} GB/卡/步，比较时按单个方向记账。实际显存还需留给激活、临时聚合的参数和通信缓冲。`,
      };
    },
  },
  "5.3": {
    title: "用合成 Loss 曲线调报警阈值",
    question: "先找回注入的两个尖刺，再切换到持续抬升。调低阈值会让哪些正常更新也触发报警？",
    check: {
      question: "持续抬升的曲线为什么可能会一连报警很多步，报警线却停在原位？",
      answer: "检测器丢弃了超阈值点，基线保留在抬升前的水平。它能保护基线免受短暂尖刺影响。持续变化时还要检查数据分布、学习率和最先异常的层，决定是否重建基线。",
    },
    controls: [
      { key: "scenario", label: "模拟曲线", options: [
        { value: "spikes", label: "两个瞬时尖刺" },
        { value: "shift", label: "基线持续抬升" },
        { value: "normal", label: "正常波动" },
      ], initial: "spikes" },
      { key: "threshold", label: "报警阈值 k（标准差倍数）", min: 0.5, max: 10, step: 0.5, initial: 6 },
    ],
    evaluate({ scenario, threshold }) {
      const spikeAt = { 32: 1.15, 60: 1.05 };
      const loss = Array.from({ length: 81 }, (_, step) => {
        const baseline = 5.05 - 0.006 * step + 0.10 * Math.sin(1.67 * step) + 0.09 * Math.cos(0.42 * step);
        const spike = scenario === "spikes" ? (spikeAt[step] ?? 0) : 0;
        const shift = scenario === "shift" && step >= 45 ? 0.9 : 0;
        return baseline + spike + shift;
      });
      const alarms = [];
      const limits = [];
      let mean = loss[0];
      let variance = 0;
      for (let step = 1; step < loss.length; step++) {
        const limit = mean + threshold * Math.sqrt(variance);
        if (step >= 20) limits.push([step, limit]);
        if (step >= 20 && loss[step] > limit) {
          alarms.push(step);
          continue;
        }
        const delta = loss[step] - mean;
        mean += 0.1 * delta;
        variance = 0.9 * (variance + 0.1 * delta ** 2);
      }
      const first = alarms[0];
      const markers = scenario === "spikes" ? [{ x: 32, label: "尖刺一" }, { x: 60, label: "尖刺二" }]
        : scenario === "shift" ? [{ x: 45, label: "基线抬升" }] : [];
      const summary = alarms.length ? `共 ${alarms.length} 个报警步。${alarms.length > 4 ? "最早的四步是" : "报警位置是"} ${alarms.slice(0, 4).join("、")}。` : "监测区间内没有报警。";
      const detectedSpikes = alarms.filter(step => spikeAt[step] !== undefined).length;
      const assessment = scenario === "spikes" ? `真实尖刺捕捉 ${detectedSpikes}/2，误报 ${alarms.length - detectedSpikes} 步。` : "";
      return {
        type: "lines",
        series: [{ label: "合成 Loss", points: loss.map((value, i) => [i, value]) }, { label: "实时报警线", points: limits }],
        xLabel: "优化器步数",
        yLabel: "Loss",
        domainX: [0, 80],
        markers,
        point: first === undefined ? undefined : { x: first, y: loss[first], label: "首次报警" },
        readout: `${summary}${assessment}`,
        explanation: "前 20 步用于建立基线，后续以指数滑动均值加 k 倍标准差为报警线。报警点跳过统计更新，因此持续抬升时可能反复报警。把告警时刻与批次、梯度范数、最大 logit 和离群激活对照，再做 checkpoint 重放。",
      };
    },
  },
  "5.4": {
    title: "同样提升 2 个百分点，结论会一样吗？",
    question: "固定 500 道题，降低两模型判定不同的比率。配对误差条什么时候比观察差值更短？换题数再试一次。",
    check: {
      question: "若 500 道题来自 50 个仓库，同一个仓库里两模型的得分差高度相关，应在哪一级做重采样？",
      answer: "按仓库重采样，同时保留同题上两模型的配对。这样能让同一仓库内的差值一起变化，估计由仓库之间差异带来的不确定性。",
    },
    controls: [
      { key: "questions", label: "评测题数", min: 100, max: 5000, step: 100, initial: 500, unit: "题" },
      { key: "discordance", label: "两模型一对一错的比例", min: 2, max: 58, step: 1, initial: 20, unit: "%" },
    ],
    evaluate({ questions, discordance }) {
      const accuracyA = 0.70;
      const accuracyB = 0.72;
      const delta = accuracyB - accuracyA;
      const discordanceRate = discordance / 100;
      const pairedVariance = discordanceRate - delta ** 2;
      const independentVariance = accuracyA * (1 - accuracyA) + accuracyB * (1 - accuracyB);
      const ciHalfWidth = variance => 100 * 1.96 * Math.sqrt(variance / questions);
      const pairedWidth = ciHalfWidth(pairedVariance);
      const independentWidth = ciHalfWidth(independentVariance);
      const nNeeded = Math.ceil((2.8 / delta) ** 2 * pairedVariance);
      return {
        type: "bars",
        rows: [
          { label: "观察到的准确率差", value: delta * 100, display: "2.00 个百分点" },
          { label: "独立比较的 95% 区间半宽", value: independentWidth, display: `${decimal(independentWidth, 2)} 个百分点` },
          { label: "配对比较的 95% 区间半宽", value: pairedWidth, display: `${decimal(pairedWidth, 2)} 个百分点` },
        ],
        unit: "百分点",
        readout: `B−A 的配对 95% 区间约为 ${decimal(100 * delta - pairedWidth, 2)} 至 ${decimal(100 * delta + pairedWidth, 2)} 个百分点。按当前差异和方差估计，80% 功效需要约 ${decimal(nNeeded, 0)} 题。`,
        explanation: `A、B 的正确率固定为 70% 和 72%。一对一错的题中，只有 B 答对的题占全部题目 ${decimal(50 * (discordanceRate + delta), 1)}%，只有 A 答对的题占 ${decimal(50 * (discordanceRate - delta), 1)}%。每题差值的方差等于不一致比例减去差值平方。近似公式假设题目独立，若两模型答得不同的题很少，可用基于 discordant pairs 的精确检验。`,
      };
    },
  },
};
