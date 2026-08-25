# DeepSeek Harness 运行时教学提纲

> 源码基线：`deepseek-harness` 提交 `b150a55`。本文是面向中文教学站的 tutorial 草案，不是对所有 package 的 API 参考。
>
> 标签：`implemented fact` 表示源码直接实现；`inference` 表示由多个实现事实归纳出的设计含义；`teaching simplification` 表示为了教学而省略并发、错误分支或外围协议。

## 先建立一张地图

DeepSeek Harness 的核心不是一个不可替换的“大循环”，而是一棵由 Cordis Loader 挂载的插件树：模型适配器、prompt、tool registry、session、持久化和 agent loop 都是插件或服务。`implemented fact`：`boot()` 创建根 `Context`、安装 Loader，`mountRootInclude()` 挂载 `cordis:include`；`composeEntries()` 按 profile 的 bundle 顺序和 patch 层组成 entry 列表。源码：`packages/boot/app-boot/src/index.ts` — `boot`、`mountRootInclude`；`packages/boot/app-boot/src/profile.ts` — `composeEntries`。

`implemented fact`：插件注册通过 Cordis effect/listener，并可在卸载时反向清理；例如 agent-loop 用 `ctx.effect()` 注册工厂和 ownership，SystemPrompt/ToolRuntime 用作用域 registry 返回 disposer。源码：`packages/core/agent-loop/src/index.ts` — `AgentLoop` 构造函数；`packages/core/system-prompt/src/index.ts` — `SystemPrompt.section`、`SystemPrompt.tools`；`packages/core/tools/src/index.ts` — `ToolRuntime.register`。

`inference`：替换模型、工具或 compaction provider 的最小改动点通常是新增/替换插件配置，而不是修改 loop；loop 只依赖服务和事件。`teaching simplification`：教学实验可用一个内存 fake LLM 和一个 fake tool，不必启动完整 Web/ACP 入口。

## 第 1 章：从 Cordis composition 到一个可运行 Agent

学习目标：理解“配置行 → 插件 → 服务/事件 → agent”的装配过程。

`implemented fact`：profile 的 bundle patch 先叠加到空 entry 列表，随后应用 profile/home/launcher patch；命中的 patch 替换整行 config，不是深合并。源码：`packages/boot/app-boot/src/profile.ts` — `composeEntries`；`packages/boot/app-boot/src/index.ts` — `mountRootInclude`。

`implemented fact`：`AgentLoop` 构造时通过 `ctx.agents.setFactory(this)` 把创建能力交给 registry，并注册 prompt 变量；配置中的 agent 会走 `create` 或 `resume`。源码：`packages/core/agent-loop/src/index.ts` — `AgentLoop` 构造函数、`create`、`resume`。

`implemented fact`：创建事务先准备未发布的 Session 和 Agent scoped context，等待 setup/commit，再依次 `sessions.enter/announce`、`agents.enter/announce`、发出 `agent/session-start`，最后才允许 loop 驱动。源码：`packages/core/agent-loop/src/index.ts` — `prepare`、`setupAndPublish`、`PreparedAgent.publish`；`packages/core/session/src/index.ts` — `SessionStore.prepare`、`enter`、`announce`；`packages/core/agent/src/index.ts` — `AgentRegistry.enter`、`announce`。

`inference`：setup 是“组合 agent 的世界”，不是“开始执行任务”；这样观察者看不到半配置 agent。`teaching simplification`：先画成一个串行事务，进阶时再展示 owner disposal、创建取消和同步 listener 失败回滚。

## 第 2 章：Session 是唯一历史源，Agent 是活的驱动器

`implemented fact`：`Session` 保存连续 seq 的 append-only `SessionEvent`；`append()` 先做 lossless-JSON snapshot 和 surface 校验，再入 log、失效快照并同步通知观察者。源码：`packages/core/session/src/index.ts` — `Session.append`、`Session.events`、`SESSION_FORMAT_VERSION`。

`implemented fact`：Agent 通过一个持久化 inbox 接收 `next-turn`/`next-step` 输入；`Inbox.splice` 先 append `agent/inbox/spliced`，再改变内存队列，重建时从 seed 之后的 splice replay。源码：`packages/core/agent/src/inbox.ts` — `Inbox` 构造函数、`claim`、`splice`、`apply`；`packages/core/agent-loop/src/agent.ts` — `send`、`cancel`、`whenIdle`。

`implemented fact`：Agent 生命周期有 `idle`、`maintenance`、`running` 三种 phase；`runMaintenance()` 给 compaction 等独立维护工作占用 phase，`wakeDriver()` 处理维护期间或取消后的唤醒。源码：`packages/core/agent-loop/src/agent.ts` — `Phase`、`runMaintenance`、`wakeDriver`、`kick`。

