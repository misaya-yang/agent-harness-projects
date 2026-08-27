# Pi coding-agent 能力地图（源码快照）

> 快照：本地 `pi` 源码，`a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`（2026-08-25）。本文只基于本地源码、包 README 和相关 docs；没有联网、安装依赖、运行真实模型或修改源仓。

## 阅读方式与证据等级

每个结论都带有 `Source:`，路径相对于 Pi 源仓根目录；括号内是可检索的 symbol。标签含义如下：

- **Implemented fact**：当前 checkout 的源码直接实现，或包 README 明确描述且源码有对应符号。
- **Inference**：由多个实现事实推导出的使用含义，不等于额外的安全保证。
- **Optional / experimental**：可选扩展点、独立包或 README 明确标为实验性；不应当当作稳定核心契约。

贯穿任务是“审计一个仓库并在需要时安全地继续修复”：先只读理解，再创建可回溯分支，最后由外部控制面接管；权限、模型、存储和 UI 都在每一章中跟随这条任务链说明。

## 第 1 章：整体形状——小核心、四种入口、可替换运行时

### 1.1 分层

**Implemented fact**：Pi monorepo 把能力拆成统一模型 API、agent loop、coding-agent CLI/SDK、TUI，以及独立的协议/服务/客户端层。`Agent` 保存消息和工具状态；`AgentSession` 把它与 `SessionManager`、模型运行时、资源加载器和扩展运行器组合起来；CLI 只选择入口并驱动运行时。

`Agent` 的核心循环是 `AgentMessage[] -> transformContext -> convertToLlm -> provider stream`，每个 turn 发出消息/工具生命周期事件；默认并行执行同一 assistant 消息中的工具调用，但可切换为 sequential。

Source: `packages/agent/src/agent.ts` (`Agent`, `AgentOptions`), `packages/agent/src/agent-loop.ts` (`runAgentLoop`, `runAgentLoopContinue`), `packages/coding-agent/src/core/agent-session.ts` (`AgentSession`), `packages/coding-agent/src/core/sdk.ts` (`createAgentSession`), `README.md`（All Packages）。

**Inference**：要嵌入 Pi，优先 SDK；要跨语言或需要进程边界，使用 RPC；不要把 TUI、RPC 和 server protocol 混称为同一个协议。

### 1.2 入口模式

**Implemented fact**：coding-agent 提供四类运行方式：

| 入口 | 事实 | 适用边界 |
|---|---|---|
| Interactive/TUI | `InteractiveMode` 驱动编辑器、消息、工具行、队列和 slash commands | 人在回路；终端是 UI |
| Print | `runPrintMode({ mode: "text" })` 输出最终 assistant 文本后退出 | 单次或脚本化输出 |
| JSON | `runPrintMode({ mode: "json" })` 将会话事件逐行输出 | 自定义轻量观察器；不是 RPC 命令控制面 |
| RPC | `runRpcMode` 从 stdin 接收命令、向 stdout 输出响应/事件 | 进程集成、IDE、跨语言客户端 |
| SDK | `createAgentSession` / `AgentSessionRuntime` 直接嵌入 Node | 类型安全、同进程、可替换 session |

`-p/--print` 与 `--mode json` 走 single-shot print driver；`--mode rpc` 走严格 JSONL 的长期进程。RPC 的响应表示“已接受/排队/立即处理”，接受之后的模型或工具错误通过事件流报告，而不是重复响应同一 request id。

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

**Implemented fact**：entry 类型包括 `message`、`model_change`、`thinking_level_change`、`compaction`、`branch_summary`、`custom`、`custom_message`、`label` 和 `session_info`。`custom` 只持久化扩展状态，不进入 LLM context；`custom_message` 会进入 context，可用 `display` 控制 TUI 是否显示；`model_change` 和 thinking entry 影响当前 session 设置。

`getBranch()` 返回 leaf 到 root 的路径；`buildContextEntries()` 先按树路径取 active branch，再把最近 compaction 前的旧段替换为 summary 与保留段；`buildSessionContext()` 将 entry 投影为实际 `AgentMessage[]`。

