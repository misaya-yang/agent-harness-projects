# Hermes Agent 内核课程 · 事实素材

> 教学站课程素材稿。所有定位基于本地仓库
> `/Users/misaya.yanghejazfs.com.au/misaya_project/Agent_projects/hermes-agent`（commit `a0ca7c1`）。
> 证据等级标注：[源码确认] 代码可直接读到；[文档声明] 仅 README/AGENTS.md/docs 陈述；[合理推断] 由结构推断。

## 0 身份卡

| 项 | 结论 | 证据 |
|---|---|---|
| 上游仓库 | `https://github.com/NousResearch/hermes-agent.git` | `git remote -v` [源码确认] |
| Commit | `a0ca7c1`（2026-08-19，"feat(cron): add explicit one-shot re-arm"）；**整库仅 1 个 commit**，为 squash 导入，无增量历史 | `git log --reverse` [源码确认] |
| 版本 / 语言栈 | Python `>=3.11,<3.14`，`name = "hermes-agent"`, `version = "0.20.5"`，MIT，作者 Nous Research | `pyproject.toml:2-15` [源码确认] |
| 体量 | 巨型单体：`cli.py` 1,002,965 字节 / 21,510 行，`run_agent.py` 429,452 字节，`hermes_state.py` 650,141 字节；agent/ 153 文件、tools/ 139 文件、gateway/ 64 文件 | `ls -la`、`wc -l` [源码确认] |
| 产品定位一句话 | "The self-improving AI agent"——内置学习闭环（技能自创自改、记忆 nudge、FTS5 自我会话回忆）、一个内核跑在 CLI/网关/TUI/桌面多表面上的个人助理 | README.md:20-22 [文档声明，结构佐证见下] |
| 部署面 | $5 VPS、GPU 集群、serverless（Daytona/Modal 休眠）、Termux/Android、原生 Windows、Docker(s6)、Nix | README.md:22-26、`constraints-termux.txt`、`flake.nix`、`docker/` [源码确认存在] |

**与 OpenClaw 的谱系关系（两代互认，文件格式即接口）**：

- OpenClaw 侧 `docs/install/migrating-hermes.md`：`openclaw migrate apply hermes` 从 `~/.hermes` 导入 `SOUL.md`、`AGENTS.md`、`memories/MEMORY.md`+`USER.md`（append 合并不覆盖）、递归收集 `skills/**/SKILL.md`、`config.yaml` 的 model/providers/MCP；`plugins/`、`sessions/`、`logs/` 归档不加载。[文档声明 + openclaw 源码确认]
- Hermes 侧 `hermes_cli/claw.py:1-9`：`hermes claw migrate` 反向导入 OpenClaw；`claw.py:56` `_OPENCLAW_DIR_NAMES = (".openclaw", ".clawdbot", ".moltbot")`（连 OpenClaw 的两个旧名一起认）；真正的迁移器是 optional-skill `optional-skills/migration/openclaw-migration/scripts/openclaw_to_hermes.py`。[源码确认]
- **字节级事实（注意证据域）**：`ENTRY_DELIMITER = "\n§\n"` 在 `tools/memory_tool.py:78` 与 `openclaw_to_hermes.py:30` 完全一致——但两者**都是 hermes 仓库文件**，只证明迁移脚本写目标 store 时对齐自家记忆工具，不构成“两代共享格式”的证据。openclaw 仓对 `§` 零命中，其 `extensions/migrate-hermes` 原样搬运文件。可核的跨两代资产是文件族谱系（SOUL.md/MEMORY.md/SKILL.md）+ 双向迁移脚本。[源码确认]
- 方向裁决：两边文档各称"从对方迁移到我"，本地 git 历史（单 commit）无法判定谁先谁后。[合理推断] SOUL.md / MEMORY.md+USER.md / SKILL.md / 单 gateway 进程 / cron-automations 这一族概念是两代共同血统，OpenClaw（Node/TS，`package.json` version `2026.8.1`）是同一概念族的 TypeScript 重实现与后继产品。
- 附证：`hermes_cli/main.py:36` 的 help 文案 "OpenClaw native → Hermes + Honcho"——Hermes 把"OpenClaw 用户 + 外挂 Honcho 用户建模"当作自己的目标形态。[源码确认]

**Hero thesis**：Hermes 是"单体 Python 写成的自演化个人助理内核"：学习闭环（回合 nudge → 后台自省 → 记忆/技能写回）不是外围功能而是接进 agent loop 的一等公民；“prompt 缓存神圣 + 核心窄腰”两条宪法压住一个 43 万字符的 `AIAgent`；同一个内核同时驱动 CLI、23+ 平台消息网关、TUI、Zed ACP、MCP server、Electron 桌面六面；并与 OpenClaw 互为两代、共享文件格式谱系。

## 1 源码路线

| # | 入口 | 符号 | 回答的问题 |
|---|---|---|---|
| 1 | `AGENTS.md`（95KB，仓库根） | "What Hermes Is" + "Footprint Ladder"（:24 narrow waist、:71 阶梯） | 这个内核的设计宪法是什么？为什么工具这么少而插件这么多？ |
| 2 | `run_agent.py` | `class AIAgent` :421；`run_conversation` :8546；`chat` :9026；console script `hermes-agent = "run_agent:main"`（`pyproject.toml:373`） | 内核是什么形状？为什么说它是 god-file（AGENTS.md 明示正在拆）？ |
| 3 | `agent/conversation_loop.py` | `run_conversation` :1822；while :2017；final-response 分支 :7667 | 真正的执行循环在哪一行终止一个回合？ |
| 4 | `hermes_cli/main.py` | `main()` :12650；45 个 `subcommands/*.py`；chat 延迟 `from cli import main` :3235 | `hermes` 命令如何路由到六个运行表面？ |

阅读顺序建议：AGENTS.md（宪法）→ conversation_loop（主循环）→ 按章展开。`agent/` 目录是被 god-file 反向提取出来的模块群（transports/、tool_executor.py、background_review.py…），是观察"单体如何模块化"的活教材。

## 2 核心执行链

```
用户输入 (cli.py REPL / gateway adapter / tui_gateway RPC / ACP prompt)
        │
        ▼
 AIAgent.run_conversation (run_agent.py:8546 ──转发──▶ conversation_loop.py:1822)
        │
        ├─ 系统提示：_restore_or_build_system_prompt (conversation_loop.py:865)
        │    └─ stable 前缀缓存复用 + cache markers (prompt_caching.py:170)
        ├─ preflight 压缩：_compressor.should_compress (conversation_loop.py:2684)
        │
        ▼ while (api_call_count < max_iterations and budget.remaining > 0)  (:2017)
 API 调用：interruptible_api_call / _streaming_ 版（daemon 工作线程，
 │          chat_completion_helpers.py:1335/:3288；主线程 join(0.3) 轮询中断）
 │          transport 分发：codex_responses / anthropic_messages / bedrock /
 │          默认 openai chat.completions（chat_completion_helpers.py:926-1000）
 ▼
 assistant_message.tool_calls 判定 (:7031)
 ├─ 有 → 去重/uniquify → _execute_tool_calls (run_agent.py:8377)
 │        并行段/顺序屏障切段 → tool_executor.py:1092/:1946/:2858
 │        审批闸门 tools/approval.py（DANGEROUS_PATTERNS :774，12 hardline+47）
 │        结果 make_tool_result_message 回注 messages → continue (:7665)
 └─ 无 → final_response (:7667) → finalize_turn (turn_finalizer.py:121)
          └─ 回合尾：memory/skill nudge 检查 (:796-803) → 后台 review fork
```

