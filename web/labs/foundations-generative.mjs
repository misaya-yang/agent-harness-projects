// Labs for 0.8 (variational inference) and 0.9 (stochastic differential equations). Densities that have a closed
// form use it; the evidence log p(x) is integrated on a fine grid. Particle runs use fixed seeds.
import { f2, pct, sci, grid, clamp, xy, normals, normalPdf, logSumExp, figure, text } from "./math-kit.mjs";

const LOG_2PI = Math.log(2 * Math.PI);
const logNormal = (x, m, s) => -0.5 * LOG_2PI - Math.log(s) - 0.5 * ((x - m) / s) ** 2;

/* ---------- 0.8 ELBO gap ---------- */
const SX = 0.6, ZS = grid(-5, 5, 1001), DZ = ZS[1] - ZS[0];
const MODELS = {
  linear: { label: "线性 x = z + 噪声", f: z => z, short: "线性" },
  square: { label: "非线性 x = z² + 噪声", f: z => z * z, short: "z²" },
};
function evidence(model, x) {
  const logJoint = ZS.map(z => logNormal(x, MODELS[model].f(z), SX) + logNormal(z, 0, 1));
  const logPx = logSumExp(logJoint) + Math.log(DZ);
  return { logPx, post: logJoint.map(v => Math.exp(v - logPx)) };
}
// E_q[log p(x|z)] in closed form: q = N(μ, σ²) gives E[z²] = μ² + σ², E[z⁴] = μ⁴ + 6μ²σ² + 3σ⁴.
function reconstruction(model, x, mu, s) {
  const sq = model === "linear" ? (x - mu) ** 2 + s * s
    : x * x - 2 * x * (mu * mu + s * s) + mu ** 4 + 6 * mu * mu * s * s + 3 * s ** 4;
  return -0.5 * LOG_2PI - Math.log(SX) - sq / (2 * SX * SX);
}
const klToPrior = (mu, s) => 0.5 * (s * s + mu * mu - 1 - Math.log(s * s));
// Independent check of the identity: integrate KL(q‖p(z|x)) on a grid that follows q, z = μ + σu.
function klToPosterior(model, x, mu, s, logPx) {
  const us = grid(-8, 8, 801), du = us[1] - us[0];
  return us.reduce((acc, u) => {
    const z = mu + s * u, logJoint = logNormal(x, MODELS[model].f(z), SX) + logNormal(z, 0, 1);
    return acc + normalPdf(u) * (logNormal(z, mu, s) - logJoint + logPx) * du;
  }, 0);
}
function bestQ(model, x) {
  let best = { elbo: -Infinity };
  for (const mu of grid(-3, 3, 121)) for (const s of grid(0.05, 1.5, 146)) {
    const elbo = reconstruction(model, x, mu, s) - klToPrior(mu, s);
    if (elbo > best.elbo) best = { elbo, mu, s };
  }
  return best;
}
const BEST_SQUARE = bestQ("square", 2), BEST_LINEAR = bestQ("linear", 2);
const elboLab = {
  title: "ELBO：下界与真实对数似然差多少？",
  question: "潜变量 z ~ N(0, 1)，观测到 x 之后，真实后验 p(z|x) 往往算不出来。用一个高斯 q(z) = N(μ, σ²) 去近似它：调 μ 和 σ，看 ELBO 离 log p(x) 有多远，这段差距和 KL(q‖p(z|x)) 是什么关系。",
  controls: [
    { key: "model", label: "生成模型", initial: "square", options: Object.entries(MODELS).map(([value, m]) => ({ value, label: m.label })) },
    { key: "x", label: "观测值 x", min: 0.2, max: 3, step: 0.05, initial: 2, format: v => v.toFixed(2) },
    { key: "mu", label: "q 的均值 μ", min: -3, max: 3, step: 0.05, initial: 0.4, format: v => v.toFixed(2) },
    { key: "s", label: "q 的标准差 σ", min: 0.05, max: 1.5, step: 0.01, initial: 0.6, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "线性模型的最优 q", values: { model: "linear", x: 2, mu: Number(BEST_LINEAR.mu.toFixed(2)), s: Number(BEST_LINEAR.s.toFixed(2)) } },
    { label: "双峰：抓住一个峰", values: { model: "square", x: 2, mu: Number(BEST_SQUARE.mu.toFixed(2)), s: Number(BEST_SQUARE.s.toFixed(2)) } },
    { label: "双峰：硬盖两个峰", values: { model: "square", x: 2, mu: 0, s: 1.4 } },
  ],
  check: {
    question: "在 z² 模型里，把 q 调到最好，差距也停在约 0.69 不再下降。0.69 是什么数？它说明了什么？",
    answer: "0.69 ≈ log 2。真实后验在 ±√x 附近各有一个几乎相同的峰，单个高斯只能贴住其中一个。贴住一个峰时 KL(q‖p(z|x)) ≈ log 2：q 把全部概率放在后验只占一半质量的地方。这是近似族不够灵活造成的差距，优化器再好也消不掉。ELBO 最大化的是反向 KL，所以 q 选择抓住一个峰，而不是盖住两个（→ 0.5）。",
  },
  evaluate({ model, x, mu, s }) {
    const { logPx, post } = evidence(model, x);
    const rec = reconstruction(model, x, mu, s), klp = klToPrior(mu, s), elbo = rec - klp, gap = logPx - elbo;
    const q = ZS.map(z => normalPdf(z, mu, s));
    const klPost = klToPosterior(model, x, mu, s, logPx);
    // Density plot.
    const X0 = 28, X1 = 368, Y0 = 44, Y1 = 270, zLo = -3.5, zHi = 3.5;
    const top = Math.max(1.1 * Math.max(...post), 0.5);
    const zx = z => xy(X0 + (z - zLo) / (zHi - zLo) * (X1 - X0)), dy = d => xy(Y1 - clamp(d / top, 0, 1.05) * (Y1 - Y0));
    const idx = ZS.map((z, i) => i).filter(i => ZS[i] >= zLo && ZS[i] <= zHi && i % 2 === 0);
    const line = arr => "M" + idx.map(i => `${zx(ZS[i])} ${dy(arr[i])}`).join(" L");
    const area = `${line(post)} L${zx(zHi)} ${Y1} L${zx(zLo)} ${Y1}Z`;
    const prior = ZS.map(z => normalPdf(z));
    const ticks = [-3, -2, -1, 0, 1, 2, 3].map(v => `${text(zx(v), Y1 + 16, String(v).replace("-", "−"), "lab-fig-note", "middle")}`).join("");
    // The ledger: log p(x) at the top, ELBO below it, the gap between them is KL(q‖posterior).
    const L0 = 430, LT = 60, scale = 64, lyOf = v => xy(clamp(LT + (logPx + 0.3 - v) * scale, LT - 10, LT + 3.4 * scale));
    const elboY = lyOf(elbo), pxY = lyOf(logPx), off = elbo < logPx - 3.2;
    const body = `
      ${text(X0, 26, "后验 p(z | x) 与近似 q(z)", "lab-fig-title")}
      <path d="M${X0} ${Y1 + 0.5} H${X1}" class="lab-fig-gridline"/>${ticks}${text(X1, Y1 + 32, "z", "lab-fig-note", "end")}
      <path d="${line(prior)}" class="lab-fig-prior"/>
      <path d="${area}" class="lab-fig-post"/>
      <path d="${line(q)}" class="lab-fig-curve"/>
      <g transform="translate(${X0 + 6} ${Y0 + 4})">
        <rect width="12" height="9" rx="3" class="lab-fig-post"/>${text(18, 9, "真实后验", "lab-fig-note")}
        <path d="M80 5 H96" class="lab-fig-curve"/>${text(102, 9, "q(z)", "lab-fig-note")}
        <path d="M144 5 H160" class="lab-fig-prior"/>${text(166, 9, "先验 p(z)", "lab-fig-note")}
      </g>
      ${text(L0 - 20, 26, "对数似然账本（单位：nat）", "lab-fig-title")}
      <path d="M${L0} ${LT - 10} V${LT + 3.4 * scale}" class="lab-fig-gridline"/>
      <path d="M${L0 - 8} ${pxY} H${L0 + 60}" class="lab-fig-level"/>${text(L0 + 68, pxY + 4, `log p(x) = ${f2(logPx)}`, "lab-fig-value")}
      <rect x="${L0 + 6}" y="${pxY}" width="14" height="${xy(Math.max(elboY - pxY, 1))}" rx="4" class="lab-fig-gap"/>
      <path d="M${L0 - 8} ${elboY} H${L0 + 60}" class="lab-fig-level is-elbo"/>${text(L0 + 68, elboY + 4, off ? `ELBO = ${f2(elbo)}（在刻度以下）` : `ELBO = ${f2(elbo)}`, "lab-fig-value")}
      ${text(L0 + 26, xy((pxY + elboY) / 2) + 4, `差距 ${f2(gap)}`, "lab-fig-backward")}
      <g transform="translate(${L0 - 20} 290)">
        ${text(0, 0, `KL(q ‖ p(z|x)) 数值积分 = ${f2(klPost)}`, "lab-fig-note")}
        ${text(0, 20, `ELBO = 重建 ${f2(rec)} − KL(q‖p(z)) ${f2(klp)}`, "lab-fig-note")}
      </g>`;
    const bimodal = model === "square" && x > 0.8;
    return {
      type: "svg", svg: figure(640, 320, "真实后验、近似分布 q 与 ELBO 账本", body),
      readout: `log p(x) = ${f2(logPx)}，ELBO = ${f2(elbo)}，差距 ${f2(gap)} = KL(q‖后验) ${f2(klPost)}`,
      explanation: `差距 log p(x) − ELBO 和直接数值积分得到的 KL(q‖p(z|x)) 相同（${f2(gap)} 与 ${f2(klPost)}）：ELBO 越高，q 就越接近真实后验。${model === "linear" ? "线性高斯模型的后验本身就是高斯，q 调到后验的均值和方差时差距为 0。" : bimodal ? `x = ${f2(x)} 时后验在 ±${f2(Math.sqrt(x))} 附近各有一个峰。单个高斯最好只能贴住一个峰，差距停在 log 2 ≈ 0.69 附近；硬把两个峰都盖住，q 会把大量概率放在两峰之间的低谷，差距反而更大。` : "x 很小时 z² 模型的后验只有一个宽峰，高斯近似得不错。"}`,
    };
  },
};

