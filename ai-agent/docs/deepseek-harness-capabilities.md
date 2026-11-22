# DeepSeek Harness 能力地图与教学路线

本文根据本地源码仓 `deepseek-harness` 的提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 整理，面向希望理解 Harness 架构、运行安全与扩展方式的中文读者。文中的 `[实现事实]` 是源码直接表达的行为；`[推断]` 是由多个源码关系得到的教学性结论；`[POC/实验]` 标明源码明确称为实验或尚未构成产品承诺的部分。所有源码引用均为源仓相对路径，并给出主要 symbol。

## 先建立一张地图

DeepSeek Harness 的核心思想是“everything is a plugin”：模型适配器、工具注册表、Session 日志、Agent Loop、文件系统、审批和协议入口都以 Cordis Plugin 挂载到 Context 中，没有一个必须通过修改的特权核心。[实现事实：`docs/architecture.md::Cordis`、`packages/core/agent-loop/src/index.ts::AgentLoop`、`packages/core/tools/src/index.ts::ToolRuntime`]

每个可替换能力都应拆成三个角色：Service Definition 声明接口，Service Provider 实现接口，Consumer（通常是模型工具）使用接口。比如文件能力由 `FileSystem` 声明、`LocalFileSystem` 或 `E2BFileSystem` 提供、`tool-fs::apply` 消费；shell 和 subprocess 也遵循同样的三段结构。[实现事实：`packages/fs/fs/src/index.ts::FileSystem`、`packages/fs/fs-local/src/index.ts::LocalFileSystem`、`packages/fs/tool-fs/src/index.ts::apply`；`packages/shell/shell/src/index.ts::ShellExecutor`、`packages/shell/bash-local/src/index.ts::LocalBashExecutor`、`packages/shell/tool-bash/src/index.ts::apply`]

Session 日志是模型上下文的权威来源：模型可见的输入、工具调用和结果必须能由日志重建；`session/event` 是提交后的观察流，`session/flush` 是持久化检查点。[实现事实：`docs/architecture.md::Session log`、`packages/core/session/src/index.ts::Events`]

## 1. 从一次 Agent Turn 开始：插件、事件与日志

教学目标：读者能解释“一次模型请求如何变成事件和工具调用”，并知道扩展点为什么优先于改 Loop。

一次 step 包含一个模型请求及其工具调用；turn 由 `turn/start`、输入认领、`agent/pre-step`、`agent/request`、LLM 流、工具流水线、`step/end` 和 `turn/end` 组成。`agent/pre-step`、`agent/request`、`llm/stream` 及 `tools/pre-execute`/`execute`/`post-execute` 是 waterfall，监听器必须调用 `next()` 才会继续链。[实现事实：`docs/architecture.md::Turn flow`、`packages/core/tools/src/index.ts::Events`]

插件贡献通过 `ctx.effect()` 和 `ctx.on()` 注册，并随 Fiber dispose 逆向撤销；这使动态加载、HMR 和替换 Provider 具备可观测的生命周期。[实现事实：`AGENTS.md::Registrations are effects`、`docs/cordis-tutorial/02-lifecycle-and-effects.md::fiber.dispose`、`packages/core/agent-loop/src/index.ts::FactoryOwnership.dispose`]

贯穿任务：实现一个“工具调用审计器”的纸面设计。它不能改 `agent-loop`，而应监听 `tools/*`，把持久事实写入 `SessionEventMap`，再从日志投影 UI 或统计；如果审计信息要进入模型请求，必须同时设计可重放的 Session event。[推断：`docs/architecture.md::Where new behavior goes`、`packages/core/session/src/index.ts::SessionEvent`]

## 2. 组合方式：Profile、Bundle 与 per-session Preset

Bundle 是带有 `dsh.bundle.patch` 清单的可安装 Cordis 配置层；Profile 按顺序叠加 bundles、Profile patch、home patch 和命令行 `--patch`，命中的行由 id 整行替换，不是深合并。[实现事实：`docs/architecture.md::Profiles and bundles`、`packages/bundle/README.md::bundle`、`packages/bundle/base/cordis.patch.yml`]

`dsh-base` 负责通用 Agent、模型、工具、持久化、设置、凭据、sandbox、审批和基础 subagent Provider；`dsh-web-app` 加 Web Host 与浏览器面；`dsh-headless` 是无 HTTP/Web 的一次性任务面。[实现事实：`packages/bundle/base/README.md::dsh-base`、`packages/bundle/web-app/README.md::dsh-web-app`、`packages/bundle/headless/README.md::dsh-headless`]

