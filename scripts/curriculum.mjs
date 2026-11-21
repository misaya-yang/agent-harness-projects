import { readFileSync, readdirSync } from "node:fs";

const contentDir = new URL("../content/", import.meta.url);
const read = name => readFileSync(new URL(name, contentDir), "utf8").trim();
export const roadmap = read("00_AI_Algorithm_Roadmap.md");

// Lesson IDs start with the module number. M0 is the math foundation (roadmap v3); M6–M9 were added in roadmap v2.
// A module's entry lesson is numbered x.0 (1.0 attention, 2.0 RL basics).
export const modules = [
  { title: "数学基础", description: "AIGC 与后训练公式的地基：线性代数、微积分、概率论、高斯分布、信息论、优化、采样、变分推断与随机微分方程。" },
  { title: "大模型架构", description: "从注意力的推导和残差流出发，用显存、带宽和算力解释现代大模型的架构选择。" },
  { title: "后训练与强化学习", description: "从强化学习的最小基础出发，以 KL 正则为主线，串起监督微调、偏好对齐、推理模型、Agent 训练、参数高效微调与数据飞轮。" },
  { title: "多模态表征与对齐", description: "对比视觉表征的三条路线，理解视觉语言模型的对齐、原生多模态架构与语音模型。" },
  { title: "生成模型", description: "用分布搬运的视角串起扩散、Flow Matching、条件引导、少步采样、潜空间与视频生成。" },
  { title: "训练工程与评测", description: "手算显存和算力，理解分布式训练与 GPU 算子，并用诊断、评测和消融验证结论。" },
  { title: "预训练：数据、规模与优化", description: "从 Scaling Law 出发，理解数据工程、Muon 等矩阵优化器和学习率调度怎样决定基座模型的底子。" },
  { title: "推理与部署", description: "把训练好的模型变成又快又省的服务：采样、投机解码、量化、服务系统与测试时计算。" },
  { title: "检索、记忆与 Agent", description: "向量检索、RAG、工具调用与上下文工程：把模型接进真实系统时遇到的算法问题。" },
  { title: "可解释性与可信 AI", description: "打开模型内部看它在算什么，并从训练目标出发理解越狱、幻觉与校准。" },
].map((module, i) => ({ ...module, number: i, id: `M${i}`, url: `/modules/m${i}.html` }));
const moduleByNumber = new Map(modules.map(module => [module.number, module]));

const sources = new Map();
for (const name of readdirSync(contentDir).filter(name => /\.md$/i.test(name))) {
  if (name === "00_AI_Algorithm_Roadmap.md") continue;
  const match = name.match(/^(\d+\.\d+)_.*\.md$/i);
  if (!match || sources.has(match[1])) throw new Error(`无法识别或存在重复课文 ${name}`);
  const source = read(name);
  const first = source.indexOf("\n");
  const title = source.slice(0, first).replace(/^#\s+\d+\.\d+\s+/, "").replace(/\s*\[[^\]]+\]\s*$/, "");
  if (first < 0 || !title || !source.startsWith("# ")) throw new Error(`课文缺少标题 ${name}`);
  sources.set(match[1], { title, body: source.slice(first).trimStart() });
}

export const lessons = Array.from(roadmap.matchAll(/^\| (\d+\.\d+) \| (.+?) \| (.+) \| (P[01]) \| (\d+(?:\.\d+)?)h \|$/gm),
  ([, id, name, info, priority, hours]) => {
    const source = sources.get(id);
    const module = moduleByNumber.get(Number(id.split(".")[0]));
    if (!module) throw new Error(`未知模块 ${id}`);
    return {
      id, module, name: name.replace(/\s*\*\*\[[^\]]+\]\*\*\s*$/, ""),
      summary: info.split(" | ", 1)[0].replaceAll("**", ""), priority, hours: Number(hours),
      url: source ? `/lessons/${id.replace(".", "-")}.html` : null, ...source,
    };
  });
export const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
if (lessonById.size !== lessons.length || [...sources.keys()].some(id => !lessonById.has(id))) {
  throw new Error("课文与路线图中的编号不匹配");
}
export const available = lessons.filter(lesson => lesson.url);
for (const module of modules) module.lessons = lessons.filter(lesson => lesson.module === module);

export const stages = [
  { label: "数学地基 · 按需", title: "AIGC 和后训练的公式靠哪些数学？", ids: ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"], optional: true },
  { label: "模型地基 · 按需", title: "注意力、Tokenizer 与强化学习的最小基础是什么？", ids: ["1.0", "1.8", "2.0"], optional: true },
  { label: "第 1 周", title: "推理为什么慢、为什么贵？", ids: ["5.1", "1.3", "1.5", "1.2"] },
  { label: "第 2–3 周", title: "后训练的核心目标是什么？", ids: ["2.3", "2.5", "2.6", "2.2", "2.4", "2.1", "2.8", "2.7", "2.9"] },
  { label: "第 4 周", title: "基座模型的底子从哪来？", ids: ["6.1", "6.2", "6.3", "6.4", "6.5"] },
  { label: "第 5 周", title: "怎样诊断与验证训练？", ids: ["5.4", "5.3", "1.1", "1.7", "1.4", "1.6", "5.2", "5.6"] },
  { label: "第 6 周", title: "怎样让模型又快又省地服务？", ids: ["7.1", "7.4", "7.2", "7.3", "7.5"] },
  { label: "第 7–8 周", title: "怎样串起生成与多模态？", ids: ["4.2", "4.3", "3.2", "3.1", "3.3", "4.1", "4.5", "4.4", "4.6", "3.4"] },
  { label: "第 9 周", title: "怎样把模型接进真实系统，并让它可信？", ids: ["8.1", "8.2", "8.3", "8.4", "9.1", "9.3", "9.2"] },
  { label: "收尾", title: "如何用算法语言解释应用经验？", ids: ["5.5"] },
].map(stage => ({ ...stage, lessons: stage.ids.map(id => {
  const lesson = lessonById.get(id);
  if (!lesson) throw new Error(`路线中有未知课文 ${id}`);
  return lesson;
}) }));

// "按需" stages are read when a later lesson needs them, so the default path starts at the first required stage.
export const learningOrder = [...stages.filter(stage => !stage.optional), ...stages.filter(stage => stage.optional)]
  .flatMap(stage => stage.lessons).filter(lesson => lesson.url);
const staged = stages.flatMap(stage => stage.ids);
if (new Set(staged).size !== staged.length || staged.length !== lessons.length) {
  throw new Error("学习路线必须恰好包含每篇课文一次");
}
