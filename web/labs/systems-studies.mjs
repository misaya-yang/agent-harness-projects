import { parameterStudy } from "./parameter-study.mjs";

const noiseError = /* @__PURE__ */ parameterStudy({
  title: "同样的噪声预测误差，在哪个时间步最伤？",
  question: "固定噪声预测误差为 0.1。从低噪到高噪，观察一次反解干净样本的误差。",
  control: { key: "signal", label: "保留信号方差百分比", min: 1, max: 99, step: 1, initial: 50 },
  axis: "绝对误差", labels: ["反解的干净样本", "噪声预测本身"],
  measure: pct => [.1 * Math.sqrt((100 - pct) / pct), .1],
  explanation: "前向信号系数为 √ᾱ。反解时除以它，所以高噪声端容易把噪声预测的小偏差放大。",
  check: "当 ᾱ 从 0.5 降到 0.2，放大倍数如何变化？", answer: "从 1 升到 2；同样 0.1 的噪声误差变成 0.2 的干净样本误差。",
});

const eulerError = /* @__PURE__ */ parameterStudy({
  title: "速度预测完全正确，为什么一步仍会走偏？",
  question: "从噪声端 x=1 出发，对线性速度场 v(x)=−ln(2)x 反向积分；把 Euler 步数加倍，再和解析解比较。",
  control: { key: "steps", label: "等长 Euler 步数", min: 1, max: 32, step: 1, initial: 4 },
  axis: "终点位置", labels: ["Euler 终点", "解析终点"],
  measure: n => [(1 + Math.log(2) / n) ** n, 2],
  explanation: "Euler 每步只用起点速度。解析速度的大小随 x 改变，即使模型完全准确，有限步长仍带来离散误差。",
  check: "如果速度处处相同，多走几步会改善终点吗？", answer: "常速度轨迹是直线且匀速，Euler 一步就能精确积分。",
});

const guidanceError = /* @__PURE__ */ parameterStudy({
  title: "CFG 会放大哪一类预测误差？",
  question: "条件分支有 +0.1 的误差；让无条件分支同向或反向偏 0.1，观察误差如何随 w 变化。",
  control: { key: "scale", label: "引导系数 w", min: 0, max: 10, step: .25, initial: 4 },
  axis: "引导后预测的有符号误差", labels: ["分支误差相反", "分支误差相同"],
  measure: w => [.2 * w - .1, .1],
  explanation: "引导是 (1−w)u + wc。共有误差以系数 1 保留；两分支的差异误差在外推区随 w 增大。",
  check: "w=1 时为什么两条曲线交在一起？", answer: "无条件分支的系数此时为零，两个场景都只剩条件误差 +0.1。",
});

const batchTraffic = /* @__PURE__ */ parameterStudy({
  title: "继续加批量，每个 token 还能少读多少？",
  question: "同一步内每条请求生成一个 token，共享 140 GB 权重，每条请求独自扫描 40 GB KV。观察每个输出 token 的平均读取量。",
  control: { key: "batch", label: "批量大小", min: 1, max: 64, step: 1, initial: 8 },
  axis: "每个输出 token 平摊的 GB", labels: ["权重加 KV", "其中的 KV"],
  measure: b => [140 / b + 40, 40],
  explanation: "假设稠密模型权重每步只读一次，各请求没有共享前缀。GPU 容量和跨卡通信另算，图上的大批量只是解析模型的取值。",
  check: "批量从 8 到 16，平均总读取量会减半吗？", answer: "从 57.5 降至 48.75 GB。只有权重的平摊份额减半。",
});

const pipelineBubbles = /* @__PURE__ */ parameterStudy({
  title: "流水线多切几段，一定能提高利用率吗？",
  question: "把微批次数从 1 增至 64，比较四段与八段的填充排空气泡。",
  control: { key: "micro", label: "微批次数", min: 1, max: 64, step: 1, initial: 8 },
  axis: "理想气泡时间比例", labels: ["八段流水线", "四段流水线"],
  measure: m => [7 / (m + 7), 3 / (m + 3)],
  explanation: "各阶段等时，采用无交错的理想流水线时序；一轮包含 m 个有效槽和 p−1 个气泡槽。气泡不等同于所有通信开销。",
  check: "八段流水线，气泡要降到 10% 或更低，至少需要多少微批？", answer: "解 7/(m+7)≤0.1，得到 m≥63。继续增大 m 还要考虑全局批量和激活存储。",
});

const clippedLogits = /* @__PURE__ */ parameterStudy({
  title: "只缩放超阈值的头，哪种异常会被修复？",
  question: "阈值定为 100。改变一个头测得的最大正 logit，观察用同一输入重新计算的结果。",
  control: { key: "maximum", label: "缩放前最大正 logit", min: 20, max: 300, step: 5, initial: 200 },
  axis: "最大正 logit", labels: ["处理后", "处理前"],
  measure: x => [Math.min(x, 100), x],
  explanation: "两边投影各乘 √g，点积恰好乘 g。这里固定同一输入、无偏置且没有其他归一化。将权重缩放不能保证下一批数据也不越界。",
  check: "若下一批 query 与 key 的大小各翻倍，之前的阈值保证还成立吗？", answer: "不会，同一权重下点积仍可能放大四倍。需要持续监测每个头。",
});

const passAtK = /* @__PURE__ */ parameterStudy({
  title: "一张答对五次的记录，pass@k 该怎样算？",
  question: "同题 20 个候选中有 5 个正确。随机抽 k 个不放回，对比错误地把每次抽取当成独立试验。",
  control: { key: "tries", label: "抽取候选数 k", min: 1, max: 20, step: 1, initial: 5 },
  axis: "至少抽到一个正确答案的概率", labels: ["不放回", "按 25% 独立有放回"],
  measure(k) {
    let miss = 1;
    for (let i = 0; i < k; i++) miss *= Math.max(0, 15 - i) / (20 - i);
    return [1 - miss, 1 - .75 ** k];
  },
  explanation: "第一条曲线以已生成的这 20 个候选为条件；第二条描述另一个抽样过程。跨题汇总时，应逐题计算后再平均。",
  check: "k=16 时为什么第一条曲线精确等于 1？", answer: "池中只有 15 个错误答案，抽到 16 个不同候选必然至少含一个正确答案。",
});

export {
  noiseError as "4.1-noise-error",
  eulerError as "4.2-euler",
  guidanceError as "4.3-guidance-error",
  batchTraffic as "5.1-batch-bytes",
  pipelineBubbles as "5.2-pipeline",
  clippedLogits as "5.3-qk-clip",
  passAtK as "5.4-pass-k",
};
