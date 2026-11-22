// Labs for the M1 entry lessons: 1.0 attention from scratch (more lessons append here).
import { f2, pct, sci, clamp, xy, normals, figure, text } from "./math-kit.mjs";

/* ---------- 1.0 How sharp is the softmax? ---------- */
// One query against T random keys plus one "relevant" key whose raw score sits z standard deviations above the
// random ones. Scaling never changes the ranking; it changes how many keys share the weight (and the gradient).
const KEY_SEED = 1001;
function scoresFor(d, T, z) {
  const rand = normals(KEY_SEED + d * 7 + T);
  const q = Array.from({ length: d }, rand);
  const qn = Math.hypot(...q);
  const raw = [];
  for (let j = 0; j < T - 1; j++) {
    let s = 0;
    for (let i = 0; i < d; i++) s += q[i] * rand();
    raw.push(s);
  }
  // Relevant key: z·q̂ plus noise orthogonal to q, so q·k* = z·|q| ≈ z·√d, i.e. z standard deviations.
  return { raw, rel: z * qn };
}
function softmaxStats(values) {
  const m = Math.max(...values);
  const e = values.map(v => Math.exp(v - m));
  const Z = e.reduce((a, b) => a + b, 0);
  const p = e.map(v => v / Z);
  const H = -p.reduce((s, v) => s + (v > 0 ? v * Math.log(v) : 0), 0);
  return { p, H };
}
const attentionSharpness = {
  title: "softmax 的锐度：除以 √d 改变了什么",
  question: "一个 query 对 T 个随机 key 打分，其中一个“相关 key”的原始分数比随机 key 高出 z 个标准差。调头维度、缩放方式和信号强度，看权重怎样分布、相关 key 能分到多少权重。按 §2.3，它拿到的梯度正比于这个权重。",
  controls: [
    { key: "logd", label: "头维度 d", min: 4, max: 10, step: 1, initial: 7, format: v => String(2 ** v) },
    { key: "scale", label: "分数缩放", initial: "sqrt", options: [
      { value: "sqrt", label: "÷√d（标准）" }, { value: "none", label: "不缩放" }, { value: "d", label: "÷d（μP）" }] },
    { key: "keys", label: "key 的个数 T", initial: "1024", options: [
      { value: "64", label: "64" }, { value: "256", label: "256" }, { value: "1024", label: "1024" }] },
    { key: "z", label: "相关 key 高出几个标准差 z", min: 0, max: 6, step: 0.1, initial: 4, format: v => v.toFixed(1) + "σ" },
  ],
  presets: [
    { label: "标准设置", values: { logd: 7, scale: "sqrt", keys: "1024", z: 4 } },
    { label: "不缩放", values: { logd: 7, scale: "none", keys: "1024", z: 4 } },
    { label: "信号弱、不缩放", values: { logd: 7, scale: "none", keys: "1024", z: 2 } },
    { label: "信号弱、÷√d", values: { logd: 7, scale: "sqrt", keys: "1024", z: 2 } },
  ],
  check: {
    question: "缩放会改变哪个 key 排第一吗？那它到底改变了什么？",
    answer: "不会。所有分数除以同一个正数，排名不变。改变的是 softmax 的温度：不缩放时 d = 128 的分数标准差约 11，权重几乎全部压在排第一的一两个 key 上；按 ∂L/∂s_j = p_j·gᵀ(v_j − ȳ)，其余 key 的 p_j ≈ 0，拿不到学习信号。相关 key 如果不碰巧排第一，就几乎没有机会被梯度“发现”。除以 √d 后标准差回到 1，权重摊在几百个 key 上，每个 key 都有一份梯度。",
  },
  evaluate({ logd, scale, keys, z }) {
    const d = 2 ** logd, T = Number(keys);
    const { raw, rel } = scoresFor(d, T, z);
    const div = scale === "sqrt" ? Math.sqrt(d) : scale === "d" ? d : 1;
    const scores = [...raw, rel].map(s => s / div);
    const { p, H } = softmaxStats(scores);
    const pRel = p[T - 1];
    const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const rank = order.findIndex(([, i]) => i === T - 1) + 1;
    const mean = scores.reduce((a, b) => a + b, 0) / T;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / T);
    const eff = Math.exp(H), pMax = order[0][0];
    // Figure: sorted weights against rank, both on log axes.
    const X0 = 58, X1 = 380, Y0 = 34, Y1 = 250, LO = -12;
    const lx = r => X0 + Math.log10(r) / Math.log10(1024) * (X1 - X0);
    const ly = v => Y1 - (clamp(Math.log10(Math.max(v, 1e-300)), LO, 0) - LO) / -LO * (Y1 - Y0);
    const curve = order.map(([v], i) => `${xy(lx(i + 1))} ${xy(ly(v))}`);
    const area = `M${xy(lx(1))} ${Y1} L${curve.join(" L")} L${xy(lx(T))} ${Y1}Z`;
    const yTicks = [0, -3, -6, -9, -12].map(e => `<path d="M${X0} ${xy(ly(10 ** e))} H${X1}" class="lab-fig-gridline is-faint"/>${text(X0 - 6, ly(10 ** e) + 4, e === 0 ? "1" : `10${"⁻"}${String(-e).split("").map(c => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]).join("")}`, "lab-fig-note", "end")}`).join("");
    const xTicks = [1, 4, 16, 64, 256, 1024].filter(r => r <= T).map(r => `${text(lx(r), Y1 + 16, String(r), "lab-fig-note", "middle")}`).join("");
    const uni = ly(1 / T);
    const effX = lx(clamp(eff, 1, T));
    const relX = lx(rank), relY = ly(pRel);
    const sx = 410;
    const rows = [
      ["分数标准差", f2(sd)],
      ["最大权重", f2(pMax)],
      ["有效候选数 e^H", eff >= 10 ? eff.toFixed(0) : eff.toFixed(1)],
      ["相关 key 的排名", `第 ${rank} / ${T}`],
      ["相关 key 的权重", sci(pRel)],
      ["是平均份额的", pRel * T >= 0.01 ? `${sci(pRel * T)} 倍` : "≈ 0 倍"],
    ].map(([k, v], i) => `${text(sx, 70 + i * 30, k, "lab-fig-label")}${text(626, 70 + i * 30, v, i >= 3 ? "lab-fig-value is-accent" : "lab-fig-value", "end")}`).join("");
    const body = `${text(X0, 22, "每个 key 分到的权重（按大小排序，对数轴）", "lab-fig-title")}
      <rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" rx="10" class="lab-fig-plane"/>
      ${yTicks}${xTicks}${text((X0 + X1) / 2, Y1 + 34, "排名（对数轴）", "lab-fig-note", "middle")}
      <path d="${area}" class="lab-fig-post"/>
      <path d="M${X0} ${xy(uni)} H${X1}" class="lab-fig-band"/>${text(X1 - 4, uni - 6, `平均份额 1/${T}`, "lab-fig-note", "end")}
      <path d="M${xy(effX)} ${Y0} V${Y1}" class="lab-fig-cut"/>${text(effX + 5, Y0 + 14, "有效候选数", "lab-fig-note")}
      <circle cx="${xy(relX)}" cy="${xy(relY)}" r="6" class="lab-fill-amber"/>${text(relX + 9, relY - 8, "相关 key", "lab-fig-label")}
      ${text(sx, 36, `d = ${d}，${scale === "sqrt" ? "÷√d" : scale === "d" ? "÷d" : "不缩放"}`, "lab-fig-title")}${rows}`;
    const scaleNote = scale === "none"
      ? `不缩放时分数标准差约 √d = ${f2(Math.sqrt(d))}，softmax 被推向 one-hot：只有约 ${eff.toFixed(1)} 个 key 拿到可观的权重。`
      : scale === "d"
        ? `÷d 让初始分数的标准差只有 1/√d = ${f2(1 / Math.sqrt(d))}，注意力在初始化时几乎是均匀的；μP 这样做，是因为训练后 q 与 k 变得相关，点积按 d 增长。`
        : "÷√d 让分数标准差回到 1，与维度无关：权重摊在几百个 key 上。";
    const relNote = rank === 1
      ? `相关 key 排第 1，权重 ${sci(pRel)}。`
      : pRel * T >= 1
        ? `相关 key 排第 ${rank}，但权重仍有平均份额的 ${sci(pRel * T)} 倍，梯度能把它往上推。`
        : `相关 key 排第 ${rank}，权重只有 ${sci(pRel)}，几乎拿不到梯度：模型“看不见”它。`;
    return {
      type: "svg", svg: figure(640, 300, "注意力权重按排名的分布与相关 key 的位置", body),
      readout: `分数标准差 ${f2(sd)} · 有效候选数 ${eff >= 10 ? eff.toFixed(0) : eff.toFixed(1)} · 相关 key 第 ${rank}，权重 ${sci(pRel)}`,
      explanation: scaleNote + relNote + "缩放从不改变排名，只改变权重和梯度怎样在 key 之间分配。",
    };
  },
};

