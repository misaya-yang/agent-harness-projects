// Labs for the M2 entry lessons: 2.0 RL foundations (more lessons append here).
import { f2, f3, pct, sci, clamp, xy, rng, normals, figure, text } from "./math-kit.mjs";

/* ---------- 2.0 Value iteration on a 5×5 gridworld ---------- */
const GH = 5, GW = 5, GOAL = "0,4", PIT = "1,4", WALLS = new Set(["1,1", "2,3"]), START = "4,0";
const MOVES = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const CELLS = [];
for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (!WALLS.has(`${r},${c}`)) CELLS.push([r, c]);
const CELL_ID = new Map(CELLS.map(([r, c], i) => [`${r},${c}`, i]));
const TERMINAL = { [GOAL]: 1, [PIT]: -1 };
function gridModel(slip, step) {
  // P[s][a] = list of [next, prob]; R[s][a] = expected immediate reward.
  return CELLS.map(([r, c]) => {
    const key = `${r},${c}`;
    return MOVES.map((_, a) => {
      if (key in TERMINAL) return { next: [[CELL_ID.get(key), 1]], reward: 0 };
      const next = [], outcomes = [[a, 1 - slip], [(a + 1) % 4, slip / 2], [(a + 3) % 4, slip / 2]];
      let reward = 0;
      for (const [b, p] of outcomes) {
        if (p === 0) continue;
        const nr = r + MOVES[b][0], nc = c + MOVES[b][1], nk = `${nr},${nc}`;
        const to = nr >= 0 && nr < GH && nc >= 0 && nc < GW && !WALLS.has(nk) ? nk : key;
        next.push([CELL_ID.get(to), p]);
        reward += p * (step + (TERMINAL[to] ?? 0));
      }
      return { next, reward };
    });
  });
}
const qValues = (model, V, gamma) => model.map(acts => acts.map(({ next, reward }) => reward + gamma * next.reduce((s, [j, p]) => s + p * V[j], 0)));
function valueIteration(model, gamma, k) {
  let V = new Array(CELLS.length).fill(0);
  for (let i = 0; i < k; i++) V = qValues(model, V, gamma).map(q => Math.max(...q));
  return V;
}
const ARROWS = ["↑", "→", "↓", "←"];
const gridworld = {
  title: "价值迭代：终点的价值怎样一格格传开",
  question: "5×5 网格，左下角出发，右上角终点 +1，终点下方陷阱 −1，每步有奖励（代价），动作可能打滑到两侧。第 k 轮价值迭代后，每格的价值与贪心箭头是什么样？调折扣 γ、打滑概率和每步奖励，看最优策略怎样改变。",
  controls: [
    { key: "k", label: "迭代轮数 k", min: 0, max: 40, step: 1, initial: 6, format: v => String(v) },
    { key: "gamma", label: "折扣 γ", min: 0.5, max: 0.99, step: 0.01, initial: 0.95, format: v => v.toFixed(2) },
    { key: "slip", label: "打滑概率", min: 0, max: 0.4, step: 0.05, initial: 0.1, format: v => pct(v, 0) },
    { key: "step", label: "每步奖励", initial: "-0.04", options: [
      { value: "-0.01", label: "−0.01" }, { value: "-0.04", label: "−0.04" }, { value: "-0.2", label: "−0.2" }, { value: "-1", label: "−1" }] },
  ],
  presets: [
    { label: "第 3 轮", values: { k: 3, gamma: 0.95, slip: 0.1, step: "-0.04" } },
    { label: "收敛（40 轮）", values: { k: 40, gamma: 0.95, slip: 0.1, step: "-0.04" } },
    { label: "γ = 0.6", values: { k: 40, gamma: 0.6, slip: 0.1, step: "-0.04" } },
    { label: "每步 −1", values: { k: 40, gamma: 0.95, slip: 0.1, step: "-1" } },
  ],
  check: {
    question: "为什么第 k 轮时，离终点超过 k 步的格子价值还“看不到”终点？",
    answer: "价值迭代的第 k 轮 V_k 恰好是“最多再走 k 步”这个有限视野问题的最优值：每套用一次贝尔曼最优算子，终点的信息只往外传播一步。离终点超过 k 步的格子，k 步之内到不了终点，它的 V_k 只累积了每步的奖励（代价）。这和 γ^k 的误差界是两回事：有终点、路径短的问题，十来轮就精确了；持续任务才真正按 γ^k 收敛。",
  },
  evaluate({ k, gamma, slip, step }) {
    const model = gridModel(slip, Number(step));
    const V = valueIteration(model, gamma, k), Vs = valueIteration(model, gamma, 400);
    const Q = qValues(model, V, gamma), Qs = qValues(model, Vs, gamma);
    const greedy = Q.map(q => q.indexOf(Math.max(...q))), best = Qs.map(q => q.indexOf(Math.max(...q)));
    const err = Math.max(...V.map((v, i) => Math.abs(v - Vs[i])));
    const nonTerm = CELLS.map((c, i) => i).filter(i => !(`${CELLS[i][0]},${CELLS[i][1]}` in TERMINAL));
    const agree = nonTerm.filter(i => Math.abs(Q[i][greedy[i]] - Q[i][best[i]]) < 1e-9).length;
    const S = 58, X0 = 24, Y0 = 34;
    const maxAbs = Math.max(0.05, ...Vs.map(Math.abs));
    const cells = [];
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      const key = `${r},${c}`, x = X0 + c * S, y = Y0 + r * S;
      if (WALLS.has(key)) { cells.push(`<rect x="${x + 2}" y="${y + 2}" width="${S - 4}" height="${S - 4}" rx="10" class="lab-fill-muted"/>`); continue; }
      const i = CELL_ID.get(key), v = V[i];
      const tone = v >= 0 ? "lab-fill-blue" : "lab-fill-rose";
      const alpha = clamp(Math.abs(v) / maxAbs, 0.04, 1) * 0.75;
      cells.push(`<rect x="${x + 2}" y="${y + 2}" width="${S - 4}" height="${S - 4}" rx="10" class="${tone}" fill-opacity="${alpha.toFixed(2)}"/>`);
      if (key in TERMINAL) cells.push(text(x + S / 2, y + 26, key === GOAL ? "终点" : "陷阱", "lab-fig-label", "middle"), text(x + S / 2, y + 44, TERMINAL[key] > 0 ? "+1" : "−1", "lab-fig-value", "middle"));
      else {
        cells.push(text(x + S / 2, y + 25, k ? ARROWS[greedy[i]] : "·", "lab-fig-op", "middle"));
        cells.push(text(x + S / 2, y + 45, v.toFixed(2).replace("-", "−"), "lab-fig-value", "middle"));
      }
      if (key === START) cells.push(`<circle cx="${x + 9}" cy="${y + 9}" r="3.5" class="lab-fill-amber"/>`);
    }
    const sx = 340, start = V[CELL_ID.get(START)], startStar = Vs[CELL_ID.get(START)];
    const rows = [
      ["第 k 轮", String(k)],
      ["‖V_k − V*‖∞", sci(err)],
      ["起点价值 V_k / V*", `${f2(start)} / ${f2(startStar)}`],
      ["贪心动作已是最优", `${agree} / ${nonTerm.length} 格`],
      ["有效视野 1/(1−γ)", `${(1 / (1 - gamma)).toFixed(0)} 步`],
    ].map(([a, b], i) => `${text(sx, 70 + i * 30, a, "lab-fig-label")}${text(620, 70 + i * 30, b, "lab-fig-value", "end")}`).join("");
    const body = `${text(X0, 22, `第 ${k} 轮的价值与贪心箭头`, "lab-fig-title")}${cells.join("")}
      ${text(sx, 36, "收敛情况", "lab-fig-title")}${rows}
      ${text(sx, 238, "蓝色越深价值越高，红色为负；", "lab-fig-note")}${text(sx, 256, "左上角小圆点是起点。", "lab-fig-note")}`;
    const reachable = V.filter((v, i) => v > 0 && !(`${CELLS[i][0]},${CELLS[i][1]}` in TERMINAL)).length;
    return {
      type: "svg", svg: figure(640, 330, "网格世界第 k 轮价值迭代的价值与贪心策略", body),
      readout: `第 ${k} 轮：误差 ${sci(err)}，起点价值 ${f2(start)}（最优 ${f2(startStar)}），${agree}/${nonTerm.length} 格的贪心动作已最优`,
      explanation: k < 9
        ? `第 ${k} 轮的价值只“看得到” ${k} 步以内能到达的终点：目前有 ${reachable} 个格子的价值为正，其余格子只累积了每步的奖励。每多迭代一轮，终点的信息就向外传播一格。`
        : Number(step) <= -1
          ? "每步奖励 −1 比掉进陷阱（−1，且回合结束）还痛：离陷阱近的格子宁可直接跳进去，早点结束。奖励设计改变了任务本身。"
          : gamma < 0.75
            ? `γ = ${f2(gamma)} 时有效视野只有约 ${(1 / (1 - gamma)).toFixed(0)} 步，远处格子看到的终点奖励被折扣得很小，价值主要由每步代价决定。`
            : `已经收敛。打滑 ${pct(slip, 0)} 时，贴着陷阱走有 ${pct(slip / 2, 1)} 的概率滑进去；最优策略在“走近路”和“避开陷阱”之间权衡，调高打滑概率，看哪些箭头改变方向。`,
    };
  },
};

