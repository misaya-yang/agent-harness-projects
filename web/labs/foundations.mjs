// Labs for M0 (math foundations). Every number is computed from the formula in the lesson; random draws use a
// fixed seed so the same controls always give the same picture.
import { f2, f3, pct, sci, grid, clamp, xy, rng, normals, normalPdf, normSf, lgamma, logSumExp, figure, text } from "./math-kit.mjs";
import linalgOpt from "./foundations-linalg-opt.mjs";
import generative from "./foundations-generative.mjs";

/* ---------- 0.2 Calculus ---------- */
const curves = {
  cubic: { label: "x³ − 2x", f: x => x ** 3 - 2 * x, d1: x => 3 * x * x - 2, d2: x => 6 * x, d3: () => 6, y: [-6.5, 6.5] },
  wave: { label: "sin 2x", f: x => Math.sin(2 * x), d1: x => 2 * Math.cos(2 * x), d2: x => -4 * Math.sin(2 * x), d3: x => -8 * Math.cos(2 * x), y: [-1.7, 1.7] },
  softplus: {
    label: "softplus(2x)", f: x => Math.log1p(Math.exp(2 * x)), d1: x => 2 / (1 + Math.exp(-2 * x)),
    d2: x => { const s = 1 / (1 + Math.exp(-2 * x)); return 4 * s * (1 - s); },
    d3: x => { const s = 1 / (1 + Math.exp(-2 * x)); return 8 * s * (1 - s) * (1 - 2 * s); }, y: [-0.8, 4.8],
  },
};
const taylor = (c, x0, h, order) => c.f(x0) + c.d1(x0) * h + (order === 2 ? 0.5 * c.d2(x0) * h * h : 0);
const linearization = {
  title: "局部线性化：切线离曲线有多远？",
  question: "在曲线上选一点 x₀，用切线（或二阶近似）去预测 x₀ + h 处的函数值。把 h 缩小，看误差缩小得有多快。",
  controls: [
    { key: "curve", label: "函数", initial: "cubic", options: Object.entries(curves).map(([value, c]) => ({ value, label: c.label })) },
    { key: "x0", label: "展开点 x₀", min: -1.8, max: 1.8, step: 0.05, initial: 0.8, format: v => v.toFixed(2) },
    { key: "logH", label: "步长 h", min: -2, max: 0, step: 0.05, initial: -0.3, format: v => (10 ** v).toFixed(3) },
    { key: "order", label: "近似阶数", initial: 1, options: [{ value: 1, label: "一阶（切线）" }, { value: 2, label: "二阶" }] },
  ],
  presets: [
    { label: "拐点：x³ − 2x 在 0 处", values: { curve: "cubic", x0: 0, logH: -0.3, order: 1 } },
    { label: "波峰：sin 2x 在 0.8 处", values: { curve: "wave", x0: 0.8, logH: -0.3, order: 1 } },
    { label: "换成二阶近似", values: { curve: "wave", x0: 0.8, logH: -0.3, order: 2 } },
  ],
  check: {
    question: "为什么在 x³ − 2x 的 x₀ = 0 处，一阶近似的误差缩小得比别处快？",
    answer: "一阶误差的主项是 ½f''(x₀)h²，而 f''(0) = 0，主项消失，剩下的是 f'''h³/6 = h³。所以 h 缩小 10 倍，误差缩小约 1000 倍。拐点处切线穿过曲线，两者贴得最紧。",
  },
  evaluate({ curve, x0, logH, order }) {
    const c = curves[curve], h = 10 ** logH;
    const err = step => Math.abs(c.f(x0 + step) - taylor(c, x0, step, order));
    const e1 = err(h), e2 = err(h / 10), ratio = e2 > 1e-14 ? e1 / e2 : 0;
    const approxXs = grid(Math.max(-2.2, x0 - 1.7), Math.min(2.2, x0 + 1.7), 121);
    const flat = Math.abs(c.d2(x0)) < 0.05;
    const explanation = order === 1
      ? (flat
        ? `此处 f''(x₀) ≈ ${f3(c.d2(x0))}，几乎是拐点：误差的 h² 项消失，按 h³ 缩小，所以缩小倍数接近 1000。`
        : `一阶误差 ≈ ½|f''(x₀)|·h²，这里 f''(x₀) = ${f2(c.d2(x0))}：步长缩小 10 倍，误差缩小约 100 倍。f'' 越大，曲线弯得越快，切线越早离开曲线。`)
      : Math.abs(c.d3(x0)) < 0.5
        ? `二阶近似把弯曲也算进去了。这里 f'''(x₀) = ${f2(c.d3(x0))} 几乎为 0，h³ 项也很小，误差主要来自 h⁴ 项，所以缩小倍数超过 1000。`
        : `二阶近似把弯曲也算进去了，误差 ≈ |f'''(x₀)|·h³/6，这里 f'''(x₀) = ${f2(c.d3(x0))}：步长缩小 10 倍，误差缩小约 1000 倍。`;
    return {
      type: "lines", xLabel: "x", yLabel: "f(x)", domainX: [-2.2, 2.2], domainY: c.y,
      series: [
        { label: c.label, points: grid(-2.2, 2.2, 241).map(x => [x, c.f(x)]) },
        { label: order === 1 ? "切线：f(x₀) + f'(x₀)·h" : "二阶近似", points: approxXs.map(x => [x, taylor(c, x0, x - x0, order)]) },
      ],
      markers: [{ x: x0, label: "x₀" }],
      point: { x: x0 + h, y: c.f(x0 + h), label: "f(x₀ + h)" },
      readout: `${order === 1 ? "一阶" : "二阶"}近似在 h = ${h.toFixed(3)} 处误差 ${sci(e1)}；h 再缩小到 1/10，误差缩小约 ${ratio ? Math.round(ratio) : "—"} 倍`,
      explanation,
    };
  },
};

const activations = {
  tanh: { label: "tanh", f: z => Math.tanh(z), d: z => 1 - Math.tanh(z) ** 2, dText: "1 − a²" },
  sigmoid: { label: "sigmoid", f: z => 1 / (1 + Math.exp(-z)), d: z => { const s = 1 / (1 + Math.exp(-z)); return s * (1 - s); }, dText: "a(1 − a)" },
  relu: { label: "ReLU", f: z => Math.max(0, z), d: z => (z > 0 ? 1 : 0), dText: "z > 0 ? 1 : 0" },
};
const stages = ["只看图", "前向 ① m = w·x", "前向 ② z = m + b", "前向 ③ a = σ(z)", "前向 ④ L = ½(a − y)²",
  "反向 ① ∂L/∂a", "反向 ② ∂L/∂z", "反向 ③ ∂L/∂w、∂L/∂b、∂L/∂x"];
