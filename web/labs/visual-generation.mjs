import { parameterStudy } from "./parameter-study.mjs";

// The axes measure explicitly stated toy models, not benchmarked runtime or quality.
export default {
  "4.4": {
    title: "放大画布，DiT 的哪一部分先变贵？",
    question: "固定 512×512，把 latent patch 从 2 改为 4；先预测 token 和配对数，再试把图像边长翻倍。空间压缩固定为 8 倍。",
    controls: [
      { key: "side", label: "输入图像边长（像素）", min: 256, max: 1024, step: 128, initial: 512 },
      { key: "patch", label: "latent patch 边长 p", options: [{ label: "2", value: 2 }, { label: "4", value: 4 }], initial: 2 },
    ],
    scrub: { key: "side" },
    check: { question: "若图像边长加倍，模型一次前向一定慢 16 倍吗？", answer: "不一定。16 倍只描述固定宽度下注意力配对项；投影、MLP、VAE、文本与硬件开销并未一同变成 16 倍。" },
    evaluate({ side, patch }) {
      const base = 1024, count = size => (size / 8 / patch) ** 2;
      const n = count(side), pairs = n ** 2;
      const points = Array.from({ length: 7 }, (_, i) => 256 + 128 * i);
      return {
        type: "lines", xLabel: "输入图像边长（像素）", yLabel: "相对 512 像素、p=2 的倍数", domainY: [0, 16],
        series: [
          { label: "图—图稠密注意力配对", points: points.map(x => [x, (count(x) / base) ** 2]) },
          { label: "图像 token 数", points: points.map(x => [x, count(x) / base]) },
        ],
        point: { x: side, y: pairs / base ** 2, label: "当前配对数" },
        readout: `N=${n.toLocaleString("en-US")} 个 · 图—图 ${pairs.toLocaleString("en-US")} 对 · 配对 ${Number((pairs / base ** 2).toFixed(4))} 倍`,
        explanation: "N=(边长/8/p)²；基准为 512×512、p=2 的 N=1024。曲线中的投影工作量随 N 增长。实际耗时还受宽度、文本、kernel 和采样步数影响。",
      };
    },
  },
  "4.4-adaln": parameterStudy({
    title: "零门控怎样让条件分支从恒等映射出发？",
    question: "残差输入 x=1，归一化后的值固定为 1，分支 F(h)=2h；两个条件分别给 h=1 和 h=2。先预测门 g=0 时的输出，再改变 g。",
    control: { key: "gate", label: "残差门 g", min: 0, max: 1, step: .05, initial: 0 },
    axis: "残差块输出", labels: ["条件 A：h=1", "条件 B：h=2"],
    measure: gate => [1 + 2 * gate, 1 + 4 * gate],
    explanation: "玩具块 y=x+gF(h)。g=0 时两种条件都输出 x；∂y/∂h=2g，但 ∂y/∂g=F(h) 可以非零。真实 adaLN-Zero 的注意力和 MLP 分支各有独立调制与门控。",
    check: "门为 0 时所有参数都得不到梯度吗？", answer: "不是。门的梯度可以非零；通过该门通向分支及调制的梯度才在这一步为零。",
    digits: 2,
  }),
  "4.5": parameterStudy({
    title: "有限码率先丢掉哪种细节？",
    question: "理想二维独立高斯源的方差分别为 1 和 0.1。调大率失真目标 D+βR 中的 β，预测哪一维先不再编码。",
    control: { key: "beta", label: "码率惩罚 β", min: .02, max: 2, step: .02, initial: .2 },
    axis: "每一维的均方误差", labels: ["高方差维 λ=1", "低方差维 λ=0.1"],
    measure: beta => [Math.min(1, beta / 2), Math.min(.1, beta / 2)],
    explanation: "玩具问题以每样本总 MSE 和自然对数码率 R（nat/样本）计，最优失真 Dᵢ=min(λᵢ,β/2)。这不是一般神经 VAE 的精确学习规律；低方差也不必然意味着视觉上不重要。",
    check: "β=0.2 时低方差维用了多少码率？", answer: "D₂=λ₂=0.1，因此 R₂=½ ln(λ₂/D₂)=0；其均方误差等于原始方差。",
    digits: 3,
  }),
  "4.5-bitrate": {
    title: "每个离散索引多一位，会给原图增加多少码率？",
    question: "对 256×256 图像，每个 latent 网格位置保存一个定长索引。先预测压缩尺度从 8 改为 16 时索引数和码率如何变化，再调整索引位数。",
    controls: [
      { key: "bits", label: "每个索引的定长位数（bit/token）", min: 1, max: 16, step: 1, initial: 10 },
      { key: "factor", label: "空间压缩因子 f", options: [{ label: "8", value: 8 }, { label: "16", value: 16 }], initial: 8 },
    ],
    scrub: { key: "bits" },
    check: { question: "10 bit 的单码本、f=8，256×256 图像的索引一共有多少 bit？", answer: "32×32×10=10,240 bit，即 0.15625 bit/原图像素。" },
    evaluate({ bits, factor }) {
      const n = (256 / factor) ** 2, rate = bits / factor ** 2;
      const points = Array.from({ length: 16 }, (_, i) => i + 1);
      return {
        type: "lines", xLabel: "每个索引的定长位数（bit/token）", yLabel: "码率（bit/原图像素）",
        series: [8, 16].map(f => ({ label: `空间压缩 ${f} 倍`, points: points.map(b => [b, b / f ** 2]) })),
        point: { x: bits, y: rate, label: "当前压缩选择" },
        readout: `f=${factor} · ${n.toLocaleString("en-US")} 个索引 · ${(n * bits).toLocaleString("en-US")} bit · ${rate.toFixed(5)} bit/原图像素`,
        explanation: "单个索引网格为 H/f × W/f，因此码率 b/f²。此处只比较索引的存储位数；多码本、边界填充、容器开销和熵编码都另计，不能据此断言重建质量。",
      };
    },
  },
  "4.6": {
    title: "加长视频：全注意力和时空分解的配对数",
    question: "512×512 图像、空间压缩 8 倍，默认 p=4；先预测 latent 时间片翻倍和空间 patch 改为 2 对两种配对数的影响。",
    controls: [
      { key: "frames", label: "latent 时间片数 T", min: 1, max: 32, step: 1, initial: 8 },
      { key: "patch", label: "latent 空间 patch 边长 p", options: [{ label: "4", value: 4 }, { label: "2", value: 2 }], initial: 4 },
    ],
    scrub: { key: "frames" },
    check: { question: "p=4、T 从 8 到 16，全注意力与分解注意力各变成多少倍？", answer: "全注意力变为 4 倍；分解注意力从 540,672 对到 1,114,112 对，约 2.06 倍。" },
    evaluate({ frames, patch }) {
      const s = (512 / 8 / patch) ** 2;
      const full = t => (t * s) ** 2;
      const factor = t => t * s ** 2 + s * t ** 2;
      const points = Array.from({ length: 32 }, (_, i) => i + 1);
      return {
        type: "lines", xLabel: "latent 时间片数 T", yLabel: "注意力有序配对数（百万）",
        series: [
          { label: "一次全时空注意力", points: points.map(t => [t, full(t) / 1e6]) },
          { label: "空间 + 时间两次注意力", points: points.map(t => [t, factor(t) / 1e6]) },
        ],
        point: { x: frames, y: full(frames) / 1e6, label: "当前全注意力" },
        readout: `T=${frames} · 每片 S=${s.toLocaleString("en-US")} · 全注意力 ${full(frames).toLocaleString("en-US")} 对 · 分解 ${factor(frames).toLocaleString("en-US")} 对`,
        explanation: "24 fps × 5 秒=120 原始帧；假设每 4 帧得到 1 个 latent 时间片，才有 T=30。这里含自身配对，分解仍可两跳传信息，但并不等价于单层全注意力；两次投影和内存开销未计。",
      };
    },
  },
  "4.6-rollout": parameterStudy({
    title: "小偏差经过滚动，什么时候会积累？",
    question: "每步有固定 +0.1 m 模型偏差，初始误差为零。比较误差完整保留与理想修正后只保留 80% 两种玩具递推，预测第 20 步再拖动。",
    control: { key: "steps", label: "滚动步数", min: 0, max: 40, step: 1, initial: 20 },
    axis: "位置误差（m）", labels: ["无修正 eₜ₊₁=eₜ+0.1", "修正 eₜ₊₁=0.8eₜ+0.1"],
    measure: t => [.1 * t, .5 * (1 - .8 ** t)],
    explanation: "误差递推是刻意设定的模型，0.8 代表每步实际纠正 20% 的已有误差，并非任何闭环系统都能做到。误差的正负、状态可观测性和策略都会改变真实轨迹。",
    check: "为什么第二条曲线最终接近 0.5 m？", answer: "稳定时 e=0.8e+0.1，解得 e=0.5 m；若反馈估计错误或动力学不稳定，不保证收敛。",
    digits: 3,
  }),
};
