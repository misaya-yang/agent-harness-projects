# Pi Agent Runtime：从一次 prompt 到 provider stream 的可验证教程

> 源码基线：本地 `pi` 快照，短提交 `a470b121b`。
> 本文只依据该 checkout 的源码、README 和 `packages/agent/docs/harness.md` 编写；没有联网、安装依赖、运行真实模型或修改源仓。

## 读法与证据边界

本文用三个标签区分结论：

- **实现事实**：可以直接在当前源码的 symbol 中找到的行为。
- **推断**：由多个实现事实组合出的运行时解释，适合帮助读者建立心智模型，但不等同于额外 API 保证。
- **教学简化**：为了实验而省略的生产复杂度；实现任务不能把它误当作 Pi 的真实契约。

每个核心结论都带 repo-relative 路径和具体 symbol，例如 `packages/agent/src/agent-loop.ts:runLoop`。`packages/agent/docs/harness.md` 是 AgentHarness 的实现规格，包含未来/分阶段设计；涉及它时本文会明确标记为“规格说明”，不把规格当作当前 `Agent` 已经拥有的持久化保证。

## 贯穿任务：做一个可中断、可观察的文件审阅 Agent

实现一个 `ReviewAgent`（建议放在课程自己的 playground，不改 Pi 源仓），输入一个文件路径，完成以下真实编码任务：

1. 接收用户目标，例如“检查 `src/config.ts` 的错误处理，并给出最小修复建议”。
2. 让模型按需调用 `read_file(path)` 和 `summarize_findings(findings)` 两个工具。
3. 在工具调用前校验参数，并允许策略层阻止路径越界。
4. 将 assistant 文本、thinking、tool call、tool result 画成事件时间线。
5. 工具运行期间支持 `steer("只检查配置加载，不要修改文件")`；支持 `abort()` 后用 `continue()` 重试。
6. 在每次 provider 请求前裁剪旧的 UI-only 消息；仍然把完整 Agent transcript 保留在 `Agent.state.messages`。
7. 用 `fauxProvider()` 完成确定性测试，再用一个第二 provider/fake provider 验证 provider adaptation，不调用真实模型。

建议验收标准：

- 普通回复出现 `agent_start → turn_start → message_start/update/end → turn_end → agent_end`。
- tool call 的校验失败变成 `isError: true` 的 `toolResult`，而不是未捕获异常。
- 并行工具的 `tool_execution_end` 可以按完成顺序出现，但 tool-result transcript 按 assistant source order 写入。
- `steer` 只在当前 assistant turn 的工具全部完成后注入；`followUp` 要等本轮自然停止后才注入。
- `abort` 不伪造一个普通 assistant 成功回复；provider 的失败/中止仍通过最终 `AssistantMessage` 表达。
- 转换后的 LLM context 不含 UI-only custom message；原始 Agent transcript 不被该转换永久改写。

主线关系可以画成：

```text
Agent.state / queues
        │ prompt / continue
        ▼
agentLoop.runLoop ── transformContext ── convertToLlm
        │                                  │
        │                                  ▼
        │                         Models.streamSimple
        │                                  │ auth + dispatch
        │                                  ▼
        │                         ProviderStreams / API adapter
        │                                  │
        └── AgentEventSink ◀── AssistantMessageEventStream
                │
                ├── tool execution → toolResult message → next turn
                └── steer/followUp/abort → queue/control decision
```

这张图是**教学简化**：真实实现还包括 lazy API loading、动态 auth、retry、deferred response、跨 provider message normalization 和 harness 层；这些在后文分别指出。

## 第一章：先分清三种消息与两个边界

### 目标

建立最重要的边界：Agent 处理的是可扩展的 `AgentMessage[]`；provider 只接受 `Message[]`；工具结果回到 Agent 后才会成为下一次 LLM 请求的上下文。

### 实现事实