/* ---------- 1.0 FLOPs per token: matmul vs attention ---------- */
const MODELS = {
  gpt2: { name: "GPT-2 small", V: 50257, D: 768, L: 12, kv: 768, F: 3072, gated: false },
  l8: { name: "Llama-3-8B", V: 128256, D: 4096, L: 32, kv: 1024, F: 14336, gated: true },
  l70: { name: "Llama-3-70B", V: 128256, D: 8192, L: 80, kv: 1024, F: 28672, gated: true },
};
function costModel(m) {
  const attn = 2 * m.D * m.D + 2 * m.D * m.kv, ffn = (m.gated ? 3 : 2) * m.D * m.F;
  const matmul = m.L * (attn + ffn) + m.V * m.D;            // embedding lookup is free; the output head is not
  return { attn, ffn, matmul, perT: 4 * m.L * m.D, cross: 2 * matmul / (4 * m.L * m.D) };
}
const fmtT = t => t >= 1024 * 1024 ? (t / 1048576).toFixed(t % 1048576 ? 1 : 0) + "M" : t >= 1024 ? Math.round(t / 1024) + "K" : String(Math.round(t));
const flopsPerToken = {
  title: "每个 token 的算力：矩阵乘 vs 注意力",
  question: "矩阵乘的 FLOPs 只取决于参数量，与上下文无关；注意力打分和加权的 FLOPs 随上下文长度 t 线性增长。选一个模型、拉长上下文，看注意力在哪里反超。",
  controls: [
    { key: "model", label: "模型", initial: "l8", options: Object.entries(MODELS).map(([value, m]) => ({ value, label: m.name })) },
    { key: "logT", label: "上下文长度 t", min: 7, max: 20, step: 0.5, initial: 12, format: v => fmtT(2 ** v) },
  ],
  presets: [
    { label: "4K 对话", values: { model: "l8", logT: 12 } },
    { label: "128K 长文档", values: { model: "l8", logT: 17 } },
    { label: "70B · 128K", values: { model: "l70", logT: 17 } },
    { label: "GPT-2 · 1K", values: { model: "gpt2", logT: 10 } },
  ],
  check: {
    question: "GQA 把 K、V 的头数砍到 1/4，为什么上面这条注意力曲线一点都没变？",
    answer: "注意力的 FLOPs 来自每个 query 头和 t 个 key 做点积、再对 t 个 value 加权：所有 query 头的总维度仍是 D，所以每层仍是 4tD。GQA 省的是 K、V 投影的参数（一点点矩阵乘 FLOPs）和 KV cache 的显存与带宽，这在 decode 阶段才是瓶颈（→ 1.3）。",
  },
  evaluate({ model, logT }) {
    const m = MODELS[model], c = costModel(m), t = 2 ** logT;
    const grid = Array.from({ length: 53 }, (_, i) => 2 ** (7 + i * 0.25));
    const mm = 2 * c.matmul / 1e9, at = v => c.perT * v / 1e9;
    const share = at(t) / (mm + at(t));
    const layerShare = c.ffn / (c.attn + c.ffn);
    return {
      type: "lines", scaleX: "log", scaleY: "log", xLabel: "上下文长度 t（token）", yLabel: "每个 token 的前向 GFLOP",
      domainX: [128, 2 ** 20], domainY: [0.01, 4000],
      series: [
        { label: "矩阵乘 2·N", points: grid.map(v => [v, mm]) },
        { label: "注意力 4·L·t·D", points: grid.map(v => [v, at(v)]) },
        { label: "合计", points: grid.map(v => [v, mm + at(v)]) },
      ],
      markers: [{ x: c.cross, label: "交叉点" }],
      point: { x: t, y: mm + at(t), label: `t = ${fmtT(t)}` },
      readout: `${m.name}，t = ${fmtT(t)}：矩阵乘 ${sci(mm)} GFLOP，注意力 ${sci(at(t))} GFLOP，注意力占 ${pct(share, 0)}`,
      explanation: `参与矩阵乘的参数约 ${sci(c.matmul / 1e9)}B（每层注意力 ${sci(c.attn / 1e6)}M、FFN ${sci(c.ffn / 1e6)}M，FFN 占 ${pct(layerShare, 0)}；再加上输出头），每个 token 前向 ${sci(mm)} GFLOP。注意力每层每 token 4tD，在 t ≈ ${fmtT(c.cross)} 处追上矩阵乘。${t < c.cross ? "这里还在交叉点左侧：成本主要由模型大小决定。" : `这里已超过交叉点，注意力是矩阵乘的 ${f2(at(t) / mm)} 倍：成本主要由上下文长度决定。`}`,
    };
  },
};


