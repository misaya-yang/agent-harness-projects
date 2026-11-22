// Synthetic, offline probability models for the M8 Agent and memory lessons.
import { pct } from "./math-kit.mjs";

const chance = value => pct(value, 1);
const two = value => value.toFixed(2);

const chain = {
  title: "长链任务：一次有检测的修复能挽回多少？",
  question: "离线行程助手要完成 n 个必要步骤。每步一次成功率是 p；首次失败后，以 d 的概率被发现，再以 q 的条件概率修复成功。先预测 6 步的结果，拖动参数比较两条曲线。",
  controls: [
    { key: "n", label: "必要步骤 n", min: 1, max: 12, step: 1, initial: 6 },
    { key: "p", label: "首次通过率 p", min: 0.7, max: 0.99, step: 0.01, initial: 0.9, format: two },
    { key: "d", label: "失败被发现的概率 d", min: 0, max: 1, step: 0.05, initial: 0.8, format: two },
    { key: "q", label: "发现后修复成功的概率 q", min: 0, max: 1, step: 0.05, initial: 0.7, format: two },
  ],
  presets: [
    { label: "正文案例", values: { n: 6, p: 0.9, d: 0.8, q: 0.7 } },
    { label: "检测不到", values: { n: 6, p: 0.9, d: 0, q: 0.7 } },
    { label: "长链", values: { n: 12, p: 0.9, d: 0.8, q: 0.7 } },
  ],
  check: {
    question: "发现率 d = 0 时，修复能力再强也没有收益，为什么？",
    answer: "修复只在首次失败且被发现后发生，触发概率是 (1−p)d。d = 0 时，这条路径概率为零。公式还假设检测没有误报、修复不破坏成功步骤，并且各步条件成功率稳定；实际要单独测这些条件。",
  },
  evaluate({ n, p, d, q }) {
    const effective = p + (1 - p) * d * q;
    const plain = p ** n, repaired = effective ** n;
    const steps = Array.from({ length: 12 }, (_, i) => i + 1);
    return {
      type: "lines", xLabel: "必要步骤 n", yLabel: "全部步骤成功的概率", domainX: [1, 12], domainY: [0, 1],
      series: [
        { label: "不修复", points: steps.map(k => [k, p ** k]) },
        { label: "发现失败后修复一次", points: steps.map(k => [k, effective ** k]) },
      ],
      point: { x: n, y: plain, label: `n = ${n} · 未修复 ${chance(plain)}` },
      readout: `${n} 步：不修复 ${chance(plain)}；加入检测与一次修复 ${chance(repaired)}；单步修复后 ${chance(effective)}。`,
      explanation: `每步概率 p + (1−p)dq = ${two(p)} + ${two(1 - p)} × ${two(d)} × ${two(q)} = ${effective.toFixed(3)}。假设通过的步骤不被误报、各步条件成功率不变且都必须成功；每步都执行时，期望重试 ${(n * (1 - p) * d).toFixed(2)} 次（检测本身的成本另计）。`,
    };
  },
};

const teamwork = {
  title: "三个助手投票：分工增益何时被交接吃掉？",
  question: "三个助手各判断离线日历是否有空，以多数票决定。先排除一个令所有人同时出错的共享假设；其他任务上各人正确率是 p、条件独立。投票后还有两次交接，每次出错概率 h。比较单人和多人最终正确率。",
  controls: [
    { key: "p", label: "无共同故障时每人正确率 p", min: 0.5, max: 1, step: 0.01, initial: 0.8, format: two },
    { key: "c", label: "共享假设导致全错的概率 c", min: 0, max: 0.8, step: 0.05, initial: 0.1, format: two },
    { key: "h", label: "每次交接破坏正确结论的概率 h", min: 0, max: 0.3, step: 0.01, initial: 0.1, format: two },
  ],
  presets: [
    { label: "正文案例", values: { p: 0.8, c: 0.1, h: 0.1 } },
    { label: "几乎无交接损失", values: { p: 0.8, c: 0.1, h: 0.01 } },
    { label: "共享假设常错", values: { p: 0.8, c: 0.5, h: 0.1 } },
  ],
  check: {
    question: "若三个人都误把同一个错误日历当真，投票能修复吗？",
    answer: "不能。共同故障事件中三个判断都错，多数票仍错。该例还假定仅在无共同故障时三个判断条件独立，交接只能破坏不能修复结论；实际的相关错误、检索和通信应分别测量。",
  },
  evaluate({ p, c, h }) {
    const vote = 3 * p ** 2 - 2 * p ** 3;
    const single = (1 - c) * p;
    const before = (1 - c) * vote;
    const after = before * (1 - h) ** 2;
    return {
      type: "bars", maxValue: 100, unit: "所有任务中的正确率（%）",
      rows: [
        { label: "单人：包含共同故障", value: 100 * single, display: chance(single) },
        { label: "三人投票：交接前", value: 100 * before, display: chance(before) },
        { label: "三人投票：两次交接后", value: 100 * after, display: chance(after) },
      ],
      readout: `单人 ${chance(single)}；三人投票交接前 ${chance(before)}，交接后 ${chance(after)}；多人相对单人 ${(100 * (after - single)).toFixed(1)} 个百分点。`,
      explanation: `无共同故障时，多数票正确率 3p²−2p³ = ${chance(vote)}。共同故障乘 ${two(1 - c)}，两次独立交接再乘 (1−h)² = ${two((1 - h) ** 2)}。把参与者人数、延迟和 token 成本算入决策；提高投票人数不能保证消除共享错误。`,
    };
  },
};