Preset 不是另一个进程，而是一个 `agent.cordis.yml` 目录。`AgentPresets.mount()` 将其一次挂到 standing scope，Agent 通过 scope parent chain 解析 `agent → preset → global`；`composeFrom()` 让 child 复用父 Agent 已加入的同一代组合，避免子 Agent 读到变更后的文件。[实现事实：`packages/preset/agent-presets/src/index.ts::AgentPresets.mount`、`::composeFrom`、`::recompose`]

Preset 的安全边界是组成边界：直接挂载必须有 Agent scope；发布 process-global Service 的行会被拒绝，除非放入 `isolate` realm；Preset 只在 Agent 尚未产出内容时允许 recompose。[实现事实：`packages/preset/agent-presets/src/index.ts::recompose`、`packages/preset/agent-presets/src/invariant.ts::apply`；`packages/preset/agent-presets/README.md::What a mount rejects`]

贯穿任务：为“只读研究 Agent”和“可写编码 Agent”画两份 preset。研究 Agent 的工具来自同一 host，但 preset 只给 web/read；编码 Agent 再加入 write/shell。说明为何不能让 preset 自己放宽 sandbox 或复制一个 process-global `agent-loop`。[推断：`packages/preset/agent-presets/README.md::What not to move into a preset`]

## 3. 一个执行世界：fs、shell、subprocess 与持久 PTY

`ctx.fs` 的 `FileSystem` 将路径解析为带稳定 opaque `targetKey` 的目标，提供 stat/lstat/read/list 和原子 write/edit；write/edit 可携带版本 guard，读写接口还保留执行世界与沙箱策略参数。[实现事实：`packages/fs/fs/src/index.ts::FileSystem.resolve`、`::writeText`、`::editText`]

`fs-observation-policy` 不替换 Provider，而是监听 `fs/write-intent`、`fs/edit-intent`、`fs/observed`，实现 read-before-edit 与版本保护；没有该插件时，裸 Provider 仍可执行无 guard 的写入。[实现事实：`packages/fs/fs-observation-policy/src/index.ts::apply`、`packages/fs/fs/src/index.ts::Events`]

`ctx.shell` 是命令语义层，`resolve(request)` 先补齐 workdir、timeout 和输出上限，`run(spec)` 处理前台结果，`start(spec)` 返回背景进程句柄；默认值属于 Provider，不隐藏在 run 内部。[实现事实：`packages/shell/shell/src/index.ts::ShellExecutor`、`packages/shell/bash-local/src/index.ts::LocalBashExecutor.resolve`]

`ctx.subprocess` 是更低层的执行基座：负责 executable lookup、argv、stdio、进程树终止和 PTY primitive，不负责 shell 语义、协议 framing 或工具呈现。父环境会移除匹配 `KEY|PASSWORD|SECRET|TOKEN` 的名称以及所有 `DSH_*`，显式 env 才能在 scrub 后加入。[实现事实：`packages/subprocess/subprocess/src/index.ts::scrubbedParentEnv`、`::SubprocessRuntime`]

`ctx.terminals` 由 `TerminalSessionService` 管理 owner-scoped 的持久 PTY；backend 注册、spawn、send/read/signal 和 dispose 都按 exact Agent 授权，`terminal-bash` 通过 `ctx.subprocess.spawnTerminal` 提供 Bash/PowerShell 会话。[实现事实：`packages/terminal/terminal/src/index.ts::TerminalSessionService`、`packages/terminal/terminal-bash/src/index.ts::BashTerminalBackend`]

贯穿任务：设计一个三步交互式调试任务——用 `read` 找配置、用一次 `bash` 运行检查、用 PTY 保持 REPL 状态。要求学生指出哪一步是 `ctx.fs`、哪一步是 `ctx.shell`、哪一步是 `ctx.terminals`，并解释为什么所有进程最终由 `ctx.subprocess` 管理。

## 4. 安全模型：sandbox、审批与权限 preset