/* ---------- 1.7 How much can a memory hold? ---------- */
function unitRows(rand, n, d) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = Float64Array.from({ length: d }, rand);
    const norm = Math.hypot(...r);
    rows.push(r.map(v => v / norm));
  }
  return rows;
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
// Mean cosine between v_i and the i-th row of P·V, where P projects onto the column space of Φ (N × m).
function projectionCos(phiRows, V) {
  const N = phiRows.length, m = phiRows[0].length, D = V[0].length;
  const basis = [];
  for (let c = 0; c < m; c++) {
    const col = Float64Array.from({ length: N }, (_, i) => phiRows[i][c]);
    const n0 = Math.hypot(...col);
    for (const q of basis) { const a = dot(q, col); for (let i = 0; i < N; i++) col[i] -= a * q[i]; }
    const n1 = Math.hypot(...col);
    if (n1 > 1e-9 * Math.max(n0, 1e-30)) basis.push(col.map(v => v / n1));
    if (basis.length === N) break;
  }
  const out = Array.from({ length: N }, () => new Float64Array(D));
  for (const q of basis) {
    for (let k = 0; k < D; k++) {
      let a = 0;
      for (let i = 0; i < N; i++) a += q[i] * V[i][k];
      for (let i = 0; i < N; i++) out[i][k] += a * q[i];
    }
  }
  return out.reduce((s, o, i) => s + dot(o, V[i]) / (Math.hypot(...o) || 1), 0) / N;
}
const memoryCapacity = {
  title: "一张记忆表能存多少对键值？",
  question: "随机单位键 k_i 对应随机单位值 v_i，存进三种记忆：赫布外积 W = Σ v_i k_iᵀ、线性最小二乘、先过一层宽 F 的随机 ReLU 隐藏层再做最小二乘。看取回的向量和目标有多像。",
  controls: [
    { key: "D", label: "键的维度 D", initial: "32", options: [{ value: "16", label: "16" }, { value: "32", label: "32" }, { value: "64", label: "64" }] },
    { key: "mult", label: "隐藏宽度 F", initial: "4", options: [{ value: "2", label: "2D" }, { value: "4", label: "4D" }] },
    { key: "logN", label: "存入条数 N", min: 2, max: 10, step: 0.25, initial: 6, format: v => String(Math.round(2 ** v)) },
  ],
  presets: [
    { label: "N = D", values: { D: "32", mult: "4", logN: 5 } },
    { label: "N = 2D", values: { D: "32", mult: "4", logN: 6 } },
    { label: "N = 4D", values: { D: "32", mult: "4", logN: 7 } },
    { label: "N = 8D", values: { D: "32", mult: "4", logN: 8 } },
  ],
  check: {
    question: "线性最小二乘为什么恰好在 N = D 处开始掉？加一层 ReLU 隐藏层为什么能把这条线推到 N = F？",
    answer: "线性记忆 W 只能把 D 维空间里的 N 个键映射出去：N ≤ D 且键线性无关时，方程组 W k_i = v_i 有精确解；超过 D，键之间必然线性相关，只能取回最小二乘意义下的投影，余弦约为 √(D/N)。ReLU 隐藏层把每个键映射到 F 维特征 relu(R k)，非线性让这 N 个特征向量在 N ≤ F 时仍线性无关，读出层于是能精确存下 F 条。每多一个隐藏单元，就多一个能独立存东西的维度，这就是 FFN 容量随宽度和参数增长的原因。",
  },
  evaluate({ D: dStr, mult, logN }) {
    const D = Number(dStr), F = D * Number(mult), N = Math.round(2 ** logN);
    const rand = normals(7000 + D * 3 + N);
    const K = unitRows(rand, N, D), V = unitRows(rand, N, D);
    const R = Array.from({ length: F }, () => Float64Array.from({ length: D }, rand));
    // Hebbian: W = Vᵀ K (D × D), retrieved row j = W k_j.
    const W = Array.from({ length: D }, (_, a) => Float64Array.from({ length: D }, (_, b) => K.reduce((s, k, i) => s + V[i][a] * k[b], 0)));
    const hebb = K.reduce((s, k, j) => { const o = W.map(row => dot(row, k)); return s + dot(o, V[j]) / Math.hypot(...o); }, 0) / N;
    const lin = projectionCos(K, V);
    const phi = K.map(k => Float64Array.from(R, r => Math.max(0, dot(r, k))));
    const rf = projectionCos(phi, V);
    const grid = Array.from({ length: 41 }, (_, i) => 4 * 256 ** (i / 40));
    return {
      type: "lines", scaleX: "log", xLabel: "存入条数 N", yLabel: "取回向量与目标的平均余弦", domainX: [4, 1024], domainY: [0, 1.05],
      series: [
        { label: "赫布外积（理论）", points: grid.map(n => [n, 1 / Math.sqrt(1 + (n - 1) / D)]) },
        { label: "线性最小二乘（理论）", points: grid.map(n => [n, Math.min(1, Math.sqrt(D / n))]) },
        { label: `ReLU 隐藏层 F = ${F}（理论）`, points: grid.map(n => [n, Math.min(1, Math.sqrt(F / n))]) },
      ],
      markers: [{ x: D, label: "N = D" }, { x: F, label: "N = F" }],
      point: { x: N, y: rf, label: `N = ${N} 实测` },
      readout: `N = ${N}：赫布 ${hebb.toFixed(3)}，线性最小二乘 ${lin.toFixed(3)}，ReLU 隐藏层 ${rf.toFixed(3)}（实测）`,
      explanation: `${N <= D ? `N ≤ D = ${D}：线性最小二乘和 ReLU 记忆都能精确取回，赫布外积已经有串扰（方差约 (N − 1)/D）。` : N <= F ? `N 超过了 D = ${D}，线性记忆只能取回投影（理论余弦 √(D/N) = ${Math.sqrt(D / N).toFixed(3)}）；ReLU 隐藏层把键映射到 ${F} 维非线性特征，仍能精确存下。` : `N 连 F = ${F} 也超过了，三种记忆都开始丢信息；ReLU 记忆的理论余弦是 √(F/N) = ${Math.sqrt(F / N).toFixed(3)}。`}曲线是理论值，圆点是这一组随机键值的实测（ReLU 隐藏层）。`,
    };
  },
};

