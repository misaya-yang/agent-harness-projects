# Misaya Academy

AI 算法研习平台。路线图 v3 规划了 10 个模块（M0 数学基础到 M9 可解释性与可信 AI）、61 篇课文，已上线 33 篇（M0 数学基础 9 篇已全部上线），其余在课程目录和技术地图中标为「规划中」。原始讲义保存在 `content/`，新增讲义时使用路线图中的课文编号命名，构建会自动更新课程目录和搜索索引。

课程结构以 `content/00_AI_Algorithm_Roadmap.md` 为准：§3 的表格定义课文，§6 定义每篇新课文规划中的互动实验。学习阶段写在 `scripts/curriculum.mjs`，课文之间的前置关系写在 `scripts/tech-map.mjs`，两处都会在构建时检查是否覆盖了每一篇课文。学习路线页顶部的技术地图按技术栈分层展示全部课文：点选一篇可以看到它的前置课文、后续课文和核心链路，切到「学习路线」可以看每个阶段在图上的顺序，已学完的课文会打勾。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run build
npm run preview
```

浏览器打开 http://127.0.0.1:4173 。静态产物在 `dist/`，Sites 配置在 `.openai/hosting.json`。课文中的问题、原理与应用可以连续阅读。推导、代码和补充笔记按需展开，目录与搜索结果可以直达对应内容。完成状态、自测题和节内阅读位置保存在当前浏览器。

首页星场与字体源自 Misaya Notes（`ai-tech-blog`，`4ba685d`）。站点样式集中在 `web/academy.css`（设计系统「灯下札记」）：深色模式以暖炭灰 `#262523` 为底，目录、代码块和卡片使用稍亮的 `#2f2e2a`，强调色是灯光琥珀 `#e5b36c`；浅色模式以象牙白 `#f7f4ed` 为底。标题用衬线体，正文用 Geist 与苹方，数字用 Geist Mono；控件、卡片和图版的圆角分别为 12、16、20px。颜色、圆角和字体都定义为 `:root` 上的变量，实验样式（`web/labs.css`）和技术地图（`web/tech-map.css`）直接引用这些变量，两种主题共用同一套绘图。系统开启减少动态效果后星场静止。

M0 数学基础按 AIGC 和后训练实际用到的数学组织（线性代数、微积分、概率论、高斯分布、信息论、优化、采样、变分推断、随机微分方程），学习路线中标为「按需」阶段，「开始学习」仍从主线第一篇进入。

## 可操作的课文实验

课文用 `academy-lab` 代码围栏引用课号。在讲解发生的位置，生成器先按初始参数输出 SVG、标签与读数，浏览器再加载对应课组的计算模型。滑杆、选项和工况预设会重新计算同一个模型；比较图共享坐标和单位。读者可以先预测，再操作并检验迁移问题。网页上的计算全部在本地完成。

`web/labs/` 保存各课的变量、计算函数和图形实现（M0 数学课组由 `foundations.mjs` 汇总，0.1/0.6 在 `foundations-linalg-opt.mjs`，0.8/0.9 在 `foundations-generative.mjs`，共用的格式化、随机数和 SVG 小工具在 `math-kit.mjs`）；模型可以返回折线、柱状、面板，也可以直接返回定制 SVG（`type: "svg"`）。不需要交互的示意图用 `academy-figure` 代码围栏引用 `scripts/static-figures.mjs` 中的图号，以 SVG 输出并跟随主题配色。`scripts/sources-*.mjs` 保存书目。已定位的材料直达原文，未能核实原件的旧引文会标为「检索」。运行 `node --test scripts/lesson-labs.test.mjs` 可检查模型边界、初始绘图和引用格式。

教学组织参考 ChatGPT 根据问题组合文字和交互、Claude 在讲解中嵌入专用图形的做法。本站的课文实验使用预先审定的公式和浏览器原生 SVG。[ChatGPT Intelligent UI](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt) · [Claude 交互图形](https://claude.com/resources/articles/claude-builds-visuals) · [MDN 的 SVG 脚本指南](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/Scripting)
