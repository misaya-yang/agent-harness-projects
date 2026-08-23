# 顶级 Agent 内核图谱 · Agent Kernel Atlas

一个面向 **Agent 工程师学习与面试备战** 的开源顶级 Agent 教学系列，当前包含：

- **Codex 内核图谱**：Thread / Turn / Item、App Server、工具、权限、上下文与扩展体系。
- **Grok Build 内核图谱**：Rust crate 分层、Session actors、ACP、Tools、Workspace、权限/沙箱、压缩、扩展与子代理。

每门课程都用「理论 → 心智模型 → 交互实验 → 调试/面试视角」讲解，并明确区分源码事实、版本相关默认值与参考设计。

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 产物构建（dist/）
npm run preview    # 预览构建产物
```

## 结构

- `index.html` —— Codex 课程（12 章、8 个交互实验）
- `grok.html` —— Grok Build 课程（12 章、10 个交互实验）
- `src/styles/` —— 设计令牌（tokens）→ 基础（base）→ 版式（layout）→ 装置（machine）
- `src/modules/` —— 各交互教学装置（回合步进机、事件流、沙箱模拟器、上下文计量、平台架构图、Thread 状态机、扩展图谱与客户端交换台）

## 教学装置

| 装置 | 章节 | 讲什么 |
|---|---|---|
| 首屏循环图 | Hero | Agent Loop 的常驻直觉 |
| 回合循环步进机 | 第一章 | 一轮对话从提交到完成的九个阶段 |
| 协议事件流 | 第二章 | Submission / Event 的 JSONL 观感 |
| 沙箱 × 审批模拟器 | 第四章 | SandboxPolicy × ApprovalPolicy 决策矩阵 |
| 上下文计量表 | 第五章 | 窗口填充、auto-compact 与前缀缓存 |
| 平台架构图 | 第六章 | HTTP → 能力/审批/工具 → 内核 → 事件存储 → 租约 |
| Thread 状态实验台 | 第七章 | Thread / Turn / Item 与 start、resume、fork、steer、interrupt |
| 扩展边界图谱 | 第八章 | AGENTS、Memories、Skills、MCP、Apps、Hooks、Subagents |
| 客户端表面交换台 | 第十一章 | CLI、IDE、App Server、SDK、codex exec 与 GitHub Action |

Grok Build 课程另含架构责任探针、Grok 回合步进机、ACP 事件流、工具管线检查器、副作用路由台、权限与沙箱实验台、Session 演化台、上下文压力表、扩展边界图谱与运行表面交换台。

## 事实边界

- App Server、Thread / Turn / Item、MCP、Skills 与审批协议以 OpenAI 官方文档为准。
- PostgreSQL 投影、签名租约和 HTTP 服务面属于课程中的平台扩展参考架构，不代表 Codex 上游唯一实现。
- 固定上下文窗口与压缩阈值均为教学示意；生产配置随模型和版本变化。
- Grok Build 课程以本地开源快照的 `SOURCE_REV`、随仓用户指南与 Rust 源码为事实边界；默认值和实验性模块可能随版本变化。

## 技术选型

Vite + 原生 TypeScript，零运行时依赖。动效只用 CSS / WAAPI / IntersectionObserver /
SMIL，全部尊重 `prefers-reduced-motion`；JS 失效时页面退化为完整静态文档。