const X_IN = 1.5, Y_TARGET = 0.8;
const g3 = v => (v !== 0 && Math.abs(v) < 1e-3 ? sci(v) : f3(v));
function neuron(w, b, act) {
  const m = w * X_IN, z = m + b, a = act.f(z), L = 0.5 * (a - Y_TARGET) ** 2;
  const gA = a - Y_TARGET, gZ = gA * act.d(z);
  return { m, z, a, L, gA, gZ, gW: gZ * X_IN, gB: gZ, gX: gZ * w };
}
const computationGraph = {
  title: "计算图回放：一个神经元的前向与反向",
  question: "输入 x = 1.5、目标 y = 0.8。拖动阶段滑杆，先一步步算出 loss，再从 loss 往回，把每条边上的局部导数连乘起来。",
  controls: [
    { key: "stage", label: "阶段", min: 0, max: 7, step: 1, initial: 4, format: v => stages[v] },
    { key: "w", label: "权重 w", min: -2, max: 2, step: 0.05, initial: 0.7, format: v => v.toFixed(2) },
    { key: "b", label: "偏置 b", min: -2, max: 2, step: 0.05, initial: -0.2, format: v => v.toFixed(2) },
    { key: "act", label: "激活函数", initial: "tanh", options: Object.entries(activations).map(([value, a]) => ({ value, label: a.label })) },
  ],
  presets: [
    { label: "走完反向", values: { stage: 7, w: 0.7, b: -0.2, act: "tanh" } },
    { label: "tanh 饱和", values: { stage: 7, w: 2, b: 1.5, act: "tanh" } },
    { label: "ReLU 死区", values: { stage: 7, w: -1, b: -0.5, act: "relu" } },
  ],
  check: {
    question: "为什么反向传播必须保留前向时的中间结果？在这张图里具体要存哪些量？",
    answer: "每条边的局部导数都要用到前向的值：∂a/∂z 要用 z（或 a），∂m/∂w 要用 x，∂m/∂x 要用 w，∂L/∂a 要用 a。所以训练时要把这些激活存在显存里，等反向用完才能释放。activation checkpointing 只存一部分，反向时重算其余的，用算力换显存（→ 5.1）。",
  },
  evaluate({ stage, w, b, act }) {
    const A = activations[act], v = neuron(w, b, A);
    const h = 1e-5, numeric = (neuron(w + h, b, A).L - neuron(w - h, b, A).L) / (2 * h);
    const on = k => stage >= k, cur = k => (stage === k ? " is-current" : "");
    const fwd = (x, y, value, k) => on(k) ? text(x, y, value, "lab-fig-forward", "middle") : "";
    const bwd = (x, y, value, k, anchor = "middle") => on(k) ? text(x, y, value, "lab-fig-backward", anchor) : "";
    const edge = (x1, y1, x2, y2, k) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="lab-fig-edge${on(k) ? " is-back" : ""}" marker-end="url(#cg-arrow)"/>`;
    const box = (cx, cy, w0, label, value, k) => `<g class="lab-fig-node${cur(k)}"><rect x="${cx - w0 / 2}" y="${cy - 20}" width="${w0}" height="40" rx="12"/>
      ${text(cx, value ? cy - 3 : cy + 4, label, "lab-fig-label", "middle")}${value ? text(cx, cy + 13, value, "lab-fig-value", "middle") : ""}</g>`;
    const op = (cx, cy, label, k) => `<g class="lab-fig-node${cur(k)}"><circle cx="${cx}" cy="${cy}" r="20"/>${text(cx, cy + 5, label, "lab-fig-op", "middle")}</g>`;
    const body = `<defs><marker id="cg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="lab-fig-arrowhead"/></marker></defs>
      ${edge(100, 130, 168, 130, 7)}${edge(210, 130, 298, 130, 7)}${edge(340, 130, 406, 130, 6)}${edge(494, 130, 548, 130, 5)}
      ${edge(190, 60, 190, 108, 99)}${edge(320, 60, 320, 108, 7)}${edge(585, 60, 585, 108, 99)}
      ${box(190, 40, 76, "x = 1.5", "", 99)}${box(320, 40, 76, `b = ${f2(b)}`, "", 99)}${box(585, 40, 70, "y = 0.8", "", 99)}
      ${box(60, 130, 80, `w = ${f2(w)}`, "", 7)}${op(190, 130, "×", 1)}${op(320, 130, "+", 2)}
      ${box(450, 130, 88, A.label, on(3) ? `a = ${f3(v.a)}` : "", 3)}${box(585, 130, 70, "L", on(4) ? f3(v.L) : "", 4)}
      ${fwd(255, 120, `m = ${f2(v.m)}`, 1)}${fwd(373, 120, `z = ${f2(v.z)}`, 2)}
      ${bwd(521, 152, `∂L/∂a = ${g3(v.gA)}`, 5)}${bwd(373, 152, `∂L/∂z = ${g3(v.gZ)}`, 6)}
      ${bwd(255, 152, `∂L/∂m = ${g3(v.gZ)}`, 7)}${bwd(134, 152, `∂L/∂w = ${g3(v.gW)}`, 7)}
      ${bwd(200, 88, `∂L/∂x = ${g3(v.gX)}`, 7, "start")}${bwd(330, 88, `∂L/∂b = ${g3(v.gB)}`, 7, "start")}
      ${text(20, 196, `局部导数：∂m/∂w = x　∂z/∂m = 1　∂a/∂z = ${A.dText}　∂L/∂a = a − y`, "lab-fig-note")}
      ${text(20, 216, on(5) ? "反向要用到的缓存：x、w、z（或 a）、a" : "前向时把 x、w、z、a 记下来，反向会用到", "lab-fig-note")}`;
    const readout = stage < 5
      ? (stage === 0 ? "从左往右是前向：输入经过乘、加、激活，得到 loss" : `前向到第 ${stage} 步：m = ${f2(v.m)}，z = ${f2(v.z)}${stage >= 3 ? `，a = ${f3(v.a)}` : ""}${stage >= 4 ? `，L = ${f3(v.L)}` : ""}`)
      : `反向：∂L/∂w = ${g3(v.gW)}（数值差分 ${g3(numeric)}），∂L/∂b = ${g3(v.gB)}`;
    const dz = A.d(v.z);
    const explanation = stage < 5
      ? "每个节点只做一件简单的事。前向算出的 m、z、a 要先存起来：反向时每条边的局部导数都要用到它们。"
      : dz < 0.05
        ? `激活函数在 z = ${f2(v.z)} 处的导数只有 ${f3(dz)}：再大的 ∂L/∂a 乘上它也几乎归零，梯度传不回去。这就是饱和与"死神经元"，深网络里层层相乘，就是梯度消失。`
        : `链式法则：∂L/∂w = ∂L/∂a · ∂a/∂z · ∂z/∂m · ∂m/∂w = ${g3(v.gA)} × ${f3(dz)} × 1 × ${X_IN}。反向从 loss 出发只走一遍，就把所有参数的梯度都求出来了。`;
    return { type: "svg", svg: figure(640, 228, "单个神经元的计算图，标出前向值与反向梯度", body), readout, explanation };
  },
};

/* ---------- 0.3 Probability ---------- */
const detector = {
  title: "贝叶斯检测器：报警了，就真是 AI 写的吗？",
  question: "一个 AI 文本检测器的检出率和误报率看起来都不错。调整基率（待检文本里 AI 写的比例），看报警的那些文本里，真是 AI 写的占多少。",
  controls: [
    { key: "logBase", label: "基率（AI 写的比例）", min: -3, max: -0.3, step: 0.05, initial: -2, format: v => (10 ** v * 100).toFixed(10 ** v < 0.01 ? 2 : 1) + "%" },
    { key: "tpr", label: "检出率（AI 文本被抓到）", min: 0.5, max: 0.995, step: 0.005, initial: 0.95, format: v => (v * 100).toFixed(1) + "%" },
    { key: "fpr", label: "误报率（人写的被误判）", min: 0.005, max: 0.2, step: 0.005, initial: 0.05, format: v => (v * 100).toFixed(1) + "%" },
  ],
  presets: [
    { label: "论文抽查：基率 1%", values: { logBase: -2, tpr: 0.95, fpr: 0.05 } },
    { label: "作业批改：基率 20%", values: { logBase: -0.7, tpr: 0.95, fpr: 0.05 } },
    { label: "调严阈值：误报 1%", values: { logBase: -2, tpr: 0.8, fpr: 0.01 } },
  ],
  check: {
    question: "检出率和误报率都是 95% / 5%，基率 1% 时报警的可信度只有约 16%。要把它提高到 50% 左右，改哪个参数最有效？",
    answer: "后验 = p·TPR ÷ (p·TPR + (1 − p)·FPR)。基率低时分母被 (1 − p)·FPR 主导，所以要压误报率：FPR 降到 1% 时后验约 49%，降到 0.5% 时约 66%。把检出率从 95% 提到 99%，后验只从 16.1% 变成 16.7%。",
  },
  evaluate({ logBase, tpr, fpr }) {
    const p = 10 ** logBase, post = p * tpr / (p * tpr + (1 - p) * fpr);
    const miss = p * (1 - tpr) / (p * (1 - tpr) + (1 - p) * (1 - fpr));
    const pos = Math.round(1000 * p), tp = Math.round(pos * tpr), fp = Math.round((1000 - pos) * fpr);
    const kinds = Array.from({ length: 1000 }, (_, i) => i < tp ? "tp" : i < pos ? "fn" : i < pos + fp ? "fp" : "tn");
    const dots = kinds.map((kind, i) => `<circle cx="${xy(20 + (i % 50) * 9)}" cy="${xy(44 + Math.floor(i / 50) * 9)}" r="3.2" class="lab-dot-${kind}"/>`).join("");
    const barTop = 44, barH = 171, tpH = barH * post;
    const body = `${text(16, 24, "1000 篇待检文本", "lab-fig-title")}${dots}
      ${text(500, 24, "报警的文本里", "lab-fig-title")}
      <rect x="500" y="${barTop}" width="44" height="${barH}" rx="10" class="lab-bar-fp"/>
      <rect x="500" y="${xy(barTop + barH - tpH)}" width="44" height="${xy(Math.max(tpH, 0.01))}" rx="10" class="lab-bar-tp"/>
      ${text(556, xy(barTop + barH - tpH / 2 + 4), `真 AI ${pct(post)}`, "lab-fig-value")}
      ${text(556, xy(barTop + (barH - tpH) / 2 + 4), `误报 ${pct(1 - post)}`, "lab-fig-note")}
      <g class="lab-fig-note">
        <circle cx="22" cy="242" r="4" class="lab-dot-tp"/>${text(32, 246, `AI 写、被抓到 ${tp}`)}
        <circle cx="152" cy="242" r="4" class="lab-dot-fn"/>${text(162, 246, `AI 写、漏掉 ${pos - tp}`)}
        <circle cx="282" cy="242" r="4" class="lab-dot-fp"/>${text(292, 246, `人写、误报 ${fp}`)}
        <circle cx="412" cy="242" r="4" class="lab-dot-tn"/>${text(422, 246, `人写、放过 ${1000 - pos - fp}`)}
      </g>`;
    return {
      type: "svg", svg: figure(640, 256, "1000 篇文本的检测结果点阵与报警样本构成", body),
      readout: `检测器报警时，真是 AI 写的概率：${pct(post)}`,
      explanation: `1000 篇里约 ${pos} 篇是 AI 写的，抓到 ${tp} 篇；另有 ${fp} 篇人写的被误报。报警的 ${tp + fp} 篇里，真阳性只占约 ${pct(post, 0)}。基率越低，(1 − p)·误报率 这一项越会淹没真阳性。反过来，没报警的文本里仍有 ${pct(miss, 2)} 是 AI 写的。`,
    };
  },
};

function binomialPmf(n, p) {
  const base = lgamma(n + 1), lp = Math.log(p), lq = Math.log(1 - p);
  return k => Math.exp(base - lgamma(k + 1) - lgamma(n - k + 1) + k * lp + (n - k) * lq);
}
const errorBars = {
  title: "评测误差棒：多少道题才够分出高下？",
  question: "一个模型在某个基准上的真实正确率是 p，我们只能用 n 道题去估它。看看测出来的分数会在多大范围里浮动。",
  controls: [
    { key: "logN", label: "题目数 n", min: 1, max: 3.5, step: 0.01, initial: 2, format: v => String(Math.round(10 ** v)) },
    { key: "p", label: "真实正确率 p", min: 0.05, max: 0.95, step: 0.01, initial: 0.7, format: v => (v * 100).toFixed(0) + "%" },
  ],
  presets: [
    { label: "AIME：30 题", values: { logN: 1.48, p: 0.7 } },
    { label: "100 题的小基准", values: { logN: 2, p: 0.7 } },
    { label: "GSM8K 量级：≈1300 题", values: { logN: 3.12, p: 0.85 } },
  ],
  check: {
    question: "AIME 只有 30 题。一个模型正确率 70%，95% 误差棒大约多宽？两个模型相差 10 个百分点，能说明谁更强吗？",
    answer: "σ = √(0.7 × 0.3 / 30) ≈ 0.084，95% 区间约 ±16 个百分点。两个模型各自独立评测，差值的标准误约 √2 × 0.084 ≈ 0.12，10 个百分点远不显著。同一套题上做配对比较能缩小方差，但 30 题仍然太少（→ 5.4）。",
  },
  evaluate({ logN, p }) {
    const n = Math.max(2, Math.round(10 ** logN)), sd = Math.sqrt(p * (1 - p) / n);
    const lo = Math.max(0, p - 4.5 * sd), hi = Math.min(1, p + 4.5 * sd);
    const pmf = binomialPmf(n, p), points = [];
    for (let k = Math.ceil(lo * n); k <= Math.floor(hi * n); k++) points.push([k / n * 100, pmf(k)]);
    const normal = grid(lo, hi, 201).map(a => [a * 100, normalPdf(a, p, sd) / n]);
    const top = Math.max(...points.map(q => q[1]), ...normal.map(q => q[1]));
    const half = 1.96 * sd, needed = Math.ceil(2 * p * (1 - p) * (1.96 / 0.02) ** 2);
    return {
      type: "lines", xLabel: "测得的正确率（%）", yLabel: "每个分数出现的概率", domainX: [lo * 100, hi * 100], domainY: [0, top * 1.15],
      series: [{ label: "精确分布（二项）", points }, { label: "正态近似", points: normal }],
      markers: [{ x: Math.max(lo, p - half) * 100, label: "−1.96σ" }, { x: Math.min(hi, p + half) * 100, label: "+1.96σ" }],
      readout: `${n} 道题、真实正确率 ${pct(p, 0)}：95% 区间约 ±${(half * 100).toFixed(1)} 个百分点`,
      explanation: `标准误 σ = √(p(1 − p)/n) = ${(sd * 100).toFixed(2)} 个百分点，随 1/√n 缩小：题目数翻 4 倍，误差棒才缩一半。两个模型各自独立评测时，要稳定分辨 2 个百分点的差距，约需要 ${needed.toLocaleString("en-US")} 道题。`,
    };
  },
};

/* ---------- 0.4 Gaussian ---------- */
const cloud = (() => { const z = normals(7); return Array.from({ length: 260 }, () => [z(), z()]); })();
const covariance = {
  title: "协方差椭圆：Σ 的特征向量就是主轴",
  question: "同一批标准正态噪声 ε，经过 x = Lε 变成相关的二维高斯。调两个标准差和相关系数，看样本云、等高线椭圆和主轴怎么变。",
  controls: [
    { key: "s1", label: "σ₁", min: 0.3, max: 2, step: 0.05, initial: 1.4, format: v => v.toFixed(2) },
    { key: "s2", label: "σ₂", min: 0.3, max: 2, step: 0.05, initial: 0.7, format: v => v.toFixed(2) },
    { key: "rho", label: "相关系数 ρ", min: -0.95, max: 0.95, step: 0.05, initial: 0.6, format: v => v.toFixed(2) },
    { key: "cond", label: "条件分布", initial: "on", options: [{ value: "off", label: "不看" }, { value: "on", label: "固定 x₁ = 1" }] },
  ],
  presets: [
    { label: "独立同方差：圆", values: { s1: 1, s2: 1, rho: 0 } },
    { label: "强相关 ρ = 0.9", values: { s1: 1.2, s2: 1.2, rho: 0.9 } },
    { label: "负相关", values: { s1: 1.4, s2: 0.9, rho: -0.7 } },
  ],
  check: {
    question: "ρ = 0 但 σ₁ ≠ σ₂ 时，主轴朝哪？为什么 ρ 一变，主轴就会转？",
    answer: "ρ = 0 时 Σ 是对角阵，特征向量就是坐标轴，主轴沿方差大的那一轴。ρ ≠ 0 时非对角元 ρσ₁σ₂ 把特征向量转开，转角满足 tan 2θ = 2ρσ₁σ₂ / (σ₁² − σ₂²)。σ₁ = σ₂ 时，只要 ρ ≠ 0，主轴就在 ±45° 方向。",
  },
  evaluate({ s1, s2, rho, cond }) {
    const a = s1 * s1, b = rho * s1 * s2, c = s2 * s2;
    const mid = (a + c) / 2, rad = Math.sqrt(((a - c) / 2) ** 2 + b * b), l1 = mid + rad, l2 = mid - rad;
    const theta = 0.5 * Math.atan2(2 * b, a - c), e1 = [Math.cos(theta), Math.sin(theta)], e2 = [-Math.sin(theta), Math.cos(theta)];
    const L21 = rho * s2, L22 = s2 * Math.sqrt(1 - rho * rho);
    const S = 36, ox = 170, oy = 172, px = x => xy(ox + x * S), py = y => xy(oy - y * S);
    const inside = ([x, y]) => Math.abs(x) <= 4.4 && Math.abs(y) <= 4.4;
    const dots = cloud.map(([u, v]) => [s1 * u, L21 * u + L22 * v]).filter(inside)
      .map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="2.1" class="lab-fig-sample"/>`).join("");
    const ring = k => "M" + grid(0, 2 * Math.PI, 97).map(t => {
      const x = k * (Math.sqrt(l1) * Math.cos(t) * e1[0] + Math.sqrt(l2) * Math.sin(t) * e2[0]);
      const y = k * (Math.sqrt(l1) * Math.cos(t) * e1[1] + Math.sqrt(l2) * Math.sin(t) * e2[1]);
      return `${px(x)} ${py(y)}`;
    }).join(" L") + "Z";
    const axis = (e, l) => `<path d="M${px(0)} ${py(0)} L${px(e[0] * Math.sqrt(l))} ${py(e[1] * Math.sqrt(l))}" class="lab-fig-axis-vec" marker-end="url(#cov-arrow)"/>`;
    const cm = rho * s2 / s1, csd = s2 * Math.sqrt(1 - rho * rho);
    const condition = cond === "on" ? `<path d="M${px(1)} ${py(4.4)} V${py(-4.4)}" class="lab-fig-cond-line"/>
      <path d="M${px(1)} ${py(clamp(cm - 2 * csd, -4.4, 4.4))} V${py(clamp(cm + 2 * csd, -4.4, 4.4))}" class="lab-fig-cond-band"/>
      <circle cx="${px(1)}" cy="${py(clamp(cm, -4.4, 4.4))}" r="4.5" class="lab-fig-cond-dot"/>` : "";
    const deg = theta * 180 / Math.PI;
    const body = `<defs><marker id="cov-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="lab-fig-axis-head"/></marker></defs>
      <rect x="${px(-4.4)}" y="${py(4.4)}" width="${xy(8.8 * S)}" height="${xy(8.8 * S)}" rx="14" class="lab-fig-plane"/>
      <path d="M${px(-4.4)} ${py(0)} H${px(4.4)} M${px(0)} ${py(-4.4)} V${py(4.4)}" class="lab-fig-gridline"/>
      ${text(px(4.3), py(0) - 6, "x₁", "lab-fig-note", "end")}${text(px(0) + 6, py(4.2), "x₂", "lab-fig-note")}
      ${dots}<path d="${ring(2)}" class="lab-fig-ring lab-fig-ring-2"/><path d="${ring(1)}" class="lab-fig-ring"/>
      ${axis(e1, l1)}${axis(e2, l2)}${condition}
      <g transform="translate(372 30)">
        ${text(0, 0, "协方差矩阵 Σ", "lab-fig-title")}
        ${text(0, 28, `⎡ ${f2(a).padStart(5)}   ${f2(b).padStart(5)} ⎤`, "lab-fig-mono")}
        ${text(0, 48, `⎣ ${f2(b).padStart(5)}   ${f2(c).padStart(5)} ⎦`, "lab-fig-mono")}
        ${text(0, 84, `特征值 λ₁ = ${f2(l1)}　λ₂ = ${f2(l2)}`, "lab-fig-value")}
        ${text(0, 106, `主轴方向 θ = ${deg.toFixed(1)}°`, "lab-fig-note")}
        ${text(0, 126, `半轴长 √λ₁ = ${f2(Math.sqrt(l1))}，√λ₂ = ${f2(Math.sqrt(l2))}`, "lab-fig-note")}
        ${text(0, 146, `det Σ = ${f3(a * c - b * b)}（椭圆面积 ∝ √det）`, "lab-fig-note")}
        ${cond === "on" ? `${text(0, 184, "x₂ | x₁ = 1 仍是高斯", "lab-fig-title")}
        ${text(0, 206, `均值 ρσ₂/σ₁ = ${f2(cm)}`, "lab-fig-value")}${text(0, 226, `标准差 σ₂√(1 − ρ²) = ${f2(csd)}（原来 ${f2(s2)}）`, "lab-fig-note")}` : ""}
        ${text(0, 270, "实线：1σ 等高线　虚线：2σ", "lab-fig-note")}
      </g>`;
    return {
      type: "svg", svg: figure(640, 344, "二维高斯的样本、等高线椭圆与主轴", body),
      readout: `λ₁ = ${f2(l1)}，λ₂ = ${f2(l2)}，主轴与 x₁ 轴夹角 ${deg.toFixed(1)}°`,
      explanation: `椭圆的主轴是 Σ 的特征向量，半轴长是 √λ。ρ 越接近 ±1，λ₂ 越接近 0，椭圆压扁成一条线：两个变量几乎线性相关，Σ 接近奇异。${cond === "on" ? `固定 x₁ = 1 后，x₂ 的均值移到 ${f2(cm)}，标准差从 ${f2(s2)} 缩到 ${f2(csd)}：知道 x₁ 让你对 x₂ 更有把握。` : ""}`,
    };
  },
};

