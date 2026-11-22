# OpenCode 内核图谱

源码坐标为 `anomalyco/opencode` 的 `dev` 提交 `73a0eae88de47f10068a0f9dc7a743638fa3d830`，提交日期为 2026-11-21（上游提交时区）。本地 `dev` 与 `origin/dev` 对齐。课程讲解该开发快照的会话主链路，版本化接口以固定提交的源码为准。[固定提交][rev]

## 00 课程入口

核心问题是「用户请求已被接收，下一次模型调用何时才有资格开始」。沿一条“在课程仓库中查找构建入口”指令追踪输入受理、交付、模型请求、工具运行、结果回注和空闲。先打开协议、受理、Runner 和 Step 四处入口。[Prompt 路由][route] · [受理][admission] · [Runner][runner] · [Step][step]

| 源码层 | 责任 |
|---|---|
| `packages/schema` / `packages/protocol` | 数据、事件和 HTTP 契约 |
| `packages/server` / `packages/client` | 契约处理器、实时流、生成式客户端 |
| `packages/core` | Session、执行协调器、位置服务、投影、工具和权限 |
| `packages/ai` | Provider 请求、协议编解码及统一模型事件 |
| `packages/cli` / `packages/tui` | 命令入口和交互表面 |

## 01 主循环与终止

1. `POST /api/session/:sessionID/prompt` 返回已受理的用户项。核心先发布 `session.inbox.enqueued`，投影写入 `session_inbox`，然后 advisory wake。传 `resume: false` 只受理。相同输入 ID、Session 和类型的重试沿用第一次受理，跨 Session 或类型冲突。[路由及负载][route] · [Session.prompt][admission] · [Inbox 受理及投影][inbox]
2. `SessionExecution` 按 Session ID 调度，进程内同会话显式 resume 可以加入已有执行，wake 可以合并。Runner 在该会话的 Location 加载服务，不同 Session 可以并发。[执行与放置][execution] · [协调器][coordinator]
3. `SessionRunner.drain` 到安全 Step 边界先处理控制项与 steering。用户输入默认 `steer`，可在当前执行的 Step 之间交付。普通 `queue` 等空闲边界，每次只交付一项，然后重新判定是否继续。入队和消息可见之间隔着 `session.inbox.delivered`。[边界控制][runner] · [促成交付][promotion] · [交付投影][projector]
4. 每个逻辑 Step 刷新历史和上下文，调用一次 `llm.stream`。底层可能因恢复或重试再发请求。模型流读到底，已发布的本地工具调用在各自 fiber 上运行，Step 等工具结算。Provider 托管调用由 Provider 执行。[流与本地工具][step]
5. `needsContinuation` 来自本地调用记录，且受 `toolChoice: none` 限制。普通成功无须续跑时，Runner 仍检查待交付输入、手动控制项及适用的 idle hook。无后续工作才结束 drain。`unknown`、输出截断、工具拒绝及中断各有分支。[续跑记录][continue] · [Step 结算][outcome] · [空闲边界][idle]

教学骨架省略 move、压缩、重试、取消及错误分支。方法名用于指认责任，代码为概念示意。

```ts
async function acceptPrompt(sessionID, input) {
  const admitted = await admitOrReuse(sessionID, input)
  if (input.resume !== false) await execution.wake(sessionID)
  return admitted
}

async function drain(sessionID) {
  let needsContinuation = false
  while (true) {
    const next = await advanceToStep(sessionID, needsContinuation)
    if (next.type === "complete") return

    const context = await loadContext(next)
    const outcome = await runStep(context)
    needsContinuation = outcome.needsContinuation
  }
}
```

**实验**　主循环步进机演示一次工具调用引发的第二个 Step。预判 `session.step.streamed` 与 `session.step.ended` 之间为什么仍可能处于审批状态。

## 02 客户端与服务器

默认 TUI 通过客户端连接解析使用托管本地服务。显式 `--server` 指向已有服务，`--standalone` 请求为本次命令启动私有服务。独立 `opencode serve` 支持 HTTP 和 STDIO 形态。客户端代码由 `packages/client` 从协议生成。[默认命令][tui] · [连接解析][connection] · [serve 命令][serve] · [生成接口][client]

非交互 `opencode run` 自己决定如何回复审批，并用 Session 数据与事件控制输出。ACP 适配器面向 IDE 等 ACP 客户端，内部通过服务客户端操作 Session。[非交互逻辑][headless] · [ACP 回合桥][acp]

**实验**　表面接线板。比较同一个已存在服务被 TUI、显式远端客户端、非交互任务和 ACP 访问时，展示、交互以及等待完成分别由谁负责。

## 03 会话与状态投影

