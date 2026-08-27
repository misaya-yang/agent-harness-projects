# OpenCode 内核图谱 · 课程素材

> 本文件是教学站“OpenCode 课程”的事实底稿。全部结论来自本地 checkout 源码研读，
> 标注 [源码确认]（读到实现）/ [合理推断]（结构推断）/ [文档声明]（README/注释）。

## 0 身份卡

| 项 | 值 |
|---|---|
| 上游仓库 | `https://github.com/anomalyco/opencode`（`git remote -v` 实测 [源码确认]；历史上广为人知的 `sst/opencode` 即此项目，org 已迁移） |
| 官网 / 分发 | opencode.ai；npm 包 `opencode-ai`；brew tap `anomalyco/tap`（README.md [文档声明]） |
| Commit | `754bb7e`（754bb7e3903d…，2026-08-24T04:00:55-04:00） |
| 技术栈 | Bun 1.3.14 workspace + Turbo monorepo，TypeScript；Effect（v2 重构层）+ Vercel AI SDK（主流式运行时）；约 30 个包（packages/core、opencode、tui、server、sdk、plugin、llm、schema、codemode…）[源码确认] |
| 许可 | MIT（LICENSE，Copyright (c) 2025 opencode）[源码确认] |
| 定位一句话 | 终端优先的开源 AI coding agent：一个本地 HTTP 服务器承载 agent 内核，TUI/CLI/IDE/GitHub/桌面全部是它的客户端 |

**Hero thesis（本课主论点）**：OpenCode 把“服务器即内核”当作第一公民——`opencode` 启动时 TUI 与 agent server 同进程但跨边界对话（in-worker HTTP + RPC 事件流），`POST /session/:id/message` 是唯一喂脑入口，`GET /event`（SSE）是唯一广播出口；而内核主循环 `runLoop` 的终止判定只有一条规则：**最后一条 assistant 消息已正常收尾且没有待处理的工具调用**。所有花哨能力（压缩、子代理、权限审批、回退）都被表达为这个循环的输入或事件，而不是循环之外的旁路。

---

## 1 源码路线（SOURCE ROUTE）

| # | 入口 | 回答的问题 |
|---|---|---|
| 1 | `packages/opencode/src/session/prompt.ts` · `runLoop`（:1081-1341）| 一个用户回合如何展开成 N 个 step？循环凭什么停下？ |
| 2 | `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`（:95）+ `groups/event.ts`（:9-14）+ `handlers/event.ts`（:24-78）| 所有客户端（TUI/SDK/Action）如何进入同一个大脑、如何收广播？ |
| 3 | `packages/opencode/src/tool/registry.ts`（:231-303）+ `session/tools.ts`（`resolve` :41-121）| 工具清单如何按模型/agent/权限三层过滤后交给 LLM？ |
| 4 | `packages/opencode/src/session/overflow.ts`（:8-34）+ `compaction.ts`（触发/摘要/tail/prune）| 上下文快爆时，内核是丢消息、报错还是自己给自己喂摘要？ |

辅助入口：`cli/cmd/tui.ts` + `cli/tui/worker.ts`（进程拓扑）、`permission/index.ts`（审批阻塞）、`agent/agent.ts`（内建 agent 表）、`core/src/session/projector.ts`（事件→SQLite 投影）。

---

## 2 核心执行链

```
用户键入 / `opencode run` / GitHub Action / Zed(ACP)
        │  SDK: createOpencodeClient(baseUrl)          packages/tui/src/context/sdk.tsx:1
        ▼
POST /session/:id/message ── 或默认 `opencode` 时经 Bun Worker 内 in-process fetch（不占 TCP 端口）
        │  server.ts:68 OpenApi.fromApi(PublicApi)      cli/tui/worker.ts:31,42 [源码确认]
        ▼
SessionPrompt.prompt()          prompt.ts:1052   revert.cleanup → createUserMessage → sessions.touch
        ▼
createUserMessage()             prompt.ts:635    落 user 消息（agent/model/variant/parts 解析，文件/MCP resource→synthetic parts）
        ▼
loop() → run-state.ensureRunning()   prompt.ts:1343 / run-state.ts:88   同 session 单飞，忙则 BusyError
        ▼
┌─ runLoop(sessionID)  while(true) ──────────────────────────────── prompt.ts:1088 ─┐
│ ① status.set busy                                                    :1089          │
│ ② msgs = MessageV2.filterCompacted(sessionID)  从摘要后重建历史       :1092         │
│ ③ 终止判定：lastAssistant.finish ∉ {tool-calls,unknown}              :1111-1130    │
│      且无未处理 tool part 且 parentID==lastUser  → break                            │
│ ④ step++；step==1 异步 spawn title agent 起标题                       :1132-1139    │
│ ⑤ 任务分流：subtask→handleSubtask(:1144)；compaction→process(:1149)  │             │
│ ⑥ 预检 overflow → compaction.create(auto) 然后 continue               :1161-1168    │
│ ⑦ agent 解析 + maxSteps(agent.steps) + SessionReminders.apply        :1170-1184    │
│ ⑧ 建空 assistant 消息（cost/tokens 零值）updateMessage                :1186-1201    │
│ ⑨ processor.create(handle)                                           :1213         │
│ ⑩ SessionTools.resolve：registry.tools(模型过滤) ∪ MCP ∪ 自定义，     :1226         │
│      每个 execute 内嵌 ctx.ask(permission)  tools.ts:92-121          │             │
│ ⑪ system = env + AGENTS.md/instructions + <mcp_instructions>         :1257-1269    │
│      + <available_skills>   （agent.prompt 存在则整体替换基础 prompt） system.ts:27 / request.ts:55 │
│ ⑫ handle.process → llm.ts：AI SDK streamText(:280)（native @opencode-ai/llm         │
│      仅 OPENCODE_EXPERIMENTAL_NATIVE_LLM 且 supported 时 :227-250）  │             │
│ ⑬ processor 逐 LLMEvent 消费：text-delta/reasoning→updatePartDelta；               │
│      tool-call :331（doom-loop 检测 :356-380）→ 工具执行→tool-result :383；         │
│      step-finish :435 写 usage/cost + isOverflow→needsCompaction                   │
│ ⑭ outcome：error/结构化输出→break；"compact"→compaction.create        :1319-1328   │
└────── continue 回到 ①（step 计数，直到 break）──────────────────────────────────────┘
        ▼
break 后：compaction.prune（异步）:1338 → lastAssistant 返回
        ▼
status idle → Event.Idle（status.ts:42-43）→ EventV2 → GlobalBus（event-v2-bridge.ts:34-59）
        → SSE /event、/global/event 广播给所有客户端；写路径全程为
          updateMessage/updatePart → events.publish → projector 落 SQLite（core/session/projector.ts:260-318）
```

