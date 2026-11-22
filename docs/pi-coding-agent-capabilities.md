# Pi coding-agent 能力地图（源码快照）

> 源码基线为 [Pi `9c465268`](https://github.com/earendil-works/pi/tree/9c4652688590abb836b40ebd1e4725ecf9a7c7d1)。Coding Agent 包版本为 1.6.0（发布于 2026-11-20，快照含发布后修订）。案例以本地源码、上游文档和现有测试为依据。

## 阅读方式与证据等级

每个结论都带有 `Source:`，路径相对于 Pi 源仓根目录；括号内是可检索的 symbol。标签含义如下：

- **Implemented fact**：当前 checkout 的源码直接实现，或包 README 明确描述且源码有对应符号。
- **Inference**：由多个实现事实推导出的使用含义，不等于额外的安全保证。
- **Optional / experimental**：可选扩展点、独立包或 README 明确标为实验性；不应当当作稳定核心契约。

贯穿任务是“审计一个仓库并在需要时安全地继续修复”：先只读理解，再创建可回溯分支，最后由外部控制面接管；权限、模型、存储和 UI 都在每一章中跟随这条任务链说明。

## 第 1 章：整体形状——小核心、四种入口、可替换运行时

### 1.1 分层

**Implemented fact**：Pi monorepo 把能力拆成统一模型 API、agent loop、coding-agent CLI/SDK、TUI，以及独立的 Pi Durable 和 Chord 应用运行时。`Agent` 保存消息和工具状态；`AgentSession` 把它与 `SessionManager`、模型运行时、资源加载器和扩展运行器组合起来；CLI 只选择入口并驱动运行时。

`Agent` 的核心循环是 `AgentMessage[] -> transformContext -> convertToLlm -> provider stream`，每个 turn 发出消息/工具生命周期事件；默认并行执行同一 assistant 消息中的工具调用，但可切换为 sequential。

Source: `packages/agent/src/agent.ts` (`Agent`, `AgentOptions`), `packages/agent/src/agent-loop.ts` (`runAgentLoop`, `runAgentLoopContinue`), `packages/coding-agent/src/core/agent-session.ts` (`AgentSession`), `packages/coding-agent/src/core/sdk.ts` (`createAgentSession`), `README.md`（All Packages）。

**Inference**：要嵌入 Pi，优先 SDK；要跨语言或需要进程边界，使用 RPC；需要任务在进程重启后续跑时评估 Durable。

### 1.2 入口模式

**Implemented fact**：coding-agent 提供四种 CLI 入口与同进程 SDK：

| 入口 | 事实 | 适用边界 |
|---|---|---|
| Interactive/TUI | `InteractiveMode` 驱动编辑器、消息、工具行、队列和 slash commands | 人在回路；终端是 UI |
| Print | `runPrintMode({ mode: "text" })` 输出最终 assistant 文本后退出 | 单次或脚本化输出 |
| JSON | `runPrintMode({ mode: "json" })` 将会话事件逐行输出 | 自定义轻量观察器；不是 RPC 命令控制面 |
| RPC | `runRpcMode` 从 stdin 接收命令、向 stdout 输出响应/事件 | 进程集成、IDE、跨语言客户端 |
| SDK | `createAgentSession` / `AgentSessionRuntime` 直接嵌入 Node | 类型安全、同进程、可替换 session |

`-p/--print` 与 `--mode json` 走 single-shot print driver；`--mode rpc` 走严格 JSONL 的长期进程。RPC 响应的 `data.disposition` 表示命令如何处理。接受之后的模型或工具错误由事件流报告；`agent_settled` 表示会话层已结束自动续跑，详见第 5 章。

Source: `packages/coding-agent/src/cli/args.ts` (`Mode`, `parseArgs`), `packages/coding-agent/src/modes/print-mode.ts` (`runPrintMode`), `packages/coding-agent/src/modes/json-event.ts` (`toJsonEvent`, `JsonAgentSessionEvent`), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`runRpcMode`), `packages/coding-agent/src/modes/rpc/rpc-types.ts` (`RpcCommand`, `RpcResponse`), `packages/coding-agent/docs/rpc.md`（Protocol Overview）。

### 1.3 SDK 与 session replacement

**Implemented fact**：`createAgentSession()` 可注入 model、tool allowlist、custom tools、`SessionManager`、`ResourceLoader` 和 `SettingsManager`。`AgentSessionRuntime` 负责 `/new`、resume、fork、clone、import 这类替换；替换前会 abort 当前 session、发出 `session_shutdown`，替换后重新绑定扩展。