- `GET /api/event` 是实时、易失的公共 SSE，首帧为 `server.connected`，服务端每 15 秒发心跳。消费者缓冲溢出会终止流，断线期间遗漏的事件需要其他数据面补足。[协议][eventroute] · [SSE handler][eventhandler] · [缓冲边界][feed]
- 持久事件按 aggregate 的 `seq` 放入 `event` / `event_sequence`，对应事务中的投影更新 `session_v2`、`session_inbox`、`session_message` 和 `session_part`。输入交付将待处理 Inbox 行移除并写入用户消息。事件定义和生命周期可以裁减已经失去用途的记录，`event` 表并非每次操作的永久审计日志。[表定义][eventsql] · [投影][projector] · [持久化与发布][bus] · [Inbox 投影][inbox]
- 文本 Delta 与权限 Asked/Replied 是瞬态事件。文本 Ended 收录正文，Step Ended 收录 finish、tokens 与成本并汇总用量。断线后可重新读取会话和 pending permission 快照，或通过实验性 `GET /api/experimental/session/:sessionID/log?after=N&follow=true` 从排他的 aggregate 序号恢复持久事件。该日志不包含瞬态 delta。[事件定义][eventschema] · [权限事件][permissionschema] · [投影用量][usage] · [实验日志契约][log]

**实验**　事件 → SQLite 投影台。依次发送受理、交付、Delta、Ended、Asked、Replied、Step Ended、执行完成。实验计数表示演示中哪些事件属于可持久类型，不模拟数据库精确行数、实时断线或历史裁减。

## 04 工具注册表

`SessionContext.select` 合并 agent/session 规则，根据模型和开关截取 `Tool.snapshot`。工具可直接公布、隐藏，或由 `execute` 的 Code Mode 目录间接触达。末条匹配规则若为资源 `*` 的 deny，可隐藏整类工具。资源级 deny 还要等真实调用给出文件或命令，再由工具断言。模型政策用具体模型 ID 选择 `patch` 或 `edit` / `write`，这三个工具共享 `edit` 权限。[快照输入][context] · [快照][tools] · [可见性谓词][disabled] · [模型工具策略][toolpolicy] · [Patch 注册][patch]

内建与插件工具进入同一注册体系。MCP 工具带命名空间，执行前单独进行权限断言。会话上下文 hook 可以编辑本次请求的定义，执行时也按本次可用的定义解析。[MCP 注册][mcp] · [请求整形与 dispatch][request]

**实验**　用模型和规则两个维度看 `patch` / `edit` / `write` 的可见性。再比较整体禁用和只禁止一个目录时，裁决发生在哪一层。

## 05 权限与审批

权限规则项为 `{action, resource, effect}`。每个资源使用末条匹配通配规则，缺省 `ask`。先合并 agent 与 session 配置并检查 deny，再纳入当前项目已保存的 allow，根据 `permission.evaluate` hook 和可选无人值守规则形成结论。[规则与裁决][permission] · [磁盘保存][saved]

工具的 `Permission.assert` 在 `ask` 分支创建进程内 Deferred 并发出 `permission.asked`。可以用 `/api/session/:sessionID/permission` 读取待批请求，在 `/:requestID/reply` 回复。 `once` 放行本次，`always` 只在该请求给出可保存资源时写项目级规则，再重评当前 Location 的待批项；配置产生的 deny 优先。 `reject` 级联同 Session、同来源消息的一批审批。带反馈的拒绝可转为模型收到的工具错误，无反馈的拒绝可中断本 Step。[等待与清理][assert] · [回复分支][reply] · [权限 API][permissionapi]

具体 shell 工具向权限层交付检查过的 action/resource，文件路径及外部目录也有各自检查。系统级隔离仍需由宿主执行边界提供。[Shell 检查][shell]

**实验**　矩阵使用显式教学规则，选择 action、基础规则、Session 覆盖和回复。对照资源与 action 相同的 allow/deny，观察顺序和已保存规则各自适用的范围。

## 06 上下文组装

`SessionContext.select` 取得 agent、工具完整快照与指令来源。合并顺序由通用前缀逐步接近会话，包含 Code Mode 目录、MCP 说明、引用、skills、machines、发现的指令、内建来源及 session entries。历史装载负责初始指令与后续历史更新。基础 system 使用 agent 自定义文本，缺省渲染内建 `system.txt`，只对已公布的 shell/write/edit 提供对应附加指导。之后生成历史消息，应用会话 hook，再构造模型请求。[指令来源和顺序][context] · [基础 System][system] · [baseTranscript][transcript] · [请求组装][request]

**实验**　分别选择默认、agent 自定义 system、工具变更，看哪些段能复用，哪些段由历史和本轮工具快照决定。

## 07 压缩与溢出

