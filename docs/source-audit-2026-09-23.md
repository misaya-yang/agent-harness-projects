# 七个 Agent 源码增量审校

本文件是课程维护证据，不进入学生正文。范围为本机已下载仓库的下列 HEAD；它们是本轮检查的固定输入，不代表之后的上游最新提交。旧课程主体仍以 2026-09-03 的分析快照为基线；新增段落只陈述下列已核对增量。

| 项目 | 本轮 HEAD | 旧课程基线 | 纳入课程的变化与证据 |
|---|---|---|---|
| Codex | `7dae8c53d97e61cd774e4d6bcca5243c29ca615c` | `498d40b29f60` | `8de2d336` 引入请求元数据与响应流扩展钩子，见 `codex-rs/ext/extension-api/src/model_request.rs`、`codex-rs/core/src/model_request.rs`；`a6df7385` 令 Thread-owned Guardian context 常开；`b4b055cf` 覆盖待处理跨 Agent 消息的 rollout 持久化。 |
| Grok Build | `f0e3be1100ef5252488e3be8bb0e91cf68d8c305` | `72a61251fcff` | `crates/codegen/xai-grok-memory/src/lib.rs` 明确 legacy / V2 两条隔离管线及启用配置；`v2_capture.rs`、`v2_consolidation.rs` 和 shell 会话接线区分观察捕获与整理。V2 按配置启用，不写成普遍默认。 |
| DeepSeek Harness | `46a7f68b0922371ce7144b668b90e377d8e799f4` | `49a606bc5b59` | `5ea77078d6`、`07ad70817f` 对插件 peer 兼容性做启动拒绝；`d3086e6571` 展示工具 preparing/start/result 阶段；`555b664b08` 与 `0fadb08fbd` 修订压缩时的输出预留与消息预算。准备状态是客户端投影，不等于副作用完成。 |
| Pi Agent | `b45597504eeaba1f11a9920a1d1048c361ed4b8e` | `4e69b0c28060` | `packages/coding-agent/CHANGELOG.md` 的 0.87.0 说明 `finishTurn` 替代 `shouldStopAfterTurn`、`SessionManager` 成为模型上下文权威、`ContextEditEntry` 保留原始历史；Unreleased 中 `provider_stream_event` 是诊断观察点。当前 durable SQLite/JSONL 包仍需独立核对完整 Agent 接线，不作为已上线会话默认能力。 |
| OpenCode | `5fcfb06f94133f78170d5ad4fd2a2be48757f0f6` | `b578b7261fc9` | `95daf90` 修复 ACP 会话选项与 reasoning 事件边界；`packages/opencode/src/effect/app-runtime.ts` 仍同时连接 v1 会话结构与 v2 投影服务。课程只按入口比较两代，不宣称已经整体切到 v2。模型目录更新不改变本轮核心教学。 |
| OpenClaw | `8f463a22fce001fdf43e385a6a800c5afb42c84a` | `5e9875ab56a8` | `a3376d5fa9` 与 `docs/tools/subagents/tool-reference.md` 规定子任务取消需要当前控制权；读取或等待权限不会继承取消权。会话列表性能与诊断改动暂不进入核心课。 |
| Hermes Agent | `37aad38c62771d223cdce7e3d5e3157334f1ce82` | `97f3229dfdc0` | `0f647e8bbb` 的真实后端测试覆盖多客户端会话所有权；`11fb429f49`、`8eda97cafb` 与 Webhook 文档说明可选的跨平台投递镜像，默认关闭并按目标 profile 限定。 |

## 教学裁决

- 本轮只纳入能改变设计判断、调试顺序或面试回答的变化。模型列表、纯视觉优化、性能微调等版本噪声不自动变成课程章节。
- 页面中的原有数值和实验装置仍受各自旧基线约束；新段落单独标记“源码更新”或“源码复核”。若要把全课声明为新 HEAD 的完整快照，必须逐章重新验证每个数字、入口与失败分支。
- 学生正文只给机制、运行情境、反例和工程练习；文件路径与提交映射仅留在本证据索引。
