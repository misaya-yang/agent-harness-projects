# OpenClaw 系统课 · 源码讲义

本课程以本地 OpenClaw HEAD `3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd` 为基线，包版本为 `2026.11.6`，许可证为 MIT。Node 支持范围是 24.16.0 至 25 之前，或 26.1.0 及以上。以下源码入口与文档固定到该快照，数值是该快照的默认值或代码上限。部署的有效配置需从部署本身读取。 [本次提交][commit] · [包信息][package] · [Node 引擎约束][node]

教学主线是用事件定位执行所有者。Gateway 持有会话、策略和投递状态，输入按会话准入，模型执行可以在不同 harness 或位置运行。已经提交的转录、运行标记、自动化定义和投递回执让工作能跨进程和跨天延续。

```text
通道消息 / 到期 automation / 恢复输入 / 子代理完成
  → 会话 mailbox 选取输入 → 并发与执行位置准入
  → 选模型、凭证和 harness
  → 内置路径：attempt → logical prompt → 模型回合与工具批
  → 转录和投递各自提交 → 等待下一次工作
```

## 01 · 三层循环

在内置 `openclaw` runtime 路径，`runPreparedEmbeddedLoop` 管 attempt 重试、凭证轮换与模型回退。一次 attempt 内，`runAgentPrompt` 管一条逻辑请求的 prompt 和 continue。再往内，`runLoop` 的内圈消费工具调用与待注入输入，外圈也检查 follow-up 队列。打开三层循环步进器时，先认出内核事件 `agent_start`、`turn_start`、`turn_end`、`agent_end`，再用会话事件定位结束分支。实验中的中间站名用于标出教学步骤。 [外层 run][run] · [会话续跑][prompt] · [内置内核][loop]

## 02 · 插话与收束

Steering 在检查点进入活跃回合。顺序批允许首个可执行调用先启动，其余尚未开始的调用可被 steering 跳过，并记录配对结果。已启动调用走完其生命周期，并行批不会因 steering 跳过调用。Follow-up 在自然停点处理，另起请求仍由会话准入决定。 [队列语义][queue] · [工具批检查点][tool-groups]

会话层在 `agent_end` 后依次检查 handoff、中止或缺少消息、自动重试、重试结束、压缩和排队消息。成功响应后的排队输入可以续跑，仍为错误的响应由执行所有者处理。会话结束时发出 `agent_settled`，移交出口发出 `agent_handoff`。会话层的 `retryCount` 与外层 attempt 预算各自维护，`prepareRetry` 应用指数退避，并尊重短期限流响应的等待建议。 [收束裁决][post-run] · [重试处理][session-retry]

## 03 · 持久会话与重启恢复

| 存储 | 当前快照 |
| --- | --- |
| 共享状态 `state` | schema 41，默认 SQLite 路径 `<state-root>/state/openclaw.sqlite` |
| 每代理 `agent` | schema 43，默认 SQLite 路径 `<state-root>/agents/<agentId>/agent/openclaw-agent.sqlite`，包括会话与转录 |
| 可选 PostgreSQL | `state`、`agent`、`workboard`、`logbook`、`team-reports` 可按家族选择。配套路径保留本地 SQLite 锚点，与服务器数据共同构成恢复单元 |

状态图里的 leaf 表示被选中的转录分支。压缩替换模型读取的上下文投影，历史由归档与保留策略治理。重启需要另查持久执行事实。 [数据库注册表][db-engines] · [共享库路径][state-path] · [代理库路径][agent-path] · [存储布局][db-layout] · [PostgreSQL 运行手册][pg-guide]

- 正常关停为运行中的合格根会话写标记，保留本次关停捕获的已接收排队消息身份。恢复时重新核验当前权限，随后按 FIFO 重新投递这些输入。 [关停写标记][restart-persist] · [会话文档][session-doc]
- 崩溃或 SIGKILL 可能没有关停标记。启动流程查找缺失运行所有者的持久非终态身份，为可恢复根会话送入一条检查现有文件、任务和外部动作的系统输入。子会话、Cron 和 ACP 各由自己的生命周期负责。 [孤立运行判定][restart-orphan] · [恢复入口][restart-resume]
- 输出已送达但回执未知时保留不确定性。状态投影台中保留的计数仅代表教学示例的已提交事实。 [恢复后保留项][restart-doc]

## 04 · Cache、Compaction、Replay 与 Memory