每步定位（全部 [源码确认]）：

1. 循环体：`agent/conversation_loop.py:1822` `run_conversation`；while 条件 :2017 含 `_budget_grace_call` 宽限。
2. 终止：无 tool_calls 即最终回答（:7667 `else: # No tool calls - this is the final response`）；预算耗尽 `budget_exhausted`（:2064）；中断 `interrupted_by_user`（:2034）。
3. 模型层：`IterationBudget`（agent/iteration_budget.py）；`max_iterations` 默认 `sys.maxsize`（run_agent.py:455）。
4. 并发模型：**核心循环完全同步**，异步只在网关外围；API 在 daemon 线程，取消走 socket abort + `owner_tid` 所有权（chat_completion_helpers.py:1369-1395）。
5. 回注格式：`{"role":"tool","tool_call_id":...}`（tool_dispatch_helpers.py:541 `make_tool_result_message`）。
6. interrupt-and-redirect：`AIAgent.redirect`（run_agent.py:3542）只掐当前请求，下一迭代注入真实 user 修正消息（conversation_loop.py:373）；不打断的 `steer()` :3506。

## 3 十二章规划

### 00 课程入口 `COURSE MAP`
**h2**：一个 43 万字符的 Python 类，如何同时是聊天机器人、运维机器人和你口袋里的助理。
lede：Hermes 的特别之处不是拆得多干净（恰恰相反，它是 god-file 之王），而是"学习闭环 + 缓存宪法 + 六面同源"三件事在同一个进程里咬合成闭环。本章给出地图与三条主线。
事实：
- v0.20.5、MIT、Python 3.11-3.13（pyproject.toml:2-13）[源码确认]
- `pyproject.toml:372-375` 三个 console script：`hermes` / `hermes-agent` / `hermes-acp` [源码确认]
- AGENTS.md:24-29 两条宪法：prompt caching sacred、narrow waist [源码确认]
- 依赖全部精确 pin `==X.Y.Z`，理由写明是对 Mini Shai-Hulud PyPI 蠕虫的供应链回应（pyproject.toml:20-27 注释）[源码确认]
实验：atlas-locator（先给地图再给症状）。

### 01 执行循环 `CORE LOOP`
**h2**：回合终止的唯一正常条件是"模型不再请求工具"——预算、中断、重试都只是异常出口。
lede：从 `run_agent.py:8546` 的转发器出发，进入 `agent/conversation_loop.py:1822` 的真实 while 循环，看清一个同步内核如何用工作线程假装异步。
事实：
- while 条件与宽限调用 conversation_loop.py:2017/:2058 [源码确认]
- final-response 分支 :7667；`finalize_turn`（turn_finalizer.py:121）统一收尾 [源码确认]
- API 调用 `interruptible_api_call`（chat_completion_helpers.py:1335）在 daemon 线程，主线程 `t.join(timeout=0.3)` 轮询中断（:5105-5107）[源码确认]
- 工具批先经 `_plan_tool_batch_segments` 切"并行安全段/顺序屏障段"（run_agent.py:8377-8388）[源码确认]
- 中断语义分级：interrupt（掐请求）/ redirect（改写本回合）/ steer（注入下一安全边界），全部保留角色交替不破坏缓存 [源码确认]
实验：loop-stepper（完整数据见 §4）。

### 02 模型传输 `TRANSPORTS`
**h2**：四种 wire 协议归一成一个 OpenAI 形状的 response，循环只认 `assistant_message.tool_calls`。
lede：Hermes 不绑死任何供应商：注册表 `register_transport(api_mode, cls)` 把 chat_completions、Anthropic Messages、Codex Responses、Bedrock Converse 四种协议翻译成同一内部形状；`providers/` 目录只是画像层，不是 wire 层。
事实：
- transport 注册表 agent/transports/__init__.py:21/:26，miss 时惰性 import 四模块（:54-66）[源码确认]
- ABC `ProviderTransport`（transports/base.py:16）：convert_messages/convert_tools/build_kwargs/normalize_response/map_finish_reason/extract_cache_stats [源码确认]
- 运行时分发 `_dispatch_nonstreaming_api_request`（chat_completion_helpers.py:926）：codex→`_run_codex_stream`（Responses SSE，codex_runtime.py）、anthropic→create_anthropic_message、bedrock→boto3 converse 归一为 OpenAI 形状、默认 openai SDK :1000 [源码确认]
- `providers/base.py:39` `ProviderProfile` 是 hostname/aux model 元数据画像层 [源码确认]
- 换供应商时缓存标记重贴：`_redecorate_prompt_cache_for_provider`（conversation_loop.py:1607）[源码确认]
实验：decision-matrix（"我要接一个新协议，改哪层？"变体）。

### 03 窄腰工具 `TOOL WAIST`
**h2**：每个模型工具都在每次 API 调用上付费，所以核心 60 个（快照计数）、注册点 102+，且新能力有六级阶梯可走。
lede：`tools/registry.py` 用 AST 扫描 `tools/*.py` 找 `registry.register(` 完成自动发现；`check_fn` 把服务可用性做成 30s TTL 的进程级门控；超过上下文 10% 的外围工具被折叠进 Tool Search 三桥工具之后——但核心工具永不延迟。
事实：
- `ToolRegistry.register`（registry.py:763）、`discover_builtin_tools`（:111，AST 扫描+mtime 缓存 :116）、`get_definitions`（:1044）[源码确认]
- `_HERMES_CORE_TOOLS` 60 个名字（快照计数，toolsets.py:31-92）vs tools/ 102 处注册 [源码确认，计数为快照]
- Footprint Ladder：extend existing → CLI+skill → service-gated(check_fn) → plugin → MCP → new core tool（AGENTS.md:71）[源码确认]
- check_fn TTL 缓存 30s + 瞬态失败 last-good 60s（registry.py:269/:256-273，注释：防 Docker daemon 抖动剥掉整套工具）[源码确认]
- Tool Search 渐进披露（model_tools.py:627-650 + tools/tool_search.py）："Core Hermes tools are NEVER deferred" [源码确认]
- `toolset_distributions.py:29` 概率采样 toolset 组合，唯一用途是给训练数据造多样性（运行时不消费）[源码确认]
实验：decision-matrix（Footprint Ladder 判定器）。

