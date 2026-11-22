// Labs for 6.1 scaling laws: IsoFLOP curves and the overtraining trade-off, both from L(N, D) = E + A/N^α + B/D^β.
import { f2, f3, pct, sci, clamp, xy, figure, text } from "./math-kit.mjs";

const LAWS = {
  epoch: { name: "Epoch 复现", E: 1.8172, A: 482.01, B: 2085.43, a: 0.3478, b: 0.3658 },
  paper: { name: "Chinchilla 正文", E: 1.69, A: 406.4, B: 410.7, a: 0.34, b: 0.28 },
};
const lossAt = (L, N, D) => L.E + L.A / N ** L.a + L.B / D ** L.b;
function optimal(L, C) {
  const G = (L.a * L.A / (L.b * L.B)) ** (1 / (L.a + L.b));
  const N = G * (C / 6) ** (L.b / (L.a + L.b));
  return { N, D: C / (6 * N) };
}
const fmtN = n => n >= 1e12 ? f2(n / 1e12) + "T" : n >= 1e9 ? (n / 1e9 >= 100 ? (n / 1e9).toFixed(0) : (n / 1e9).toFixed(1)) + "B" : (n / 1e6).toFixed(0) + "M";
const fmtD = d => d >= 1e12 ? (d / 1e12 >= 10 ? (d / 1e12).toFixed(1) : f2(d / 1e12)) + "T" : (d / 1e9).toFixed(0) + "B";
const supE = e => String(e).split("").map(c => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]).join("");

