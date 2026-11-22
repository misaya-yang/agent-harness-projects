import { parameterStudy } from "./parameter-study.mjs";

export default {
  "2.3-credit": parameterStudy({
    title: "终局奖励如何穿过三步轨迹？",
    question: "固定价值预测 (0.2, 0.4, 0.6) 和奖励 (0, 0, 1)，拖动 λ。哪一步完全不受 λ 影响？",
    control: { key: "lambda", label: "GAE 的 λ", min: 0, max: 1, step: .05, initial: .5 },
    axis: "优势", labels: ["第一个动作", "第二个动作", "终止动作"],
    measure: lambda => [.2 + lambda * (.2 + lambda * .4), .2 + lambda * .4, .4],
    explanation: "折扣 γ=1。末步以后没有 TD 残差；每往前传一次便再乘一个 λ。若多条回答做了填充，递推必须在各自的终止位置截断。",
    check: "λ=1 时第一个优势为什么是 0.8？", answer: "把所有 TD 残差相加，中间的价值估计一正一负地抵消，留下实际回报 1 减去初始价值 0.2。",
  }),
  "2.4-curvature": parameterStudy({
    title: "偏好已经分对时，DPO 还会推多大一步？",
    question: "固定同一对回答的参考概率。把相对于参考的 log 赔率差 h 从负值移到正值，对照两种 β 的单样本梯度大小。",
    control: { key: "margin", label: "相对参考的 log 赔率差 h", min: -6, max: 6, step: .1, initial: 2 },
    axis: "对 h 的梯度绝对值", labels: ["β = 1", "β = 0.25"],
    measure: h => [1 / (1 + Math.exp(h)), .25 / (1 + Math.exp(.25 * h))],
    explanation: "每条曲线都按 β/(1+exp(βh)) 计算。β 同时改变前面的尺度和 sigmoid 的饱和速度，比较时须说明当前样本的 h。",
    check: "若当前策略等于参考策略，两条曲线相差多少？", answer: "此时 h=0，两个梯度大小为 0.5 和 0.125，恰好相差四倍。",
  }),
  "2.5-groups": parameterStudy({
    title: "采样预算里，有多少题真能产生组内比较？",
    question: "把单次正确率从 50% 拖到 5%，观察同一道题独立作答 4 次和 8 次的区别。",
    control: { key: "percent", label: "每次作答成功率（%）", min: 0, max: 100, step: 1, initial: 50 },
    axis: "组内同时出现正误的概率", labels: ["4 次作答", "8 次作答"],
    measure(percent) {
      const p = percent / 100;
      return [4, 8].map(size => 1 - p ** size - (1 - p) ** size);
    },
    explanation: "奖励为二元，题目与策略固定，各次采样独立。全对或全错时减组均值后优势全为零；相关采样和有噪声的验证器会改变这个判断的实用价值。",
    check: "若所有 8 条回答都复制第一次的输出，混合组概率是多少？", answer: "零。增加组的长度只有在采样带来新的结果时才能增加比较机会。",
  }),
  "2.6-mask": parameterStudy({
    title: "工具多返回 100 个 token，会削弱同一个动作的梯度吗？",
    question: "固定两个动作 token 的 NLL 为 1 和 3。只改变中间工具观测的长度。",
    control: { key: "observations", label: "工具返回的 token 数", min: 0, max: 100, step: 1, initial: 6 },
    axis: "平均负对数似然（nat）", labels: ["除以动作数", "误除以整段长度"],
    measure: n => [2, 4 / (2 + n)],
    explanation: "分子都是两个动作损失之和 4，区别只在分母。工具结果仍作为后续动作的条件；把它们从损失中屏蔽，不代表要从上下文里删除。",
    check: "若把六个观测 token 改成十八个，错误归一化会降到多少？", answer: "4/(2+18)=0.2。相同的动作和反馈只因工具更啰嗦，就被训练器减小了权重。",
  }),
  "2.7-ess": parameterStudy({
    title: "八个 token 中，一个大权重能左右整批吗？",
    question: "七个权重固定为 1，只提高最后一个权重。同时观察截断到 2 的对照。",
    control: { key: "heavy", label: "最后一个 token 的权重", min: 1, max: 16, step: .25, initial: 8 },
    axis: "有效样本比例 ESS / 8", labels: ["原始权重", "上限为 2"],
    measure: w => [w, Math.min(w, 2)].map(x => (7 + x) ** 2 / (8 * (7 + x * x))),
    explanation: "ESS 衡量归一化后权重的集中度。截断抬高 ESS，同时改变加权目标；它无法恢复 rollout 中从未出现的动作。",
    check: "若把所有权重都乘 10，原始 ESS 改变吗？", answer: "分子分母都乘 100，所以原始 ESS 不变；固定绝对截断阈值则不具备这种不变性。",
  }),
  "3.1-mask": parameterStudy({
    title: "MAE 的遮挡率如何改变编码器的工作量？",
    question: "一张图含 256 个 patch。改变送入编码器的数量，对比逐 token 线性层和注意力点积的相对计算量。",
    control: { key: "keep", label: "可见 patch 数", min: 16, max: 256, step: 16, initial: 64 },
    axis: "相对于全图的计算量", labels: ["点积项", "逐 token 投影项"],
    measure: k => [(k / 256) ** 2, k / 256],
    explanation: "这里只计编码器主项。解码器要预测被挡住的 patch，训练的总耗时还包含访存和解码。",
    check: "保留四分之一 patch，能声称 MAE 整体快了 16 倍吗？", answer: "16 倍仅对应编码器的两两配对数；线性投影只减少到四分之一。",
  }),
  "3.2-context": parameterStudy({
    title: "视觉 token 减少四倍，LLM 的长度账会怎样变？",
    question: "图像原有 1024 个 patch，2×2 合并后剩 256 个。拖动文本长度，对比合并前后的联合序列。",
    control: { key: "text", label: "文本 token 数", min: 0, max: 2048, step: 64, initial: 256 },
    axis: "合并后 / 合并前", labels: ["稠密注意力配对数比", "逐 token 投影量比"],
    measure(textTokens) {
      const lengthRatio = (textTokens + 256) / (textTokens + 1024);
      return [lengthRatio ** 2, lengthRatio];
    },
    explanation: "计算采用完整稠密矩形的配对数并忽略特殊 token。合并不减少视觉编码器已经处理过的 patch。",
    check: "文本与原始视觉序列各 1024 个时，两两配对保留几成？", answer: "(1280/2048)² 约为 0.391，保留约 39.1%。",
  }),
  "3.3-conflict": parameterStudy({
    title: "损失权重会让共享参数向哪项任务移动？",
    question: "一个标量参数从零出发，文本最优点为 +1，图像最优点为 −1。改变图像损失权重，观察一步更新。",
    control: { key: "weight", label: "图像损失权重 λ", min: 0, max: 3, step: .1, initial: 1 },
    axis: "一步后的损失", labels: ["文本损失", "图像损失"],
    measure(weight) {
      const next = .25 * (1 - weight);
      return [.5 * (next - 1) ** 2, .5 * (next + 1) ** 2];
    },
    explanation: "两个任务的初始损失都是 0.5，学习率固定为 0.25。λ=1 时相反方向的梯度在共享参数上抵消。",
    check: "联合梯度为零意味着两个单任务都到最优吗？", answer: "这里两个单任务的梯度分别为 −1 和 +1，停在原点只说明加权方向抵消了。",
  }),
};