**回合终止的完整证据**：正常终止 = ③ 判定 break；异常终止 = provider 错误重试耗尽（retry.ts policy）或用户 abort（`POST /session/:id/abort`）；资源终止 = `agent.steps` 用尽时注入 `MAX_STEPS_PROMPT` 假消息（prompt.ts:1281 + core/session/runner/max-steps.ts，禁工具、要求文本总结）[源码确认]。

---

## 3 十二章规划

### 00 课程入口 · COURSE ENTRY
**h2**：一个 `curl` 就能驱动这个 agent，因为它本来就是服务器。
lede：OpenCode 默认形态是终端，但终端只是壳。本章建立全局地图：进程拓扑、四包分工（opencode 内核 / server 协议 / tui 前端 / sdk 生成件）、以及贯穿全课的 `runLoop` 终止判定。
- 事实1：CLI 注册 22 个子命令（acp/mcp/tui($0)/attach/run/serve/github/pr/session/db…），`index.ts:81-103` [源码确认]
- 事实2：默认 `opencode` = 主线程跑 TUI（@opentui + Solid），Bun Worker 线程跑 HTTP app，`app.fetch(request)` 进程内调用（`cli/tui/worker.ts:31,42`）[源码确认]
- 事实3：事件出口 SSE：`GET /event`、`/global/event`，`text/event-stream` + 10s heartbeat（`handlers/event.ts:24-78`）[源码确认]
- 实验：**surface-switchboard**

### 01 主循环与终止 · THE EXIT TEST
**h2**：循环没有"完成检测器"，只有"无话可续"证明——最后一条 assistant 消息不带待处理工具调用，就是回合的终点。
lede：`runLoop` 是一个朴素的 `while(true)`。本章逐步拆解 14 个环节，重点在 :1111-1115 的终止三条件合取，以及 `hasToolCalls`（:1106-1109）对"provider 谎报 stop"的防御——孤儿中断工具不阻断退出，只先打告警（:1116-1127）。
- 终止三条件：`finish ∉ {tool-calls, unknown}` ∧ `!hasToolCalls` ∧ `lastAssistant.parentID === lastUser.id`，三条合取即 break（prompt.ts:1111-1115）；`hasToolCalls` 只数非 providerExecuted、非孤儿中断的 tool part（:1106-1109），存在孤儿时照样退出但先打 `loop exit with orphaned interrupted tool` 告警（:1116-1127）[源码确认]
- 每轮先 `filterCompacted` 重建历史（message-v2.ts:521-578），压缩对循环透明 [源码确认]
- step==1 时并行 fork title agent 起标题、summary 统计 diff（prompt.ts:1133,1252）[源码确认]
- 同 session 串行靠 `ensureRunning` + `RunnerBusy`（run-state.ts:88-107）[源码确认]
- 实验：**loop-stepper**

### 02 客户端与服务器 · ONE SERVER, EVERY SURFACE
**h2**：TUI 与内核之间隔着一次"假装的 HTTP"——in-worker fetch 让本地模式与远程模式共享同一条协议。
lede：`opencode serve` 起真 HTTP；默认 TUI 模式把同一个 app 塞进 Bun Worker，用 RPC 转发 fetch 和 `global.event`，不占 TCP 端口。SDK 由 OpenAPI 代码生成（hey-api），保证客户端与契约同源。
- 端点：`POST /session/:id/message`、`/prompt_async`、`/abort`、`/fork`、`/revert`、`/command`、`/shell`（routes/instance/httpapi/groups/session.ts:78-105）[源码确认]
- WS 仅用于 PTY 终端流（groups/pty.ts:116-168），事件一律 SSE [源码确认]
- `--attach` 远程连接、`OPENCODE_SERVER_PASSWORD` 缺省无鉴权警告（cli/cmd/serve.ts:7-20）[源码确认]
- 实验：**surface-switchboard**