Sandbox 的语义只有三个文件效果模式：`read-only`、`workspace-write`、`danger-full-access`；它不声称控制网络或进程可见性。策略是每次调用携带的完整值，Provider 不偷偷补默认。[实现事实：`packages/sandbox/sandbox/src/index.ts::SandboxMode`、`::SandboxExecutionPolicy`、`::SandboxProvider.confine`]

本地 Provider 按平台选 runner：Linux 优先 `bwrap`，其次 Landlock；macOS 使用 Seatbelt；Windows 使用 restricted-token/ACL runner。若无可用 runner，请求 confined mode 抛 `SANDBOX_UNAVAILABLE`，不降级为未隔离运行。[实现事实：`packages/sandbox/sandbox-local/src/index.ts::PLATFORM_CHAINS`、`::LocalSandboxProvider.confine`、`packages/sandbox/sandbox/src/index.ts::SandboxUnavailableError`]

Landlock launcher 是 self-restrict-then-exec：它给自身安装规则集后 exec 被包裹命令，规则集沿 execve 继承，而调用 Harness 的宿主进程保持未受限；内核不支持时 launcher 在 exec 前失败。[实现事实：`native/landlock-run/README.md::landlock-run`、`native/landlock-run/packages/entry/src/main.c::main`、`native/landlock-run/packages/entry/src/index.ts::probe`] [POC/实验边界：Landlock `partial`/`full` 取决于实际 ABI probe，不能仅凭内核版本宣称完整隔离；源仓 `native/landlock-run/docs/support-matrix.md` 明确以 probe 为准。]

文件沙箱与进程沙箱是两道正交的约束：`SandboxedFileSystem.checkedTarget()` 在 fresh canonical path 上检查 workspace containment，`SandboxBashExecutor.confine()` 则把 shell argv 交给 `ctx.sandbox` 包裹。两者都必须选择相应 Provider；只加载其中一个不会自动获得另一层保护。[实现事实：`packages/fs/fs-sandbox/src/index.ts::checkedTarget`、`packages/shell/bash-sandbox/src/index.ts::confine`]

审批是 channel-neutral 的 one-shot seam：`ctx.approval.request()` 只返回 `allowed-once`、`rejected`、`cancelled` 或 `unavailable`；缺少 answerer 时 fail closed，并把 `approval/asked` 与 `approval/decided` 写入审计日志。`never` 策略在交互派发前直接拒绝。[实现事实：`packages/interaction/user-approval/src/index.ts::ApprovalService.request`、`::ApprovalOutcome`、`packages/interaction/user-approval/README.md::ApprovalPolicy`]

权限 preset 只是把 `sandbox/mode` 和 `approval/policy` 绑成一个用户选择；默认的 `workspace-write` 是 workspace-write + ask，`danger-full-access` 是 danger-full-access + never。preset 选择事件先于 knob 事件提交，后续 session 会固定自己的初始权限。[实现事实：`packages/interaction/permission-presets/src/index.ts::PermissionPresetService`、`packages/interaction/permission-presets/README.md::set`]

贯穿任务：给一次“向 workspace 外写文件”的工具调用画状态机：普通调用 → `FS_SANDBOX_DENIED` → 请求一次升级 → 若获批只对本次调用扩大策略 → 审计结果写日志。实验必须验证“没有 answerer”“approval=never”“sandbox runner 不可用”三条拒绝路径。

## 5. 本地与远程执行世界：E2B 的 POC 边界

E2B 组合的设计重点不是给每个上层工具做 fork，而是让一个 `E2BRuntime` 创建并拥有一个远程 Linux sandbox，再让 `E2BFileSystem` 与 `E2BSubprocessRuntime` 共享同一个 SDK handle、cwd 和 runtimeRoot。[实现事实：`packages/e2b/e2b/src/index.ts::E2BRuntime`、`packages/e2b/fs-e2b/src/index.ts::E2BFileSystem`、`packages/e2b/subprocess-e2b/src/index.ts::E2BSubprocessRuntime`]

因此既有 bash、PTY、LSP 等 Consumer 可以继续依赖 provider-neutral 的 `ctx.fs`/`ctx.subprocess`，文件与进程状态落在同一个远程执行世界；E2B 不搬迁 Harness 进程、Cordis 对象、模型调用、Agent/Session、持久化或 SDK buffer。[实现事实：`packages/e2b/README.md::portable execution world`]