`inference`：Session 负责“发生过什么”，Agent 负责“现在是否继续”；恢复时应重建前者，再挂上新的后者。`teaching simplification`：用“事件日志 + 状态机”两栏解释即可，不先引入 AsyncLocalStorage initiator 细节。

## 第 3 章：每一步如何形成 system prompt 和 request

`implemented fact`：`SystemPrompt.assemble()` 从 global/scoped layers 收集 sections、dynamic contexts、tool schemas、variables，按 order/名称排序，运行 `system-prompt/assemble` waterfall，并在需要时保留 complete section。源码：`packages/core/system-prompt/src/index.ts` — `SystemPrompt.assemble`、`PromptLayer`、`renderPrompt`。

`implemented fact`：默认 prompt 包含 order `-100` 的 harness identity 和 order `0` 的 `deployment:persona`；变量采用严格 `{{name}}` 插值，未知或 undefined 变量在 render 时失败。源码：`packages/core/system-prompt/src/index.ts` — `SystemPrompt` 构造函数、`PERSONA_SECTION`、`interpolate`。

`implemented fact`：`ReactLoopAgent.preStep()` 先 claim inbox，再 assemble prompt，运行时 context 作为一次 user-role snapshot 加入决策；`agent/pre-step` 可 rewrite 或 reject。源码：`packages/core/agent-loop/src/agent.ts` — `preStep`；`packages/core/system-prompt/src/index.ts` — `joinContextSections`、`renderContextSections`。

`implemented fact`：`buildRequest()` 用当前 session 的 request header 恢复 route/config，调用 `ctx.llm.prepareCall()` 绑定精确 adapter generation，写入 `request/header` 和 `request/context`，再构造带 `messages: session.deriveMessages()` 的 frozen request。源码：`packages/core/agent-loop/src/agent.ts` — `buildRequest`；`packages/llm/llm/src/index.ts` — `LlmRuntime.prepareCall`。

`inference`：模型看到的 system/tools/config 必须同时可由日志恢复；这不是 UI 快照，而是 request reconstruction 的前提。`teaching simplification`：示例先固定一个 provider/model，不演示 adapter defaults、HMR generation 和 replayState。

## 第 4 章：Agent loop：turn、step、stream、tool loop

`implemented fact`：一个 turn 先 append `turn/start`，经过 `preStep` 后 append `step/start` 和进入的 `user/message`；一个 step 是一次模型请求加该请求触发的 tools；没有更多 owed work 时由 `agent/turn-stopping` 收尾，再 append `turn/end`。源码：`packages/core/agent-loop/src/agent.ts` — `turn`、`step`；架构顺序图：`docs/architecture.md` — “Turn flow”。

`implemented fact`：`step()` 调用 prepared stream 或 `ctx.llm.stream()`，每个 chunk append `assistant/chunk` 并交给 `BlockAssembler`；正常完成 append `assistant/message`，中途取消则保存已交付 prefix 并标记 `interrupted`。源码：`packages/core/agent-loop/src/agent.ts` — `step`；`packages/llm/llm/src/index.ts` — `LlmRuntime.stream`、`adapterStream`。

`implemented fact`：LLM runtime 的 `llm/stream` 是 waterfall；adapter selection、prepare、iterator 和 provider error 被转换为 terminal finish chunk，而 middleware/consumer 错误仍按其所属边界抛出。源码：`packages/llm/llm/src/index.ts` — `streamWithRegistration`、`adapterStream`。

`implemented fact`：模型消息中的 tool-call 由 `executeToolCalls()` 按 execution mode 分组；exclusive call 形成 barrier，parallel call 使用受 `maxParallelToolCalls` 限制的 rolling pool，但结果按模型顺序 commit。每个 call/result 都写入 session，取消导致未启动调用生成合成错误 result。源码：`packages/core/agent-loop/src/tool-calls.ts` — `executeToolCalls`、`runGroup`、`appendToolCall`、`appendToolResult`。

`implemented fact`：ToolRuntime 的实际管线是 `tools/pre-execute` → approval/guard → `tools/execute` → tool body → `tools/post-execute` → content materialization/final notification；`ToolRuntime.execute` 只是该分阶段管线的完整入口。源码：`packages/core/tools/src/index.ts` — `ToolRuntime.execute`、`prepareExecution`、`dispatchScheduledExecution`、`postExecute`、`finishScheduledExecution`。

