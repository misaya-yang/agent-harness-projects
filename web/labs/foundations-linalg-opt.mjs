// Labs for 0.1 (linear algebra) and 0.6 (optimization). Matrices are small enough to decompose exactly in the
// browser; optimizer runs use the same update rules as PyTorch, on a quadratic whose curvature we choose.
import { f2, f3, pct, sci, grid, clamp, xy, normals, figure, text } from "./math-kit.mjs";

/* ---------- 0.1 SVD of a 2×2 matrix ---------- */
function svd2(a, b, c, d) {
  const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
  const mid = (p + r) / 2, rad = Math.hypot((p - r) / 2, q);
  const s1 = Math.sqrt(mid + rad), s2 = Math.sqrt(Math.max(mid - rad, 0));
  const th = 0.5 * Math.atan2(2 * q, p - r);
  const v1 = [Math.cos(th), Math.sin(th)], v2 = [-Math.sin(th), Math.cos(th)];
  const apply = v => [a * v[0] + b * v[1], c * v[0] + d * v[1]];
  const u1 = s1 > 1e-9 ? apply(v1).map(x => x / s1) : [1, 0];
  const u2 = s2 > 1e-9 ? apply(v2).map(x => x / s2) : [-u1[1], u1[0]];
  return { s1, s2, v1, v2, u1, u2, th, reflect: u1[0] * u2[1] - u1[1] * u2[0] < 0 };
}
const STAGES = [
  ["① 输入：单位圆", "琥珀与绿色箭头是右奇异向量 v₁、v₂：A 会把它们送到椭圆的两条主轴上。"],
  ["② 乘 Vᵀ：旋转", "Vᵀ 是旋转，圆还是圆；v₁、v₂ 被转到坐标轴上。"],
  ["③ 乘 Σ：沿坐标轴拉伸", "Σ 是对角阵：横轴拉伸 σ₁ 倍，纵轴拉伸 σ₂ 倍，圆变成正放的椭圆。"],
  ["④ 乘 U：再旋转", "U 把椭圆转到最终位置。结果与直接乘 A 完全相同。"],
];
const svdLab = {
  title: "SVD：任何矩阵都是“旋转-拉伸-旋转”",
  question: "拖动 2×2 矩阵 A 的四个元素，把单位圆分三步送到椭圆：先乘 Vᵀ，再乘 Σ，最后乘 U。看奇异值、谱范数和条件数怎么变，再把它截断成秩 1。",
  controls: [
    { key: "a", label: "A₁₁", min: -2, max: 2, step: 0.1, initial: 1.4, format: v => v.toFixed(1) },
    { key: "b", label: "A₁₂", min: -2, max: 2, step: 0.1, initial: 0.9, format: v => v.toFixed(1) },
    { key: "c", label: "A₂₁", min: -2, max: 2, step: 0.1, initial: 0.2, format: v => v.toFixed(1) },
    { key: "d", label: "A₂₂", min: -2, max: 2, step: 0.1, initial: 1, format: v => v.toFixed(1) },
    { key: "stage", label: "分解步骤", initial: "3", options: [{ value: "0", label: "① 单位圆" }, { value: "1", label: "② Vᵀ" }, { value: "2", label: "③ Σ" }, { value: "3", label: "④ U" }] },
    { key: "rank", label: "秩", initial: "full", options: [{ value: "full", label: "完整" }, { value: "one", label: "截断成秩 1" }] },
  ],
  presets: [
    { label: "剪切", values: { a: 1, b: 1, c: 0, d: 1 } },
    { label: "两列几乎平行", values: { a: 1, b: 1, c: 1, d: 1.1 } },
    { label: "纯旋转", values: { a: 0.8, b: -0.6, c: 0.6, d: 0.8 } },
    { label: "带翻转", values: { a: 1.2, b: 0.4, c: 0.6, d: -0.9 } },
  ],
  check: {
    question: "把 A 调成两列几乎平行（预设“两列几乎平行”），椭圆和 σ₂ 怎么变？这对求解 Ax = b 意味着什么？",
    answer: "两列几乎平行时单位圆被压成细长的椭圆：σ₁ ≈ 2.05，σ₂ ≈ 0.05，条件数约 42。解 x = A⁻¹b 时，b 沿 u₂ 方向的一点误差会被放大 1/σ₂ ≈ 20 倍。截断成秩 1 只丢掉 σ₂ 那一份，误差 ‖A − A₁‖₂ = σ₂，所以这个矩阵“几乎就是秩 1”。",
  },
  evaluate({ a, b, c, d, stage, rank }) {
    const k = Number(stage), one = rank === "one";
    const { s1, s2: rawS2, v1, v2, u1, u2, reflect } = svd2(a, b, c, d);
    const s2 = one ? 0 : rawS2;
    // Where a point of the plane is after stage k: x → Vᵀx → ΣVᵀx → UΣVᵀx.
    const vt = p => [v1[0] * p[0] + v1[1] * p[1], v2[0] * p[0] + v2[1] * p[1]];
    const sig = p => [s1 * p[0], s2 * p[1]];
    const uu = p => [u1[0] * p[0] + u2[0] * p[1], u1[1] * p[0] + u2[1] * p[1]];
    const map = p => k === 0 ? p : k === 1 ? vt(p) : k === 2 ? sig(vt(p)) : uu(sig(vt(p)));
    // Scale so the final ellipse fills the plane; the dashed unit circle keeps the size reference.
    const S = Math.min(62, 140 / Math.max(s1, 1.05)), ox = 172, oy = 170, R = 150 / S;
    const px = x => xy(ox + clamp(x, -R, R) * S), py = y => xy(oy - clamp(y, -R, R) * S);
    const shape = "M" + grid(0, 2 * Math.PI, 121).map(t => { const [x, y] = map([Math.cos(t), Math.sin(t)]); return `${px(x)} ${py(y)}`; }).join(" L") + "Z";
    const arrow = (p, cls, head, label) => {
      const [x, y] = p, n = Math.hypot(x, y);
      const lx = x + (n > 1e-6 ? x / n : 0) * 0.32, ly = y + (n > 1e-6 ? y / n : 0) * 0.32;
      return `<path d="M${px(0)} ${py(0)} L${px(x)} ${py(y)}" class="${cls}" marker-end="url(#${head})"/>${text(px(lx), py(ly) + 4, label, "lab-fig-label", "middle")}`;
    };
    const names = [["v₁", "v₂"], ["Vᵀv₁", "Vᵀv₂"], ["σ₁e₁", "σ₂e₂"], ["σ₁u₁", "σ₂u₂"]][k];
    const basis = [[1, 0], [0, 1]].map((e, i) => {
      const [x, y] = map(e);
      return `<path d="M${px(0)} ${py(0)} L${px(x)} ${py(y)}" class="lab-fig-basis"/><circle cx="${px(x)}" cy="${py(y)}" r="3" class="lab-fig-basis-dot"/>${text(px(x) + 6, py(y) - 6, k === 3 ? `Ae${i ? "₂" : "₁"}` : `e${i ? "₂" : "₁"}`, "lab-fig-note")}`;
    }).join("");
    const kappa = s2 > 1e-9 ? s1 / s2 : Infinity, det = a * d - b * c;
    const row = (x, y) => `${x < 0 ? "−" : " "}${Math.abs(x).toFixed(2)}  ${y < 0 ? "−" : " "}${Math.abs(y).toFixed(2)}`;
    const deg = v => (Math.atan2(v[1], v[0]) * 180 / Math.PI).toFixed(0) + "°";
    const body = `<defs>
        <marker id="svd-a" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="lab-fill-amber"/></marker>
        <marker id="svd-b" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="lab-fill-sage"/></marker>
      </defs>
      <rect x="${px(-R)}" y="${py(R)}" width="${xy(2 * R * S)}" height="${xy(2 * R * S)}" rx="14" class="lab-fig-plane"/>
      <path d="M${px(-R)} ${py(0)} H${px(R)} M${px(0)} ${py(-R)} V${py(R)}" class="lab-fig-gridline"/>
      <circle cx="${px(0)}" cy="${py(0)}" r="${S}" class="lab-fig-ghost"/>
      <path d="${shape}" class="lab-fig-shape"/>
      ${basis}${arrow(map(v1), "lab-fig-axis-vec", "svd-a", names[0])}${one && k >= 2 ? "" : arrow(map(v2), "lab-fig-axis-vec is-second", "svd-b", names[1])}
      <g transform="translate(372 34)">
        ${text(0, 0, STAGES[k][0], "lab-fig-title")}
        ${text(0, 30, "A =", "lab-fig-mono")}${text(36, 22, `⎡${row(a, b)} ⎤`, "lab-fig-mono")}${text(36, 40, `⎣${row(c, d)} ⎦`, "lab-fig-mono")}
        ${text(0, 76, `σ₁ = ${f2(s1)}　σ₂ = ${f2(rawS2)}${one ? "（已截掉）" : ""}`, "lab-fig-value")}
        ${text(0, 98, `v₁ 朝 ${deg(v1)}，u₁ 朝 ${deg(u1)}${reflect ? "；U 含一次翻转" : ""}`, "lab-fig-note")}
        ${text(0, 128, `谱范数 ‖A‖₂ = σ₁ = ${f2(s1)}`, "lab-fig-note")}
        ${text(0, 148, `条件数 κ = σ₁/σ₂ = ${sci(rawS2 > 1e-9 ? s1 / rawS2 : Infinity)}`, "lab-fig-note")}
        ${text(0, 168, `|det A| = σ₁σ₂ = ${f2(Math.abs(det))}（面积缩放倍数）`, "lab-fig-note")}
        ${one ? `${text(0, 202, "秩 1 近似 A₁ = σ₁u₁v₁ᵀ", "lab-fig-title")}${text(0, 224, `误差 ‖A − A₁‖₂ = σ₂ = ${f2(rawS2)}`, "lab-fig-value")}${text(0, 244, "单位圆被压成一条线段：只剩最大那次拉伸", "lab-fig-note")}` : ""}
        ${text(0, 282, "虚线圆：单位圆　灰点：e₁、e₂ 的去向", "lab-fig-note")}
      </g>`;
    return {
      type: "svg", svg: figure(640, 340, "单位圆经过 Vᵀ、Σ、U 三步变成椭圆", body),
      readout: `σ₁ = ${f2(s1)}，σ₂ = ${f2(rawS2)}，条件数 ${sci(rawS2 > 1e-9 ? s1 / rawS2 : Infinity)}${one ? `；秩 1 近似的误差 = σ₂ = ${f2(rawS2)}` : ""}`,
      explanation: `${STAGES[k][1]}${k === 3 && !one ? `椭圆的长半轴 σ₁ = ${f2(s1)} 是 A 能把单位向量拉到的最长长度（谱范数），短半轴 σ₂ = ${f2(rawS2)} 是最短长度。` : ""}${one ? "截断后只保留 σ₁u₁v₁ᵀ：所有输入都被投到 v₁ 上，再沿 u₁ 输出。Eckart–Young 定理保证，在所有秩 1 矩阵里它离 A 最近。" : ""}${Number.isFinite(kappa) && kappa > 20 ? "条件数很大：椭圆又细又长，沿短轴方向的信息几乎被压没了。" : ""}`,
    };
  },
};