### 04 七个执行后端 `ENVIRONMENTS`
**h2**：模板方法 `BaseEnvironment` 把 local/Docker/SSH/Singularity/Modal/Daytona/Vercel 压成同一个 `execute()`，serverless 后端用快照实现"闲时休眠、按需唤醒"。
lede：terminal 工具的一次调用经过固定流水线：sudo 改写 → 复合后台命令重写 → cd 包裹 → `_run_bash` → 有界输出收集 → `_update_cwd`。远端后端配 `FileSyncManager` 双向同步，read_file/write_file 因此跨后端工作。
事实：
- ABC `BaseEnvironment`（tools/environments/base.py:650），公开 `execute()` :1453，子类只实现 `_run_bash`/`init_session`/`cleanup`/`get_temp_dir` [源码确认]
- 七类：`LocalEnvironment`（local.py:1716，spawn-per-call+session snapshot）、`DockerEnvironment`（docker.py:860）、`SSHEnvironment`（ssh.py:46，ControlMaster 复用）、`SingularityEnvironment`（singularity.py:162，`--containall --no-home`）、`ModalEnvironment`（modal.py:164）、`DaytonaEnvironment`（daytona.py:30）、`VercelSandboxEnvironment`（vercel_sandbox.py:243）；工厂 `terminal_tool.py:1816 _create_environment` [源码确认]
- Modal 文件系统快照 id 持久于 `~/.hermes/modal_snapshots.json`（modal.py:34），销毁前 `snapshot_filesystem`（:454）；Daytona `stop()`/`resume()`（daytona.py:229/:93）；Vercel `sandbox.snapshot()`（vercel_sandbox.py:448）[源码确认]
- `tools/environments/file_sync.py` `FileSyncManager`（daytona.py:20-26 引入）[源码确认]
实验：surface-switchboard 的"后端"页签变体 / decision-matrix（选后端）。

### 05 状态与会话 `STATE DB`
**h2**：一个 `~/.hermes/state.db` SQLite 用 WAL 承接多进程共享，FTS5+trigram 让 agent 搜索自己的过去，压缩靠 fork 子会话维持血统。
lede：65 万字符的 `hermes_state.py` 是"一主类三 Mixin"：schema/搜索/可移植性分别拆到三个文件。resume 不是简单读回——压缩过的会话要沿 `parent_session_id` 链找最近活后代，超 20,000 条直接拒绝。
事实：
- `DEFAULT_DB_PATH = get_hermes_home() / "state.db"`（hermes_state.py:362）；`class SessionDB(SessionSearchMixin, SessionSchemaMixin, SessionPortabilityMixin)`（:4045）+ `AsyncSessionDB` :14297 [源码确认]
- 表：`sessions`（50+ 列，hermes_state_common.py:369）、`messages`（`active`/`compacted` 软删除位 :430）、`system_prompts`（按 hash 去重 :364）、`gateway_routing` :483、`compression_locks` :496 [源码确认]
- FTS5：`messages_fts` + 3 触发器（common.py:594-625）；CJK trigram 索引（:663，注释称 state.db 最贵索引 ~2.6x）+ 原生分词器 `native/fts5_cjk/fts5_cjk.c`；LLM 侧入口 `session_search` 工具（tools/session_search_tool.py:1065）[源码确认]
- `resolve_resume_session_id`（hermes_state.py:11556）沿压缩 fork 链前向解析；`MAX_SAFE_RESUME_MESSAGES = 20_000`（:107）、`assert_resume_safe` :11930 抛 `SessionResumeTooLargeError` [源码确认]
- 多进程健壮：`apply_wal_with_fallback` :1077、macOS WAL-reset bug 防护 :942、跨进程修复锁 `_cross_process_repair_lock` :1751 [源码确认]
- 导出/导入 JSON 血统：`export_session_lineage`（hermes_state_portability.py:277）；CLI `--resume @claude/@codex` 可导入外部会话（hermes_cli/main.py:2988-3034）[源码确认]
实验：state-projection（session lineage + resume 投影）。

### 06 学习闭环 `LEARNING LOOP`
**h2**：每 10 个回合的 nudge 不注入用户消息，而是 fork 一个后台 review agent 去写记忆和技能——学习是回合收尾的异步副作用。
lede：这是 Hermes 区别于所有"聊天完就忘"内核的机制：turn 计数触发 → `_spawn_background_review` 复制一份对话快照 → fork 的 review agent 带着"Be ACTIVE"的提示词更新 MEMORY.md/USER.md/skill 库 → 写盘前还要过 write-approval 闸门。
事实：
- SOUL.md 身份层：`hermes_cli/default_soul.py`（首启种子模板）→ `load_soul_md`（agent/prompt_builder.py:2319）→ system prompt stable 首要身份（agent/system_prompt.py:377-386，防跨 profile 泄漏注释）[源码确认]
- nudge 配置 `memory.nudge_interval` 默认 10（agent/agent_init.py:1827）；检查点 agent/turn_context.py:732-737（:728 注释：原始用户消息不被注入 nudge 文本）[源码确认]
- fork：`_spawn_background_review`（turn_finalizer.py:796-803）→ `spawn_background_review_thread`（agent/background_review.py:1595）；review 提示词"Review the conversation above and update the skill library. Be ACTIVE"（:454-455）；review agent 自身 nudge 清零防递归（:1257-1258）[源码确认]
- 记忆语义：`tools/memory_tool.py:6-8` MEMORY.md=agent 环境/项目笔记，USER.md=用户画像；`§` 条目分隔（:78）；写盘过 `tools/write_approval.py:253 evaluate_gate` [源码确认]
- 外部记忆是 exclusive 插件类别：`plugins/memory/` 下 honcho/mem0/hindsight/supermemory 等，基类 `MemoryProvider`（agent/memory_provider.py），`HonchoMemoryProvider`（plugins/memory/honcho/__init__.py:262）[源码确认]；"dialectic user modeling"效果本身 [文档声明]
实验：loop-stepper 的"回合尾"变体 / state-projection 计数器扩展。

