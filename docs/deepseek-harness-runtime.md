# DeepSeek Harness 运行时教学提纲

课程依据 `deepseek-ai/deepseek-harness` 的本地源码快照 `2e39e70496aa02986ca6a820c5d497e816b69d7e`。根、CLI 和 Desktop 清单版本为 `0.2.2-rc.5`，上游 README 将项目标为 developer preview。所有路径均相对于上游仓库。[固定源码快照](https://github.com/deepseek-ai/deepseek-harness/tree/2e39e70496aa02986ca6a820c5d497e816b69d7e)

## 1. 从 Cordis 组合到 Agent

Profile 依次叠加 bundles、profile patch、home patch 和启动时的 `--patch`。普通配置行按 id 替换整份配置；`preset` patch 在指定声明的 `config.plugins` 内应用操作。`boot()` 创建根 Context、安装 Loader 并挂载 entry tree。用 `dsh --profile web --dump-config` 检查当前组合。源码见 `packages/boot/app-boot/src/profile.ts::composeEntries`、`packages/boot/app-boot/src/index.ts::boot` 和 `docs/architecture.md` 的 Profiles and bundles。

插件用 `ctx.effect()`、`ctx.on()` 贡献可撤销的注册。`AgentLoop` 用 `ctx.agents.setFactory(this)` 注入工厂。工厂取得 Session writer，保存构造历史、进入 SessionStore 并完成 `session/created`；随后运行 setup，再发布 `agent/created`，最后放行已排队工作。setup 期间 Session 已可写，但 Agent 尚未发布。若 setup 失败，已存的事实仍可供恢复。源码见 `packages/core/agent-loop/src/index.ts` 和该包 README 的生命周期说明。

## 2. Turn、Inbox 与 Step

Turn 在第一次认领输入前打开，可以包含零个或多个 Step。`agent/pre-step` 可拒绝或改写输入；拒绝或者首个 enter 被改写为空时，Turn 可以结束而无 Step。每个 Step 承载一次逻辑模型请求以及该请求触发的工具批次，重试可以在同一 Step 内发生。工具结果或新到达的 `next-step` 输入可能触发下一 Step。源码见 `packages/core/agent-loop/src/agent.ts::preStep`、`turn`、`step`。

Inbox 在变更内存队列前追加 `agent/inbox/spliced`。认领时发出实时的 `agent/inbox/claimed` 通知；持久队列从 splice 事件和 `inbox` projection 重建。`idle`、`maintenance` 与 `running` 属于活 Agent 的控制状态。源码见 `packages/core/agent-loop/src/inbox.ts` 和 `agent.ts::runMaintenance`。

## 3. Prompt 与可重建请求

每个 Step 开始时捕获 Session 模型选择，解析当前工具集合，收集 Prompt sections、动态 context 和 variables，再运行 `agent/pre-step`。`SystemPrompt.assemble()` 按 order 和名称排序，默认 Harness identity 的 order 是 `-1000`，deployment persona 前缀是 `0`。`prepareCall()` 固定本次请求所用的 adapter 和能力，之后才记录 system 与已接纳的 user 消息；运行时 sections 可作为 `user/message` 提醒加入。同一 Step 的请求重试保留当步的模型选择。源码见 `packages/core/system-prompt/src/index.ts` 和 `packages/core/agent-loop/src/agent.ts::preStep`、`step`。

System Prompt 经 `system/message` 进入历史。Adapter 能力允许时，可在历史中追加 system 更新；否则更新归到第一个 system 节点。`request/header` 记录模型配置与排序后的工具声明，稳定 envelope 可以继承。`request/context` 在模型路由、上下文窗口或 system 更新能力等字段变化时记录。`buildRequest()` 再使用 `Session.deriveMessages()` 构造冻结请求。源码见 `packages/core/agent-loop/src/agent.ts::buildRequest`、`packages/core/session/src/request-header.ts` 和 `packages/core/agent-loop/README.md`。

## 4. 流式结算、工具执行与回注

`agent/assistant-stream` 发出实时 start/chunk/end 帧。结算时，一条 `assistant/message` 携带已组装消息和 compact timed stream；失败或未形成可投影消息的尝试可落为 `assistant/attempt`，也带 stream。硬崩溃发生在结算前时，已经送到页面的增量可能没有落盘。源码见 `packages/core/agent-loop/src/agent.ts::step`、`packages/core/session/src/surface.ts::deriveEventMessage` 和 `docs/architecture.md` 的 Session log。

选中的 `ToolExecutor` 负责原始批次、调度、取消与 `tool/call`、`tool/result` 记录。共享管线依次运行 pre-execute、所需审批、monotonic guards、execute/body、内容投影、post-execute 和 finalize；`tools/result` 是同步的最终结果通知。Native 执行器允许安全工具并行，exclusive 调用形成屏障，结果按模型顺序提交。PTC 执行器让 `run_code` 及其有序子调用走同一管线，子调用另有 `tool/ptc-dispatch`。下一请求经 Session 投影读到已记录的工具结果。源码见 `docs/tool-execution-pipeline.md`、`packages/core/tool-executor-native/README.md` 和 `packages/core/tool-executor-ptc/README.md`。

## 5. Session 投影、持久化与恢复

`Session.append()` 支持单事件和事件数组，已提交事件保持连续 `seq`。`SurfaceManager` 维护当前消息节点，`deriveMessages()` 折叠这些节点；`user/message`、非空 system/developer/assistant 消息及 `tool/result` 可进入模型历史。`assistant/attempt`、边界和审计事件留在日志。Surface replacement 记录位置与来源事件 seq。其他领域状态由 `ctx.sessionProjections` 的注册单元独立折叠，Web 还接收实时助手帧。源码见 `packages/core/session/src/index.ts::deriveMessages`、`surface.ts::deriveEventMessage`、`packages/session/session-projection/src/index.ts`。

发行 Profile 使用 JSONL 后端，SQLite 是独立的可替换后端。当前逻辑写入格式为 V4，产品清单的 `0.2.2-rc.5` 是另一套版本。`session/event` 表示内存提交；持久层将事件路由给活跃的写句柄，完成 `session/flush` 才经过持久化检查点。JSONL 选择最高的规范格式代际，旧格式写打开才发布新的迁移代际，原代际保留。源码见 `packages/session/session-persistence/README.md`、`packages/session/session-persistence-jsonl/README.md` 和 `docs/session-format-status.md`。

恢复 Agent 时，Loop 通过写句柄读取历史并追加 `interruptedTurnClosers()`。只读冷观察把同一组补齐事件应用到内存。已经记录 `tool/call` 的悬空调用得到 `TOOL_OUTCOME_UNKNOWN`，尚无调用记录的工具得到 `TOOL_NOT_STARTED`，之后补齐未闭合的 `step/end` 和 interrupted `turn/end`。未知结果的实际副作用需要独立检查。源码见 `packages/core/session/src/repair.ts`、`packages/core/agent-loop/src/index.ts::resume` 和 `packages/session/session-persistence/README.md`。

## 6. Compaction 与替换

`BasicCompactionEngine` 在 pre-step 压力或标准 context-overflow 恢复路径工作，可先做 tool-result pruning。`selectCompactableRange()` 从历史头部选连续范围，保留近期 tail，保护 tool-call/result 配对。`compaction/start` 作为日志中的锁，摘要生成后重新验证 whole-surface 或 selected-span。成功后记录 `compaction/summary`、替换当前 Surface 的 `user/message` 与 `compaction/end`；这组记录有各自的提交点，补齐或失败可从日志诊断。替换引用原 seq，原事件仍可读取。源码见 `packages/compaction/compaction-basic/src/index.ts`、`region.ts::compactSurfaceRegion` 和 `packages/compaction/compaction-tool-result-pruner/src/index.ts`。

## 贯穿练习

场景为检查 `config/app.json` 的超时。用合成流依次结算 `assistant/message`，执行 `read`，再让模型决定是否 `edit`，最后检查模型历史中的 `tool/result` 和工作区差异。课堂工具用固定返回值和 token 数。

1. 在事件步进机中标出哪一步只是实时通知，哪一步已经成为 Session 事实。再试一次被 pre-step 阻止的 Turn，解释为何可以有 Turn 而没有 Step。
2. 在投影台依次点实时 chunk、assistant attempt 和已结算消息。预期实时 chunk 不增加事件条数；attempt 只增加事件条数；已结算消息也增加模型消息数。
3. 假设两个 parallel 工具的完成顺序与模型提出的顺序相反，画出模型可见 `tool/result` 顺序；把任一工具改为 exclusive 后再画一次。
4. 给出最后一条持久记录为 `tool/call` 的日志，只根据 `TOOL_OUTCOME_UNKNOWN` 决定接下来要查哪个文件或任务记录，再决定是否重试。
5. 在 Compaction 投影台选择较小预算，重放到预算超限。显示摘要覆盖的选区、保留的 tail 和仍在日志中的原消息；随后对照源码里的异步稳定性检查。