E2B 配置要求 API key、绝对 Linux cwd 和正数 timeout，创建失败会回滚，dispose/timeout 会 kill sandbox；API key 不转发到 sandbox。[实现事实：`packages/e2b/e2b/src/index.ts::E2BRuntime.validate`、`::open`、`::getSandbox`]

[POC/实验边界] 源码把 E2B 目录称为 “experimental provider-composition POC”。本文不能把 E2B 说成默认 Profile、通用容器隔离或已完成生产认证；它是验证“可替换执行世界”抽象的实验组合。[实现事实：`packages/e2b/README.md::experimental provider-composition POC`]

## 6. 可扩展能力：skills、web、subagent、workflow 与 hooks

Skills 由 `SkillRegistry` 统一注册、发现和 lookup，`tool-skill::apply` 再把 catalog/loader 暴露为模型工具；Provider 可以来自本地文件、嵌入资源或远程目录，核心控制流不需要知道来源。[实现事实：`packages/skill/skill/src/index.ts::SkillRegistry`、`packages/skill/tool-skill/src/index.ts::apply`、`packages/skill/README.md::provider-neutral catalog`]

Web 把 search 与 fetch 放在 `WebRuntime` 的 Provider 选择层；Exa、Perplexity、DeepSeek search 以及 HTTP fetch 可替换，`tool-web::apply` 只消费 `ctx.web`。[实现事实：`packages/web/web/src/index.ts::WebRuntime`、`packages/web/tool-web/src/index.ts::apply`、`packages/web/README.md::provider family`]

Subagent 是命名 Provider 注册表。`SubagentRuntime.start()` 做能力与深度检查后启动 one-shot child；`startContinuable()` 支持持久 child、后续消息和 child-to-parent report。`tool-subagent::apply` 依据 Provider 能力选择前台、one-shot background job 或 continuable child。[实现事实：`packages/subagent/subagent/src/index.ts::SubagentRuntime.start`、`::startContinuable`、`packages/subagent/tool-subagent/src/index.ts::apply`]

Workflow 是模型编写的编排脚本接口，`WorkflowEngine.start()` 返回 holder-owned run；worker-thread Provider 在独立线程执行，配置有并发 Agent、总 Agent、item、同步时间和 dispose grace 上限。[实现事实：`packages/workflow/workflow/src/index.ts::WorkflowEngine`、`packages/workflow/workflow-worker-thread/src/index.ts::WorkerThreadWorkflowEngine`]

[安全边界] Workflow worker thread 只隔离宿主事件循环，不是安全边界；动态脚本必须按“不可信代码”另行处理。[实现事实：`packages/workflow/README.md::worker threads`]

Hooks 不是新的 Loop，而是把 Claude Code/Codex 的外部 shell hook 协议翻译到 `agent/pre-step`、`tools/pre-execute`、`tools/post-execute` 和 `agent/turn-stopping`。`hook-protocol::runHook()` 通过 `ctx.shell`，继承凭据 scrub、进程组取消与 timeout。[实现事实：`packages/hooks/README.md::bridges`、`packages/hooks/hooks-codex/src/index.ts::apply`、`packages/hooks/hook-protocol/src/runner.ts::runHook`]

贯穿任务：做一个“研究流水线”设计：skill 载入研究规范，web Provider 获取资料，subagent 分工，workflow 汇总，hooks 在工具前后做策略检查。教学重点是每层只通过自己的 Service Definition 交换能力，不把 Provider-specific 细节写进模型工具 schema。

## 7. 自修改运行时：Dynamic Cordis 的能力与危险

可选的 `tool-cordis` 提供 `cordis_inspect_list/query/self`、`cordis_define`、`cordis_run`、`cordis_stop`、`cordis_undefine`。`cordis_define` 只做 plain JavaScript 语法检查并登记不可变 Package，不执行 `apply`；`cordis_run` 才激活精确 Package 版本，成功后 `currentPackageId` 才改变，失败保留旧版本与待切换版本。[实现事实：`packages/extensions/tool-cordis/src/index.ts::apply`、`packages/extensions/cordis-host-runner/src/index.ts::DynamicCordisRunnerService.define`、`::run`]

Host half 在 `node:vm` 新 realm 中求值，`require`、Node timers、`fetch` 等被 trap，指向 `ctx.fs`、`ctx.web`、`ctx.bash` 或 Cordis timer；运行插件拿到的是 whitelist façade，`ctx.get/on/provide/effect` 与 `harness.handle/defineTool/registerTool` 是主要入口。[实现事实：`packages/extensions/cordis-host-runner/src/sandbox.ts::createSandbox`、`::NODE_API_REDIRECTS`、`packages/extensions/cordis-host-runner/src/guard.ts::guardedPlugin`]