- `AgentMessage` 是 `Message` 与 declaration-merging custom messages 的 union；`AgentContext` 持有 `systemPrompt`、`messages`、`tools`：`packages/agent/src/types.ts:AgentMessage`, `AgentContext`。
- `AgentMessage[] → transformContext → convertToLlm → Message[]` 的顺序在 `packages/agent/src/agent-loop.ts:streamAssistantResponse` 中直接实现：先 `config.transformContext`，再 `config.convertToLlm`，最后组装 `Context`。
- 默认转换只保留 `user`、`assistant`、`toolResult`：`packages/agent/src/agent.ts:defaultConvertToLlm`。
- Pi AI 的 `Context` 只包含可供 LLM 使用的 `systemPrompt?`、`messages: Message[]`、`tools?`：`packages/ai/src/types.ts:Context`。

### 真实任务中的设计

定义一个 UI-only message，例如 `{ role: "review_status", text, timestamp }`，写入 Agent transcript；`convertToLlm` 过滤它。`transformContext` 只做 message-level 的裁剪或注入，不承担 provider wire-format 转换。

### 实验 1：观察“保留但不发送”

用 faux provider 返回一个固定文本；在 `Agent.state.messages` 中插入一条 `review_status`，在 `convertToLlm` 内记录收到的消息角色。

预期观察：Agent state/transcript 仍包含 status；provider context 只收到 LLM 三种角色。若把过滤写进 `transformContext`，则会改变 Agent 侧可观察 transcript，这是边界错误。

### 推断与简化

- **推断**：这两个边界允许 UI、session 或审计层保留比模型更多的信息，同时不迫使每个 provider 理解 custom role。
- **教学简化**：本任务的 `transformContext` 只做“保留最近 N 条”，没有实现 token 估算/compaction。真正的 compaction helper 与持久化状态属于 `packages/agent/src/harness/` 和规格 `packages/agent/docs/harness.md`，不能用本实验替代。

## 第二章：Agent state 是谁拥有的

### 目标

理解 state ownership，而不是把 `Agent` 当成无状态的 `complete()` 包装器。

### 实现事实

- `Agent` 私有持有 `_state`、listener 集合、steering/follow-up 队列和 `activeRun`：`packages/agent/src/agent.ts:Agent`。
- `createMutableAgentState` 对初始 `tools` 和 `messages` 做 top-level `slice()`；setter 也复制传入数组，但 getter 返回当前数组本身：`packages/agent/src/agent.ts:createMutableAgentState`。
- 可见 state 包括 `systemPrompt`、`model`、`thinkingLevel`、`tools`、`messages`，以及只读的 `isStreaming`、`streamingMessage`、`pendingToolCalls`、`errorMessage`：`packages/agent/src/types.ts:AgentState`。
- `createContextSnapshot` 再复制 `messages/tools`，因此一次 run 使用的是启动时 context snapshot；事件处理再把完成消息写回 `_state`：`packages/agent/src/agent.ts:createContextSnapshot`, `processEvents`。
- `runWithLifecycle` 建立一个 `AbortController`，置 `isStreaming = true`，执行 loop，最终由 `finishRun` 清空 streaming/pending runtime state：`packages/agent/src/agent.ts:runWithLifecycle`, `finishRun`。

### 状态不变量

| 状态 | 谁写入 | 何时可观察 |
|---|---|---|
| `messages` | `processEvents(message_end)` 追加 | 消息完成事件之后 |
| `streamingMessage` | `message_start/update` 设置，`message_end/agent_end` 清理 | provider stream 期间 |
| `pendingToolCalls` | `tool_execution_start/end` 增删 | 工具执行期间 |
| `errorMessage` | `processEvents(turn_end)` 读取 assistant `errorMessage` | 最近失败回合后 |
| queues | `steer/followUp` 入队，loop 的 getter drain | 下一次 queue drain point |

### 实验 2：state 与事件的时间差

订阅所有 Agent events，在 listener 中同时打印 `event.type`、`state.isStreaming`、`state.streamingMessage?.role`、`pendingToolCalls.size`。在 `message_update` 时读取 partial；在 `tool_execution_start` 和 `tool_execution_end` 时读取 pending set。

预期：`isStreaming` 在 `agent_end` listener 完成前仍为 true；这不是“事件结束即 idle”。`Agent.subscribe` listener 按注册顺序 await，`waitForIdle()` 等到它们完成：`packages/agent/src/agent.ts:subscribe`, `processEvents`; `packages/agent/src/types.ts:AgentEvent` 注释。

### 推断

