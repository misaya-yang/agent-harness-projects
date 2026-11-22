// Labs for module 7 (inference): decoding and truncation, constrained decoding, speculative decoding,
// quantization and serving. Each lab recomputes its numbers from the same formulas as the lesson's code.
import { f2, f3, pct, sci, clamp, xy, normals, figure, text } from "./math-kit.mjs";

/* ---------- 7.1 Truncation: what top-k, top-p and min-p keep ---------- */
const VOCAB = 128256;
const CONTEXTS = (() => {
  const n = normals(7);
  const bulk = new Float64Array(VOCAB);
  for (let i = 0; i < VOCAB; i++) bulk[i] = 2.5 * n();
  bulk.sort().reverse();
  const make = (label, head) => {
    const h = Float64Array.from(head).sort().reverse();
    const z = new Float64Array(VOCAB + h.length), isHead = new Uint8Array(VOCAB + h.length);
    for (let i = 0, a = 0, b = 0; i < z.length; i++) {
      if (b >= VOCAB || (a < h.length && h[a] >= bulk[b])) { z[i] = h[a++]; isHead[i] = 1; } else z[i] = bulk[b++];
    }
    return { label, z, isHead, heads: h.length };
  };
  const hn = normals(11);
  return {
    confident: make("确定语境", [22, 18.5, 17.5, 17, 16]),
    open: make("开放语境（30 个候选）", Array.from({ length: 30 }, () => 16 + 0.7 * hn())),
    creative: make("创作语境（150 个候选）", Array.from({ length: 150 }, () => 14 + 0.8 * hn())),
  };
})();

function truncation(ctx, T, k, P, m) {
  const { z, isHead } = ctx, w = new Float64Array(z.length);
  let S = 0;
  for (let i = 0; i < z.length; i++) { w[i] = Math.exp((z[i] - z[0]) / T); S += w[i]; }
  let tailAll = 0;
  for (let i = 0; i < z.length; i++) if (!isHead[i]) tailAll += w[i];
  const stats = n => {
    let kept = 0, tail = 0, tailCount = 0;
    for (let i = 0; i < n; i++) { kept += w[i]; if (!isHead[i]) { tail += w[i]; tailCount++; } }
    return { n, tailShare: tail / kept, tailCount };
  };
  let nP = 0, c = 0;
  while (nP < z.length && c < P * S) c += w[nP++];
  let nM = 0;
  while (nM < z.length && w[nM] >= m) nM++;
  return { p: Array.from(w.subarray(0, 48), v => v / S), isHead, tailAll: tailAll / S, rest: 1 - Array.from(w.subarray(0, 48)).reduce((a, b) => a + b, 0) / S,
    rules: [{ name: `top-k ${k}`, ...stats(Math.min(k, z.length)) }, { name: `top-p ${P.toFixed(2)}`, ...stats(nP) }, { name: `min-p ${m.toFixed(2)}`, ...stats(nM) }] };
}

const truncLab = {
  title: "截断采样：同一个分布，三种规则各留下什么？",
  question: "柱子是按概率排好的前 48 个 token（纵轴是对数），蓝色是合理候选，红色是尾部；最右边一根是其余 12.8 万个 token 的总质量。三条竖线标出 top-k、top-p、min-p 各自的截断位置。升高温度，看哪条规则开始把尾部吃进来。",
  controls: [
    { key: "ctx", label: "语境", initial: "open", options: [{ value: "confident", label: "确定" }, { value: "open", label: "开放" }, { value: "creative", label: "创作" }] },
    { key: "T", label: "温度 T（先除温度再截断）", min: 0.3, max: 2, step: 0.05, initial: 1, format: v => v.toFixed(2) },
    { key: "k", label: "top-k 的 k", min: 5, max: 200, step: 5, initial: 40, format: v => String(v) },
    { key: "P", label: "top-p 的 p", min: 0.5, max: 0.99, step: 0.01, initial: 0.9, format: v => v.toFixed(2) },
    { key: "m", label: "min-p 的阈值（相对最大概率）", min: 0.01, max: 0.3, step: 0.01, initial: 0.1, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "T = 1 · 确定", values: { ctx: "confident", T: 1, k: 40, P: 0.9, m: 0.1 } },
    { label: "T = 1.6 · 开放", values: { ctx: "open", T: 1.6, k: 40, P: 0.9, m: 0.1 } },
    { label: "创作 · T = 1", values: { ctx: "creative", T: 1, k: 40, P: 0.9, m: 0.1 } },
    { label: "T = 0.7 · 开放", values: { ctx: "open", T: 0.7, k: 40, P: 0.9, m: 0.1 } },
  ],
  check: {
    question: "温度从 1 升到 1.6 时，为什么 top-p 保留的 token 数从几十个暴涨到上万个，min-p 却几乎不变？",
    answer: "top-p 要凑够固定的累计质量。升温后头部的优势 Δ/T 缩水，而尾部有 12.8 万个 token，log|V| ≈ 11.8 的“人多势众”不随温度变化，尾部的总质量迅速上涨；要凑够 90%，只能一路把尾部吃进来。min-p 的阈值是最大概率的固定比例，尾部 token 的概率始终远低于最大概率的 10%，所以进不来。反过来，在“创作”语境下 top-k 40 会砍掉一大半合理候选：k 固定，不看分布形状。",
  },
  evaluate({ ctx, T, k, P, m }) {
    const C = CONTEXTS[ctx], r = truncation(C, T, k, P, m);
    const X0 = 56, BW = 5.4, GAP = 1.6, Y0 = 34, Y1 = 262, lo = -8;
    const py = v => Y1 - (clamp(Math.log10(Math.max(v, 1e-12)), lo, 0) - lo) / -lo * (Y1 - Y0);
    const bx = i => X0 + i * (BW + GAP);
    const restX = bx(48) + 10;
    const bars = r.p.map((v, i) => {
      const kept = r.rules.map(u => i < u.n);
      const cls = C.isHead[i] ? "lab-fill-blue" : "lab-fill-rose";
      return `<rect x="${xy(bx(i))}" y="${xy(py(v))}" width="${BW}" height="${xy(Y1 - py(v))}" rx="1.5" class="${cls}" fill-opacity="${kept.some(Boolean) ? 0.9 : 0.25}"/>`;
    }).join("") + `<rect x="${xy(restX)}" y="${xy(py(r.rest))}" width="${BW * 2.4}" height="${xy(Y1 - py(r.rest))}" rx="1.5" class="lab-fill-rose" fill-opacity="0.55"/>`;
    const grid = [0, -2, -4, -6, -8].map(e => `<path d="M${X0 - 4} ${xy(py(10 ** e))} H${restX + BW * 2.4}" class="lab-fig-gridline is-faint"/>${text(X0 - 8, py(10 ** e) + 4, e === 0 ? "1" : `10${String(e).split("").map(c => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]).join("")}`, "lab-fig-note", "end")}`).join("");
    const cuts = r.rules.map((u, j) => {
      const label = ["k", "p", "min-p"][j];
      if (u.n >= 48) return "";
      const x = bx(u.n) - GAP / 2;
      return `<path d="M${xy(x)} ${Y0 + 2 + j * 12} V${Y1}" class="${j === 1 ? "lab-fig-cut" : j === 0 ? "lab-fig-band" : "lab-fig-band is-mean"}"/>${text(x + 3, Y0 + 8 + j * 12, label, "lab-fig-note")}`;
    }).join("");
    const beyond = r.rules.filter(u => u.n >= 48).map(u => u.name.split(" ")[0]).join("、");
    const sx = 452;
    const rows = r.rules.map((u, i) => `${text(sx, 60 + i * 58, u.name, "lab-fig-label")}${text(632, 60 + i * 58, `留 ${u.n.toLocaleString("en-US")} 个`, "lab-fig-value", "end")}${text(sx, 80 + i * 58, `其中尾部 ${u.tailCount >= 10000 ? (u.tailCount / 1e4).toFixed(1) + " 万" : u.tailCount} 个`, "lab-fig-note")}${text(632, 80 + i * 58, `尾部占 ${pct(u.tailShare)}`, u.tailShare > 0.01 ? "lab-fig-value is-accent" : "lab-fig-value", "end")}`).join("");
    const hit = 1 - (1 - r.tailAll) ** 500;
    const body = `${text(X0, 18, `${C.label} · T = ${T.toFixed(2)}`, "lab-fig-title")}${grid}${bars}${cuts}
      ${text(restX + BW * 1.2, Y1 + 16, "其余", "lab-fig-note", "middle")}${text(X0, Y1 + 16, "按概率排序的前 48 个 token", "lab-fig-note")}
      ${beyond ? text(restX + BW * 2.4, 18, `${beyond} 截在第 48 名之后`, "lab-fig-note", "end") : ""}
      ${text(sx, 30, "截断之后", "lab-fig-title")}${rows}
      ${text(sx, 238, `不截断：尾部质量 ${sci(r.tailAll)}`, "lab-fig-note")}${text(sx, 256, `500 token 内踩中尾部 ${pct(hit)}`, "lab-fig-note")}`;
    const [K, Pp, M] = r.rules;
    return {
      type: "svg", svg: figure(640, 290, "按概率排序的 token 分布，以及 top-k、top-p、min-p 三种截断位置", body),
      readout: `${K.name} 留 ${K.n} 个（尾部占 ${pct(K.tailShare)}）· ${Pp.name} 留 ${Pp.n.toLocaleString("en-US")} 个（尾部占 ${pct(Pp.tailShare)}）· ${M.name} 留 ${M.n} 个（尾部占 ${pct(M.tailShare)}）`,
      explanation: Pp.tailShare > 0.05
        ? `高温把头部的优势压平了，尾部总质量升到 ${pct(r.tailAll)}。top-p 为了凑够 ${pct(P, 0)} 的累计质量吃进了 ${Pp.tailCount.toLocaleString("en-US")} 个尾部 token，采样有 ${pct(Pp.tailShare)} 的概率落在尾部；min-p 的阈值跟着最大概率走，尾部进不来。`
        : ctx === "creative" && K.n < 150
          ? `创作语境有 150 个合理候选，top-k ${k} 只留下其中 ${K.n - K.tailCount} 个：k 固定，不看分布的形状。top-p 和 min-p 会随分布展开，保留更多候选。`
          : `这个温度下三种规则都没有放进多少尾部。注意不截断时尾部总质量是 ${sci(r.tailAll)}，一段 500 token 的回答踩中尾部的概率是 ${pct(hit)}：单个 token 小，加起来不小。`,
    };
  },
};