### 03 会话与状态投影 · EVENTS PROJECT TO SQL
**h2**：写路径不是"存数据库"，而是"发事件"——SQLite 行是事件流的投影副产品。
lede：Session/Message/Part 三层 schema 齐全（含 cost、tokens.cache、parentID、revert、share）。内核只 publish `MessageUpdated`/`PartUpdated`，projector 落库，share 同步订阅同一事件流增量推送。
- 存储：`~/.local/share/opencode/opencode.db`——仅 latest/beta/prod 通道，其余通道落 `opencode-<channel>.db`（database.ts:48-55，可用 `OPENCODE_DISABLE_CHANNEL_DB` 关闭），V1 JSON storage 仅剩 `session_diff` 写入（revert.ts:77）[源码确认]
- Session.Info 含 `parentID` 会话树、`fork()` 复制消息前缀（session.ts:691-711）[源码确认]
- Part 12 变体：text/subtask/reasoning/file/tool/step-start/step-finish/snapshot/patch/agent/retry/compaction（schema/src/v1/session.ts:357-370）[源码确认]
- 回退靠独立 git-dir 快照：`snapshot/<projectID>/<hash(worktree)>`，track/restore/revert 用 `--git-dir`（snapshot/index.ts:70-75,388,427）[源码确认]
- 实验：**state-projection**

### 04 工具注册表 · TOOLS AS FILTERED VIEWS
**h2**：模型看到的工具清单，是注册表被"模型家族、agent 白名单、权限"三把刀各削一刀之后的残影。
lede：17 个内建工具 + MCP + 自定义 JS/TS 文件 + 插件注册，汇入 `registry.tools()`。最惊人的细节：GPT 系新模型只给 `apply_patch`、隐藏 `edit`/`write`——工具视图按模型行为特性定制。
- 工具=Effect Schema decoder + execute + 编译期 import 的 `.txt` 描述（tool/tool.ts:99-169）[源码确认]
- `usePatch = modelID.includes("gpt-") && !oss && !gpt-4`（registry.ts:297-300）[源码确认]
- MCP 工具命名 `sanitize(server)_sanitize(tool)`，调用前强制 `ctx.ask`（mcp/catalog.ts:117-119 + tools.ts:408）[源码确认]
- 输出截断 2000 行 / 50KB，超限全文落盘并回 `outputPath`（tool/truncate.ts:12-15,78-81）[源码确认]
- 参数解码失败不抛异常，而是回一个模型可读的"请重写输入"错误（tool.ts:24-34 InvalidArgumentsError）[源码确认]

### 05 权限与审批 · DEFERRED AS APPROVAL
**h2**：一次审批 = 一个挂起的 Deferred + 一条 SSE 事件：阻塞的不是进程，是 Effect 纤绳。
lede：`permission.ask()` 把请求挂进 pending、publish `permission.asked`，工具执行纤在此处 await；任意客户端（TUI 弹窗、CLI `--yolo`、远端 HTTP reply）都可解开。规则匹配用 `findLast`——越靠后的规则越优先，默认动作是 `ask`。
- Rule{permission,pattern,action}，Reply once/always/reject（schema/src/v1/permission.ts:16-38）[源码确认]
- `evaluate()` flat().findLast + 双通配（permission/index.ts:28-37）；ask 阻塞/级联拒绝 pending（:67-165）[源码确认]
- bash 用 tree-sitter 解析命令提取 pattern，`arity.ts` 决定 always 规则的 token 前缀粒度（tool/shell.ts:257-291,378-411）[源码确认]
- 子代理权限派生：只继承父 deny 与 external_directory，allow 不继承，默认禁 `task`/`todowrite`（agent/subagent-permissions.ts:14-27）[源码确认]
- 实验：**decision-matrix**

### 06 上下文组装 · SYSTEM IS ASSEMBLED
**h2**：system prompt 不是一份文案，而是五个供应者在每次 step 现场拼装的产物。
lede：基础 prompt 从 14 个内嵌 `.txt` 中选一——`provider()` 实走 9 个家族分支（claude→anthropic.txt，gpt-4/o1/o3→beast.txt；plan/build-switch 等 5 个由 reminders.ts 用作回合提醒），叠加 `<env>` 块、AGENTS.md 指令链、`<mcp_instructions>`、`<available_skills>`；agent.prompt 可整体替换基础段。
- `SystemPrompt.provider(model)` 字符串分支选择（session/system.ts:27-49）[源码确认]
- AGENTS.md：全局 `~/.config/opencode/` + 项目 findUp 首个命中即停 + config.instructions glob/URL（session/instruction.ts:61-65,122-168）[源码确认]
- 拼装点：prompt.ts:1257-1269；最终段序 `[agent.prompt|基础, ...env, ...instructions, mcp?, skills?]`（llm/request.ts:55-65）[源码确认]
- `experimental.chat.system.transform` 插件钩子可改段（request.ts:68-73）[源码确认]

### 07 压缩与溢出 · COMPACT THEN CONTINUE
**h2**：OpenCode 把"上下文满了"实现成循环里的一种任务类型，而不是一个异常。
lede：三处检测（每步 usage 后、ContextOverflowError、prompt 前预检）都归结为 `needsCompaction`；压缩生成一条 `mode:"compaction"` 的 assistant 摘要消息，保留最近 tail turns，然后自动注入"Continue…"合成消息续跑。
- 阈值：`isOverflow` 先被 `compaction.auto === false` 与 `context === 0` 短路；计数取 `tokens.total ||` input+output+cache.read+cache.write，≥ usable 才压缩（usable = input 上限 − reserved，缺省 min(20k, maxOutput)；无 input 上限时兜底 context − maxOutput）（overflow.ts:8-34）[源码确认]
- tail 预算 `preserve_recent_tokens ?? clamp(2k,15k,usable*0.25)`，按 user 轮次从后往前累计（compaction.ts:115-120,223-269）[源码确认]
- 摘要模板五段（Objective/Important Details/Work State/Next Move/Relevant Files），增量更新 `<prior-summary>`（core/session/compaction.ts:16-55）[源码确认]
- PRUNE：更老工具输出清空为 "[Old tool result content cleared]"，skill 工具受保护（compaction.ts:28-31,273-317）[源码确认]
- 实验：（并入 loop-stepper 第 9 步）