/* ---------- 2.0 Monte Carlo vs TD(0) on the 5-state random walk ---------- */
const TRUE_WALK = [1, 2, 3, 4, 5].map(v => v / 6);
function walkErrors(method, alpha, episodes, runs, seed) {
  const r = rng(seed), err = new Array(episodes).fill(0);
  for (let run = 0; run < runs; run++) {
    const V = [0.5, 0.5, 0.5, 0.5, 0.5];
    for (let e = 0; e < episodes; e++) {
      let s = 2;
      const traj = [];
      for (;;) {
        const n = s + (r() < 0.5 ? 1 : -1);
        traj.push([s, n === 5 ? 1 : 0, n]);
        if (n < 0 || n > 4) break;
        s = n;
      }
      if (method === "td") for (const [st, rew, n] of traj) V[st] += alpha * (rew + (n >= 0 && n <= 4 ? V[n] : 0) - V[st]);
      else { const G = traj.at(-1)[1]; for (const [st] of traj) V[st] += alpha * (G - V[st]); }
      err[e] += Math.sqrt(V.reduce((a, v, i) => a + (v - TRUE_WALK[i]) ** 2, 0) / 5);
    }
  }
  return err.map(v => v / runs);
}
const tdVsMc = {
  title: "蒙特卡洛 vs TD：谁先学会随机游走的价值？",
  question: "5 个状态排成一行，从中间出发，每步等概率向左或向右，从右端离开得 1 分。真实价值是 1/6 到 5/6。比较两种估计方法的误差曲线（100 次重复取平均）：MC 用整条回合的回报，TD 用一步奖励加下一个状态的当前估计。",
  controls: [
    { key: "tdAlpha", label: "TD 步长 α", min: 0.01, max: 0.3, step: 0.01, initial: 0.05, format: v => v.toFixed(2) },
    { key: "mcAlpha", label: "MC 步长 α", min: 0.005, max: 0.1, step: 0.005, initial: 0.02, format: v => v.toFixed(3) },
    { key: "episodes", label: "回合数", min: 20, max: 300, step: 10, initial: 100, format: v => String(v) },
  ],
  presets: [
    { label: "默认", values: { tdAlpha: 0.05, mcAlpha: 0.02, episodes: 100 } },
    { label: "TD 大步长", values: { tdAlpha: 0.2, mcAlpha: 0.02, episodes: 100 } },
    { label: "都用小步长、长跑", values: { tdAlpha: 0.02, mcAlpha: 0.01, episodes: 300 } },
  ],
  check: {
    question: "MC 的目标无偏，为什么在这个问题上反而学得比 TD 慢？",
    answer: "MC 的目标是整条回合的回报，从中间出发的回合平均要走 9 步，回报里累积了每一步左右摇摆的随机性，方差大；一个回合只给每个访问过的状态一个这样的高噪声样本。TD 的目标 r + V(s′) 只含一步的随机性，而且相邻状态的估计会互相传递信息。TD 的偏差来自 V(s′) 不准，但这个偏差随着学习逐渐消失。步长太大时两者都会在噪声里来回晃，误差曲线降到一定程度就不再下降。",
  },
  evaluate({ tdAlpha, mcAlpha, episodes }) {
    const td = walkErrors("td", tdAlpha, episodes, 100, 11), mc = walkErrors("mc", mcAlpha, episodes, 100, 11);
    const pts = e => e.map((v, i) => [i + 1, v]);
    const early = Math.min(9, episodes - 1);
    return {
      type: "lines", xLabel: "回合数", yLabel: "价值估计的 RMS 误差（100 次重复平均）", domainX: [1, episodes], domainY: [0, 0.25],
      series: [{ label: `TD(0) α = ${tdAlpha.toFixed(2)}`, points: pts(td) }, { label: `MC α = ${mcAlpha.toFixed(3)}`, points: pts(mc) }],
      readout: `第 10 回合：TD ${f3(td[early])}，MC ${f3(mc[early])}；第 ${episodes} 回合：TD ${f3(td.at(-1))}，MC ${f3(mc.at(-1))}`,
      explanation: `${td.at(-1) < mc.at(-1) ? "TD 最终的误差更小" : "这组步长下 MC 最终的误差更小"}。步长越大，前期下降越快，但后期会停在一个更高的噪声水平：每次更新都在追逐一个随机目标。MC 的目标无偏却方差大，TD 的目标有偏却方差小；GAE 用参数 λ 在两者之间插值（→ 2.3）。`,
    };
  },
};