`inference`：tool result 不是 loop 的临时返回值，而是下一 step 的模型上下文和可 replay 的 durable surface。`teaching simplification`：第一版实验只实现一个 exclusive tool；第二版再切换 `isConcurrencySafe` 观察顺序提交。

## 第 5 章：日志、surface projection、持久化与恢复

`implemented fact`：`Session.deriveMessages()` 不直接遍历全部事件，而是折叠 `SurfaceManager.nodes`；`deriveEventMessage()` 只把 `user/message`、非空 `assistant/message`、`tool/result` 投影成模型消息，chunk、turn/step 边界和 trace 事件不进入 history。源码：`packages/core/session/src/index.ts` — `deriveMessages`；`packages/core/session/src/surface.ts` — `SurfaceManager`、`deriveEventMessage`、`foldSurface`。

`implemented fact`：surface replacement 用 `surfaceOp: {op:'replace', start, end}` 和 `sourceEventSeqs` 覆盖当前节点；校验要求范围存在、来源引用更早且完整，replacement 会增加 `replaceGeneration` 并使 derived cache 重建。源码：`packages/core/session/src/surface.ts` — `planSurfaceEvent`、`assertProvenance`、`applySurfacePlan`。

`implemented fact`：`PersistenceCoordinator` 按 SessionId 串行化 create/append/load/read，`SessionWriteBehind` 为每个 live Session 复制 pending events，在固定 batching deadline 或显式 `flush()` 时写入；持久化 commit 后才推进 cursor。源码：`packages/session/session-persistence/src/coordinator.ts` — `PersistenceCoordinator.appendCore`、`load`、`prepareCore`；`packages/session/session-persistence/src/write-behind.ts` — `SessionWriteBehind.enqueue`、`flush`、`drainBarrier`。

`implemented fact`：加载时 `prepareCore()` 校验 format/revision、调用 `interruptedTurnClosers()` 补齐 crash tail，再用 `SessionStore.prepare(... seedSource:'persistence')` 构造未发布 session；修复成功后才 commit backend repair。源码：`packages/session/session-persistence/src/coordinator.ts` — `prepareCore`、`commitPrepared`；`packages/core/session/src/repair.ts` — `interruptedTurnClosers`。

`implemented fact`：恢复补齐顺序是未完成 tool 的 synthetic `tool/result`、`step/end`、`turn/end {kind:'interrupted'}`；已有 `tool/call` 但无结果时标为 outcome unknown，未记录 start 时标为 not started。源码：`packages/core/session/src/repair.ts` — `TOOL_OUTCOME_UNKNOWN`、`TOOL_NOT_STARTED`、`interruptedTurnClosers`。

`inference`：日志采用“事件事实 + 可重算投影”：UI、transcript、model history、telemetry 可以各自从同一 log 派生而不互相成为真相源。`teaching simplification`：课堂只展示内存 log 和一个 JSONL-like fake backend，不展开 zstd、HMR suffix adoption 和 revision retry。

## 第 6 章：Compaction 是带锁、校验和替换的事务

`implemented fact`：自动 pressure compaction 挂在 `agent/pre-step`，context-overflow recovery 挂在 `agent/request-error`；`BasicCompactionEngine` 可先调用可选 tool-result pruner，再按 token meter 选择 range。源码：`packages/compaction/compaction-basic/src/index.ts` — `BasicCompactionEngine._registerAutomaticCompaction`、`compactIfNeeded`。

`implemented fact`：`selectCompactableRange()` 从 surface head 选择范围并保留 priced recent tail，且不会切断 assistant tool-call/result pairing；`compactSurfaceRegion()` 在异步 summarization 前同步 append `compaction/start` 形成 durable lock，完成后 append `compaction/summary`、surface replacement `user/message` 和 `compaction/end`。源码：`packages/compaction/compaction-basic/src/region.ts` — `selectCompactableRange`、`compactSurfaceRegion`、`commitCompactionBody`。

`implemented fact`：summary 调用复用原 request 的 system/tools/region messages，只追加最终 compaction instruction；`summarizeWithLlm()` 将流式输出收集为 text-only summary，`frameSummary()` 加入 checkpoint 前后标记。源码：`packages/compaction/compaction-basic/src/region.ts` — `buildSummarizationInput`；`packages/compaction/compaction-basic/src/summarizer.ts` — `summarizeWithLlm`、`frameSummary`。

`implemented fact`：异步 summary 完成后会重新检查 whole-surface 或 selected-span 稳定性；失败会尽力 append 一个带 error 的 `compaction/end`，close 失败则留下可检测的 unmatched start。源码：`packages/compaction/compaction-basic/src/region.ts` — `assertWholeSurfaceUnchanged`、`assertSelectedSpanStable`、`assertNoActiveCompaction`。

