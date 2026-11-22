# Grok Build 课程核对笔记

## 版本与来源

2026-11-21 对照本地检出和 `git ls-remote --symref origin HEAD refs/heads/main`。xAI 公开同步仓 `xai-org/grok-build` 的远端 `main` 与本地浅克隆均为 `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`，提交时间为 2026-09-29 16:57:09 UTC，提交主题为 “Synced from monorepo”。README 说明这是 SpaceXAI monorepo 中 Rust CLI/TUI 及运行时的定期公开导出。第一方代码采用 Apache-2.0，第三方和 vendored 代码沿用各自许可。下文的本地相对路径均从公开仓根目录出发。 [公开提交][commit] · [随仓说明][readme]

| 字段 | 该快照的值 | 证据 |
| --- | --- | --- |
| 公开 Git commit | `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8` | [公开提交][commit] |
| monorepo 来源戳 | `559751fdcec02d413e4c57c8832ab275e4f44980` | [SOURCE_REV][rev] |
| Rust crate 清单 | `xai-grok-pager` 与 `xai-grok-pager-bin` 均为 `1.0.45` | [Pager 清单][pager] · [二进制包清单][bin] |
| npm 清单 | `@xai-official/grok@0.1.220-alpha.4` | [npm 清单][npm] |

清单值只描述这次源码同步里的打包元数据。课程所称「默认」指相应源码配置回退值。实际会话还受入口、环境、配置、远端设置和 feature gate 影响。远端服务端细节只按公开客户端协议与可观察行为讲解。

## 按故障找证据

