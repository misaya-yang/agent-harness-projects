const imageSizes = {
  document: [1920, 1080],
  desktop: [2560, 1440],
  photo: [1344, 896],
  square: [448, 448],
};

const fixed = (value, digits = 2) => value.toFixed(digits);
const integer = value => value.toLocaleString("en-US");

const clippedObjective = {
  title: "PPO 的哪一侧会变平？",
  question: "先把概率比 ρ 移到裁剪带右侧，再把优势 A 从正切换为负。原来的平坦区会移到哪里？",
  scrub: { key: "ratio" },
  check: {
    question: "若 A = −1、ε = 0.2，ρ 从 0.7 降到 0.6，单样本目标会增加吗？再把 ρ 移到 0.9 呢？",
    answer: "0.7 和 0.6 都处于 −0.8 的平台。移到 0.9 时，目标降为 −0.9，重新提供把 ρ 往回压的梯度。",
  },
  controls: [
    { key: "advantage", label: "样本优势 A", initial: "positive", options: [
      { value: "positive", label: "正优势 +1" },
      { value: "negative", label: "负优势 −1" },
    ] },
    { key: "epsilon", label: "裁剪宽度 ε", min: 0.05, max: 0.45, step: 0.05, initial: 0.2 },
    { key: "ratio", label: "查看概率比 ρ", min: 0.4, max: 1.6, step: 0.05, initial: 1.35 },
  ],
  evaluate({ advantage, epsilon, ratio }) {
    const A = advantage === "positive" ? 1 : -1;
    const cutoff = 1 + A * epsilon;
    const unclipped = x => A * x;
    const clipped = x => Math.min(unclipped(x), unclipped(cutoff));
    const atCutoff = Math.abs(ratio - cutoff) < 1e-8;
    const flat = A * (ratio - cutoff) > 0;
    const slope = atCutoff ? "转折点，两侧斜率不同" : `局部斜率 ${flat ? 0 : A}`;
    return {
      type: "lines",
      series: [
        { label: "未裁剪 ρA", points: [0.4, 1.6].map(x => [x, unclipped(x)]) },
        { label: "PPO 裁剪目标", points: [0.4, cutoff, 1.6].map(x => [x, clipped(x)]) },
      ],
      xLabel: "新旧策略概率比 ρ",
      yLabel: "单样本目标（最大化）",
      domainX: [0.4, 1.6],
      domainY: [-1.6, 1.6],
      point: { x: ratio, y: clipped(ratio), label: "当前目标" },
      readout: `ρ = ${fixed(ratio)} 时，PPO 目标为 ${fixed(clipped(ratio))}，${slope}。`,
      explanation: `A ${A > 0 ? ">" : "<"} 0 时，平坦区在 ${A > 0 ? "右" : "左"}侧，从 ρ = ${fixed(cutoff)} 开始。斜率衡量当前样本的目标对 ρ 的响应。`,
    };
  },
};

const preferenceOdds = {
  title: "偏好差距和首选概率可以分开变化",
  question: "固定 No 在偏好对内的份额，再把这对回答的总概率调低。No 会变少多少？DPO 损失会随之变化吗？",
  check: {
    question: "两个单词的 log 概率各减少 1 nat。若给首选词加权重 0.2 的 NLL 锚，总损失变化多少？",
    answer: "两个 log 概率的差保持不变，DPO 项也保持不变。单词 NLL 增加 1，乘上 0.2 后，总损失增加 0.2。",
  },
  controls: [
    { key: "pairMass", label: "No 与 Never 的总概率", min: 5, max: 95, step: 1, initial: 14, unit: "%" },
    { key: "chosenShare", label: "偏好对内 No 的份额", min: 5, max: 95, step: 1, initial: 73, unit: "%" },
  ],
  evaluate({ pairMass, chosenShare }) {
    const share = chosenShare / 100;
    const chosen = pairMass * share;
    const rejected = pairMass * (1 - share);
    const reserve = 100 - pairMass;
    const margin = Math.log(share / (1 - share)) - Math.log(0.386 / 0.472);
    const loss = Math.log1p(Math.exp(-margin));
    const names = ["No（首选）", "Never（拒选）", "Yes", "其他"];
    return {
      type: "bars",
      maxValue: 100,
      rows: [chosen, rejected, reserve * 0.95, reserve * 0.05].map((value, i) => ({
        label: names[i], value, display: `${fixed(value, 1)}%`,
      })),
      unit: "概率（%）",
      readout: `No 为 ${fixed(chosen, 1)}%（参考策略为 38.6%）。相对参考的 log 概率差为 ${fixed(margin, 3)}，DPO 损失为 ${fixed(loss, 3)}（参考策略为 0.693）。`,
      explanation: "在这个四候选构造里取 β = 1。缩放两条回答的概率时，比例 No/Never 保持不变。剩余的概率质量按 95∶5 分给 Yes 和其他回答。",
    };
  },
};