### 08 子代理 · TASK SPAWNS CHILD SESSIONS
**h2**：subagent 不是新机制，而是"一个带 parentID 的普通会话 + 一次递归 prompt 调用"。
lede：task 工具沿 parentID 链计深度（默认 `subagent_depth=1`，禁止嵌套），子会话复用 `promptOps.prompt()` 主链路，事件在共享总线上以自身 sessionID 发布，TUI 靠 metadata 里的 parentSessionId 折叠渲染。
- 内建 agent：build/plan（primary）、general/explore（subagent）、compaction/title/summary（hidden）（agent/agent.ts:140-265）[源码确认]
- plan agent 用权限实现"只读+可写 plans 目录"（edit deny 仅 `.opencode/plans/*.md` allow，:156-175）[源码确认]
- task 续跑旧子会话靠 `task_id`（tool/task.ts:47-50）；background 异步需实验 flag（:100）[源码确认]
- task 工具描述动态注入可用 subagent 清单（registry.ts:325-331 describeTask）[源码确认]

### 09 模型层双运行时 · TWO RUNTIMES ONE STREAM
**h2**：同一个循环消费统一 LLMEvent 流，底下可以是 Vercel AI SDK，也可以是实验中的 Effect 原生客户端。
lede：providers 目录来自 models.dev（缓存+锁+构建期内嵌），`@ai-sdk/*` 动态 import 出 LanguageModelV3；`OPENCODE_EXPERIMENTAL_NATIVE_LLM` 打开时先探测 `packages/llm` 原生流，`supported` 才切换，否则 log fallback。
- token 优先级由各 provider 的 auth 函数自定——snowflake-cortex 示例：`token = env ?? api.key ?? oauth.access ?? config`（provider.ts:883-894），非系统级不变量[源码确认]
- OAuth 全部来自插件 `x.auth` 钩子（anthropic 无内置 OAuth，走 API key/env；codex/copilot/xai 为内置插件）（provider/auth.ts:116-125）[源码确认]
- reasoning effort 按 provider 方言翻译：gemini thinkingBudget / openai reasoning_effort 档位按发布日期裁剪（transform.ts:584-644,713-722）[源码确认]
- 重试：`retry-after(-ms)` 优先，否则指数退避 2s×2^n±25% 抖动封顶 30s，5 次（retry.ts:26-78）[源码确认]

### 10 扩展生态 · PLUGINS, SKILLS, COMMANDS, MCP
**h2**：扩展面分四个同心圆：改行为的钩子、加能力的工具、加知识的技能、加表面的协议。
lede：plugin 是 ESM 动态 import 的 npm 包或本地文件，挂 18 个钩子（chat.message、tool.execute.before/after、tool.definition、shell.env、experimental.*）；skills 兼容 `.claude/skills` 目录约定；command 是带 frontmatter 的 markdown；MCP 支持 stdio/streamable-HTTP/SSE + OAuth。
- 配置合并 8 层：全局→$OPENCODE_CONFIG→项目→.opencode/ 目录→env 内联→账号远端→managed→MDM（config/config.ts:316-551）[源码确认]
- skills 发现五路（`~/.claude/skills`、项目 `.claude/.agents`、配置目录、skills.paths、远程 urls 版本化缓存）（skill/index.ts:183-232）[源码确认]
- 插件 npm 包 `@opencode-ai/plugin`，加载前 `checkPluginCompatibility` 版本门禁（plugin/loader.ts:124-133）[源码确认]
- ACP = Zed 发起的 Agent Client Protocol，opencode 作为 agent 后端（acp/agent.ts）[源码确认]
- 自定义工具即放即用：`.opencode/{tool,tools}/*.{js,ts}`（registry.ts:183-197）[源码确认]

### 11 资源治理 · STEPS, RETRIES, DOOM LOOPS
**h2**：防失控是三件套：步数上限翻译成一条"禁工具"提示注入、连续三次同调用触发 doom_loop 审批、重试尊重服务端 retry-after。
- `agent.steps` → isLastStep 时 messages 尾部注入 MAX_STEPS_PROMPT（prompt.ts:1178-1179,1281 + core/session/runner/max-steps.ts）[源码确认]
- doom loop：最近 3 个 part 同工具同参数 → `permission.ask({permission:"doom_loop"})`（processor.ts:29,356-380）[源码确认]
- `OUTPUT_TOKEN_MAX=32_000` 封顶（可 env 覆盖），`min(model.limit.output, cap)`（transform.ts:18,1418）[源码确认]
- 循环检测没有全局 wall-clock 超时，靠 abort 端点 + 步数 + doom_loop（[合理推断]，grep 未发现 loop 级 timeout）
- 实验：（并入 decision-matrix 第 4 维度）

### 12 实践与面试 · DIAGNOSE THE TERMINAL
**h2**：诊断 OpenCode 永远从两样东西开始：`~/.local/share/opencode/opencode.db` 的事件行，和 `/event` 的 SSE 流。
lede：本章把 1-11 章收拢成五步诊断法和三套面试题；atlas-locator 做症状→归属层映射。
- 日志：Effect 内置日志（`Effect.logInfo("loop", {step})`），`opencode run` stdout 即事件流（json 格式 :174-178,679）[源码确认]
- 状态外置：session.status busy/idle 事件即"是否卡住"的 ground truth（status.ts:41-43）[源码确认]
- 回退演练：snapshot git-dir 与 `POST /session/:id/revert`（revert.ts:38-89）[源码确认]
- 实验：**atlas-locator**

