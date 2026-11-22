# Agent 工程手册

面向已有编程经验、希望通过开源实现提升 **Agent 设计能力与架构面试表达** 的学习网站。首页按运行循环、状态协议、工具、安全、上下文、记忆、扩展、多代理、客户端和可靠性十个能力模块组织，再深入七个真实项目：

- **Codex**：ThreadStore、双向 App Server 请求与权限配置；压缩工作集和持久历史分开。
- **Grok Build**：单写者会话 Actor；工具规则拒绝和用户拒绝影响批次的方式不同。
- **DeepSeek Harness**：实时帧与持久结算分开；POSIX SSH Provider 可组成远程执行环境。该版本是开发者预览。
- **Pi Agent**：JSONL 分支会话、MCP、Tool Search 与 Codemode；Durable、SDK 和 RPC 各有边界。
- **OpenCode**：持久 Inbox 和会话协调器推进 Step；实时 SSE 与事件恢复分开。
- **OpenClaw**：会话邮箱、按标记恢复与 Automations；SQLite 默认，可按存储家族配置 PostgreSQL。
- **Hermes Agent**：持久回合租约、分阶段循环与后台 review；六个内置执行后端支持插件扩展。

主题路径从具体任务进入：先预测运行轨迹，再读项目机制，完成迁移练习与面试自测。Agent 案例保留完整模块和交互实验；正文不要求学生追文件路径或行号，版本与证据映射保留在独立索引。阅读器支持模块直达、前后切换与浏览器返回；JS 失效时仍保留完整静态长文。