const groupAdvantage = {
  title: "一条错误回答变长，谁的更新被稀释？",
  question: "保持 4 条回答里 1 条正确，把错误回答从 100 token 拉到 400 token，再切换到 DAPO。两种归一化的力度比各是多少？",
  check: {
    question: "若这组改成两对两错，且错误回答为 400 token，GRPO 和 DAPO 的更新力度比各是多少？",
    answer: "两边的优势绝对值都是 1。GRPO 的正确∶错误力度比为 4∶1，来自长度分母。DAPO 的力度比为 1∶1。",
  },
  controls: [
    { key: "correct", label: "4 条回答中的正确条数", min: 0, max: 4, step: 1, initial: 1 },
    { key: "wrongLength", label: "错误回答长度", min: 50, max: 500, step: 50, initial: 400, unit: " token" },
    { key: "normalization", label: "损失归一化", initial: "sequence", options: [
      { value: "sequence", label: "GRPO · 每条回答先平均" },
      { value: "batch", label: "DAPO · 全组 token 一起平均" },
    ] },
  ],
  evaluate({ correct, wrongLength, normalization }) {
    const correctLength = 100;
    const groupSize = 4;
    const passRate = correct / groupSize;
    const sd = Math.sqrt(passRate * (1 - passRate));
    const rightAdv = sd ? (1 - passRate) / sd : 0;
    const wrongAdv = sd ? passRate / sd : 0;
    const totalTokens = correct * correctLength + (groupSize - correct) * wrongLength;
    const bySequence = normalization === "sequence";
    const rightWeight = rightAdv / (bySequence ? groupSize * correctLength : totalTokens);
    const wrongWeight = wrongAdv / (bySequence ? groupSize * wrongLength : totalTokens);
    return {
      type: "bars",
      maxValue: 10,
      rows: [
        { label: "正确回答 · 每 token 上推", value: rightWeight * 1000, display: `${fixed(rightWeight * 1000, 2)} × 10⁻³` },
        { label: "错误回答 · 每 token 下压", value: wrongWeight * 1000, display: `${fixed(wrongWeight * 1000, 2)} × 10⁻³` },
      ],
      unit: "单 token 权重的绝对值（×10⁻³）",
      readout: sd ? `正确和错误回答的单 token 力度比为 ${fixed(rightWeight / wrongWeight, 1)}∶1。组内优势为 +${fixed(rightAdv, 3)} 与 −${fixed(wrongAdv, 3)}。`
        : `这组 ${correct ? "全对" : "全错"}，所有奖励都等于组均值，奖励项优势为 0。`,
      explanation: `固定正确回答长度为 100 token。按总体标准差做组内标准化，取第一次更新时的 ρ = 1，仅比较奖励项。${bySequence ? "每条回答有自己的长度分母。" : "所有 token 共用同一个分母。"}`,
    };
  },
};

