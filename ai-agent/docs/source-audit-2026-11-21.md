# 七个 Harness 的源码核对

2026 年 11 月 21 日按纽约本地日期，依据所提供工作树的 Git 修订核对。包版本、公共导出和开发分支之间的差异见各课程的证据说明。

| 项目 | 源码提交 | 课程重点 | 核对笔记 |
|---|---|---|---|
| Codex | [`6fd58416e313`](https://github.com/openai/codex/commit/6fd58416e3134633539641d74755b177b0342a5a) | ThreadStore、双向 App Server 请求与权限配置；压缩工作集和持久历史分开。 | [证据与边界](codex-course.md) |
| Grok Build | [`2bdd1d6a6369`](https://github.com/xai-org/grok-build/commit/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8) | 单写者会话 Actor；工具规则拒绝和用户拒绝影响批次的方式不同。 | [证据与边界](grok-course.md) |
| DeepSeek Harness | [`2e39e70496aa`](https://github.com/deepseek-ai/deepseek-harness/commit/2e39e70496aa02986ca6a820c5d497e816b69d7e) | 实时帧与持久结算分开；POSIX SSH Provider 可组成远程执行环境。该版本是开发者预览。 | [证据与边界](deepseek-harness-runtime.md) |
| Pi Agent | [`9c4652688590`](https://github.com/earendil-works/pi/commit/9c4652688590abb836b40ebd1e4725ecf9a7c7d1) | JSONL 分支会话、MCP、Tool Search 与 Codemode；Durable、SDK 和 RPC 各有边界。 | [证据与边界](pi-agent-runtime.md) |
| OpenCode | [`73a0eae88de4`](https://github.com/anomalyco/opencode/commit/73a0eae88de47f10068a0f9dc7a743638fa3d830) | 持久 Inbox 和会话协调器推进 Step；实时 SSE 与事件恢复分开。 | [证据与边界](opencode-course.md) |
| OpenClaw | [`3c8c7bf781fb`](https://github.com/openclaw/openclaw/commit/3c8c7bf781fbf3e2c614a446eee0ad3a87b400fd) | 会话邮箱、按标记恢复与 Automations；SQLite 默认，可按存储家族配置 PostgreSQL。 | [证据与边界](openclaw-course.md) |
| Hermes Agent | [`c7a3fe245d6b`](https://github.com/NousResearch/hermes-agent/commit/c7a3fe245d6bf610f73ff555d57e4ed632f8ded8) | 持久回合租约、分阶段循环与后台 review；六个内置执行后端支持插件扩展。 | [证据与边界](hermes-course.md) |
