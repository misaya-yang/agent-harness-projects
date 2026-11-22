// Labs for M6 (pretraining). Every number is computed from the real iteration, not drawn by hand.
import { escapeText as esc } from "./graphics.mjs";
import scaling from "./pretraining-scaling.mjs";

const QUINTIC = [3.4445, -4.775, 2.0315];   // Keller Jordan's Muon coefficients
const CUBIC = [1.5, -0.5, 0];               // classic Newton–Schulz, converges to 1
const STABILIZE = [2, -1.5, 0.5];           // DeepSeek-V4's last two steps: φ(1) = 1, φ′(1) = 0

const schemes = {
  quintic: { label: "Muon 五次", step: () => QUINTIC },
  cubic: { label: "经典三次", step: () => CUBIC },
  hybrid: { label: "V4 混合 8+2", step: i => (i < 8 ? QUINTIC : STABILIZE) },
};
const schemeOptions = Object.entries(schemes).map(([value, { label }]) => ({ value, label }));
const phi = ([a, b, c], s) => a * s + b * s ** 3 + c * s ** 5;
function iterate(scheme, sigma, steps) {
  let s = sigma;
  for (let i = 0; i < steps; i++) s = phi(schemes[scheme].step(i), s);
  return s;
}
const round = (v, digits = 3) => Number(v.toFixed(digits));
const f3 = v => v.toFixed(3);
const tokens = B => `${(B / 1e6).toFixed(B < 1e7 ? 2 : 1)}M`;
const ratioText = r => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r >= 10 ? r.toFixed(1) : r.toFixed(2));
const logGrid = (lo, hi, count) => Array.from({ length: count }, (_, i) => 10 ** (Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * i / (count - 1)));

// The unit circle mapped through a 2×2 diagonal matrix. Radius 1 is the dashed circle.
function ellipse(rx, ry, tone, label) {
  const R = 66;
  return `<svg viewBox="0 0 242 174" role="img" aria-label="${esc(label)}"><g transform="translate(121 87)">
    <path d="M-112 0H112 M0 -84V84" class="lab-guide"/>
    <circle r="${R}" fill="none" class="lab-guide"/>
    <ellipse rx="${round(R * rx, 2)}" ry="${round(R * Math.max(ry, 0.004), 2)}" fill="var(--${tone})" fill-opacity=".16" stroke="var(--${tone})" stroke-width="2.6"/>
  </g></svg>`;
}

const explanations = {
  quintic: "五次系数在 0 附近的斜率是 3.4445，小奇异值每步约放大 3.4 倍，所以几步就能被拉起来。代价是它不收敛到 1：φ(1) ≈ 0.70，奇异值会在 0.7 到 1.2 之间来回摆动。Muon 的设计者发现训练对这种摆动不敏感。",
  cubic: "经典三次 φ(σ) = 1.5σ − 0.5σ³ 能精确收敛到 1，但在 0 附近斜率只有 1.5。初始比例越悬殊，小奇异值越难在 5 步内被拉起来。",
  hybrid: "前 8 步用 Muon 五次系数快速拉起小奇异值，最后 2 步换成 (2, −1.5, 0.5)。这组系数满足 φ(1) = 1、φ′(1) = 0，能把奇异值钉在 1 附近。DeepSeek-V4 用的就是这套 10 步的组合。",
};