### 07 技能生态 `SKILLS`
**h2**：SKILL.md 是 agentskills.io 开放标准 + Hermes 扩展字段，三层渐进披露让 150+ 技能不炸上下文。
lede：技能不进 system prompt 正文——prompt 里只有索引（volatile 层），模型用 `skills_list` 看元数据、`skill_view` 读全文；技能的自我改进统一收口到 `skill_manage` 工具，前后串着安全扫描、pinned 保护、读后写守卫。
事实：
- 格式：`skills/<category>/<name>/SKILL.md`（+references/templates/assets）；YAML frontmatter agentskills.io 兼容（tools/skills_tool.py:23-44：name≤64/description≤1024 + `platforms` 扩展）[源码确认]
- 渐进披露：`skills_list`（skills_tool.py:804）→ `skill_view`（:1072）；索引构建 `build_skills_system_prompt`（prompt_builder.py:1828），属 volatile 层（system_prompt.py:20 注释）[源码确认]
- 过滤与隔离：平台/环境匹配（agent/skill_utils.py:252/:352）、未信任项目技能隔离 `is_quarantined_project_skill`（:838）[源码确认]
- 自改进写路径 `skill_manage`（tools/skill_manager_tool.py:1543）+ 守卫群：`_security_scan_skill` :125、`_pinned_guard` :274、后台 review 读后写守卫 :424、curator 合并守卫 :463 [源码确认]
- `/learn` 把用户材料编纂成技能：`build_learn_prompt`（agent/learn_prompt.py:165，内置 `_AUTHORING_STANDARDS`）[源码确认]
- 技能侧 nudge：`skills.creation_nudge_interval`（agent_init.py:1956-1959），触发于 codex_runtime.py:885-891 [源码确认]
实验：lineage-compare（skills 是两代共享最强的概念）。

### 08 上下文压缩与缓存宪法 `COMPACTION`
**h2**：压缩是"缓存神圣"的唯一合法破例；micro-compaction 敢把这个 tradeoff 写成文档并默认关闭。
lede：`ContextCompressor` 在 50% 有效窗口触发，带防抖（连续两次收益 <10% 就跳过）；`docs/micro-compaction.md` 罕见地诚实：逐回合摊薄压缩账单的代价是"每回合重写已发送历史，打破 provider 缓存前缀"，所以 off by default。
事实：
- `ContextCompressor`（agent/context_compressor.py:2070）；`threshold_percent=0.50`（:3103）、有效窗口=ctx−max_tokens（:3075-3099）、小窗兜底 0.85（:2973）、防抖规则（should_compress docstring）[源码确认]
- 接线：preflight `should_compress(request_pressure_tokens)`（conversation_loop.py:2684）→ `compress_context`（agent/conversation_compression.py:2255）含 `CompressionCommitFence`（:469）与冷却 [源码确认]
- 原生路线 agent/native_compaction.py（server-side compaction checkpoint 管理）[源码确认]
- 缓存实现：Anthropic cache markers=static 前缀+prompt 尾+最后 2 条非 system 消息（agent/prompt_caching.py docstring:4-8）；稳定前缀注册（agent/prompt_cache_boundary.py:56）；跨会话 cache scope（prompt_cache_scope.py:67）[源码确认]
- "prompt-cache sacred" ground rule 记录在 docs/rfcs/2026-07-plugin-architecture-lessons-pi-opencode.md:5（additive-only, prompt-cache sacred, observer-first, fail-closed）[源码确认]
- `trajectory_compressor.py`（:332）是离线训练数据工具，不是运行时组件——名字像,职责完全不同 [源码确认]
实验：atlas-locator（成本飙升症状排第一）。

### 09 消息网关 `GATEWAY`
**h2**：一个 asyncio 进程用 `agent:main:<platform>:<chat_type>:<chat_id>` 字符串做会话坐标系，23+ 平台适配器与内置枚举双轨注册。
lede：`gateway/run.py`（3 万行）里 `GatewayRunner` 由 Mixin 拼装；消息路由的精髓全在 `build_session_key` ——群聊按用户拆、thread 默认共享、WhatsApp 归一 JID、Slack 带 workspace scope，跨平台连续性由此一个函数裁决。
事实：
- 入口：`GatewayRunner`（gateway/run.py:6729，三 Mixin 继承）、`start_gateway()` :30478、`python -m gateway.run` [源码确认]
- 平台三层：内置 `Platform` 枚举（gateway/config.py:325-360，含 TELEGRAM/DISCORD/SLACK/WHATSAPP/SIGNAL/FEISHU/WEIXIN/QQBOT…）+ `_missing_()` :358 允许插件造成员 + `plugins/platforms/` 22 个目录；实例化 `_create_adapter`（run.py:16015）[源码确认]
- 路由：adapter `handle_message`（gateway/platforms/base.py:6045）→ `set_message_handler`（:3636）注入 → `_handle_message`（run.py:16692）→ `_handle_message_with_agent` :19031 [源码确认]
- session key：`build_session_key`（gateway/session.py:1090，docstring 自称 single source of truth）；profile 命名空间 :1070；多用户会话判定 :1049 [源码确认]
- 语音：中枢 `_enrich_message_with_transcription`（run.py:24884）+ 六家 STT 后端（tools/transcription_tools.py:1931-2608：本地 mlx-whisper/whisper.cpp/faster-whisper、groq、openai、mistral、xai、elevenlabs）[源码确认]
- 语音唤醒："Hey Hermes" wake word 监听（tools/wake_word.py + tools/wakewords/hey_hermes.onnx），非模型工具 [源码确认]
实验：surface-switchboard。

### 10 定时与自动化 `CRON`
**h2**：jobs.json 而非 sqlite、croniter 懒 import 省 15ms、19 平台白名单防 env 枚举攻击——处处是省出来的性能和堵出来的安全。
lede：Hermes 自带调度器：cron 表达式/interval/one-shot 三形态，交付复用 gateway 适配器；最新 feature `rearm_oneshot` 只许 once 作业复活且拒绝覆盖活体 claim，防抢跑靠 fire/run 双 claim 栅栏。
事实：
- 存储：`~/.hermes/cron/jobs.json`（cron/jobs.py:4, :85），跨进程锁 :273，每 profile 独立 store（:70-84 注释,issue #4707 安全隔离）；执行历史独立 sqlite（cron/executions.py:36）[源码确认]
- one-shot：`30m/2h/1d` 时长语法（jobs.py:778）、自动 `repeat=1`（:1983）、过期宽限窗拒绝（`ONESHOT_GRACE_SECONDS` :2055）[源码确认]
- `rearm_oneshot`（jobs.py:2422）：仅 `kind=="once"`（:2431）、拒绝覆盖活 run_claim/fire_claim（:2449-2454）、重置 completed、写 `rearmed_at`（:1014）[源码确认]（commit a0ca7c1 即此 feature 的 squash 快照）
- 调度循环：`tick`（cron/scheduler.py:7196）→ `run_one_job`（:6596）；崩溃恢复 `mark_running_jobs_interrupted` :1075 [源码确认]
- 交付：`_KNOWN_DELIVERY_PLATFORMS` 19 平台白名单（scheduler.py:500-505，注释明言防 env 变量枚举攻击）、`_deliver_result` :2856 复用 gateway router、`[SILENT]` 抑制标记 :552 [源码确认]
- 可插拔调度器：ABC `CronScheduler`（cron/scheduler_provider.py:67）、内置 `InProcessCronScheduler` :512、Nous 云 `ChronosCronScheduler`（plugins/cron_providers/chronos/__init__.py:47，回调 JWKS 验签 verify.py:79）[源码确认]
实验：state-projection（job 状态机 scheduled→fired→completed/rearmed）。

