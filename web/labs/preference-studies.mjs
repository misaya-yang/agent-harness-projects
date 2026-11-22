import { parameterStudy } from "./parameter-study.mjs";

export const distillationGradient = parameterStudy({
  title: "同一个前向数值，反传一定能纠正学生吗？",
  question: "二分类教师选 A 的概率固定为 0.8。调学生的概率，观察正确梯度的方向何时反转。",
  control: { key: "percent", label: "学生给 A 的概率（%）", min: 5, max: 95, step: 1, initial: 50 },
  axis: "反向 KL 对学生 logit 差的梯度", labels: ["全词表梯度", "直接反传采样 log 比的期望梯度"],
  measure(percent) {
    const p = percent / 100;
    return [p * (1 - p) * Math.log(p / (1 - p) / 4), 0];
  },
  explanation: "下降方向与梯度符号相反。固定采样结果，直接反传 log 概率时只剩 score，其期望为零；缺少了学生改变后采样分布也改变的那一项。",
  check: "学生 p=0.5 时为什么梯度为负？", answer: "学生给 A 的赔率为 1，教师为 4。梯度为 0.25 ln(1/4) ≈ −0.347，梯度下降会增大 A 的 logit。",
});

export const preferenceVotes = parameterStudy({
  title: "三个偏好 A、一个偏好 B，奖励差应该有多大？",
  question: "拖动两份回答的奖励差，比较模型预测的胜率与四次标注中的胜率。",
  control: { key: "margin", label: "奖励差 rA − rB", min: -3, max: 3, step: .05, initial: 1 },
  axis: "A 的胜率", labels: ["Bradley–Terry 预测", "样本胜率"],
  measure: gap => [1 / (1 + Math.exp(-gap)), .75],
  explanation: "交叉熵对奖励差的导数等于预测胜率减去样本胜率。交点右侧梯度下降会缩小奖励差，即使 A 赢了多数票。",
  check: "如果改为四票全选 A，有限的最优奖励差在哪里？", answer: "没有正则时不存在有限最优点，增大差距会一直降低损失。奖励的绝对零点同样无法从成对偏好中恢复。",
});