/* ---------- 7.1 Constrained decoding distortion ---------- */
const grammarLab = {
  title: "约束解码：逐步掩码把模型推向了哪里？",
  question: "问“这家公司的总部在哪个城市”，schema 只允许 New York 或 Boston。模型第一步可能说 New、Boston 或 Chicago；“New”之后它多半想接 Jersey（被禁止）。拖动两个概率，比较模型在合法答案上的真实条件分布与逐步掩码实际采样的分布。",
  controls: [
    { key: "a", label: "第一步说 New 的概率（剩下的按 3∶1 分给 Boston 和 Chicago）", min: 0.05, max: 0.9, step: 0.01, initial: 0.6, format: v => v.toFixed(2) },
    { key: "b", label: "New 之后接 York 的概率（其余是 Jersey）", min: 0.01, max: 1, step: 0.01, initial: 0.02, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "正文的例子", values: { a: 0.6, b: 0.02 } },
    { label: "New 之后只会接 York", values: { a: 0.6, b: 1 } },
    { label: "模型不太想说 New", values: { a: 0.15, b: 0.3 } },
  ],
  check: {
    question: "什么条件下逐步掩码不扭曲分布？为什么把 b 拉到 1 时两组柱子重合？",
    answer: "掩码采样的概率是每步条件概率除以当步合法质量 Z_t 的乘积，真实条件分布只除以一个全局常数 P(合法)。只有当每条合法路径上 ∏Z_t 都相同时两者才一致。b = 1 时 New 之后没有被禁止的词，New 这条路上第二步的 Z = 1，与 Boston 路径的处境相同，掩码就不再偏向任何一方。正确的修正是按“未来能否合法”给每个 token 加权：New 的权重乘以 P(合法 | New) = b。",
  },
  evaluate({ a, b }) {
    const boston = (1 - a) * 0.75;
    const exactNY = a * b / (a * b + boston), maskNY = a / (a + boston);
    const kl = maskNY * Math.log(maskNY / exactNY) + (1 - maskNY) * Math.log((1 - maskNY) / (1 - exactNY));
    return {
      type: "bars", maxValue: 100, unit: "最终输出的概率（%）",
      rows: [
        { label: "Boston · 合法答案上的条件分布", value: 100 * (1 - exactNY), display: pct(1 - exactNY) },
        { label: "Boston · 逐步掩码", value: 100 * (1 - maskNY), display: pct(1 - maskNY) },
        { label: "New York · 合法答案上的条件分布", value: 100 * exactNY, display: pct(exactNY) },
        { label: "New York · 逐步掩码", value: 100 * maskNY, display: pct(maskNY) },
      ],
      readout: `逐步掩码给 New York ${pct(maskNY)}，模型在合法答案上的真实条件概率是 ${pct(exactNY)}（${maskNY / exactNY >= 1.005 ? `放大 ${f2(maskNY / exactNY)} 倍` : "一致"}）；KL = ${f3(kl)} nat`,
      explanation: b > 0.995
        ? "New 之后没有被禁止的词，两条合法路径途中都没有被掩掉的质量，逐步掩码与条件分布一致。"
        : `第一步掩码只删掉 Chicago，New 拿到 ${pct(maskNY)}；走进 New 之后 Jersey 被禁止，只能接 York。模型原本只有 ${pct(a * b)} 的概率说 New York，掩码把这条路上被堵死的 ${pct(a * (1 - b))} 全部算到了它头上。按未来合法概率加权（New 乘以 ${f2(b)}）就能恢复真实条件分布。`,
    };
  },
};