### 11 多表面与委托 `SURFACES`
**h2**：`tui_gateway.dispatch` 一个函数同时服务 Ink 终端、Electron 桌面、iOS/web WS；Zed 编辑器走 ACP；其他 agent 走 MCP——六面共享同一 SessionDB。
lede：React+Ink 拥有屏幕、Python 拥有会话；子代理 delegate 是同进程新建完整 AIAgent（默认扁平深度 1）；`execute_code` 让模型写 Python 脚本经 RPC 调工具，多步管道折叠成零上下文成本回合。
事实：
- TUI：ui-tui/src/gatewayClient.ts spawn `python -m tui_gateway.entry`，stdio 换行分隔 JSON-RPC；`dispatch()`（tui_gateway/server.py:2463）；`handle_ws`（tui_gateway/ws.py）逐字复用 dispatch 供桌面/iOS/web [源码确认]
- Desktop：Electron spawn `hermes serve`（apps/desktop/electron/backend-command.ts:30），已有 gateway 时经其路由而非本地起进程（connection-config.ts:692）[源码确认]
- ACP：`acp_adapter/server.py:1` Agent Client Protocol（Zed），capabilities：load/fork/list/resume + image（server.py:1317-1324）；`hermes-acp` console script [源码确认]
- MCP server 形态：`mcp_serve.py:623`，暴露 10 工具（conversations_list/messages_read/events_wait/messages_send/permissions_respond…，:645-1003）——把 Hermes 的消息面开放给别的 agent [源码确认]
- delegate：`delegate_task`（tools/delegate_tool.py:3625）spawn `AIAgent` 子实例（:1965），独立 SessionDB/预算/工具集，`MAX_DEPTH=1`（:129），leaf/orchestrator 角色，可 steer/interrupt（:290/:266）[源码确认]
- execute_code RPC：`tools/code_execution_tool.py`（本地 Unix socket + `_rpc_server_loop` :652；远程 backend 用 req_*/res_* 文件轮询 :921；白名单 7 工具 :63-71；env 脱敏 :152；300s/50 调用/50KB 限额 :74-77）[源码确认]
- 训练管线：`batch_runner.py:529 BatchRunner` 多进程池跑 AIAgent 产 jsonl 轨迹 + checkpoint 续跑；`mini_swe_runner.py` 同款轨迹；evals/{readtool,compaction,browser_use} 是独立离线评测 harness（不被 batch_runner import，共用 AIAgent）[源码确认]
实验：surface-switchboard + decision-matrix（"我的新入口接哪层"）。

### 12 实践与面试 `PRACTICE`
**h2**：诊断一个 Hermes 症状，先问三个问题：缓存坏没坏、nudge 到没到、锁在哪一层。
lede：五步诊断法 + 三套面试题（架构题、故障题、谱系对比题），把前十一章变成可操作的手感。完整内容见 §7。
事实：docs/ 下有现成的 RCA 样本（docs/rca-ssl-cacert-post-git-pull.md、session-lifecycle.md、micro-compaction.md）可作诊断教材 [源码确认]
实验：atlas-locator（全套四症状）。

## 4 交互实验数据

### 4.1 loop-stepper（第 01 章）

事件流（8–10 步，真实符号名）：

```json
[
 {"stepLabel": "1. 输入落地", "eventName": "run_conversation()", "note": "run_agent.py:8546 转发进 agent/conversation_loop.py:1822；用户原文先存档，任何 nudge/系统文本都不污染它"},
 {"stepLabel": "2. 缓存前缀恢复", "eventName": "_restore_or_build_system_prompt()", "note": "conversation_loop.py:865 从 session DB 取冻结的 system prompt，校验 runtime 匹配(:1087)才复用——每回合省钱的第一道闸"},
 {"stepLabel": "3. 压缩 preflight", "eventName": "should_compress()", "note": "conversation_loop.py:2684 用 request_pressure_tokens 对比 50% 有效窗口阈值；超线先 compress 再进循环(:2729)"},
 {"stepLabel": "4. 进循环", "eventName": "while(api_calls<max && budget>0)", "note": "conversation_loop.py:2017；max_iterations 默认 sys.maxsize，真实约束是 IterationBudget"},
 {"stepLabel": "5. API 工作线程", "eventName": "interruptible_streaming_api_call()", "note": "chat_completion_helpers.py:3288 起 daemon 线程，主线程 join(0.3) 轮询中断标志；transport 按 api_mode 分发四种协议(:926-1000)"},
 {"stepLabel": "6. 流式回吐", "eventName": "_fire_stream_delta()", "note": "run_agent.py:6989 只有存在展示/TTS 消费者才真流式(conversation_loop.py:3160)；单写者仲裁 _claim_stream_writer(:6899)"},
 {"stepLabel": "7. 工具批规划", "eventName": "_execute_tool_calls()", "note": "run_agent.py:8377：单调用直走顺序；多调用切“并行安全段/顺序屏障段”，去重 _deduplicate_tool_calls(:5047)"},
 {"stepLabel": "8. 审批闸门", "eventName": "check_all_command_guards()", "note": "tools/approval.py：12 条 hardline 直接拒(rm -rf / 类 :490)、47 条危险模式进审批；并发批用 _ConcurrentToolAuthorizationGate 序列化，人类等待从批 deadline 扣除(tool_executor.py:441)"},
 {"stepLabel": "9. 结果回注", "eventName": "make_tool_result_message()", "note": "role=tool 消息 append 进 messages（tool_dispatch_helpers.py:541），continue 回步骤 4；写文件前还有 _ensure_file_checkpoint 快照"},
 {"stepLabel": "10. 终答收尾", "eventName": "finalize_turn()", "note": "无 tool_calls 分支 conversation_loop.py:7667 → turn_finalizer.py:121；收尾处检查 memory/skill nudge(:796-803)，满足就 fork 后台 review——学习的入口在循环外"}
]
```

### 4.2 state-projection（第 05 章，SessionDB lineage）

事件：`msg.append`（active+1）、`compact`（旧会话消息置 compacted=1，fork 子会话 parent_session_id 指向它，子会话继承冻结 prompt）、`resume(id)`、`export(lineage)`。
计数器：`active_messages`、`lineage_depth`、`db_bytes`。
规则投影：
- `resume(id)`：若该会话已被压缩 fork，沿 `resolve_resume_session_id`（hermes_state.py:11556）跳到"最近有消息的后代"，投影上画一条跨越箭头；
- 沿链统计 active 总数 >20,000 → 亮红灯 `SessionResumeTooLargeError`（:107/:11930），投影显示"拒绝加载"；
- `compact` 触发后 system_prompts 表命中同 hash → 不重复存（common.py:364）。
教学点：同一份 transcript 在"压缩前/后"是两个会话，血统链才是真相。

### 4.3 decision-matrix（第 03 章，Footprint Ladder）