const LINEAR_LOG_ALPHA = (() => {
  const T = 1000, out = [0];
  for (let i = 1; i <= T; i++) out.push(out[i - 1] + Math.log(1 - (1e-4 + (0.02 - 1e-4) * (i - 1) / (T - 1))));
  return out;
})();
const schedules = {
  linear: { label: "线性 β（DDPM）", alphaBar: t => Math.exp(LINEAR_LOG_ALPHA[Math.round(t * 1000)]) },
  cosine: {
    label: "余弦（Improved DDPM）",
    alphaBar: t => { const f = u => Math.cos((u + 0.008) / 1.008 * Math.PI / 2) ** 2; return clamp(f(t) / f(0), 0, 1); },
  },
};
const MODES = [[-2, 0.5], [2, 0.5]], MODE_SD = 0.3;
const noised = (x, ab) => MODES.reduce((s, [m, w]) => s + w * normalPdf(x, Math.sqrt(ab) * m, Math.sqrt(ab * MODE_SD ** 2 + (1 - ab))), 0);
const forwardNoise = {
  title: "前向加噪：数据分布怎样被噪声吞没？",
  question: "数据是两个窄峰。按 x_t = √ᾱ_t·x₀ + √(1 − ᾱ_t)·ε 加噪，拖动时间 t，比较两种噪声调度下分布何时变得分不清。",
  controls: [
    { key: "t", label: "时间 t", min: 0, max: 1, step: 0.01, initial: 0.3, format: v => v.toFixed(2) },
    { key: "schedule", label: "噪声调度", initial: "linear", options: Object.entries(schedules).map(([value, s]) => ({ value, label: s.label })) },
  ],
  presets: [
    { label: "t = 0.15", values: { t: 0.15 } },
    { label: "线性：t = 0.5", values: { t: 0.5, schedule: "linear" } },
    { label: "余弦：t = 0.5", values: { t: 0.5, schedule: "cosine" } },
  ],
  check: {
    question: "为什么可以一步写出 q(x_t | x₀)，而不必一步步加噪？",
    answer: "每一步 x_t = √(1 − β_t)·x_{t−1} + √β_t·ε_t。高斯的线性组合仍是高斯：把 t 步展开，均值系数相乘得 √ᾱ_t，各步独立噪声的方差相加得 1 − ᾱ_t，其中 ᾱ_t = ∏(1 − β_s)。所以 x_t = √ᾱ_t·x₀ + √(1 − ᾱ_t)·ε，训练时可以随机抽 t、一步造出样本。",
  },
  evaluate({ t, schedule }) {
    const ab = clamp(schedules[schedule].alphaBar(t), 1e-8, 1), other = schedule === "linear" ? "cosine" : "linear";
    const abOther = clamp(schedules[other].alphaBar(t), 1e-8, 1);
    const xs = grid(-4.5, 4.5, 361), cur = xs.map(x => [x, noised(x, ab)]);
    const valley = noised(0, ab) / Math.max(...cur.map(p => p[1]));
    return {
      type: "lines", xLabel: "x", yLabel: "密度", domainX: [-4.5, 4.5], domainY: [0, 1.4],
      series: [
        { label: "数据 q(x₀)", points: xs.map(x => [x, noised(x, 1)]) },
        { label: `t = ${t.toFixed(2)} 时的 q(x_t)`, points: cur },
        { label: "标准正态 N(0, 1)", points: xs.map(x => [x, normalPdf(x)]) },
      ],
      readout: t === 0 ? "t = 0：还没有加噪，分布就是数据本身" : `√ᾱ = ${f3(Math.sqrt(ab))}，√(1 − ᾱ) = ${f3(Math.sqrt(1 - ab))}，信噪比 ᾱ/(1 − ᾱ) = ${sci(ab / (1 - ab))}`,
      explanation: `同一时刻，${schedules[schedule].label}的 ᾱ = ${sci(ab)}，${schedules[other].label}的 ᾱ = ${sci(abOther)}。两峰之间谷底与峰顶的密度比是 ${f2(valley)}：越接近 1，两类数据越分不开。线性调度在中段就把信号几乎抹掉，余弦调度让信噪比下降得更均匀，后半段仍有可学的信号。`,
    };
  },
};