| 机制 | 查什么 |
| --- | --- |
| Cache | 对比相邻请求的稳定前缀，用 provider 的缓存使用量确认命中。 |
| Compaction | 查新摘要边界、保留尾部与下一次请求估算。 |
| Replay | 查被选中的转录分支、已接收入参以及还未确认的外部效果。 |
| Memory | 查长期事实来自哪个文件或索引，随后按需使用 `memory_search` / `memory_get`。 |

Memory Core 使用全文与向量混合检索，SQLite 和合格 PostgreSQL 都可承载索引。两种引擎的文本排名实现不同。启动日记预载的默认示例为近 2 天，每份 1,200 字符、总计 2,800 字符，均可配置。 [稳定请求前缀][cache] · [检索工具][memory-tools] · [PostgreSQL 搜索][memory-pg] · [日记预载][startup-context]

内置 Dreaming 默认开启，调度表达式默认 `0 3 * * *`。Light、REM 和 Deep 组织来源、提炼及晋升，定时整理与请求中的检索各有入口。启用状态、调度器和 ambient owner 共同决定是否能建立作业。 [Dreaming 默认配置][dreaming-code] · [阶段和调度][dreaming-doc]

## 05 · 唤醒与自动化

- **通道消息。** 按会话路由与准入策略投递到新回合、排队或 steering。 [队列语义][queue]
- **Automations。** `automations` 是模型侧工具名，`cron` 保留为兼容别名。持久作业到点后由调度器选择当次执行，支持 agentTurn 与独立的 command/script 等作业类型。默认墙钟为 agentTurn 60 分钟、其它作业 10 分钟，适用类型可显式配置。 [工具名称][automation-tool] · [调度器][cron] · [作业超时][cron-timeout]
- **Proactive check。** 独立 Heartbeat 已退役，Doctor 将旧配置、历史与支持的 `HEARTBEAT.md` 内容迁入普通作业。首次设置生成的巡检默认禁用，启用后初始节奏通常是每 30 分钟，在主会话空闲时执行。 [迁移与首次设置][heartbeat-doc] · [默认作业][proactive]
- **Standing intent。** 在符合条件的用户回合由 `before_prompt_build` 调用关键词匹配，命中后 prepend 到当前上下文。默认冷却 24 小时、触发 3 次、有效期 90 天，可在登记时设定。 [prompt 钩子][intent-hook] · [匹配实现][intent-match] · [默认限量][intent-default]
- **WebSocket tick。** Gateway 周期广播，客户端据此观察连接活性。它属于连接维护事件。 [tick 广播][tick]

## 06 · 重试预算与重放条件

外层 attempt 配额是 `clamp(24 + 8 × max(1, profileCandidateCount), 32, 160)`。`beginRunAttempt` 增加派发与计入数，`recordRunRetry` 对 `progress_continuation` 退回一个已计入 attempt。完成的模型响应将计入数重置为 1，保留当前 attempt 的失败尾部。部分输出和纯工具续跑不足以重置这本账。 [预算公式][run-budget-max] · [预算记账][run-budget] · [完成响应信号][run-progress]

同模型瞬时重试采用有抖动的指数退避。限流常规默认上限为 16 次 attempt 含首次，在 provider 限时、共享 TPM 回退窗口、预留 fallback 机会和重放安全约束下可以更早停。分类、等待、凭证轮换和 fallback 都是显式分支。重放前按状态和回执查已发送、已启动或可能完成的动作。 [同模型失败恢复][run-failover] · [运行预算检查][run]

48 小时是默认 agent 墙钟，`0` 使用无限时长哨兵值。首个有效输出前连续空闲超时断路器的阈值是 5。作业墙钟、会话重试次数与 attempt 配额独立。 [墙钟解析][agent-timeout] · [空闲断路器][idle-breaker]

## 07 · 上下文压缩

内置路径可在请求前预检，也可以在超阈值后维护，或对 overflow 做压缩再试。会话拥有溢出恢复时上限为 3，外层恢复路径可接手。阈值式维护用摘要和近期尾部准备将来的模型调用。原子切点须保留 tool call/result 的配对，文件修改状态可从结构化工具结果提取。 [会话压缩][compact] · [外层溢出恢复][outer-compact] · [压缩细节][compact-doc]

Context engine 通过 bootstrap、assemble-before-prompt、after-turn、maintain、compact 等宿主能力插入不同生命周期。Codex app-server 的主线程与原生压缩由 Codex 拥有，Gateway 负责相应投影与维护。 [宿主能力枚举][context-types] · [运行时归属][runtime-owner]

