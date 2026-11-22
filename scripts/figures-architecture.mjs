const figures = {
  "1.1": {
    type: "bars",
    title: "门控注意力前后，首 token 分到的注意力",
    rows: [
      { label: "标准注意力", value: 46.7, display: "46.7%" },
      { label: "加输出门控", value: 4.8, display: "4.8%" },
    ],
    note: "讲义 §2.5 引用 Qwen 团队报告的注意力汇实验。这里比较分到首 token（BOS）的注意力比例。",
  },
  "1.2": {
    type: "bars",
    title: "RoPE 在训练窗口内转不满一圈的频率对",
    rows: [
      { label: "128 个旋转维度", value: 18, display: "18 / 64 对" },
      { label: "64 个旋转维度", value: 9, display: "9 / 32 对" },
    ],
    note: "按讲义 §3 Step 2 的波长公式，base = 10,000，窗口长 4,096 token。两种设置都约占各自频率对的 28%。",
  },
  "1.3": {
    type: "bars",
    title: "在 128K 上下文中缓存一个序列",
    rows: [
      { label: "GQA（8 个 KV 头）", value: 42.95, display: "约 43 GB" },
      { label: "V3 式 MLA", value: 12.08, display: "约 12 GB" },
    ],
    note: "讲义 §1 的容量估算。按 80 层、131,072 token、每个元素 2 字节计算。GQA 每层每 token 存 2,048 个元素，MLA 存 576 个。",
  },
  "1.4": {
    type: "bars",
    title: "最忙专家的负载相当于平均值的多少倍",
    rows: [
      { label: "没有均衡", value: 2.94, display: "2.94 倍" },
      { label: "偏置调节后", value: 1.15, display: "1.15 倍" },
    ],
    note: "讲义 §1 的路由模拟，偏置调节持续 20 步。倍数以同一设置下的平均专家负载为基准。",
  },
  "1.5": {
    type: "bars",
    title: "上下文长度如何放大注意力分数矩阵",
    rows: [
      { label: "4,096 token", value: 32, display: "32 MiB" },
      { label: "8,192 token", value: 128, display: "128 MiB" },
      { label: "16,384 token", value: 512, display: "512 MiB" },
    ],
    note: "按讲义 §1 的标准注意力数据流计算。每个注意力头物化一张 BF16 的 L × L 分数矩阵。FlashAttention 按块处理分数。",
  },
  "1.6": {
    type: "bars",
    title: "注意力层混合比例怎样影响 KV 缓存",
    rows: [
      { label: "全部采用全注意力", value: 100, display: "100%" },
      { label: "每 1 个全注意力层配 1 个线性层", value: 50, display: "50%" },
      { label: "每 1 个全注意力层配 3 个线性层", value: 25, display: "25%" },
    ],
    note: "按讲义 §3 Step 5 计算随序列长度增长的 KV。各方案的总层数与单个全注意力层的 KV 规格相同。线性层另有固定大小的状态。",
  },
};

export function architectureFigure(id) {
  return Object.hasOwn(figures, id) ? figures[id] : undefined;
}
