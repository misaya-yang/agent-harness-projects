import { readFileSync, readdirSync } from "node:fs";

const contentDir = new URL("../content/", import.meta.url);
const read = name => readFileSync(new URL(name, contentDir), "utf8").trim();
export const roadmap = read("00_AI_Algorithm_Roadmap.md");

export const modules = [
  { title: "大模型架构", description: "从 Transformer 的残差流出发，用显存、带宽和算力解释现代大模型的架构选择。" },
  { title: "后训练与强化学习", description: "以 KL 正则为主线，串起监督微调、偏好对齐、推理模型与 Agent 训练。" },
  { title: "多模态表征与对齐", description: "对比视觉表征的三条路线，理解视觉语言模型的对齐与原生多模态架构。" },
  { title: "生成模型", description: "用分布搬运的视角串起扩散、Flow Matching、条件引导与少步采样。" },
  { title: "训练工程与评测", description: "手算显存和算力，理解分布式训练，并用诊断、评测和消融验证结论。" },
].map((module, i) => ({ ...module, id: `M${i + 1}`, url: `/modules/m${i + 1}.html` }));

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
    const module = modules[Number(id.split(".")[0]) - 1];
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
  { label: "第 1 周", title: "推理为什么慢、为什么贵？", ids: ["5.1", "1.3", "1.5", "1.2"] },
  { label: "第 2–3 周", title: "后训练的核心目标是什么？", ids: ["2.3", "2.5", "2.6", "2.2", "2.4", "2.1", "2.7"] },
  { label: "第 4 周", title: "怎样诊断与验证训练？", ids: ["5.4", "5.3", "1.1", "1.4", "1.6", "5.2"] },
  { label: "第 5 周", title: "怎样串起生成与多模态？", ids: ["4.2", "4.3", "3.2", "3.1", "3.3", "4.1", "4.4"] },
  { label: "收尾", title: "如何用算法语言解释应用经验？", ids: ["5.5"] },
].map(stage => ({ ...stage, lessons: stage.ids.map(id => {
  const lesson = lessonById.get(id);
  if (!lesson) throw new Error(`路线中有未知课文 ${id}`);
  return lesson;
}) }));

export const learningOrder = stages.flatMap(stage => stage.lessons).filter(lesson => lesson.url);