## 08 · 工具执行与重复守卫

`executeToolCalls` 解析工具声明并确定并行或串行，工具开始前执行策略与 hook，失败可转成模型可以读的工具结果。工具目录可以保持稳定，入口仍按当前回合权限执行检查。符合条件的异步工具在模型流的 `toolcall_end` 后就可派发，先等待相应转录片段提交。 [工具派发][tools] · [工具入口守卫][tool-policy] · [流式异步工具][stream-tools]

现行重复守卫默认开启。它以连续的工具名称与规范化参数为键，第 3 次执行并提示，第 20 次在执行前拦截并以 `tool_repeat_limit` 停止回合。换调用或新用户输入会重置；未注册工具按名称计数，声明 `repeatable` 的轮询可以豁免。旧的 10/20/30 阈值、结果比较与独立压缩后守卫已从现行配置退役。 [守卫实现][repeat] · [宿主开关][repeat-default] · [重复守卫配置与诊断][repeat-doc]

## 09 · Gateway、运行时与执行位置

Gateway 持有会话与通道状态。WebSocket 客户端在 connect 阶段提供角色和作用域，设备节点声明能力与命令。Gateway 连接默认回环地址 `127.0.0.1:18789`，TUI 也有进程内后端。内置、CLI 和 Codex 经同一物理会话 mailbox 序列化，再争取并发容量。 [Gateway 架构][gateway] · [连接握手][handshake] · [会话 mailbox][mailbox]

模型级 `agentRuntime.id` 覆盖 provider 级，内置 id `openclaw` 仍接受旧别名 `pi`。插件可注册 `codex` 等 harness，`auto` 按有效路由决定。隐式 Codex 选择要求精确官方 HTTPS Responses 路由且没有自定义请求行为。Gateway 发布所需的模型运行时快照，执行中的嵌套工作固定同一代选择。 [模型运行时策略][runtime-policy] · [运行时快照与选择][runtime-architecture]

配置云执行时，OpenClaw `worker-turn` 的回合循环在云 worker，模型请求经 Gateway；Codex `remote-exec` 的 app-server 在 Gateway，命令和工作区可在远端。两种方式仍由 Gateway 持有转录与工具权限。 [执行位置表][cloud]

## 10 · 工具阻断与宿主审批

`tools.exec.mode` 支持 deny、allowlist、ask、auto、full，宿主按执行位置及生效策略裁决。需要审批时由 Gateway 持有审批对象，配置允许的 Control UI、伴生应用或通道集成可送达请求。缺少决议或无法抵达时默认拒绝。批准后仍由执行所有者复核当前策略和请求参数绑定。启用严格内联检查时，解释器调用受单独策略约束。 [exec 策略与审批流程][approval-doc] · [审批管理器][approval-manager] · [Telegram 审批适配][telegram-approval]

教学闸门链展示已配置且有可达审批人的情形。工具层 hook 的阻断与宿主 exec 审批异常各有结果路径。需要收集用户答案的 `ask_user` 有独立的问答生命周期。 [工具钩子合同][tool-hooks] · [问答工具][ask-user]

## 11 · 子代理与组织能力

`accepted` 表示子会话启动请求被接收。父会话可能在准备或运行，也可能已让渡。交付由子代理终态触发，父转录提交结果时会持久记录 `requesterDelivery.state = "consumed"`。等待接收的结果可在恢复后再安排，已提交的材料可被下一次 turn 读取。若对用户仍欠公开回复，出站送达拥有单独的结果或歧义状态。 [结果送达与接收确认][announce]

默认最大深度 5、每父会话活跃子代理上限 5、普通子 run 并发 8。操作子任务前核验当前控制权与实际执行实例。插件提供能力，Skill 描述工作流，`SOUL.md` 提供人格指令。 [配额常量][child-limits] · [嵌套与配额][nesting] · [子代理控制所有者][subagent-control] · [工作区资源][workspace]

## 12 · 从症状到可观察证据

1. **定位执行层。** 从 Gateway、会话 mailbox、attempt、模型和工具、投递或存储里找故障所在的边界。
2. **对照最后的确认事件。** 在重启案例记录运行标记、恢复输入、有无未决外部动作。在子代理案例记录 terminal、父转录 consumed 和最终送达。
3. **核对预算所有者。** 区分会话重试、attempt、非输出 idle、作业墙钟与模型上下文预算。
4. **核对可重复性。** 检查外部消息、文件、自动化或已接收的 spawn 是否已生效。对重复工具先查 `tool.loop` 与 `tool_repeat_limit`。
5. **重现最小分支。** 用九个交互实验核对判断，再用相应会话、作业和出站记录验证真实部署。 [重启诊断][restart-doc] · [重复工具日志][repeat-doc] · [版本说明][release]