Source: `packages/coding-agent/src/core/session-manager.ts` (`SessionEntry`, `CustomEntry`, `CustomMessageEntry`, `getBranch`, `buildContextEntries`, `buildSessionContext`, `sessionEntryToContextMessages`), `packages/coding-agent/docs/session-format.md`（Entry Types、Context Building）。

### 2.3 `/tree`、`/fork`、`/clone`

**Implemented fact**：

- `/tree` 在同一 JSONL 文件内移动 leaf，可在任意历史点继续并保留平行分支；切换时可将放弃分支写成 `branch_summary`。
- `/fork` 产生新文件，通常从选中的 user message 之前复制并把 prompt 放回 editor。
- `/clone` 产生新文件，复制当前 active branch 到当前位置，不恢复 editor prompt。
- `createBranchedSession(leafId)` 可程序化抽取单条路径。

Source: `packages/coding-agent/src/core/session-manager.ts` (`branchWithSummary`, `createBranchedSession`), `packages/coding-agent/src/core/agent-session-runtime.ts` (`fork`), `packages/coding-agent/docs/sessions.md`（`/tree`, `/fork`, `/clone` table）。

**Inference**：树结构是“可探索替代方案”的记录能力，不是 Git checkpoint，也不会回滚工作区文件；想要文件级回滚必须由扩展、Git 或外部 sandbox 提供。

### 2.4 Compaction 与 branch summary

**Implemented fact**：auto-compaction 默认开启，触发条件是 `contextTokens > contextWindow - reserveTokens`；默认 `reserveTokens=16384`、`keepRecentTokens=20000`。`findCutPoint()` 从后向前按估算 token 选择 cut point，不在 tool result 上切断；如果一个 turn 过大，会生成 split-turn 的前缀摘要。摘要调用通过 `completeSummarization()`，使用 `toolChoice: "none"`、`cacheRetention: "none"` 和独立 routing/session id，并遵守重试策略。

`CompactionEntry` 保存 summary、`firstKeptEntryId`、`tokensBefore`、可选 usage/details/fromHook；默认 details 累积 read/modified 文件。`BranchSummaryEntry` 保存 `fromId` 和摘要，同样可保存 usage/details。

Source: `packages/coding-agent/src/core/compaction/compaction.ts` (`DEFAULT_COMPACTION_SETTINGS`, `shouldCompact`, `findCutPoint`, `completeSummarization`, `CompactionResult`), `packages/coding-agent/src/core/compaction/branch-summarization.ts` (`collectEntriesForBranchSummary`, `prepareBranchEntries`, `generateBranchSummary`), `packages/coding-agent/src/core/session-manager.ts` (`CompactionEntry`, `BranchSummaryEntry`), `packages/coding-agent/docs/compaction.md`（When It Triggers、Split Turns）。

**Implemented fact**：`serializeConversation()` 在摘要前把消息转成标记文本，并把单个 tool result 截断到 2000 字符；这只是摘要请求的输入限制，原 JSONL 历史仍在。

Source: `packages/coding-agent/src/core/compaction/utils.ts` (`serializeConversation`, `TOOL_RESULT_MAX_CHARS`), `packages/coding-agent/docs/compaction.md`（Message Serialization）。

**Uncertainty**：`packages/coding-agent/docs/session-format.md` 还描述了 harness-generated `retainedTail` checkpoint，但当前 `packages/coding-agent/src/core/session-manager.ts:CompactionEntry` 类型和 `buildContextEntries()` 仅直接实现 `firstKeptEntryId` 路径。Pi coding-agent v3 与独立 `packages/agent/src/harness/*` 的格式不能无条件互换；解析器应按实际 entry shape 做兼容测试，不应把 retainedTail 当作当前 coding-agent 的稳定保证。

## 第 3 章：工具与可编程扩展——能力由资源和 hooks 组合出来

### 3.1 内建工具

