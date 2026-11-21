# Misaya Academy

AI 算法研习平台，包含 5 个模块、23 篇课文和一份学习路线。原始讲义保存在 `content/`，新增讲义时使用路线图中的课文编号命名，构建会自动更新课程目录和搜索索引。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run build
npm run preview
```

浏览器打开 http://127.0.0.1:4173 。静态产物在 `dist/`，Sites 配置在 `.openai/hosting.json`。课文中的问题、原理与应用可以连续阅读。推导、代码和补充笔记按需展开，目录与搜索结果可以直达对应内容。完成状态、自测题和节内阅读位置保存在当前浏览器。

首页星场、字体和基础样式源自 Misaya Notes（`ai-tech-blog`，`4ba685d`）。首页使用 `web/starfield/` 中的动态玫瑰，深色学习页与图框共用参考图采样得到的中性黑色 `#0e0e0e`。课程导航与居中阅读布局由 `scripts/pages.mjs` 和 `web/academy.css` 提供。

## 可操作的课文实验

课文用 `academy-lab` 代码围栏引用课号。在讲解发生的位置，生成器先按初始参数输出 SVG、标签与读数，浏览器再加载对应课组的计算模型。滑杆、选项和工况预设会重新计算同一个模型；比较图共享坐标和单位。读者可以先预测，再操作并检验迁移问题。网页上的计算全部在本地完成。

`web/labs/` 保存各课的变量、计算函数和图形实现，`scripts/sources-*.mjs` 保存书目。已定位的材料直达原文，未能核实原件的旧引文会标为「检索」。运行 `node --test scripts/lesson-labs.test.mjs` 可检查模型边界、初始绘图和引用格式。

教学组织参考 ChatGPT 根据问题组合文字和交互、Claude 在讲解中嵌入专用图形的做法。本站的课文实验使用预先审定的公式和浏览器原生 SVG。[ChatGPT Intelligent UI](https://help.openai.com/en/articles/20001598-intelligent-ui-in-chatgpt) · [Claude 交互图形](https://claude.com/resources/articles/claude-builds-visuals) · [MDN 的 SVG 脚本指南](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/Scripting)