/* ---------- 0.5 Information theory ---------- */
const S_MODE = 0.6;
function bimodal(d, w) {
  const comps = [[-d / 2, 1 - w], [d / 2, w]];
  return x => logSumExp(comps.map(([m, wk]) => Math.log(wk) - 0.5 * Math.log(2 * Math.PI * S_MODE * S_MODE) - (x - m) ** 2 / (2 * S_MODE * S_MODE)));
}
const U = grid(-6, 6, 121), PHI = U.map(u => normalPdf(u) * 0.1);
function reverseObjective(logP, mu, sigma) {
  let e = 0;
  for (let i = 0; i < U.length; i++) e += PHI[i] * logP(mu + sigma * U[i]);
  return -0.5 * Math.log(2 * Math.PI * Math.E * sigma * sigma) - e;
}
function fitReverse(logP) {
  let best = [0, 1, Infinity];
  for (let mu = -4; mu <= 4.0001; mu += 0.2) for (let s = 0.2; s <= 3.5001; s += 0.1) {
    const j = reverseObjective(logP, mu, s);
    if (j < best[2] - 1e-12) best = [mu, s, j];
  }
  const [m0, s0] = best;
  for (let mu = m0 - 0.2; mu <= m0 + 0.2001; mu += 0.01) for (let s = Math.max(0.15, s0 - 0.1); s <= s0 + 0.1001; s += 0.005) {
    const j = reverseObjective(logP, mu, s);
    if (j < best[2]) best = [mu, s, j];
  }
  return best;
}
const XS_KL = grid(-12, 12, 2401);
function forwardKl(logP, mu, s) {
  let kl = 0;
  for (const x of XS_KL) {
    const lp = logP(x), lq = -0.5 * Math.log(2 * Math.PI * s * s) - (x - mu) ** 2 / (2 * s * s);
    kl += Math.exp(lp) * (lp - lq) * 0.01;
  }
  return kl;
}
const klDirections = {
  title: "前向 KL 与反向 KL：用一个高斯去拟合双峰",
  question: "目标是两个高斯峰的混合。只允许用一个高斯 q 去近似它：分别最小化 KL(p‖q) 和 KL(q‖p)，看两种拟合差在哪里。",
  controls: [
    { key: "d", label: "两峰间距 d", min: 0, max: 6, step: 0.1, initial: 4, format: v => v.toFixed(1) },
    { key: "w", label: "右峰权重", min: 0.1, max: 0.9, step: 0.05, initial: 0.6, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "两峰重叠 d = 1.5", values: { d: 1.5, w: 0.6 } },
    { label: "分得很开 d = 5", values: { d: 5, w: 0.6 } },
    { label: "一大一小", values: { d: 4, w: 0.85 } },
  ],
  check: {
    question: "为什么两峰分开时，反向 KL 拟合只抓一个峰，而且偏向大的那个？",
    answer: "KL(q‖p) = E_q[log q − log p]，只在 q 有质量的地方计分。q 把质量放在两峰之间的低谷里，log p 极小，代价巨大；缩进一个峰里，q 几乎处处落在 p 的高密度区，代价小。两个峰各是一个局部最优，权重大的那个 log p 更高，所以全局最优落在它上面。",
  },
  evaluate({ d, w }) {
    const logP = bimodal(d, w);
    const muF = (2 * w - 1) * d / 2, sF = Math.sqrt(S_MODE * S_MODE + d * d / 4 - muF * muF);
    const [muR, sR, jR] = fitReverse(logP);
    const klF = forwardKl(logP, muF, sF), klFR = forwardKl(logP, muR, sR), jF = reverseObjective(logP, muF, sF);
    const xs = grid(-6, 6, 241), p = xs.map(x => [x, Math.exp(logP(x))]);
    const qF = xs.map(x => [x, normalPdf(x, muF, sF)]), qR = xs.map(x => [x, normalPdf(x, muR, sR)]);
    const top = Math.max(...p.map(v => v[1]), ...qF.map(v => v[1]), ...qR.map(v => v[1]));
    const seeking = sR < 0.75 * sF;
    return {
      type: "lines", xLabel: "x", yLabel: "密度", domainX: [-6, 6], domainY: [0, top * 1.12],
      series: [{ label: "目标 p", points: p }, { label: "最小化 KL(p‖q)", points: qF }, { label: "最小化 KL(q‖p)", points: qR }],
      readout: `KL(p‖q) 拟合：N(${f2(muF)}, ${f2(sF)}²)；KL(q‖p) 拟合：N(${f2(muR)}, ${f2(sR)}²)，${seeking ? "只抓住一个峰" : "同样盖住整个分布"}`,
      explanation: `前向拟合等于矩匹配：均值、方差与 p 一致，宁可把质量摊到低谷里也不漏掉任何一个峰（KL(p‖q) = ${f3(klF)}，但 KL(q‖p) = ${f3(jF)}）。反向拟合${seeking ? "缩进一个峰" : "与前向相近"}（KL(q‖p) = ${f3(jR)}，KL(p‖q) = ${f3(klFR)}）。最大似然和 SFT 最小化前向 KL；RLHF 里拴住策略的 KL 惩罚是反向的（→ 2.1、2.2）。`,
    };
  },
};