/* ---------- 0.1 Low-rank approximation (Eckart–Young) ---------- */
function jacobiSvd(A) {
  const m = A.length, n = A[0].length, U = A.map(row => row.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 40; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      let al = 0, be = 0, ga = 0;
      for (let i = 0; i < m; i++) { al += U[i][p] ** 2; be += U[i][q] ** 2; ga += U[i][p] * U[i][q]; }
      if (ga === 0 || Math.abs(ga) <= 1e-14 * Math.sqrt(al * be)) continue;
      off = Math.max(off, Math.abs(ga) / Math.sqrt(al * be));
      const zeta = (be - al) / (2 * ga), t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
      const cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
      for (let i = 0; i < m; i++) { const x = U[i][p], y = U[i][q]; U[i][p] = cs * x - sn * y; U[i][q] = sn * x + cs * y; }
      for (let i = 0; i < n; i++) { const x = V[i][p], y = V[i][q]; V[i][p] = cs * x - sn * y; V[i][q] = sn * x + cs * y; }
    }
    if (off < 1e-12) break;
  }
  return Array.from({ length: n }, (_, j) => {
    const s = Math.hypot(...U.map(row => row[j]));
    return { s, u: U.map(row => row[j] / (s || 1)), v: V.map(row => row[j]) };
  }).sort((x, y) => y.s - x.s);
}
const N = 24;
const MATRICES = (() => {
  const z = normals(11), noise = () => Array.from({ length: N }, () => Array.from({ length: N }, () => z()));
  // A ring, a diagonal stroke and a blob: smooth parts compress well, the diagonal needs many components.
  const picture = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
    const ring = Math.exp(-((Math.hypot(i - 10, j - 13) - 6.5) ** 2) / (2 * 1.3 ** 2));
    const stroke = Math.exp(-((i - 0.8 * j - 3) ** 2) / (2 * 1.1 ** 2)) * (j > 3 && j < 22 ? 1 : 0.2);
    return ring + 0.8 * stroke + 0.9 * Math.exp(-((i - 18) ** 2 + (j - 5) ** 2) / 8);
  }));
  const wave = k => Array.from({ length: N }, (_, i) => Math.sin((i + 0.5) * Math.PI * k / N + k));
  const e = noise(), strengths = [5.2, 3.4, 2.1];
  const lora = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) =>
    strengths.reduce((s, w, k) => s + w * wave(k + 1)[i] * wave(2 * k + 2)[j] / (N / 2), 0) + 0.06 * e[i][j]));
  const g = noise(), gauss = g.map(row => row.map(v => v / Math.sqrt(N)));
  const build = (key, label, note, A) => ({ key, label, note, A, parts: jacobiSvd(A) });
  return {
    image: build("image", "图案（一张 24×24 的图）", "图案的奇异值衰减得较快：前几个分量勾出圆环和色块，斜线要更多分量才清楚。", picture),
    lora: build("lora", "低秩 + 噪声（像微调更新 ΔW）", "前 3 个奇异值远高于其余：信号只占 3 个方向，剩下的是噪声底。", lora),
    gauss: build("gauss", "随机高斯（没有结构）", "随机矩阵的奇异值铺得很开，没有哪几个方向特别重要，低秩近似丢得最多。", gauss),
  };
})();
function heat(M, x0, y0, cell, max) {
  return M.flatMap((row, i) => row.map((v, j) => {
    const o = Math.min(1, Math.abs(v) / max);
    return o < 0.02 ? "" : `<rect x="${xy(x0 + j * cell)}" y="${xy(y0 + i * cell)}" width="${cell}" height="${cell}" class="${v >= 0 ? "lab-heat-pos" : "lab-heat-neg"}" fill-opacity="${o.toFixed(2)}"/>`;
  })).join("");
}
const lowRank = {
  title: "低秩近似：只留前 k 个奇异分量",
  question: "把一个 24×24 的矩阵做 SVD，只保留前 k 个分量 σᵢuᵢvᵢᵀ。拖动 k，看近似、残差和奇异值谱；再换一种矩阵，看哪种矩阵适合压成低秩。",
  controls: [
    { key: "matrix", label: "矩阵", initial: "image", options: Object.values(MATRICES).map(m => ({ value: m.key, label: m.label.split("（")[0] })) },
    { key: "k", label: "保留的秩 k", min: 1, max: 24, step: 1, initial: 3, format: v => String(v) },
    { key: "view", label: "右图显示", initial: "approx", options: [{ value: "approx", label: "近似 A_k" }, { value: "residual", label: "残差 A − A_k" }] },
  ],
  presets: [
    { label: "图案 · k = 1", values: { matrix: "image", k: 1, view: "approx" } },
    { label: "图案 · k = 6", values: { matrix: "image", k: 6, view: "approx" } },
    { label: "ΔW · k = 3 的残差", values: { matrix: "lora", k: 3, view: "residual" } },
    { label: "随机矩阵 · k = 6", values: { matrix: "gauss", k: 6, view: "approx" } },
  ],
  check: {
    question: "LoRA 用 B·A（秩 r）表示微调更新。为什么 r = 8 往往就够，而把预训练权重本身压成秩 8 却会严重掉点？",
    answer: "微调更新 ΔW 的奇异值谱衰减很快，大部分能量集中在少数方向，像实验里的“低秩 + 噪声”：k = 3 之后残差只剩噪声。预训练权重的谱更接近“铺开”，前 8 个分量只占很小一部分能量。Eckart–Young 定理说秩 k 截断已经是最优，所以误差只取决于被丢掉的 σᵢ² 之和。",
  },
  evaluate({ matrix, k, view }) {
    const M = MATRICES[matrix] ?? MATRICES.image, parts = M.parts, A = M.A;
    const Ak = A.map((row, i) => row.map((_, j) => parts.slice(0, k).reduce((s, p) => s + p.s * p.u[i] * p.v[j], 0)));
    const shown = view === "residual" ? A.map((row, i) => row.map((v, j) => v - Ak[i][j])) : Ak;
    const max = Math.max(...A.flat().map(Math.abs)), cell = 6.5, side = cell * N;
    const total = parts.reduce((s, p) => s + p.s * p.s, 0), kept = parts.slice(0, k).reduce((s, p) => s + p.s * p.s, 0);
    const rel = Math.sqrt(Math.max(total - kept, 0) / total), params = k * 2 * N;
    const bx = 400, by = 46, bw = 220, bh = 150, barW = bw / N, top = parts[0].s;
    const bars = parts.map((p, i) => {
      const h = Math.max(1, p.s / top * bh);
      return `<rect x="${xy(bx + i * barW + 1)}" y="${xy(by + bh - h)}" width="${xy(barW - 2)}" height="${xy(h)}" rx="2" class="${i < k ? "lab-fill-amber" : "lab-fill-muted"}"/>`;
    }).join("");
    const cut = bx + k * barW;
    const body = `
      ${text(20, 30, "原矩阵 A", "lab-fig-title")}${text(206, 30, view === "residual" ? `残差 A − A_${k}` : `秩 ${k} 近似 A_${k}`, "lab-fig-title")}
      <rect x="19" y="45" width="${side + 2}" height="${side + 2}" rx="8" class="lab-fig-plane"/>${heat(A, 20, 46, cell, max)}
      <rect x="205" y="45" width="${side + 2}" height="${side + 2}" rx="8" class="lab-fig-plane"/>${heat(shown, 206, 46, cell, max)}
      ${text(bx, 30, "奇异值 σᵢ（按大小排列）", "lab-fig-title")}
      <path d="M${bx} ${by + bh + 0.5} H${bx + bw}" class="lab-fig-gridline"/>${bars}
      <path d="M${xy(cut)} ${by - 6} V${by + bh + 6}" class="lab-fig-cut"/>${text(cut + 4, by + 4, `k = ${k}`, "lab-fig-note")}
      ${text(bx, by + bh + 18, "1", "lab-fig-note")}${text(bx + bw, by + bh + 18, "24", "lab-fig-note", "end")}
      <g transform="translate(20 240)">
        ${text(0, 0, `保留能量 Σᵢ≤ₖ σᵢ² / Σ σᵢ² = ${pct(kept / total)}`, "lab-fig-value")}
        ${text(0, 22, `相对误差 ‖A − A_k‖_F / ‖A‖_F = ${pct(rel)}`, "lab-fig-value")}
        ${text(0, 46, `存储 k(m + n) = ${params} 个数，原矩阵 mn = ${N * N} 个（${pct(params / (N * N), 0)}）`, "lab-fig-note")}
        ${text(0, 68, M.note, "lab-fig-note")}
      </g>
      ${text(bx, by + bh + 36, "蓝：正值　红：负值", "lab-fig-note")}`;
    return {
      type: "svg", svg: figure(640, 320, "原矩阵、低秩近似与奇异值谱", body),
      readout: `秩 ${k}：保留能量 ${pct(kept / total)}，相对误差 ${pct(rel)}，存储 ${pct(params / (N * N), 0)}`,
      explanation: `误差只由被丢掉的奇异值决定：‖A − A_k‖_F² = Σᵢ>ₖ σᵢ²，‖A − A_k‖₂ = σₖ₊₁ = ${f3(parts[k]?.s ?? 0)}。${M.note}${k * 2 >= N ? "k 超过 12 之后，k(m + n) 已经比 mn 还多，低秩表示不再省存储。" : ""}`,
    };
  },
};