/* ---------- 7.2 Speculative decoding: speedup vs draft length ---------- */
const expTokens = (a, g) => a >= 1 ? g + 1 : (1 - a ** (g + 1)) / (1 - a);
const speedup = (a, g, c) => expTokens(a, g) / (1 + g * c);
const bestGamma = (a, c) => { let g = 1; for (let k = 2; k <= 40; k++) if (speedup(a, k, c) > speedup(a, g, c)) g = k; return g; };

const specLab = {
  title: "投机解码：草稿该猜几个 token？",
  question: "每轮期望产出 E = (1 − α^(γ+1)) / (1 − α) 个 token，代价是 γ 次草稿前向（每次是目标的 c 倍）加一次目标验证。曲线是不同草稿成本下的加速比，圆点是你选的 γ。调接受率和草稿成本，看最优 γ 落在哪里。",
  controls: [
    { key: "alpha", label: "接受率 α", min: 0.3, max: 0.98, step: 0.01, initial: 0.8, format: v => v.toFixed(2) },
    { key: "c", label: "草稿成本 c（相对目标一次前向）", min: 0, max: 0.5, step: 0.01, initial: 0.1, format: v => v.toFixed(2) },
    { key: "gamma", label: "草稿长度 γ", min: 1, max: 16, step: 1, initial: 4, format: v => String(v) },
  ],
  presets: [
    { label: "α 0.8 · c 0.1 · γ 4", values: { alpha: 0.8, c: 0.1, gamma: 4 } },
    { label: "草稿太长：γ 16", values: { alpha: 0.8, c: 0.1, gamma: 16 } },
    { label: "代码补全：α 0.95", values: { alpha: 0.95, c: 0.05, gamma: 8 } },
    { label: "MTP：α 0.875 · γ 1", values: { alpha: 0.875, c: 0.04, gamma: 1 } },
  ],
  check: {
    question: "接受率固定为 0.8 时，为什么草稿成本越低，最优 γ 越大？c = 0 时 γ 越大越好吗？",
    answer: "多猜一个 token 的期望收益是 α^(γ+1)，随 γ 指数衰减；成本是固定的 c。c 越小，越晚才出现“收益低于成本”的那一点，所以最优 γ 越大。c = 0 时加速比随 γ 单调上升，但上限是 1/(1 − α) = 5：再长的草稿也不会超过它。真实系统里 c 不为 0，验证更多 token 也不是完全免费（§5），所以 γ 总有最优值。",
  },
  evaluate({ alpha, c, gamma }) {
    const gs = Array.from({ length: 16 }, (_, i) => i + 1);
    const costs = [...new Set([0, 0.05, c, 0.3])].sort((a, b) => a - b);
    const series = costs.map(cc => ({ label: cc === c ? `c = ${cc.toFixed(2)}（当前）` : `c = ${cc.toFixed(2)}`, points: gs.map(g => [g, speedup(alpha, g, cc)]) }));
    const E = expTokens(alpha, gamma), S = speedup(alpha, gamma, c), gb = bestGamma(alpha, c), Sb = speedup(alpha, gb, c);
    const top = Math.max(...series.flatMap(s => s.points.map(p => p[1])));
    return {
      type: "lines", xLabel: "草稿长度 γ", yLabel: "加速比（带宽受限）", domainX: [1, 16], domainY: [0, Math.ceil(top + 0.5)],
      series, point: { x: gamma, y: S, label: `γ = ${gamma}` },
      readout: `γ = ${gamma}：每轮期望 ${f2(E)} 个 token，成本 ${f2(1 + gamma * c)} → 加速 ${f2(S)}×；最优 γ* = ${gb}${gb > 16 ? "（超出图的范围）" : ""}，${f2(Sb)}×；上限 1/(1 − α) = ${alpha >= 1 ? "∞" : f2(1 / (1 - alpha))}`,
      explanation: gamma > gb
        ? `草稿比最优值长：第 ${gamma} 个草稿 token 只有 ${pct(alpha ** gamma)} 的概率被用上，却要付完整的成本 c。缩短到 γ = ${gb} 反而更快。`
        : gamma < gb
          ? `草稿还可以再长一点：多猜一个 token 的期望收益 ${f3(alpha ** (gamma + 1))} 仍然高于它的相对成本。γ = ${gb} 时加速最大。`
          : `这就是当前 α 和 c 下的最优草稿长度。提高接受率比调 γ 有效得多：α 每提高一点，整条曲线都往上移。`,
    };
  },
};

/* ---------- 7.2 Speculative decoding vs batch size and context length ---------- */
const SPEC_HW = { N: 8.03e9, Nd: 0.5e9, kvTok: 131072, L: 32, d: 4096, BW: 3.35e12, peak: 989e12, kvBudget: 64e9 };
function stepTime(B, tokens, nParam, ctx, kv = true) {
  const { kvTok, L, d, BW, peak } = SPEC_HW;
  const bytes = 2 * nParam + (kv ? B * ctx * kvTok : 0);
  const flops = 2 * nParam * tokens + (kv ? 4 * L * ctx * d * tokens : 0);
  return Math.max(bytes / BW, flops / peak);
}
function specBatch(B, ctx, alpha, gamma) {
  const { N, Nd } = SPEC_HW;
  const tPlain = stepTime(B, B, N, ctx), tSpec = stepTime(B, B * (gamma + 1), N, ctx) + gamma * stepTime(B, B, Nd, ctx, false);
  return { speed: tPlain * expTokens(alpha, gamma) / tSpec, plain: B / tPlain, spec: B * expTokens(alpha, gamma) / tSpec };
}
const CTXS = [256, 2048, 8192, 32768];