---

## 4 交互实验数据

### 4.1 loop-stepper（第 01 章）— 主循环步进器

| # | stepLabel | eventName | note |
|---|---|---|---|
| 1 | 落用户消息 | `message.updated (user)` | `SessionPrompt.prompt` 先清理 revert 残留，再把 user 消息与附件 parts 写入事件流（prompt.ts:1052-1070） |
| 2 | 循环开闸 | `session.status → busy` | `ensureRunning` 保证同 session 单飞，`runLoop` 进入 `while(true)`（run-state.ts:88 / prompt.ts:1088-1089） |
| 3 | 历史重建 | — | `filterCompacted` 从最近一条摘要消息之后重放 parts，压缩对循环透明（message-v2.ts:521-578） |
| 4 | 终止检查 | — | 三条合取：finish 非 tool-calls/unknown ∧ 无待处理工具 ∧ parentID 匹配，即 break（prompt.ts:1111-1115）；孤儿中断工具只告警不阻断（:1116-1127） |
| 5 | 装工具 | — | `SessionTools.resolve`：注册表按模型/agent 过滤 ∪ MCP ∪ 自定义，每个 execute 内嵌权限纤（tools.ts:41-121） |
| 6 | 流式推理 | `message.part.updated (text/reasoning delta)` | system 五段拼装完成后 `handle.process` 开流，AI SDK fullStream 适配成 LLMEvent（prompt.ts:1257-1286, llm.ts:280-378） |
| 7 | 工具审批 | `permission.asked` | bash 命令被 tree-sitter 提取 pattern，`ask` 挂 Deferred——这一步循环纤真的停在半空（permission/index.ts:67-110） |
| 8 | 步结算 | `message.part.updated (step-finish)` | 写 usage/cost 进 assistant 消息，顺手判定 isOverflow → needsCompaction（processor.ts:435-460,478-482） |
| 9 | 压缩续跑 | `message.updated (assistant, mode:"compaction")` | 摘要消息落库后注入合成 "Continue if you have next steps…"，回到第 3 步（compaction.ts:340-355,519-547） |
| 10 | 收摊广播 | `session.idle` | break → 异步 prune → status idle → SSE `/event` 通知所有客户端回合结束（prompt.ts:1334-1339, status.ts:42-43） |

### 4.2 atlas-locator（第 12 章）— 症状定位器

| 按钮 label | title | body | status |
|---|---|---|---|
| TUI 卡住不出字 | 会话被上一轮占着，或 SSE 断了 | `ensureRunning` 对 busy 会话抛 BusyError，单飞是设计而非 bug。先查 `session.status` 事件流，再查 TUI 的 SSE 重连日志（retryDelay 1s→30s）。 | session 层 · run-state.ts:74-107 + tui/context/sdk.tsx |
| 工具疯狂弹审批 | 默认动作就是 ask | `evaluate` 无匹配规则时返回 `{action:"ask"}`，且 findLast 让后置规则覆盖前置——你的 allow 可能写在上面被压掉了。查 `permission` 配置顺序与 `Reply: always` 白名单。 | permission 层 · permission/index.ts:28-37,67-110 |
| 会话越跑越蠢 | 压缩边界吃掉了关键上下文 | 每轮只重放"最后一条摘要之后"的消息，PRUNE 还会清空 40k token 之外的老工具输出。看 MessageTable 里 `mode:"compaction"` 行与 `[Old tool result content cleared]` 占位。 | compaction 层 · message-v2.ts:521 + compaction.ts:273-317 |
| 换模型后行为突变 | 工具视图和 prompt 都随模型家族换了 | GPT-5 系只拿 apply_patch 没有 edit/write，system 段从 anthropic.txt 换成 gpt/codex.txt，reasoning 参数翻译成各家方言。对比 `registry.tools()` 与 `SystemPrompt.provider()` 的分支。 | 模型层 · registry.ts:297-300 + system.ts:27-49 |

### 4.3 decision-matrix（第 05 章）— 审批裁决矩阵

维度选项：
- `permission`: bash / edit / read / task / external_directory / doom_loop
- `agent`: build（宽松）/ plan（edit 全局 deny）/ explore（`*:deny` 白名单）/ subagent 派生会话
- `rulePosition`: 前置 allow / 后置覆盖 / 无匹配
- `reply`: once / always / reject(+反馈)

判定规则（伪代码级）：
```
decide(permission, pattern, ruleset):
  rule = ruleset.flat().findLast(r =>
      wildcard(r.permission, permission) && wildcard(r.pattern, pattern))
  # findLast：越靠后的规则赢 —— 与 Claude Code settings 的"首匹配"相反
  action = rule?.action ?? "ask"          # 无匹配默认 ask（index.ts:28-37）
  if action == deny  -> DeniedError 直接回给模型
  if action == allow -> 通过
  if action == ask   -> pending.push(Deferred); publish("permission.asked")  # SSE 广播
      reply = await deferred             # 工具执行纤停在这里
      if reject  -> 级联拒绝同 session 全部 pending（+CorrectedError 带用户反馈）
      if always  -> approved += request.always; 已匹配 pending 自动放行
      if once    -> 只放行本次
```
trace 文案：`$ opencode run "删掉 tmp 目录"` → `bash("rm -rf tmp")`：tree-sitter 提取 pattern=`rm -rf tmp`，always 前缀=`rm -rf *`（arity: rm=2 token）→ 无匹配规则 → **ask** → `permission.asked` SSE → TUI 弹窗按 `a`(always) → Deferred 解开、规则 `bash:rm -rf * = allow` 进会话白名单 → 下一条 `rm -rf other` 直接放行，不再弹窗。

