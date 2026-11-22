import { parameterStudy } from "./parameter-study.mjs";

const residualCorrelation = /* @__PURE__ */ parameterStudy({
  title: "写入方向相反，残差也会越叠越大吗？",
  question: "把夹角余弦从 1 拖到 −1。观察两条曲线何时相交，以及交点左边发生了什么。",
  control: { key: "cosine", label: "残差与更新的夹角余弦", min: -1, max: 1, step: .05, initial: 0 },
  axis: "向量长度（原残差为 1）", labels: ["相加后的长度", "忽略交叉项的预测"],
  measure: cosine => [Math.sqrt(1.25 + cosine), Math.sqrt(1.25)],
  explanation: "更新的长度固定为 0.5。平方长度中的交叉项等于 2 × 1 × 0.5 × cosθ；模型层数相同，方向相关性也能改变方差预算。",
  check: "什么角度下，写入了非零更新，长度却恰好不变？", answer: "令 1.25 + cosθ = 1，得到 cosθ = −0.25。负的交叉项恰好抵消更新自身的平方长度。",
});

const relativePhase = /* @__PURE__ */ parameterStudy({
  title: "平移 100 个位置，会改变注意力分数吗？",
  question: "固定相距 2 个 token，同时向右移动 query 和 key；再观察只移动 key 的对照曲线。",
  control: { key: "shift", label: "平移 token 数", min: 0, max: 100, step: 1, initial: 4 },
  axis: "旋转后的点积", labels: ["两端同移", "只移动 key"],
  measure: shift => [Math.cos(.5), Math.cos((2 + shift) * .25)],
  explanation: "两端的原向量均为 (1,0)，每步转 0.25 弧度。共同相位在内积中相消；只移一端才改变相对角。",
  check: "两端同移仍得到相同分数，能推出任意长序列都能正确检索吗？", answer: "这一对维度只验证了相对位移恒等式。不同距离也可能产生接近的相位；完整模型还要在大量干扰词中挑出目标。",
});

const absorbedProjection = /* @__PURE__ */ parameterStudy({
  title: "改变查询方向，能否分辨两种 MLA 计算顺序？",
  question: "缓存里只有两个二维 latent。移动 query 的第二个分量，对照显式解压、把矩阵移到 query 侧，以及丢掉投影的结果。",
  control: { key: "query", label: "query 的第二个分量", min: -2, max: 2, step: .1, initial: 1 },
  axis: "第二个位置的注意力概率", labels: ["先投影 query", "先展开 key", "直接用 latent 当 key"],
  measure(y) {
    const expanded = 1 / (1 + Math.exp((2 - (1 + 2 * y)) / Math.sqrt(2)));
    const projected = [2, 1 + 2 * y];
    return [1 / (1 + Math.exp((projected[0] - projected[1]) / Math.sqrt(2))), expanded,
      1 / (1 + Math.exp((1 - y) / Math.sqrt(2)))];
  },
  explanation: "两个 latent 是标准基，解压后分别为 (2,0) 与 (1,2)。前两条曲线完全重合；直接使用 latent 漏掉了学习到的投影，通常给出另一组概率。",
  check: "如果给同一行的所有 logits 同加常数，图能区分它们吗？", answer: "softmax 会消掉共同偏移。验证矩阵吸收时应同时检查未归一化分数和最终注意力。",
});

const expertCapacity = /* @__PURE__ */ parameterStudy({
  title: "总容量足够，为什么还有 token 被丢弃？",
  question: "两个专家各接收 4 个位置。在 8 个 top-1 指派中改变送往专家 A 的数量，找出所有指派都能执行的点。",
  control: { key: "assigned", label: "送往专家 A 的 token 数", min: 0, max: 8, step: 1, initial: 6 },
  axis: "token 数", labels: ["超容量指派", "实际执行指派"],
  measure(n) {
    const executed = Math.min(n, 4) + Math.min(8 - n, 4);
    return [8 - executed, executed];
  },
  explanation: "这是一种固定容量、溢出即丢弃的训练策略。另一台设备上的空槽不能自动接手该专家的权重。支持 dropless 路由时，应观察等待时间和负载差。",
  check: "若每个专家的容量改为 5，A 收到 6 个时会怎样？", answer: "A 超出 1 个，B 的 2 个全部执行，共执行 7 个。容量提供余量，也会增加预留空间。",
});

const attentionTraffic = /* @__PURE__ */ parameterStudy({
  title: "注意力不落盘，省掉的中间流量怎样增长？",
  question: "序列长度翻倍时，看分数与概率矩阵的往返字节数怎样变化。两条曲线仅统计这两份中间量。",
  control: { key: "blocks", label: "序列长度（每格 1024 token）", min: 1, max: 16, step: 1, initial: 4 },
  axis: "分数与概率的 HBM 流量（MiB / 头）", labels: ["显式存两张矩阵", "在片上消费两者"],
  measure: blocks => [8 * blocks ** 2, 0],
  explanation: "单头、无因果裁剪、两字节元素。QK 的结果写读一次，softmax 的结果再写读一次，共 8L² 字节。两条线都未计入 Q/K/V、输出或为反向保留的统计量。",
  check: "第二条线为零，能否据此预测 FlashAttention 的毫秒数？", answer: "还要知道其余显存流量、片上容量、算力和并行度。零只对应被消去的两份全尺寸中间量。",
});

const signalRetention = /* @__PURE__ */ parameterStudy({
  title: "多少次无关写入后，初始记忆会减半？",
  question: "固定查询为第一次写入的单位键，后续只写正交键。比较两种遗忘门。",
  control: { key: "gap", label: "相隔的更新步数", min: 0, max: 40, step: 1, initial: 8 },
  axis: "初始键的读出值", labels: ["每步保留 90%", "每步保留 99%"],
  measure: n => [.9 ** n, .99 ** n],
  explanation: "后续更新在正交方向，读出衰减完全来自乘性遗忘门。横轴是间隔的步数，曲线连接各个整数步的结果。",
  check: "α=0.9，读出首次低于一半要等多少步？", answer: "第 7 步。0.9 的 6 次方约为 0.531，7 次方约为 0.478。",
});

export {
  residualCorrelation as "1.1-correlation",
  relativePhase as "1.2-phase",
  absorbedProjection as "1.3-absorb",
  expertCapacity as "1.4-capacity",
  attentionTraffic as "1.5-traffic",
  signalRetention as "1.6-retention",
};