Source: `packages/coding-agent/src/core/sdk.ts` (`CreateAgentSessionOptions`, `createAgentSession`), `packages/coding-agent/src/core/agent-session-runtime.ts` (`AgentSessionRuntime`, `newSession`, `switchSession`, `fork`), `packages/coding-agent/docs/sdk.md`（createAgentSessionRuntime）。

**Inference**：持有旧 session 或旧 extension context 的调用方不能假设替换后仍有效；应在 replacement callback 中使用新 context。SDK 的 `SessionManager.inMemory()` 是无文件实验的最小安全起点。

## 第 2 章：会话管理——JSONL 不是日志，而是一棵可回退的树

### 2.1 文件与版本

**Implemented fact**：持久会话位于 `~/.pi/agent/sessions/--<cwd>--/`（也可由 `PI_CODING_AGENT_SESSION_DIR` 或 `--session-dir` 覆盖），首行是 `SessionHeader`，当前 `CURRENT_SESSION_VERSION = 3`。除 header 外，entry 都有短 `id` 和 `parentId`；新 entry 追加到当前 leaf，`branch()` 只移动 leaf，不修改或删除历史。

Source: `packages/coding-agent/src/core/session-manager.ts` (`CURRENT_SESSION_VERSION`, `SessionHeader`, `SessionEntryBase`, `SessionManager.newSession`, `SessionManager._appendEntry`, `SessionManager.branch`), `packages/coding-agent/docs/session-format.md`（File Location、Session Version、Tree Structure）。

### 2.2 Entry 与上下文投影

**Implemented fact**：entry 类型包括 `message`、`model_change`、`thinking_level_change`、`compaction`、`context_edit`、`branch_summary`、`custom`、`custom_message`、`label` 和 `session_info`。`custom` 只持久化扩展状态，不进入 LLM context；`custom_message` 会进入 context，可用 `display` 控制 TUI 是否显示；`model_change` 和 thinking entry 影响当前 session 设置。

`getBranch()` 返回从根到当前 leaf 的路径。`buildSessionProjection()` 选中路径与压缩保留段，按目标 ID 应用最新的 `context_edit`，同时保留模型消息的来源；`replacement: null` 让目标消息从模型视图省略，原 entry 仍可回读。首条 `system` 消息声明 prompt sections 与工具。后续 `sections` 变更和 `toolsAdded` / `toolsRemoved` 随上下文重放。

Source: `packages/coding-agent/src/core/session-manager.ts` (`SessionEntry`, `CustomEntry`, `CustomMessageEntry`, `getBranch`, `buildContextEntries`, `buildSessionProjection`, `buildSessionContext`, `sessionEntryToContextMessages`), `packages/coding-agent/docs/session-format.md`（Entry Types、Context Building）。

### 2.3 `/tree`、`/fork`、`/clone`

**Implemented fact**：

- `/tree` 在同一 JSONL 文件内移动 leaf，可在任意历史点继续并保留平行分支；切换时可将放弃分支写成 `branch_summary`。
- `/fork` 产生新文件，通常从选中的 user message 之前复制并把 prompt 放回 editor。
- `/clone` 产生新文件，复制当前 active branch 到当前位置，不恢复 editor prompt。
- `createBranchedSession(leafId)` 可程序化抽取单条路径。

Source: `packages/coding-agent/src/core/session-manager.ts` (`branchWithSummary`, `createBranchedSession`), `packages/coding-agent/src/core/agent-session-runtime.ts` (`fork`), `packages/coding-agent/docs/sessions.md`（`/tree`, `/fork`, `/clone` table）。

**Inference**：树结构是“可探索替代方案”的记录能力，不是 Git checkpoint，也不会回滚工作区文件；想要文件级回滚必须由扩展、Git 或外部 sandbox 提供。

### 2.4 Compaction 与 branch summary

**Implemented fact**：auto-compaction 默认开启，触发条件是 `contextTokens > contextWindow - reserveTokens`；默认 `reserveTokens=16384`、`keepRecentTokens=20000`。`findCutPoint()` 从后向前按估算 token 选择 cut point，不在 tool result 上切断；如果一个 turn 过大，会生成 split-turn 的前缀摘要。自动检查可发生在 prompt 前及工具结果落定后的 `prepareNextTurn`，可恢复的 overflow 或早期 `length` 走一次 compact-and-retry。含 tool call 的截断响应先记录合成失败结果。摘要请求省略工具声明、使用 `cacheRetention: "none"`，沿用传入的 routing/session ID 或生成新 ID，并遵守重试策略。