const actionTokens = {
  title: "同一段调用文本可以有两种 token 序列",
  question: "保持动作损失掩码，切换训练端分词。两种分词解码出的工具调用文本一样吗？后续回答的条件历史也一样吗？",
  check: {
    question: "若工具结果原样保留，框架却换了后面的分隔符，第二个动作的概率还需要核对什么？",
    answer: "核对第二个动作前的完整条件 ID。分隔符即使屏蔽了该位置的损失，仍会进入模型历史并改变后续动作概率。",
  },
  controls: [
    { key: "encoding", label: "训练端如何读取动作", initial: "original", options: [
      { value: "original", label: "TITO · 保留采样 IDs" },
      { value: "retokenize", label: "解码成文本后重新分词" },
    ] },
    { key: "mask", label: "学习信号覆盖哪些位置", initial: "actions", options: [
      { value: "actions", label: "仅模型采样动作" },
      { value: "all", label: "追加所有位置（故意出错）" },
    ] },
  ],
  evaluate({ encoding, mask }) {
    const roundTrip = encoding === "retokenize";
    const useAll = mask === "all";
    const first = roundTrip ? 0.35 : 0.4 * 0.5;
    const second = roundTrip ? 0.5 : 0.25;
    const observation = 0.1;
    const template = 0.5;
    const nll = -Math.log(first * second * (useAll ? observation * template : 1));
    const ids = roundTrip ? "[2]" : "[0, 1]";
    return {
      type: "diagram",
      shape: "token-track",
      nodes: [
        { role: "action", tokens: roundTrip ? ["2"] : ["0", "1"],
          label: "动作一 · 调用", detail: `p = ${fixed(first)}`, active: true },
        { role: "environment", tokens: ["库存", "3"],
          label: "工具返回", detail: useAll ? "误计入 · p = 0.10" : "作为后续条件", active: useAll },
        { role: "harness", tokens: ["分隔符"],
          label: "标出回合边界", detail: useAll ? "误计入 · p = 0.50" : "作为后续条件", active: useAll },
        { role: "action", tokens: ["3 件"],
          label: "动作二 · 回答", detail: `p = ${fixed(second)}`, active: true },
      ],
      caption: "mask 为 1 的位置参与当前损失。工具返回和分隔符始终保留在第二个动作的历史里。",
      readout: `调用文本始终是 ab。训练端使用 ${ids}，累计负对数概率为 ${fixed(nll, 3)} nat。`,
      explanation: roundTrip ? "最长匹配将两次采样 [0, 1] 改成一个 ID [2]，因此两端计算概率时对应不同的动作事件，后续回答的条件历史也变了。概率采用固定的玩具条件分布。"
        : "保留 rollout 采样的 ID [0, 1]，第一个动作的概率等于两个条件概率的乘积 0.40 × 0.50。概率采用固定的玩具条件分布。",
    };
  },
};

const policyMismatch = {
  title: "逐 token 失配如何随序列长度积累？",
  question: "试着把长度从 1,024 加倍到 2,048。期望漂移和随机波动分别变为原来的多少？再让训练端和采样端完全一致。",
  check: {
    question: "真实轨迹里，如果相邻 token 的失配总是同向变化，独立模型给出的波动估计会偏向哪个方向？",
    answer: "正协方差会给总和的方差增加额外项。在单步方差相同、其余协方差为零或为正的条件下，独立模型会低估波动。",
  },
  controls: [
    { key: "gap", label: "训练端对 A 的概率偏移", min: 0, max: 4, step: 0.2, initial: 2, unit: "个百分点" },
    { key: "length", label: "查看序列长度", min: 64, max: 4096, step: 64, initial: 1024, unit: " token" },
  ],
  evaluate({ gap, length }) {
    const trainA = 0.5 + gap / 100;
    const logRatioA = Math.log(0.5 / trainA);
    const logRatioB = Math.log(0.5 / (1 - trainA));
    const drift = (logRatioA + logRatioB) / 2;
    const noise = Math.abs(logRatioA - logRatioB) / 2;
    const lengths = Array.from({ length: 129 }, (_, i) => i * 32);
    return {
      type: "lines",
      series: [
        { label: "期望漂移 · L × KL", points: lengths.map(n => [n, n * drift]) },
        { label: "波动大小 · √L × σ", points: lengths.map(n => [n, Math.sqrt(n) * noise]) },
      ],
      xLabel: "序列长度 L（token）",
      yLabel: "序列 log 概率比（nat）",
      domainX: [0, 4096],
      domainY: [0, Math.max(0.25, 4096 * drift, 64 * noise) * 1.08],
      markers: [{ x: length, label: "选定长度" }],
      readout: `训练端 P(A) = ${fixed(trainA * 100, 1)}%，逐 token KL 为 ${fixed(drift, 5)} nat。L = ${integer(length)} 时，期望漂移为 ${fixed(length * drift, 3)} nat，标准差为 ${fixed(Math.sqrt(length) * noise, 3)} nat。`,
      explanation: "这个模型的每个 token 独立取 A 或 B，rollout 端各取 50%。曲线给出 log(π_rollout / π_train) 之和的均值与标准差。真实模型的前缀会改变下一步的分布。",
    };
  },
};

