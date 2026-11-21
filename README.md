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

首页星场、字体和基础样式源自 Misaya Notes（`ai-tech-blog`，`4ba685d`）。首页使用 `web/starfield/` 中的动态玫瑰，学习页使用同一星场的静态背景。课程导航与居中阅读布局由 `scripts/pages.mjs` 和 `web/academy.css` 提供。