### 4.4 state-projection（第 03 章）— 事件投影器

初始计数器：`sqlite_rows: 0` · `sse_events: 0` · `pending_deferreds: 0` · `session_cost: ¥0.00`
事件按钮（点击对计数器的影响 + log 文案）：

| 按钮 | 影响 | log 文案 |
|---|---|---|
| `session.created` | sqlite_rows +1, sse_events +1 | 投影器 insert SessionTable——注意这是事件订阅的副作用，内核只是 publish |
| `message.updated (user)` | sqlite_rows +1, sse_events +1 | user 消息落 MessageTable，`parentID` 链就绪，runLoop 下轮 ③ 可寻址 |
| `part.updated (text delta)` | sse_events +1（节流合并） | 文本增量走 updatePartDelta 广播，但只有聚合后的 part 终态进 PartTable |
| `step-finish` | sqlite_rows +1, session_cost ↑ | usage/cost 写进 assistant 行；迁移 SQL 用 json_extract 聚合到 session 列 |
| `permission.asked` | pending_deferreds +1, sse_events +1 | Deferred 挂起，工具纤 await——投影器不动，等 reply |
| `permission.replied (always)` | pending_deferreds → 0 | 会话级 approved 白名单追加，已匹配 pending 级联放行 |
| `session.idle` | sse_events +1 | `Event.Idle` 广播，TUI 输入框解灰，所有客户端知道回合结束 |

### 4.5 surface-switchboard（第 02 章）— 表面接线板

| 表面 | 行1 | 行2 | 行3 | 行4 |
|---|---|---|---|---|
| 终端 TUI | 进程形态 | 主线程 Solid UI + Bun Worker server | 传输 | in-worker `app.fetch` + RPC 事件（零 TCP） |
| | 证据 | cli/cmd/tui.ts:54-56,240 / cli/tui/worker.ts:31-49 | 开关 | `--port` 才真 listen（worker.ts:56） |
| HTTP 服务 | 进程形态 | `opencode serve` 独立进程 | 传输 | HTTP + SSE `/event`；WS 仅 PTY |
| | 证据 | server.ts:73 / groups/event.ts:9-14 | 鉴权 | `OPENCODE_SERVER_PASSWORD`，缺省裸奔警告（serve.ts） |
| Headless CLI | 进程形态 | `opencode run "…"` 一次性 | 传输 | stdout 文本或 `--format json` 事件行 |
| | 证据 | cli/cmd/run.ts:127,174-178,679 | 审批 | `--auto/--yolo` 即时 reply once，否则自动 reject（run.ts:274,801-816） |
| GitHub Actions | 进程形态 | node 编排进程 spawn `opencode serve` 子进程 | 传输 | SDK HTTP |
| | 证据 | github/index.ts:235-236 / action.yml | 触发 | @opencode/@oc mention + prompt input |
| IDE (Zed 等) | 协议 | ACP（Agent Client Protocol）ndJSON | 角色 | opencode 是 agent 端 |
| | 证据 | acp/agent.ts:19（@agentclientprotocol/sdk）| 方法 | newSession/prompt/setSessionMode/forkSession… |
| 桌面/Web | 进程形态 | Electron / Vite SPA | 传输 | 同一 SDK + SSE（baseUrl 指向 serve） |
| | 证据 | electron.vite.config.ts / tui/context/sdk.tsx:23-29 | 复用 | desktop 内嵌 TUI 组件（@opentui） |

---

## 5 教学骨架代码

`runLoop` 是 OpenCode 的心脏。以下为 SOURCE-ALIGNED TEACHING SKELETON——结构、命名、语义对齐 `packages/opencode/src/session/prompt.ts:1081-1341`，省略日志/中断/错误分支，非上游源码复制。