/* ---------- 0.8 Why VAE reconstructions blur (linear VAE) ---------- */
const COMPONENTS = 16, SPEC = Array.from({ length: COMPONENTS }, (_, i) => (i + 1) ** -2);
const WAVE = (() => {
  const z = normals(23);
  return SPEC.map(lam => ({ amp: Math.sqrt(2 * lam) * (0.6 + 0.4 * Math.abs(z())), phase: 2 * Math.PI * (0.5 + 0.5 * Math.tanh(z())) }));
})();
const TS = grid(0, 1, 361);
const signal = gains => TS.map(t => [t, WAVE.reduce((acc, w, k) => acc + gains[k] * w.amp * Math.cos(2 * Math.PI * (k + 1) * t + w.phase), 0)]);
const blurLab = {
  title: "VAE 为什么糊：方差小的细节先被丢掉",
  question: "数据由 16 个频率分量组成，频率越高方差越小（λₖ ∝ 1/k²，和自然图像相似）。线性 VAE 的最优解可以直接写出来：调解码器噪声方差 σ² 和 β，看哪些分量还在被编码、重建变成什么样。",
  controls: [
    { key: "logS2", label: "解码器噪声方差 σ²", min: -4, max: 0, step: 0.1, initial: -2, format: v => sci(10 ** v) },
    { key: "beta", label: "β（KL 项的权重）", min: 0.1, max: 4, step: 0.1, initial: 1, format: v => v.toFixed(1) },
  ],
  presets: [
    { label: "σ² 很小：几乎无损", values: { logS2: -3.5, beta: 1 } },
    { label: "默认 σ² = 0.01", values: { logS2: -2, beta: 1 } },
    { label: "β = 4：更糊", values: { logS2: -2, beta: 4 } },
    { label: "σ² = 1：后验坍缩", values: { logS2: 0, beta: 1 } },
  ],
  check: {
    question: "β 和 σ² 在最优解里只以乘积 βσ² 出现。这说明了什么？为什么调大 σ² 也会让重建变糊？",
    answer: "高斯解码器的重建项是 −‖x − x̂‖²/(2σ²)，把整个目标乘以 σ²，就变成 −½‖x − x̂‖² − βσ²·KL：真正起作用的是 KL 的相对权重 βσ²。方差 λₖ 低于阈值 βσ² 的分量，编码它的收益抵不过 KL 代价，后验坍缩回先验，解码器把它整个丢掉；高于阈值的分量也被缩小到 (1 − βσ²/λₖ) 倍。高频细节方差小，最先被丢，所以重建偏模糊。调大 σ² 等于告诉模型“像素误差不要紧”，效果和调大 β 一样。",
  },
  evaluate({ logS2, beta }) {
    const tau = beta * 10 ** logS2;
    const gains = SPEC.map(lam => Math.max(0, 1 - tau / lam)), active = gains.filter(g => g > 0).length;
    const orig = signal(SPEC.map(() => 1)), rec = signal(gains);
    const kept = SPEC.reduce((acc, lam, k) => acc + lam * gains[k], 0) / SPEC.reduce((a, b) => a + b, 0);
    const rate = SPEC.reduce((acc, lam) => acc + (lam > tau ? 0.5 * Math.log(lam / tau) : 0), 0);
    // Signal plot.
    const X0 = 30, X1 = 620, Y0 = 34, Y1 = 162, all = orig.map(p => Math.abs(p[1])), lim = Math.max(...all) * 1.08;
    const sx = t => xy(X0 + t * (X1 - X0)), sy = v => xy((Y0 + Y1) / 2 - v / lim * (Y1 - Y0) / 2);
    const path = pts => "M" + pts.map(([t, v]) => `${sx(t)} ${sy(v)}`).join(" L");
    // Spectrum bars on a log axis, with the collapse threshold βσ².
    const B0 = 206, B1 = 292, lo = -3, hi = 0.3, by = v => xy(B1 - (clamp(Math.log10(v), lo, hi) - lo) / (hi - lo) * (B1 - B0));
    const bw = (X1 - X0 - 150) / COMPONENTS;
    const bars = SPEC.map((lam, k) => `<rect x="${xy(X0 + k * bw + 2)}" y="${by(lam)}" width="${xy(bw - 4)}" height="${xy(B1 - by(lam))}" rx="3" class="${gains[k] > 0 ? "lab-fill-amber" : "lab-fill-muted"}"/>`).join("");
    const tauY = by(tau), tauOff = Math.log10(tau) > hi ? "↑ 在所有分量之上" : Math.log10(tau) < lo ? "↓ 在所有分量之下" : "";
    const body = `
      ${text(X0, 22, "一段信号与它的 VAE 重建 E[x̂]", "lab-fig-title")}
      <path d="M${X0} ${(Y0 + Y1) / 2} H${X1}" class="lab-fig-gridline is-faint"/>
      <path d="${path(orig)}" class="lab-fig-path lab-stroke-blue is-thin"/>
      <path d="${path(rec)}" class="lab-fig-path lab-stroke-amber"/>
      <g transform="translate(${X1 - 210} 14)"><path d="M0 4 H16" class="lab-fig-path lab-stroke-blue is-thin"/>${text(22, 8, "原始信号", "lab-fig-note")}<path d="M90 4 H106" class="lab-fig-path lab-stroke-amber"/>${text(112, 8, "重建（期望）", "lab-fig-note")}</g>
      ${text(X0, B0 - 14, "各分量的方差 λₖ（对数轴，左低频右高频）", "lab-fig-title")}
      ${bars}<path d="M${X0} ${tauY} H${X0 + COMPONENTS * bw}" class="lab-fig-cut"/>
      ${text(X0 + COMPONENTS * bw + 8, tauY + 4, `阈值 βσ² = ${sci(tau)} ${tauOff}`, "lab-fig-backward")}
      ${text(X0, B1 + 18, "k = 1", "lab-fig-note")}${text(X0 + COMPONENTS * bw, B1 + 18, "16", "lab-fig-note", "end")}
      ${text(X0, B1 + 46, `活跃分量 ${active} / ${COMPONENTS}　保留方差 ${pct(kept)}`, "lab-fig-value")}
      ${text(X1, B1 + 46, `码率 Σ ½ln(λₖ/βσ²) = ${f2(rate)} nat`, "lab-fig-note", "end")}`;
    return {
      type: "svg", svg: figure(640, 350, "原始信号、VAE 重建与各分量的方差和坍缩阈值", body),
      readout: `βσ² = ${sci(tau)}：活跃分量 ${active}/${COMPONENTS}，重建保留 ${pct(kept)} 的方差，码率 ${f2(rate)} nat`,
      explanation: active === 0
        ? "阈值高过所有分量：每个潜变量都坍缩回先验，编码器什么都不传，解码器只能输出均值（一条直线）。这就是“后验坍缩”。"
        : `方差低于 βσ² 的 ${COMPONENTS - active} 个高频分量被整个丢掉（后验坍缩到先验），保留下来的分量也被缩小到 1 − βσ²/λₖ 倍。重建因此比原信号平滑：细节方差小，最先被牺牲。β 和 σ² 只以乘积 βσ² 出现。`,
    };
  },
};