/* ---------- 6.1 IsoFLOP curves ---------- */
const BUDGETS = [19, 21, 23, 25];
const isoflop = {
  title: "IsoFLOP 曲线：一笔算力里，模型多大最好？",
  question: "固定训练算力 C = 6ND：模型越大，能看的 token 越少。每条曲线是一个算力预算下 loss 随模型大小的变化，圆点是最低点。拖动算力、切换两组拟合常数，看最优模型大小和每参数 token 数。",
  controls: [
    { key: "logC", label: "高亮的算力预算 C", min: 19, max: 26, step: 0.02, initial: 23.76, format: v => sci(10 ** v) },
    { key: "law", label: "拟合常数", initial: "epoch", options: [{ value: "epoch", label: "Epoch 复现" }, { value: "paper", label: "Chinchilla 正文" }] },
  ],
  presets: [
    { label: "Chinchilla 的算力", values: { logC: 23.76, law: "epoch" } },
    { label: "同算力 · 正文常数", values: { logC: 23.76, law: "paper" } },
    { label: "Llama 3 405B 的算力", values: { logC: 25.58, law: "epoch" } },
  ],
  check: {
    question: "为什么曲线在最低点附近这么平？这对选模型大小意味着什么？",
    answer: "在最优点处 dL/dN = 0，偏离最优时 loss 只按偏离量的平方增长。以 3.8×10²⁵ 为例，模型比最优小一半或大一倍，loss 都只高约 0.12%。所以最优点的位置对 loss 不敏感，却对成本很敏感：小一半的模型推理便宜一半。Llama 3 的缩放律建议 402B，他们选了 405B；要大量部署的模型则可以有意选在最低点左边很远的地方（过训练）。",
  },
  evaluate({ logC, law }) {
    const L = LAWS[law], C = 10 ** logC, opt = optimal(L, C), Lopt = lossAt(L, opt.N, opt.D);
    const X0 = 60, X1 = 470, Y0 = 30, Y1 = 270, nLo = 7, nHi = 13;           // log10 N from 1e7 to 1e13
    const lyMin = 1.75, lyMax = 3.3;
    const px = n => X0 + (Math.log10(n) - nLo) / (nHi - nLo) * (X1 - X0);
    const py = l => Y1 - (clamp(l, lyMin, lyMax) - lyMin) / (lyMax - lyMin) * (Y1 - Y0);
    const curve = (c, cls) => {
      const pts = [];
      for (let e = nLo; e <= nHi + 1e-9; e += 0.05) {
        const N = 10 ** e, D = c / (6 * N);
        if (D < 1e8) break;
        pts.push(`${xy(px(N))} ${xy(py(lossAt(L, N, D)))}`);
      }
      return `<path d="M${pts.join(" L")}" class="lab-fig-path ${cls}"/>`;
    };
    const others = BUDGETS.map(b => curve(10 ** b, "is-faint lab-stroke-blue") + (() => { const o = optimal(L, 10 ** b); return `<circle cx="${xy(px(o.N))}" cy="${xy(py(lossAt(L, o.N, o.D)))}" r="3" class="lab-fill-blue"/>${text(px(o.N) + 4, py(lossAt(L, o.N, o.D)) + 16, `10${supE(b)}`, "lab-fig-note")}`; })()).join("");
    const frontier = [];
    for (let c = 18; c <= 26.5; c += 0.25) { const o = optimal(L, 10 ** c); frontier.push(`${xy(px(o.N))} ${xy(py(lossAt(L, o.N, o.D)))}`); }
    const grid = [7, 8, 9, 10, 11, 12, 13].map(e => `<path d="M${xy(px(10 ** e))} ${Y0} V${Y1}" class="lab-fig-gridline is-faint"/>${text(px(10 ** e), Y1 + 16, e === 9 ? "1B" : e === 12 ? "1T" : e === 6 ? "1M" : `10${supE(e)}`, "lab-fig-note", "middle")}`).join("") +
      [2, 2.5, 3].map(l => `<path d="M${X0} ${xy(py(l))} H${X1}" class="lab-fig-gridline is-faint"/>${text(X0 - 6, py(l) + 4, l.toFixed(1), "lab-fig-note", "end")}`).join("");
    const half = lossAt(L, opt.N / 2, C / (6 * opt.N / 2)), dbl = lossAt(L, opt.N * 2, C / (12 * opt.N));
    const sx = 492;
    const rows = [["最优参数量", fmtN(opt.N)], ["最优 token 数", fmtD(opt.D)], ["token / 参数", (opt.D / opt.N).toFixed(1)], ["最低 loss", f3(Lopt)], ["模型小一半", `+${pct(half / Lopt - 1, 2)}`], ["模型大一倍", `+${pct(dbl / Lopt - 1, 2)}`]]
      .map(([a, b], i) => `${text(sx, 62 + i * 30, a, "lab-fig-label")}${text(630, 62 + i * 30, b, i < 3 ? "lab-fig-value is-accent" : "lab-fig-value", "end")}`).join("");
    const body = `${text(X0, 20, `loss 随模型大小（${L.name}的常数）`, "lab-fig-title")}${grid}
      <path d="M${frontier.join(" L")}" class="lab-fig-cut"/>
      ${others}${curve(C, "lab-stroke-amber")}
      <circle cx="${xy(px(opt.N))}" cy="${xy(py(Lopt))}" r="6" class="lab-fill-amber"/>
      ${text((X0 + X1) / 2, Y1 + 34, "参数量 N（对数轴）", "lab-fig-note", "middle")}
      ${text(sx, 32, `C = ${sci(C)} FLOPs`, "lab-fig-title")}${rows}
      ${text(sx, 250, "红色虚线：各算力的最优点", "lab-fig-note")}`;
    return {
      type: "svg", svg: figure(640, 310, "不同算力预算下 loss 随参数量变化的 IsoFLOP 曲线与最优点", body),
      readout: `C = ${sci(C)}：最优 ${fmtN(opt.N)} 参数 × ${fmtD(opt.D)} token（每参数 ${(opt.D / opt.N).toFixed(1)} 个），loss ${f3(Lopt)}`,
      explanation: law === "paper"
        ? `Chinchilla 正文的常数给出 N_opt ∝ C^${(L.b / (L.a + L.b)).toFixed(3)}，最优点落在更小的模型上，每参数要 ${(opt.D / opt.N).toFixed(0)} 个 token，与论文自己的另外两种方法（约 20 个）以及 70B / 1.4T 的 Chinchilla 本身都对不上。Epoch AI 的复现发现这组常数的拟合没有收敛。`
        : `用 Epoch 复现的常数，N_opt ∝ C^${(L.b / (L.a + L.b)).toFixed(3)}，参数和数据几乎同比例增长，每参数约 ${(opt.D / opt.N).toFixed(0)} 个 token。曲线在最低点附近很平：模型偏离最优 2 倍，loss 只高约 ${pct(Math.max(half, dbl) / Lopt - 1, 2)}。`,
    };
  },
};