/* ---------- 2.8 How much of ΔW does rank r capture? ---------- */
const LORA_D = 4096;
const DECAYS = { fast: { p: 1.5, label: "衰减快 σₖ ∝ k⁻¹·⁵" }, mid: { p: 1, label: "中等 σₖ ∝ k⁻¹" }, slow: { p: 0.5, label: "衰减慢 σₖ ∝ k⁻⁰·⁵" } };
const spectrumError = (() => {
  const out = {};
  for (const [key, { p }] of Object.entries(DECAYS)) {
    const e = Array.from({ length: LORA_D }, (_, k) => (k + 1) ** (-2 * p));   // σₖ²
    const total = e.reduce((a, b) => a + b, 0);
    const tail = new Array(LORA_D + 1).fill(0);
    for (let k = LORA_D - 1; k >= 0; k--) tail[k] = tail[k + 1] + e[k];
    out[key] = r => Math.sqrt(tail[r] / total);          // Eckart–Young: error of the best rank-r approximation
  }
  return out;
})();
const loraRank = {
  title: "秩 r 能抓住 ΔW 的多少？",
  question: "LoRA 学到的更新接近截断 SVD 的最优秩 r 近似（Eckart–Young），所以它的上限由 ΔW 的奇异值谱决定。选一种谱的衰减速度，拖动秩，看相对误差和可训练参数的比例（4096×4096 的矩阵）。",
  controls: [
    { key: "decay", label: "ΔW 的奇异值谱", initial: "mid", options: Object.entries(DECAYS).map(([value, d]) => ({ value, label: d.label })) },
    { key: "logR", label: "秩 r", min: 0, max: 10, step: 1, initial: 4, format: v => String(2 ** v) },
  ],
  presets: [
    { label: "r = 16 · 谱衰减快", values: { decay: "fast", logR: 4 } },
    { label: "r = 16 · 谱衰减慢", values: { decay: "slow", logR: 4 } },
    { label: "r = 256 · 谱衰减慢", values: { decay: "slow", logR: 8 } },
  ],
  check: {
    question: "谱衰减很慢时，把秩从 16 提到 256（参数多 16 倍），误差降了多少？这说明了什么？",
    answer: "σₖ ∝ k⁻⁰·⁵ 时能量 σₖ² ∝ 1/k，像调和级数一样分散在所有方向上：秩 16 只抓住约 38% 的能量（相对误差约 0.79），秩 256 也只抓住约 68%（误差约 0.56）。参数翻 16 倍，误差只降了三成。这就是持续预训练、学新领域时 LoRA 明显不如全量微调的原因：全量微调学到的 ΔW 秩比常见的 LoRA 配置高 10–100 倍。",
  },
  evaluate({ decay, logR }) {
    const r = 2 ** logR, grid = Array.from({ length: 41 }, (_, i) => Math.round(2 ** (i / 4)));
    const err = spectrumError[decay](r), share = 2 * r / LORA_D;
    return {
      type: "lines", scaleX: "log", xLabel: "LoRA 的秩 r", yLabel: "最优秩 r 近似的相对误差 ‖ΔW − ΔWᵣ‖/‖ΔW‖", domainX: [1, 1024], domainY: [0, 1],
      series: Object.entries(DECAYS).map(([key, d]) => ({ label: d.label, points: grid.map(g => [g, spectrumError[key](g)]) })),
      point: { x: r, y: err, label: `r = ${r}` },
      readout: `r = ${r}：抓住 ${pct(1 - err * err, 1)} 的能量，相对误差 ${f3(err)}；可训练参数占全量的 ${pct(share, 2)}`,
      explanation: `${DECAYS[decay].label}。秩 r 的 LoRA 每个 4096×4096 矩阵只训练 2·r·4096 个参数，是全量的 2r/d = ${pct(share, 2)}。${decay === "fast" ? "谱衰减快时，少数方向就装下了绝大部分能量，小秩几乎无损：格式、风格、对齐这类微调通常属于这种情况。" : decay === "slow" ? "谱衰减慢时，能量分散在大量方向上，加秩的收益递减得很厉害：这对应灌入大量新知识的持续预训练。" : "中等衰减时，秩从 1 加到 64 收益明显，再往上就慢了。"}`,
    };
  },
};