const contrastiveTemperature = {
  title: "温度如何集中 CLIP 的负样本梯度？",
  question: "先把难负样本的相似度拉过正样本固定的 0.80，再降低温度。最高的概率落到哪一段文字上？",
  check: {
    question: "固定所有分数，再加一条相似度很高的错误文本。CLIP 与 SigLIP 给原正样本的概率各怎样变化？",
    answer: "CLIP 的 softmax 分母增大，原正样本概率下降。SigLIP 对每对独立取 sigmoid，在缩放和偏置固定时，原配对的分数保持不变。",
  },
  controls: [
    { key: "temperature", label: "softmax 温度 τ", min: 0.05, max: 0.4, step: 0.01, initial: 0.12 },
    { key: "distractor", label: "最相似的错误文本", min: 0.55, max: 0.9, step: 0.01, initial: 0.78 },
  ],
  evaluate({ temperature, distractor }) {
    const candidates = [
      ["正样本", 0.8], ["难负样本", distractor], ["一般负样本", 0.45], ["易负样本", 0.1],
    ];
    const peak = Math.max(...candidates.map(([, similarity]) => similarity));
    const weights = candidates.map(([, similarity]) => Math.exp((similarity - peak) / temperature));
    const negativeSum = weights.slice(1).reduce((total, weight) => total + weight, 0);
    const total = weights[0] + negativeSum;
    const loss = -Math.log(weights[0] / total);
    return {
      type: "bars",
      maxValue: 100,
      rows: candidates.map(([label, similarity], i) => {
        const value = 100 * weights[i] / total;
        return { label: `${label} · ${fixed(similarity)}`, value, display: `${fixed(value, 1)}%` };
      }),
      unit: "图→文 softmax 概率（%）",
      readout: `这张图片的 InfoNCE 损失为 ${fixed(loss, 3)}。难负样本占负样本相似度梯度总量的 ${fixed(100 * weights[1] / negativeSum, 1)}%。`,
      explanation: "每条错误文本的相似度梯度为其 softmax 概率除以 τ。降低温度会强化已有的排序，所以排在首位的错误文本会抢走更多概率。",
    };
  },
};

const visualTokenBudget = {
  title: "同一块截图进入 ViT 和 LLM 时有多长？",
  question: "先把合并边长从 1 调到 2，再把截图宽高都减半。哪一步只改变 LLM 的 token 数？",
  check: {
    question: "对 448×448 截图，用 14 像素 patch 和 4×4 合并，ViT 与 LLM 各处理多少视觉位置？",
    answer: "边长可整除，无需丢弃边缘。ViT 处理 32×32 = 1,024 个 patch，LLM 收到 8×8 = 64 个视觉 token。",
  },
  controls: [
    { key: "image", label: "截图分辨率", initial: "document", options: [
      { value: "document", label: "1920 × 1080" },
      { value: "desktop", label: "2560 × 1440" },
      { value: "photo", label: "1344 × 896" },
      { value: "square", label: "448 × 448" },
    ] },
    { key: "scale", label: "宽高同时缩放", min: 50, max: 100, step: 25, initial: 100, unit: "%" },
    { key: "merge", label: "合并边长 m（m × m patch）", min: 1, max: 4, step: 1, initial: 2 },
  ],
  evaluate({ image, scale, merge }) {
    const patch = 14;
    const [width, height] = imageSizes[image].map(size => size * scale / 100);
    const patchCount = Math.floor(width / patch) * Math.floor(height / patch);
    const gridWidth = Math.floor(width / (patch * merge));
    const gridHeight = Math.floor(height / (patch * merge));
    const visualTokens = gridWidth * gridHeight;
    const patchSide = 2 * merge;
    const patchLabels = Array(patchSide).fill("");
    const tiles = patchLabels.map((_, y) => patchLabels.map((_, x) =>
      1 + ((Math.floor(y / merge) + Math.floor(x / merge)) % 2)));
    return {
      type: "panels",
      panels: [
        { shape: "matrix", label: "输入 ViT 的 patch", rows: patchLabels, columns: patchLabels,
          cells: tiles, detail: `全图 ${integer(patchCount)} 个 patch` },
        { shape: "matrix", label: "输入 LLM 的视觉 token", rows: ["", ""], columns: ["", ""],
          cells: [[1, 2], [2, 1]], detail: `全图 ${integer(visualTokens)} 个视觉 token` },
      ],
      caption: "左右框取同一局部，同色相邻 patch 拼成一个输入 LLM 的 token。",
      readout: `${width} × ${height} 的输入经过 ${merge} × ${merge} 合并，得到 ${gridWidth} × ${gridHeight} = ${integer(visualTokens)} 个视觉 token。`,
      explanation: "按 14 像素的 patch 和完整合并组计数。图边凑不成完整组的 patch 不计入右图。生产模型常把图像预先缩放到合并步长整倍数。",
    };
  },
};

