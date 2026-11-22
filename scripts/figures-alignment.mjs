// Values and contrasts follow the examples in the corresponding course notes.
const figures = {
  "2.2": {
    type: "table",
    title: "候选越多，奖励模型分数越高，真实偏好却回落",
    columns: ["候选数", "奖励模型分", "真实偏好分"],
    rows: [
      ["1", "0.03", "−0.27"],
      ["4", "1.45", "−0.01"],
      ["64", "3.32", "−0.30"],
      ["1024", "4.59", "−1.18"],
    ],
    note: "讲义的 best-of-n 模拟。奖励模型偏好更长的回答，真实评分对过长回答施加惩罚。",
  },
  "2.4": {
    type: "bars",
    title: "DPO 拉开偏好差距，首选回答的概率却下降",
    rows: [
      { label: "训练前", value: 38.6, display: "38.6%" },
      { label: "DPO", value: 1.8, display: "约 1.8%" },
      { label: "DPO + NLL 锚", value: 75.1, display: "约 75.1%" },
    ],
    note: "讲义的四词模拟，条形表示首选词 No 的概率。仅用 DPO 时，拒选词 Never 从 47.2% 降至 约 0.2%，Yes 从 9.5% 升至约 91.4%。",
  },
  "2.5": {
    type: "bars",
    title: "通过率接近一半时，二值奖励最能区分回答",
    rows: [
      { label: "通过率 0%", value: 0, display: "0 方差" },
      { label: "通过率 10%", value: 0.09, display: "0.09 方差" },
      { label: "通过率 50%", value: 0.25, display: "0.25 方差" },
      { label: "通过率 100%", value: 0, display: "0 方差" },
    ],
    note: "由讲义的伯努利奖励方差 p(1−p) 算得。一次 GRPO 采样若组内全对或全错，组内相对优势为零。",
  },
  "2.6": {
    type: "table",
    title: "一段工具调用轨迹中，哪些 token 参与策略损失？",
    columns: ["Token 来源", "例子", "策略损失"],
    rows: [
      ["模型采样", "生成工具名和参数", "计入"],
      ["环境返回", "工具执行结果", "作为条件"],
      ["框架插入", "系统提示、固定模板", "作为条件"],
    ],
    note: "策略梯度作用于模型采样的动作。工具结果和固定模板会影响之后的动作概率。",
  },
  "2.7": {
    type: "bars",
    title: "低精度误差沿生成序列累积",
    rows: [
      { label: "64 token", value: 0.042, display: "0.042 nat" },
      { label: "512 token", value: 0.23, display: "0.23 nat" },
      { label: "4096 token", value: 0.67, display: "0.67 nat" },
    ],
    note: "讲义模拟，同一组 logits 以 FP32 分布采样，比较 BF16 舍入路线与 FP32 路线的序列级绝对对数概率比。",
  },
  "3.1": {
    type: "table",
    title: "三种视觉预训练目标提供不同的监督",
    columns: ["方法", "训练信号", "典型用途"],
    rows: [
      ["CLIP / SigLIP", "配对图像与文本", "图文检索"],
      ["DINO", "教师对另一裁剪的预测", "密集对应、分割"],
      ["MAE", "被遮住的像素", "微调后用于检测、分割"],
    ],
    note: "训练目标会改变表征保留的信息，进而影响下游任务如何使用它。",
  },
  "3.2": {
    type: "bars",
    title: "截图尺寸决定输入多少视觉 token",
    rows: [
      { label: "448 × 448", value: 256, display: "256 token" },
      { label: "1344 × 896", value: 1536, display: "1,536 token" },
      { label: "1920 × 1080", value: 2584, display: "2,584 token" },
      { label: "2560 × 1440", value: 4641, display: "4,641 token" },
    ],
    note: "按讲义的 Qwen2.5-VL 算例，14 像素一个 patch，2 × 2 合并，各边按 28 像素向下取整。实际预处理的缩放会改变计数。",
  },
  "3.3": {
    type: "table",
    title: "统一多模态模型如何表示和生成图像",
    columns: ["架构", "视觉表示", "图像生成"],
    rows: [
      ["纯自回归", "离散视觉 token", "逐 token 预测"],
      ["自回归 + 扩散", "连续图像 latent", "扩散或 flow"],
      ["解耦编码器", "理解用语义特征，生成用重建特征", "随具体模型而定"],
    ],
    note: "图像理解需要保留语义，生成还要保留可还原的空间细节。不同架构把这两类需求分配给不同表示。",
  },
};

export function alignmentFigure(id) {
  return Object.hasOwn(figures, id) ? figures[id] : undefined;
}