const VOCAB = [["好", 3.2], ["热", 2.6], ["冷", 2.1], ["不错", 1.7], ["晴朗", 1.2], ["闷", 0.4], ["奇怪", -0.5], ["蓝", -1.8]];
const temperature = {
  title: "温度与熵：困惑度是“等效候选数”",
  question: "模型读到“今天天气很”，给 8 个候选词打出 logits。调温度，看概率、熵和困惑度怎么变；再选一个真实的下一个词，看交叉熵。",
  controls: [
    { key: "logT", label: "温度 T", min: -1, max: 0.7, step: 0.02, initial: 0, format: v => (10 ** v).toFixed(2) },
    { key: "truth", label: "真实的下一个词", initial: "热", options: [{ value: "热", label: "热" }, { value: "晴朗", label: "晴朗" }, { value: "蓝", label: "蓝" }] },
  ],
  presets: [
    { label: "T = 0.3：很尖", values: { logT: -0.52 } },
    { label: "T = 1：原始分布", values: { logT: 0 } },
    { label: "T = 3：很平", values: { logT: 0.48 } },
  ],
  check: {
    question: "温度 T 会改变候选词的排序吗？为什么 T 很小时“猜错”的代价反而更大？",
    answer: "不改变排序：softmax(z/T) 对所有 logit 做同一个单调缩放。T 越小分布越尖，概率集中在最大的那个词上，其余词的概率按 e^{−Δz/T} 衰减；一旦真实词不是最大的那个，−log p ≈ Δz/T，随 1/T 线性增长。知识蒸馏用较高温度去看老师的“暗知识”，也是这个道理（→ 2.1）。",
  },
  evaluate({ logT, truth }) {
    const T = 10 ** logT, z = VOCAB.map(([, l]) => l / T), lse = logSumExp(z), probs = z.map(v => Math.exp(v - lse));
    const H = -probs.reduce((s, p) => s + (p > 0 ? p * Math.log(p) : 0), 0), ppl = Math.exp(H);
    const ce = -(z[VOCAB.findIndex(([w]) => w === truth)] - lse);
    return {
      type: "bars", unit: "%", maxValue: 100,
      rows: VOCAB.map(([word], i) => ({ label: word, value: probs[i] * 100, display: pct(probs[i]) })),
      reference: { label: "均匀分布", value: 100 / VOCAB.length },
      readout: `T = ${T.toFixed(2)}：熵 ${f2(H)} nats，困惑度 ${f2(ppl)}，相当于在约 ${f2(ppl)} 个词里均匀地猜`,
      explanation: `若真实的下一个词是“${truth}”，交叉熵 −log p = ${f2(ce)} nats。T → 0 时分布退化成只选“好”，熵 → 0，可一旦猜错，交叉熵会随 1/T 增长；T 很大时分布趋向均匀，困惑度趋向 ${VOCAB.length}。训练 loss 就是这个交叉熵在所有位置上的平均，e^loss 就是困惑度。`,
    };
  },
};