`Agent` 是 runtime ownership 层：low-level loop 产生事件和返回 `newMessages`，但只有 `Agent.processEvents` 同时维护 public state、listener barrier 和 abort signal。不要在应用层另造一份“当前 assistant message”作为事实来源。

## 第三章：prompt、continue、steer、follow-up、abort

### 目标

把一次 run 看作“回合循环 + 两个队列 + 一个 abort signal”，而不是一次 HTTP 请求。

### 实现事实：入口与 continue

- Agent.prompt 拒绝并发 active run，把 string/单条 message/数组规范化后交给 runPromptMessages：packages/agent/src/agent.ts:prompt, normalizePromptInput。
- Agent.continue 要求 transcript 非空且最后一条不是 assistant；若最后一条是 assistant，它只尝试 drain 已有 steering/follow-up，否则抛错：packages/agent/src/agent.ts:continue。
- 低层 agentLoop 会把 prompt append 到 context，并发出 agent_start、首个 turn_start 以及 prompt 的 message_start/end；agentLoopContinue 不加新消息，要求最后角色不是 assistant：packages/agent/src/agent-loop.ts:agentLoop, agentLoopContinue, runAgentLoop, runAgentLoopContinue。

### 实现事实：两个队列的时机

- steer() 入 steering queue；followUp() 入 follow-up queue：packages/agent/src/agent.ts:steer, followUp。
- runLoop 在起始和每个完成 turn 后调用 getSteeringMessages；只有工具全部处理完后才会进入该 drain point：packages/agent/src/agent-loop.ts:runLoop（pendingMessages, getSteeringMessages）。
- 当没有更多 tool call/steering 时，外层 loop 才调用 getFollowUpMessages；follow-up 存在就作为下一 turn 的 pending message：packages/agent/src/agent-loop.ts:runLoop（follow-up branch）。
- queue mode 是 all 或 one-at-a-time，由 PendingMessageQueue.drain 实现：packages/agent/src/types.ts:QueueMode, packages/agent/src/agent.ts:PendingMessageQueue。

### 实现事实：abort 与失败

- Agent.abort() 只 pull 当前 AbortController；tool/provider 是否及时停止取决于它们是否尊重 signal：packages/agent/src/agent.ts:abort。
- streamAssistantResponse 把 provider stream 的 error/aborted assistant 返回给 loop；loop 发 turn_end 和 agent_end 后结束，不自动继续：packages/agent/src/agent-loop.ts:streamAssistantResponse, runLoop。
- 如果 loop 本身抛异常，runWithLifecycle 的 handleRunFailure 构造一个空 assistant failure message，并发出 message_start/end → turn_end → agent_end：packages/agent/src/agent.ts:handleRunFailure。这与正常 provider error event 是两条不同路径。

### 实验 3：steer 与 follow-up 的顺序

让 faux provider 第一个响应请求一个短工具，并让工具延迟；工具开始后调用 steer("缩小范围")，同时调用 followUp("最后再给摘要")。

预期顺序：当前 tool 仍完成；steer message 在下一次 assistant 请求前注入；若 steer 产生的回合最终无 tool，才检查 follow-up。把两条消息都设为 all，再改为 one-at-a-time，比较一次 drain 的消息数量。

### 教学简化

本文实验把“abort 后 retry”表达为 await agent.abort(); await agent.continue()，但实际工程要区分 provider 返回的 aborted、loop 抛异常、工具不合作、以及最后一条消息是否仍可继续。continue 不是任意位置的 resume API。

## 第四章：stream events 是跨层协议

### 目标

区分 Pi AI provider-level event 与 Pi Agent agent-level event，并用事件而非 console 文本驱动 UI。

### Provider-level vocabulary（pi-ai）

AssistantMessageEvent 的完整 union 在 packages/ai/src/types.ts:AssistantMessageEvent：

    start
    text_start / text_delta / text_end
    thinking_start / thinking_delta / thinking_end
    toolcall_start / toolcall_delta / toolcall_end
    done(reason, message) | error(reason, error)

- done.reason 只能是 stop | length | toolUse | deferred；error.reason 是 error | aborted：packages/ai/src/types.ts:AssistantMessageEvent。
- AssistantMessageEventStream 以 done 或 error 为 complete event，result() 返回最终 assistant message：packages/ai/src/utils/event-stream.ts:AssistantMessageEventStream。
- EventStream.push 先 resolve final result，再把 event 交给等待者/queue；这解释了为什么 result() 与消费事件可并存：packages/ai/src/utils/event-stream.ts:EventStream.push, result。