关键事实边界：这个 VM 不是恶意代码安全边界。源码明确说明 host-realm helper 仍可能成为 escape route；同步 `vmTimeoutMs` 不能约束异步 host body。动态 Package 只存在当前 DSH 进程内存，不写 repo/config/disk，重启即消失；它也可能改变同一进程后续请求的工具和 prompt。[实现事实：`packages/extensions/cordis-host-runner/src/sandbox.ts::evaluateHostCode`、`packages/extensions/tool-cordis/README.md::Trust stance`、`::Dynamic packages live only`]

Client half 还要通过用户审批；未授权 Client Package 的 `cordis_run` 返回 `awaiting-approval`，浏览器异步确认后才继续。`cordis_stop` 保留所有版本，`cordis_undefine` 才永久删除定义、grant 和版本指针。[实现事实：`packages/extensions/tool-cordis/src/index.ts::cordis_run`、`::cordis_stop`、`::cordis_undefine`、`packages/extensions/cordis-host-runner/src/index.ts::runHostHalf`]

自修改实验建议只在专门 opt-in composition 中做：先 inspect 服务/事件/slot，再 define 一个无副作用 Package，run 后 inspect 提供/等待的 Service，最后 stop/undefine。不要把 VM sandbox、动态 Package 或 workflow worker thread 教成“等价于容器”。[推断：上述 runner、guard、README 的组合语义]

## 8. 运行表面：CLI、Web、ACP、JSON-RPC、TypeScript 与 Python

CLI 的 profile 入口是 `dsh --profile web|headless`；Web bundle 挂载 HTTP/API/浏览器 roster，headless bundle 只提交一次普通 user message、等待 idle 并输出最后 assistant 文本。[实现事实：`packages/bundle/web-app/README.md::dsh-web-app`、`packages/bundle/headless/README.md::headless-runner`、`docs/architecture.md::dsh --profile`]

ACP 是 automation-only Agent Client Protocol server，生产面通过 JSON-RPC stdio；`packages/acp/acp/src/index.ts::apply` 创建和管理 ACP-owned Agent，按 session/update 顺序发送事件，并通过 `approval/request` 回答其拥有 session 的机器策略。[实现事实：`packages/acp/README.md::automation`、`packages/acp/acp/src/index.ts::apply`、`::notify`、`::approval/request`]

SDK server 是另一个可选 Cordis Plugin：`sdk-jsonrpc-server::apply` 用 newline-delimited JSON-RPC stdio 监听，`initialize` 会等待 Loader 当前树 settle，`shutdown` 先 flush response 再 dispose root runtime。TypeScript client 是纯库，负责启动完整 runtime 子进程并通过 stdio 驱动；它不向当前 Context 注册服务。[实现事实：`packages/sdk/protocol/src/index.ts::JsonRpcLineTransport`、`packages/sdk/server/src/index.ts::apply`、`packages/sdk/client/src/index.ts::DeepSeekHarness`]

Python SDK 同样是子进程驱动器：`deepseek_harness.DeepSeekHarness`/`HarnessClient` 通过按行 JSON-RPC 使用 bundled runtime，`Session.run()` 以 prompt 被 inbox 接收至 Agent idle 的活动区间收集结果与通知。[实现事实：`python/README.md::Behavior`、`python/sdk/src/deepseek_harness/api.py::DeepSeekHarness`、`::Session.run`、`python/sdk/src/deepseek_harness/client.py::HarnessClient`]

表面选择原则：人机协作选 Web/CLI 的 approval、questions、commands；编辑器或自动化选 ACP；跨进程产品集成选 SDK JSON-RPC；Python 调用方选 Python SDK；一次性脚本选 headless。它们共享 Agent/Session/Service 组合，不代表各自拥有另一套 Agent Loop。[推断：`packages/interaction/README.md`、`packages/acp/README.md`、`packages/sdk/README.md` 与上述实现]

## 适合中文教学站的 8 章结构