**Implemented fact**：全量内建工具是 `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。coding-agent 默认 active 的是前四个；`tools` 是 allowlist，`excludeTools` 之后再禁用，`--no-builtin-tools` 仅关闭内建默认而保留扩展/custom tools，`--no-tools` 关闭全部默认工具。

工具由 `create*ToolDefinition()` / `create*Tool()` 构造；读、grep、find、ls 尊重 `.gitignore`，输出有默认 50 KiB / 2000 行级别的截断（find/grep/ls 另有结果数限制），bash 在截断时保存完整输出路径。`withFileMutationQueue()` 为 custom mutation 与内建 edit/write 提供同文件串行队列，避免并行 tool call 的 read-modify-write 丢更新。

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

**Optional / experimental**：sub-agents、plan mode、MCP、permission gates、remote SSH/sandbox tools 都不是 Pi 核心内建能力；官方路线是由 extension/package 实现。dynamic tool loading 是可选扩展机制：新增 tool 会在后一个 provider request 可见，但不能当成静态 tool schema 永远稳定的保证。

Source: `packages/coding-agent/README.md`（Philosophy、Extensions）、`packages/coding-agent/docs/extensions.md`（Dynamic Tool Loading、Remote Execution）。

### 3.3 Skills、prompt templates、themes、packages

**Implemented fact**：

- Skills 按 Agent Skills 风格发现，系统 prompt 只放 name/description；匹配后模型用 `read` 载入完整 `SKILL.md`，也可 `/skill:name` 强制加载。
- Prompt templates 是 Markdown，文件名成为 `/name`；支持 `$1`、`$@`、`${1:-default}` 和切片。
- Themes 是 JSON；内置 `dark`/`light`，自定义 theme 可热加载并要求完整颜色 token 集。
- Pi packages 以 npm/git/local source 打包 extensions、skills、prompts、themes；manifest 是 `package.json` 的 `pi` key，也可按约定目录发现。包安装后扩展运行在当前进程权限下。

Source: `packages/coding-agent/src/core/resource-loader.ts` (`DefaultResourceLoader`, `reload`, resource discovery), `packages/coding-agent/src/core/skills.ts` (`formatSkillsForPrompt`), `packages/coding-agent/src/core/prompt-templates.ts` (`PromptTemplate`, expansion), `packages/coding-agent/docs/skills.md`、`prompt-templates.md`、`themes.md`、`packages.md`。

**Inference**：资源是“可审计的 prompt/code supply chain”，不是无害配置。应锁定 package ref、审查 `SKILL.md` 和 extension source，并在不信任项目时保持 `--no-extensions --no-skills --no-prompt-templates --no-themes` 或使用显式可信路径。

## 第 4 章：交互层——TUI 是差分渲染器，不是业务状态机

### 4.1 regular 与 fullscreen

**Implemented fact**：`TuiMainScreen` 使用主屏和 terminal-owned scrollback；`TuiAltScreen` 使用 alternate screen、固定高度 viewport 和 application-owned `ScrollView`。coding-agent 的 `--tui-mode regular|fullscreen` 选择它们；fullscreen 是 CLI 标记为 experimental 的可选模式。

Source: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (`createInteractiveTui`, `InteractiveMode`), `packages/tui/src/tui-main-screen.ts` (`TuiMainScreen`), `packages/tui/src/tui-alt-screen.ts` (`TuiAltScreen`), `packages/coding-agent/docs/tui.md`（Rendering modes）。

### 4.2 Differential rendering 的实际算法

**Implemented fact**：两种 renderer 都包裹 CSI 2026 synchronized output。`TuiMainScreen.doRender()` 先渲染组件、合成 overlays、比较 `previousLines` 与新行；首帧全量输出，宽度变化/大多数高度变化/viewport 上方变化做 full redraw，其余只移动光标、清理并重画 firstChanged..lastChanged 行。`TuiAltScreen.doRender()` 将布局压成 viewport rows，仅更新与 `previousScreen` 不同的行；宽高变化时全量重画，Kitty image 变化触发额外 image repaint。

Source: `packages/tui/src/tui-main-screen.ts` (`doRender`, `fullRender`, `firstChanged`, `previousLines`), `packages/tui/src/tui-alt-screen.ts` (`doRender`, `previousScreen`, `fullRedraw`, `imagesNeedRedraw`), `packages/tui/src/tui.ts` (`TuiBase.requestRender`, `renderNow`, `Component`).

**Implemented fact**：组件 `render(width)` 每行不得超过 width；TUI 在差分路径上会检测超宽并抛错。内置 `visibleWidth()`、`truncateToWidth()`、`wrapTextWithAnsi()` 处理 ANSI 可见宽度，`invalidate()` 清除组件缓存。

Source: `packages/tui/src/tui.ts` (`Component`, `TuiBase`), `packages/tui/src/utils.ts` (`visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`), `packages/tui/README.md`（Component Interface、Caching）。

### 4.3 可用 UI 组件

**Implemented fact**：TUI 提供 `Text`、`Markdown`、`Editor`、`Input`、`Loader`、`CancellableLoader`、`SelectList`、`SettingsList`、`Container`、`Box`、`VStack/HStack`、`ScrollView`、`Image` 和 overlays；Focusable/`CURSOR_MARKER` 支持 IME 硬件光标定位。

Source: `packages/tui/src/tui.ts` (`Component`, `Focusable`, `OverlayHandle`, `TUI`), `packages/tui/src/components/*.ts`, `packages/tui/README.md`（Built-in Components、Focusable Interface）。

**Inference**：TUI 的“实时性”来自受限重绘和组件缓存，不等于模型流、工具执行或 session 持久化已经完成；要做自动化验收应读 JSON/RPC/Session snapshot，而不是只看终端截图。

## 第 5 章：远程协议——RPC JSONL 与 experimental server protocol 的边界

### 5.1 coding-agent RPC

**Implemented fact**：RPC stdin/stdout 使用 LF-only JSONL；`attachJsonlLineReader()` 只按 `\n` 分帧并去掉可选 `\r`，明确不使用 Node `readline`（后者会把 U+2028/U+2029 当分隔符）。命令包括 prompt/steer/follow_up/abort、model/thinking、compaction/retry、bash、session tree/fork/clone、state/stats、get_commands；事件包括 agent/turn/message/tool/queue/compaction/retry 和 extension UI 请求。

Source: `packages/coding-agent/src/modes/rpc/jsonl.ts` (`serializeJsonLine`, `attachJsonlLineReader`), `packages/coding-agent/src/modes/rpc/rpc-types.ts` (`RpcCommand`, `RpcResponse`, `RpcExtensionUIRequest`), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`runRpcMode`), `packages/coding-agent/docs/rpc.md`（Framing、Commands、Events）。

**Implemented fact**：JSON event mode 对 `message_update` 去掉 cumulative partial snapshot，只保留 delta 和 usage；`message_start`/`message_end` 与最后状态仍是权威数据。RPC 的 extension UI 只能使用协议声明的对话框/通知/status/widget 等；custom TUI component、theme switching 和 custom editor 在 RPC 中不支持或 no-op。

Source: `packages/coding-agent/src/modes/json-event.ts` (`toJsonEvent`), `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (`createExtensionUIContext`), `packages/coding-agent/docs/json.md`、`rpc.md`。

### 5.2 protocol 包

**Implemented fact**：`@earendil-works/pi-protocol` 是 runtime-neutral wire layer，不携带 transport。版本 1 的 frame 是四字节 big-endian 长度 + definite-length CBOR item；第一个 client message 必须是 `hello` + `PROTOCOL_VERSION`。`FrameDecoder` 接受任意 fragmentation/coalescing，`ClientMessageDecoder`/`ServerMessageDecoder` 做 framing + CBOR + schema validation；协议拒绝 unknown properties、indefinite-length CBOR、超限 frame/nesting/unsafe number 等。

Source: `packages/protocol/src/framing.ts` (`FrameDecoder`, `encodeFrame`, `DEFAULT_MAX_FRAME_LENGTH`), `packages/protocol/src/codec.ts` (`encodeClientMessage`, `encodeServerMessage`, decoders), `packages/protocol/src/schemas.ts` (`PROTOCOL_VERSION`, `ClientMessageSchema`, `ServerMessageSchema`), `packages/protocol/README.md`。

**Implemented fact**：协议将 session list 的 `SessionMetadata` 与 acquire 后的 `SessionSnapshot` 分开；snapshot/response snapshot 是 authoritative，`TranscriptProgress`/`session_progress` 是 transient UI hint，不应降低为状态。

Source: `packages/protocol/src/schemas.ts` (`SessionMetadataSchema`, `SessionSnapshotSchema`, `TranscriptProgressSchema`, `ServerEventSchema`), `packages/protocol/README.md`。

### 5.3 server 与 client

**Optional / experimental**：`@earendil-works/pi-server` README 明确标为实验性，且没有 standalone CLI/coding-agent service；应用必须提供 `PiServerService`，server 只管理 protocol、live runtime 和 connections。listener 在交给 `PiServer` 前负责 transport-specific authentication/authorization；Unix listener 主要依赖 socket filesystem permissions。

Source: `packages/server/src/server.ts` (`PiServer`, `accept`, `finishHandshake`), `packages/server/src/types.ts` (`PiServerService`, `PiSessionRuntime`), `packages/server/src/listener.ts` (`PiServerListener`), `packages/server/README.md`。

**Implemented fact**：server 要求 hello、支持 handshake timeout、按 request id 回 response、广播 server/session snapshots 和 transient progress；`LiveSessionManager` 对同一 live runtime 做 acquire/attach、operation count 与 idle dispose，冲突/不合法请求返回结构化 `PiServerError`。

Source: `packages/server/src/server.ts` (`dispatchMessage`, `handleRequest`, `failProtocol`), `packages/server/src/sessions.ts` (`LiveSessionManager.executeCommand`, `runOperation`, `requireAttached`, `maybeDispose`), `packages/server/src/errors.ts`。

**Implemented fact**：`PiClient` 不自动 reconnect；断线后调用 `reconnect()`。它将 request 按 id 关联，将 snapshot 当权威状态，并以 `SessionLease` 表达 shared/exclusive acquisition：exclusive 与任何现有 lease 冲突，shared 与 exclusive 冲突；最后一个 lease 释放后才发送 detach，断线/removed 会使 lease invalidated。

Source: `packages/client/src/client.ts` (`PiClient`, `acquireSession`, `#request`, `#handleConnectionStateChange`), `packages/client/src/session-handle.ts` (`SessionLease`, `SessionLeaseMode`), `packages/client/README.md`（Limits and security、Leases）。

**Inference**：protocol/server/client 不是“远端 Pi CLI 的即插即用安全服务”。需要自建 listener、认证、`PiServerService` 和持久 runtime；网络 transport 的认证也不会由 protocol 包自动完成。

## 第 6 章：Telemetry——两条用途不同的线

### 6.1 安装/更新 telemetry 与 attribution

**Implemented fact**：coding-agent 的 install/update ping 是独立于业务 span 的启动功能：新安装或 changelog 检测到更新时，`InteractiveMode.reportInstallTelemetry()` 请求 `https://pi.dev/api/report-install?version=...`；`PI_TELEMETRY=0/false/no` 或 settings 的 `enableInstallTelemetry=false` 关闭它。`PI_OFFLINE` 关闭 startup network operations；`PI_SKIP_VERSION_CHECK` 只关闭 latest-version 检查。启用状态还控制部分 provider attribution headers。

Source: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (`getChangelogForDisplay`, `reportInstallTelemetry`), `packages/coding-agent/src/core/telemetry.ts` (`isInstallTelemetryEnabled`), `packages/coding-agent/src/utils/version-check.ts` (`checkForNewPiVersion`), `packages/coding-agent/src/core/provider-attribution.ts` (`mergeProviderAttributionHeaders`), `packages/coding-agent/docs/environment-variables.md`。

### 6.2 可注入的 vendor-neutral spans

**Implemented fact**：`@earendil-works/pi-telemetry` 提供 callback-managed `TelemetryContext`/`TelemetrySpan`、共享 `NOOP_TELEMETRY_CONTEXT`、`InMemoryTelemetryContext`、serializable schema helpers 和 adapter conformance suite；不提供 exporter、global current span 或 backend 依赖。`@earendil-works/pi-agent-core` 的 `startAiSpan()`/`startHarnessSpan()` 绑定 AI-request 与 harness schema，`pi-ai` 的 provider request options 接受显式 `telemetryContext`。

Source: `packages/telemetry/src/index.ts` (`TelemetryContext`, `TelemetrySpan`, `createTypedSpanStarter`), `packages/telemetry/src/noop.ts` (`NOOP_TELEMETRY_CONTEXT`), `packages/telemetry/src/memory.ts` (`InMemoryTelemetryContext`), `packages/agent/src/harness/telemetry.ts` (`AI_TELEMETRY_SCHEMA`, `HARNESS_TELEMETRY_SCHEMA`, `startAiSpan`, `startHarnessSpan`), `packages/ai/src/types.ts` (`telemetryContext`), `packages/telemetry/README.md`。

**Implemented fact**：Telemetry adapter 必须保持业务 callback 的返回/异常语义，span 直到 callback promise settle 才结束；recording 应被动且不抛错，敏感内容默认不应进入 attributes。当前 coding-agent CLI 的 install ping 与这些 library span 不应混为同一“Pi 已经全链路埋点”的证明。

Source: `packages/telemetry/src/index.ts` (`TelemetryContext` contract), `packages/telemetry/src/memory.ts` (`InMemoryTelemetryContext`), `packages/telemetry/README.md`（Adapter Contract、Security and Portability）。

**Uncertainty**：本 checkout 没有证据表明默认 coding-agent CLI 会自动配置外部 exporter 或把所有 CLI turns 接到 `startHarnessSpan()`；能确认的是 telemetry API 和 install/update ping。若需要生产 tracing，必须显式注入 adapter/context 并单独制定脱敏策略。

## 第 7 章：权限、安全与容器——事实边界必须写在设计里

### 7.1 Pi 默认没有内建权限系统

**Implemented fact**：Pi 不限制 filesystem、process、network 或 credentials；built-in tools、扩展和普通子进程以启动 Pi 的用户权限运行。没有内建 permission popup、sandbox 或通用 allow/deny policy。

Source: `README.md`（Permissions & Containerization）, `packages/coding-agent/docs/security.md`（No Built-in Sandbox）, `packages/coding-agent/src/core/tools/bash.ts` (`createLocalBashOperations`), `packages/coding-agent/src/core/extensions/loader.ts`（extension loading）。

### 7.2 Project trust 的真实作用

**Implemented fact**：project trust 只决定是否加载 project-local `.pi/settings.json`、`.pi` resources、project packages/extensions 和 `.agents/skills`；context files 可在 trust 前加载。非交互 `-p`/JSON/RPC 不弹 prompt，而采用 `defaultProjectTrust` 或 `--approve/--no-approve`。trust 不会限制模型随后调用已加载的 bash/write，也不阻止 prompt injection。

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

1. 用 SDK 创建 `SessionManager.inMemory()`，追加 user/assistant/toolResult，记录 `getEntries()`、`getBranch()` 和 `buildSessionContext()`。
2. 调 `branch(entryId)` 后追加另一条 user/assistant，比较 `getTree()`：原分支仍在，leaf 已移动。
3. 用假的 summary callback 走 `findCutPoint()`/`appendCompaction()`，比较 `getEntries()`（全历史）与 `buildContextEntries()`（compaction-aware projection）。

**预期观察**：compaction 是上下文投影，不是擦除；`toolResult` 不是合法 cut point；当前 coding-agent entry shape 以 `firstKeptEntryId` 为准。证据：`SessionManager`、`findCutPoint`、`buildContextEntries`。

### 实验 3：扩展 hook 做显式危险操作 gate

**目标**：展示 permission gate 只能由扩展/外部策略实现。

1. 写临时 extension，注册 `tool_call`；对 `bash` 的 command 包含 `rm -rf` 返回 `{ block: true, reason: "..." }`，对普通命令只记录事件。
2. 注册一个 TypeBox custom tool，并在 `tool_result` 中追加无敏感的 audit detail；运行 `pi -e ./gate.ts --no-session`（faux provider）。
3. 关闭 extension 或换成 project-local extension，观察 trust/load 顺序；验证没有 extension 时 Pi 不会自行弹出权限窗口。

**预期观察**：hook 可以阻断/改写单次 tool call，但不改变宿主进程的根权限，也不能防止恶意 extension 自己调用 `fs`/`child_process`。证据：`ExtensionAPI`、`ExtensionRunner`、`tool_call` event type、security docs。

### 实验 4：RPC 与 protocol snapshot 的权威性

**目标**：比较 coding-agent 子进程 RPC 和实验性 server/client wire protocol。

1. 用 faux provider 启动 `pi --mode rpc --no-session`；严格按 LF 写入 `get_state`、`get_commands`、`prompt`，只按 `\n` 读回，并同时记录 `message_update` 与 `message_end`。
2. 用 `packages/server/src/testing` 的 `createTestServer` 和 `ProtocolTestClient`，使用 in-memory `ByteTransport` 分片发送 hello/frame；故意把一个 frame 拆成多块并合并两帧。
3. 比较：RPC 是 coding-agent command/event stream；protocol 是 4-byte length + CBOR + schema envelope，server snapshot/session snapshot 权威，progress 只是 hint；client lease 释放后才 detach。

**预期观察**：两者都能驱动/观察 session，但 wire shape、认证责任和生命周期完全不同。证据：`attachJsonlLineReader`、`ClientMessageDecoder`、`PiServer.accept`、`PiClient.acquireSession`。

## 明确安全边界与禁止误读

以下说法在当前源码中不成立：

1. “`--tools read,...` 就是沙箱。”——不成立；扩展、子进程和宿主环境仍是同一权限边界。
2. “project trust 等于批准后只允许安全操作。”——不成立；它是资源加载 gate。
3. “JSONL session 是可逆文件事务。”——不成立；它是 append-only tree；文件回滚需外部机制。
4. “TUI 截图证明模型/工具已完成。”——不成立；使用 authoritative session/RPC snapshot 和 `message_end`。
5. “server protocol 自带网络认证。”——不成立；listener 必须在 protocol bytes 前完成认证授权。
6. “Pi 默认已配置 OpenTelemetry exporter。”——未证实；当前能确认的是显式 telemetry API 与独立 install/update ping。
7. “docs 中 retainedTail 一定被当前 coding-agent 实现支持。”——存在 docs/source 不一致，应按当前 `SessionManager` 源码和兼容测试判定。

## 状态、不确定点与复核入口

**源仓状态**：`git status --short --branch` 为 `main...origin/main`，工作树干净；HEAD 为 `a470b121bf68`，本任务没有写入源仓，也没有运行 tests/build/真实模型。唯一产物是本文件。

**最值得在后续复核的不确定点**：

- coding-agent v3 `CompactionEntry` 与 `packages/agent/src/harness/*` 的 retainedTail/耐久 operation 设计是否会统一，当前不能从两套类型推断兼容。
- `@earendil-works/pi-server` README 明确实验性；应用侧的 runtime/storage/auth 实现不属于该包，部署前必须检查 listener 与 `PiServerService` 的实际实现。
- telemetry schema 的存在不等于 CLI 默认发 span；要证明端到端 tracing，需显式 adapter、transcript、provider request 和 exporter 证据。
- interactive/fullscreen 的可视行为需真实 terminal 或 `VirtualTerminal`/测试证据；本文只引用 renderer 的实现分支，没有宣称已做视觉验收。

**推荐复核路径**：先读 `packages/coding-agent/src/core/session-manager.ts`、`packages/coding-agent/src/core/agent-session.ts`，再读 `packages/coding-agent/src/core/extensions/types.ts`、`packages/coding-agent/src/modes/rpc/rpc-types.ts`；远程集成再读 `packages/protocol/src/schemas.ts`、`packages/server/src/server.ts`、`packages/client/src/client.ts`。这些路径是本能力地图的事实所有者。