const specBatchLab = {
  title: "批大小与上下文：投机解码什么时候反而变慢？",
  question: "Llama-3-8B 跑在 H100 上（理想屋脊线），草稿 5 亿参数。每条曲线是一种上下文长度下，投机解码相对普通 decode 的吞吐倍数随 batch 的变化；曲线在显存装满处结束。低于 1 的部分就是亏损。",
  controls: [
    { key: "ctx", label: "平均上下文长度", initial: "256", options: CTXS.map(c => ({ value: String(c), label: c >= 1024 ? `${c / 1024}K` : String(c) })) },
    { key: "logB", label: "batch 大小 B", min: 0, max: 11, step: 0.25, initial: 6, format: v => String(Math.round(2 ** v)) },
    { key: "alpha", label: "接受率 α", min: 0.5, max: 0.95, step: 0.01, initial: 0.8, format: v => v.toFixed(2) },
    { key: "gamma", label: "草稿长度 γ", min: 1, max: 8, step: 1, initial: 4, format: v => String(v) },
  ],
  presets: [
    { label: "短上下文 · B = 64", values: { ctx: "256", logB: 6, alpha: 0.8, gamma: 4 } },
    { label: "短上下文 · B = 1024", values: { ctx: "256", logB: 10, alpha: 0.8, gamma: 4 } },
    { label: "8K 上下文 · B = 32", values: { ctx: "8192", logB: 5, alpha: 0.8, gamma: 4 } },
    { label: "单条请求", values: { ctx: "2048", logB: 0, alpha: 0.8, gamma: 4 } },
  ],
  check: {
    question: "同样是 B = 512，为什么 256 上下文时投机解码亏损，而 32K 上下文的曲线根本到不了那里、却一直高于 1？",
    answer: "短上下文时每条序列的 KV 很小，batch 一大，计算量（2N × B(γ+1)）就超过了读权重的耗时，进入算力受限：验证 γ+1 个 token 要花 γ+1 倍的时间，被拒绝的草稿全是浪费，加速比趋于 E/(γ+1) < 1。长上下文时每条序列的 KV 有几个 GB，读 KV 的时间随 batch 线性增长并始终压过计算，decode 一直受带宽限制；同一条序列验证 γ+1 个 token 只读一遍 KV，所以投机解码一直有收益。32K 上下文时显存只放得下十几条序列，曲线在那里就结束了。",
  },
  evaluate({ ctx, logB, alpha, gamma }) {
    const c = Number(ctx), B = Math.round(2 ** logB);
    const maxB = cc => Math.floor(SPEC_HW.kvBudget / (cc * SPEC_HW.kvTok));
    const series = CTXS.map(cc => {
      const pts = [];
      for (let e = 0; e <= 11.001; e += 0.125) { const b = 2 ** e; if (b > maxB(cc)) break; pts.push([b, specBatch(b, cc, alpha, gamma).speed]); }
      return { label: `上下文 ${cc >= 1024 ? `${cc / 1024}K` : cc}${cc === c ? "（当前）" : ""}`, points: pts };
    });
    const fits = B <= maxB(c), r = specBatch(Math.min(B, maxB(c)), c, alpha, gamma), limit = expTokens(alpha, gamma) / (gamma + 1);
    return {
      type: "lines", scaleX: "log", xLabel: "batch 大小 B（对数轴）", yLabel: "投机解码 / 普通 decode 的吞吐", domainX: [1, 2048], domainY: [0, 4],
      series, point: { x: Math.min(B, maxB(c)), y: r.speed, label: `B = ${Math.min(B, maxB(c))}` },
      readout: `${fits ? "" : `显存最多放 ${maxB(c)} 条，按 B = ${maxB(c)} 计算；`}普通 decode ${Math.round(r.plain).toLocaleString("en-US")} tok/s，投机 ${Math.round(r.spec).toLocaleString("en-US")} tok/s，加速 ${f2(r.speed)}×（算力受限的极限 ${f2(limit)}×）`,
      explanation: r.speed < 1
        ? `这个 batch 已经算力受限：验证 ${gamma + 1} 个 token 要花 ${gamma + 1} 倍的计算，每轮却只产出 ${f2(expTokens(alpha, gamma))} 个。此时应该关掉投机解码，或把 γ 调小。`
        : c >= 8192
          ? `长上下文下每条序列的 KV 有 ${f2(c * SPEC_HW.kvTok / 2 ** 30)} GiB，读 KV 的时间压过了计算，decode 一直受带宽限制；验证多个 token 只读一遍 KV，所以 batch 大了投机解码依然有效。`
          : `仍处在带宽受限区：验证多几个 token 几乎免费，加速接近 E/(1 + γc)。继续增大 batch，看曲线在哪里跌破 1。`,
    };
  },
};

