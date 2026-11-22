# 七个 Harness 的源码核对

2026 年 11 月 21 日按纽约本地日期，依据所提供工作树的 Git 修订核对。包版本、公共导出和开发分支之间的差异见各课程的证据说明。

| 项目 | 源码提交 | 课程重点 | 核对笔记 |
|---|---|---|---|
| Codex | [`6fd58416e313`](https://github.com/openai/codex/commit/6fd58416e3134633539641d74755b177b0342a5a) | ThreadStore、双向 App Server 请求与权限配置；压缩工作集和持久历史分开。 | [证据与边界](codex-course.md) |
| Grok Build | [`2bdd1d6a6369`](https://github.com/xai-org/grok-build/commit/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8) | 单写者会话 Actor；工具规则拒绝和用户拒绝影响批次的方式不同。 | [证据与边界](grok-course.md) |
| DeepSeek Harness | [`2e39e70496aa`](https://github.com/deepseek-ai/deepseek-harness/commit/2e39e70496aa02986ca6a820c5d497e816b69d7e) | 实时帧与持久结算分开；POSIX SSH Provider 可组成远程执行环境。该版本是开发者预览。 | [证据与边界](deepseek-harness-runtime.md) |
| Pi Agent | [`9c4652688590`](https://github.com/earendil-works/pi/commit/9c4652688590abb836b40ebd1e4725ecf9a7c7d1) | JSONL 分支会话、MCP、Tool Search 与 Codemode；Durable、SDK 和 RPC 各有边界。 | [证据与边界](pi-agent-runtime.md) |
| OpenCode | [`73a0eae88de4`](https://github.com/anomalyco/opencode/commit/73a0eae88de47f10068a0f9dc7a743638fa3d830) | 持久 Inbox 和会话协调器推进 Step；实时 SSE、状态恢复与可选的事件正文留存分开处理。 | [证据与边界](opencode-course.md) |
| OpenClaw | [`3c8c7bf781fb`](https://github.com/openclaw/openclaw/commit/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd) | 会话邮箱、按标记恢复与 Automations；SQLite 默认，可按存储家族配置 PostgreSQL。 | [证据与边界](openclaw-course.md) |
| Hermes Agent | [`c7a3fe245d6b`](https://github.com/NousResearch/hermes-agent/commit/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8) | 持久回合租约、分阶段循环与后台 review；六个内置执行后端支持插件扩展。 | [证据与边界](hermes-course.md) |

## 第二轮交叉复核

每门课由另一位审阅者对照同一提交复核。下表列出容易得出错误工程判断的条件，以及可以用来区分两种情况的证据。

| 项目 | 需要分清的情况 | 用什么判断 |
|---|---|---|
| Codex | 恢复历史时识别旧回退记录，和客户端今天能否发起回退，是两个问题。 | 当前 App Server 已移除 `thread/rollback`，分页线程可用 `thread/revert`。读取旧 `ThreadRolledBack` 事件是磁盘兼容行为。 |
| Grok Build | 一次工具审批通过后，进程仍然可能无法写入目标。 | 分别看工具审批结果、实际加载的沙箱配置和操作系统。在课程实验里可独立改变审批与 Linux 沙箱设置。 |
| DeepSeek Harness | 实时显示过的助手输出、已保存的一次尝试和下一步模型采用的历史，可能各不相同。 | 区分“工具尚未启动”“调用可能已执行但结果未知”“已有结算结果”。日志刷新能确认记录已保存，外部操作的实际效果仍要单独核对。 |
| Pi Agent | 普通工具结果返回后，模型仍可能需要处理结果；Follow-up 可以继续等在队列里。 | 跟踪内部工具循环是否结束，以及外层循环何时取 Follow-up。Durable 重启时还要检查工具是否声明允许安全重放。 |
| OpenCode | SQLite 查询得到的当前状态、实时 SSE 与可以逐条补读的事件日志，提供的保证不同。 | 普通配置会更新投影与序号；事件正文另受持久化选项控制。workerd 显式开启留存以支持恢复。 |
| OpenClaw | 有持久运行标记，也要满足恢复时间窗、运行所有权和权限等条件才能接续。 | 对照启动账本与当前活动执行者；工具审批通过后，执行宿主仍会进行自己的检查。 |
| Hermes Agent | “请求中断子任务”和“子任务已经停止、外部效果已撤销”之间，可能还有未知状态。 | 查看子任务是否实际退出、结果是否交付，以及目标文件或外部系统的实际状态，再决定是否重试。 |

课程里的实验在浏览器中模拟固定场景。源码核对和教学实验分别回答“该快照怎样实现”和“改变这个条件会看到什么”；生产服务的可用性、时延和模型表现还需要在相应部署环境中测量。
