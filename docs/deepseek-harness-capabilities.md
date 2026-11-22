# DeepSeek Harness 能力地图与教学路线

课程依据本地 `deepseek-harness` 提交 `2e39e70496aa02986ca6a820c5d497e816b69d7e`，清单版本 `0.2.2-rc.5`，上游状态为 developer preview。能力是否在运行时可用取决于有效 Profile 与 Agent Preset。下列路径相对于上游仓库。[固定源码快照](https://github.com/deepseek-ai/deepseek-harness/tree/2e39e70496aa02986ca6a820c5d497e816b69d7e)

## 1. 从工具回溯能力的三个角色

Service Definition 声明接口，Provider 实现接口，Consumer 使用接口。`FileSystem`、`ShellExecutor`、`SubprocessRuntime` 分别定义路径与文件操作、命令语义、进程/PTY 原语。`tool-fs` 只消费 `ctx.fs`；Bash Provider 先用 `resolve()` 固定 workdir、timeout 和输出上限，再把 argv/stdio 等工作交给 `ctx.subprocess`；`TerminalSessionService` 管理按 Agent 授权的持久终端。源码见 `docs/capability-seams.md`、`packages/fs/fs/src/index.ts`、`packages/shell/shell/src/index.ts`、`packages/subprocess/subprocess/src/index.ts`、`packages/terminal/terminal/src/index.ts`。

`tool-fs` 用 `ctx.fs` 暴露 `read`、`read_image`、`write`、`edit` 和 `apply_patch`。`fs-observation-policy` 是独立的 read-before-write/edit 与版本保护插件，base 中该行默认 disabled。普通读写指导、文件 confinement 与观察事件各有自己的实现。源码见 `packages/fs/tool-fs/src/index.ts`、`packages/fs/fs-observation-policy/src/index.ts` 和 `packages/bundle/base/cordis.patch.yml` 的 `fs-observation-policy` 行。

**练习**：分别用文件工具读 `config/app.json`、用 Bash 做一次检查、用持久 PTY 保留 REPL 状态。为三个 Consumer 标出服务和 Provider，再比较启用或停用 `fs-observation-policy` 对外部修改后编辑的影响。

## 2. 本地与远程执行世界

本地 `fs-local` 和 `subprocess-local` 共用宿主命名空间。`fs-sandbox` 对文件工具的 fresh canonical target 检查写权限；`bash-sandbox` 经 `ctx.sandbox` 约束命令进程。文件 Provider 的限制与进程 runner 的限制要分别配置。源码见 `packages/fs/fs-sandbox/src/index.ts`、`packages/shell/bash-sandbox/src/index.ts`、`packages/sandbox/sandbox-local/README.md`。

当前源树给出 POSIX SSH 的自定义 Profile 组合。`dsh-ssh` 在宿主连接已安装的远程 helper，`fs-ssh`、`subprocess-ssh` 和 `sandbox-ssh` 共用该连接。文件、进程和终端在远端，Harness 控制面、模型调用与 Session 存储在宿主。E2B 曾验证这个抽象，相关 Provider 已移除；仓内决策记录了独立控制流、背压和取消等维护成本。源码见 `packages/ssh/ssh/README.md`、`packages/ssh/ssh-helper-runtime/README.md` 和 `.agents/notes/implemented/simplification/2026-09-11-remove-e2b-providers.md`。

**练习**：在执行世界交换台比较本地和 POSIX SSH。沿着一次文件读取和一次 Bash/PTY 调用标出路径解析、进程和存储的位置。连接中断时，把工具的副作用标为待核查，并查阅 helper 对清理的所有权。

## 3. 文件沙箱、审批与权限 Preset

Sandbox 提供 `read-only`、`workspace-write` 和 `danger-full-access` 三种文件效果模式。`workspace-write` 的主写边界随 Session 当前有效工作目录移动，例如进入 worktree 后改用该目录；实际授权也受后端和额外可写根影响。网络和进程可见性另有边界。源码见 `packages/sandbox/sandbox/src/index.ts`、`packages/sandbox/sandbox-policy/src/index.ts` 和 `docs/upgrade-guide/v0.2.2-rc.4/workspace-write-boundary-follows-root/guide.md`。

本地 runner 按平台选取。Linux 依次 probe bwrap、Landlock；macOS 使用 Seatbelt；Windows 使用 restricted-token/ACL。Linux 链全失败或平台无链时，受限执行报 `SANDBOX_UNAVAILABLE`。当前单候选的加载路径直接选 runner；Windows 和较旧 Landlock ABI 可报告 partial，Landlock 实际能力以功能探测为准。源码见 `packages/sandbox/sandbox-local/src/index.ts::PLATFORM_CHAINS`、同包 README，以及 `native/system/docs/support-matrix.md`。

Approval 是一次性渠道。`ask` 交给已组合的 answerer，可返回 `allowed-once`、`rejected`、`cancelled` 或 `unavailable`；`never` 在交互派发之前拒绝。受限 FS 的普通越界写返回 `FS_SANDBOX_DENIED`，工具可以另发显式提权调用；获批的策略仅用于这次调用。权限 preset 将文件模式和审批策略组合成一个选择，默认 `workspace-write` 搭配 `ask`，`danger-full-access` 搭配 `never`。源码见 `packages/fs/tool-fs/src/sandbox.ts`、`packages/interaction/user-approval/src/index.ts::ApprovalService` 和 `packages/interaction/permission-presets/README.md`。

**练习**：进入 worktree 前后对同一个目标路径评估 `workspace-write`。分别走普通调用、明确获批的单次提权、没有 answerer 和 `never` 四种路径，标出文件授权、审批结论和审计记录。

## 4. Profile、Bundle 与 Agent Preset

Profile 组合进程级 bundle 和 patch。Web、headless、SDK、ACP 以 base 为底层；`sdk-minimal` 有独立完整组合。Preset 是声明式 `dsh-agent-preset` 插件行，其 `config.plugins` 决定 Agent 可见的 Prompt、工具和技能。`AgentPresetRegistry` 挂载独立 Loader tree，Agent 及继承该组合的 child 可以持有同一代组合；新会话与恢复可能使用当前声明。公开 `select()` 用 Turn 边界锁定已开始的 Session，挂载审核拒绝泄漏到全局的 Service；隔离 Service 和 Consumer 应在同一 `cordis:group` realm。源码见 `docs/architecture.md`、`packages/preset/agent-preset-registry/src/index.ts::select`、`::composeFrom`、`mount.ts`。

**练习**：给一个只读研究任务和一个编码任务配置不同工具集合。说明变更发生在 `config.plugins`，并单独写出各任务执行时使用的文件策略。用已开始的 Session 检查切换锁定依据。

## 5. 扩展能力与运行时检查

Skills 从 registry/catalog 发现后按需加载。Web 通过 `ctx.web` 选择 search/fetch Provider；Subagent 支持一次性和可继续的 child，其运行形态由具体 Provider 决定。Hooks 适配器在 `packages/experimental/`，将外部协议桥接到现有 Agent 与工具事件。Workflow 使用 `workflow-ptc`，在共享 Node PTC runtime 的独立进程中按调用 Session 文件策略运行，workflow engine 管编排与子 Agent，PTC Provider 管执行、传输和进程清理。源码见 `packages/skill/README.md`、`packages/web/README.md`、`packages/subagent/subagent/README.md`、`packages/experimental/hooks-codex/README.md` 与 `docs/subsystems/workflow.md`。

Web 的 Standard 与 Creator 给模型 `cordis_inspect`，可发现 Host/Client 只读查询以及 live Loader 配置；Client 查询依赖已连接页面。持久安装与启用 bundle 由 Plugin Manager 管理。从旧接口迁移时，把多个检查命令换成一个 `cordis_inspect` 并用 `query` 选择 provider 与 method。`cordis-host-runner` 仍为程序及浏览器控制提供进程内临时 Package 生命周期，Client half 经浏览器审批，Host half 在 `node:vm` realm 求值。VM 只提供执行作用域，安全判断取决于宿主权限与进程边界。源码见 `packages/extensions/tool-cordis/README.md`、`packages/boot/plugin-manager/README.md`、`packages/extensions/cordis-host-runner/README.md` 和 `docs/upgrade-guide/v0.2.2-rc.3/cordis-inspect-tool/guide.md`。

Agent Team 默认关闭，启用后在根 Session 管理共享任务板。任务更新用预期 revision 做比较并交换，更新会记录 `team/task` 并等待 flush。发现成员、`send_message` 与冷恢复都归 subagent runtime，`messageId` 只确认入箱。历史 mailbox 记录可以解码，当前运行时不会为它们重投或确认。源码见 `packages/team/agent-team/README.md`、`packages/subagent/tool-subagent-control/README.md`。

**练习**：想知道运行版本与生效的工具，选择只读检查；想给下一次启动加入一个 MCP bundle，选择 Profile 与 Plugin Manager。解释哪条路径需要改文件、哪条路径需要已连接的 Client。

## 6. 运行表面

Web 和 Electron Desktop 共用 Web app，Desktop 通过自己的 carrier 连接打包的 Host。Headless 发送一条任务输入、等待 idle 后输出末条有效助手文本。ACP 是 automation-only 的 JSON-RPC stdio 入口；其交互由协议适配器处理。TypeScript SDK 驱动同版本 `dsh` 子进程的逐行 JSON-RPC，Python SDK 驱动 runtime wheel 携带的同一 CLI，默认选择 `sdk`。源码见 `apps/desktop/README.md`、`packages/bundle/headless/README.md`、`packages/acp/README.md`、`packages/sdk/client/README.md` 和 `python/README.md`。

课堂验证采用源码和合成输入。实际平台 confinement、远端清理和模型调用需要各自环境中的验收。