### Agent-level vocabulary（agent-core）

packages/agent/src/types.ts:AgentEvent 将 provider stream 映射为：

    agent_start/end
    turn_start/end
    message_start/update/end
    tool_execution_start/update/end

message_update 只由 assistant partial 产生，并携带原始 assistantMessageEvent；message_start/end 也用于 user 与 toolResult：packages/agent/src/types.ts:AgentEvent。

### 映射实现

packages/agent/src/agent-loop.ts:streamAssistantResponse：

1. provider start：把 partial 放进 context.messages，发 agent message_start。
2. provider 的 text/thinking/toolcall start/delta/end：用 event.partial 替换 context 最后一条 assistant，发 agent message_update。
3. provider done/error：取 response.result()，替换或追加最终 assistant，发 agent message_end。
4. loop 从最终 assistant 的 content 找 tool calls，再进入 tool execution。

### 事件交错规则

provider 事件不保证 text、thinking、toolcall block 连续；消费者必须用 contentIndex 关联 block。packages/ai/README.md 的 Complete Event Reference 与 packages/ai/src/types.ts:AssistantMessageEvent 都明确这一点；不能假设“一个 text block 完成后才会出现 toolcall”。

### 实验 4：事件时间线断言

不用打印完整内容，只记录 { type, contentIndex, toolCallId }。用 faux provider 生成“thinking + tool call + text”的混合 assistant message，断言：

- provider stream 首尾是 start 与 done/error；
- agent 在 tool call assistant message_end 后才发 tool execution start；
- tool result 的 message_start/end 出现在 tool_execution_end 之后；
- 每个 message_update 都能由 assistantMessageEvent.partial 重建当前 partial。

## 第五章：tool call execution 与 message/state ownership

### 目标

理解工具不是“收到 JSON 就调用函数”，而是 start → prepare/validate → execute → finalize → toolResult message → next turn。

### 实现事实：执行管线

- executeToolCalls 先判断全局 toolExecution 和目标工具的 executionMode；任意目标工具标为 sequential 时整批串行：packages/agent/src/agent-loop.ts:executeToolCalls。
- 每个调用先发 tool_execution_start，再由 prepareToolCall 查找工具、运行 prepareArguments、validateToolArguments、调用 beforeToolCall：packages/agent/src/agent-loop.ts:prepareToolCall。
- 执行函数 AgentTool.execute 的异常被捕获为 error result；工具失败应 throw，而不是把错误伪装成成功 content：packages/agent/src/agent-loop.ts:executePreparedToolCall; packages/agent/src/types.ts:AgentTool。
- afterToolCall 在 tool_execution_end 与 tool-result message 之前运行，可 field-by-field 覆盖 content/details/isError/usage/terminate：packages/agent/src/agent-loop.ts:finalizeExecutedToolCall; packages/agent/src/types.ts:AfterToolCallResult。
- createToolResultMessage 将 finalized result 变成标准 role: toolResult 并写入 timestamp/isError：packages/agent/src/agent-loop.ts:createToolResultMessage。

### 并行语义

- parallel 模式只并发真正 execute；preflight 仍按 source order：packages/agent/src/agent-loop.ts:executeToolCallsParallel。
- tool_execution_end 在各 tool 完成后立即发出；之后 Promise.all 按 source order 生成/发出 toolResult messages：同一 symbol。
- shouldTerminateToolBatch 只有在 batch 非空且每个 finalized result 都 terminate === true 时才终止自动 follow-up：packages/agent/src/agent-loop.ts:shouldTerminateToolBatch。

### 截断与中止安全

- assistant stopReason === length 时不执行任何 tool call，而为每个调用生成解释性 error result：packages/agent/src/agent-loop.ts:failToolCallsFromTruncatedMessage, runLoop。
- abort signal 在 preflight、tool execute 与 loop 分支都会检查；“tool 已开始”不等于一定被取消，工具自身必须尊重 signal：packages/agent/src/agent-loop.ts:prepareToolCall, executePreparedToolCall。

### 实验 5：平行工具的两种顺序