/* ---------- 0.9 Reverse SDE vs probability-flow ODE ---------- */
const MIX = [[0.7, -1.5], [0.3, 1.5]], MIX_SD = 0.3, B_MIN = 0.1, B_MAX = 20, T_END = 1e-3;
const betaAt = t => B_MIN + (B_MAX - B_MIN) * t;
const alphaAt = t => Math.exp(-0.5 * (B_MIN * t + 0.5 * (B_MAX - B_MIN) * t * t));
function marginal(x, t) {
  const a = alphaAt(t), v = a * a * MIX_SD * MIX_SD + 1 - a * a;
  let p = 0, ps = 0;
  for (const [w, m] of MIX) { const d = w * normalPdf(x, a * m, Math.sqrt(v)); p += d; ps += d * -(x - a * m) / v; }
  return { p, score: p > 1e-300 ? ps / p : -x / v };
}
const PARTICLES = 400, SHOWN = 18;
const STARTS = (() => { const z = normals(31); return Array.from({ length: PARTICLES }, () => z()); })();
const KICKS = (() => { const z = normals(37); return Array.from({ length: PARTICLES * 500 }, () => z()); })();
function sample(steps, stochastic) {
  const h = (1 - T_END) / steps, keep = Math.max(1, Math.round(steps / 60));
  const xs = STARTS.slice(), paths = Array.from({ length: SHOWN }, (_, i) => [[1, xs[i * 7]]]);
  for (let n = 0; n < steps; n++) {
    const t = 1 - n * h, b = betaAt(t);
    for (let i = 0; i < PARTICLES; i++) {
      const s = marginal(xs[i], t).score;
      xs[i] += stochastic ? (0.5 * b * xs[i] + b * s) * h + Math.sqrt(b * h) * KICKS[(i * 500 + Math.floor(n * 500 / steps)) % KICKS.length]
        : (0.5 * b * xs[i] + 0.5 * b * s) * h;
      xs[i] = clamp(xs[i], -8, 8);
    }
    if ((n + 1) % keep === 0 || n === steps - 1) paths.forEach((p, k) => p.push([t - h, xs[k * 7]]));
  }
  return { xs, paths };
}
function discordant(a, b) {
  let bad = 0, total = 0;
  for (let i = 0; i < a.length; i += 2) for (let j = i + 1; j < a.length; j += 2) { total++; if ((a[i] - a[j]) * (b[i] - b[j]) < 0) bad++; }
  return bad / total;
}
const STEP_OPTIONS = [10, 30, 100, 500];
const sdeLab = {
  title: "反向 SDE 与概率流 ODE：同样的终点分布，完全不同的轨迹",
  question: "同一组从 N(0, 1) 出发的粒子，按学到的 score 往回走到数据分布（70% 在左峰、30% 在右峰）。反向 SDE 每步加噪声，概率流 ODE 不加。背景是每个时刻的边缘密度 p_t：比较两种轨迹、终点直方图和步数的影响。",
  controls: [
    { key: "view", label: "显示", initial: "both", options: [{ value: "both", label: "两种都看" }, { value: "sde", label: "只看 SDE" }, { value: "ode", label: "只看 ODE" }] },
    { key: "steps", label: "离散步数", initial: "100", options: STEP_OPTIONS.map(n => ({ value: String(n), label: `${n} 步` })) },
  ],
  presets: [
    { label: "100 步对比", values: { view: "both", steps: "100" } },
    { label: "只有 10 步", values: { view: "both", steps: "10" } },
    { label: "ODE 单看", values: { view: "ode", steps: "30" } },
  ],
  check: {
    question: "为什么 ODE 的轨迹两两不交叉，而且同一个起点永远到同一个终点？这给了扩散模型什么额外能力？",
    answer: "ODE 的解由初值唯一决定，一维里两条解曲线一旦相交就会从此重合，所以起点的先后顺序在终点保持不变：噪声到数据是一个确定的、可逆的映射。反过来把数据沿 ODE 正向积分，就能得到它对应的噪声（DDIM 反演），也能用变量替换公式算精确似然。SDE 每步注入新噪声，同一起点每次落点不同，粒子顺序被打乱，但它对每一步的误差有纠错作用，步数足够时样本质量常常更好。",
  },
  evaluate({ view, steps }) {
    const n = Number(steps);
    const sde = sample(n, true), ode = sample(n, false);
    const right = xs => xs.filter(x => x > 0).length / xs.length;
    const X0 = 34, X1 = 430, Y0 = 34, Y1 = 296, lo = -3.2, hi = 3.2;
    const tx = t => xy(X0 + (1 - t) * (X1 - X0)), yy = x => xy(Y1 - (clamp(x, lo, hi) - lo) / (hi - lo) * (Y1 - Y0));
    const cols = 36, rows = 48, cw = (X1 - X0) / cols, rh = (Y1 - Y0) / rows;
    const density = Array.from({ length: cols }, (_, c) => {
      const t = 1 - (c + 0.5) / cols * (1 - T_END), ys = Array.from({ length: rows }, (_, r) => marginal(hi - (r + 0.5) * rh / (Y1 - Y0) * (hi - lo), t).p);
      const m = Math.max(...ys);
      return ys.map((p, r) => p / m < 0.04 ? "" : `<rect x="${xy(X0 + c * cw)}" y="${xy(Y0 + r * rh)}" width="${xy(cw + 0.4)}" height="${xy(rh + 0.4)}" class="lab-fig-density" fill-opacity="${(0.32 * p / m).toFixed(2)}"/>`).join("");
    }).join("");
    const trace = (paths, cls) => paths.map(p => `<path d="M${p.map(([t, x]) => `${tx(t)} ${yy(x)}`).join(" L")}" class="lab-fig-path ${cls}"/>`).join("");
    const H0 = 456, HW = 74, bins = 32, hist = (xs, x0, cls) => {
      const counts = Array(bins).fill(0);
      xs.forEach(x => { const k = Math.floor((x - lo) / (hi - lo) * bins); if (k >= 0 && k < bins) counts[bins - 1 - k]++; });
      const peak = 0.72 * PARTICLES * (hi - lo) / bins * (1 / (MIX_SD * Math.sqrt(2 * Math.PI)));
      return counts.map((c, k) => c ? `<rect x="${x0}" y="${xy(Y0 + k * (Y1 - Y0) / bins + 0.6)}" width="${xy(Math.min(c / peak, 1.15) * HW)}" height="${xy((Y1 - Y0) / bins - 1.2)}" rx="1.5" class="${cls}"/>` : "").join("");
    };
    const target = x0 => "M" + grid(lo, hi, 97).map(x => {
      const d = MIX.reduce((acc, [w, m]) => acc + w * normalPdf(x, m, MIX_SD), 0) / (0.72 / (MIX_SD * Math.sqrt(2 * Math.PI)));
      return `${xy(x0 + Math.min(d, 1.15) * HW)} ${yy(x)}`;
    }).join(" L");
    const showSde = view !== "ode", showOde = view !== "sde";
    const sdeMix = discordant(STARTS, sde.xs), odeMix = discordant(STARTS, ode.xs);
    const width = xs => Math.sqrt(xs.reduce((acc, x) => acc + (x - (x > 0 ? 1.5 : -1.5)) ** 2, 0) / xs.length);
    const wSde = width(sde.xs), wOde = width(ode.xs);
    const body = `
      ${text(X0, 22, "从噪声（t = 1）走到数据（t = 0）", "lab-fig-title")}
      <rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="12" class="lab-fig-plane"/>${density}
      ${showSde ? trace(sde.paths, "lab-stroke-sage is-thin") : ""}${showOde ? trace(ode.paths, "lab-stroke-amber") : ""}
      ${text(X0, Y1 + 16, "t = 1", "lab-fig-note")}${text(X1, Y1 + 16, "t = 0", "lab-fig-note", "end")}
      ${text(H0, 22, "终点直方图", "lab-fig-title")}
      ${showSde ? `${hist(sde.xs, H0, "lab-fill-sage is-soft")}<path d="${target(H0)}" class="lab-fig-target"/>${text(H0, Y1 + 16, `SDE 峰宽 ${f2(wSde)}`, "lab-fig-note")}` : ""}
      ${showOde ? `${hist(ode.xs, H0 + 92, "lab-fill-amber is-soft")}<path d="${target(H0 + 92)}" class="lab-fig-target"/>${text(H0 + 92, Y1 + 16, `ODE 峰宽 ${f2(wOde)}`, "lab-fig-note")}` : ""}
      ${text(H0, Y1 + 34, "虚线：目标密度（峰宽 0.30）", "lab-fig-note")}`;
    return {
      type: "svg", svg: figure(640, 340, "反向 SDE 与概率流 ODE 的粒子轨迹、边缘密度与终点直方图", body),
      readout: `${n} 步：峰宽 SDE ${f2(wSde)}、ODE ${f2(wOde)}（目标 0.30）；右峰占比 SDE ${pct(right(sde.xs), 0)}、ODE ${pct(right(ode.xs), 0)}（目标 30%）`,
      explanation: `两种采样器在每个时刻都待在同一片边缘密度里，终点都接近 70/30 的双峰。ODE 轨迹平滑、互不交叉，起点顺序几乎原样保留（被打乱的粒子对 ${pct(odeMix, 0)}）；SDE 轨迹每步被噪声推来推去，${pct(sdeMix, 0)} 的粒子对换了先后。${n <= 10 ? `只有 10 步时，SDE 每步注入的噪声没能被后面的漂移完全收回，峰宽从 0.30 抹到 ${f2(wSde)}；ODE 的轨迹本来就平滑，峰宽仍是 ${f2(wOde)}。这就是确定性采样器能“跳步”的原因。` : `${n} 步时两者的峰宽都接近 0.30；减到 10 步再看。`}`,
    };
  },
};