维度：`每 API 调用携带成本`（核心工具=常驻税）、`缓存影响`（改核心 prompt=破缓存）、`安装体验`（是否接 hermes tools/setup）、`分发独立度`。
规则（按 AGENTS.md:71 阶梯）：
1. 现有代码能扩 → 不新增注册点；
2. 可被模型学会的操作序列 → CLI 命令 + SKILL.md（零核心足迹）；
3. 需要 schema 但按服务可用性开关 → service-gated tool（check_fn，例 homeassistant_tool.py:485）；
4. 带凭据/多工具的新服务 → plugin（provides_tools，例 plugins/spotify 7 工具）；
5. 第三方维护的 MCP server → 目录（自动生成 toolset 别名，registry.py:572）；
6. 以上皆非 → new core tool（last resort，需书面理由，见 toolsets.py:68 注释"narrow waist"）。
Trace 样例（输入"加 Spotify 播放"）：新 schema？是→ 只有登录用户可用？是→ check_fn 门控（spotify/tools.py:20）→ 工具数 7 > 核心容忍？→ 定为 plugin → 结果：`plugins/spotify/`，核心足迹 0。反例（输入"加 execute_code"）：跨全部后端、单工具多能力、必须进 `_HERMES_CORE_TOOLS`（toolsets.py:31）→ 核心，附带 59 名额的记账讨论。

### 4.4 atlas-locator（第 08/05/09/10 章各一症状）

```json
[
 {"label": "成本异常", "title": "同一会话 API 费用突然翻倍", "body": "大概率 prompt cache 被打断：检查是否有代码在会话中途改动工具集/重建 system prompt（宪法禁止,AGENTS.md:24-29）。合法破例只有压缩。定位：agent/prompt_caching.py:170 标记是否还在；_restore_or_build_system_prompt(conversation_loop.py:865) 是否回退到 rebuild 路径；换过供应商会触发重贴标记(:1607)属正常。若开了 compression.micro_compact,每回合重写历史都会破缓存(docs/micro-compaction.md 明示)。", "status": "高频"},
 {"label": "工具消失", "title": "Docker/SSH 环境下整套工具突然没了", "body": "check_fn 进程级门控：registry.py:1044 get_definitions 只放行 check_fn()=True 的工具；TTL 30s 缓存(:364)+瞬态失败 last-good 60s(:256-273)——Docker daemon 抖 60 秒以上就会剥工具。定位：对应工具的 check_fn（terminal_tool.py 环境注册、homeassistant_tool.py:485 等）与服务健康；另有会话级第二闸（model_tools.py:580-593,browser_exec 无 terminal 时被剥）。", "status": "偶发"},
 {"label": "恢复失败", "title": "hermes --resume 老会话报 SessionResumeTooLargeError", "body": "沿血统链统计 active=1 消息数超 MAX_SAFE_RESUME_MESSAGES=20,000（hermes_state.py:107, assert_resume_safe :11930）。这是保护而非 bug：transcript 太大说明压缩没跟上。定位：compression_locks 表(common.py:496)与 should_compress 阈值(agent/context_compressor.py:3103)；确认目标 id 是链头还是已被 fork（resolve_resume_session_id :11556 会自动前跳,但总量仍超就拒）。", "status": "低频"},
 {"label": "定时不跑", "title": "one-shot 定时任务到点没触发", "body": "三种死法：(a) 过期超 ONESHOT_GRACE_SECONDS 被拒(job 建早了/机器停了) jobs.py:2055; (b) 活体 run_claim/fire_claim 占着(上次执行没收尾) :442/:213; (d) 进程根本没起调度——tick 循环在 scheduler.py:7196,确认 gateway/cron 服务活着。复活命令：hermes cron rearm <id> → rearm_oneshot(jobs.py:2422,仅 kind==once,会重置 completed 计数)。交付没到看 _KNOWN_DELIVERY_PLATFORMS 白名单(scheduler.py:500)和 [SILENT] 标记(:552)。", "status": "高频"}
]
```

### 4.5 surface-switchboard（第 11/09 章，6 表面 × 4 行）

| 表面 | 进程形态 | 接入协议 | 会话键/落点 | 一句话场景 |
|---|---|---|---|---|
| CLI `hermes` | 前台单进程（cli.py:5011 HermesCLI, prompt_toolkit） | 终端 REPL, slash 命令(cli.py:11812) | `agent:main:cli…` → ~/.hermes/state.db | 本机干活,interrupt-and-redirect 最顺手 |
| 消息网关 `hermes gateway` | 常驻 asyncio 进程（gateway/run.py:30478） | Telegram/Discord/Slack/WhatsApp/Signal/微信/钉钉… 23+ 适配器 | `build_session_key` = `agent:main:<platform>:<chat_type>:<chat_id>` | 人在外面,agent 在云上 VM 干活 |
| TUI `ui-tui` | TS(Ink) 前端 + Python 子进程 | stdio 换行分隔 JSON-RPC（tui_gateway/server.py:2463） | 同内核同 DB,"TS owns the screen" | 富交互终端体验 |
| 桌面 `hermes desktop` | Electron + headless `hermes serve` | 复用 tui_gateway 的 WS 变体（/api/ws, ws.py handle_ws） | 已有 gateway 时路由过去而非本地 spawn(connection-config.ts:692) | 图形壳,同一记忆 |
| 编辑器 ACP `hermes-acp` | 被 Zed 拉起的 stdio 进程 | Agent Client Protocol(server.py:1317: load/fork/list/resume/image) | ACP session ↔ 内核会话 | 在 IDE 里用同一个助理 |
| MCP 服务 `hermes mcp serve` | stdio MCP server | MCP 10 工具(mcp_serve.py:645-1003: conversations/messages/events/permissions) | 暴露的是网关侧会话 | 让 Claude/其他 agent 指挥 Hermes 的聊天面 |

（Termux、Docker s6 镜像、Nix 是同批表面的安装形态,不算独立表面；`constraints-termux.txt` 与 `.[termux]` extra 证明移动端是一等公民。）

### 4.6 lineage-compare（第 00 章，Hermes ↔ OpenClaw 两代映射）