## 运行

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 产物构建（dist/）
npm run build:netlify # 静态产物（dist-netlify/）
npm run preview    # 预览 Sites 构建产物
```

## 仓库和发布

共享仓库的根目录是 AI 算法学习站，本课程位于 `ai-agent/`。从根目录执行 `npm --prefix ai-agent ci` 和 `npm --prefix ai-agent run dev` 可启动 Agent 站。算法站继续在根目录执行原有命令。两个站点独立安装依赖、构建并发布。

| 站点 | 构建目录 | 发布产物 | 公网入口 |
|---|---|---|---|
| 算法学习站 | 仓库根目录 | `dist/` | [Netlify](https://misaya-academy.netlify.app) · [Sites](https://ai-algorithm-academy.lvy-u.chatgpt.site) |
| Agent 工程手册 | `ai-agent/` | Netlify 使用 `dist-netlify/`，Sites 使用 `dist/` 中的 Worker | [Netlify](https://misaya-agent-atlas.netlify.app) · [Sites](https://harness.lvy-u.chatgpt.site) |

本次采用手动发布，Netlify 只上传目标站点的静态目录。如接入 Git 构建，Agent 项目的 base 设为 `ai-agent`，构建命令和发布目录见 `netlify.toml`。Sites 用各站自己的 `.openai/hosting.json`，更新 Agent Sites 源仓时以 `ai-agent/` 子树作为独立项目根。

## 结构

- `index.html` —— 十个能力模块的主题学习路径与七项目案例入口
- `codex.html` —— Codex 课程（12 个模块、12 个交互实验）
- `grok.html` —— Grok Build 课程（12 章、10 个交互实验）
- `deepseek.html` —— DeepSeek Harness 课程（12 章、10 个交互实验）
- `pi.html` —— Pi Agent 课程（12 章、12 个交互实验）
- `opencode.html` —— OpenCode 课程（12 章、9 个交互实验）
- `openclaw.html` —— OpenClaw 课程（12 章、9 个交互实验）
- `hermes.html` —— Hermes Agent 课程（12 章、9 个交互实验）
- `src/styles/` —— 设计令牌（tokens）→ 基础（base）→ 版式（layout）→ 装置（machine）
- `src/modules/` —— 各交互教学装置（回合步进机、事件流、沙箱模拟器、上下文计量、平台架构图、Thread 状态机、扩展图谱与客户端交换台）

## 教学装置

| 装置 | 章节 | 讲什么 |
|---|---|---|
| 首屏循环图 | Hero | Agent Loop 的常驻直觉 |
| 回合循环步进机 | 第一章 | 一轮对话从提交到完成的九个阶段 |
| 协议事件流 | 第二章 | Submission / Event 的 JSONL 观感 |
| 工具管线步进器 | 第三章 | 一次工具调用从发现到回注的六个检查点 |
| 沙箱 × 审批模拟器 | 第四章 | 有效权限配置、审批与执行隔离 |
| Prompt 分层检查器 | 第五章 | Base Instructions、动态上下文、活跃历史、工具与输出约束 |
| Transcript × Active Context 实验台 | 第五章 | 独立 rollout、replacement history 与 checkpoint 替换 |
| 平台架构图 | 第六章 | HTTP → 能力/审批/工具 → 内核 → 事件存储 → 租约 |
| Thread 状态实验台 | 第七章 | Thread / Turn / Item 与 start、resume、fork、steer、interrupt |
| 扩展边界图谱 | 第八章 | AGENTS、Memories、Skills、MCP、Apps、Hooks、Subagents |
| 配置覆盖判定器 | 第九章 | 同名配置键在打包默认 / 用户 / 项目 / 会话等来源层里谁赢 |
| 环境 × 沙箱 × 审批对比台 | 第十章 | 同一条命令换一种组合，裁决就换一张面孔 |
| 客户端表面交换台 | 第十一章 | CLI、IDE、App Server、SDK、codex exec 与 GitHub Action |

Grok Build 课程另含架构责任探针、Grok 回合步进机、ACP 事件流、工具管线检查器、副作用路由台、权限与沙箱实验台、Session 演化台、上下文压力表、扩展边界图谱与运行表面交换台。

DeepSeek Harness 课程另含插件责任探针、Turn / Step 事件步进机、事件 → Surface → Model 投影台、系统提示拼装顺序台、工具失败定位器、执行世界交换台、文件边界 × 审批通道实验台、组合层定位器、历史重建 × Compaction 投影台与运行表面交换台。

Pi Agent 课程另含分层责任探针、事件 × Public State 对照台、Prompt 事件步进机、消息队列调度台、Provider 适配交换台、工具批次排序实验、Session Tree 实验台、Context 压缩投影台、扩展责任探针、差分帧对比台与运行表面交换台。

OpenCode 课程另含 runLoop 主循环步进机、表面接线板、事件 → SQLite 投影台、工具装配流水线、审批裁决矩阵、system 拼装台、task 派生实验台、换模型看工具视图与症状定位器。

OpenClaw 课程另含三层循环步进机、续跑裁决走查、状态投影台、resume 注入台、事件源走查、重试预算模拟器、表面接线板、危险 shell 的闸门链与症状定位器。

Hermes Agent 课程另含回合生命周期步进机、Footprint Ladder 判定器、后端交换台、SessionDB 血统投影台、学习触发实验、两代概念映射、投递矩阵、六表面交换台与四症状定位器。

## 事实边界

- [2026 年 11 月的源码核对](docs/source-audit-2026-11-21.md)列出了七个提交、关键更新与教学边界。[9 月核对记录](docs/source-audit-2026-09-23.md)作为历史资料保留。
- 网页只呈现学生需要的机制、运行轨迹、取舍与练习；源码文件、行号和证据映射不再混入课程正文。
- 数字默认值、实验特性和迁移中能力只对对应快照与入口成立；页面会明确区分当前实现、实验能力与教学简化。
- 交互装置用于解释状态变化，不模拟官方 API，也不构成性能、安全或产品能力承诺。

## 技术选型

Vite + 原生 TypeScript，零运行时依赖。动效只用 CSS / WAAPI / IntersectionObserver /
SMIL，全部尊重 `prefers-reduced-motion`；JS 失效时页面退化为完整静态文档。
