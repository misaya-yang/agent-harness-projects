# 顶级 Agent 内核图谱 · Agent Kernel Atlas

一个面向 **Agent 工程师学习与面试备战** 的开源顶级 Agent 教学系列，当前包含：

- **Codex 内核图谱**：Thread / Turn / Item、App Server、工具、权限、上下文与扩展体系。
- **Grok Build 内核图谱**：Rust crate 分层、Session actors、ACP、Tools、Workspace、权限/沙箱、压缩、扩展与子代理。
- **DeepSeek Harness 内核图谱**：Cordis 插件树、Turn / Step、Session Log、工具管线、能力缝、安全隔离与运行表面。
- **Pi Agent 内核图谱**：Agent State、统一 Provider 流、工具批次、JSONL Session Tree、扩展、TUI 与协议表面。
- **OpenCode 内核图谱**：服务器即内核、HTTP/SSE 协议面、事件投影、审批与子代理、压缩续跑与资源治理。
- **OpenClaw 内核图谱**：三层循环、有界 run 预算、双 SQLite 状态、记忆/自动化唤醒、多通道网关与人格扩展。
- **Hermes Agent 内核图谱**：Python 单体内核、学习闭环、窄腰工具、七个执行后端、状态库、网关与两代演化谱系。

每门课程都用「具体问题 → 短运行轨迹 → 交互实验 → 工程判断」讲解。网页正文不要求学生追文件路径或行号；版本与证据映射保留在独立分析资料中。阅读器以课程地图和单章舞台组织内容，支持章节直达、前后章切换与浏览器返回；JS 失效时仍保留完整静态长文。

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 产物构建（dist/）
npm run preview    # 预览构建产物
```

## 结构

- `index.html` —— Codex 课程（12 章、11 个交互实验）
- `grok.html` —— Grok Build 课程（12 章、10 个交互实验）
- `deepseek.html` —— DeepSeek Harness 课程（12 章、10 个交互实验）
- `pi.html` —— Pi Agent 课程（12 章、11 个交互实验）
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
| 沙箱 × 审批模拟器 | 第四章 | SandboxPolicy × ApprovalPolicy 决策矩阵 |
| 上下文计量表 | 第五章 | 窗口填充、auto-compact 与前缀缓存 |
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

- 本轮课程依据 2026-09-03 的预整理分析资料更新，七个快照依次为 Codex `498d40b2`、Grok Build `72a61251`、DeepSeek Harness `49a606bc`、Pi `4e69b0c2`、OpenCode `b578b726`、OpenClaw `5e9875ab`、Hermes `97f3229d`。
- 网页只呈现学生需要的机制、运行轨迹、取舍与练习；源码文件、行号和证据映射不再混入课程正文。
- 数字默认值、实验特性和迁移中能力只对对应快照与入口成立；页面会明确区分当前实现、实验能力与教学简化。
- 交互装置用于解释状态变化，不模拟官方 API，也不构成性能、安全或产品能力承诺。

## 技术选型

Vite + 原生 TypeScript，零运行时依赖。动效只用 CSS / WAAPI / IntersectionObserver /
SMIL，全部尊重 `prefers-reduced-motion`；JS 失效时页面退化为完整静态文档。