准备 slow_read（延迟长）和 fast_read（延迟短），让 faux provider 一次返回两个 tool calls。记录三种序列：tool_execution_start、tool_execution_end、toolResult message_end。

预期：两个 start 按 assistant source order；end 可能 fast 在前；toolResult message 仍按 source order。把其中一个工具设 executionMode: sequential，应观察整批退化为串行。

## 第六章：context transform、tool schemas 与消息重放

### 目标

知道哪些转换属于 Agent 语义，哪些属于 provider adaptation；知道 tool schema 的校验发生在哪一层。

### 实现事实

- Agent 的 transformContext 合同是输入/输出 AgentMessage[]，用于 prune 或外部上下文注入；不得依赖 provider-specific Message：packages/agent/src/types.ts:AgentLoopConfig.transformContext。
- convertToLlm 合同是 AgentMessage[] → Message[]，需要过滤或转换 custom messages；实现异常会中断 low-level loop，因此应返回安全 fallback：packages/agent/src/types.ts:AgentLoopConfig.convertToLlm。
- Pi AI 的 transformMessages 做模型相关的 replay normalization：降级不支持的 image、规范化 tool-call id、跨模型时把 thinking 转成 text，并为孤立 tool calls 补 synthetic tool results：packages/ai/src/api/transform-messages.ts:transformMessages。
- provider adapter 再把统一消息转为 wire format。例如 OpenAI convertMessages 处理 system/developer role、image data URL、tool call id 与 thinking；Anthropic buildParams/convertMessages 处理 system block、tool references、thinking signature、tool_result：packages/ai/src/api/openai-completions.ts:convertMessages, packages/ai/src/api/anthropic-messages.ts:buildParams, convertMessages。
- Tool 的 parameters 是 TypeBox schema；Agent 在 prepareToolCall 以 validateToolArguments 验证，provider adapter 只负责把 schema 发送给模型：packages/ai/src/types.ts:Tool, packages/agent/src/agent-loop.ts:prepareToolCall。

### 实验 6：同一 transcript，两个 provider 视图

构造一条带 thinking、长 tool-call id、image 的 assistant/toolResult history；分别喂给 OpenAI-compatible 与 Anthropic fake adapters 的转换函数（不发网络请求）。观察：

- 目标 model 不支持 image 时会出现 placeholder：transformMessages:downgradeUnsupportedImages；
- 跨 model 的 thinking 不再假设原 provider signature 可重放；
- tool-call id 会按目标 API 规则裁剪/规范化，tool result 跟随映射；
- 孤立 tool call 获得 synthetic error result，而不是把非法 history 直接交给 provider。

这些是**实现事实**，但实验只验证纯转换，不证明任意上游 endpoint 接受 payload。

## 第七章：pi-ai 的统一 provider/model API

### 目标

掌握“统一”到底统一了什么：模型查找、认证、stream/complete 调用和事件/错误协议；没有统一各家的 wire payload。

### Provider 与 Models

- Provider 拥有 id/name/baseUrl/headers/auth/getModels/stream/streamSimple，可选 refreshModels/fetchDeferred/cancelDeferred：packages/ai/src/models.ts:Provider。
- ModelsImpl 用 provider-id map 保存 provider；getModels/getModel 是同步 last-known catalog 读取，provider throwing 时 best-effort 返回空：packages/ai/src/models.ts:ModelsImpl.getModels, getModel。
- createProvider 支持一个 ProviderStreams 或按 model.api 的 map；缺失 API implementation 会产生 lazy stream error：packages/ai/src/models.ts:createProvider, apiFor, dispatch。
- Models.complete 是 this.stream(...).result()；completeSimple 同理，因而 complete 与 stream 共享同一 event/error pipeline：packages/ai/src/models.ts:ModelsImpl.complete, completeSimple。

### Auth 与 headers

- ModelsImpl.applyAuth 先 getAuth(model)，再合并 auth headers 与显式 headers；transformHeaders 最后执行，并从 provider options 中移除：packages/ai/src/models.ts:applyAuth。
- resolveProviderAuth 的 stored credential 优先于 ambient/env；OAuth 快过期时在 credential store lock 内 double-check/refresh；失败封装成 ModelsError 的 auth 或 oauth：packages/ai/src/auth/resolve.ts:resolveProviderAuth, resolveStoredOAuth, ModelsError。
- Provider adapter 接收到的是普通 ProviderRequestOptions，不是 Models-only transformHeaders：packages/ai/src/models.ts:applyAuth, packages/ai/src/types.ts:ModelsRequestTransforms。