const causalMask = {
  title: "同一个序列，哪一行获得了新的可见位置？",
  question: "选图像第 1 个 patch，再切换到图像最后一个 patch 或尾部文本。比较右图的青绿色方格和高亮行。",
  check: {
    question: "若相邻位置放了两张图，各有两个 patch。第一张图的查询能读第二张图吗？反过来呢？",
    answer: "块内双向只开放同一张图内的未来位置。第一张图读不到第二张，第二张图可按因果规则读取位置更早的第一张图。",
  },
  controls: [
    { key: "patches", label: "同一张图的 patch 数", min: 2, max: 5, step: 1, initial: 4 },
    { key: "query", label: "查看哪个查询行", initial: "imageFirst", options: [
      { value: "textFirst", label: "前缀文本的第 1 个 token" },
      { value: "imageFirst", label: "图像第 1 个 patch" },
      { value: "imageLast", label: "图像最后一个 patch" },
      { value: "textLast", label: "图像后面的文本" },
    ] },
  ],
  evaluate({ patches, query }) {
    const imageStart = 2;
    const imageEnd = imageStart + patches - 1;
    const labels = ["文1", "文2", ...Array.from({ length: patches }, (_, i) => `图${i + 1}`), "文3"];
    const focusRow = { textFirst: 0, imageFirst: imageStart, imageLast: imageEnd, textLast: labels.length - 1 }[query];
    const withinImage = i => i >= imageStart && i <= imageEnd;
    const causal = labels.map((_, row) => labels.map((_, col) => Number(col <= row)));
    const mixed = causal.map((row, y) => row.map((cell, x) => !cell && withinImage(x) && withinImage(y) ? 2 : cell));
    const added = mixed[focusRow].filter(cell => cell === 2).length;
    const pairCount = labels.length * (labels.length + 1) / 2;
    const extraPairs = patches * (patches - 1) / 2;
    return {
      type: "panels",
      panels: [
        { shape: "matrix", label: "纯因果掩码", rows: labels, columns: labels, cells: causal,
          focusRow, detail: `允许 ${pairCount} 个查询–键对` },
        { shape: "matrix", label: "块内双向掩码", rows: labels, columns: labels, cells: mixed,
          focusRow, detail: `允许 ${pairCount + extraPairs} 个查询–键对` },
      ],
      legend: [{ value: 0, label: "遮蔽" }, { value: 1, label: "原有可见位置" }, { value: 2, label: "图内新增可见位置" }],
      caption: "每一行是查询 token，每一列是它可能读取的键。掩码允许读取当前位置，文本用它预测下一位置。",
      readout: `${labels[focusRow]} 在纯因果下可读 ${focusRow + 1} 个位置，块内双向下可读 ${focusRow + 1 + added} 个位置。`,
      explanation: "右图只在同一张图的 patch 之间打开因果三角的上半部。前缀文本依旧看不到图像，图像 patch 依旧看不到之后的文本。",
    };
  },
};

export {
  clippedObjective as "2.3",
  preferenceOdds as "2.4",
  groupAdvantage as "2.5",
  actionTokens as "2.6",
  policyMismatch as "2.7",
  contrastiveTemperature as "3.1",
  visualTokenBudget as "3.2",
  causalMask as "3.3",
};
export * from "./alignment-studies.mjs";
export * from "./alignment-basics.mjs";
