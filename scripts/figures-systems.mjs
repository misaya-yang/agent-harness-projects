// Values and conditions follow the corresponding lesson examples.
const figures = {
  "4.1": {
    type: "table",
    title: "采样步数怎样改变簇内离散程度？",
    columns: ["步数", "DDIM", "DDPM"],
    rows: [
      ["5", "0.540", "0.567"],
      ["10", "0.163", "0.141"],
      ["50", "0.134", "0.114"],
      ["1000", "0.147", "0.148"],
    ],
    note: "二维八簇高斯环，使用精确 score。数值是样本到最近簇中心的残差标准差，目标为 0.15。",
  },
  "4.2": {
    type: "table",
    title: "一次 Reflow 怎样改变一步采样？",
    columns: ["一步采样", "平均距离", "覆盖簇数"],
    rows: [
      ["Flow Matching", "3.51", "0 / 8"],
      ["一次 Reflow 后", "0.61", "8 / 8"],
    ],
    note: "二维八簇高斯环的玩具实验。平均距离量到最近簇中心，真实分布约为 0.19。",
  },
  "4.3": {
    type: "table",
    title: "引导越强，样本越贴近条件吗？",
    columns: ["引导强度 w", "目标簇命中率", "样本标准差"],
    rows: [
      ["0", "8%", "2.824"],
      ["1", "100%", "0.135"],
      ["2", "100%", "0.059"],
      ["8", "2%", "0.824"],
    ],
    note: "二维八簇高斯环的玩具实验，目标是第 2 号簇。真实簇内标准差为 0.15。",
  },
  "5.1": {
    type: "bars",
    title: "序列变长，注意力占训练计算的比例会上升",
    rows: [
      { label: "4K 上下文", value: 7, display: "约 7%" },
      { label: "32K 上下文", value: 38, display: "约 38%" },
      { label: "128K 上下文", value: 71, display: "约 71%" },
    ],
    note: "讲义中 7B 模型的 FLOPs 估算，按注意力计算占总训练 FLOPs 的比例比较。",
  },
  "5.2": {
    type: "bars",
    title: "ZeRO 逐级切分怎样降低每卡静态显存？",
    rows: [
      { label: "纯数据并行", value: 1120, display: "约 1120 GB" },
      { label: "ZeRO-1", value: 293, display: "约 293 GB" },
      { label: "ZeRO-2", value: 155, display: "约 155 GB" },
      { label: "ZeRO-3 / FSDP", value: 17.5, display: "约 17.5 GB" },
    ],
    note: "70B 稠密模型，64 卡数据并行，混合精度 Adam。估算仅计模型状态。",
  },
  "5.3": {
    type: "table",
    title: "训练曲线异常时，先查什么？",
    columns: ["异常", "第一项排查"],
    rows: [
      ["Loss 突然跳高", "从尖刺前的检查点重放同一批次"],
      ["早期 Loss 停滞", "尝试让模型过拟合一个批次"],
      ["出现 NaN 或 Inf", "定位第一个非有限张量"],
      ["Loss 下降、评测停滞", "对照验证损失、分领域损失与评测协议"],
    ],
    note: "曲线形状帮助选择排查顺序，病因还需结合重放、数值或评测证据验证。",
  },
  "5.4": {
    type: "bars",
    title: "两个百分点的差距有多大？",
    rows: [
      { label: "70% 到 72% 的差距", value: 2, display: "2 个百分点" },
      { label: "单个分数 95% 区间的半宽", value: 4.02, display: "约 4 个百分点" },
    ],
    note: "按 500 道独立题、正确率 70% 估算单个分数的区间。比较两个模型时，可用同一批题上的配对差估计不确定性。",
  },
};

export function systemsFigure(id) {
  return Object.hasOwn(figures, id) ? figures[id] : undefined;
}