const newtonSchulzLab = {
  title: "Newton–Schulz 实验室：几步迭代把椭圆推成圆",
  question: "动量矩阵在两个方向上的尺度差很多。选一组系数，拖动迭代步数，看单位圆经过更新矩阵之后变成什么形状。",
  controls: [
    { key: "logRatio", label: "初始奇异值比例", min: 0, max: 3, step: 0.05, initial: 1.1, format: v => `1 : ${ratioText(10 ** v)}` },
    { key: "steps", label: "Newton–Schulz 迭代步数", min: 0, max: 10, step: 1, initial: 5, format: v => `${v} 步` },
    { key: "scheme", label: "迭代系数", options: schemeOptions, initial: "quintic" },
  ],
  presets: [
    { label: "极端失衡 1 : 1000", values: { logRatio: 3 } },
    { label: "常规失衡 1 : 12.6", values: { logRatio: 1.1 } },
    { label: "接近均衡 1 : 2", values: { logRatio: 0.3 } },
  ],
  evaluate({ logRatio, steps, scheme }) {
    const ratio = 10 ** logRatio;
    const norm = Math.hypot(1, 1 / ratio);                 // Frobenius normalisation keeps σ_max ≤ 1
    const [s1, s2] = [1 / norm, 1 / ratio / norm];
    const [o1, o2] = [iterate(scheme, s1, steps), iterate(scheme, s2, steps)];
    const after = o1 / o2;
    return {
      type: "panels",
      panels: [
        { shape: "svg", svg: ellipse(s1, s2, "lab-blue", `输入矩阵，奇异值 ${round(s1)} 和 ${round(s2, 4)}`), title: "归一化后的动量矩阵",
          headline: `尺度比 ${ratioText(ratio)} : 1`, detail: `σ = ${f3(s1)}，${f3(s2)}` },
        { shape: "svg", svg: ellipse(o1, o2, "lab-teal", `第 ${steps} 步之后，奇异值 ${round(o1)} 和 ${round(o2)}`), title: steps ? `第 ${steps} 步之后` : "尚未迭代",
          headline: `尺度比 ${ratioText(Math.max(after, 1 / after))} : 1${after < 1 ? "（反转）" : ""}`, detail: `σ = ${f3(o1)}，${f3(o2)}` },
      ],
      readout: `${schemes[scheme].label}，迭代 ${steps} 步后：两个奇异值从 ${f3(s1)} 和 ${f3(s2)} 变为 ${f3(o1)} 和 ${f3(o2)}。`,
      explanation: `虚线圆半径为 1，椭圆的两个半轴就是两个奇异值；正交化的目标是一个圆（两个奇异值都等于 1）。${explanations[scheme]}`,
    };
  },
  check: {
    question: "为什么第 1 步之后，原本最大的奇异值反而变小了？",
    answer: "Muon 五次系数满足 φ(1) = 3.4445 − 4.7750 + 2.0315 ≈ 0.70。为了让 0 附近的斜率尽量大，它放弃了在 1 处的精度：大奇异值先被压到 0.7，下一步又弹回 1.1 左右。只有像 V4 那样在最后换成满足 φ(1) = 1 的系数，奇异值才会稳定在 1。",
  },
};

const polynomialLab = {
  title: "三组系数：谁把小奇异值拉得最快？",
  question: "横轴是归一化后的输入奇异值（对数轴），纵轴是迭代 k 步后的输出。理想的正交化是 y = 1 这条水平线。",
  controls: [
    { key: "steps", label: "迭代步数 k", min: 1, max: 10, step: 1, initial: 5, format: v => `${v} 步` },
    { key: "scheme", label: "迭代系数", options: schemeOptions, initial: "quintic" },
  ],
  evaluate({ steps, scheme }) {
    const grid = logGrid(1e-3, 1, 401);
    const out = grid.map(s => iterate(scheme, s, steps));
    const probe = 0.01, probeOut = iterate(scheme, probe, steps);
    return {
      type: "lines", scaleX: "log", domainX: [1e-3, 1], domainY: [0, 1.4],
      series: [
        { label: `${schemes[scheme].label} · ${steps} 步后`, points: grid.map((s, i) => [s, out[i]]) },
        { label: "输入（不迭代）", points: grid.map(s => [s, s]) },
        { label: "理想正交化 UVᵀ", points: [[1e-3, 1], [1, 1]] },
      ],
      point: { x: probe, y: probeOut, label: `σ = 0.01 → ${f3(probeOut)}` },
      xLabel: "输入奇异值 σ（Frobenius 归一化后）", yLabel: "迭代后的奇异值",
      readout: `${steps} 步后，输入 σ ∈ [0.001, 1] 的输出落在 [${f3(Math.min(...out))}, ${f3(Math.max(...out))}]；σ = 0.01 被拉到 ${f3(probeOut)}。`,
      explanation: "奇矩阵多项式只改奇异值、不改奇异向量，所以整个矩阵的行为可以完全由这一条一维曲线描述。曲线越早贴近 y = 1、贴得越紧，正交化就越快越准。",
    };
  },
  check: {
    question: "既然经典三次能精确收敛到 1，Muon 为什么不用它？",
    answer: "因为 Muon 只舍得做大约 5 步。三次多项式在 0 附近斜率只有 1.5，5 步只能把 0.01 放大到约 0.076，小奇异值方向几乎没被拉起来；五次系数把斜率提到 3.4445，5 步就能把 0.01 拉到 0.7 左右，代价是结果在 0.7–1.2 之间摆动。",
  },
};