`CompactionEntry` 保存 summary、`firstKeptEntryId`、`tokensBefore`、可选的 `systemMessage` 检查点及 usage/details/fromHook；默认 details 累积 read/modified 文件。`BranchSummaryEntry` 保存 `fromId` 和摘要，同样可保存 usage/details。

Source: `packages/coding-agent/src/core/compaction/compaction.ts` (`DEFAULT_COMPACTION_SETTINGS`, `shouldCompact`, `findCutPoint`, `completeSummarization`, `CompactionResult`), `packages/coding-agent/src/core/compaction/branch-summarization.ts` (`collectEntriesForBranchSummary`, `prepareBranchEntries`, `generateBranchSummary`), `packages/coding-agent/src/core/session-manager.ts` (`CompactionEntry`, `BranchSummaryEntry`), `packages/coding-agent/docs/compaction.md`（When It Triggers、Split Turns）。

**Implemented fact**：`serializeConversation()` 在摘要前把消息转成标记文本，并把单个 tool result 截断到 2000 字符；这只是摘要请求的输入限制，原 JSONL 历史仍在。

Source: `packages/coding-agent/src/core/compaction/utils.ts` (`serializeConversation`, `TOOL_RESULT_MAX_CHARS`), `packages/coding-agent/docs/compaction.md`（Message Serialization）。

`systemMessage` 保存压缩边界的 prompt 与工具快照，新投影用它替代保留段中的 system 消息。压缩后的 system 增量照常重放。保留段可以开始于 user、assistant、bash execution 或特定 custom 消息；成对的 tool call/result 一起保留。相关测试可从 `packages/coding-agent/test/session-context-edit.test.ts` 和 `test/suite/agent-session-compaction.test.ts` 开始。

## 第 3 章：工具与可编程扩展——能力由资源和 hooks 组合出来

### 3.1 内建工具

