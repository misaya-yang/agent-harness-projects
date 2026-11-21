# Misaya Academy

AI 算法研习平台，包含 5 个模块、23 篇课文和一份学习路线。原始讲义保存在 `content/`，新增讲义时使用路线图中的课文编号命名，构建会自动更新课程目录和搜索索引。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run build
npm run preview
```

浏览器打开 http://127.0.0.1:4173 。静态产物在 `dist/`，Sites 配置在 `.openai/hosting.json`。完成状态、自测题和阅读位置保存在当前浏览器。

首页样式、字体、阅读界面样式和 WebGL 玫瑰直接复用 Misaya Notes 的前端源码（`ai-tech-blog`，`4ba685d`）。`web/misaya/` 是移植的样式，`web/starfield/` 是原星场引擎，`web/academy.css` 提供课程界面所需的样式。
