/**
 * 平台运行时架构图：
 * 点击层级查看职责说明；点击「一次请求的旅程」步骤，
 * 高亮该步涉及的层级并给出叙事。纯 DOM + class 切换。
 */

const LAYERS: Record<string, { name: string; en: string; role: string }> = {
  "http": {
    name: "HTTP 服务面",
    en: "http_service",
    role: "对外唯一入口：线程与回合的生命周期路由、鉴权与签名校验、错误模型、健康检查。把「平台语义」翻译成内核调用。",
  },
  "lifecycle": {
    name: "平台生命周期",
    en: "platform_lifecycle",
    role: "启动自举 → 就绪门控 → 排水（drain）→ 优雅停机。保证升级/扩缩容时不打断进行中的回合。",
  },
  "capability": {
    name: "能力平面",
    en: "capability_plane",
    role: "声明式地回答「这个身份在这个作用域里能做什么」：能力授予、范围限定、只读模式与撤销。",
  },
  "approval": {
    name: "审批控制",
    en: "approval_control",
    role: "把交互式 CLI 的「问一句」变成服务端可审计的决策流：谁批准的、依据什么、超时后默认如何。",
  },
  "tool": {
    name: "工具生命周期",
    en: "tool_lifecycle",
    role: "工具的注册、启用、授权与调用管线：每一次工具使用都经过能力检查并被记录。",
  },
  "core": {
    name: "Codex 内核（模型平面）",
    en: "codex core",
    role: "上一章的回合循环：上下文组装、流式响应、工具分发、沙箱执行——平台不重写它，只包裹它。",
  },
  "store": {
    name: "事件存储",
    en: "postgres_store",
    role: "以事件溯源持久化一切：追加事件、构建投影、支撑线程查询与恢复。状态是事件的函数。",
  },
  "lease": {
    name: "签名租约",
    en: "signed lease",
    role: "把「权限」变成可过期的凭据：绑定平台作用域摘要与被预留的 Codex 回合，到期即失效，防止越权重放。",
  },
};

const JOURNEY: Array<{ label: string; layers: string[]; story: string }> = [
  { label: "① 创建线程", layers: ["http", "store"], story: "POST /threads 落入 HTTP 服务面，鉴权通过后向事件存储追加 ThreadCreated，投影出线程行。" },
  { label: "② 预留回合", layers: ["http", "lifecycle", "core"], story: "请求预留一个 Codex 回合；生命周期确认实例处于就绪态且未在排水，内核侧锁定回合槽位。" },
  { label: "③ 签发租约", layers: ["lease", "capability"], story: "按请求的作用域计算摘要，签发绑定该摘要与回合 ID 的租约——凭据从此不可挪用到别的线程。" },
  { label: "④ 授予能力", layers: ["capability", "tool"], story: "能力平面按最小特权授予本轮可用能力；工具生命周期据此决定哪些工具对这轮可见。" },
  { label: "⑤ 执行回合", layers: ["core", "approval", "tool"], story: "内核跑回合循环；需要越界操作时由审批控制裁决并留痕，工具调用全程经过授权管线。" },
  { label: "⑥ 事件落库", layers: ["store"], story: "TurnStarted / ExecCommandEnd / TurnCompleted…逐条追加；投影增量更新，查询永远读投影而非重放全史。" },
  { label: "⑦ 应答释放", layers: ["http", "lease"], story: "响应返回，租约到期作废；排水期间新请求被拒、旧回合被允许跑完。" },
];

export function initPlatformMap(root: HTMLElement | null): void {
  if (!root) return;

  const detail = root.querySelector<HTMLElement>("[data-detail]");
  const detailName = root.querySelector<HTMLElement>("[data-detail-name]");
  const detailEn = root.querySelector<HTMLElement>("[data-detail-en]");

  const showLayer = (id: string): void => {
    const l = LAYERS[id];
    if (!l || !detail || !detailName || !detailEn) return;
    detailName.textContent = l.name;
    detailEn.textContent = l.en;
    detail.textContent = l.role;
    root.querySelectorAll("[data-layer]").forEach((el) => {
      el.classList.toggle("is-focus", (el as HTMLElement).dataset.layer === id);
      el.classList.remove("is-involved");
    });
  };

  root.querySelectorAll<HTMLElement>("[data-layer]").forEach((el) => {
    el.addEventListener("click", () => {
      root
        .querySelectorAll("[data-jstep]")
        .forEach((s) => s.setAttribute("aria-pressed", "false"));
      showLayer(el.dataset.layer!);
    });
  });

  const stepBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-jstep]"));
  stepBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = JOURNEY.find((j) => j.label === btn.dataset.jstep);
      if (!step || !detail || !detailName || !detailEn) return;
      stepBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      detailName.textContent = step.label;
      detailEn.textContent = "request journey";
      detail.textContent = step.story;
      root.querySelectorAll("[data-layer]").forEach((el) => {
        const involved = step.layers.includes((el as HTMLElement).dataset.layer ?? "");
        el.classList.toggle("is-involved", involved);
        el.classList.toggle("is-focus", false);
      });
    });
  });

  // 默认聚焦最核心的一层
  showLayer("core");
}
