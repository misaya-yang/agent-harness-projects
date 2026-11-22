# Hermes Agent 生产级 Harness 课程 · 源码伴读

本课以本地 `NousResearch/hermes-agent` 的 `main` 为样本。提交为 `c7a3fe245d6bf610f73ff555d57e4ed632f8ded8`，提交者时间为 `2026-11-21T16:54:29-08:00`，标题为 “fix(cli,tui): a one-shot run clears its terminal status; TUI errors say why”。本地仓是浅克隆，以下结论对应这个提交的树。版本字段 `0.0.0` 是 checkout 占位值，安装版本由版本解析器读取。包元数据为 MIT，包声明的 Python 范围为 `>=3.11,<3.15`，依赖按 Python 版本选择。 [提交](https://github.com/NousResearch/hermes-agent/commit/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8) · [包元数据][pyproject] · [版本解析][version]

本课的交互轨迹是教学模拟。直接证据来自 Git 跟踪的源码、随提交交付的文档及测试用例。源码比较以当前 checkout 为边界，旧课使用的 `a0ca7c1` 和 `97f3229dfdc0` 是历史锚点。独立发布的插件以目录项声明的 SHA 为准。 [仓库开发指南][agents]

## 01 一次回合

- **入口。** `hermes` 进 `hermes_cli.main:main`，`hermes-agent` 进旧版 CLI 门面 `agent.legacy_cli:main`，`hermes-acp` 进 ACP 入口。运行时从 `run_agent.py::AIAgent` 的 mixin 组合进入 `TurnFacadeMixin.run_conversation()`，对持久协调覆盖的会话，在通用循环前准入跨进程回合租约。宿主的会话准入与这道写入保护各有职责。 [命令入口][entry] · [AIAgent 组合][agent] · [回合门面][facade] · [租约准入][lease]
- **序章、循环、尾声。** 序章装配会话、恢复冻结提示和历史并处理预检。循环重复准备、装配、压缩门、请求与重试、归一响应，再按工具调用或文本分派。工具分支回注后可进入下一迭代。文本分支仍处理回复截断、空响应、丢失工具调用等恢复。循环约束同时含调用上限、迭代预算和一次收尾机会。 [回合阶段][loop] · [文本收尾][text] · [最终提交][finalizer]
- **在途干预。** 通用路径的 `steer()` 将指导排入安全边界，可追加独立用户消息。活动模型请求中 `redirect()` 可中断请求并带修正重试，工具执行中则改走 steer，并可通知支持让出的工具。Codex App Server 用自己的 `turn/steer`。`interrupt()` 请求活动执行停止。恢复前要核实已发生的外部效果。若新请求应当独立开一轮，由宿主排队。 [中断与改向][steer] · [请求准备][prep]
- **步进机。** 轨迹选择一条“工具批回注后收到完整文本”的通用回合。第 8 步包含再次请求并取得下一条响应，第 9 步进入文本分支。

## 02 模型与错误

四个内置 API transport 是 `chat_completions`、`anthropic_messages`、`codex_responses`、`bedrock_converse`。注册表惰性发现并支持插件注册额外方言。通用回合调用阶段选择流式或非流式，`FailoverReason` 先区分可恢复错误、认证和资源压力，再选择重试、凭据切换或备用路由。主 OpenAI 兼容和 Anthropic 客户端由 Hermes 负责请求重试，避免和 SDK 的退避相乘。普通调用的 `agent.api_max_retries` 默认 3，1 表示仅一次尝试。辅助任务和插件 transport 要按各自调用路径核对。 [Transport 注册][transport] · [请求阶段][api] · [异常分类][error] · [重试配额][api-retries] · [主客户端重试归属][openai-retry]

选择 `codex_app_server` 时，`_turn_without_loop()` 先分派整个回合。Codex 子进程维护线程与执行，Hermes 把事件投影到本地会话。只有未中断的限流、上游限流或计费失败，且有可激活的备用路由，才回到通用循环重试同一用户回合。此路径保留 Codex 已投影的行与失败调用计数，排查时先确定执行所有者、`api_mode` 与实际路由。 [回合分派][codex] · [Codex 子进程会话][codex-session] · [回退条件][codex-fallback]

## 03 工具执行

`discover_builtin_tools()` 查找注册点，`get_definitions()` 组合工具集和可用性探针。一般探测使用 30 秒缓存。暂时失败可沿用 60 秒内的最近成功结果。观察到工具缺席时，区分当前宿主无权限、服务门控与延迟展示。 [工具发现][registry] · [探测缓存][probe]

Tool Search 的 `auto`（默认）与 `on` 在存在可延迟工具或已授予 Connections 时激活，`off` 保留原始 schema。默认 `threshold_pct=5` 和 `listing_max_tokens=4000` 共同限制嵌入列表。超出时可降为名字列表或仅保留桥接入口。这个预算决定模型一次预览多少目录，激活条件仍取决于是否有可查找工具或已授予 Connections。工作集核心和会话型 GUI 工具通常直显，显式 `defer` 可延迟个别工具。桥接调用仍检查当前会话能否触达该工具，并验证底层参数。 [默认值][tool-defaults] · [资格与激活][tool-search] · [桥接分发][dispatch]

Footprint Ladder 判定器沿六级路径演示扩展现有工具、CLI 加 skill、服务门控、插件、MCP 和核心工具。对保留的调用，工具批按 id 配对结果，非法项通常只对应一条失败结果。真正执行前先检查批次提交失败等整体退出条件。并行段由工具声明和实际作用域共同决定，路径重叠且含写入时切段，不相交的受支持写入可以并行。 [六级阶梯][ladder] · [工具批][tool-round] · [批次分段][tool-planner]

## 04 执行边界

`_ENV_BUILDERS` 有六个内置执行后端，分别为 Local、Docker、SSH、Modal、Daytona、Vercel。工厂按选项或 hosted scope 调度，额外后端由插件注册。Singularity / Apptainer 已移到官方插件，更新逻辑识别既有配置。 [环境工厂][env] · [执行入口][execute] · [迁移登记][singularity]

后端交换台比较本机进程、容器、远端连接及按需运行的状态边界。Modal 和 Vercel 的文件系统快照依赖对应的持久配置，Daytona 有停启与文件同步。比较时分别确认命令进程所在、路径可见性和工作现场能否保留。Local 受宿主权限约束，容器的挂载和网络决定真实隔离。Docker 的可选出口代理由代理端注入受管服务的真实凭据，显式环境转发仍有独立配置。审批也要先区分普通询问、硬拒绝和路径保护。 [Modal][modal] · [Daytona][daytona] · [Vercel][vercel] · [执行安全][exec-security] · [Docker 出口注入][docker-egress]

## 05 转录与恢复

`persistence_assembly.open_persistence()` 根据 profile scope 和存储配置装配接口，SQLite 实现位于 `persistence/sqlite/`。默认每个 profile 使用自己的 `state.db`，可通过 FTS5 与 trigram 搜索历史。旧 `hermes_state.py` 留有第三方插件兼容门面。 [装配入口][persistence] · [SQLite 索引][fts] · [兼容接口][shim]

规范消息记录会话，`api_content` 保存提交给模型的消息内容副本，便于恢复相同上下文。它只覆盖消息内容，完整网络请求还受路由与 transport 影响。对可能产生副作用的工具批先记录调用块，写入失败时停在工具执行前。压缩可在同一物理 session 内原地提交，也有把后续 transcript 发布到 continuation 的路径。原地事务通过活跃、归档与保留行处理并发新增和可搜索历史。恢复时可从模型投影中过滤未闭合的纯读调用，对可能有副作用且无结果的调用则保留痕迹并补 UNKNOWN。这样重试前仍能核实外部状态。 [存储契约][storage-doc] · [工具批][tool-round] · [压缩提交][commit-compaction] · [原地写入][in-place] · [未闭合工具回放][replay-cleanup]

恢复逻辑可找到压缩血缘中的目标段。全链保护检查活动和压缩归档的物理行，实际展示再按逻辑身份去重。若调用者只读末段，保护只算末段活跃行。默认上限为 20,000，可用 `sessions.max_resume_messages` 配置，0 关闭上限。导出另用 `sessions.max_export_messages`。投影台选少量摘要行模拟两种压缩，便于复现末段通过而全链超限。 [血缘解析][resume] · [两种恢复范围][resume-scope] · [限制配置][limits]

## 06 记忆闭环

`memory.nudge_interval` 与 `skills.creation_nudge_interval` 都默认 10。记忆轮数只在需要的工具与 store 可用时增加，通用循环只在间隔启用且 `skill_manage` 可用时增加技能计数，计数点是迭代准备而非工具调用数。`skill_review_due()` 再检查间隔和工具可见性。后者也用于收尾前的只读 `review_signals`。训练用的到期判定器只计算技能条件。 [默认间隔][learning-defaults] · [记忆触发][memory] · [技能计数][prep] · [技能信号][skills-due]

收尾要求有最终响应、未中断且未 veto。全局开关、Cron 的派发抑制以及委派子代理范围也可阻止派发。技能计数在到期的收尾阶段重置，记忆计数则在回合开头判定到期时重置。后台任务按快照运行，可以延迟到本地模型空闲。前台新回合获得优先权，可以取消排队或中断在途复盘。实际编辑受对应工具的保护与写入审批配置约束。冻结的会话提示可保留旧记忆，避免磁盘写入破坏已有请求的缓存前缀。 [收尾派发][finalizer] · [快照与工作线程][background] · [前台优先][cancel-review] · [写审批][write-gate]

## 07 扩展体系

技能先披露索引，按需读取正文和关联文件。插件可注册 hook、middleware 与更多受协定管理的扩展类型。部分扩展点检查已授予能力，声明哈希用于发现需要复核的变化。Gateway 事件 hook 由 profile 目录放置授权，启动时以宿主权限导入。排查扩展应核对实际入口、能力授权和执行作用域。 [技能索引][skill-index] · [插件指南][plugin-doc] · [能力授权][capability-consent] · [Gateway hook 信任边界][exec-security]

双向迁移练习对比资产和运行状态。Hermes 侧当前命令 `hermes import-agent openclaw` 来自官方 `agent-importers` 插件，`hermes claw migrate` 是插件提供的兼容拼写。Hermes 本地的 `§` 是自家记忆条目分隔符。OpenClaw 对位说明固定到同批 checkout 的 `3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd`。两侧分别核对人格、记忆、技能、凭据和配置。OpenClaw → Hermes 将旧 Cron 配置归档，Hermes → OpenClaw 将 `cron/` 归档。要继续调度，在目标端重新创建作业并核对时区、权限和目标。 [插件目录声明][importers] · [Hermes 导入指南][import-guide] · [OpenClaw 到 Hermes 映射][hermes-migrate] · [Hermes 分隔符][separator] · [Hermes 到 OpenClaw 映射][openclaw-import]

## 08 缓存与压缩

会话缓存要求已发前缀尽量稳定。系统提示分层，部分回合元数据进入 API 副本。内置配置默认比例是 50%，模型窗口小于 512,000 时被提升到至少 75%，然后才用扣除输出预留的输入预算算 token 阈值。绝对上下限与模型配置也会影响实际阈值。未锚定的估算跨过阈值时可等一次真实 usage，证实不会返回 usage 的路由仍可据估算行动，provider 明确报溢出有独立恢复路径。比较同路由的实际 prompt usage 来核查是否降压。 [缓存原则][agents] · [阈值计算][threshold] · [预检入口][preflight]

压缩提交有租约或并发栅栏、抗增长和回滚路径。连续两次 provider 确认无效才触发重复压缩保护。固定的系统提示和工具定义可能让输入始终过阈值，减少对话行数仍未解决这一开销。归档的规范记录继续服务展示和搜索。微压缩由 `compression.micro_compact` 显式开启，逐步折叠历史可能破坏 provider 前缀复用。 [提交逻辑][commit-compaction] · [缓存与压缩设计][cache-doc] · [微压缩取舍][micro]

## 09 多宿主

普通 classic CLI、Ink TUI 和 Desktop 可作为共享 gateway 的会话客户端。Native 客户端可经引导获取一次性 ticket 并连接 `/api/ws`，请求优先交给 `AuthorityConnection`。兼容回退仅覆盖许可的旧 handler。无 authority 的独立传输才走传统分发。 [Classic CLI 接入][classic] · [WebSocket 分发][ws] · [兼容回退][fallback]

`session.create` 发布逻辑会话标识并可用请求 id 对抗确认包丢失。`prompt.submit` 的回执表示耐久准入。主动 `session.detach` 解除订阅。最后一个连接异常丢失时，符合条件的会话按无订阅者宽限回收。活跃时 `session.resume` 可重接执行。审批响应需订阅者具有审批能力，并匹配执行世代与 prompt id。物理 transcript 可因压缩或 reset 轮换，客户端逻辑 id 延续。 若此前执行留下 UNKNOWN，准入队列会拒绝把后续项直接当成安全接续。会话写入另受回合租约保护。 [本地会话协议][local-sessions] · [提交与订阅][authority] · [断线条件][orphan-close] · [审批响应][approval-response] · [控制 RPC][controls] · [存储协作][coordination]

消息适配器用 `build_session_key()` 处理平台、私聊/群组、线程和隔离策略。多 profile 网关给回合、回调、驱逐和清理等工作绑定所有者作用域，配置和凭据按 profile 查找。排查“另一个终端接上谁”的问题时查逻辑会话与执行世代，排查“群消息送到哪”的问题时查平台 route 与 profile。 [平台路由键][route] · [作用域绑定][profile] · [凭据作用域][scope]

## 10 异步交付

异步委派通过耐久完成记录入队，通常等父会话就绪后另起回合。无后续结果消费者时改为同步执行，部分关闭或无人观看场景则将结果降为会话备注。cron 还有独立调度器路径，定时任务配置保存在 profile 的 `cron/jobs.json`，分别追踪到期、执行与发送。一次性任务有常规 120 秒宽限并可显式 rearm，活跃认领需保留。委派完成记录最多尝试投递 8 次，启动重放窗口是 48 小时。认领过期只能解释谁可以接管，实际发送仍要核对回执。 [异步委派][async] · [委派投递限额][delivery-limits] · [Cron 技术说明][cron-doc] · [Tick][tick] · [Rearm][rearm]

交付识别器只有两项固定名称 `webhook`、`wecom_callback`，其余读取平台插件的 `cron_deliver_env_var`。课程样例中 Telegram 与 ntfy 有声明，Raft 缺少对应字段。识别后仍需获取有效目标并调用适配器。`wecom_callback` 走配置中的 `home_channel`。Webhook 的可选转录镜像在成功发送后单独尝试，按 route 明确启用，镜像以带来源标签的用户角色记录在目标 profile 的聊天历史，发送成功仍需另核对镜像写入。 [固定目标][cron-fixed] · [插件识别][cron-platforms] · [Telegram][telegram] · [ntfy][ntfy] · [Raft][raft] · [Webhook 镜像][webhook]

Kanban 处理依赖、assignee、就绪卡与工作进程的领取。排查计划触发用 cron 收据，排查卡片停滞用 Kanban 领取和 worker 状态。 [Kanban 调度契约][kanban]

## 11 多代理

`delegate_task` 通常在宿主内开线程运行独立的 `AIAgent` 子会话。同步委派直接回传工具结果，后台模式返回句柄，在结果就绪时通知父会话。默认最大派生深度 1，普通并发 10，一次性运行另有整次委派总量。看门狗请求中断后可放弃等待。父侧仍需核查执行终态、文件或外部回执。交换台区分客户端、进程所有者与协议。ACP 有编辑器 stdio 入口，通用 MCP 服务由官方 `mcp-serve` 插件提供。Codex App Server 自己的 Hermes tools MCP 桥是独立集成。 若网关重启，既有在途执行可落为 UNKNOWN。显式启用自动恢复后才走有上限的重新准入，而且仍需核对最后一次未闭合副作用。 [重启与自动恢复][delegate-restart] · [子代理构建][delegate] · [派生与并发默认][delegate-defaults] · [监测无进展][delegate-watchdog] · [异步准入][async-admission] · [客户端协议][programmatic] · [MCP 插件目录][mcp] · [Codex 工具桥][codex-mcp]

## 12 综合判断

- 成本异常先固定模型与路由，对照 cache usage、持久提示与压缩前后请求。
- 工具消失先查 Tool Search，再查工具集、宿主能力和服务探针。
- 会话恢复先查逻辑会话映射、续写段和所读视图，再核对恢复限额与未闭合的副作用调用。
- 定时任务缺失依次查到期、申领、执行终态与实际发送。
- 双客户端控制先确认同一逻辑会话，再核对提交 id、执行世代和待审批请求 id。

[pyproject]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/pyproject.toml#L5-L18
[version]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/hermes_cli/version_info.py#L293
[agents]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/AGENTS.md#L8-L20
[entry]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/pyproject.toml#L593-L596
[agent]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/run_agent.py#L215-L242
[facade]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_facade.py#L21-L98
[lease]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_facade_lease.py#L315
[loop]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/conversation_loop.py#L1720-L1780
[text]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_final_response.py#L106
[finalizer]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_finalizer.py#L621-L649
[steer]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/interrupt_control.py#L310-L375
[prep]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_iteration_prep.py#L144-L181
[transport]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/transports/__init__.py#L18-L54
[api]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_api_call.py#L46-L160
[error]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/error_classifier.py
[codex]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/conversation_loop.py#L1589-L1616
[codex-session]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/transports/codex_app_server_session.py#L208
[registry]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/registry.py#L121-L165
[probe]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/registry.py#L483-L552
[tool-defaults]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/hermes_cli/config_defaults.py#L1930-L1958
[tool-search]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/tool_search.py#L153-L225
[dispatch]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/model_tools.py#L730-L775
[ladder]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/AGENTS.md#L58-L60
[tool-round]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_tool_round.py#L50-L231
[env]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/terminal_tool_backends.py#L281-L324
[execute]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/environments/base.py#L739
[singularity]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/hermes_cli/left_core_migration.py#L605-L615
[modal]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/environments/modal.py#L401-L433
[daytona]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/environments/daytona.py
[vercel]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/environments/vercel_sandbox.py#L270-L293
[persistence]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence_assembly.py#L172-L226
[fts]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/sqlite/_schema_ddl.py#L756-L780
[shim]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/hermes_state.py#L1-L10
[storage-doc]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/session-storage.md
[commit-compaction]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/conversation_compression.py#L3532-L3670
[in-place]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/sqlite/conversation/_store/messages.py#L845-L888
[resume]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/sqlite/conversation/_store/messages.py#L1424-L1463
[resume-scope]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/sqlite/conversation/_store/messages.py#L1718-L1740
[limits]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/storage_limits.py#L1-L24
[learning-defaults]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/agent_init.py#L1143-L1223
[memory]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_context.py#L819-L827
[skills-due]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/review_signals.py#L33-L51
[background]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/run_agent.py#L787-L860
[cancel-review]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/background_review.py#L195-L245
[write-gate]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/write_approval.py#L204
[skill-index]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/prompt_builder.py#L1242-L1283
[plugin-doc]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/plugins/index.md
[importers]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/plugin-catalog/agent-importers.yaml#L1-L22
[import-guide]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/guides/migrate-from-openclaw.md#L7-L33
[separator]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/memory_tool_store.py#L24-L31
[openclaw-import]: https://github.com/openclaw/openclaw/blob/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd/docs/install/migrating-hermes.md
[threshold]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/context_compressor.py#L2615-L2666
[preflight]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_preflight_gate.py#L20-L102
[cache-doc]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/context-compression-and-caching.md
[micro]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/micro-compaction.md#L12-L26
[classic]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/gateway-classic-cli.md#L7-L35
[ws]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tui_gateway/ws.py#L379-L408
[fallback]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tui_gateway/ws_legacy_fallback.py
[local-sessions]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/gateway-local-sessions.md#L18-L51
[authority]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/session_authority.py
[controls]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/session_controls.py#L779-L1006
[coordination]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/sqlite/authority/coordination.py#L195-L314
[route]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/session.py#L722-L790
[profile]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/run.py#L1782-L1836
[scope]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/AGENTS.md#L153-L181
[async]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/async_delegation.py
[cron-doc]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/cron-internals.md
[tick]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/cron/scheduler_tick.py#L33-L85
[rearm]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/cron/jobs.py#L2239-L2296
[cron-fixed]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/cron/scheduler_delivery.py#L27-L30
[cron-platforms]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/cron/scheduler_delivery.py#L412-L427
[telegram]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/plugins/platforms/telegram/adapter.py#L6632
[ntfy]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/plugins/platforms/ntfy/adapter.py#L369
[raft]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/plugins/platforms/raft/adapter.py
[webhook]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/platforms/webhook.py#L1086-L1106
[kanban]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/cron/AGENTS.md#L117-L151
[delegate]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/delegate_tool.py
[programmatic]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/developer-guide/programmatic-integration.md
[mcp]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/plugin-catalog/mcp-serve.yaml#L1-L14
[codex-mcp]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/transports/hermes_tools_mcp_server.py
[api-retries]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/agent_init.py#L1273-L1284
[openai-retry]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/agent_runtime_helpers.py#L1616-L1624
[codex-fallback]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/turn_recovery.py#L1759-L1782
[tool-planner]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/tool_dispatch_helpers.py#L184-L260
[exec-security]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/user-guide/security.md
[docker-egress]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/environments/docker_egress.py#L221-L234
[replay-cleanup]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/agent/replay_cleanup.py#L73-L143
[capability-consent]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/hermes_cli/plugin_capabilities.py#L140-L222
[hermes-migrate]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/guides/migrate-from-openclaw.md#L167-L178
[orphan-close]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/session_authority.py#L432-L461
[approval-response]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/gateway/session_authority.py#L1108-L1121
[delivery-limits]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/persistence/authority/coordination.py#L79-L84
[delegate-defaults]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/delegate_tool_config.py#L19-L30
[delegate-watchdog]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/delegate_tool_child_run.py#L1022-L1100
[async-admission]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/tools/delegate_tool_dispatch.py#L479-L525
[delegate-restart]: https://github.com/NousResearch/hermes-agent/blob/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8/website/docs/user-guide/features/delegation.md#L553-L583