```ts
// SessionPrompt.runLoop — 教学骨架（对齐 prompt.ts，注释行号为真实源码位置）
import { Effect } from "effect";

function* runLoop(sessionID: SessionID) {
  let step = 0;
  while (true) {
    yield* status.set(sessionID, { type: "busy" });              // :1089

    // 1) 历史重建：只取最后一条 compaction 摘要之后的有效消息        :1092
    let msgs = yield* MessageV2.filterCompactedEffect(sessionID);
    const { user: lastUser, assistant: lastAsst, finished } = MessageV2.latest(msgs);

    // 2) 终止判定（本课 hero）：finish 是正常收尾、没有待回注的        :1111-1130
    //    工具调用、且 assistant 确实挂在这条 user 之下 → 回合结束
    const hasToolCalls = lastAsst?.parts.some(
      (p) => p.type === "tool" && !p.metadata?.providerExecuted && !isOrphaned(p),
    );
    if (lastAsst?.finish && !["tool-calls", "unknown"].includes(lastAsst.finish)
        && !hasToolCalls && lastAsst.parentID === lastUser.id) break;

    step++;                                                       // :1132
    if (step === 1) yield* fork(fEffect(title({ session, history: msgs }))); // :1133

    // 3) 任务分流：subtask / compaction 都是循环的输入而非旁路        :1144-1159
    const task = MessageV2.nextTask(msgs);
    if (task?.type === "subtask")     { yield* handleSubtask(task); continue; }
    if (task?.type === "compaction")  {
      if ((yield* compaction.process(task)) === "stop") break;    // :1149-1157
      continue;
    }
    if (finished && (yield* compaction.isOverflow({ tokens: finished.tokens, model }))) {
      yield* compaction.create({ sessionID, auto: true });        // :1161-1168 预检
      continue;
    }

    const agent = yield* agents.get(lastUser.agent);              // :1170
    const isLastStep = step >= (agent.steps ?? Infinity);         // :1178-1179

    // 4) 先建空 assistant 消息占位，流式全程往它身上贴 parts          :1186-1201
    const msg = { id: MessageID.ascending(), parentID: lastUser.id,
                  role: "assistant", cost: 0, tokens: zeroTokens(), /* ... */ };
    yield* sessions.updateMessage(msg);                           // publish → 投影落库
    const handle = yield* processor.create({ assistantMessage: msg, model }); // :1213

    // 5) 工具视图 = 注册表(按模型/agent 过滤) ∪ MCP，execute 内嵌审批纤  :1226
    const tools = yield* SessionTools.resolve({ agent, session, model, handle });

    // 6) system 五段现场拼装（agent.prompt 存在则替换基础段）          :1257-1269
    const [skills, env, instructions, mcpIns, modelMsgs] = yield* Effect.all([
      sys.environment(model), instruction.system(), sys.mcp(agent), sys.skills(agent),
      MessageV2.toModelMessagesEffect(msgs, model),
    ]);

    // 7) 一次模型流：AI SDK streamText（或实验 native），             :1272
    //    processor 逐 LLMEvent 消费：tool-call→ask→execute→truncate→
    //    tool-result 回注；step-finish 写 usage 并裁决 needsCompaction
    const result = yield* handle.process({
      user: lastUser, agent, system: [...env, ...instructions, ...],
      messages: [...modelMsgs, ...(isLastStep ? [MAX_STEPS_PROMPT] : [])],
      tools, model,
    });

    // 8) 裁决："stop"（含 content-filter/结构化输出）退出，            :1319-1328
    //    "compact" 排压缩任务下一轮处理，其余 continue
    if (result === "stop") break;
    if (result === "compact") yield* compaction.create({ sessionID, auto: true, overflow: !msg.finish });
  }
  yield* forkEffect(compaction.prune({ sessionID }));             // :1338
  return yield* lastAssistant(sessionID);                         // :1339
}
```

---

## 6 事实边界

1. **迁移进行时**：此 checkout 处于 V1→V2（Effect 重写）中途——`packages/core` 已有一整套 v2 session/runner/`@opencode-ai/llm` 原生客户端，但产品主链路仍是 `packages/opencode` + AI SDK；native 运行时被 `OPENCODE_EXPERIMENTAL_NATIVE_LLM` 门控且 unsupported 时静默回落（llm.ts:224-267）。课程叙述"主循环"必须钉在 prompt.ts，不要误引 v2 runner。[源码确认]
2. **TUI 已不是 Go**：旧版 Go/bubbletea TUI 在此版本不存在，现为 TypeScript（@opentui + Solid）（packages/tui/package.json:50-67、src/app.tsx:12）。引用"opencode 是 TS 内核 + Go 外壳"的二手资料已过时。[源码确认]
3. **实验特性须标注**：`execute`(code-mode) 工具、plan 模式、LSP 工具、background subagents 分别在 `--experimentalCodeMode/--experimentalPlanMode/--experimentalLspTool/OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` 之后；codemode README 自述不含文件系统/进程沙箱，"confined"仅指解释器面。[文档声明]+[源码确认]
4. **无全局超时**：循环没有 wall-clock 级 loop timeout，防失控靠 steps 上限、doom_loop 审批、abort 端点三件套——面试中"OpenCode 如何防死循环"不要答成有超时器。[合理推断]（grep 未命中 + 三机制均有源码）
5. **云端不可验证**：share 服务端（opncd.ai / console）与 `~/.local/share/opencode/storage` 的 V1 JSON 老用户数据，本 POC 未运行验证，仅代码走读。[源码确认（代码）/未验证（运行时）]

---

## 7 实践与面试

**五步诊断法**：① 看表面——`session.status`（busy/idle）与 SSE 心跳判定是内核忙还是链路断；② 看投影——`opencode.db` 的 Message/Part 行还原模型"实际见过什么"（尤其 `mode:"compaction"` 摘要行与 step-finish 的 tokens）；③ 看裁决——对照 prompt.ts:1111-1115 终止三条件解释"为什么续/为什么停"（孤儿中断工具告警后照样退出 :1116-1127，不是第四条件）；④ 看闸门——permission pending（`permission.asked` 有而 replied 无 = 卡在审批纤）与 retry.ts 退避日志（retry-after 被尊重与否）；⑤ 看边界——`agent.steps`、`subagent_depth`、truncate 的 `outputPath` 落盘文件，这三处是"行为变怪"最常藏身的预算墙。

### 题 1 · 架构设计：“把 opencode 的 agent 内核嵌入自研平台，但要求会话历史、计费统计归平台所有”
- 【场景定义】复用 runLoop/工具/权限引擎，替换存储与事件消费方；TUI 弃用，平台自研前端。
- 【归属层/机制】内核与持久化解耦点恰是"事件投影"：内核只 publish（session.ts:629-643 updateMessage→Event），落库是 projector 订阅副作用（core/session/projector.ts:260-318）。计费字段 assistant 消息自带 cost/tokens.cache。
- 【关键证据链】EventV2 Interface（core/src/event.ts:126-149 publish/subscribe/durable/replay）；`event-v2-bridge.ts` 的双向桥示范了"换总线"的既有先例；share-next.ts 用同一订阅面做增量同步——平台计费可完全复刻此模式。
- 【方案与防线】写自己的 projector 替换默认投影（或禁用默认层注入平台 DB）；防线：durable 事件 seq/aggregateID 必须保留否则回放断链；`Instance`/directory 上下文注入别丢（bridge 的 Location.Info），否则多租户路由错乱。