| 问题 | 首查入口 | 这次快照证明了什么 |
| --- | --- | --- |
| 一次任务为何继续或结束？ | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/{spawn,run_loop,turn}.rs` 和 `crates/codegen/xai-chat-state/src/actor/mod.rs` | 本地会话由独立线程和 Tokio `LocalSet` 承载。会话 actor 接纳请求并编排 round 与采样循环，聊天状态另有 actor 管理。正常结束、预算耗尽、取消和重复调用硬停进入不同分支。文本响应仍可能遇到待办提示、插话或外层续跑。工具返回后台句柄仅证实启动，命令终态要用句柄另查。 [会话线程][spawn] · [回合终态][turn] · [聊天状态][chat] |
| 已见流式正文，为什么取消仍有效？ | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/{sampler_turn,cancel}.rs`、`src/extensions/notification.rs` | 采样结束要核对在途请求的所有权。等待终态事件被消费是为了保持显示顺序，超时可以继续。取消或改变对话的回退清除请求所有权，晚到响应及其用量不能提交。标准 ACP `session/update` 承载事件增量，Grok 有独立的扩展事件和完成标记。 [采样][sample] · [取消][cancel] · [扩展事件][events] · [ACP 用户指南][acp] |
| 第二个工具被拒，第三个能执行吗？ | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs`、`crates/codegen/xai-grok-tools/src/{bridge.rs,registry/types.rs}` | 顺序准备下，交互明确拒绝、取消或插话为后续调用生成取消结果，已经批准的调用仍进入执行阶段。单条 `PolicyDeny` 生成该调用的错误并允许下一项继续准备。批准项用 FuturesUnordered 收集结果，可解析成相同路径且涉及写入时，使用批内互斥锁。回填用 call ID 配对。锁覆盖这批已知路径，无法把异步外部写入变成本地事务。 [批次准备][tool-batch] · [拒绝分支][tool-reject] · [工具桥][bridge] |
| 文件和对话是否一起回退？ | `crates/codegen/xai-grok-shell/src/session/acp_session_impl/rewind.rs`、`crates/codegen/xai-grok-workspace/src/session/{checkpoint,file_state}.rs` | `All`、`FilesOnly`、`ConversationOnly` 可分别选择。回退到 N 恢复 N 执行前的边界。文件预览用快照检查外部更动。可选 Git 恢复先处理保护分支，文件与 hunk 随后处理，运行结果可以部分成功。对话回退追加 `RewindMarker` 供重放过滤。 [回退分支][rewind] · [文件与 Git 恢复][workspace] |
| 点了允许，命令怎么还是被拒？ | `crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs`、`crates/codegen/xai-grok-sandbox/src/profiles.rs` | 应用审批和 OS 沙箱分别裁决。默认审批与 `auto`、兼容模式 `dontAsk`、`always-approve` 表达不同交互。沙箱默认 `off`。明确请求非 off profile 时使用进程内嵌，避免已经启动的 leader 在另一个约束域执行工具。内置 profile 应用失败可告警继续，显式请求的自定义 profile 应用失败拒绝启动。子进程网络阻断只在 Linux 生效，macOS 的对应限制为 no-op。界面实验假定 Linux 沙箱已生效，分别展示审批与 OS 裁决。 [审批与模式][permission] · [沙箱 profile][sandbox] · [启动分支][sandbox-start] · [失败行为][sandbox-failure] |
| 历史如何重放，追加何时可以重试？ | `crates/codegen/xai-grok-shell/src/session/storage/{mod.rs,replay.rs,jsonl/mod.rs}`、`crates/codegen/xai-chat-state/src/commands.rs` | `updates.jsonl` 是事件依据，`chat_history.jsonl` 是可由事件重建的对话缓存。重放会过滤废弃分支。目录切换带 generation 去重，三态错误区分未写入、已写入但后续失败、确认结果未知。 `Committed` 的写入可只到 page cache。 [事件与对话缓存][storage] · [重放][replay] · [严格追加][append] · [三态定义][strict] |
| 压缩后如何继续？ | `crates/codegen/xai-grok-shell/src/util/config/resolve/compaction.rs`、`src/session/compaction.rs` | 阈值按环境变量、模型配置、会话配置、远端模型配置、远端全局配置逐级查找，回退值为 85%。手动压缩另有入口，不受自动触发阈值限制。压力表只模拟成功后的占用变化。full-replace 摘要后重建系统、项目与运行时信息。 `CompactionCheckpoint` 记录独立压缩历史文件的引用。 [阈值解析][threshold] · [压缩实现][compact] · [压缩点写入][compact-point] |
| 观察怎样成为跨会话知识？ | `crates/codegen/xai-grok-config/src/memory_v2.rs`、`crates/codegen/xai-grok-shell/src/session/memory/v2_capture.rs`、`crates/codegen/xai-grok-memory/src/v2.rs` | V2 有独立配置与阶段。捕获发布不可变观察至 `observations/_inbox`，后续整理维护 `topics`，再生成 `MEMORY.md`。批量整理有单独开关。 [配置][memory-config] · [捕获][memory-capture] · [V2 文件布局][memory-v2] |
| 发现的扩展为何无法调用？ | `crates/codegen/xai-grok-agent/src/builder.rs`、`crates/codegen/xai-grok-shell/src/agent/folder_trust.rs` | 工具组装与项目来源信任各自把关。插件发现、启用、信任与执行是几个不同阶段。MCP 定义可经延迟发现，也可内联。 `PreToolUse` 可拒绝、请求审批或改写参数，超时等执行故障通常放行，改写后输入未过 schema 则阻断。 [组装][builder] · [目录信任][trust] · [插件][plugins] · [Hooks][hooks] |
| 子代理异步结果何时唤醒父会话？ | `crates/codegen/xai-grok-tools/src/implementations/grok_build/task/{mod.rs,coordinator.rs}`、`crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs` | 后台执行默认为 true，共享工作区为默认执行位置。可配置的嵌套深度回退为 1，普通会话并发数回退为 32。worktree 的创建或恢复可能回落到共享工作区。后台完成还需满足自动唤醒开启、结果未取消、未显式 kill、阻塞等待者未收件、goal 未运行以及父通道开放。仅看父回合是否取消不能推断子结果。 [调度协调][coordinator] · [唤醒谓词][wake] · [深度和准入配置][depth] · [并发默认值][admission] · [worktree 处理][isolation] · [用户指南][subagents] |
| 谁持有客户端重连和版本协调？ | `crates/codegen/xai-grok-pager-bin/src/main.rs`、`crates/codegen/xai-grok-shell/src/leader/mod.rs` | CLI 组装 TUI 及 stdio、serve 等入口。版本检查只在双方可解析且客户端严格更新时替换 leader。无法连接与存活异常由独立路径处理。headless 脚本提供 plain、JSON、streaming-json、streaming-messages-json，和远程 headless relay 分开。 [入口][main] · [leader 版本比较][leader] · [输出格式][headless] |

## 失败预算

请求恢复由错误类型、调用阶段和剩余预算共同决定。HTTP 413 或明确的字节超限可触发剥图重试，已无图片时返回失败。上传中 reset/broken pipe 仅在该错误本身允许重试且请求含图时触发预先剥图。token 超窗转回会话处理，压缩后要重建提示和运行态。 [分类][retry] · [剥图执行][retry-strip] · [压缩实现][compact]

限流重试有独立上限，允许重试时优先使用服务端秒数，缺省用带抖动的退避。避免重复输出是具体调用者的选择。启用 `retry_only_before_output` 且已经观察到输出时结束该请求；默认策略的该字段为 false。 [分类与预算][retry] · [输出边界][retry-output] · [默认设置][retry-config]

## 公开快照中的相关入口

- **Claude 设置导入**由扫描归纳可迁移项，再由用户选定。权限字符串先解析、无对应工具或语法错误的规则会跳过，环境变量和 MCP 配置走各自的来源收集。 [导入扫描][claude]
- **管理员设置**由 `RequirementsToml::from_value` 解析为类型化结构。 `[ui].disable_bypass_permissions_mode` 的组织锁与可切换的用户默认模式分属不同设置。 [解析器][requirements] · [配置参考][config-doc]
- **相对权限规则**计算书写路径与物理 cwd 下的路径候选。普通规则拒绝的处理和用户在弹窗明确拒绝的处理，仍需回到各自的工具批次分支验证。 [路径匹配][path] · [批次准备][tool-batch]

[commit]: https://github.com/xai-org/grok-build/commit/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
[readme]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/README.md
[rev]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/SOURCE_REV
[pager]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/Cargo.toml#L3
[bin]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager-bin/Cargo.toml#L3
[npm]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/npm/grok/package.json#L3
[spawn]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/spawn.rs#L2549
[turn]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L2037
[chat]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-chat-state/src/actor/mod.rs#L30
[sample]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/sampler_turn.rs#L1716
[cancel]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/cancel.rs
[events]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/extensions/notification.rs#L517
[acp]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md
[tool-batch]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L484
[tool-reject]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L1923
[bridge]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/bridge.rs#L69
[rewind]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/acp_session_impl/rewind.rs#L121
[workspace]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-workspace/src/session/checkpoint.rs#L350
[permission]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md#permission-modes
[sandbox]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md#built-in-profiles
[storage]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/storage/mod.rs#L254
[replay]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/storage/replay.rs#L158
[append]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs#L537
[strict]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-chat-state/src/commands.rs#L46
[threshold]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/util/config/resolve/compaction.rs#L38
[compact]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/compaction.rs
[compact-point]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/compaction.rs#L2451
[memory-config]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-config/src/memory_v2.rs#L61
[memory-capture]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/session/memory/v2_capture.rs
[memory-v2]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/v2.rs#L185
[builder]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/builder.rs
[trust]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/agent/folder_trust.rs
[plugins]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md#trust-and-security
[hooks]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md#output-blocking-hooks
[coordinator]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/task/coordinator.rs#L1252
[depth]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/config/mod.rs#L249
[admission]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/task/admission.rs#L6
[isolation]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs#L709
[subagents]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md
[main]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager-bin/src/main.rs#L1597
[leader]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/leader/mod.rs#L115
[headless]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md#output-formats
[claude]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/claude_import.rs#L63
[requirements]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-config/src/config_requirements.rs#L167
[config-doc]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/26-config-reference.md#requirementstoml
[path]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-permission-rules/src/policy/path_match.rs#L49

[sandbox-start]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md#L169-L182
[sandbox-failure]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/18-sandbox.md#L215-L232
[wake]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/agent/subagent/spawn.rs#L437-L479
[retry]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-sampler/src/retry.rs#L93-L143
[retry-strip]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-sampler/src/actor/request_task.rs#L366-L434
[retry-output]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-sampler/src/actor/request_task.rs#L147-L177
[retry-config]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-sampler/src/config.rs#L193-L218