| 概念 | Hermes（Python, v0.20.5） | OpenClaw（TypeScript, 2026.8.1） | 迁移证据 |
|---|---|---|---|
| 人格文件 | `SOUL.md`，首启种子 default_soul.py，stable 身份层(system_prompt.py:377) | 同名 `SOUL.md`，直接复制进 workspace | openclaw migrating-hermes.md "Workspace files" [文档声明] |
| 记忆 | `memories/MEMORY.md`+`USER.md`，`§` 条目(delimiter memory_tool.py:78) | 同名双文件，**append 合并**而非覆盖；或走 imports/hermes/ | hermes 内部一致（openclaw_to_hermes.py:30 == memory_tool.py:78）；openclaw 侧零命中 `§`，只搬运不解析 [源码确认] |
| 技能 | `skills/**/SKILL.md`(agentskills.io)，含 openclaw-imports/ 收容目录 | workspace skills，递归发现扁平化 | hermes README:206 [文档声明] |
| 模型配置 | config.yaml `model/providers/custom_providers`；三种 transport | 导入时识别 Hermes 的 Chat Completions/Codex Responses/Anthropic Messages 三种 transport | openclaw 迁移文档逐条点名 Hermes schema [文档声明] |
| 定时 | `cron/jobs.json` + 19 平台白名单交付 | automations（同源概念） | [合理推断] |
| 进程哲学 | 单 gateway 进程多通道(gateway/run.py) | "connects … through one Gateway"(README) | 两侧 README 对照 [文档声明] |
| 反向导入 | `hermes claw migrate` 认 `.openclaw/.clawdbot/.moltbot` 三代目录名 | `openclaw migrate apply hermes` | claw.py:56 [源码确认] |
| 不带走的东西 | plugins/sessions/logs 在 openclaw 侧 archive-only；honcho 记为 manual-review | Hermes 侧命令白名单/凭据有选择导入 | 双向文档 [文档声明] |

教学结论：**文件格式即谱系协议**——两代互写对方的家目录，`§` 字节级 delimiter 是活化石；产品叙事上双方都自称"接棒者"，这正说明共享概念族比代码传承更本质。

## 5 教学骨架代码

最能代表 Hermes 的机制：回合尾的 nudge→后台自省闭环（第 06 章灵魂）。语言 Python，教学骨架，非上游复制，与 `agent/turn_context.py:732-737`、`agent/turn_finalizer.py:796-803`、`agent/background_review.py:1595/:454` 对齐。

```python
# hermes-learning-loop — 教学骨架（非上游代码）
# 对齐真实源码：agent/turn_context.py / turn_finalizer.py / background_review.py
import threading

class TurnLoop:
    def __init__(self, agent, nudge_interval=10):        # 真源: agent_init.py:1827
        self.agent = agent
        self.nudge_interval = nudge_interval
        self.turns_since_memory = 0
        self.turns_since_skill = 0

    def run_turn(self, user_text):
        # 关键不变量：nudge 绝不注入用户消息（turn_context.py:728 注释）
        original_user_message = user_text                  # 原样入库
        snapshot = self.agent.conversation_snapshot()

        should_review = False
        self.turns_since_memory += 1
        if self.turns_since_memory >= self.nudge_interval: # turn_context.py:732-737
            should_review = True

        answer = self.agent.execute_loop(original_user_message)

        # 回合收尾：学习是异步副作用，不阻塞用户（turn_finalizer.py:796-803）
        if should_review:
            self.turns_since_memory = 0
            self._spawn_background_review(snapshot, review_memory=True,
                                          review_skills=self._skills_nudged())
        return answer

    def _spawn_background_review(self, snapshot, **flags):  # background_review.py:1595
        # fork 一个自我禁用的 review agent：快照 + "Be ACTIVE" 提示词
        # review agent 自身 nudge 计数器清零，防止递归自省（:1257-1258）
        t = threading.Thread(target=self._review, args=(snapshot, flags), daemon=True)
        t.start()

    def _review(self, snapshot, flags):
        reviewer = self.agent.fork(quiet=True, skip_memory=False)
        # 写路径不是裸写：记忆/技能落盘前必须过审批闸门
        # 真源 tools/write_approval.py:253 evaluate_gate
        gate = self.agent.write_gate.evaluate(
            target="MEMORY.md" if flags.get("review_memory") else "SKILL.md",
            author="background_review")
        if gate.allow:
            reviewer.update_memory_and_skills(snapshot)     # prompt: background_review.py:454
        # skill 写还要过 security scan / pinned guard（skill_manager_tool.py:125/:274）

    def _skills_nudged(self):
        self.turns_since_skill += 1
        if self.turns_since_skill >= self.agent.skill_nudge_interval:  # agent_init.py:1956
            self.turns_since_skill = 0
            return True
        return False
```

三处最容易被忽略的设计决定：nudge 不碰用户原文（保缓存、保真实）；review 在 fork 中自我禁用（防递归）；写盘走审批（学习不是免检）。

## 6 事实边界

1. **git 历史不可用于演化叙事**：仓库仅 1 个 squash commit（a0ca7c1, 2026-08-19），"最新 feature one-shot re-arm"只能以代码存在（cron/jobs.py:2422）为证，不能引用 commit 序列作演进证据。[源码确认]
2. **Hermes↔OpenClaw 时间先后无法本地裁决**：双向迁移文档各称对方为源，SOUL.md/记忆/技能概念族的起源方向只有字节级 `§` delimiter 一致性是硬证据，其余是 [合理推断]。
3. **产品效果类声明未验证**：Honcho "dialectic user modeling"、serverless "costs nearly nothing"、$5 VPS 可跑等为 [文档声明]；本次只读研究未运行任何代码。
4. **行号随快照漂移**：cli.py 21,510 行、run_agent.py 43 万字符均为 god-file 重构进行时的快照（AGENTS.md 明说在拆），行号引用适合教学定位、不适合长期链接。
5. 命名不一致本身是事实：`acp_adapter/__init__.py:1` 写 "Agent Communication Protocol"，`server.py:1` 写 "Agent Client Protocol"（Zed 主导者为后者的正确名称）。

## 7 实践与面试

### 五步诊断法（Hermes 症状通用）

1. **表面定位**：症状发生在哪个表面？CLI(gateway 外)/消息网关/TUI/桌面/ACP——先分清是 `cli.py`、`gateway/run.py` 还是 `tui_gateway/server.py` 的进程。session key 是跨表面串线索的缰绳。
2. **缓存检查**：成本/延迟异常先查 prompt cache 边界（`prompt_caching.py` markers、stable 前缀是否被中途重建），合法破例只有压缩。
3. **状态检查**：`~/.hermes/state.db`——sessions 的 `active/compacted` 位、`parent_session_id` 血统、`compression_locks`、`gateway_routing`；cron 单独看 `cron/jobs.json` 的 claim 字段。
4. **门控检查**：工具不见→`check_fn` TTL/last-good；命令被拒→`tools/approval.py` 分级（hardline 拒/危险 ask/cron·gateway 非交互降级策略不同,approval.py:96/:293/:252）；记忆没写→`write_approval.py` 闸门。
5. **后台线程检查**：学习没发生→nudge 计数与 `_spawn_background_review` 是否触发、review agent 是否被 nudge 清零逻辑短路；cron 没跑→`tick` 是否活着、`mark_running_jobs_interrupted` 是否有遗留。

### 面试套题一：架构