/* ---------- 0.6 Optimizer race on an ill-conditioned quadratic ---------- */
const START = [-2.6, 1.1];
function race(kappa, angle, eta, adamLr, steps) {
  const c = Math.cos(angle), s = Math.sin(angle), lf = 1 / kappa;
  // f(x) = ½ xᵀHx with eigenvalues 1/κ (flat direction) and 1 (steep direction), rotated by `angle`.
  const toEig = ([x, y]) => [c * x + s * y, -s * x + c * y];
  const fromEig = ([a, b]) => [c * a - s * b, s * a + c * b];
  const loss = p => { const [a, b] = toEig(p); return 0.5 * (lf * a * a + b * b); };
  const grad = p => { const [a, b] = toEig(p); return fromEig([lf * a, b]); };
  const x0 = fromEig(START), runs = {};
  const run = (name, step) => {
    let p = x0.slice(); const st = {}, path = [p], losses = [loss(p)];
    for (let t = 1; t <= steps; t++) {
      p = step(p, grad(p), t, st);
      if (!p.every(Number.isFinite) || Math.hypot(...p) > 1e6) p = p.map(v => clamp(Number.isFinite(v) ? v : 1e6, -1e6, 1e6));
      path.push(p); losses.push(loss(p));
    }
    runs[name] = { path, losses };
  };
  run("sgd", (p, g) => [p[0] - eta * g[0], p[1] - eta * g[1]]);
  run("mom", (p, g, t, st) => { st.m = (st.m ?? [0, 0]).map((m, i) => 0.9 * m + g[i]); return p.map((v, i) => v - eta * st.m[i]); });
  run("adam", (p, g, t, st) => {
    st.m = (st.m ?? [0, 0]).map((m, i) => 0.9 * m + 0.1 * g[i]);
    st.v = (st.v ?? [0, 0]).map((v, i) => 0.999 * v + 0.001 * g[i] * g[i]);
    return p.map((v, i) => v - adamLr * (st.m[i] / (1 - 0.9 ** t)) / (Math.sqrt(st.v[i] / (1 - 0.999 ** t)) + 1e-8));
  });
  return { runs, loss, x0, c, s, lf };
}
const RUNNERS = [["sgd", "SGD", "rose"], ["mom", "动量 β = 0.9", "blue"], ["adam", "Adam", "amber"]];
const optimizerRace = {
  title: "优化器赛跑：SGD、动量与 Adam 走进一条窄谷",
  question: "损失是一个二次型 f = ½xᵀHx，H 的两个特征值是 1 和 1/κ。条件数 κ 越大，山谷越窄长。三个优化器从同一点出发，看谁先到谷底；再把山谷转 45°，看 Adam 的优势还剩多少。",
  controls: [
    { key: "logK", label: "条件数 κ", min: 0, max: 3, step: 0.1, initial: 2, format: v => sci(10 ** v) },
    { key: "rot", label: "山谷方向", initial: "aligned", options: [{ value: "aligned", label: "沿坐标轴" }, { value: "rotated", label: "转 45°" }] },
    { key: "eta", label: "SGD / 动量学习率 η", min: 0.1, max: 2.2, step: 0.05, initial: 0.9, format: v => v.toFixed(2) },
    { key: "adamLr", label: "Adam 学习率", min: 0.01, max: 0.5, step: 0.01, initial: 0.1, format: v => v.toFixed(2) },
    { key: "steps", label: "步数", min: 10, max: 300, step: 10, initial: 80, format: v => String(v) },
  ],
  presets: [
    { label: "圆碗 κ = 1", values: { logK: 0, rot: "aligned", eta: 0.9, steps: 40 } },
    { label: "窄谷 κ = 100", values: { logK: 2, rot: "aligned", eta: 0.9, steps: 80 } },
    { label: "SGD 发散 η > 2", values: { logK: 1, rot: "aligned", eta: 2.1, steps: 40 } },
    { label: "转 45° 的窄谷", values: { logK: 2, rot: "rotated", eta: 0.9, steps: 80 } },
  ],
  check: {
    question: "SGD 的学习率为什么不能超过 2/λ_max？这时平坦方向每一步只走多远？",
    answer: "沿特征方向 i，SGD 的更新是 xᵢ ← (1 − ηλᵢ)xᵢ。陡峭方向要求 |1 − ηλ_max| < 1，即 η < 2/λ_max，否则来回震荡并发散。平坦方向每步只缩小 (1 − ηλ_min) ≈ 1 − 2/κ，要走约 κ 步才能收敛：条件数直接决定了步数。动量把平坦方向的有效步长放大约 1/(1 − β) 倍；Adam 按每个坐标的梯度尺度归一化，山谷沿坐标轴时几乎抹平了条件数，转 45° 后两个坐标的梯度尺度差不多，优势就小了。",
  },
  evaluate({ logK, rot, eta, adamLr, steps }) {
    const kappa = 10 ** logK, angle = rot === "rotated" ? Math.PI / 4 : 0;
    const { runs, loss, x0, c, s, lf } = race(kappa, angle, eta, adamLr, steps);
    const S = 46, ox = 170, oy = 168, R = 3.2, px = x => xy(ox + x * S), py = y => xy(oy - y * S);
    const f0 = loss(x0);
    const contours = grid(0, 7, 8).map(i => {
      const level = f0 * 0.32 ** i, ra = Math.sqrt(2 * level / lf), rb = Math.sqrt(2 * level);
      return `<path d="M${grid(0, 2 * Math.PI, 97).map(t => { const a = ra * Math.cos(t), b = rb * Math.sin(t); return `${px(c * a - s * b)} ${py(s * a + c * b)}`; }).join(" L")}Z" class="lab-fig-contour"/>`;
    }).join("");
    const bound = v => clamp(v, -40, 40);
    const paths = RUNNERS.map(([key, , color]) => {
      const pts = runs[key].path;
      const end = pts.at(-1);
      return `<path d="M${pts.map(p => `${px(bound(p[0]))} ${py(bound(p[1]))}`).join(" L")}" class="lab-fig-path lab-stroke-${color}"/>
        <circle cx="${px(bound(end[0]))}" cy="${py(bound(end[1]))}" r="4" class="lab-fill-${color}"/>`;
    }).join("");
    // Loss curves on a log axis.
    const cx = 374, cy = 40, cw = 248, ch = 132;
    const finals = Object.fromEntries(RUNNERS.map(([key]) => [key, runs[key].losses.at(-1)]));
    const lo = -8, hi = Math.max(1, Math.ceil(Math.log10(f0) + 0.3));
    const ly = v => xy(cy + ch - (clamp(Math.log10(Math.max(v, 1e-12)), lo, hi) - lo) / (hi - lo) * ch);
    const lx = t => xy(cx + t / steps * cw);
    const curves = RUNNERS.map(([key, , color]) =>
      `<path d="M${runs[key].losses.map((v, t) => `${lx(t)} ${ly(v)}`).join(" L")}" class="lab-fig-path lab-stroke-${color}"/>`).join("");
    const ticks = [hi, -2, -5, lo].filter((v, i, all) => all.indexOf(v) === i).map(v =>
      `<path d="M${cx} ${ly(10 ** v)} H${cx + cw}" class="lab-fig-gridline is-faint"/>${text(cx - 6, ly(10 ** v) + 4, `10${v < 0 ? "⁻" : ""}${String(Math.abs(v)).split("").map(d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("")}`, "lab-fig-note", "end")}`).join("");
    const legend = RUNNERS.map(([key, label, color], i) =>
      `<circle cx="${cx + 5}" cy="${222 + i * 22}" r="4.5" class="lab-fill-${color}"/>${text(cx + 16, 226 + i * 22, label, "lab-fig-label")}${text(cx + cw, 226 + i * 22, sci(finals[key]), "lab-fig-value", "end")}`).join("");
    const diverged = eta * 1 >= 2;
    const body = `<defs><clipPath id="opt-clip"><rect x="${px(-R)}" y="${py(R)}" width="${xy(2 * R * S)}" height="${xy(2 * R * S)}" rx="14"/></clipPath></defs>
      <rect x="${px(-R)}" y="${py(R)}" width="${xy(2 * R * S)}" height="${xy(2 * R * S)}" rx="14" class="lab-fig-plane"/>
      <g clip-path="url(#opt-clip)">${contours}${paths}</g>
      <circle cx="${px(x0[0])}" cy="${py(x0[1])}" r="5" class="lab-fig-start"/>${text(px(x0[0]) + 9, py(x0[1]) - 8, "起点", "lab-fig-note")}
      <circle cx="${px(0)}" cy="${py(0)}" r="3" class="lab-fill-ink"/>
      ${text(cx, 26, "loss（对数轴）", "lab-fig-title")}${ticks}${curves}
      <path d="M${cx} ${cy + ch} H${cx + cw}" class="lab-fig-gridline"/>${text(cx, cy + ch + 16, "0", "lab-fig-note")}${text(cx + cw, cy + ch + 16, `${steps} 步`, "lab-fig-note", "end")}
      ${text(cx, 202, `第 ${steps} 步的 loss`, "lab-fig-title")}${legend}
      ${text(cx, 300, `κ = ${sci(kappa)}，SGD 稳定要求 η < 2/λ_max = 2`, "lab-fig-note")}`;
    const best = RUNNERS.reduce((b, r) => finals[r[0]] < finals[b[0]] ? r : b);
    return {
      type: "svg", svg: figure(640, 330, "三种优化器在病态二次型上的轨迹与 loss 曲线", body),
      readout: `第 ${steps} 步 loss：SGD ${sci(finals.sgd)}，动量 ${sci(finals.mom)}，Adam ${sci(finals.adam)}`,
      explanation: `${diverged ? `η = ${f2(eta)} ≥ 2/λ_max：SGD 在陡峭方向每步乘以 |1 − η| = ${f2(Math.abs(1 - eta))} ≥ 1，来回震荡越摆越大。` : `SGD 在平坦方向每步只缩小到 1 − η/κ = ${f3(1 - eta / kappa)} 倍，κ 越大越慢。`}动量把一路同向的梯度累积起来，平坦方向的有效步长约放大 10 倍。${angle ? "山谷转 45° 后，两个坐标的梯度都同时含有陡、平两个方向的分量，Adam 逐坐标的归一化不再对准山谷，优势明显缩小。" : "山谷沿坐标轴时，Adam 给每个坐标各自归一化，相当于把窄谷拉回圆碗。"}这一轮领先的是${best[1]}。`,
    };
  },
};

/* ---------- 0.6 Decoupled weight decay ---------- */
const DECAY_STEPS = 2000, LR = 0.01, OMEGA = 0.5;
function decayRun(scale, lambda, decoupled) {
  let w = 1, m = 0, v = 0;
  const points = [[0, 1]];
  for (let t = 1; t <= DECAY_STEPS; t++) {
    const g = scale * Math.cos(OMEGA * t) + (decoupled ? 0 : lambda * w);
    m = 0.9 * m + 0.1 * g; v = 0.999 * v + 0.001 * g * g;
    if (decoupled) w *= 1 - LR * lambda;
    w -= LR * (m / (1 - 0.9 ** t)) / (Math.sqrt(v / (1 - 0.999 ** t)) + 1e-8);
    if (t % 20 === 0) points.push([t, w]);
  }
  return points;
}
const adamw = {
  title: "AdamW：把权重衰减从梯度里拿出来",
  question: "两个参数没有有用的梯度信号，只有来回摆动的梯度：一个摆幅大，一个摆幅小。理想的权重衰减应该让两者以同样的速度缩向 0。比较把 L2 项加进 Adam 梯度和 AdamW 的解耦衰减。",
  controls: [
    { key: "logRatio", label: "两个参数的梯度尺度之比", min: 0, max: 4, step: 0.1, initial: 2, format: v => sci(10 ** v) + " 倍" },
    { key: "lambda", label: "权重衰减 λ", min: 0, max: 0.3, step: 0.01, initial: 0.1, format: v => v.toFixed(2) },
  ],
  presets: [
    { label: "尺度相同", values: { logRatio: 0, lambda: 0.1 } },
    { label: "相差 100 倍", values: { logRatio: 2, lambda: 0.1 } },
    { label: "不加衰减", values: { logRatio: 2, lambda: 0 } },
  ],
  check: {
    question: "为什么把 λw 加进梯度之后，“梯度大的参数”几乎没被正则？",
    answer: "Adam 的更新是 m̂/√v̂。L2 项 λw 进了梯度，也就进了分子，然后被 √v̂ 除掉。梯度一直很大的参数，√v̂ 也大，λw 被除成一个很小的数；梯度很小的参数，λw 主导了梯度，更新退化成每步固定走 lr 的符号下降，衰减反而极快。AdamW 在 Adam 更新之外单独做 w ← w − lr·λ·w，衰减速度与梯度尺度无关。",
  },
  evaluate({ logRatio, lambda }) {
    const big = 10 ** (logRatio / 2), small = 1 / big;
    const l2Big = decayRun(big, lambda, false), l2Small = decayRun(small, lambda, false);
    const wBig = decayRun(big, lambda, true), wSmall = decayRun(small, lambda, true);
    const end = p => { const v = p.at(-1)[1]; return Math.abs(v) < 0.005 ? 0 : v; }, ideal = (1 - LR * lambda) ** DECAY_STEPS;
    return {
      type: "lines", xLabel: "训练步数", yLabel: "参数值 w（从 1 出发）", domainX: [0, DECAY_STEPS], domainY: [-0.1, 1.05],
      series: [
        { label: "Adam + L2 · 大梯度参数", points: l2Big },
        { label: "Adam + L2 · 小梯度参数", points: l2Small },
        { label: "AdamW · 大梯度参数", points: wBig },
        { label: "AdamW · 小梯度参数", points: wSmall },
      ],
      readout: `第 ${DECAY_STEPS} 步：Adam + L2 两个参数是 ${f2(end(l2Big))} 和 ${f2(end(l2Small))}；AdamW 两个都是 ${f2(end(wBig))}`,
      explanation: lambda === 0
        ? "不加衰减时，两种写法完全一样：梯度只是来回摆，参数停在 1 附近。"
        : logRatio < 0.05
          ? `两个参数的梯度尺度相同，Adam + L2 下它们也一样。但衰减速度变成了 lr·λ/RMS(g)：梯度 RMS ≈ 0.71 时比 AdamW 快约 1.4 倍，换一个梯度尺度就会变。AdamW 只按 (1 − lr·λ)ᵗ 衰减，2000 步后约为 ${f2(ideal)}。`
          : `AdamW 的两条曲线重合，都按 (1 − lr·λ)ᵗ 衰减，2000 步后约为 ${f2(ideal)}。Adam + L2 里，衰减项被 √v̂ 除过：小梯度参数的 √v̂ 小，几百步就被压到 0；大梯度参数的 √v̂ 大，衰减被稀释，还剩 ${f2(end(l2Big))}。尺度差得越多，两者分得越开。`,
    };
  },
};

export default {
  "0.1": svdLab, "0.1-lowrank": lowRank,
  "0.6": optimizerRace, "0.6-adamw": adamw,
};