/* ---------- 7.3 Quantization: group size, outliers and the scale format ---------- */
const fp4 = a => a < 0.25 ? 0 : a < 0.75 ? 0.5 : a < 1.25 ? 1 : a < 1.75 ? 1.5 : a < 2.5 ? 2 : a < 3.5 ? 3 : a < 5 ? 4 : 6;
const e4m3 = v => { const e = Math.max(Math.floor(Math.log2(v)), -6); return Math.min(Math.round(v / 2 ** e * 8) / 8 * 2 ** e, 448); };
const QN = 32768;
const QBASE = (() => { const n = normals(73), r = normals(74); return { g: Float64Array.from({ length: QN }, n), u: Float64Array.from({ length: QN }, () => Math.abs(r())), s: Float64Array.from({ length: QN }, () => (r() > 0 ? 1 : -1)) }; })();
const QGROUPS = [8, 16, 32, 64, 128, 256, 512, 1024, 4096, 32768];
function quantData(mag, rate) {
  // u is |N(0,1)|; P(|N| > t) = rate picks a reproducible subset that grows with the rate.
  const thr = rate > 0 ? Math.SQRT2 * inverseErfc(rate) : Infinity;
  return Float64Array.from(QBASE.g, (v, i) => (QBASE.u[i] > thr ? QBASE.s[i] * mag : v));
}
function inverseErfc(p) {             // bisection is plenty for a one-off threshold
  let lo = 0, hi = 10;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (erfcApprox(m) > p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function erfcApprox(x) { const t = 1 / (1 + 0.5 * x); return t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); }
function quantError(x, g, kind) {
  let err = 0, pow = 0;
  const tensorMax = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0), st = tensorMax / (6 * 448);
  for (let s = 0; s < x.length; s += g) {
    let amax = 0;
    for (let i = s; i < s + g; i++) amax = Math.max(amax, Math.abs(x[i]));
    for (let i = s; i < s + g; i++) {
      const v = x[i];
      let q;
      if (kind === "int4") { const sc = amax / 7; q = sc > 0 ? clamp(Math.round(v / sc), -7, 7) * sc : 0; }
      else if (kind === "mx") { const sc = 2 ** (Math.floor(Math.log2(amax)) - 2); q = Math.sign(v) * fp4(Math.min(Math.abs(v) / sc, 6)) * sc; }
      else { const sc = e4m3(amax / 6 / st) * st; q = Math.sign(v) * fp4(Math.min(Math.abs(v) / sc, 6)) * sc; }
      err += (v - q) ** 2; pow += v * v;
    }
  }
  return Math.sqrt(err / pow);
}
const quantLab = {
  title: "量化误差：分组大小、离群值与缩放格式",
  question: "32768 个标准正态数，按一定比例替换成离群值，再按不同的分组大小量化成 4 bit。三条曲线分别是 INT4（按组内最大值定缩放）、FP4 E2M1 配 2 的幂缩放（MX 的规则）、FP4 E2M1 配 E4M3 缩放（NVFP4 的做法）。竖线标出 NVFP4 的 16 和 MXFP4 的 32。",
  controls: [
    { key: "logMag", label: "离群值大小（倍 σ）", min: 0.5, max: 2, step: 0.05, initial: 1.3, format: v => (10 ** v).toFixed(v < 1 ? 1 : 0) },
    { key: "rate", label: "离群值比例（每万个）", min: 0, max: 20, step: 1, initial: 1, format: v => `${v}` },
    { key: "logG", label: "高亮的分组大小", min: 3, max: 15, step: 1, initial: 7, format: v => String(2 ** v) },
  ],
  presets: [
    { label: "没有离群值", values: { logMag: 1.3, rate: 0, logG: 7 } },
    { label: "万分之一 · 20σ", values: { logMag: 1.3, rate: 1, logG: 7 } },
    { label: "千分之二 · 50σ", values: { logMag: 1.7, rate: 20, logG: 5 } },
    { label: "逐张量", values: { logMag: 1.3, rate: 1, logG: 15 } },
  ],
  check: {
    question: "为什么分组越小误差越低？既然如此，为什么不把分组做到 4 个一组？",
    answer: "每组的步长由组内最大值决定：g 个正态数的最大值约随 √(2 ln g) 增长，离群值也只会撑大它所在那一组的步长，所以小分组的步长更细。代价是每组都要存一个缩放因子：16 bit 的缩放摊到 g 个数上是 16/g bit，g = 4 时每个数要多 4 bit，等于用 8 bit 存一个 4-bit 数。MXFP4 用 8 位的缩放、32 个一组（4.25 bit），NVFP4 用 8 位的缩放、16 个一组（4.5 bit），都是在误差和开销之间折中。",
  },
  evaluate({ logMag, rate, logG }) {
    const mag = 10 ** logMag, x = quantData(mag, rate / 1e4), g = 2 ** logG;
    const kinds = [["int4", "INT4（FP16 缩放）"], ["mx", "E2M1 + 2 的幂缩放（MX 规则）"], ["nv", "E2M1 + E4M3 缩放（NV 风格）"]];
    const series = kinds.map(([k, label]) => ({ label, points: QGROUPS.map(gg => [gg, quantError(x, gg, k)]) }));
    const at = kinds.map(([k]) => quantError(x, g, k));
    const nOut = x.reduce((c, v, i) => c + (QBASE.u[i] > (rate > 0 ? Math.SQRT2 * inverseErfc(rate / 1e4) : Infinity) ? 1 : 0), 0);
    const top = Math.max(...series.flatMap(s => s.points.map(p => p[1])));
    return {
      type: "lines", scaleX: "log", xLabel: "分组大小 g（对数轴）", yLabel: "相对误差 ‖x − x̂‖ / ‖x‖", domainX: [8, 32768], domainY: [0, Math.min(1, Math.ceil(top * 10 + 0.5) / 10)],
      series, markers: [{ x: 16, label: "NVFP4" }, { x: 32, label: "MXFP4" }], point: { x: g, y: at[0], label: `g = ${g}` },
      readout: `g = ${g}：INT4 ${f3(at[0])}（${(4 + 16 / g).toFixed(3)} bit）· MX 规则 ${f3(at[1])} · NV 风格 ${f3(at[2])}（各 ${(4 + 8 / g).toFixed(3)} bit）；共 ${nOut} 个离群值`,
      explanation: nOut === 0
        ? `没有离群值时，组内最大值只随 √(2 ln g) 缓慢增长，所以曲线比较平。FP4 的网格在 0 附近更密，配上精细的 E4M3 缩放，对钟形分布比等间距的 INT4 更准。`
        : g >= 4096
          ? `分组很大时，几乎每组都有离群值：步长被 ${mag.toFixed(0)}σ 撑大，绝大多数正常的数被舍入成 0，误差接近 ${pct(at[0], 0)}。缩小分组，离群值就只污染它所在的那一组。`
          : `${nOut} 个离群值只会撑大它们所在组的步长。g = ${g} 时三种方案的误差分别是 ${f3(at[0])}、${f3(at[1])}、${f3(at[2])}；2 的幂缩放会浪费最多 1 bit 的范围，或者截断块内的最大值，E4M3 缩放能让块最大值几乎正好落在 6 上。`,
    };
  },
};