### 题 2 · 故障排查：“CI 里 opencode run 跑一半静默退出，无任何工具输出”
- 【场景定义】headless 模式、非交互 TTY，进程以退出码结束但 assistant 消息只有半截。
- 【归属层/机制】两个高发：(a) 审批纤——CI 无应答者，非 auto 模式收到 `permission.asked` 直接自动 reject（run.ts:801-816）；(b) provider 侧 finish=stop 谎报——循环靠 `hasToolCalls` 防御，但 content-filter 收尾会主动 break（prompt.ts:1295-1307）。
- 【关键证据链】退出前最后事件是 `permission.asked`（无 replied）→ 审批；`handle.message.finish === "content-filter"` → 过滤；`retry.ts` 5 次耗尽后 `Cause.done` 静默收场。查 `OPENCODE=1` 进程日志 `loop exit with orphaned interrupted tool` 告警。
- 【方案与防线】给 CI 配 `--yolo`/permission allow 规则 + 把 reject 转义成显式失败（CorrectedError message 进日志）；防线：CI 前端设外层 job timeout 补上内核缺失的 wall-clock 治理。

### 题 3 · 安全扩展：“用插件体系给公司写一道'生产库禁连 + 密钥不落盘'护栏”
- 【场景定义】agent 可自由跑 bash，需拦截 `psql prod` 类命令，并防止 .env 被 read。
- 【归属层/机制】三把锁正交：permission 规则（evaluate findLast，后写 deny 压过先写 allow）、内置 `.env` 读取默认 ask（agent.ts:119-136 全局 defaults）、外部路径 `external_directory`（external-directory.ts:15-45）。插件钩子 `tool.execute.before`（tools.ts:106-112）在 execute 前可抛错硬拦，`permission.ask` 钩子存在但服务端无触发点（预留，别依赖）。
- 【关键证据链】bash pattern 由 tree-sitter 命令节点还原（shell.ts:378-411），`rm -rf` 拆管道/子命令逐一评估——规则要写通配前缀（arity 字典决定 always 粒度）；deny 返回 DeniedError 文本会回注模型，可引导其改用安全路径。
- 【方案与防线】plugin 里 `tool.execute.before` 对 bash/edit 类工具做 AST 级二次审查 + 写自定义审计事件；防线：allow 规则不要写 `bash:"*"`——MCP 工具每次调用才 ask（tools.ts:408），把 server 名纳入 pattern 管理。

---

## 8 术语表

| 术语 | 定义 |
|---|---|
| part | 消息的原子内容块（12 种：text/tool/step-finish/patch/snapshot…），流式更新的粒度单位，逐 part 落库广播 |
| runLoop / step | 主 `while(true)` 与其一次迭代 = 一次完整模型请求-工具执行周期；`step` 计数喂给 `agent.steps` 预算 |
| 事件投影 | 内核只 publish 事件（MessageUpdated 等），SQLite 行由 projector 订阅写入——状态是事件流的物化视图 |
| doom loop | 连续 3 次同工具同参数被 processor 识别后升级为一次 `doom_loop` 权限审批，防模型鬼打墙 |
| compaction | 溢出前把老历史摘要成一条 `mode:"compaction"` assistant 消息、保留 tail turns 并自动续跑的循环内任务类型 |
| PRUNE | 压缩的姊妹操作：倒序跳过最近 2 轮，把更老非保护工具输出清空为占位文本，净省 >20k token 才提交 |
| revert / snapshot | 用独立 git-dir 对工作区做文件级快照，会话可退回任意消息点（含 unrevert），快照数据存 session.revert 列 |
| subagent / task | 带 parentID 的子会话，由 task 工具递归调用主 prompt 管线实现；默认 `subagent_depth=1` 禁嵌套 |
| variants | 同一模型挂在 `model.variants` 下的推理档位（effort/thinkingBudget），按请求合并进 options |

---

## 9 Hero 循环图

```
输入/IN → 组装/AS → 推理/LL → 执行/TO → 判定/EX ──(还有工具没回?)──▶ 回到 组装/AS
                                            │
                                            └──(无待处理调用)──▶ 空闲/IDLE (SSE 广播)
```

| 节点 | 中文 | 缩写 | 源码锚点 |
|---|---|---|---|
| 1 | 输入 | IN | SessionPrompt.prompt prompt.ts:1052 |
| 2 | 组装 | AS | system 拼装 + SessionTools.resolve prompt.ts:1226-1269 |
| 3 | 推理 | LL | streamText / native llm.ts:227-353 |
| 4 | 执行 | TO | tool-call→ask→execute processor.ts:331 / tools.ts:106-121 |
| 5 | 判定 | EX | 终止三条件 + compact 裁决 prompt.ts:1111-1130,1319-1328 |

---

## 10 PRIMARY SOURCES

- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/session/prompt.ts — runLoop 主循环（:1081-1341）
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/session/processor.ts — LLMEvent 消费/工具调用/doom loop（:29,331-460,356-383）
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/tool/registry.ts — 内建工具清单与模型过滤（:231-303）
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/permission/index.ts — evaluate/ask/reply 审批内核（:28-165）
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/session/compaction.ts — 压缩/tail/prune/autocontinue
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/server/routes/instance/httpapi/groups/event.ts — SSE `/event` 端点
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/opencode/src/cli/tui/worker.ts — TUI↔server 同进程 RPC 桥
- https://github.com/anomalyco/opencode/blob/754bb7e/packages/core/src/session/projector.ts — 事件→SQLite 投影
- https://opencode.ai — 官方文档站