手动 `POST /api/session/:sessionID/compact` 受理为控制项，默认 steer，在安全边界执行。自动压缩根据当前请求的估计与模型可用输入窗口预留计算；已配置关闭 auto 时也关闭自动 overflow 恢复。若 Provider 在输出开始前拒绝上下文过长，Step 可以用已验证成功的 overflow 压缩重新构造请求。支持原生压缩的模型可保存模型相关的 native window，其他路径生成可移植摘要并保留近期上下文。历史重建以本次模型的兼容边界为准。[控制路由][compactroute] · [压缩分支][compaction] · [窗口计算][ceiling] · [历史边界][history] · [overflow 恢复][step]

实践题　如果切模型后输入量回升，比较压缩消息的 model/native 来源、新模型解析出来的兼容边界、以及实际请求的估计和 usage。

## 08 子代理

`subagent` 工具核对父 Session、沿 `parentID` 计算深度，校验 agent 模式，再以 agent ID 为资源走 `subagent` 权限。默认最大深度为 1，可通过 `experimental.subagent_depth` 调整。已存在的子 Session 必须属于调用者。新 child 带父 ID、agent 和模型，默认继承父 Location、显式会话权限和 metadata。子会话的模型优先级为显式覆盖、子 agent 配置、父模型。工具先受理 child 的 prompt，由后台 Job 启动/恢复执行并立即把 child ID 回给父 Step。完成后通过父 Inbox 交付 `<background-result kind="subagent">`，待提交 revert 时抑制唤醒。[深度][depth] · [检查与派生][subagent] · [父配置继承][inherit] · [受理和 Job][childjob] · [报告交付][report]

**实验**　在不同嵌套深度、最大深度与派生权限下检查是否能创建 child，再沿事件追踪后台结果回到父 Session。模拟父调用者权限，子代理后续的工具权限仍由 child 的配置在自身 Session 检查。

## 09 模型解析与传输

Runner 从 catalog 选择 Session 显式模型、agent 偏好或可用回退，解析模型 ID/variant 和路由。会话用 `@opencode/ai` 的 Effect `LLMClient.stream` 读统一事件，工具调用及下一 Step 由会话 Runner 驱动。模型支持会话 WebSocket 时可用该通道，必要时会降级到 HTTP。这个通道位于服务端和模型 Provider 之间。客户端上的 `/api/event` 仍是 SSE。[模型选择][model] · [AI API][ai] · [可选传输][transport] · [会话连接][ws]

**实验**　比较三种请求形状，从兼容编辑工具到模型传输，练习用模型 catalog、请求和规范化事件定位差异。

## 10 扩展生态

- **插件和钩子**　Location 插件注册服务和工具。上下文、模型请求和工具执行前后有各自钩子。服务端读路由按当时已加载的插件响应，执行 Runner 可在准备边界等待激活。[仓内约定][plugins] · [Runner 激活点][runner] · [请求钩子][request]
- **Skills 与指令**　指令进入上下文来源，显式技能输入在 prompt 准备时解析。检查技能可见性、选择和加载，分别看上下文和入口。[入口准备][promptprep] · [上下文来源][context]
- **命令与 MCP**　命令走独立 Session 命令缝，MCP 远端能力桥接到工具注册、执行和指令。直接 `/shell` 是本会话的一条 shell 命令入口，与模型在 Step 中发起工具调用是不同路径。[命令定义][command] · [命令及 shell 路由][commandroute] · [MCP 桥][mcp]

## 11 资源治理

- 配置 `agent.steps` 时，达到阈值后的请求追加收尾提示并设置 `toolChoice: none`。模型请求保留工具定义以维护缓存前缀，本地执行器也拒绝最终 Step 的工具请求。新输入交付会重置本轮 Step 计数。[Step 预算][budget] · [执行边界][step] · [交付重置][idle]
- 把 Provider 重试、输出续跑与服务器重启恢复分开调试。Provider 重试走政策与 hook，发布 `session.retry.scheduled`；连续三条 assistant 以 length 收尾会触发输出上限错误；本地执行 claim 支持崩溃/关停后有限恢复，终态或用户中断时释放。恢复标记只覆盖本地执行。Runner 会把旧历史中仍在 streaming 或 running 的工具调用结算为中断，外部工具的副作用仍需自行保证幂等。[重试政策][retry] · [输出截断][output] · [执行 claim][execution] · [恢复计数][restart] · [清理遗留调用][settle]
- 本地工具文本超出默认 2,000 行或 50 KiB 时可落入留存文件，返回截断文本与路径。阈值允许配置，实际模型上下文和磁盘留存是两个预算。[输出留存][tooloutput]

## 12 实践与面试