/* ---------- 7.3 SmoothQuant: migrating difficulty from activations to weights ---------- */
const SQ = (() => {
  const n = normals(31), T = 32, D = 128, F = 64;
  const X = Array.from({ length: T }, () => Float64Array.from({ length: D }, n));
  const W = Array.from({ length: D }, () => Float64Array.from({ length: F }, () => 0.02 * n()));
  return { X, W, T, D, F, hot: [7, 40, 77, 101] };
})();
function sqPrepare(mag) {
  const { X: X0, W, T, D, F, hot } = SQ;
  const X = new Float64Array(T * D), Wf = new Float64Array(D * F), xmax = new Float64Array(D), wmax = new Float64Array(D), Y = new Float64Array(T * F);
  for (let i = 0; i < T; i++) for (let k = 0; k < D; k++) { const v = X0[i][k] * (hot.includes(k) ? mag : 1); X[i * D + k] = v; xmax[k] = Math.max(xmax[k], Math.abs(v)); }
  for (let k = 0; k < D; k++) for (let j = 0; j < F; j++) { const v = W[k][j]; Wf[k * F + j] = v; wmax[k] = Math.max(wmax[k], Math.abs(v)); }
  for (let i = 0; i < T; i++) for (let k = 0; k < D; k++) { const x = X[i * D + k]; for (let j = 0; j < F; j++) Y[i * F + j] += x * Wf[k * F + j]; }
  return { X, W: Wf, xmax, wmax, Y, T, D, F };
}
function sqRun(P, bits, alpha, mode) {
  const { X, W, xmax, wmax, Y, T, D, F } = P, Q = 2 ** (bits - 1) - 1;
  const s = Float64Array.from({ length: D }, (_, k) => xmax[k] ** alpha / wmax[k] ** (1 - alpha));
  const qx = new Float64Array(T * D), qw = new Float64Array(D * F);
  for (let i = 0; i < T; i++) {
    let m = 0;
    for (let k = 0; k < D; k++) m = Math.max(m, Math.abs(X[i * D + k] / s[k]));
    const sc = m / Q;
    for (let k = 0; k < D; k++) { const v = X[i * D + k] / s[k]; qx[i * D + k] = mode === "w" ? v : clamp(Math.round(v / sc), -Q, Q) * sc; }
  }
  const cm = new Float64Array(F);
  for (let k = 0; k < D; k++) for (let j = 0; j < F; j++) cm[j] = Math.max(cm[j], Math.abs(W[k * F + j] * s[k]));
  for (let k = 0; k < D; k++) for (let j = 0; j < F; j++) { const v = W[k * F + j] * s[k], sc = cm[j] / Q; qw[k * F + j] = mode === "x" ? v : clamp(Math.round(v / sc), -Q, Q) * sc; }
  let err = 0, pow = 0;
  const yq = new Float64Array(F);
  for (let i = 0; i < T; i++) {
    yq.fill(0);
    for (let k = 0; k < D; k++) { const x = qx[i * D + k]; for (let j = 0; j < F; j++) yq[j] += x * qw[k * F + j]; }
    for (let j = 0; j < F; j++) { const y = Y[i * F + j]; err += (y - yq[j]) ** 2; pow += y * y; }
  }
  return Math.sqrt(err / pow);
}
const smoothLab = {
  title: "SmoothQuant：把激活的难度转移给权重",
  question: "激活有 4 个放大的离群通道。平滑因子 s = max|X|^α / max|W|^(1−α)：激活除以 s，权重乘以 s，乘积不变。三条曲线分别是只量化激活、只量化权重、两者都量化时的输出误差，圆点是你选的 α。",
  controls: [
    { key: "logMag", label: "离群通道放大倍数", min: 0, max: 2, step: 0.05, initial: 1.6, format: v => (10 ** v).toFixed(v < 1 ? 1 : 0) },
    { key: "bits", label: "量化位数", initial: "8", options: [{ value: "8", label: "W8A8" }, { value: "6", label: "W6A6" }, { value: "4", label: "W4A4" }] },
    { key: "alpha", label: "迁移强度 α", min: 0, max: 1, step: 0.05, initial: 0.5, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "W8A8 · α = 0.5", values: { logMag: 1.6, bits: "8", alpha: 0.5 } },
    { label: "不平滑（α = 0）", values: { logMag: 1.6, bits: "8", alpha: 0 } },
    { label: "全给权重（α = 1）", values: { logMag: 1.6, bits: "8", alpha: 1 } },
    { label: "没有离群值", values: { logMag: 0, bits: "8", alpha: 0.5 } },
  ],
  check: {
    question: "为什么 α = 0 和 α = 1 都不好？最优 α 为什么接近 0.5？",
    answer: "α = 0 时 s 只取决于权重，激活的离群通道原封不动，按 token 量化时整行的步长被离群值撑大；α = 1 时激活被完全压平，离群通道的放大倍数全部转移到权重对应的那一行，权重按输出通道量化时这些行又成了离群值。α = 0.5 让每个通道上激活和权重的最大值相等（都等于 √(max|X|·max|W|)），两边的难度均衡，误差的瓶颈不再落在某一边。",
  },
  evaluate({ logMag, bits, alpha }) {
    const mag = 10 ** logMag, b = Number(bits), P = sqPrepare(mag);
    const grid = Array.from({ length: 21 }, (_, i) => i / 20);
    const series = [["x", "只量化激活"], ["w", "只量化权重"], ["both", `W${b}A${b} 两者都量化`]].map(([m, label]) => ({ label, points: grid.map(a => [a, sqRun(P, b, a, m)]) }));
    const both = series[2].points, best = both.reduce((m, p) => (p[1] < m[1] ? p : m));
    const here = sqRun(P, b, alpha, "both"), none = both[0][1];
    const top = Math.max(...series.flatMap(s => s.points.map(p => p[1])));
    return {
      type: "lines", xLabel: "迁移强度 α", yLabel: "输出相对误差", domainX: [0, 1], domainY: [0, top * 1.1],
      series, point: { x: alpha, y: here, label: `α = ${alpha.toFixed(2)}` },
      readout: `α = ${alpha.toFixed(2)}：W${b}A${b} 输出误差 ${f3(here)}（不平滑 ${f3(none)}）；这组数据的最优 α ≈ ${best[0].toFixed(2)}，误差 ${f3(best[1])}`,
      explanation: mag < 2
        ? "没有明显的离群通道时，激活本来就好量化，平滑的收益很小，α 取多少差别不大。"
        : alpha < best[0] - 0.1
          ? `α 偏小，激活的离群通道还没被压下去：只量化激活的那条曲线仍然是瓶颈。`
          : alpha > best[0] + 0.1
            ? `α 偏大，离群通道的放大倍数被过多地转移到了权重上：只量化权重的误差开始上升。`
            : `接近最优：激活和权重的难度大致均衡，W${b}A${b} 的误差从不平滑时的 ${f3(none)} 降到 ${f3(here)}。${b === 4 ? "4 bit 时即使平衡了两边，误差依然很大，这就是 QuaRot / SpinQuant 改用旋转的原因。" : ""}`,
    };
  },
};