### streamSimple 的意义

SimpleStreamOptions 把 provider-neutral reasoning、toolChoice、thinkingBudgets 等选项放到统一接口；provider-specific stream/complete 仍可接收其 API 的完整 option type：packages/ai/src/types.ts:SimpleStreamOptions, ApiOptionsMap, ApiStreamOptions。

### 实验 7：fake provider 的统一接口

用 fauxProvider() 设置两组 scripted responses：第一组返回 tool call，第二组返回 summary。通过 createModels().setProvider() 注册，分别调用 models.streamSimple 与 models.completeSimple，只消费标准事件和最终 message。

再创建一个 custom provider，用 createProvider({ api: { "openai-completions": streams, "anthropic-messages": streams } })，同一 Models collection 按 model.api dispatch。将 model api 改成未注册值，断言返回 stream error，而非同步 throw。

依据：packages/ai/README.md:Faux Provider for Tests；packages/ai/src/providers/faux.ts:fauxProvider；packages/ai/src/models.ts:createProvider, dispatch。

## 第八章：错误、abort、provider adaptation 与可观测性

### 目标

完成任务的最后一层：让错误成为协议中的数据，并能判断错误发生在哪个边界。

### 实现事实：错误不应穿透 stream

- StreamFunction 合同要求 request/model/runtime failure 不 reject；必须返回 AssistantMessageEventStream，以 error event 和最终 AssistantMessage(stopReason: error 或 aborted) 表达：packages/ai/src/types.ts:StreamFunction；Agent 侧同样在 packages/agent/src/types.ts:StreamFn 声明。
- lazyStream 把 auth/lazy module/setup failure 转成 error event 与 error assistant message：packages/ai/src/api/lazy.ts:lazyStream。
- OpenAI completions adapter 在 catch 中清理 streaming scratch fields，依据 signal 选择 aborted 或 error，格式化 provider error 后 push error：packages/ai/src/api/openai-completions.ts:stream 的 catch；Anthropic 同样在 packages/ai/src/api/anthropic-messages.ts:stream 的 catch 中归一化。
- ModelsError 用 code 区分 provider/stream/auth/oauth/model_source/model_validation；Models request path 的 setup/dispatch failures 仍由 lazy stream 变成 in-band error：packages/ai/src/auth/resolve.ts:ModelsError；packages/ai/src/api/lazy.ts:lazyStream。

### stopReason 的最小分类

AssistantMessage.stopReason 是 pending | stop | length | toolUse | error | aborted | deferred：packages/ai/src/types.ts:StopReason, AssistantMessage。Agent loop 只把 error/aborted 视为终止失败；length 会进入“所有 tool call 都不执行”的安全分支；普通 toolUse 则继续工具回合：packages/agent/src/agent-loop.ts:runLoop。

### provider adaptation 的真实例子