题面：只用一个进程内对象图描述 Hermes：AIAgent、SessionDB、ToolRegistry、BaseEnvironment、GatewayRunner 各自职责与依赖方向；为什么核心循环是同步的而网关是 asyncio？
- 骨架 A：AIAgent(run_agent.py:421) 组合而非继承——tools 来自 registry.get_definitions，持久化委托 SessionDB(:4045)，执行后端工厂化(:1816)；依赖全部指向 agent/ 子模块，god-file 是门面不是泥球。
- 骨架 B：循环同步的代价换来工作线程中断模型（chat_completion_helpers.py:1335 的 owner_tid 设计）——比 asyncio 嵌套回调更容易做 interrupt/redirect；asyncio 留给 I/O 密集的网关适配器层。
- 骨架 C：session key 是唯一跨面坐标（gateway/session.py:1090），六个表面通过它汇入同一 state.db——"narrow waist" 在状态层的投影。
- 反方追问：这种设计的坏处？——多进程共享 sqlite 需要 WAL fallback/修复锁（hermes_state.py:1077/:1751）；TUI dispatch 的慢 handler 要单独线程池。

### 面试套题二：故障

题面：用户报告"Telegram 上的 agent 突然不认识上周教它的技能了，而且这周 API 费用翻倍"。给出两个症状的独立根因假设与排查路径。
- 骨架 A：技能消失——skill_manage 写路径守卫（security scan/pinned/quarantine）拒绝过更新？还是 skills 属 volatile 层、focus 模式降级为 name-only（system_prompt.py:535）导致模型"看不见"正文？
- 骨架 B：费用翻倍——gateway 侧某处每轮重建工具集破缓存；或用户切换了 provider 触发 `_redecorate_prompt_cache_for_provider`（正常但短痛）；或 micro_compact 被打开。
- 骨架 C：两症状可同源：一次失败的 compaction 留下 compression_locks 半状态，fork 出的子会话丢了 skills volatile 段重建——先查 messages.active/compacted 位。
- 收束：每个假设给一条"证伪命令"（hermes doctor / state.db SQL / cache_stats 字段 extract_cache_stats）。

### 面试套题三：演化对比（谱系）

题面：Hermes 与 OpenClaw 双向都能迁移对方数据。作为架构师，你如何解释"为什么迁移协议是文件目录而不是 API"？并评估这种两代共享文件格式的策略对新加入的第三代意味着什么。
- 骨架 A：个人助理的内核状态天然分层——人格(SOUL.md)/记忆(§条目)/技能(SKILL.md)是"用户资产"，sessions/plugins/logs 是"运行时私有"，两侧文档都按这条线划 import/archive-only（openclaw 文档 + claw.py 导入清单一致）。
- 骨架 B：`§` delimiter 的一致性发生在 hermes 仓库内部（迁移器对齐目标 store 格式），openclaw 侧从不解析 `§`——迁移器做的是翻译与搬运。能自证谱系的是文件族（SOUL.md/MEMORY.md/SKILL.md）+ 双向迁移脚本：格式先于产品稳定，是 agentskills.io 这种开放标准策略的延续。
- 骨架 C：第三代成本：要么兼容这族文件格式才能吃到存量用户，要么提供第三个迁移器；Hermes 连 `.clawdbot/.moltbot` 旧目录名都认（claw.py:56）说明"认历史"本身就是竞争策略。
- 追问：哪些东西刻意不迁移？（Hermes-only 的 cron claim、Honcho 凭据、plugins）——不迁移清单即产品差异化清单。

## 8 术语表

| 术语 | 释义 | 锚点 |
|---|---|---|
| SOUL.md | 首启种子的人格/身份文件，进 system prompt stable 层，两代共享 | hermes_cli/default_soul.py; system_prompt.py:377 |
| nudge | 每 N 回合（默认 10）触发的自省提醒计数，不注入用户消息 | turn_context.py:732 |
| background review | 回合尾 fork 出的只读会话+写记忆/技能的 review agent | background_review.py:1595 |
| Footprint Ladder | 新能力六级落点阶梯：扩码→CLI+skill→check_fn→plugin→MCP→core tool(最后手段) | AGENTS.md:71 |
| narrow waist | 核心窄腰：每个模型工具都随每次 API 调用付费，故核心仅 ~60 工具（快照计数） | AGENTS.md:24; toolsets.py:31 |
| check_fn | 工具的服务门控谓词，30s TTL 缓存 + 60s last-good 宽限 | registry.py:208/:256/:364 |
| prompt cache sacred | 不得中途改动 past context/toolset/prompt 的宪法级纪律，唯一破例是压缩 | AGENTS.md:24-29; prompt_caching.py |
| session key | `agent:main:<platform>:<chat_type>:<chat_id>[:<thread>]` 跨面会话坐标 | gateway/session.py:1090 |
| micro-compaction | 逐回合折叠最老交换进 running summary 的可选模式，代价=破缓存前缀 | docs/micro-compaction.md |
| rearm_oneshot | 过期 one-shot 定时作业的显式复活（仅 kind==once，拒活体 claim） | cron/jobs.py:2422 |

## 9 Hero 循环图

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
  对话执行 ──▶ 回合计数 ──▶ 后台自省 ──▶ 蒸馏写入 ──▶ 下轮注入
   (EXEC)     (NUDGE)      (REVIEW)     (WRITE)      (INJECT)
  loop 正常   nudge_       fork 只读     MEMORY.md/   SOUL stable
  跑任务      interval     review        USER.md/     +skills 索引
  10 轮触发    agent        SKILL.md      volatile 层
             (不碰原文)   (写审批闸门)  (不破缓存前缀)
        ▲                                              │
        └──────────────────────────────────────────────┘
```

1. **对话执行 EXEC**：同步主循环完成任务（conversation_loop.py:1822）
2. **回合计数 NUDGE**：memory/skill 双计数器到阈值（turn_context.py:732）
3. **后台自省 REVIEW**：fork 的 review agent 重读快照（background_review.py:1595）
4. **蒸馏写入 WRITE**：过 write_approval 后写记忆/改技能（write_approval.py:253）
5. **下轮注入 INJECT**：stable 身份 + volatile 索引在下一会话生效（system_prompt.py:377/:526）

这就是 README 那句 "a closed learning loop" 的机器形状，也是与 OpenClaw 共享概念族中"演化"的源头实现候选。

## 10 PRIMARY SOURCES

- https://github.com/NousResearch/hermes-agent —— 上游仓库（README.md、AGENTS.md、pyproject.toml）
- https://hermes-agent.nousresearch.com/docs/ —— 官方文档站（Docusaurus 源在仓库 website/）
- https://hermes-agent.nousresearch.com/docs/getting-started/termux —— Termux 安装指南（constraints-termux.txt 对应）
- https://agentskills.io —— SKILL.md 开放标准（tools/skills_tool.py:27-44 声明兼容）
- https://github.com/openclaw/openclaw —— 对位产品仓库；docs/install/migrating-hermes.md 为谱系证据 A 面
- https://github.com/plastic-labs/honcho —— Honcho 用户建模（README.md:26 链接、plugins/memory/honcho/）
- https://github.com/zed-industries/agent-client-protocol —— ACP 协议（acp_adapter 对接方）
- https://nousresearch.com —— 出品方 Nous Research