/* ---------- 0.7 Sampling ---------- */
const TARGET = [[0.7, -2, 0.5], [0.3, 2.5, 0.6]];
function score(x, sigma2) {
  const parts = TARGET.map(([w, m, s]) => { const v = s * s + sigma2; return [Math.log(w) - 0.5 * Math.log(v) - (x - m) ** 2 / (2 * v), -(x - m) / v]; });
  const l = logSumExp(parts.map(p => p[0]));
  return parts.reduce((g, [lw, d]) => g + Math.exp(lw - l) * d, 0);
}
const targetPdf = x => TARGET.reduce((s, [w, m, sd]) => s + w * normalPdf(x, m, sd), 0);
const N_PARTICLES = 600, LEVELS = grid(0, 1, 10).map(u => 3 * (0.05 / 3) ** u);
const langevin = {
  title: "Langevin 采样：粒子只靠 score 能找到两个峰吗？",
  question: "目标分布有两个峰（70% 在左、30% 在右）。粒子每步沿 score ∇log p 走一小步，再加一点噪声。比较普通 Langevin 和多噪声级的退火 Langevin。",
  controls: [
    { key: "sampler", label: "采样器", initial: "plain", options: [{ value: "plain", label: "普通 Langevin" }, { value: "annealed", label: "退火（10 个噪声级）" }] },
    { key: "start", label: "起点", initial: "left", options: [{ value: "left", label: "全部在左峰" }, { value: "uniform", label: "均匀撒开" }] },
    { key: "steps", label: "步数", min: 0, max: 300, step: 10, initial: 200, format: v => `${v} 步` },
    { key: "logEps", label: "步长 ε", min: -2.5, max: -0.5, step: 0.05, initial: -1, format: v => (10 ** v).toFixed(3) },
  ],
  presets: [
    { label: "困在左峰", values: { sampler: "plain", start: "left", steps: 300, logEps: -1 } },
    { label: "均匀撒开", values: { sampler: "plain", start: "uniform", steps: 300, logEps: -1 } },
    { label: "退火 Langevin", values: { sampler: "annealed", start: "left", steps: 300, logEps: -1 } },
  ],
  check: {
    question: "为什么 Langevin 只需要 score ∇log p，而不需要知道 p 的归一化常数？",
    answer: "log p = log p̃ − log Z，Z 与 x 无关，求导后消失：∇log p = ∇log p̃。所以只要能算未归一化密度的梯度，就能采样。扩散模型训练一个网络去近似各个噪声级别下的 score，采样时走的正是退火 Langevin 的连续版本（→ 4.1）。",
  },
  evaluate({ sampler, start, steps, logEps }) {
    const eps = 10 ** logEps, z = normals(1234), init = normals(99), vMin = 0.25;
    const xs = Array.from({ length: N_PARTICLES }, (_, i) => start === "left" ? -2 + 0.3 * init() : -6 + 12 * (i + 0.5) / N_PARTICLES);
    const schedule = sampler === "plain" ? [{ sigma2: 0, n: steps, alpha: eps }]
      : LEVELS.map(s => ({ sigma2: s * s, n: steps / 10, alpha: eps * (vMin + s * s) / vMin }));
    for (const { sigma2, n, alpha } of schedule) for (let k = 0; k < n; k++) {
      const noise = Math.sqrt(2 * alpha);
      for (let i = 0; i < N_PARTICLES; i++) xs[i] = clamp(xs[i] + alpha * score(xs[i], sigma2) + noise * z(), -8, 8);
    }
    const bins = 48, lo = -6, width = 12 / bins, counts = new Array(bins).fill(0);
    for (const x of xs) { const b = Math.floor((x - lo) / width); if (b >= 0 && b < bins) counts[b]++; }
    const share = xs.filter(x => x > 0.4).length / N_PARTICLES;
    const PX = x => xy(40 + (x + 6) / 12 * 580), PY = y => xy(196 - Math.min(y, 0.9) / 0.9 * 170);
    const hist = counts.map((c, i) => { const dens = c / (N_PARTICLES * width), h = 196 - PY(dens);
      return h > 0.2 ? `<rect x="${PX(lo + i * width) + 0.8}" y="${PY(dens)}" width="${xy(580 / bins - 1.6)}" height="${xy(h)}" rx="2" class="lab-fig-hist"/>` : ""; }).join("");
    const curve = "M" + grid(-6, 6, 241).map(x => `${PX(x)} ${PY(targetPdf(x))}`).join(" L");
    const arrows = grid(-5.6, 5.6, 16).map(x => {
      const g = score(x, 0), len = clamp(Math.abs(g) * 5, 3, 16) * Math.sign(g || 1), cx = PX(x);
      return `<path d="M${xy(cx - len / 2)} 252 L${xy(cx + len / 2)} 252" class="lab-fig-field" marker-end="url(#lv-arrow)"/>`;
    }).join("");
    const body = `<defs><marker id="lv-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" class="lab-fig-field-head"/></marker></defs>
      <path d="M40 196 H620" class="lab-fig-gridline"/>${hist}<path d="${curve}" class="lab-fig-curve"/>
      ${[-6, -3, 0, 3, 6].map(x => text(PX(x), 214, String(x), "lab-fig-note", "middle")).join("")}
      ${text(40, 18, `粒子直方图（${N_PARTICLES} 个，${steps} 步后）与目标密度`, "lab-fig-title")}
      ${text(40, 238, "score ∇log p(x)：箭头指向密度更高的地方，长度表示推力大小", "lab-fig-note")}
      <path d="M40 252 H620" class="lab-fig-gridline"/>${arrows}`;
    const verdict = sampler === "annealed"
      ? "大噪声级下两个峰被抹成一个宽峰，粒子先按整体形状散开；噪声逐级减小，它们再分进两个峰，比例接近 70 : 30。扩散模型用多个噪声级别，就是为了这个。"
      : start === "left"
        ? "两峰之间是低密度区，score 在那里把粒子往回推。要跨过去，得靠噪声连续好几步往同一方向推，概率极低，所以粒子几乎全困在左峰。"
        : "均匀撒开时，粒子就近落进离自己最近的峰，比例由起点决定，而不是由目标权重决定：普通 Langevin 在有限步内分不对两个峰的权重。";
    return {
      type: "svg", svg: figure(640, 268, "Langevin 粒子直方图、目标密度与 score 场", body),
      readout: `右峰占比：粒子 ${pct(share)}，目标 30.0%`,
      explanation: steps === 0 ? "还没开始迭代：直方图就是起点的分布。把步数往右拖。" : verdict,
    };
  },
};