1. **从一次 Turn 看 Harness**：用事件时间线理解 Plugin、Fiber、Session log 和工具流水线。
2. **Cordis 组合实验**：写一个最小 function plugin，观察 Service injection、`ctx.effect()` 和 dispose。
3. **能力 seam 三角色**：以 fs/shell/subprocess/terminal 对比 Definition、Provider、Consumer。
4. **Profile、Bundle、Preset**：通过 patch 层和 agent scope 组成两个不同能力集。
5. **安全与人类授权**：运行 read-only/workspace-write/danger-full-access，模拟 approval ask/never/unavailable。
6. **同一执行世界与远程 POC**：画本地、Landlock、E2B 的数据流，并区分 full/partial 与 POC。
7. **扩展 Agent**：组合 skills、web、subagent、workflow、hooks，完成一个可观察研究任务。
8. **对外运行表面与自修改**：比较 CLI/Web/ACP/SDK/Python，并在 opt-in 环境拆解 Dynamic Cordis 的版本与审批生命周期。

## 3–5 个交互实验建议

1. **插件生命周期沙盒**：挂载一个 `ctx.provide('demo', ...)` + `ctx.on(...)` 的插件，按钮触发 unload；可视化 service/event 注册与 disposer 回收。源码锚点：`docs/cordis-tutorial/02-lifecycle-and-effects.md::fiber.dispose`。
2. **FS TOCTOU 对照**：先 read 文件后让另一个操作改版本，再尝试 edit；对比有/无 `fs-observation-policy` 时的 `FS_STALE_VERSION` 与无 guard 写入。源码锚点：`packages/fs/fs-observation-policy/src/index.ts::ObservedStateGate`。
3. **Sandbox/Approval 状态机**：切换三种 mode 和两种 approval policy，尝试 workspace 外写入；把 runner denial、`SANDBOX_UNAVAILABLE`、`allowed-once`、`unavailable` 映射成四类结果。源码锚点：`packages/sandbox/sandbox/src/index.ts::SandboxMode`、`packages/interaction/user-approval/src/index.ts::ApprovalOutcome`。
4. **Preset 能力拼装器**：拖拽 web/read/shell/write 到两个 Agent scope，比较 tool schema 与 prompt section；禁止在已有消息后 recompose。源码锚点：`packages/preset/agent-presets/src/index.ts::AgentPresets.recompose`。
5. **Dynamic Package 版本实验**：inspect → define `return { apply() {} }` → run → stop → append existing Package → update；单独显示“VM 受限但非安全边界、重启不持久”。源码锚点：`packages/extensions/tool-cordis/src/index.ts::cordis_define`、`::cordis_run`，`packages/extensions/cordis-host-runner/src/sandbox.ts::evaluateHostCode`。

## 明确的事实边界与不确定点

- 本文没有运行 build、test、真实 API、E2B、Landlock 或浏览器流程；内容是提交 `b150a55` 的静态源码与仓内文档取证，不等价于当前机器上的运行验收。
- E2B 是源码明确标注的 provider-composition POC；不能据此宣称默认启用、生产可用或覆盖所有上层状态。[`packages/e2b/README.md::experimental provider-composition POC`]
- Landlock 的 `full`/`partial` 依赖 launcher 的功能 probe 和实际 ABI；源码同时保留 bwrap/Seatbelt/Windows ACL 路径，平台与内核结果不可从 macOS 工作站静态推断。[`packages/sandbox/sandbox-local/src/index.ts::PLATFORM_CHAINS`、`native/landlock-run/docs/support-matrix.md`]
- Dynamic Cordis VM、workflow worker thread 和 Preset 的 `trust` 字段都不是恶意代码隔离承诺；Preset 的 trust 主要供展示，动态 VM 明确可能逃逸，workflow worker thread 明确不是 security boundary。[`packages/extensions/tool-cordis/README.md::Trust stance`、`packages/workflow/README.md::worker threads`、`packages/preset/agent-presets/README.md::Trust`]
- ACP/SDK/Python 是否在某个部署启用，取决于实际 `cordis.yml`/Profile；包存在不等于当前树已挂载。尤其 `tool-cordis` 是 deliberate opt-in，不在 shipped tree。[`docs/tool-catalog.md::@deepseek-ai/dsh-tool-cordis`、`packages/sdk/server/src/index.ts::apply`]
- 安全结论必须区分“实现了拒绝/审批/日志”与“已被生产环境验收”：源码能证明前者，不能凭静态阅读证明后者。