/* ---------- 7.4 Serving: a step-level scheduler on a Gantt chart ---------- */
const SV = { N: 8.03e9, WB: 16.06e9, KV: 131072, L: 32, D: 4096, BW: 3.35e12, PEAK: 989e12, CAP: 60000, MAXLEN: 8192, BUDGET: 512 };
const svStep = (kvTokens, newTokens, attn) => Math.max((SV.WB + kvTokens * SV.KV) / SV.BW, (2 * SV.N * newTokens + attn) / SV.PEAK);
const SV_BASE = (() => {
  const n = normals(404), u = normals(405), g = normals(406);
  return Array.from({ length: 16 }, (_, i) => ({
    gap: Math.abs(u()) * 1.25 + 0.05,                                      // arrival gaps, scaled by 1/λ later
    p: i === 4 || i === 10 ? 7000 : Math.round(clamp(600 * Math.exp(0.7 * n()), 64, 3000)),
    o: Math.round(clamp(80 * Math.exp(0.6 * g()), 8, 300)),
  }));
})();
function serveSim(policy, rate) {
  let t = 0;
  const reqs = SV_BASE.map(b => { t += b.gap / rate; return { arr: t, p: b.p, o: b.o, doneP: 0, gen: 0, start: null, first: null, end: null, last: null, gap: 0 }; });
  const t0 = reqs[0].arr, steps = [];
  let now = t0, i = 0, waiting = [], running = [];
  const { L, D } = SV;
  for (let guard = 0; guard < 200000 && (i < reqs.length || waiting.length || running.length); guard++) {
    while (i < reqs.length && reqs[i].arr <= now + 1e-12) waiting.push(reqs[i++]);
    if (!waiting.length && !running.length) { now = reqs[i].arr; continue; }
    let newTok = 0, attn = 0, kvNow = 0;
    const emit = [];
    if (policy === "static") {
      if (!running.length) { const k = Math.min(waiting.length, Math.floor(SV.CAP / SV.MAXLEN)); running = waiting.slice(0, k); waiting = waiting.slice(k); }
      for (const r of running) {
        if (r.doneP < r.p) { r.start = now; newTok += r.p; attn += 4 * L * D * r.p * r.p / 2; r.doneP = r.p; emit.push(r); }
        else if (r.gen < r.o) { newTok += 1; attn += 4 * L * D * (r.p + r.gen); emit.push(r); }
        kvNow += r.p + r.gen;
      }
    } else {
      let used = running.reduce((a, r) => a + r.doneP + r.gen, 0), left = policy === "chunked" ? SV.BUDGET : Infinity;
      for (const r of running) if (r.doneP === r.p) { newTok += 1; attn += 4 * L * D * (r.p + r.gen); emit.push(r); left -= 1; }
      while (waiting.length && used + waiting[0].p + waiting[0].o <= SV.CAP) { const r = waiting.shift(); running.push(r); used += r.p + r.o; }
      for (const r of running) {
        if (r.doneP < r.p && left > 0) {
          const c = Math.min(r.p - r.doneP, left);
          if (r.start === null) r.start = now;
          attn += 4 * L * D * c * (r.doneP + c / 2); newTok += c; left -= c; r.doneP += c;
          if (r.doneP === r.p) emit.push(r);
        }
      }
      kvNow = running.reduce((a, r) => a + r.doneP + r.gen, 0);
    }
    const dt = svStep(kvNow, newTok, attn);
    steps.push([now - t0, dt]);
    now += dt;
    for (const r of emit) { r.gen += 1; if (r.first === null) r.first = now; else r.gap = Math.max(r.gap, now - r.last); r.last = now; if (r.gen >= r.o) r.end = now; }
    running = policy === "static" ? (running.every(r => r.end !== null) ? [] : running) : running.filter(r => r.end === null);
  }
  const ttft = reqs.map(r => r.first - r.arr), tpot = reqs.map(r => (r.end - r.first) / Math.max(1, r.o - 1));
  const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const total = reqs.reduce((a, r) => a + r.o, 0);
  return { reqs, steps, t0, span: now - t0, ttft50: med(ttft), ttftMax: Math.max(...ttft), tpot50: med(tpot), gapMax: Math.max(...reqs.map(r => r.gap)), thr: total / (now - t0), stall: Math.max(...steps.map(s => s[1])) };
}
const POLICY_NAMES = { static: "静态批处理（按最大长度预留 KV）", continuous: "连续批处理 + 分页 KV", chunked: "连续批处理 + 分块 prefill（每步 512 token）" };
const serveLab = {
  title: "调度器：静态批处理、连续批处理与分块 prefill",
  question: "16 个请求按到达顺序排成行（Llama-3-8B，H100，KV 预算 6 万 token；第 5、11 个请求的 prompt 有 7000 token）。灰色是排队，橙色是 prefill，蓝色是 decode。底部的红色刻度是耗时超过 20 ms 的步：如果这时有请求正在 decode，它们都会被卡住。",
  controls: [
    { key: "policy", label: "调度策略", initial: "continuous", options: [{ value: "static", label: "静态批处理" }, { value: "continuous", label: "连续批处理" }, { value: "chunked", label: "分块 prefill" }] },
    { key: "rate", label: "请求到达率（个/秒）", min: 2, max: 40, step: 1, initial: 12, format: v => `${v}` },
  ],
  presets: [
    { label: "静态批处理", values: { policy: "static", rate: 12 } },
    { label: "连续批处理", values: { policy: "continuous", rate: 12 } },
    { label: "分块 prefill", values: { policy: "chunked", rate: 12 } },
    { label: "低负载 · 连续", values: { policy: "continuous", rate: 3 } },
  ],
  check: {
    question: "从连续批处理切换到分块 prefill，红色刻度和蓝色条有什么变化？TTFT 为什么略有上升？",
    answer: "连续批处理在长 prompt 加入的那一步做完整个 7000 token 的 prefill，一步要一百多毫秒，所有正在 decode 的请求（蓝条）在这一步都停住，用户看到输出突然卡顿一百多毫秒。分块 prefill 每步最多处理 512 个 token，decode 优先，长 prefill 被拆成十几步与 decode 交错进行，每步都在 10 ms 左右，红色刻度消失。代价是长 prompt 自己要分十几步才做完，它的 TTFT 变长了。静态批处理则是另一种问题：新请求要等整批结束才能开始（灰条很长），先结束的请求也不能提前让位。",
  },
  evaluate({ policy, rate }) {
    const r = serveSim(policy, rate);
    const X0 = 64, X1 = 462, Y0 = 34, RH = 14, n = r.reqs.length, Y1 = Y0 + n * RH;
    const span = r.span, px = t => X0 + (t - 0) / span * (X1 - X0);
    const niceStep = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find(s => span / s <= 6) ?? 10;
    const ticks = [];
    for (let t = 0; t <= span + 1e-9; t += niceStep) ticks.push(`<path d="M${xy(px(t))} ${Y0 - 4} V${Y1 + 4}" class="lab-fig-gridline is-faint"/>${text(px(t), Y1 + 50, `${t < 1 ? Math.round(t * 1000) + " ms" : t.toFixed(t % 1 ? 1 : 0) + " s"}`, "lab-fig-note", "middle")}`);
    const rows = r.reqs.map((q, k) => {
      const y = Y0 + k * RH + 2, h = RH - 4, a = q.arr - r.t0, st = q.start - r.t0, f = q.first - r.t0, e = q.end - r.t0;
      return `<rect x="${xy(px(a))}" y="${y}" width="${xy(Math.max(0.5, px(st) - px(a)))}" height="${h}" rx="2" class="lab-fill-muted" fill-opacity="0.55"/>
        <rect x="${xy(px(st))}" y="${y}" width="${xy(Math.max(1.2, px(f) - px(st)))}" height="${h}" rx="2" class="lab-fill-amber"/>
        <rect x="${xy(px(f))}" y="${y}" width="${xy(Math.max(0.5, px(e) - px(f)))}" height="${h}" rx="2" class="lab-fill-blue" fill-opacity="0.85"/>
        ${text(X0 - 6, y + h - 1, q.p >= 5000 ? `#${k + 1} 长` : `#${k + 1}`, "lab-fig-note", "end")}`;
    }).join("");
    const stalls = r.steps.filter(([, dt]) => dt > 0.02).map(([t, dt]) => `<rect x="${xy(px(t))}" y="${xy(Y1 + 30 - Math.min(18, dt / 0.3 * 18))}" width="${xy(Math.max(1.5, px(t + dt) - px(t)))}" height="${xy(Math.min(18, dt / 0.3 * 18))}" class="lab-fill-rose"/>`).join("");
    const sx = 480, ms = v => v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`;
    const side = [["TTFT 中位数", ms(r.ttft50)], ["TTFT 最大", ms(r.ttftMax)], ["TPOT 中位数", `${(r.tpot50 * 1000).toFixed(1)} ms`], ["最长停顿", ms(r.gapMax)], ["最长的一步", ms(r.stall)], ["吞吐", `${Math.round(r.thr).toLocaleString("en-US")} tok/s`]]
      .map(([a, b], i) => `${text(sx, 60 + i * 34, a, "lab-fig-label")}${text(632, 60 + i * 34, b, i === 3 && r.gapMax > 0.02 ? "lab-fig-value is-accent" : "lab-fig-value", "end")}`).join("");
    const body = `${text(X0, 18, POLICY_NAMES[policy], "lab-fig-title")}${ticks.join("")}${rows}
      <path d="M${X0} ${Y1 + 30} H${X1}" class="lab-fig-gridline"/>${stalls}${text(X0 - 6, Y1 + 28, "卡顿", "lab-fig-note", "end")}
      ${text(sx, 30, `到达率 ${rate} 个/秒`, "lab-fig-title")}${side}`;
    return {
      type: "svg", svg: figure(640, Y1 + 62, "16 个请求的排队、prefill 与 decode 时间线，以及耗时超过 20 毫秒的步", body),
      readout: `TTFT 中位数 ${ms(r.ttft50)}（最大 ${ms(r.ttftMax)}）· TPOT 中位数 ${(r.tpot50 * 1000).toFixed(1)} ms · 用户看到的最长停顿 ${ms(r.gapMax)} · 最长的一步 ${ms(r.stall)}`,
      explanation: policy === "static"
        ? `KV 按最大长度 8192 预留，6 万 token 的预算一批只能放 ${Math.floor(SV.CAP / SV.MAXLEN)} 个请求；新请求要等整批结束才能开始，先结束的请求也只能空等。整批一起 prefill 的那一步最长要 ${ms(r.stall)}。`
        : policy === "continuous"
          ? `请求一到就加入，TTFT 大幅下降。但长 prompt 在加入的那一步做完整个 prefill，最长的一步要 ${ms(r.stall)}，这一步里所有正在 decode 的请求都停住了：用户看到的最长停顿是 ${ms(r.gapMax)}，而平时每个 token 只要 ${(r.tpot50 * 1000).toFixed(1)} ms。`
          : `每步最多 512 个 token，decode 优先，长 prompt 被拆成多步与 decode 交错。最长的一步只有 ${ms(r.stall)}，用户看到的最长停顿 ${ms(r.gapMax)}；代价是长 prompt 自己的 TTFT 变长。`,
    };
  },
};

/* ---------- 7.4 Decode batch size: throughput, latency and the KV wall ---------- */
const DEC_CTX = [512, 2048, 8192, 32768];
const DEC_KV = { gqa: { label: "GQA（8 个 KV 头，Llama-3-8B）", kv: 131072, flopPerByte: 4 }, mha: { label: "MHA（32 个 KV 头，假想）", kv: 524288, flopPerByte: 1 } };
function decodeAt(B, ctx, kvKind) {
  const kv = DEC_KV[kvKind].kv, { N, WB, L, D, BW, PEAK } = SV;
  const tW = WB / BW, tKV = B * ctx * kv / BW, tC = (2 * N * B + 4 * L * D * ctx * B) / PEAK;
  const t = Math.max(tW + tKV, tC);
  return { t, thr: B / t, tW, tKV, tC, mem: WB + B * ctx * kv };
}
const decodeLab = {
  title: "decode 的 batch：吞吐、延迟与 KV 之墙",
  question: "Llama-3-8B 在 H100 上 decode（理想屋脊线）。每条曲线是一种上下文长度下总吞吐随 batch 的变化，曲线在显存（80 GB × 0.9）装满处结束。切换 KV 的结构，看长上下文时曲线为什么早早变平、早早结束。",
  controls: [
    { key: "kv", label: "注意力的 KV 结构", initial: "gqa", options: [{ value: "gqa", label: "GQA 8 头" }, { value: "mha", label: "MHA 32 头" }] },
    { key: "ctx", label: "高亮的上下文长度", initial: "2048", options: DEC_CTX.map(c => ({ value: String(c), label: c >= 1024 ? `${c / 1024}K` : String(c) })) },
    { key: "logB", label: "batch 大小", min: 0, max: 9, step: 0.25, initial: 6, format: v => String(Math.round(2 ** v)) },
  ],
  presets: [
    { label: "短上下文 · B = 256", values: { kv: "gqa", ctx: "512", logB: 8 } },
    { label: "8K · B = 32", values: { kv: "gqa", ctx: "8192", logB: 5 } },
    { label: "8K · MHA", values: { kv: "mha", ctx: "8192", logB: 3 } },
    { label: "单条请求", values: { kv: "gqa", ctx: "2048", logB: 0 } },
  ],
  check: {
    question: "上下文 512 时，batch 从 1 到 256 吞吐涨了上百倍；上下文 32K 时却几乎涨不动，而且很快放不下。为什么？",
    answer: "每一步要读一遍权重（16 GB，约 4.8 ms），这部分被 batch 里所有请求分摊，所以短上下文时 batch 越大吞吐越高。但每条序列的 KV 是它自己的，无法分摊：32K 上下文一条就是 4 GiB（GQA），读 KV 的时间随 batch 线性增长，很快超过读权重的时间，之后吞吐几乎不再增长；显存也只放得下十几条。MHA 的 KV 是 GQA 的 4 倍，墙来得更早。注意力在 decode 时每读 1 字节 KV 只做 1（MHA）或 4（GQA）次浮点运算，远低于屋脊点 295，所以无论 batch 多大都受带宽限制。",
  },
  evaluate({ kv, ctx, logB }) {
    const c = Number(ctx), B = Math.round(2 ** logB), budget = 80e9 * 0.9;
    const maxB = cc => Math.floor((budget - SV.WB) / (cc * DEC_KV[kv].kv));
    const series = DEC_CTX.map(cc => {
      const pts = [];
      for (let e = 0; e <= 9.001; e += 0.125) { const b = 2 ** e; if (b > maxB(cc)) break; pts.push([b, decodeAt(b, cc, kv).thr]); }
      return { label: `上下文 ${cc >= 1024 ? `${cc / 1024}K` : cc}${cc === c ? "（当前）" : ""}`, points: pts };
    }).filter(s => s.points.length);
    const fits = B <= maxB(c), b = Math.max(1, Math.min(B, maxB(c))), r = decodeAt(b, c, kv);
    const top = Math.max(...series.flatMap(s => s.points.map(p => p[1])));
    return {
      type: "lines", scaleX: "log", xLabel: "batch 大小（对数轴）", yLabel: "decode 总吞吐（token/s）", domainX: [1, 512], domainY: [0, Math.ceil(top / 5000) * 5000],
      series, point: { x: b, y: r.thr, label: `B = ${b}` },
      readout: `${fits ? "" : `显存最多放 ${maxB(c)} 条，按 B = ${b} 计算；`}每 token ${(r.t * 1000).toFixed(1)} ms，总吞吐 ${Math.round(r.thr).toLocaleString("en-US")} token/s；读权重 ${(r.tW * 1000).toFixed(1)} ms + 读 KV ${(r.tKV * 1000).toFixed(1)} ms，计算 ${(r.tC * 1000).toFixed(1)} ms`,
      explanation: r.tKV > r.tW
        ? `读 KV（${(r.tKV * 1000).toFixed(1)} ms）已经超过读权重（${(r.tW * 1000).toFixed(1)} ms）：KV 无法被 batch 分摊，再加 batch 吞吐也涨不了多少。${DEC_KV[kv].label}的注意力每读 1 字节 KV 只做 ${DEC_KV[kv].flopPerByte} 次浮点运算，远低于屋脊点 295。`
        : r.tC > r.tW + r.tKV
          ? "计算已经超过读取的时间，进入算力受限区：继续增大 batch，每个 token 的延迟会按比例上升。"
          : `读权重（${(r.tW * 1000).toFixed(1)} ms）仍是大头，它被 batch 里的 ${b} 个请求分摊：增大 batch，吞吐几乎线性上涨，每个 token 只慢一点点。`,
    };
  },
};

export default {
  "7.1": truncLab,
  "7.1-grammar": grammarLab,
  "7.2": specLab,
  "7.2-batch": specBatchLab,
  "7.3": quantLab,
  "7.3-smooth": smoothLab,
  "7.4": serveLab,
  "7.4-batch": decodeLab,
};