const RARE = 2.5, I_RARE = normSf(RARE);
function isSecondMoment(m, s) {
  const a = 1 - 1 / (2 * s * s);
  if (Math.abs(a) < 1e-12 && m > 0) {
    // At s²=1/2 the quadratic term vanishes. The full moment diverges,
    // but on the right half-line exp(-2mx) is integrable for m>0.
    return { tail: s / Math.sqrt(2 * Math.PI) * Math.exp(m*m - 2*m*RARE) / (2*m), all: Infinity };
  }
  if (a <= 1e-12) return { tail: Infinity, all: Infinity };
  const c = -m / (s * s), e = m * m / (2 * s * s), x0 = c / (2 * a);
  const scale = s / Math.sqrt(2 * a) * Math.exp(c * c / (4 * a) + e);
  return { tail: scale * normSf((RARE - x0) * Math.sqrt(2 * a)), all: scale };
}
const importance = {
  title: "重要性采样：换一个分布去采样，再用权重修回来",
  question: "要估计标准正态落在 x > 2.5 的概率（≈ 0.62%）。直接采样，大部分样本都浪费了。换成提议分布 q 采样，再乘权重 p/q，看误差和有效样本量怎么变。",
  controls: [
    { key: "mu", label: "提议分布均值 μ_q", min: -1, max: 5, step: 0.05, initial: 0, format: v => v.toFixed(2) },
    { key: "sigma", label: "提议分布标准差 σ_q", min: 0.4, max: 3, step: 0.05, initial: 1, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "直接采样", values: { mu: 0, sigma: 1 } },
    { label: "挪到稀有区", values: { mu: 2.8, sigma: 1 } },
    { label: "挪过去但太窄", values: { mu: 2.8, sigma: 0.6 } },
  ],
  check: {
    question: "提议分布 q 挪到了稀有区，为什么 σ_q 太小反而会让估计彻底失效？",
    answer: "估计量的方差取决于 E_q[(f·p/q)²] = ∫ f²p²/q dx。q 的尾巴比 p 细时，远处 p/q 无界增长；对两个高斯，σ_q² < σ_p²/2 时这个积分发散；恰好相等时须检查积分区间与均值，方差无穷大。少数样本带着巨大权重主宰结果。PPO 对概率比做 clip，就是在给重要性权重设上限（→ 2.3）。",
  },
  evaluate({ mu, sigma }) {
    const moments = isSecondMoment(mu, sigma), xs = grid(-4, 7, 331);
    const q = xs.map(x => [x, normalPdf(x, mu, sigma)]);
    const top = Math.max(0.42, ...q.map(v => v[1]));
    const finite = Number.isFinite(moments.tail);
    let readout, explanation;
    if (!finite) {
      readout = "方差无穷大：q 的尾巴比 p 细太多，权重 p/q 无界";
      explanation = `σ_q = ${f2(sigma)}，σ_q² ≤ σ_p²/2 = 0.5，E_q[w²] 发散。偶尔一个落在 q 尾部的样本会带着巨大的权重，估计值随之剧烈跳动，样本再多也不收敛到正常速度。`;
    } else {
      const variance = Math.max(moments.tail - I_RARE * I_RARE, 1e-30), naive = I_RARE - I_RARE * I_RARE;
      const rel = Math.sqrt(variance / 1000) / I_RARE, gain = naive / variance, ess = 1 / moments.all;
      readout = `n = 1000 时相对误差 ${pct(rel)}，相当于直接采样的 ${sci(gain)} 倍样本量`;
      explanation = Math.abs(mu) < 0.01 && Math.abs(sigma - 1) < 0.01
        ? "直接从 p 采样，1000 个样本里平均只有约 6 个落进 x > 2.5，相对误差约 40%。把 q 往右挪，让大部分样本落在要估的区域，再用 w = p/q 修正偏差。"
        : `样本按 q 采，落进 x > 2.5 的比例是 ${pct(normSf((RARE - mu) / sigma))}；权重 w = p/q 把偏差修回来。整体有效样本比例 1/E_q[w²] = ${pct(Math.min(ess, 1))}：提议分布离 p 越远，单个权重越不均匀。`;
    }
    return {
      type: "lines", xLabel: "x", yLabel: "密度", domainX: [-4, 7], domainY: [0, top * 1.1],
      regions: [{ from: RARE, to: 7, label: "要估计的区域 x > 2.5" }],
      series: [{ label: "目标 p = N(0, 1)", points: xs.map(x => [x, normalPdf(x)]) }, { label: "提议分布 q", points: q }],
      readout, explanation,
    };
  },
};

export default {
  "0.2": linearization, "0.2-graph": computationGraph,
  "0.3": detector, "0.3-clt": errorBars,
  "0.4": covariance, "0.4-noise": forwardNoise,
  "0.5": klDirections, "0.5-temperature": temperature,
  "0.7": langevin, "0.7-importance": importance,
  ...linalgOpt, ...generative,
};