- OpenAI-compatible stream 解析 chunk，维护 partial content、reasoning、tool calls，并对部分 endpoint 没有 finish_reason 的情况按 compat 推断 stop/toolUse：packages/ai/src/api/openai-completions.ts:stream, mapStopReason。
- Anthropic adapter 将 SSE content block、thinking delta、input_json_delta、message_delta usage 映射到同一事件 union：packages/ai/src/api/anthropic-messages.ts:stream。
- transformMessages 是跨 provider replay 的共享中间层，但最后的 payload 适配仍由每个 API implementation 负责；这是 provider adaptation 与 agent context conversion 的两层，不应合并成一个“大转换器”：packages/ai/src/api/transform-messages.ts:transformMessages；packages/ai/src/api/*。

### 实验 8：三类故障的 transcript

用 faux provider 或 fake StreamFn 分别模拟：

1. provider 返回 error message；
2. signal 已 aborted；
3. convertToLlm 抛异常（这是错误合同，故意观察差异）。

记录 Agent event 和最终 waitForIdle()：前两类应该出现标准的 assistant failure/agent end；第三类可能由 Agent lifecycle 的 failure handler 兜底，不能把它当 provider in-band error。实验重点是**故障层级**，不是“所有异常都长得一样”。

### 规格说明：harness 与当前 core 的边界

packages/agent/docs/harness.md:Part 5.7 说明未来/扩展的 AgentHarness 会把 Models、durable operation state、hooks、telemetry 和现有 agent-loop building blocks 组合起来；Part 5.5 的事件还区分 entry_added（持久化已完成）和 process-local message_end。当前 Agent 的 processEvents 只维护内存 state，并没有把每个 message/event 写入持久 session。课程任务可讲清这条演进路线，但不能声称基础 Agent 已提供 crash recovery 或 exactly-once tool effect。

## 结业实现顺序

建议按下面的提交/实验顺序推进，每一步都能用 faux provider 验证：

1. **Contract**：定义 ReviewAgent 的 custom message、两个 TypeBox tool schema、事件记录器。
2. **State**：创建 Agent，实现 convertToLlm 与最小 transformContext，确认 transcript 与 provider context 分离。
3. **Loop**：接通 prompt、tool result follow-up、steer、followUp、abort/continue。
4. **Tools**：加路径安全 beforeToolCall、工具 throw 错误、afterToolCall details/terminate，并比较 parallel/sequential。
5. **Provider**：用 fauxProvider 完成 scripted flow；再用 createProvider 验证按 model.api dispatch 和 lazy error。
6. **Adaptation**：用纯函数转换测试覆盖 image downgrade、thinking replay、tool-call id normalization、orphan tool result。
7. **Evidence**：为事件顺序、state snapshot、错误 stopReason 写断言；不以“打印出一段文字”作为完成标准。

## 核心结论速查

| 结论 | 强证据 |
|---|---|
| Agent 是 transcript、queue、abort 和 event listener 的 owner | packages/agent/src/agent.ts:Agent, runWithLifecycle, processEvents |
| low-level loop 只在 LLM 边界转成 Message[] | packages/agent/src/agent-loop.ts:streamAssistantResponse；packages/agent/src/types.ts:AgentLoopConfig |
| steer 早于 followUp，但都不会打断已开始的 tool batch | packages/agent/src/agent-loop.ts:runLoop；packages/agent/src/agent.ts:steer/followUp |
| parallel tool completion 与 transcript source order 可不同 | packages/agent/src/agent-loop.ts:executeToolCallsParallel |
| provider 事件以 done/error 收口，最终 message 可由 result() 取得 | packages/ai/src/types.ts:AssistantMessageEvent；packages/ai/src/utils/event-stream.ts:AssistantMessageEventStream |
| Models 负责 auth 合并/headers/dispatch，provider 负责 wire protocol | packages/ai/src/models.ts:applyAuth, ModelsImpl.stream；packages/ai/src/api/openai-completions.ts:stream |
| error/aborted 是 in-band assistant message，而非正常 provider rejection | packages/ai/src/types.ts:StreamFunction；packages/ai/src/api/lazy.ts:lazyStream |
| 当前基础 Agent 不等于 durable harness | packages/agent/src/agent.ts；对照规格 packages/agent/docs/harness.md:Part 5.5, Part 5.7 |

## 已知不确定点与避免过度承诺

- **实现事实**：当前 checkout 同时导出了基础 Agent、agentLoop 和 AgentHarness 相关模块；本文贯穿任务只使用前两者，避免把 session/harness API 的规格目标混入 core 教程：packages/agent/src/index.ts。
- **不确定点**：README 的示例与源码在一些版本演进字段上可能不同（例如 prepareNextTurn 的两种 Agent option 形态）；教学代码应以当前 packages/agent/src/types.ts 和 agent.ts 的实际签名为准，而不是复制旧片段。
- **推断**：provider-specific compat 字段的组合可解释为“统一语义、局部协议”；真正可用性仍要以对应 adapter 和目标 endpoint 的测试/响应为准，本文没有联网验证。
- **教学简化**：没有覆盖 dynamic model refresh、OAuth login、deferred polling、image generation、retry delay、telemetry schema 的全部 API；这些在 packages/ai/README.md 和 packages/agent/docs/harness.md 有完整背景，但不是主线任务的必要前置。
