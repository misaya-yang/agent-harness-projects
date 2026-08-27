# OpenClaw 课程事实素材（源码研究产出）

> 本文是教学站“顶级开源 Agent 内核图谱”OpenClaw 课程的事实底座。
> 源码基线：`/Users/misaya.yanghejazfs.com.au/misaya_project/Agent_projects/openclaw`，短提交 `e6915d09`（2026-08-24，`fix(cli): reject missing transcript summary paths (#128589)`）。
> 只读研究：所有行号由本次在 `e6915d09` checkout 上逐条复核（早前的对比报告基于旧提交，行号有漂移，本文一律以复核值为准）。

## 读法与证据标签

本文用四个标签区分结论强度，建站时不得混写：

- **[源码确认]**：符号、常量、控制流可在 `e6915d09` 的对应路径+行号直接找到。
- **[文档声明]**：来自仓库内 README / VISION / docs/** 的自述，行为方向可信但未逐行验证到代码。
- **[合理推断]**：由多个实现事实组合出的运行时解释（如"工具不感知进程内外"），适合心智模型，不是 API 保证。
- **[边界声明]**：明确无法从本仓库确认的问题（见 §6），建站文案不得越过。

每个关键结论附 repo-relative 路径与 symbol/行号，例：`src/agents/embedded-agent-runner/run/helpers.ts:128 resolveMaxRunRetryIterations`。

## 0 身份卡

| 项 | 内容 | 证据 |
|---|---|---|
| 上游仓库 | `github.com/openclaw/openclaw`（`git remote -v` 确认）[源码确认] | `.git/config` |
| 本地 commit | `e6915d09`，完整 `e6915d099adb114c87e75d560bc15be55a8a3b14` [源码确认] | `git rev-parse HEAD` |
| 版本 / 授权 | npm 包 `openclaw@2026.8.1`，MIT，作者 "OpenClaw Foundation (https://openclaw.org)"（非营利组织）[源码确认] | `package.json`、`LICENSE` |
| 语言栈 | TypeScript + pnpm workspace（`pnpm-workspace.yaml`），Node 22/24/25；内核在 `packages/agent-core`，运行时在 `src/agents`，扩展在 `extensions/`（约 150 个目录），伴生应用在 `apps/`（macOS/iOS/Android/Linux/Wear）[源码确认] | `package.json`、目录树 |
| 产品定位 | 通用长期个人助理："runs on your devices, in your channels, with your rules"；单一操作者设计，Gateway 统一接模型、工具、消息通道、伴生应用 [文档声明] | `README.md`、`VISION.md` |
| 前世 lineage | Warelay → Clawdbot → Moltbot → OpenClaw（VISION.md）；README 向 pi（Mario Zechner）致谢，内置 runtime id 为 `openclaw`，**legacy 别名 `pi` 归一化为 `openclaw`** [文档声明+源码确认] | `VISION.md`、`docs/agent-runtime-architecture.md` |
| 与 hermes-agent 的关系 | 本仓库含 `extensions/migrate-hermes` 与 `docs/install/migrating-hermes.md`：OpenClaw 提供从 Hermes 导入模型配置、prompts、记忆、技能的预览式可回滚迁移——是**继承迁移关系**，本课只讲 openclaw 自身 [文档声明+源码确认] | `docs/install/migrating-hermes.md` |

**差异化论点（hero thesis）**：OpenClaw 证明“跨天存活不靠无限循环”。它的内核循环与 Pi 几乎同构、本身无界，但外面套了**有界 run 预算层 + 会话续跑层**，加上 SQLite 持久状态、automations/heartbeat/standing-intents 三类唤醒源和凌晨 3 点的记忆固化（dreaming）——"活着的助理"是**多次短小有界 run + 持久状态 + 事件唤醒 + 记忆注入**的组合体，不是一条长驻循环。

### 系列速览（与已开 Pi / Grok 课程对照）

| 维度 | Pi（极简框架） | Grok Build（编码 Agent） | OpenClaw（通用长期助理） |
|---|---|---|---|
| 内核循环 | 双层 while | actor select + 内外层 while | 双层 while（与 Pi 同构，`agent-loop.ts:351/:355`） |
| 回合上限 | 无 | `max_turns` 默认 None | 无 |
| 防失控主力 | 重试 3 + 一次 compact-and-retry | stationarity 16/8/4 等熔断器家族 | run 预算 32..160 + idle 5 + compaction 窗口 3 + 48h 墙钟 |
| 持久化 | session 落盘 | JSONL 多文件 + rewind | 双 SQLite（state 9 / agent 17） |
| 长期记忆 | 无 | dream consolidation | search/get + dreaming cron + standing intents |
| 定时唤醒 | 无 | background tasks 自动唤醒 | automations + heartbeat + webhook |
| 人在环中 | steer/followUp/abort | Interject + Ask 权限 | ask_user + 网关审批走聊天频道 |
| 权限 | 接口化交给宿主 | YOLO/Auto/Ask + OS 沙箱 | 审批三态 + fallback 三态 + 钩子阻断 |
| 运行表面 | 库/框架 | CLI/IDE/headless | Gateway + 十余消息通道 + CLI/TUI/UI/伴生 app |

（Pi/Grok 列引自对比报告 `agent_harness_source_study.md`，OpenClaw 列本文逐条复核。）

## 1 源码路线

| # | 入口 | 回答的问题 |
|---|---|---|
| 1 | `packages/agent-core/src/agent-loop.ts:298` `runLoop` | 最内核的"模型↔工具"双层 while 长什么样？（与 Pi 同构：外层 :351 跟进 follow-up 队列，内层 :355 跟进 tool call 与 steering） |
| 2 | `src/agents/sessions/agent-session-prompting.ts:28` `runAgentPrompt` | 一次用户消息如何变成"跑完→判断→再跑"的会话循环？（:32 `while(true)` + `handlePostAgentRun()` :53 三岔决策） |
| 3 | `src/agents/embedded-agent-runner/run-loop.ts:71` `runPreparedEmbeddedLoop` | 整个 run 的失败预算、模型轮换、空闲断路器挂在哪一层？（:315 `while(true)`、:193 预算、:331 耗尽处理） |
| 4 | `src/state/openclaw-agent-db-schema.ts` + `src/agents/tools/automations-tool-name.ts` | 助理醒来时"记得什么、约了什么"？（agent 级 SQLite schema；`automations` 工具 :6，旧名 `cron` :14） |

建议阅读顺序：2 → 1 → 3 → 4（先懂"什么时候再跑"，再懂"怎么跑"，再懂"跑不死"，最后懂"醒来靠什么"）。

## 2 核心执行链

```text
通道消息/automations 到点/heartbeat/standing-intent 命中
        │  gateway（WS，默认 127.0.0.1:18789）
        ▼
runPreparedEmbeddedLoop  src/agents/embedded-agent-runner/run-loop.ts:71
        │  while(true) :315 ←—— 外层：run 重试预算 24+8×N（32..160）
        │    beginRunAttempt :351 / isRunRetryBudgetExhausted :317
        │    耗尽 → handleRetryLimitExhaustion :331（failover 或报错）
        ▼
runAgentPrompt  src/agents/sessions/agent-session-prompting.ts:28
        │  agent.prompt(msg) → while(true){ handlePostAgentRun(); agent.continue() }
        │    决策（:53）：retryable? → compaction? → queued? → settled/handoff
        ▼
runLoop  packages/agent-core/src/agent-loop.ts:298
        │  外层 while(true) :351 ／ 内层 while(hasMoreToolCalls || pending) :355
        │  getSteeringAtCheckpoint :76 → prepareNextTurn :469
        ▼
streamAssistantResponse → 模型（stopReason 决定回合去留）
        │
        ▼
executeToolCalls :633 → sequential :764 / parallel :945
        │  beforeToolCall/afterToolCall/afterToolOutcome（types.ts:49/:100/:151）
        │  shouldTerminateToolBatch :1202 —— 全批 terminate 才停
        ▼
turn_end →（还有 tool call？回内层）→ agent_end
        ▼
finally: emit `agent_settled`（非 handoff 时）→ SQLite 状态已落库 → 等下一次唤醒
```

逐步定位（本次全部复核 [源码确认]）：

1. **唤醒入口**：通道消息 / `armTimer` 到点（`src/cron/service/timer-scheduler.ts:50`）/ heartbeat（`src/infra/heartbeat-runner-scheduler.ts:62`）→ 为该会话排一次 run。
2. **预算圈**：`run-loop.ts:315` `while(true)`；每圈先 `isRunRetryBudgetExhausted`（:317）再 `beginRunAttempt`（:351）；耗尽 → `handleRetryLimitExhaustion`（:331）。
3. **会话起跑**：`agent-session-prompting.ts:28` `agent.prompt()` → 进入三层中最内层的 `runLoop`。
4. **回合推进**：`agent-loop.ts:351/:355` 双层 while；steering 在 :76 检查点排空；模型调用前 `prepareNextTurn`（:469）可换模型/思考档。
5. **工具执行**：`agent-loop.ts:633`（seq :764 / par :945），全批 terminate :1202；审批与观测在 `types.ts:49/:100/:151` 三钩子。
6. **自然收敛**：无 tool call 且队列空 → `agent_end`（`agent-loop.ts:523`）；abort 走 `stopIfAborted`（:320）落半截回合。
7. **续跑裁决**：`handlePostAgentRun`（prompting :53）六规则（见 §4.3）→ `agent.continue()` 或收束。
8. **收束落库**：finally 中非 handoff 发 `agent_settled`（:47-48）；SQLite 已是完整事实源，进程退出无损失。

## 3 十二章规划

编号 00 为课程入口，01–11 主题章，12 实践与面试（与 grok 课程同构：页面含 CHAPTER 01–12）。

### 00 课程入口 · COURSE ENTRY
- **h2**：一个活在你设备与聊天频道里的助理，内核为什么反而最"克制"？
- **lede**：OpenClaw 把 Pi 式极简循环原封不动保留在内核，把所有工程复杂度（预算、持久化、唤醒、记忆、审批）堆到外围。本课程沿三层循环向外逐层拆解。
- 事实：内核 `runLoop` 与 Pi 双层 while 同构 [源码确认]（`agent-loop.ts:351/:355`）；runtime legacy 别名 `pi`→`openclaw` [源码确认]（`docs/agent-runtime-architecture.md`）；VISION 自述 lineage Warelay→Clawdbot→Moltbot→OpenClaw [文档声明]。
- 实验：无（导航页）。

### 01 三层循环 · THE LOOP STACK
- **h2**：一次对话不是一条大循环，而是三层各有职责的小循环嵌套。
- **lede**：会话层管"要不要再跑一轮"，内核管"这一轮里模型和工具怎么咬合"，run 外层管"这个 run 失败了还有几次命"。
- 事实：`runAgentPrompt`（`agent-session-prompting.ts:28`，`while(true)` :32，`agent.continue()` 续跑）[源码确认]；`runLoop`（`agent-loop.ts:298`）外层 :351 跟进 followUp 队列、内层 :355 跟进 tool calls + steering [源码确认]；`runPreparedEmbeddedLoop`（`run-loop.ts:71`）把整个 run 包进重试预算 [源码确认]；事件边界 `agent_start`/`turn_start`（`agent-loop.ts:228-229`）到自然终止 `agent_end`（:523）；失败/abort 路径走 `pushLoopFailure`（:274-292）与 `stopIfAborted`（:320）[源码确认]。
- 实验：**loop-stepper**（数据见 §4.1）。

### 02 完成与续跑 · SETTLED OR CONTINUE
- **h2**：“跑完了吗”由三股力量裁决：模型 stopReason、Harness 队列、宿主移交。
- **lede**：内核自然停（无 tool call 且队列空）只是必要条件；会话层还会因重试、压缩、排队消息强行续跑，或因 turn handoff 把控制权交给外部投递。
- 事实：`handlePostAgentRun`（:53）决策序：handoff→settled（:58-61）；aborted/无消息→settled（:62-64）；`isRetryableError && prepareRetry`→continue（:66-68）；`checkCompaction`→continue（:81）；`hasQueuedMessages()`→continue 否则 settled（:85）[源码确认]；`steer()`（`agent.ts:337`）运行中注入、`followUp()`（:342）跑完注入、`abort()`（:373）[源码确认]；`shouldTerminateToolBatch`（`agent-loop.ts:1202`）要求**全批**工具 `terminate:true` 才终止 [源码确认]；非 handoff 结束时 finally 里 emit `agent_settled`（:47）[源码确认]；会话级自动重试走指数退避 `baseDelayMs * 2 ** (retryCount - 1)`，并与 provider 的 `Retry-After` 取 max（`agent-session-execution.ts:53/:59`），`isRetryableError` 只认 overloaded / rate-limit / server error——上下文溢出不重试、交给 compaction（:18-21 注释）[源码确认]；成功响应即清零 `retryCount`（`agent-session-base.ts:450-456`），重试开关与 `maxRetries` 上限在 `willRetryAfterAgentEnd`（:462-464）[源码确认]。
- 实验：**decision-matrix**（数据见 §4.3）。

### 03 状态与持久化 · TWO SQLITE FILES
- **h2**：助理的记忆不在内存里，在两本 SQLite 账本里。
- **lede**：全局 `openclaw.sqlite` 管跨 agent 事实，每 agent 的 `openclaw-agent.sqlite` 管会话/transcript/记忆索引；崩溃恢复靠"状态已落库 + 事件重放"，没有运行中快照。
- 事实：schema 版本 `state:9 / agent:17` [源码确认]（`package.json` `openclaw.schemaVersions`）；路径 `src/state/openclaw-state-db.paths.ts:40`（openclaw.sqlite）与 `openclaw-agent-db.paths.ts:31`（openclaw-agent.sqlite，另有 :19 incognito 变体）[源码确认]；agent 库含 `conversations`（schema :251）、`sessions`（:270 迁移）、`session_routes`（:477）、`state_leases`（:306）、`transcript_events`（`openclaw-agent-message-tool-outcome-schema.ts:8`）、`standing_intents`、`session_transcript_index_state`、`board_tabs` 等表（canonical schema SQL 汇总于 `src/state/openclaw-agent-schema.ts`，marker 常量见 `openclaw-agent-board-schema.ts:5-7` 与 `standing-intents` schema 常量）[源码确认]；abort 时把失败回合+interrupted-turn 说明落进消息流（`agent-loop.ts:320` `stopIfAborted`）[源码确认]；全局库另有 `user_preferences`（`src/state/user-preferences.ts:21`）、`commitments` / `audit_events`（建表定义 `state/openclaw-state-schema.sql:48/:154`）等表 [源码确认]；**崩溃恢复语义澄清**：`buildCliRespawnPlan`（`src/entry.respawn.ts:75`）只是用调整后的 Node flags 重生 CLI 进程，不是 agent run 的运行中快照恢复——恢复 = 新进程重读 SQLite 账本 + 唤醒源再点火 [源码确认]。
- 实验：**state-projection**（数据见 §4.4）。

### 04 记忆体系 · SEARCH, DREAM, INTEND
- **h2**：长期记忆=混合检索工具 + 夜间固化 + 常驻意图三件套。
- **lede**：模型用 `memory_search`/`memory_get` 主动查（FTS+向量混合）；凌晨 3 点 dreaming cron 整理固化；standing intents 让"没做完的事"能在未来消息里被关键词/embedding 唤醒。
- 事实：`createMemorySearchTool`（`extensions/memory-core/src/tools.ts:272`）与 `createMemoryGetTool`（:531）[源码确认]；`memory_index_chunks`+`custom_memory_fts`+`memory_embedding_cache` 表与 `hybrid.ts`、`vector-blob.ts`（Float32Array blob）[源码确认]；`DEFAULT_MEMORY_DREAMING_FREQUENCY = "0 3 * * *"`（`src/memory-host-sdk/dreaming.ts:28`），memory-core 有完整 `dreaming-phases.ts`/`dreaming-consolidation.ts` 阶段文件 [源码确认]；standing intents 默认 cooldown 24h（`standing-intents.ts:12`）、最多触发 3 次（:13 `DEFAULT_INTENT_MAX_FIRES = 3`）、90 天过期（:14）；`createStandingIntent` :256 / `matchStandingIntents` :394 [源码确认]；检索分数还有重要性乘子（`applyImportanceMultiplier`，`memory/importance.ts:9`）与记忆预算压缩（`DEFAULT_MEMORY_FILE_MAX_CHARS = 10_000`、`compactMemoryForBudget`，`memory-budget.ts:33/:198`）[源码确认]；embedding 支持本地 provider（`memory/local-embedding-provider.ts`、`embedding-local-service.ts`），向量以 Float32 blob 存库（`memory/vector-blob.ts`）[源码确认]。
- 实验：无专属（配 03 的 state-projection 讲记忆表）。

### 05 自动化与唤醒 · WHAT WAKES THE AGENT
- **h2**：让助理主动的四把闹钟：automations、heartbeat、standing intents、通道消息。
- **lede**：模型自己就能注册定时任务（`automations` 工具，前身叫 `cron`）；调度器有独立并发与墙钟策略；heartbeat 是"活着就定期看一眼"的独立机制。
- 事实：`AUTOMATIONS_TOOL_NAME = "automations"`（`src/agents/tools/automations-tool-name.ts:6`），`"cron"` 是永久兼容别名（:14-15）[源码确认]；调度器 `armTimer`（`src/cron/service/timer-scheduler.ts:50`）、到点批处理（:183 `dueJobs`）与并发上限（:271 `resolveRunConcurrency`）[源码确认]；墙钟：普通 job 10 分钟、agentTurn 安全阀 60 分钟（`src/cron/service/timeout-policy.ts:10/:16/:28`）[源码确认]；heartbeat：`startHeartbeatRunner`（`src/infra/heartbeat-runner-scheduler.ts:62`）、单次超时与间隔挂钩且封顶 10 分钟（`heartbeat-runner-config.ts:29`）[源码确认]；官方文档给出分工决策表："Automations=精确时机（cron 表达式/一次性），Heartbeat=近似节奏（默认约每 30 分钟）"，automations 作业持久化且输出可投递到聊天通道或 webhook [文档声明]（`docs/automation/index.md:52/:64`、`docs/automation/cron-vs-heartbeat.md`）；模型侧还有 `heartbeat_respond` 工具回应心跳（`src/agents/tools/heartbeat-response-tool.ts` + 名称常量 `src/auto-reply/heartbeat-tool-response.ts:10`）[源码确认]；cron 任务的网关协议 schema 在 `packages/gateway-protocol/src/schema/cron.ts`（`CronJobSchema`）[源码确认]；工具实现本身按职责拆分：`cron-tool.ts / cron-tool-creator-cap.ts / cron-tool-write.ts / cron-tool-self-list.ts / cron-tool-canonicalize.ts / cron-tool-caller-scope.ts`（`src/agents/tools/`）——注册、改写、自列表、规范化、调用者作用域各一个文件 [源码确认]。
- 实验：无专属（atlas-locator 症状之一涉及唤醒）。

### 06 资源治理 · BUDGET NOT COUNTERS
- **h2**：防失控不靠"最多跑 N 轮"，靠一整排分层断路器。
- **lede**：内核无 maxTurns；真正的限量在外层：run 重试预算、48h 墙钟、空闲 5 连击、compaction 后同参同果窗口 3、以及**默认关闭**的工具循环检测。
- 事实：预算 `clamp(24 + 8×profile数, 32, 160)`（`run/helpers.ts:120-132`），耗尽走 `handleRetryLimitExhaustion`（`run-loop.ts:331`；报错文案 "Request failed after repeated internal retries" 在 `run/retry-limit.ts:43`）[源码确认]；`recordRunRetry` 对 `progress_continuation` **不计费**（实现上先扣后退：计费 +1 后把 `attemptsCounted` 减回，`retry-budget.ts:35-38`）——有进展的续跑不吃预算 [源码确认]；墙钟默认 48h、**0=不限 sentinel**（`src/agents/timeout.ts:13`/:21-24）[源码确认]；空闲断路器 `MAX_CONSECUTIVE_IDLE_TIMEOUTS_BEFORE_OUTPUT = 5`（`run/idle-timeout-breaker.ts:16`）[源码确认]；compaction 后守卫 `DEFAULT_WINDOW_SIZE = 3`、违规抛 `PostCompactionLoopPersistedError`（`post-compaction-loop-guard.ts:14/:166`）[源码确认]；`tool-loop-detection.ts:53-54` `enabled:false`，阈值 warn 10 / critical 20 / circuit 30（:49-52）[源码确认]；纯推理重试 2 / 空回复重试 1（`run/incomplete-turn-recovery.ts:32-33`，run-loop.ts:190-191 消费）[源码确认]；预算耗尽≠直接报错：有 `fallback_model` 决策时抛 `FailoverError` 切模型继续，否则产出用户可见失败载荷（`run/retry-limit.ts:29-43`）[源码确认]；同模型 rate-limit 原地重试 ≤3 次、线性退避步长 10s（10/20/30s，`run/helpers.ts:48-51`），超出才进 profile 轮换 [源码确认]。
- 实验：**budget-breaker**（数据见 §4.6）。

### 07 上下文压缩 · TWO PATHS, ONE PLUG
- **h2**：溢出是事故，超阈值是保养——compaction 有两条路径，且引擎可整体换掉。
- **lede**：`checkCompaction` 区分"模型报错了被动压"与"到水位了主动压"；被动压缩带自动重试且有次数上限；更外层，context-engine 是一个七能力面的可插拔接口。
- 事实：两路径定义见注释与实现（`src/agents/sessions/agent-session-compaction.ts:283-284`；溢出 :335-353、阈值 :377）[源码确认]；溢出压缩重试上限 `MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3`（`src/agents/agent-compaction-constants.ts:14`）[源码确认]；阈值路径压缩后**不**自动重试（:284 注释）[源码确认]；`ContextEngineHostCapability` 七项：`bootstrap / assemble-before-prompt / after-turn / maintain / compact / runtime-llm-complete / thread-bootstrap-projection`（`src/context-engine/types.ts:64-71`）[源码确认]；`promptAuthority: "assembled" | "preassembly_may_overflow"`（:27）决定预检用装配后还是装配前估计；引擎经 `registry.ts`/`delegate.ts`/`host-compat.ts` 注册与能力协商，并有 `quarantine-health.ts` 隔离异常引擎 [源码确认]（`src/context-engine/`）；压缩本身还有护栏钩子：`src/agents/agent-hooks/` 下 `compaction-safeguard.ts`、`compaction-instructions.ts`、上下文修剪 [源码确认]；`ContextEngineOperation` 三种操作面：`agent-run / manual-compact / subagent-spawn`（`types.ts:50`）[源码确认]。
- 实验：无专属（decision-matrix 中包含 compaction 分支）。

### 08 工具执行域 · TOOLS AS CAPABILITY SURFACE
- **h2**：工具域是策略裁剪后的能力视图，执行前后各有一道钩子闸。
- **lede**：会话、子代理、节点设备、媒体生成、网页、cron……几十个内置工具文件按域划分；before/afterToolCall 与 afterToolOutcome 让审批与观测插在工具两侧；并行/串行按工具级 executionMode 混合。
- 事实：`executeToolCalls`（`agent-loop.ts:633`）分流 sequential :764 / parallel :945，deferred 工具解析 :1239 [源码确认]；三钩子契约在 `packages/agent-core/src/types.ts:49/:100/:151` [源码确认]；工具清单在 `src/agents/tools/`：`sessions-send/spawn/list/history/search`、`subagents-tool.ts`、`agent-step.ts:60 runAgentStep`（嵌套 run）、`nodes-tool.ts`、`computer-tool.ts`、`terminal-tool.ts`、`web-search/web-fetch`、`image/music/video-generate`、`goal-tools.ts`、`skill-workshop-tool.ts`、`transcripts-tool.ts`、`dashboard-tool.ts` 等 [源码确认]；并发 lane：`createEmbeddedRunLaneController`（`run/lane-controller.ts`，`run-orchestrator.ts:70` 引入），全局 lane 与每会话 lane 双轨入队（:197/:209）[源码确认]；`resolveDeferredTool`（`agent-loop.ts:1239`）支持运行中延迟解析的工具；transcript 支持归档重写水位（`transcript_rewrite_watermarks` 表，`openclaw-agent-session-transcript-archive-schema.ts:8`）[源码确认]。
- 实验：无专属（loop-stepper 步内展示工具批）。

### 09 通道与网关 · ONE GATEWAY, MANY SURFACES
- **h2**：一个长驻 Gateway 拥有所有通道连接，其它一切都是它的 WS 客户端。
- **lede**：WhatsApp/Telegram/Slack/Discord/Signal/iMessage 通道各自只有一个宿主；CLI、Web Control UI、macOS 应用、automations 都以 WS 角色接入同一个 Gateway，设备节点（node）再声明自己的 caps。
- 事实：架构文档：单 Gateway、WS on `127.0.0.1:18789`、node 以 `role: node` 同端口接入、emit 面 `agent/chat/presence/health/heartbeat/cron`、客户端订阅面含 `tick/shutdown`（`docs/concepts/architecture.md:31/:37`——tick 是订阅节奏，不是 emit 事件名）[文档声明+源码确认]；通道实现为扩展：`extensions/telegram`（grammY）、`whatsapp`（Baileys）、`discord`、`slack`、`signal`、`imessage`、`msteams`、`googlechat`、`matrix`、`irc`、`nostr`、`sms`、`zoom-meetings` 等 [源码确认]；协议与校验在 `packages/gateway-protocol`（帧守卫 `frame-guards.ts`、JSON Schema 校验）[源码确认]；Control UI 在 `ui/`，服务端另托管 `/__openclaw__/canvas/`、`/__openclaw__/a2ui/` 部件面 [文档声明+源码确认]；内嵌场景（TUI/单进程）通过 `in-process-gateway.ts` / `embedded-gateway-stub.ts`（`src/agents/tools/`）复用同一网关契约，工具不感知自己面对的是进程内还是远程 Gateway [源码确认，合理推断（双实现同接口）]；node 暴露设备能力命令（`camera.*`、`screen.record`、`location.get`，macOS app 加 `canvas.*`），配对为设备级、审批存于 device pairing store [文档声明]（`docs/concepts/architecture.md`）；配对/共享/审批相关表在 `src/state/` 的 schema 常量中可见（`session_members`、`device_pairing_join_codes`、`operator_approvals`）[源码确认]。
- 实验：**surface-switchboard**（数据见 §4.5）。

### 10 权限与安全 · APPROVAL AS A CHANNEL EVENT
- **h2**：审批不是弹窗，是可以走任意聊天频道回复的网关对象。
- **lede**：exec 审批由 ExecApprovalManager 集中管理，策略三态（off/on-miss/always）+ 兜底（deny/allowlist/full）；`ask_user` 让模型自己挂起等人回答；DM 陌生发送者默认走配对审批。
- 事实：`ExecApprovalManager`（`src/gateway/exec-approval-manager.ts:231`）+ 周边 30+ 审批文件（allowlist、policy、forwarder、sqlite store…）[源码确认]；策略枚举 `ask: off|on-miss|always`、`askFallback: deny|allowlist|full`（`src/infra/exec-approvals-config.ts:257-259`），默认 `ask:"off", askFallback:"deny"`（:123-125）[源码确认]；审批可转发到通道并支持 reaction 批准（`src/infra/exec-approval-forwarder.ts`、`src/plugin-sdk/approval-reaction-runtime.ts，发布为 plugin-sdk/approval-reaction-runtime 导出子路径`）[源码确认]；拒绝的落点是内核契约：`BeforeToolCallResult { block:true, reason }` 阻止执行、**由 loop 代投一条 error tool result**，模型只看到被拒结果（`packages/agent-core/src/types.ts:49-57` 注释原文）[源码确认]；`ask_user`：`reserveAskUserPromptDelivery`（`ask-user-tool.ts:180`）/`waitForAskUserPromptReady`（:213）/`createAskUserTool`（:460）[源码确认]；README 安全段：inbound 消息按不可信输入对待、DM 配对 `openclaw pairing approve` [文档声明]。
- 实验：无专属（surface-switchboard 的审批行列涉及）。

### 11 扩展与人格 · PLUGINS, SKILLS, SOUL
- **h2**：能力在 extension 里，手艺在 skill 里，性格在 SOUL.md 里。
- **lede**：150 个扩展目录覆盖模型 provider、通道、记忆后端；52 个技能是 markdown 手册；SOUL.md 注入人格层让助理"有声音"；连内核 runtime 本身都可被插件 harness 替换。
- 事实：`extensions/` 约 150 项：`memory-core/memory-lancedb/memory-wiki/active-memory`、模型 provider（anthropic/openai/ollama/lmstudio/…）、通道、`browser`、`canvas`、`voice-call`、`diagnostics-otel/prometheus`、`migrate-hermes/migrate-claude`、`policy`、`vault` [源码确认]；资源清单在 `package.json` 的 `openclaw.{extensions,skills,prompts,themes}`（`docs/agent-runtime-architecture.md`）[文档声明]；runtime 选择：内置 id `openclaw`，插件 harness 可注册 `codex`，`auto` 按 provider 路由选择 [文档声明]；`docs/concepts/soul.md`：SOUL.md 注入普通会话的高优先指令层 [文档声明]；`custodian-skills/` 仅 4 个"自维护"技能：`add-model-provider / cloud-image-bake / configure-channel / diagnose-gateway`——助理照看自己安装/通道/诊断的手册 [源码确认]；仓库还有成熟度记分卡：`taxonomy.yaml`（"Maturity scorecard"，含 `smoke-ci` / `personal-agent` 等证据 profile）与 `qa/maturity-scores.yaml`（50 个 active surfaces）[源码确认]；插件走 plugin SDK barrel（`packages/plugin-sdk`），文档明令插件不得 import `src/**` 内部 [文档声明]。
- 实验：无专属。

### 12 实践与面试 · DIAGNOSE THE LOBSTER
- **h2**：把前十一章倒过来用：从症状走回源码。
- **lede**：五步诊断法 + 三套面试题（架构/故障/安全），全部答案可落回本文定位。
- 事实：见 §7。
- 实验：**atlas-locator**（数据见 §4.2）。

## 4 交互实验数据

实验-章节映射：**01 loop-stepper**（三层循环步进）、**02 decision-matrix**（续跑裁决）、**03 state-projection**（状态投影）、**06 budget-breaker**（自定义：重试预算消耗模拟器）、**09 surface-switchboard**（表面接线板）、**12 atlas-locator**（症状定位器）。

### 4.1 loop-stepper（第 01 章）— 三层循环步进器

| stepLabel | eventName | note |
|---|---|---|
| 唤醒 | `gateway.message_in` | Telegram 消息到达 Gateway；为该会话发起一次有界 run |
| 预算开闸 | `run_attempt_begin` | `runPreparedEmbeddedLoop` while(true) 第 1 圈，`beginRunAttempt`（run-loop.ts:351），预算=clamp(24+8×N,32,160) |
| 会话层起跑 | `agent_start` | `runAgentPrompt` 调 `agent.prompt()`；`agent_start`+首个 `turn_start`（agent-loop.ts:228-229） |
| 模型回合 | `message_end → turn_end` | 模型返回 tool call；`shouldTerminateToolBatch=false`，内层 while 继续 |
| 工具批执行 | `tool_execution_end ×k` | before/afterToolCall 钩子夹住每个工具；parallel/sequential 按 executionMode |
| 运行中插话 | `steering_drain` | 用户 steer() 的消息在下一检查点 `getSteeringAtCheckpoint`（:76）注入内层 |
| 自然停 | `agent_end` | 无更多 tool call 且队列空；内层→外层→`agent_end`（:523） |
| 续跑裁决 | `post_agent_run: settle` | `handlePostAgentRun`：非重试、未触发压缩、无排队 → `settled` |
| 会话收束 | `agent_settled` | finally 里 emit（agent-session-prompting.ts:47-48）；handoff 时跳过，外部投递接管 |
| 落库休眠 | `state_flushed` | transcript/状态已在 SQLite；进程不需要空转，等下一次唤醒 |

### 4.2 atlas-locator（第 12 章）— 症状定位器

| label | title | body | status |
|---|---|---|---|
| 助理"不回消息"了 | 先分清死亡与长眠 | 跨天存活本来就靠"不跑"实现：run 有界，结束即落库等唤醒。先查 `openclaw gateway status` 与 cron 是否 arm（`armTimer`，timer-scheduler.ts:50），再看 heartbeat 是否在 active hours 内 | 设计如此 |
| 同一个任务反复重跑、越来越贵 | run 重试预算在吃失败 attempt | 预算只计失败/recovery（`retry-budget.ts:35`），"有进展的续跑" `progress_continuation` 不吃预算；若每次都在涨，看 `handleRetryLimitExhaustion`（run-loop.ts:331）前的 profile 轮换与 `auto_retry_end` 事件 | 需配置 |
| 凌晨记忆文件突然变大/被改写 | Memory Dreaming 到点固化 | 默认 cron `"0 3 * * *"`（`dreaming.ts:28`）做 consolidation；`dreaming-consolidation.ts`/`dreaming-phases.ts` 是阶段实现；频率可配 | 设计如此 |
| 模型一直重复调同一个工具却不被掐断 | 工具循环检测默认关 | `tool-loop-detection.ts:53` `enabled:false`，opt-in 后才有 warn10/critical20/breaker30；默认唯一兜底是 compaction 后窗口守卫（window 3）与 idle 断路器 5——它们都不是防重复调用的 | 默认关闭 |

### 4.3 decision-matrix（第 02 章）— 续跑裁决

维度（行）×规则（列），模拟 `handlePostAgentRun` 一次输入走查。规则顺序即短路顺序：

| # | 规则（agent-session-prompting.ts） | 输入 | 裁决 |
|---|---|---|---|
| R1 | `endedForTurnHandoff`（:57） | handoff=true | `handoff`，不发 agent_settled |
| R2 | 无消息或 `stopReason==="aborted"`（:63） | aborted | `settled` |
| R3 | `isRetryableError && prepareRetry`（:68） | overloaded 错误、retry 1/3 | `continue` |
| R4 | 错误且重试预算尽→`auto_retry_end:false`（:73-80） | retryCount≥max | 发事件、清计数，落入 R5 |
| R5 | `checkCompaction`（:81） | 上下文溢出 / 超阈值 | 溢出：压后 `continue`；阈值：压后不自动续 |
| R6 | `hasQueuedMessages()`（:85） | agent_end 钩子排了消息 | `continue`，否则 `settled` |

示例 trace：`msg=error(overflow)` → R1✗ R2✗ R3✗(溢出不可重试，交压缩) R4✗ R5✓（runAutoCompaction("overflow",true) :353）→ `continue`；第二次同输入再走 R5，若已 3 次溢出压缩则 `MAX_OVERFLOW_COMPACTION_ATTEMPTS` 封顶报错（:335-341）。

### 4.4 state-projection（第 03 章）— 状态投影

事件流：`message_in → run_attempt → turn_end → agent_end → agent_settled →(崩溃)→ restart → cron_due`。

计数器：`retryCount`（会话级，成功即清零，:456）；`runRetryBudget.used`（只计 recovery）；`overflowRecoveryAttempts`（封顶 3）；`transcript_events` 行数（单调增）；`standing_intent.fires`（≤3）。

投影规则：崩溃后 `retryCount/budget` 归零（进程内存），但 transcript、standing_intents、automations 定义、memory 索引从 SQLite 原样恢复——恢复语义是"新 run 读旧账本"，不是"续跑半截 run"；`state_leases` 表保证多进程对同一 DB 的租约互斥。

### 4.5 surface-switchboard（第 09 章）— 表面接线板

每表面 × 四行（协议角色 / 消息进出来路 / 审批与交互 / 断线语义）：

| | Telegram 通道 | Discord 通道 | Control UI (web) | CLI / TUI | macOS 伴生 app |
|---|---|---|---|---|---|
| 协议角色 | Gateway 宿主侧通道扩展（grammY） | Gateway 通道扩展 | WS 客户端（127.0.0.1:18789） | WS 客户端 | WS 客户端（control-plane） |
| 消息进出 | inbound debounce→会话路由→run；outbound 走通道插件 | 同左 + reaction 审批 | 聊天历史读写走 Gateway WS | 同左，TUI 渲染器复用会话工具 | 同左 + `canvas.*` 部件命令 |
| 审批与交互 | exec 审批转发进聊天，文本/reaction 批复 | 同左 | 审批面板 + ask_user 回答框 | 交互式提示 | 系统通知 + 审批 |
| 断线语义 | Gateway 在则助理在"睡"，run 仍由唤醒驱动 | 同左 | 纯客户端，断线无状态损失 | 同左 | node 配对重连（device pairing store） |

### 4.6 budget-breaker（第 06 章）— 重试预算消耗模拟器

输入参数：`profileCandidates`（1..20）、事件序列（每事件类型）。规则：

- 预算 `max = clamp(24 + 8×profiles, 32, 160)`（helpers.ts:128-132）。
- `progress_continuation` / compaction 后正常续跑：**不扣**（实现上先扣后退，retry-budget.ts:35-38）。
- `recovery`（失败 attempt、profile 轮换、auth 重试、compaction 后重试）：**扣 1**。
- 同模型 rate-limit 原地重试 ≤3 不吃 profile 轮换（helpers.ts:48），线性退避 10/20/30s（:51），与 provider `Retry-After` 取 max（`agent-session-execution.ts:59`）。
- 独立红线：cron 普通 job 墙钟 10min、agentTurn 安全阀 60min（`timeout-policy.ts:10/:16`）——预算之外另两条时间闸。
- 扣至 `used ≥ max` → `handleRetryLimitExhaustion`（run-loop.ts:331）：有 fallback_model 则切换继续，否则产出 "Request failed after repeated internal retries"（retry-limit.ts:43）。

示例 trace：profiles=2 → max=clamp(40)=40。事件 `[ok, rate_limit×3, profile_switch(扣), recovery(扣), progress_continuation(不扣), recovery(扣)…]`：used 从 0→3 时第 4 个 recovery 触发 40 上限前预警；UI 显示"跑不死"的余量条与 idle 断路器 5、48h 墙钟三条独立红线，任一触线即断路。

## 5 教学骨架代码

**选点：run 重试预算**——最能代表 OpenClaw"分层治理"的机制。教学简化，命名与真实源码对齐（`RunRetryBudget / recordRunRetry / resolveMaxRunRetryIterations`），**非上游复制**。

```ts
// teaching-skeleton: run-retry-budget.ts —— 与 run/helpers.ts、run/retry-budget.ts、run-loop.ts 结构对齐
type RunRetryKind = "progress_continuation" | "recovery"; // 同 retry-budget.ts:1

const BASE_RUN_RETRY_ITERATIONS = 24;        // helpers.ts:120
const RUN_RETRY_ITERATIONS_PER_PROFILE = 8;  // helpers.ts:121
const MIN_RUN_RETRY_ITERATIONS = 32;         // helpers.ts:122
const MAX_RUN_RETRY_ITERATIONS = 160;        // helpers.ts:123

export function resolveMaxRunRetryIterations(profileCandidateCount: number): number {
  const scaled = BASE_RUN_RETRY_ITERATIONS +
    Math.max(1, profileCandidateCount) * RUN_RETRY_ITERATIONS_PER_PROFILE;
  return Math.min(MAX_RUN_RETRY_ITERATIONS, Math.max(MIN_RUN_RETRY_ITERATIONS, scaled));
}

export interface RunRetryBudget { max: number; used: number }
export function createRunRetryBudget(max: number): RunRetryBudget { return { max, used: 0 }; }

// 关键语义：有进展的续跑不吃预算（真实源码 retry-budget.ts:35-38 同款：先 +1 再退回）
export function recordRunRetry(budget: RunRetryBudget, kind: RunRetryKind): void {
  if (kind === "progress_continuation") return;
  budget.used += 1;
}
export function isRunRetryBudgetExhausted(budget: RunRetryBudget): boolean {
  return budget.used >= budget.max;
}

// 外层 run 循环骨架（对应 runPreparedEmbeddedLoop 的 while(true)，run-loop.ts:315）
export async function runPreparedEmbeddedLoopTeaching(
  attempt: (budget: RunRetryBudget) => Promise<{ outcome: "done" | "retry"; kind: RunRetryKind }>,
  profiles: number,
  onExhausted: (budget: RunRetryBudget) => Promise<{ outcome: "done" }>,
): Promise<{ outcome: "done" }> {
  const budget = createRunRetryBudget(resolveMaxRunRetryIterations(profiles));
  while (true) {
    if (isRunRetryBudgetExhausted(budget)) return onExhausted(budget); // 真实源码此处 failover/报错（run-loop.ts:317-331）
    const result = await attempt(budget);                              // beginRunAttempt ≈ run-loop.ts:351
    if (result.outcome === "done") return result;
    recordRunRetry(budget, result.kind);                               // idle 断路器 / 48h 墙钟在真实实现里并行生效
  }
}
```

## 6 事实边界

1. **tool-loop-detection 默认关闭**：warn 10 / critical 20 / breaker 30 是配置默认值（`tool-loop-detection.ts:49-54`），`enabled:false` 意味着默认态下没有"重复工具调用"断路器；教学时不得表述为"OpenClaw 有内置循环检测在跑"。[源码确认]
2. **48h 是墙钟超时不是任务时长保证**：默认 48h 但配置 0 = 不限（sentinel，`timeout.ts:21-24`），且不限时 LLM idle watchdog（断路器 5）仍在管活性；"能跑 48 小时"是简化说法。[源码确认]
3. **通道后端与模型推理不在本仓库**：Telegram/Discord 等通道走 `src/channels/*` + `extensions/<channel>` 的传输适配，实际服务端与模型 provider 推理属外部服务；本仓库只保证执行与治理机制。[边界声明，同对比报告 §12.2]
4. **线上产品配置可能覆盖源码默认值**：本文所有默认值（预算、maxRetries、审批策略）仅确认到源码层；具体部署的 config 未在本仓库内。[边界声明]
5. **旧报告行号已漂移**：对比报告 `agent_harness_source_study.md` 基于更早提交（schema state 6 / agent 16）；当前 `e6915d09` 为 state 9 / agent 17，且多处行号后移（如 `runPreparedEmbeddedLoop` :64→:71、run-loop while :293→:315、`memory_get` :905→`createMemoryGetTool` :531）。建站时引用行号一律以本文为准。[源码确认]

## 7 实践与面试

### 五步诊断法（实践主方法）

1. **定层**：症状发生在哪层？唤醒（cron/heartbeat/通道）→ run 预算（run-loop）→ 会话续跑（runAgentPrompt）→ 内核（runLoop/工具）→ 状态（SQLite）。
2. **看事件**：`agent_start / turn_start / turn_end / agent_end / agent_settled / auto_retry_end` 哪个缺失或重复？事件即分层探针（agent-loop.ts:228/:523、agent-session-prompting.ts:47-48）。
3. **查预算**：run 重试 `used/max`、会话 `retryCount`、溢出压缩 `overflowRecoveryAttempts(≤3)`、idle 连击(≤5) 四个计数器各查各的，勿混为一谈。
4. **读账本**：agent SQLite 的 `transcript_events` 与 `sessions` 是唯一事实源；崩溃恢复问题先问"最后一条落库事件是什么"。
5. **验证唤醒**：跨天不动 = 唤醒源问题。`automations` 定义是否持久化、timer 是否 arm、heartbeat 是否在 active hours、standing intent 是否已 3 连发/过期。

### 实践任务清单（建站后可落地的 lab）

1. **Lab-1 断点看三层**：在 `runPreparedEmbeddedLoop` while 圈、`handlePostAgentRun` 返回值、`runLoop` 内层圈各打一个日志点，观察一条消息产生的 (圈数, 裁决, turn 数) 三元组。
2. **Lab-2 预算沙盘**：用 §5 骨架 + §4.6 事件序列，验证 profiles=1/5/20 时 `used ≥ max` 分别发生在第几个 recovery；把 `progress_continuation` 混入确认不计费。
3. **Lab-3 账本考古**：跑一轮对话后 kill -9 进程，重启同一 agent，仅用 SQLite（`transcript_events` 最后时间戳 vs 重启后第一条 run）复述"恢复=读账本+再唤醒"。
4. **Lab-4 唤醒矩阵**：分别用 automations（+1 分钟一次性）、heartbeat、standing intent、通道消息四种方式让同一 agent 醒来，记录事件面差异（`cron` 事件 vs `heartbeat` 事件 vs 普通消息）。
5. **Lab-5 审批通道化**：把 exec `ask` 设为 `always`，从 Telegram 触发一次 exec，观察审批请求→频道批复→`beforeToolCall block` → error tool result 回填的完整链（types.ts:49-57 契约）。

### 面试套题（每题四段：结论 / 机制 / 源码定位 / 反例追问）

**A 架构题**：“OpenClaw 如何让助理'活着'而不烧 token？”
- 结论：不靠长驻循环，靠有界 run + 持久状态 + 事件唤醒 + 记忆注入。
- 机制：三层循环（预算/会话/内核）；run 结束即 `agent_settled` 落库休眠；automations/heartbeat/通道消息再点火。
- 定位：`run-loop.ts:71`、`agent-session-prompting.ts:28/47`、`timer-scheduler.ts:50`、`heartbeat-runner-scheduler.ts:62`。
- 追问：agent_settled 为什么在 finally 里？（失败/中止也要收束，唯一例外 handoff 移交外部投递。）

**B 故障题**：“一个 cron 任务每天凌晨都失败重跑，怎么查？”
- 结论：先在"定层"里分清是 run 失败预算耗尽、agentTurn 60min 安全阀、还是 dreaming/任务本身报错。
- 机制：预算只计 recovery；到点重跑多为"上次没跑完 + 定义持久化 + 明早再 arm"。
- 定位：`helpers.ts:120-132`、`retry-budget.ts:35`、`timeout-policy.ts:16`、`retry-limit.ts:43` 的失败载荷、transcript_events。
- 追问：为什么"有进展的续跑"不扣预算反而可能烧更多钱？（预算防失控不防长任务——48h 墙钟与 idle 5 才是另两条红线。）

**C 安全题**：“助理要在 Telegram 里执行一条危险 shell，链路上有哪几道闸？”
- 结论：审批模式 → ExecApprovalManager 集中裁决 → 审批转发到通道等批复；未批的调用以失败结果回填，模型只见结果不见豁免。
- 机制：`ask: off|on-miss|always` 三态 + `askFallback: deny|allowlist|full`；DM 不可信输入与 pairing；beforeToolCall 可阻断。
- 定位：`exec-approvals-config.ts:123-125/:257-259`、`exec-approval-manager.ts:231`、`types.ts:49`（beforeToolCall）、README 安全段。
- 追问：Gateway 的 WS 为什么默认只绑 127.0.0.1？（信任边界：控制面在本机，远程必须走 SSH/Tailscale 隧道，防止任何能连端口的人驱动你的设备。）

## 8 术语表

| 术语 | 释义 |
|---|---|
| **run** | 一次有界的助理执行 episodes：从 `agent_start` 到 `agent_end`，可含多个 turn；跨天任务由多次 run 接力 |
| **turn** | 一次 assistant 回复 + 其工具调用批，由 `turn_start/turn_end` 界定 |
| **steer / followUp** | 运行中即时注入 / 本轮自然结束后注入的用户消息队列（agent.ts:337/:342） |
| **settled / handoff** | 会话层收束的两种终局：正常落库休眠 / 把后续 run 控制权移交外部投递方 |
| **run 重试预算** | 外层失败 attempt 配额 `clamp(24+8N,32,160)`；progress_continuation 不计费 |
| **automations（前身 cron）** | 模型可自助注册的持久定时任务；旧名 `cron` 作永久兼容别名 |
| **Memory Dreaming** | 默认凌晨 3 点的记忆固化 cron（consolidation phases），非运行时检索路径 |
| **standing intent** | 常驻意图：登记后由未来消息关键词/embedding 命中唤醒，24h cooldown、3 次封顶、90 天过期 |
| **lane controller** | 嵌入式 run 的并发轨道：全局 lane + 每会话 lane，双轨排队 |
| **SOUL.md** | 注入普通会话人格指令层的操作者文件，"voice 住在这里" |

## 9 Hero 循环图

五节点长期循环（中文名 + 缩写），体现"唤醒→run→工具→状态→记忆"：

```text
        ┌──────────── 唤醒 WAKE ────────────┐
        │  automations · heartbeat ·         │
        │  通道消息 · standing intent         │
        ▼                                    │
   有界执行 RUN ────► 工具副作用 DO ────► 落库 STATE
   （预算 32..160，   （审批钩子夹住，    （双 SQLite，
     48h 墙钟）         terminate 语义）     transcript_events）
        ▲                                    │
        └──────── 记忆唤醒 REMEMBER ◄────────┘
             （search/get · dreaming 03:00 ·
               intent 匹配再点火）
```

一句话：醒来→干一票→把世界改成什么样记进账本→账本沉淀成记忆→记忆与闹钟决定下一次醒来。

节点与章节对应：唤醒=05（automations/heartbeat/intents/通道）、有界执行=01+06（三层循环+预算）、工具副作用=08+10（执行域+审批）、落库=03（双 SQLite）、记忆唤醒=04（检索/dreaming/intent 匹配）。Hero 动画建议把"预算耗尽→FailoverError→fallback_model"作为 RUN 节点的红色分支，把 `agent_settled` 作为 RUN→STATE 的收束边。

## 10 PRIMARY SOURCES

- 上游仓库：<https://github.com/openclaw/openclaw>（MIT，OpenClaw Foundation）
- 内核循环：<https://github.com/openclaw/openclaw/blob/main/packages/agent-core/src/agent-loop.ts>、<https://github.com/openclaw/openclaw/blob/main/packages/agent-core/src/agent.ts>
- 会话层：<https://github.com/openclaw/openclaw/blob/main/src/agents/sessions/agent-session-prompting.ts>、<https://github.com/openclaw/openclaw/blob/main/src/agents/sessions/agent-session-compaction.ts>
- run 预算层：<https://github.com/openclaw/openclaw/blob/main/src/agents/embedded-agent-runner/run-loop.ts>、<https://github.com/openclaw/openclaw/blob/main/src/agents/embedded-agent-runner/run/helpers.ts>、<https://github.com/openclaw/openclaw/blob/main/src/agents/embedded-agent-runner/run/retry-budget.ts>
- 记忆：<https://github.com/openclaw/openclaw/tree/main/extensions/memory-core/src>、<https://github.com/openclaw/openclaw/blob/main/src/memory-host-sdk/dreaming.ts>
- 状态 schema：<https://github.com/openclaw/openclaw/blob/main/src/state/openclaw-agent-db-schema.ts>
- 架构文档：<https://github.com/openclaw/openclaw/blob/main/docs/concepts/architecture.md>、<https://github.com/openclaw/openclaw/blob/main/docs/agent-runtime-architecture.md>、<https://github.com/openclaw/openclaw/blob/main/VISION.md>
- 人格与迁移：<https://github.com/openclaw/openclaw/blob/main/docs/concepts/soul.md>、<https://github.com/openclaw/openclaw/blob/main/docs/install/migrating-hermes.md>
- 自动化与心跳：<https://github.com/openclaw/openclaw/blob/main/docs/automation/index.md>、<https://github.com/openclaw/openclaw/blob/main/src/cron/service/timer-scheduler.ts>
- 审批与安全：<https://github.com/openclaw/openclaw/blob/main/src/gateway/exec-approval-manager.ts>、<https://github.com/openclaw/openclaw/blob/main/src/infra/exec-approvals-config.ts>、<https://github.com/openclaw/openclaw/blob/main/SECURITY.md>
- 官方文档站：<https://docs.openclaw.ai>（Gateway / Channels / Tools / Plugins 参考）