const widths = [768, 4096, 7168, 16384];
const costLab = {
  title: "Muon 的额外算力占多少？",
  question: "Newton–Schulz 只做矩阵乘法。选模型宽度、迭代步数和每步的 batch token 数，估算它相对前向 + 反向的 FLOPs 占比。",
  controls: [
    { key: "width", label: "矩阵较短边 m（模型宽度）", options: widths.map(w => ({ value: String(w), label: w.toLocaleString("en-US") })), initial: "4096" },
    { key: "steps", label: "迭代步数 T", min: 5, max: 10, step: 1, initial: 5, format: v => `${v} 步` },
    { key: "logBatch", label: "每个优化步的 batch", min: 5.4, max: 8.2, step: 0.01, initial: 6.6, format: v => `${tokens(10 ** v)} token` },
  ],
  presets: [
    { label: "NanoGPT 速通", values: { width: "768", steps: 5, logBatch: 5.72 } },
    { label: "405B 级稠密模型", values: { width: "16384", steps: 5, logBatch: 7.21 } },
    { label: "小 batch 微调", values: { width: "4096", steps: 5, logBatch: 5.4 } },
  ],
  evaluate({ width, steps, logBatch }) {
    const m = Number(width), batch = 10 ** logBatch;
    const overhead = B => 100 * steps * m / B;
    const grid = logGrid(10 ** 5.4, 10 ** 8.2, 60);
    return {
      type: "lines", scaleX: "log", scaleY: "log", domainX: [10 ** 5.4, 10 ** 8.2], domainY: [0.001, 50],
      series: widths.map(w => ({ label: `m = ${w.toLocaleString("en-US")}`, points: grid.map(B => [B, 100 * steps * w / B]) })),
      point: { x: batch, y: overhead(batch), label: `${overhead(batch).toFixed(2)}%` },
      xLabel: "每个优化步的 batch（token）", yLabel: "额外 FLOPs 占比（%）",
      readout: `m = ${m.toLocaleString("en-US")}、T = ${steps}、每步 ${tokens(batch)} token：Newton–Schulz 的额外 FLOPs 约为前向 + 反向的 ${overhead(batch).toFixed(2)}%。`,
      explanation: "对 n×m 的矩阵（m ≤ n），每步迭代约 2(2nm² + m³) ≤ 6nm² FLOPs，T 步共 6Tnm²；这一层一次前向 + 反向是 6nmB。两者相除得到上界 T·m / B。批越大，正交化的成本被摊得越薄。这里只算 FLOPs，没算为了拿到完整梯度矩阵而多出的通信。",
    };
  },
  check: {
    question: "既然 FLOPs 只占不到 1%，为什么 DeepSeek-V4 要专门为 Muon 设计 ZeRO 策略？",
    answer: "因为 ZeRO 原本按元素切分参数和优化器状态，而 Newton–Schulz 需要整张梯度矩阵。V4 用背包算法把完整矩阵分配到各个 rank，MoE 专家则逐个独立优化。瓶颈在数据放在哪、怎么搬，而不在矩阵乘法本身（→ 5.2）。",
  },
};

export default { "6.3": newtonSchulzLab, "6.3-polynomial": polynomialLab, "6.3-cost": costLab, ...scaling };