/* ---------- 1.7 Rank-one edit: naive vs ROME ---------- */
function solveSym(A, b) {
  // Gaussian elimination with partial pivoting on a small dense system.
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
const romeEdit = {
  title: "写入一条新事实：朴素秩一更新 vs ROME",
  question: "一层 FFN 的输出矩阵 W 精确存着若干条旧事实（键 k_i → 值 v_i）。所有键共享一个公共分量 μ（真实网络的激活就是这样）。写入一条新事实，比较两种秩一更新对旧事实的误伤：沿 k* 改（等价于只在新事实上微调），或沿 C⁻¹k* 改（ROME）。",
  controls: [
    { key: "shared", label: "公共分量的长度 ‖μ‖/√D", min: 0, max: 3, step: 0.1, initial: 1 },
    { key: "D", label: "维度 D（存 3D/4 条旧事实）", initial: "32", options: [{ value: "16", label: "16" }, { value: "32", label: "32" }, { value: "64", label: "64" }] },
    { key: "seed", label: "换一组事实", initial: "1", options: [{ value: "1", label: "第 1 组" }, { value: "2", label: "第 2 组" }, { value: "3", label: "第 3 组" }] },
  ],
  presets: [
    { label: "各向同性的键", values: { shared: 0, D: "32" } },
    { label: "公共分量 = 1", values: { shared: 1, D: "32" } },
    { label: "公共分量 = 2.5", values: { shared: 2.5, D: "32" } },
    { label: "高维 D = 64", values: { shared: 1, D: "64" } },
  ],
  check: {
    question: "为什么各向同性时两种更新的误伤一样大，而键共享公共分量时朴素更新会误伤所有旧事实？",
    answer: "旧键 k_j 的输出变化是 r·(u·k_j)。朴素更新 u = k*/‖k*‖²：若所有键都约等于 μ + 噪声，k*·k_j ≈ ‖μ‖²，每条旧事实都被推向同一个方向。ROME 用 u = C⁻¹k*/(k*ᵀC⁻¹k*)，C = E[kkᵀ] = I + μμᵀ，C⁻¹ 恰好把公共分量压掉（白化），剩下的内积只有 1/√D 量级。各向同性时 C = I，两者完全相同；这时的误伤只能靠提高维度来降。",
  },
  evaluate({ shared, D: dStr, seed }) {
    const D = Number(dStr), N = D * 3 / 4;
    const rand = normals(9100 + D * 13 + Number(seed) * 101);
    const dir = Float64Array.from({ length: D }, rand), dn = Math.hypot(...dir);
    const mu = dir.map(v => v / dn * shared * Math.sqrt(D));
    const key = () => Float64Array.from({ length: D }, (_, i) => mu[i] + rand());
    const K = Array.from({ length: N }, key), V = Array.from({ length: N }, () => Float64Array.from({ length: D }, rand));
    const kNew = key(), vNew = Float64Array.from({ length: D }, rand);
    // W = Vᵀ (K Kᵀ)⁻¹ K stores the N facts exactly; W k* = Vᵀ α with (K Kᵀ) α = K k*.
    const G = K.map(a => K.map(b => dot(a, b)));
    const alpha = solveSym(G, K.map(k => dot(k, kNew)));
    const Wk = Float64Array.from({ length: D }, (_, c) => V.reduce((s, v, i) => s + v[c] * alpha[i], 0));
    const rNorm = Math.hypot(...vNew.map((v, i) => v - Wk[i]));
    const mu2 = dot(mu, mu);
    const cInv = k => { const a = dot(mu, k) / (1 + mu2); return k.map((v, i) => v - a * mu[i]); };   // (I + μμᵀ)⁻¹ k
    const ck = cInv(kNew), uNaive = kNew.map(v => v / dot(kNew, kNew)), uRome = ck.map(v => v / dot(ck, kNew));
    const drift = u => K.map((k, j) => rNorm * Math.abs(dot(u, k)) / Math.hypot(...V[j]));
    const dn1 = drift(uNaive), dr1 = drift(uRome);
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const top = Math.max(0.3, ...dn1, ...dr1);
    const X0 = 70, X1 = 620, bw = (X1 - X0) / N;
    const row = (vals, y0, h, cls, label) => `${text(X0 - 10, y0 + h / 2 + 4, label, "lab-fig-label", "end")}
      <path d="M${X0} ${y0 + h} H${X1}" class="lab-fig-gridline"/>
      ${vals.map((v, i) => { const bh = Math.min(h, v / top * h); return `<rect x="${xy(X0 + i * bw + bw * 0.18)}" y="${xy(y0 + h - bh)}" width="${xy(bw * 0.64)}" height="${xy(Math.max(bh, 0.6))}" rx="${xy(Math.min(3, bw * 0.2))}" class="${cls}"/>`; }).join("")}
      ${text(X1, y0 - 4, `平均 ${pct(mean(vals), 1)}`, "lab-fig-value", "end")}`;
    const body = `${text(X0, 22, `${N} 条旧事实各自被推偏多少（按目标值长度归一化，同一刻度，满格 = ${pct(top, 0)}）`, "lab-fig-title")}
      ${row(dn1, 52, 92, "lab-fill-rose is-soft", "朴素")}${row(dr1, 186, 92, "lab-fill-blue is-soft", "ROME")}
      ${text(X0, 304, `两种更新写入新事实的误差都是 0（秩一更新精确满足 Ŵk* = v*），差别只在旧事实上。`, "lab-fig-note")}`;
    return {
      type: "svg", svg: figure(640, 316, "朴素秩一更新与 ROME 更新对每条旧事实的误伤", body),
      readout: `旧事实平均偏移：朴素 ${pct(mean(dn1), 1)}，ROME ${pct(mean(dr1), 1)}（D = ${D}，公共分量 ${shared.toFixed(1)}）`,
      explanation: shared < 0.05
        ? `键各向同性时 C = I，ROME 与朴素更新完全相同。剩下的误伤来自 ${D} 维里随机方向的内积（约 1/√D = ${(1 / Math.sqrt(D)).toFixed(2)}），只能靠更高的维度降低。`
        : `公共分量让任意两个键的点积都约等于 ‖μ‖²，朴素更新（= 只在新事实上微调）把每条旧事实都往同一个方向推。ROME 用 C⁻¹ = (I + μμᵀ)⁻¹ 先压掉公共分量，误伤回到 1/√D 量级。维度越高，ROME 越“局部”。`,
    };
  },
};

/* ---------- 1.8 BPE merge replay ---------- */
const BPE_TEXT = [
  "The model never sees letters. It sees integers, and each integer stands for a token.",
  "A tokenizer decides where one token ends and where the next token begins.",
  "The tokenizer is trained before the model is trained, and then the tokenizer is frozen.",
  "Training the tokenizer means counting the pairs of symbols that appear next to each other,",
  "merging the most frequent pair into a new symbol, and then counting the pairs again.",
  "Every merge adds one new token to the vocabulary and makes the sequences a little shorter.",
  "After many merges, the most frequent words become single tokens, and the rare words stay split into pieces.",
  "The model then learns one vector for every token in the vocabulary.",
  "A larger vocabulary means shorter sequences for the model, but a larger table of vectors.",
  "The tokenizer and the model are trained on different text, so some tokens are rare for the model.",
  "When the model sees a rare token, the vector for that token has hardly been trained.",
  "Numbers are split into tokens too, and the way the numbers are split changes how the model adds them.",
].join(" ");
const BPE_SAMPLE = "The tokenizer merges the most frequent pairs of symbols into new tokens.";
const BPE_SPLIT = / ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+/g;
const MAX_MERGES = 160;
const BPE = (() => {
  const counts = new Map();
  for (const w of BPE_TEXT.match(BPE_SPLIT)) counts.set(w, (counts.get(w) ?? 0) + 1);
  let words = [...counts].map(([w, f]) => ({ syms: [...w], f }));
  const merges = [];
  for (let k = 0; k < MAX_MERGES; k++) {
    const pairs = new Map();
    for (const { syms, f } of words) for (let i = 0; i + 1 < syms.length; i++) {
      const key = syms[i] + "\u0000" + syms[i + 1];
      pairs.set(key, (pairs.get(key) ?? 0) + f);
    }
    let best = null, bestN = 0;
    for (const [key, n] of pairs) if (n > bestN) { best = key; bestN = n; }   // ties: first seen
    if (!best || bestN < 2) break;   // a pair seen once is not a pattern
    const [a, b] = best.split("\u0000");
    merges.push({ a, b, n: bestN });
    words = words.map(({ syms, f }) => {
      const out = [];
      for (let i = 0; i < syms.length; i++) {
        if (i + 1 < syms.length && syms[i] === a && syms[i + 1] === b) { out.push(a + b); i++; } else out.push(syms[i]);
      }
      return { syms: out, f };
    });
  }
  const base = new Set(BPE_TEXT);
  return { merges, baseSize: base.size };
})();
function bpeEncode(text, merges) {
  const rank = new Map(merges.map((m, i) => [m.a + "\u0000" + m.b, i]));
  return text.match(BPE_SPLIT).flatMap(w => {
    const syms = [...w];
    while (syms.length > 1) {
      let best = -1, bestRank = Infinity;
      for (let i = 0; i + 1 < syms.length; i++) {
        const r = rank.get(syms[i] + "\u0000" + syms[i + 1]);
        if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
      }
      if (best < 0) break;
      syms.splice(best, 2, syms[best] + syms[best + 1]);
    }
    return syms;
  });
}
const bpeReplay = {
  title: "BPE 合并回放：一步步把字符合成词",
  question: "在一小段英文语料上训练 BPE：每一步把最常相邻的一对符号合并成新符号。拖动合并次数，看例句怎样被切开、词表怎样变大、序列怎样变短。空格粘在后面的词上，用 ▁ 表示。",
  controls: [
    { key: "k", label: "合并次数", min: 0, max: BPE.merges.length, step: 1, initial: 40, format: v => String(v) },
  ],
  presets: [
    { label: "只有字符", values: { k: 0 } },
    { label: "10 次", values: { k: 10 } },
    { label: "60 次", values: { k: 60 } },
    { label: `全部 ${BPE.merges.length} 次`, values: { k: BPE.merges.length } },
  ],
  check: {
    question: "例句里的 frequent、tokens 在语料中出现过，merges 却是新词形。为什么合并到最后，前两个能成为整 token，merges 仍然是碎片？",
    answer: "BPE 只会合并训练语料里频繁出现的相邻对。语料里有 frequent 和 token(s)，它们的字符对被一步步合并成整词；merges 只以 merging、merge 的形式出现，“merg”这一段可能已经合并，但 “es” 结尾的组合在语料里不够多，或排在合并表很靠后。编码时按合并表的先后重放，用不上的合并就停在碎片状态。真实分词器在几百 GB 语料上做十几万次合并，常见词都会变成整 token，罕见词才拆开。",
  },
  evaluate({ k: raw }) {
    const k = Math.min(raw, BPE.merges.length), used = BPE.merges.slice(0, k);
    const sample = bpeEncode(BPE_SAMPLE, used);
    const corpusTokens = bpeEncode(BPE_TEXT, used).length;
    const chars = [...BPE_TEXT].length;
    // Lay the sample's tokens out as chips with wrapping.
    const CW = 8.4, PAD = 7, H = 30, GAP = 6, X0 = 20, XMAX = 620;
    let x = X0, y = 46;
    const chips = sample.map((tok, i) => {
      const label = tok.replace(/ /g, "▁");
      const w = [...label].length * CW + PAD * 2;
      if (x + w > XMAX) { x = X0; y += H + 10; }
      const fresh = k > 0 && tok === used[k - 1].a + used[k - 1].b;
      const out = `<rect x="${xy(x)}" y="${y}" width="${xy(w)}" height="${H}" rx="8" class="${fresh ? "lab-fill-amber is-soft" : i % 2 ? "lab-fill-sage is-soft" : "lab-fill-blue is-soft"}"/>${text(x + w / 2, y + 20, label, "lab-fig-mono", "middle")}`;
      x += w + GAP;
      return out;
    }).join("");
    const listY = Math.max(y + H + 44, 150);
    const recent = used.slice(-6).map((m, i, arr) => {
      const idx = k - arr.length + i + 1;
      return `${text(X0, listY + 26 + i * 22, `#${idx}`, "lab-fig-note")}${text(X0 + 44, listY + 26 + i * 22, `${m.a.replace(/ /g, "▁")} + ${m.b.replace(/ /g, "▁")} → ${(m.a + m.b).replace(/ /g, "▁")}`, "lab-fig-mono")}${text(X0 + 330, listY + 26 + i * 22, `${m.n} 次`, "lab-fig-value", "end")}`;
    }).join("");
    const sx = 400;
    const stats = [["词表大小", `${BPE.baseSize} + ${k} = ${BPE.baseSize + k}`], ["例句 token 数", String(sample.length)], ["语料 token 数", String(corpusTokens)], ["语料每 token 字符数", (chars / corpusTokens).toFixed(2)]]
      .map(([a, b], i) => `${text(sx, listY + 26 + i * 26, a, "lab-fig-label")}${text(620, listY + 26 + i * 26, b, "lab-fig-value", "end")}`).join("");
    const h = listY + 26 + 6 * 22 + 10;
    const body = `${text(X0, 26, `例句的切分（第 ${k} 次合并后）`, "lab-fig-title")}${chips}
      ${text(X0, listY, k ? "最近的合并（按先后）" : "还没有合并：每个字符都是一个 token", "lab-fig-title")}${recent}${stats}`;
    return {
      type: "svg", svg: figure(640, h, "BPE 合并若干次后例句的切分、最近的合并与统计", body),
      readout: `${k} 次合并：词表 ${BPE.baseSize + k}，例句 ${sample.length} 个 token，语料平均每 token ${(chars / corpusTokens).toFixed(2)} 个字符`,
      explanation: k === 0
        ? "没有合并时，每个字符（包括空格）都是一个 token，序列最长。"
        : `第 ${k} 次合并是“${used[k - 1].a.replace(/ /g, "▁")} + ${used[k - 1].b.replace(/ /g, "▁")}”（在语料里相邻出现 ${used[k - 1].n} 次）。最早的合并是高频的字母对和“空格 + 首字母”，然后是常见的词根和整词。每次合并让词表加一、序列变短；语料里没出现过的词形只能停在碎片状态。`,
    };
  },
};

/* ---------- 1.8 Digit grouping and place value ---------- */
const DIGITS_A = "73829164508271", DIGITS_B = "40617295834106";
function groupDigits(s, scheme) {
  if (scheme === "single") return [...s];
  const out = [];
  if (scheme === "l2r") for (let i = 0; i < s.length; i += 3) out.push(s.slice(i, i + 3));
  else for (let i = s.length; i > 0; i -= 3) out.unshift(s.slice(Math.max(0, i - 3), i));
  return out;
}
const placeNames = ["个", "十", "百", "千", "万", "十万", "百万", "千万", "亿", "十亿", "百亿", "千亿", "万亿", "十万亿", "百万亿"];
const digitGrouping = {
  title: "数字怎么切：位值对齐了吗？",
  question: "两个数做加法，竖式要求同一位值上下对齐。看三种切分方式下，每个数字 token 覆盖哪几位：单个数字一个 token、从左往右每 3 位一组（cl100k / o200k 的做法）、从右往左每 3 位一组（等价于加千分位逗号）。",
  controls: [
    { key: "a", label: "第一个数的位数", min: 1, max: 12, step: 1, initial: 7, format: v => `${v} 位` },
    { key: "b", label: "第二个数的位数", min: 1, max: 12, step: 1, initial: 5, format: v => `${v} 位` },
    { key: "scheme", label: "切分方式", initial: "l2r", options: [
      { value: "single", label: "单个数字" }, { value: "l2r", label: "左起 3 位一组" }, { value: "r2l", label: "右起 3 位一组" }] },
  ],
  presets: [
    { label: "7 位 + 5 位 · 左起", values: { a: 7, b: 5, scheme: "l2r" } },
    { label: "7 位 + 5 位 · 右起", values: { a: 7, b: 5, scheme: "r2l" } },
    { label: "6 位 + 3 位 · 左起", values: { a: 6, b: 3, scheme: "l2r" } },
    { label: "单个数字", values: { a: 7, b: 5, scheme: "single" } },
  ],
  check: {
    question: "左起 3 位一组时，什么情况下两个数的 token 边界恰好对齐？",
    answer: "当两个数的位数除以 3 的余数相同时。左起分组的边界由数的长度决定：7 位数切成 3+3+1，个位落在一个单独的 token 里；5 位数切成 3+2，个位和十位在同一个 token 里。两者错开，模型做竖式时得先弄清每个 token 代表哪几位。右起分组（加千分位逗号）和单个数字切分，边界都只取决于位值，所以永远对齐。",
  },
  evaluate({ a, b, scheme }) {
    const A = DIGITS_A.slice(0, a), B = DIGITS_B.slice(0, b);
    const sum = (BigInt(A) + BigInt(B)).toString();
    const rows = [["第一个数", A], ["第二个数", B], ["和", sum]].map(([name, s]) => ({ name, s, toks: groupDigits(s, scheme) }));
    const width = Math.max(...rows.map(r => r.s.length));
    const CW = 34, X1 = 600, X0 = X1 - width * CW;
    // Boundaries are measured as place values (digits from the right) where a token ends.
    const bounds = toks => { const out = new Set(); let pos = 0; for (let i = toks.length - 1; i > 0; i--) { pos += toks[i].length; out.add(pos); } return out; };
    const ba = bounds(rows[0].toks), bb = bounds(rows[1].toks), overlap = Math.min(a, b);
    const mismatched = [...new Set([...ba, ...bb])].filter(p => p < overlap && ba.has(p) !== bb.has(p));
    const head = Array.from({ length: width }, (_, i) => text(X1 - (i + 0.5) * CW, 40, placeNames[i] ?? "", "lab-fig-note", "middle")).join("");
    const drawRow = (r, y) => {
      let col = r.s.length;
      return `${text(X0 - 14, y + 23, r.name, "lab-fig-label", "end")}` + r.toks.map((tok, i) => {
        const start = col; col -= tok.length;
        const left = X1 - start * CW, w = tok.length * CW;
        return `<rect x="${xy(left + 2)}" y="${y}" width="${xy(w - 4)}" height="34" rx="9" class="${i % 2 ? "lab-fill-sage is-soft" : "lab-fill-blue is-soft"}"/>` +
          [...tok].map((d, j) => text(left + (j + 0.5) * CW, y + 23, d, "lab-fig-op", "middle")).join("");
      }).join("");
    };
    const guides = mismatched.map(p => `<path d="M${X1 - p * CW} 52 V${52 + 2 * 48 - 10}" class="lab-fig-cut"/>`).join("");
    const body = `${text(20, 22, "按位值对齐的竖式（同色块 = 一个 token）", "lab-fig-title")}${head}
      ${drawRow(rows[0], 52)}${drawRow(rows[1], 100)}<path d="M${X0 - 6} 146 H${X1}" class="lab-fig-gridline"/>${drawRow(rows[2], 156)}${guides}
      ${text(20, 222, mismatched.length ? `红色虚线：一个数在这里断开、另一个数没有，共 ${mismatched.length} 处错位` : "两个数的 token 边界在重叠的位上完全一致", "lab-fig-note")}`;
    const name = { single: "单个数字", l2r: "左起 3 位一组", r2l: "右起 3 位一组" }[scheme];
    return {
      type: "svg", svg: figure(640, 236, "两个数及其和按位值对齐，显示每种切分方式下的 token 边界", body),
      readout: `${name}：${rows.map(r => `${r.name} ${r.toks.length} 个 token`).join("，")}；${mismatched.length ? `${mismatched.length} 处边界错位` : "边界对齐"}`,
      explanation: scheme === "l2r"
        ? `左起分组的边界由数的长度决定：${a} 位数切成 ${rows[0].toks.map(t => t.length).join("+")}，${b} 位数切成 ${rows[1].toks.map(t => t.length).join("+")}。${a % 3 === b % 3 ? "两个长度除以 3 的余数相同，碰巧对齐。" : "余数不同，同一位值落在不同形状的 token 里，模型做竖式前得先“拆包”。"}`
        : scheme === "r2l"
          ? "右起分组的边界只取决于位值（个十百 | 千万十万 | ……），任何长度的数都对齐，这就是加千分位逗号能提高算术正确率的原因。"
          : "每个数字一个 token，位值天然对齐，代价是序列更长：一个 12 位数要 12 个 token。",
    };
  },
};

export {
  attentionSharpness as "1.0",
  flopsPerToken as "1.0-cost",
  memoryCapacity as "1.7",
  romeEdit as "1.7-edit",
  bpeReplay as "1.8",
  digitGrouping as "1.8-digits",
};