/* ---------- 0.9 Brownian motion and the √dt scaling ---------- */
const PATHS = 300, DRAWN = 28;
const brownian = {
  title: "布朗运动：噪声为什么要乘 √dt",
  question: "把 [0, 1] 切成 n 小段，每段加一个独立的高斯增量。增量按 √Δt 缩放时，n 越大，路径越接近布朗运动，t = 1 时的方差始终是 1。改成按 Δt 缩放，或者换成扩散模型的前向加噪 SDE，看方差怎么变。",
  controls: [
    { key: "logN", label: "每单位时间的步数 n", min: 0.6, max: 3, step: 0.1, initial: 2, format: v => String(Math.round(10 ** v)) },
    { key: "scaling", label: "增量缩放", initial: "sqrt", options: [{ value: "sqrt", label: "√Δt · z" }, { value: "linear", label: "Δt · z" }] },
    { key: "process", label: "过程", initial: "bm", options: [{ value: "bm", label: "布朗运动 dx = dW" }, { value: "vp", label: "加噪 SDE dx = −2x dt + 2dW" }] },
  ],
  presets: [
    { label: "粗：n = 4", values: { logN: 0.6, scaling: "sqrt", process: "bm" } },
    { label: "细：n = 1000", values: { logN: 3, scaling: "sqrt", process: "bm" } },
    { label: "按 Δt 缩放", values: { logN: 3, scaling: "linear", process: "bm" } },
    { label: "前向加噪", values: { logN: 2, scaling: "sqrt", process: "vp" } },
  ],
  check: {
    question: "Euler–Maruyama 的一步是 x ← x + f·Δt + g·√Δt·z。为什么噪声项是 √Δt 而不是 Δt？",
    answer: "n 个独立增量相加，方差相加。每段方差 g²Δt，总方差 g²·nΔt = g²·t，与切多细无关，这才是一个有定义的连续极限。若按 Δt 缩放，每段方差 g²Δt²，总方差 g²t·Δt，n → ∞ 时趋向 0，噪声消失，过程退化成常微分方程。这也说明布朗路径处处不可导：增量 ~ √Δt，Δx/Δt ~ 1/√Δt → ∞。",
  },
  evaluate({ logN, scaling, process }) {
    const n = Math.max(2, Math.round(10 ** logN)), dt = 1 / n, vp = process === "vp", x0 = vp ? 1.5 : 0;
    const z = normals(41 + n), stride = Math.max(1, Math.round(n / 160));
    const ends = [], drawn = [];
    for (let k = 0; k < PATHS; k++) {
      let x = x0;
      const pts = [[0, x]];
      for (let i = 1; i <= n; i++) {
        const kick = (scaling === "sqrt" ? Math.sqrt(dt) : dt) * z();
        x += vp ? -2 * x * dt + 2 * kick : kick;
        if (k < DRAWN && (i % stride === 0 || i === n)) pts.push([i * dt, x]);
      }
      ends.push(x);
      if (k < DRAWN) drawn.push(pts);
    }
    const mean = ends.reduce((a, b) => a + b, 0) / PATHS, variance = ends.reduce((a, b) => a + (b - mean) ** 2, 0) / (PATHS - 1);
    // Compare sampled Euler paths to the same finite-step Gaussian recurrence.
    const retention = 1 - 2 * dt;
    const kickVariance = scaling === "sqrt" ? dt : dt * dt;
    const theoryVar = t => vp
      ? 4 * kickVariance * (1 - retention ** (2 * n * t)) / (1 - retention ** 2)
      : n * t * kickVariance;
    const theoryMean = t => vp ? x0 * retention ** (n * t) : 0;
    const X0 = 34, X1 = 440, Y0 = 34, Y1 = 290, lo = -3.4, hi = 3.4;
    const sx = t => xy(X0 + t * (X1 - X0)), sy = v => xy(Y1 - (clamp(v, lo - 0.5, hi + 0.5) - lo) / (hi - lo) * (Y1 - Y0));
    const ts = grid(0, 1, 81);
    const band = k => "M" + ts.map(t => `${sx(t)} ${sy(theoryMean(t) + k * Math.sqrt(theoryVar(t)))}`).join(" L");
    const paths = drawn.map(p => `<path d="M${p.map(([t, v]) => `${sx(t)} ${sy(v)}`).join(" L")}" class="lab-fig-path lab-stroke-blue is-faint"/>`).join("");
    const H0 = 470, HW = 120, bins = 34, counts = Array(bins).fill(0);
    ends.forEach(v => { const k = Math.floor((v - lo) / (hi - lo) * bins); if (k >= 0 && k < bins) counts[bins - 1 - k]++; });
    const peak = Math.max(...counts, 1);
    const hist = counts.map((c, k) => c ? `<rect x="${H0}" y="${xy(Y0 + k * (Y1 - Y0) / bins + 0.6)}" width="${xy(c / peak * HW)}" height="${xy((Y1 - Y0) / bins - 1.2)}" rx="1.5" class="lab-fill-blue is-soft"/>` : "").join("");
    const sd1 = Math.sqrt(theoryVar(1)), binW = (hi - lo) / bins;
    const curve = sd1 > 0.05 ? "M" + grid(lo, hi, 97).map(v => `${xy(H0 + Math.min(normalPdf(v, theoryMean(1), sd1) * PATHS * binW / peak, 1.3) * HW)} ${sy(v)}`).join(" L") : "";
    const body = `
      ${text(X0, 22, `${DRAWN} 条样本路径（共模拟 ${PATHS} 条）`, "lab-fig-title")}
      <rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="12" class="lab-fig-plane"/>
      <defs><clipPath id="bm-clip"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="12"/></clipPath></defs>
      <g clip-path="url(#bm-clip)"><path d="M${X0} ${sy(0)} H${X1}" class="lab-fig-gridline is-faint"/>${paths}
      <path d="${band(2)}" class="lab-fig-band"/><path d="${band(-2)}" class="lab-fig-band"/><path d="M${ts.map(t => `${sx(t)} ${sy(theoryMean(t))}`).join(" L")}" class="lab-fig-band is-mean"/></g>
      ${text(X0, Y1 + 16, "t = 0", "lab-fig-note")}${text(X1, Y1 + 16, "t = 1", "lab-fig-note", "end")}
      ${text(H0, 22, "t = 1 的分布", "lab-fig-title")}${hist}${curve ? `<path d="${curve}" class="lab-fig-target"/>` : ""}
      ${text(H0, Y1 + 16, `样本方差 ${f2(variance)}（理论 ${sci(theoryVar(1))}）`, "lab-fig-note")}
      ${text(X0, Y1 + 34, "琥珀虚线：理论均值 ± 2 个标准差", "lab-fig-note")}`;
    const varianceNote = vp
      ? `每一步的均值乘 1−2Δt，方差先乘 (1−2Δt)²，再加 4 × ${scaling === "sqrt" ? "Δt" : "Δt²"}。黄线按图中有限步长计算；终点均值为 ${f2(theoryMean(1))}。`
      : `独立增量的方差相加。每步方差为 ${scaling === "sqrt" ? "Δt" : "Δt²"}，${n} 步之后为 ${sci(theoryVar(1))}。`;
    return {
      type: "svg", svg: figure(640, 340, "随机游走路径、理论方差包络与 t = 1 的分布", body),
      readout: `n = ${n}：t = 1 时样本方差 ${f2(variance)}，理论值 ${sci(theoryVar(1))}`,
      explanation: varianceNote + (scaling === "linear" ? "把噪声按 Δt 缩小，加密网格后随机波动消失。" : "按 √Δt 缩放噪声，网格加密后仍保留有限的随机波动。"),
    };
  },
};

export default {
  "0.8": elboLab, "0.8-vae": blurLab,
  "0.9": sdeLab, "0.9-brownian": brownian,
};