**从受理到完成排查**　记录 Session ID 与用户输入 ID。先读 Inbox，确认受理与交付；再核对 `session.step.started`、`session.step.streamed` 和终态。无工具结算时查 pending permissions，待重试时查 retry 时间。文本曾出现在 SSE 但重连消失时，查 durable `session.text.ended` 以及会话投影。[Inbox API][inboxapi] · [Step 和 Text 事件][eventschema] · [权限 API][permissionapi] · [重试][retry]

**平台接入题**　平台拥有自己的分析存储时，用 `aggregateID + seq` 给持久日志消费做去重，保留 Session 与 Location 关联。把 UI delta 和用量核算分别落到实时 SSE 与持久事实。实际模型输入还受压缩、工具/agent 配置和 hook 影响，重建时需要对照该步的请求装配。[持久日志][log] · [用量投影][usage] · [请求装配][request]

**无人值守题**　非交互运行先对照退出状态、权限回复策略、断线后的快照与 execution 终态。默认回覆带反馈的拒绝，自动批准模式回复 `once`，项目级 deny 仍按核心规则处理。生产数据保护应由工具授权、执行身份、文件挂载及网络策略各自约束。[非交互逻辑][headless] · [权限裁决][permission]

**实验**　症状定位器从无输出、审批过多、上下文偏差与换模型四种症状，各选第一个应查看的源码状态。

[rev]: https://github.com/anomalyco/opencode/commit/73a0eae88de47f10068a0f9dc7a743638fa3d830
[route]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/session.ts#L342-L362
[admission]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/session.ts#L153-L192
[inbox]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/inbox.ts#L299-L366
[runner]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/llm.ts#L63-L225
[step]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/step.ts#L119-L213
[execution]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/execution.ts#L83-L205
[coordinator]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/run-coordinator.ts#L121-L177
[promotion]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/inbox.ts#L470-L600
[projector]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/projector.ts#L1011-L1056
[continue]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/publish-llm-event.ts#L611-L625
[outcome]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/step.ts#L293-L335
[idle]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/llm.ts#L174-L224
[tui]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/cli/src/commands/handlers/default.ts#L40-L75
[connection]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/cli/src/services/server-connection.ts#L27-L65
[serve]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/cli/src/commands/handlers/serve.ts
[client]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/client/script/generate.ts
[headless]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/cli/src/run/noninteractive.ts#L68-L239
[acp]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/cli/src/acp/turn.ts
[eventroute]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/event.ts#L59-L73
[eventhandler]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/server/src/handlers/event.ts
[feed]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/server/src/event-feed.ts#L48-L83
[eventsql]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/event/sql.ts
[bus]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/bus.ts#L295-L445
[eventschema]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/schema/src/session-event.ts#L333-L440
[permissionschema]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/schema/src/permission.ts#L45-L58
[usage]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/projector.ts#L1085-L1128
[log]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/session.ts#L658-L677
[context]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/context.ts#L148-L225
[tools]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool.ts#L313-L420
[disabled]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool.ts#L497-L503
[toolpolicy]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool/model-policy.ts
[patch]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool/plugin/patch.ts#L53-L80
[mcp]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool/mcp.ts#L43-L83
[request]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/model-request.ts#L276-L477
[permission]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/permission.ts#L102-L238
[saved]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/permission/saved.ts
[assert]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/permission.ts#L257-L316
[reply]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/permission.ts#L334-L395
[permissionapi]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/permission.ts#L114-L160
[shell]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/shell/permissions.ts
[system]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/system-prompt.ts
[transcript]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/model-request.ts#L111-L140
[compactroute]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/session.ts#L444-L459
[compaction]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/compaction.ts#L298-L337
[ceiling]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/compaction.ts#L1120-L1174
[history]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/history.ts#L188-L307
[depth]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/subagent-depth.ts
[subagent]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool/plugin/subagent.ts#L101-L186
[childjob]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool/plugin/subagent.ts#L187-L223
[report]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/execution/subagent-report.ts#L72-L130
[model]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/model.ts#L88-L127
[ai]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/ai/README.md
[transport]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/model-request.ts#L412-L442
[ws]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/model-transport.ts#L300-L356
[plugins]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/AGENTS.md#plugin-loading
[promptprep]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/prompt.ts#L34-L90
[command]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/command.ts
[commandroute]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/session.ts#L365-L443
[budget]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/llm.ts#L237-L283
[retry]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/retry.ts
[output]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/llm.ts#L329-L386
[restart]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/execution/restart.ts#L38-L114
[tooloutput]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/tool-output.ts#L13-L106
[inboxapi]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/protocol/src/groups/session.ts#L545-L584
[inherit]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session.ts#L296-L322
[settle]: https://github.com/anomalyco/opencode/blob/73a0eae88de47f10068a0f9dc7a743638fa3d830/packages/core/src/session/runner/llm.ts#L390-L443