/* ---------- 6.1 Overtraining: the (N, D) plane ---------- */
const overtrain = {
  title: "过训练的账：小模型训更久，值不值？",
  question: "在参数量 × token 数的平面上，灰色斜线是等算力线（C = 6ND），蓝色曲线是等 loss 线。选一个模型大小和训练 token 数，看它的 loss、达到同样 loss 的算力最优模型（等 loss 线与等算力线相切的点），以及推理量多大时小模型才回本（Epoch 复现的常数）。",
  controls: [
    { key: "logN", label: "参数量 N", min: 8.5, max: 11.5, step: 0.005, initial: 9.905, format: v => fmtN(10 ** v) },
    { key: "logD", label: "训练 token 数 D", min: 10.5, max: 13.5, step: 0.005, initial: 13.175, format: v => fmtD(10 ** v) },
  ],
  presets: [
    { label: "Llama-3-8B · 15T", values: { logN: 9.905, logD: 13.175 } },
    { label: "Chinchilla · 70B · 1.4T", values: { logN: 10.845, logD: 12.145 } },
    { label: "GPT-3 · 175B · 300B", values: { logN: 11.245, logD: 11.475 } },
    { label: "1B · 10T", values: { logN: 9, logD: 13 } },
  ],
  check: {
    question: "GPT-3（175B 参数、300B token）在这张图上落在算力最优路径的哪一侧？它的问题是什么？",
    answer: "它落在路径的右下方：模型太大、数据太少，每参数只看了 1.7 个 token。达到同样 loss 的算力最优模型要小得多、看的数据多得多，训练算力只要 GPT-3 的一小部分，推理也更便宜。这正是 Kaplan 的分配建议（N ∝ C^0.73）造成的偏差；Chinchilla 纠正之后，后来的模型都往左上方移动，再因为推理成本进一步移向“小模型、多数据”的方向。",
  },
  evaluate({ logN, logD }) {
    const L = LAWS.epoch, N = 10 ** logN, D = 10 ** logD, C = 6 * N * D, Lhere = lossAt(L, N, D);
    // Minimum compute reaching the same loss: bisect along the compute-optimal path.
    let lo = 1e15, hi = 1e30;
    for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); const o = optimal(L, mid); if (lossAt(L, o.N, o.D) > Lhere) lo = mid; else hi = mid; }
    const twin = optimal(L, hi), tax = C / hi;
    const breakeven = tax > 1.05 && twin.N > N ? (C - hi) / (2 * (twin.N - N)) : 0;
    const X0 = 60, X1 = 430, Y0 = 26, Y1 = 290, nLo = 8, nHi = 12, dLo = 10, dHi = 14;
    const px = n => X0 + (Math.log10(n) - nLo) / (nHi - nLo) * (X1 - X0);
    const py = d => Y1 - (Math.log10(d) - dLo) / (dHi - dLo) * (Y1 - Y0);
    const clipId = "ot-clip";
    const isoC = [20, 22, 24, 26].map(c => { const a = 10 ** c / 6; return `<path d="M${xy(px(10 ** nLo))} ${xy(py(a / 10 ** nLo))} L${xy(px(10 ** nHi))} ${xy(py(a / 10 ** nHi))}" class="lab-fig-gridline is-faint"/>${text(px(a / 10 ** 13.6) + 4, py(10 ** 13.6) + 4, `10${supE(c)}`, "lab-fig-note")}`; }).join("");
    const contour = l => {
      const pts = [];
      for (let e = nLo; e <= nHi + 1e-9; e += 0.02) {
        const n = 10 ** e, rest = l - L.E - L.A / n ** L.a;
        if (rest <= 0) continue;
        const d = (L.B / rest) ** (1 / L.b);
        if (d > 10 ** (dHi + 1)) continue;
        pts.push(`${xy(px(n))} ${xy(py(d))}`);
      }
      return pts.length > 1 ? `M${pts.join(" L")}` : "";
    };
    const levels = [2.0, 2.1, 2.3, 2.6].map(l => `<path d="${contour(l)}" class="lab-fig-contour"/>`).join("");
    const path = [];
    for (let c = 17; c <= 28; c += 0.25) { const o = optimal(L, 10 ** c); path.push(`${xy(px(o.N))} ${xy(py(o.D))}`); }
    const ticksX = [8, 9, 10, 11, 12].map(e => text(px(10 ** e), Y1 + 16, e === 9 ? "1B" : e === 12 ? "1T" : e === 8 ? "100M" : e === 10 ? "10B" : "100B", "lab-fig-note", "middle")).join("");
    const ticksY = [10, 11, 12, 13, 14].map(e => text(X0 - 6, py(10 ** e) + 4, e === 12 ? "1T" : e === 13 ? "10T" : e === 14 ? "100T" : e === 11 ? "100B" : "10B", "lab-fig-note", "end")).join("");
    const sx = 450;
    const rows = [["训练算力", sci(C)], ["预测 loss", f3(Lhere)], ["token / 参数", (D / N).toFixed(0)], ["同 loss 的最优模型", `${fmtN(twin.N)} × ${fmtD(twin.D)}`], ["训练算力倍数", `${f2(tax)}×`], ["推理回本点", breakeven > 0 ? `${fmtD(breakeven)} token` : "—"]]
      .map(([a, b], i) => `${text(sx, 58 + i * 34, a, "lab-fig-label")}${text(632, 58 + i * 34, b, "lab-fig-value", "end")}`).join("");
    const body = `<defs><clipPath id="${clipId}"><rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}"/></clipPath></defs>
      <rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="8" class="lab-fig-plane"/>
      <g clip-path="url(#${clipId})">${isoC}${levels}<path d="${contour(Lhere)}" class="lab-fig-path lab-stroke-blue"/><path d="M${path.join(" L")}" class="lab-fig-cut"/>
      <circle cx="${xy(px(twin.N))}" cy="${xy(py(twin.D))}" r="5" class="lab-fill-sage"/>
      <circle cx="${xy(px(N))}" cy="${xy(py(D))}" r="6.5" class="lab-fill-amber"/></g>
      ${ticksX}${ticksY}${text((X0 + X1) / 2, Y1 + 34, "参数量 N（对数轴）", "lab-fig-note", "middle")}
      ${text(X0, 18, "训练 token 数 D（对数轴）", "lab-fig-note")}
      ${text(sx, 30, "你的选择（橙点）", "lab-fig-title")}${rows}
      ${text(sx, 286, "绿点：同 loss 的算力最优；红虚线：最优路径", "lab-fig-note")}`;
    const side = tax < 1.05 ? "接近算力最优路径" : twin.N > N ? "在最优路径的左上方（小模型、多数据）" : "在最优路径的右下方（大模型、少数据）";
    return {
      type: "svg", svg: figure(640, 330, "参数量与训练数据平面上的等 loss 线、等算力线与算力最优路径", body),
      readout: `${fmtN(N)} × ${fmtD(D)}：loss ${f3(Lhere)}，训练算力是同 loss 最优方案的 ${f2(tax)} 倍${breakeven > 0 ? `，推理超过 ${fmtD(breakeven)} token 回本` : ""}`,
      explanation: `这个选择${side}。达到同样 loss 的算力最优模型是 ${fmtN(twin.N)} 参数训 ${fmtD(twin.D)} token，训练算力只需 ${sci(hi)}。${tax < 1.05 ? "训练算力几乎没有浪费：这就是 Chinchilla 意义下的最优。" : twin.N > N ? `你的模型更小，每个推理 token 少花 2 × (${fmtN(twin.N)} − ${fmtN(N)}) FLOPs，推理量超过约 ${fmtD(breakeven)} token 后，多花的训练算力就赚回来了。` : "你的模型比同 loss 的最优模型还大：训练多花了算力，推理也更贵，两头吃亏。"}（常数来自 Chinchilla 的数据，远离拟合范围时只作示意。）`,
    };
  },
};

export default { "6.1": isoflop, "6.1-overtrain": overtrain };