[commit]: https://github.com/openclaw/openclaw/commit/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd
[package]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/package.json#L1-L17
[node]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/package.json#L2581-L2583
[run]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run-loop.ts#L211-L263
[prompt]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/sessions/agent-session-prompting.ts#L116-L148
[loop]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/agent-loop.ts#L147-L214
[queue]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/queue.md
[tool-groups]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/agent-loop.ts#L598
[post-run]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/sessions/agent-session-prompting.ts#L194-L223
[session-retry]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/sessions/agent-session.ts#L342-L396
[db-engines]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/infra/database-engine/registry.ts#L23-L61
[state-path]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/state/openclaw-state-db.paths.ts#L32-L41
[agent-path]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/state/openclaw-agent-db.paths.ts#L22-L41
[db-layout]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/reference/database-schemas/layout.md
[pg-guide]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/gateway/postgresql.md
[restart-persist]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/gateway/session-restart-resume.ts#L65
[restart-orphan]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/gateway/session-restart-resume-discovery.ts#L182-L202
[restart-resume]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/gateway/session-restart-resume.ts#L286
[session-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/session.md#gateway-restart-recovery
[restart-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/gateway/restart-recovery.md
[cache]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/reference/prompt-caching.md
[memory-tools]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/extensions/memory-core/src/tools.ts#L215
[memory-pg]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/memory.md#postgresql-memory-search
[startup-context]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/auto-reply/reply/startup-context.ts#L169-L189
[dreaming-code]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/memory-host-sdk/dreaming.ts#L245
[dreaming-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/dreaming.md
[automation-tool]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/tools/automations-tool-name.ts
[cron]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/cron/service/scheduler-actor.ts#L335
[cron-timeout]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/cron/service/timeout-policy.ts
[heartbeat-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/gateway/heartbeat.md
[proactive]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/cron/default-proactive-job.ts#L26
[intent-hook]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/extensions/memory-core/index.ts#L375-L414
[intent-match]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/extensions/memory-core/src/standing-intents-kernel.ts#L191-L247
[intent-default]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/extensions/memory-core/src/standing-intents-model.ts#L1-L3
[tick]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/gateway/server-maintenance.ts#L369-L372
[run-budget-max]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run/helpers.ts#L52-L63
[run-budget]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run/retry-budget.ts#L13-L32
[run-progress]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run-loop.ts#L382-L385
[run-failover]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run/failover-retry-controller.ts
[agent-timeout]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/timeout.ts#L13
[idle-breaker]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run/idle-timeout-breaker.ts
[compact]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/sessions/agent-session-compaction.ts#L493-L586
[outer-compact]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/embedded-agent-runner/run/overflow-context-recovery.ts#L324
[compact-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/compaction.md
[context-types]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/context-engine/types.ts#L59
[runtime-owner]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/agent-runtimes.md#runtime-ownership
[tools]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/agent-loop.ts#L470
[tool-policy]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/agent-tool-availability.ts#L82
[repeat]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/tool-repeat-guard.ts#L12-L70
[repeat-default]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/agent-scope.ts#L260-L264
[repeat-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/tools/loop-detection.md
[gateway]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/architecture.md
[handshake]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/gateway/protocol/handshake.md
[mailbox]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/sessions/session-controller.mailbox-dispatch.ts#L52
[runtime-policy]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/model-runtime-policy.ts#L277
[runtime-architecture]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/agent-runtime-architecture.md#runtime-selection
[cloud]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/gateway/cloud-workers.md#what-runs-where
[approval-doc]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/tools/exec-approvals.md
[approval-manager]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/gateway/exec-approval-manager.ts#L64
[telegram-approval]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/extensions/telegram/src/approval-native.ts
[tool-hooks]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/types.ts#L49
[ask-user]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/tools/ask-user-tool.ts#L485
[announce]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/tools/subagents/announce.md
[nesting]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/tools/subagents/nesting.md
[subagent-control]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/agents/subagents/registry/subagent-registry-execution-cleanup.ts#L222
[workspace]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/concepts/agent-workspace.md
[release]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/releases/2026.11.6.md
[stream-tools]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/packages/agent-core/src/agent-stream-response.ts#L451-L490
[child-limits]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/src/config/agent-limits.ts#L20-L24