const compression = {
  title: "摘要预算：有用偏好能被保住吗？",
  question: "10 条等长历史事实中恰有一条是下次行程必需的偏好，摘要只能留 k 条。随机保留 k 条；选择性摘要则以 q 的概率识别出关键事实并预留位置，没识别出时退回随机。调预算和识别能力，比较关键事实保留率。",
  controls: [
    { key: "k", label: "摘要可保留的事实数 k", min: 1, max: 10, step: 1, initial: 3 },
    { key: "q", label: "关键事实被识别的概率 q", min: 0, max: 1, step: 0.05, initial: 0.75, format: two },
  ],
  presets: [
    { label: "正文案例", values: { k: 3, q: 0.75 } },
    { label: "没有选择能力", values: { k: 3, q: 0 } },
    { label: "提高预算", values: { k: 7, q: 0.75 } },
  ],
  check: {
    question: "关键事实保留率高，就能保证答案正确吗？",
    answer: "不能。这里仅计算关键事实是否被保留，没有模拟事实是否正确、相互冲突、被检索到或被模型正确使用。是否知道未来问题、事实是否等长和识别质量也会改变结果。",
  },
  evaluate({ k, q }) {
    const uniform = k / 10, selective = q + (1 - q) * uniform;
    const budgets = Array.from({ length: 10 }, (_, i) => i + 1);
    return {
      type: "lines", xLabel: "摘要预算 k（条等长事实）", yLabel: "关键事实保留概率", domainX: [1, 10], domainY: [0, 1],
      series: [
        { label: "随机保留", points: budgets.map(x => [x, x / 10]) },
        { label: "识别关键事实后保留", points: budgets.map(x => [x, q + (1 - q) * x / 10]) },
      ],
      point: { x: k, y: uniform, label: `k = ${k} · 随机 ${chance(uniform)}` },
      readout: `保留 ${k}/10 条：随机摘要保住关键事实 ${chance(uniform)}；选择性摘要 ${chance(selective)}。`,
      explanation: `识别成功的 ${chance(q)} 必然保留；识别失败后随机挑选的条件保留率为 ${chance(uniform)}。因此 ${two(q)} + (1−${two(q)}) × ${two(uniform)} = ${chance(selective)}。这是已知任务、等长事实的玩具模型，关键事实保留率不等于任务正确率。`,
    };
  },
};

const retrieval = {
  title: "长期记忆：召回更多，答案一定更准吗？",
  question: "离线助手回答用户现在的座位偏好。w 是相关偏好曾写入的概率，r 是已写入时检索到一条候选的概率，f 是候选正确且仍有效的概率。当前事实、错误或过期事实、没候选时的条件正确率分别固定为 95%、10%、50%。",
  controls: [
    { key: "w", label: "相关偏好曾写入 w", min: 0, max: 1, step: 0.05, initial: 0.9, format: two },
    { key: "r", label: "已写入时检索到候选 r", min: 0, max: 1, step: 0.05, initial: 0.8, format: two },
    { key: "f", label: "候选正确且有效的比例 f", min: 0, max: 1, step: 0.05, initial: 0.75, format: two },
  ],
  presets: [
    { label: "正文案例", values: { w: 0.9, r: 0.8, f: 0.75 } },
    { label: "候选大多过期", values: { w: 0.9, r: 0.8, f: 0.4 } },
    { label: "停止检索", values: { w: 0.9, r: 0, f: 0.75 } },
  ],
  check: {
    question: "f 太低时，提高召回 r 为什么反而可能降低总体正确率？",
    answer: "在本模型中，返回候选后平均正确率为 0.95f + 0.10(1−f)，没有候选时为 0.50。f < (0.50−0.10)/(0.95−0.10) ≈ 0.471 时，更多候选将无候选的样本替换成更差的候选。这个因果推论要求其他条件概率保持不变；真实检索阈值通常也会改变 f。",
  },
  evaluate({ w, r, f }) {
    const arrived = w * r;
    const current = arrived * f * 0.95;
    const stale = arrived * (1 - f) * 0.10;
    const missing = (1 - arrived) * 0.50;
    const total = current + stale + missing;
    return {
      type: "bars", maxValue: 100, unit: "占所有任务的比例（%）",
      rows: [
        { label: "当前候选带来的正确答案", value: 100 * current, display: chance(current) },
        { label: "错误或过期候选下仍答对", value: 100 * stale, display: chance(stale) },
        { label: "没有候选仍答对", value: 100 * missing, display: chance(missing) },
        { label: "总体正确率（三项之和）", value: 100 * total, display: chance(total) },
        { label: "全部不检索的基线", value: 50, display: "50.0%" },
      ],
      readout: `候选到达率 ${chance(arrived)}；总体正确率 ${chance(total)}，全部不检索为 50.0%。`,
      explanation: `总正确率 = wr[f×0.95 + (1−f)×0.10] + (1−wr)×0.50。准确且有效的候选须超过 47.1%，继续扩大同质量的召回才比无候选有利；这要求各条件概率不因干预改变。`,
    };
  },
};

export {
  chain as "8.3",
  teamwork as "8.3-team",
  compression as "8.4",
  retrieval as "8.4-retrieval",
};