**Implemented fact**：全量内建工具是 `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。coding-agent 默认 active 的是前四个；`tools` 可指定工具集合或用 `+name/-name` 修改默认集合，`excludeTools` 再排除匹配项，`--no-builtin-tools` 仅关闭内建默认而保留扩展/custom tools，`--no-tools` 关闭全部默认工具。

工具由 `create*ToolDefinition()` / `create*Tool()` 构造；grep、find 的遍历尊重忽略规则，read 按传入路径读文件，输出有默认 50 KiB / 2000 行级别的截断（find/grep/ls 另有结果数限制），bash 在截断时保存完整输出路径。`withFileMutationQueue()` 为 custom mutation 与内建 edit/write 提供同文件串行队列，避免并行 tool call 的 read-modify-write 丢更新。

Source: `packages/coding-agent/src/core/tools/index.ts` (`ToolName`, `allToolNames`, `createAllTools`, `createCodingTools`, `createReadOnlyTools`), `packages/coding-agent/src/core/sdk.ts` (`CreateAgentSessionOptions.tools`, `noTools`, `excludeTools`), `packages/coding-agent/src/core/tools/truncate.ts` (`DEFAULT_MAX_BYTES`, `DEFAULT_MAX_LINES`, `truncateHead`, `truncateTail`), `packages/coding-agent/src/core/tools/file-mutation-queue.ts` (`withFileMutationQueue`), `packages/coding-agent/docs/extensions.md`（Output Truncation、Remote Execution）。

**Inference**：`--tools read,grep,find,ls` 是“只读意图”配置，但 Pi 本身没有通用权限模型；自定义扩展仍可能写文件、执行进程或访问网络，必须同时审查加载的 extensions/packages。

### 3.2 Extensions、hooks 与 custom tools

**Implemented fact**：扩展是由 jiti 加载的 TypeScript module，default factory 接收 `ExtensionAPI`。它可以：

- `pi.registerTool()` 注册带 TypeBox schema、进度更新、`renderCall`/`renderResult` 的 LLM 工具；抛异常才会将结果标记为 `isError`。
- `pi.on()` 订阅 `project_trust`、session、agent、turn、message、provider、tool、user_bash、input 等事件。
- `tool_call` 可在执行前修改参数或返回 `{ block, reason, terminate }`；`tool_result` 可 middleware 式改写 content/details/isError/usage。
- `before_agent_start` 可注入 persistent custom message 或改本轮 system prompt；`context` 可非破坏性过滤/重排 context。
- 注册 slash command、shortcut、flag、message/entry renderer、markdown transformer、provider，并通过 `appendEntry` 持久化扩展状态。

Source: `packages/coding-agent/src/core/extensions/types.ts` (`ExtensionAPI`, event types, `ToolDefinition`), `packages/coding-agent/src/core/extensions/runner.ts` (`ExtensionRunner`), `packages/coding-agent/docs/extensions.md`（Events、`pi.registerTool`、`tool_call`、`tool_result`）。

**Implemented fact**：扩展可通过 `ctx.ui` 做 select/confirm/input/editor、status/widget/footer/header、custom component、theme 和 editor 替换；RPC 会把有限 UI 映射为 `extension_ui_request`，print/JSON 的 `hasUI=false`，TUI-only custom component 在 headless 模式不可用。

Source: `packages/coding-agent/src/core/extensions/runner.ts` (`bindExtensions`, event dispatch), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`createExtensionUIContext`, `RpcExtensionUIRequest`), `packages/coding-agent/docs/extensions.md`（Mode Behavior、Custom UI）。

内建 CLI 提供 MCP、Tool Search 与 Codemode；subagent 可通过示例扩展启动单次子进程，权限 gate 也可通过扩展挂入工具流水线。SDK 的 resource loader 如需 MCP、Tool Search 或 Codemode，应显式装配对应扩展。

Source: `packages/coding-agent/docs/sdk.md`（Codemode and MCP）、`packages/coding-agent/examples/extensions/subagent/README.md`。

### 3.3 Skills、prompt templates、themes、packages

**Implemented fact**：

- Skills 按 Agent Skills 风格发现，系统 prompt 只放 name/description；匹配后模型用 `read` 载入完整 `SKILL.md`，也可 `/skill:name` 强制加载。
- Prompt templates 是 Markdown，文件名成为 `/name`；支持 `$1`、`$@`、`${1:-default}` 和切片。
- Themes 是 JSON；内置 `dark`/`light`，自定义 theme 可热加载并要求完整颜色 token 集。
- Pi packages 以 npm/git/local source 打包 extensions、skills、prompts、themes；manifest 是 `package.json` 的 `pi` key，也可按约定目录发现。包安装后扩展运行在当前进程权限下。

Source: `packages/coding-agent/src/core/resource-loader.ts` (`DefaultResourceLoader`, `reload`, resource discovery), `packages/coding-agent/src/core/skills.ts` (`formatSkillsForPrompt`), `packages/coding-agent/src/core/prompt-templates.ts` (`PromptTemplate`, expansion), `packages/coding-agent/docs/skills.md`、`prompt-templates.md`、`themes.md`、`packages.md`。

**Inference**：资源是“可审计的 prompt/code supply chain”，不是无害配置。应锁定 package ref、审查 `SKILL.md` 和 extension source，并在不信任项目时保持 `--no-extensions --no-skills --no-prompt-templates --no-themes` 或使用显式可信路径。

### 3.4 MCP、Tool Search 与 Codemode

MCP 从 stdio 或 Streamable HTTP server 发现工具，注册成 `mcp__<server>__<tool>`。以下配置控制模型如何找到某个工具。

| Exposure | 模型如何调用 |
|---|---|
| `codemode`（默认） | 通过 QuickJS 脚本发现与调用。该工具不直接声明给模型 |
| `deferred` | `tool_search` 用 BM25 排序并激活匹配项，下一次模型请求可直接调用 |
| `direct` | server 就绪时直接声明给模型，脚本也可调用 |
| `hidden` | 在工具库中注册，模型和脚本均不可调用 |

`toolExposure` 可为工具名指定覆盖规则。延迟激活的工具随 system 消息的 tool loadout 写进当前分支，后续请求和恢复按该分支读取。Codemode 脚本可通过 `tools` 获取结构化结果、过滤多次调用的输出，成功脚本也能把小型 JSON 存为分支内的 `codemode-store` 状态。QuickJS 不提供 Node 文件或网络 API；授权的宿主工具仍执行真实操作，嵌套调用带 `parentToolCallId` 并经过工具 hooks。MCP 工具调用不会自动重试，因为 server 可能已经执行了操作。

Source: `packages/coding-agent/src/extensions/mcp/index.ts`（`createMcpExtension`）、`extensions/mcp/tools.ts`（`createMcpToolDefinition`）、`extensions/tool-search/tool.ts`（`Bm25Ranker`、`createToolSearchToolDefinition`）、`extensions/codemode/execute.ts`（`readCodemodeStore`）、`packages/coding-agent/docs/mcp.md`、`codemode.md`、`packages/coding-agent/test/suite/agent-session-mcp.test.ts`。

## 第 4 章：交互层——TUI 是差分渲染器，不是业务状态机

### 4.1 regular 与 fullscreen

**Implemented fact**：`TuiMainScreen` 使用主屏和 terminal-owned scrollback；`TuiAltScreen` 使用 alternate screen、固定高度 viewport 和 application-owned `ScrollView`。coding-agent 的 `--tui-mode regular|fullscreen` 选择它们；fullscreen 从 1.0.0 起是默认模式。

Source: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (`createInteractiveTui`, `InteractiveMode`), `packages/tui/src/tui-main-screen.ts` (`TuiMainScreen`), `packages/tui/src/tui-alt-screen.ts` (`TuiAltScreen`), `packages/coding-agent/docs/tui.md`与 `packages/coding-agent/CHANGELOG.md`（1.0.0、1.6.0）。

### 4.2 Differential rendering 的实际算法

**Implemented fact**：两种 renderer 都包裹 CSI 2026 synchronized output。`TuiMainScreen.doRender()` 先渲染组件、合成 overlays、比较 `previousLines` 与新行；首帧全量输出，宽度变化/大多数高度变化/viewport 上方变化做 full redraw，其余只移动光标、清理并重画 firstChanged..lastChanged 行。`TuiAltScreen.doRender()` 将布局压成 viewport rows，仅更新与 `previousScreen` 不同的行；宽高变化时全量重画，Kitty image 变化触发额外 image repaint。

Source: `packages/tui/src/tui-main-screen.ts` (`doRender`, `fullRender`, `firstChanged`, `previousLines`), `packages/tui/src/tui-alt-screen.ts` (`doRender`, `previousScreen`, `fullRedraw`, `imagesNeedRedraw`), `packages/tui/src/tui.ts` (`TuiBase.requestRender`, `renderNow`, `Component`).

**Implemented fact**：组件 `render(width)` 每行不得超过 width；TUI 在差分路径上会检测超宽并抛错。内置 `visibleWidth()`、`truncateToWidth()`、`wrapTextWithAnsi()` 处理 ANSI 可见宽度，`invalidate()` 清除组件缓存。

Source: `packages/tui/src/tui.ts` (`Component`, `TuiBase`), `packages/tui/src/utils.ts` (`visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`), `packages/tui/README.md`（Component Interface、Caching）。

1.6.0 改为 `Component.render(width): readonly string[]`。子组件输出未变时，`Container` 返回同一缓存数组，扩展要在改动前复制。版本同时修复长会话全屏滚动反复渲染完整 transcript。

### 4.3 可用 UI 组件

**Implemented fact**：TUI 提供 `Text`、`Markdown`、`Editor`、`Input`、`Loader`、`CancellableLoader`、`SelectList`、`SettingsList`、`Container`、`Box`、`VStack/HStack`、`ScrollView`、`Image` 和 overlays；Focusable/`CURSOR_MARKER` 支持 IME 硬件光标定位。

Source: `packages/tui/src/tui.ts` (`Component`, `Focusable`, `OverlayHandle`, `TUI`), `packages/tui/src/components/*.ts`, `packages/tui/README.md`（Built-in Components、Focusable Interface）。

**Inference**：TUI 的“实时性”来自受限重绘和组件缓存，不等于模型流、工具执行或 session 持久化已经完成；要做自动化验收应读 JSON/RPC 完成事件或 Session 投影，而不是只看终端截图。

## 第 5 章：子进程 RPC、Pi Durable 与 Chord 应用

### 5.1 coding-agent RPC

**Implemented fact**：RPC stdin/stdout 使用 LF-only JSONL；`attachJsonlLineReader()` 只按 `\n` 分帧并去掉可选 `\r`，明确不使用 Node `readline`（后者会把 U+2028/U+2029 当分隔符）。命令包括 prompt/steer/follow_up/abort、model/thinking、compaction/retry、bash、session tree/fork/clone、state/stats、get_commands；事件包括 agent/turn/message/tool/queue/compaction/retry 和 extension UI 请求。

Source: `packages/coding-agent/src/modes/rpc/jsonl.ts` (`serializeJsonLine`, `attachJsonlLineReader`), `packages/coding-agent/src/modes/rpc/rpc-types.ts` (`RpcCommand`, `RpcResponse`, `RpcExtensionUIRequest`), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`runRpcMode`), `packages/coding-agent/docs/rpc.md`（Framing、Commands、Events）。

**Implemented fact**：JSON event mode 对 `message_update` 去掉 cumulative partial snapshot，只保留 delta 和 usage；`message_start`/`message_end` 与最后状态仍是权威数据。RPC 的 extension UI 只能使用协议声明的对话框/通知/status/widget 等；custom TUI component、theme switching 和 custom editor 在 RPC 中不支持或 no-op。

Source: `packages/coding-agent/src/modes/json-event.ts` (`toJsonEvent`), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`createExtensionUIContext`), `packages/coding-agent/docs/json.md`、`rpc.md`。

成功响应表示命令已处理。低层 `agent_end` 后还能有重试、压缩或续跑。调用方先订阅事件再发 prompt，等待 `agent_settled` 后读取终态；`handled` 表示扩展处理了请求且未开启 run。Pi 按 stdout backpressure 写协议记录，stderr 供诊断。通过关闭 stdin 请求正常退出。

### 5.2 Pi Durable 的任务恢复

`Harness.open()` 打开持久存储。一次 `conversation.commit()` 可原子追加 transcript、修改 JSON 文档并创建任务。模型请求作为 `pi.generation` 任务执行，它拥有工具调用的子 `pi.tool` 任务。工具可持久化 checkpoint 或 park 等待任务、计时器或信号。进程重启后打开同一存储并调用 `resume()`；同一 conversation 的重复 `requestId` 返回原 submission。checkpoint 写入与外部服务效果各有提交点，外部效果要使用自己的幂等键。

Source: `packages/durable/README.md`（Persist and Resume、Tools that park、Failures and Recovery）、`packages/durable/src/harness/harness.ts`（`HarnessImpl.resume`）、`packages/durable/src/harness/submissions.ts`（`Submissions.submit`）、`packages/durable/test/harness-tasks-recovery.test.ts`、`packages/durable/test/harness-tool-parks.test.ts`。

### 5.3 Chord、p2 与 p3

Chord 定义跨进程对象的 contract、可订阅引用、文档事务和插件 facet；调用链接绑定 principal，plugin reload 可以在运行时替换 facet。应用负责对象级授权与宿主能力范围。p2 是实验性自托管 Pi Durable UI，owner 有服务器和 worker 的 agent/shell 权限。后继 p3 基于 Chord v2，在该快照为 headless server，通过每会话 worker 运行 Durable；默认 CLI 仍使用 AgentSession 与自身的 JSONL 格式。

Source: `packages/chord/README.md`、`apps/p2/README.md`、`apps/p2/src/runtime/durable.ts`、`apps/p3/README.md`、`apps/p3/src/server.ts` 和 `apps/p3/src/worker.ts`。早期课程中的独立 `packages/protocol`、`packages/server` 和 `packages/client` 已不在此快照的 Git 树。

## 第 6 章：Telemetry——两条用途不同的线

### 6.1 安装/更新 telemetry 与 attribution

**Implemented fact**：coding-agent 的 install/update ping 是独立于业务 span 的启动功能：新安装或 changelog 检测到更新时，`InteractiveMode.reportInstallTelemetry()` 请求 `https://pi.dev/api/report-install?version=...`；`PI_TELEMETRY=0/false/no` 或 settings 的 `enableInstallTelemetry=false` 关闭它。`PI_OFFLINE` 关闭 startup network operations；`PI_SKIP_VERSION_CHECK` 只关闭 latest-version 检查。启用状态还控制部分 provider attribution headers。

Source: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (`getChangelogForDisplay`, `reportInstallTelemetry`), `packages/coding-agent/src/core/telemetry.ts` (`isInstallTelemetryEnabled`), `packages/coding-agent/src/utils/version-check.ts` (`checkForNewPiVersion`), `packages/coding-agent/src/core/sdk.ts`（运行时 request identity）, `packages/coding-agent/docs/environment-variables.md`。

### 6.2 可注入的 vendor-neutral spans

**Implemented fact**：`@earendil-works/pi-telemetry` 提供 callback-managed `TelemetryContext`/`TelemetrySpan`、共享 `NOOP_TELEMETRY_CONTEXT`、`InMemoryTelemetryContext`、serializable schema helpers 和 adapter conformance suite；不提供 exporter、global current span 或 backend 依赖。Pi Durable 通过 `DURABLE_TELEMETRY_SCHEMA` 记录任务 phase 指标，会话嵌入方可注入 telemetry；Pi AI 的 provider request options 也接受显式 `telemetryContext`。

Source: `packages/telemetry/src/index.ts` (`TelemetryContext`, `TelemetrySpan`, `createTypedSpanStarter`), `packages/telemetry/src/noop.ts` (`NOOP_TELEMETRY_CONTEXT`), `packages/telemetry/src/memory.ts` (`InMemoryTelemetryContext`), `packages/durable/src/harness/telemetry.ts` (`DURABLE_TELEMETRY_SCHEMA`), `packages/ai/src/types.ts` (`telemetryContext`), `packages/telemetry/README.md`。

**Implemented fact**：Telemetry adapter 必须保持业务 callback 的返回/异常语义，span 直到 callback promise settle 才结束；recording 应被动且不抛错，敏感内容默认不应进入 attributes。当前 coding-agent CLI 的 install ping 与这些 library span 不应混为同一“Pi 已经全链路埋点”的证明。

Source: `packages/telemetry/src/index.ts` (`TelemetryContext` contract), `packages/telemetry/src/memory.ts` (`InMemoryTelemetryContext`), `packages/telemetry/README.md`（Adapter Contract、Security and Portability）。

**Uncertainty**：本 checkout 没有证据表明默认 coding-agent CLI 会自动配置外部 exporter 或把所有 CLI turns 接到 Durable telemetry；能确认的是 telemetry API 和 install/update ping。若需要生产 tracing，必须显式注入 adapter/context 并单独制定脱敏策略。

## 第 7 章：权限、安全与容器——事实边界必须写在设计里

### 7.1 Pi 默认没有内建权限系统

**Implemented fact**：Pi 不限制 filesystem、process、network 或 credentials；built-in tools、扩展和普通子进程以启动 Pi 的用户权限运行。没有内建 permission popup、sandbox 或通用 allow/deny policy。

Source: `README.md`（Permissions & Containerization）, `packages/coding-agent/docs/security.md`（No Built-in Sandbox）, `packages/coding-agent/src/core/tools/bash.ts` (`createLocalBashOperations`), `packages/coding-agent/src/core/extensions/loader.ts`（extension loading）。

### 7.2 Project trust 的真实作用

**Implemented fact**：project trust 只决定是否加载 project-local `.pi/settings.json`、`.pi` resources、project packages/extensions、`.pi/mcp.json` 和 `.agents/skills`。普通 `AGENTS.md` 等 context 文件仍可加载，`sessionDir` 初始化也先于 trust。非交互 `-p`/JSON/RPC 不弹 prompt，而采用 `defaultProjectTrust` 或 `--approve/--no-approve`。trust 不会限制模型随后调用已加载的 bash/write，也不阻止 prompt injection。

Source: `packages/coding-agent/src/core/project-trust.ts` (`resolveProjectTrusted`), `packages/coding-agent/src/core/trust-manager.ts` (`hasTrustRequiringProjectResources`, `ProjectTrustStore`), `packages/coding-agent/src/core/resource-loader.ts` (`loadProjectContextFiles`, `DefaultResourceLoader.reload`), `packages/coding-agent/docs/security.md`（Project Trust）。

### 7.3 真正的隔离方式

**Implemented fact**：官方文档给出三种边界：

| 模式 | 隔离对象 | 关键事实 |
|---|---|---|
| Gondolin extension | built-in tools 与 `!` commands | host Pi/认证保留在 host；扩展 custom tools 仍可能在 host |
| Plain Docker | 整个 Pi 进程 | API keys 进入 container；bind mount 的 workspace 仍可写 host |
| OpenShell | 整个 Pi 进程 | policy-controlled sandbox，可限制 filesystem/process/network/credentials/inference；远程 gateway 不会自动把文件写回 host |

Source: `packages/coding-agent/docs/containerization.md`（Choose a pattern、Gondolin、Plain Docker、OpenShell）。

**Inference**：安全设计应把“加载资源”“模型调用”“工具执行”“宿主文件写入”“provider credentials”分别画边界。只用 `--tools read,...` 或只点 project trust 不能替代 OS/container policy；只读挂载、最小 credential、受限 network、审查 diff 才构成可解释的控制面。

## 交互实验：沿一条审计任务逐步建立证据

以下实验是设计方案，不是本次已执行的验证。统一要求：使用临时目录、`SessionManager.inMemory()` 或临时 `PI_CODING_AGENT_SESSION_DIR`，使用 tests/faux provider 或 stub transport；不填真实 API key、不启动真实 provider、不把实验扩展装入全局目录。每个实验结束保存 stdout/JSONL 和预期结果，实验之间不要复用不可信 extension。

### 实验 1：只读入口与默认工具边界

**目标**：区分“全量内建工具”和“当前 active 工具”。

1. 在临时 checkout 运行 `pi --no-session --tools read,grep,find,ls --print "列出并概括入口文件"`，替换成 faux provider 或只调用 CLI help/资源解析，不执行真实模型。
2. 检查 system prompt/tool registry 是否只有四个只读工具；对比 `packages/coding-agent/src/core/tools/index.ts:createAllToolDefinitions()` 的七个定义。
3. 设计一个 extension tool 后用 `--no-builtin-tools -e ./extension.ts`，确认 extension tool 可以保留而 builtin 默认关闭。

**预期观察**：allowlist 是工具暴露配置，不是权限 sandbox；extension 代码仍拥有宿主权限。证据：`CreateAgentSessionOptions.tools/noTools`、`createAllToolDefinitions`。

### 实验 2：JSONL tree、分支与 compaction 投影

**目标**：看到“append-only entry tree”与“发送给 LLM 的 context”不同。

1. 用 SDK 创建 `SessionManager.inMemory()`，追加 user/assistant/toolResult，记录 `getEntries()`、`getBranch()` 和 `buildSessionProjection()`。
2. 调 `branch(entryId)` 后追加另一条 user/assistant，比较 `getTree()`：原分支仍在，leaf 已移动。
3. 用假的 summary callback 走 `findCutPoint()`/`appendCompaction()`，比较 `getEntries()`（全历史）与 `buildSessionProjection()`。追加指向一条普通消息的 `context_edit`，分别检查原始内容与投影中的省略。

**预期观察**：compaction 是上下文投影，不是擦除；`toolResult` 不是合法 cut point；当前 coding-agent entry shape 以 `firstKeptEntryId` 为准。证据：`SessionManager`、`findCutPoint`、`buildContextEntries`。

### 实验 3：扩展 hook 做显式危险操作 gate

**目标**：展示 permission gate 只能由扩展/外部策略实现。

1. 写临时 extension，注册 `tool_call`；注册一个无副作用的 `read_fixture` 测试工具，根据参数是允许还是拒绝返回 `{ block: true, reason: "..." }`，用执行计数器核实拒绝时工具没有运行。
2. 注册一个 TypeBox custom tool，并在 `tool_result` 中追加无敏感的 audit detail；运行 `pi -e ./gate.ts --no-session`（faux provider）。
3. 关闭 extension 或换成 project-local extension，观察 trust/load 顺序；验证没有 extension 时 Pi 不会自行弹出权限窗口。

**预期观察**：hook 可以阻断/改写单次 tool call，但不改变宿主进程的根权限，也不能防止恶意 extension 自己调用 `fs`/`child_process`。证据：`ExtensionAPI`、`ExtensionRunner`、`tool_call` event type、security docs。

### 实验 4：RPC 的响应、结束与结算

1. 用 faux provider 启动 `pi --mode rpc --no-session`。发送有请求 ID 的 prompt，先记 response 的 disposition，再记 `message_end`、`agent_end`、`agent_settled`。
2. 让 faux provider 第一次返回可恢复的错误，确认首个 `agent_end` 后仍能读到重试。再令扩展直接处理 prompt，确认 disposition 为 `handled` 时没有新 run。
3. 将带 U+2028/U+2029 的合法字符串放进 JSONL 记录，确认只能按 LF 分帧。

预期证据在 `packages/coding-agent/test/rpc-jsonl.test.ts` 和 `packages/coding-agent/test/rpc-prompt-response-semantics.test.ts`。

### 实验 5：用同一个 MCP 工具比较四种暴露

为 faux provider 和 stub server 定义只读 `search_review`。依次改为 `direct`、`deferred`、`codemode`、`hidden`，记录模型请求中的声明集合和宿主工具执行次数。用 `tool_search` 激活 deferred 工具后检查下一次请求与 session 的 system 记录；Codemode 中则用 `searchTools()` 发现并在脚本里调用。确认两条执行路径都触发宿主 hooks。

### 实验 6：重开 Durable 存储

在测试 storage 上用固定 `requestId` 提交任务。提交一次 checkpoint 后关闭 harness，重新打开并调用 `resume()`。比较重提获得的 submission ID 和任务 checkpoint；stub 外部服务以任务 ID 做幂等键，确认重做时只落一个效果。

来源：[Durable 恢复测试](https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/durable/test/harness-tasks-recovery.test.ts)。

## 证据核对清单

- [版本与破坏性变更](https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/coding-agent/CHANGELOG.md#160---2026-11-20)
- [Session 投影与 system 重放](https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/coding-agent/docs/session-format.md)
- [项目加载与执行权限](https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/coding-agent/docs/security.md)
- [已实现的 Durable 恢复契约](https://github.com/earendil-works/pi/blob/9c4652688590abb836b40ebd1e4725ecf9a7c7d1/packages/durable/README.md#persist-and-resume)