/* ---------- 2.8 NF4 vs INT4 on normally distributed weights ---------- */
const NF4_LEVELS = [-1, -0.6961928009986877, -0.5250730514526367, -0.39491748809814453, -0.28444138169288635, -0.18477343022823334,
  -0.09105003625154495, 0, 0.07958029955625534, 0.16093020141124725, 0.24611230194568634, 0.33791524171829224,
  0.44070982933044434, 0.5626170039176941, 0.7229568362236023, 1];
const INT4_LEVELS = Array.from({ length: 16 }, (_, i) => -1 + 2 * i / 15);
const WEIGHTS = (() => { const r = normals(2808); return Float64Array.from({ length: 65536 }, r); })();
function blockQuant(levels, block) {
  let err = 0, power = 0, absmaxSum = 0, blocks = 0;
  const use = new Array(levels.length).fill(0);
  for (let s = 0; s < WEIGHTS.length; s += block) {
    let m = 0;
    for (let i = s; i < s + block; i++) m = Math.max(m, Math.abs(WEIGHTS[i]));
    absmaxSum += m; blocks++;
    for (let i = s; i < s + block; i++) {
      const v = WEIGHTS[i] / m;
      let best = 0, bd = Infinity;
      for (let j = 0; j < levels.length; j++) { const d = Math.abs(v - levels[j]); if (d < bd) { bd = d; best = j; } }
      use[best]++;
      err += (levels[best] * m - WEIGHTS[i]) ** 2; power += WEIGHTS[i] ** 2;
    }
  }
  return { rel: err / power, scale: absmaxSum / blocks, use: use.map(u => u / WEIGHTS.length) };
}
const nf4Lab = {
  title: "NF4 vs INT4：16 个级别该放在哪里？",
  question: "权重近似正态分布。4 bit 只有 16 个级别，每块权重先除以块内绝对值最大值缩放到 [−1, 1]。INT4 把级别等距放置，NF4 按正态分布的分位点放置。看两种级别落在分布的什么位置、每个级别实际用到多少权重，以及块大小怎样影响误差。",
  controls: [
    { key: "block", label: "块大小（每块一个缩放因子）", initial: "64", options: [
      { value: "16", label: "16" }, { value: "64", label: "64" }, { value: "256", label: "256" }, { value: "4096", label: "4096" }] },
  ],
  presets: [
    { label: "QLoRA 默认 · 64", values: { block: "64" } },
    { label: "接近逐张量 · 4096", values: { block: "4096" } },
  ],
  check: {
    question: "为什么块越大，两种格式的误差都变大，而 INT4 变大得更多？",
    answer: "块越大，块内越可能出现一个尾部的大值，absmax 越大，缩放后绝大多数权重挤在 0 附近的一小段里。INT4 的级别是等距的，挤在中心的权重只能用到中间几个级别，两端的级别几乎没人用；NF4 本来就把级别集中在中心，每个级别覆盖的概率质量接近相等，所以对 absmax 变大不那么敏感。块小则缩放因子多，存储开销大：块 64 时 fp32 缩放因子每参数 0.5 bit，这就是 QLoRA 要做双重量化的原因。",
  },
  evaluate({ block }) {
    const B = Number(block);
    const nf = blockQuant(NF4_LEVELS, B), it = blockQuant(INT4_LEVELS, B);
    const X0 = 40, X1 = 600, mid = 170, span = 4.2;
    const px = v => X0 + (v + span) / (2 * span) * (X1 - X0);
    const pdf = v => Math.exp(-v * v / 2) / Math.sqrt(2 * Math.PI);
    const curve = Array.from({ length: 121 }, (_, i) => { const v = -span + 2 * span * i / 120; return `${xy(px(v))} ${xy(mid - pdf(v) * 150)}`; });
    const maxUse = Math.max(...nf.use, ...it.use);
    const bars = (fmt, scale, levels, use, up) => levels.map((l, j) => {
      const x = px(l * scale), h = use[j] / maxUse * 70;
      return `<rect x="${xy(x - 3)}" y="${xy(up ? mid - 4 - h : mid + 4)}" width="6" height="${xy(Math.max(h, 0.8))}" rx="2" class="${fmt}"/>`;
    }).join("");
    const body = `${text(X0, 22, `块大小 ${B}：两种 4 bit 级别在标准正态分布上的位置`, "lab-fig-title")}
      <path d="M${curve.join(" L")}" class="lab-fig-target"/>
      <path d="M${X0} ${mid} H${X1}" class="lab-fig-gridline"/>
      ${bars("lab-fill-amber", nf.scale, NF4_LEVELS, nf.use, true)}${bars("lab-fill-blue", it.scale, INT4_LEVELS, it.use, false)}
      ${[-4, -2, 0, 2, 4].map(v => text(px(v), mid + 92, String(v).replace("-", "−"), "lab-fig-note", "middle")).join("")}
      ${text(X0, 60, "NF4（向上的柱）：柱高 = 落在这个级别的权重比例", "lab-fig-note")}
      ${text(X0, mid + 112, "INT4（向下的柱）", "lab-fig-note")}
      ${text(X1, 60, `平均 absmax = ${f2(nf.scale)}σ`, "lab-fig-value", "end")}
      ${text(X1, 250, `相对均方误差：NF4 ${pct(nf.rel, 2)} · INT4 ${pct(it.rel, 2)}`, "lab-fig-value", "end")}`;
    const inner = u => u.slice(1, -1), nfMin = Math.min(...inner(nf.use)), nfMax = Math.max(...inner(nf.use));
    const itMin = Math.min(...inner(it.use)), itMax = Math.max(...inner(it.use));
    return {
      type: "svg", svg: figure(640, 266, "NF4 与 INT4 的量化级别及每个级别的使用比例", body),
      readout: `块 ${B}：NF4 相对误差 ${pct(nf.rel, 2)}，INT4 ${pct(it.rel, 2)}；缩放因子开销 ${(32 / B).toFixed(3)} bit/参数（fp32）`,
      explanation: `块内 absmax 平均约 ${f2(nf.scale)} 个标准差，所以 [−1, 1] 被映射到 ±${f2(nf.scale)}σ。INT4 的 16 个级别等距铺开，尾部的级别几乎用不到；NF4 的级别按分位点放置：除去最两端，每个级别用到的权重比例在 ${pct(nfMin, 1)}–${pct(nfMax, 1)} 之间，INT4 则是 ${pct(itMin, 1)}–${pct(itMax, 1)}。码用得越均匀，4 bit 的信息量浪费越少。块越大，absmax 越大，INT4 的损失越明显。`,
    };
  },
};

export {
  gridworld as "2.0",
  tdVsMc as "2.0-td",
  loraRank as "2.8",
  nf4Lab as "2.8-nf4",
};