`implemented fact`：`ToolResultPruner.pruneSession()` 对超长 tool result 追加 `compaction/prune` shadow-price，再用 surface replacement 只替换 content；原日志仍保留。源码：`packages/compaction/compaction-tool-result-pruner/src/index.ts` — `pruneSession`、`pruneContent`。

`inference`：compaction 的本质是“先在稳定日志上计算，再以可回放 replacement 原子落地”，不是把旧文本从数组中删除。`teaching simplification`：交互实验可先用 deterministic summarizer，随后注入一次并发 append 触发 stability failure。

## 贯穿真实任务：让 Harness 修改一个仓库中的配置并留下可恢复记录

任务叙事：用户说“检查 `config/app.json` 中的 API 超时，若低于 30 秒就改为 30 秒，并说明修改原因”。教学站用 fake filesystem/read-write tools，真实 Harness 路径保持不变。

1. 用户消息进入 `Agent.send()` → `Inbox.splice('next-turn', ...)`，记录 `agent/inbox/spliced`；唤醒 loop。源码：`packages/core/agent-loop/src/agent.ts` — `send`、`wakeDriver`；`packages/core/agent/src/inbox.ts` — `splice`。
2. `turn()` 记录 turn/step，`preStep()` 组装 persona、工具 schema 和 runtime context；`buildRequest()` 从 `deriveMessages()` 形成 request。源码：`packages/core/agent-loop/src/agent.ts` — `turn`、`preStep`、`buildRequest`；`packages/core/system-prompt/src/index.ts` — `SystemPrompt.assemble`。
3. 模型输出 `tool-call(read_file)`；loop 先记录 `assistant/chunk`/`assistant/message`，再由 ToolRuntime 经过 policy 执行并记录 `tool/call`/`tool/result`。源码：`packages/core/agent-loop/src/agent.ts` — `step`；`packages/core/agent-loop/src/tool-calls.ts` — `executeToolCalls`；`packages/core/tools/src/index.ts` — `ToolRuntime.execute`。
4. 模型确认需要修改后调用 `write_file`；工具 result 通过 inbox 的 `next-step` context 回注，loop 再发一次 request，最终 `turn/end`。源码：`packages/core/agent-loop/src/agent.ts` — `step` 中 `acceptContext`、`turn` 的 next-step 分支；`packages/core/tools/src/index.ts` — `postExecute`。
5. 页面刷新或进程重启后，persistence load → repair（若有 crash tail）→ surface fold → `deriveMessages()`，新 Agent 从相同事件继续。源码：`packages/session/session-persistence/src/coordinator.ts` — `load`、`prepareCore`；`packages/core/session/src/surface.ts` — `foldSurface`。

## 交互实验建议

1. **插件拆装实验**：切换一个 fake LLM adapter 或 prompt section 的 Cordis config，观察 Loader entry、`systemPrompt.change` 和 disposer；对应 `boot`、`SystemPrompt.section`。
2. **事件时间线实验**：提交一次简单请求，按时间轴显示 `turn/start → step/start → user/message → assistant/chunk* → assistant/message → turn/end`，再加入 tool call 展示 `tool/call → tool/result`；对应 `ReactLoopAgent.turn/step`、`appendToolResult`。
3. **并发工具实验**：两个 tool 分别设置 `isConcurrencySafe` 为 true/false，控制延迟并观察 dispatch 可重叠但 result 按模型顺序落盘；对应 `executeToolCalls.runGroup`、`ToolRuntime.executionMode`。
4. **恢复实验**：故意截断一个含 tool-call 的 log，运行 `interruptedTurnClosers()`，展示 synthetic result、step/end、interrupted turn/end；对应 `packages/core/session/src/repair.ts` — `interruptedTurnClosers`。
5. **Compaction 稳定性实验**：对一段长 history 运行 deterministic summarizer，同时插入一条新消息，对比 whole-surface 与 selected-span 检查；对应 `compactSurfaceRegion`、`assertWholeSurfaceUnchanged`、`assertSelectedSpanStable`。

## 当前仍不确定的点

- 本文没有运行 Loader、模型 provider、真实 persistence backend 或浏览器，因此运行时描述来自源码静态证据，不等同于端到端验收。
- 真实中文教学站应选择哪一种 profile、fake backend 和 UI transcript schema，需由主代理结合现有前端决定；本文不假设其 API。
- compaction 的 token meter、具体 JSONL/zstd 文件布局和各 profile 的最终默认 patch 未在本文展开；若课程要展示磁盘格式，应再读取对应 package README/测试作为独立章节来源。
