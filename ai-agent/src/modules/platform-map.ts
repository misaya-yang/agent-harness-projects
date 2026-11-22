/**
 * 平台运行时架构图：
 * 点击层级查看职责说明；点击「一次请求的旅程」步骤，
 * 高亮该步涉及的层级并给出叙事。纯 DOM + class 切换。
 */

const LAYERS: Record<string, { name: string; en: string; role: string }> = {
  "client": {
    name: "客户端表面",
    en: "client surface",
    role: "CLI、IDE 与应用负责收集输入、展示事件和承接审批；它们是运行状态的投影，不另造一份权威会话。",
  },
  "appserver": {
    name: "App Server 协议边界",
    en: "app server",
    role: "把 start、resume、steer、interrupt 与审批等双向动作翻译成会话操作，再把 Item 和 Turn 事件送回客户端。",
  },
  "session": {
    name: "会话与提交队列",
    en: "session actor",
    role: "串行接收用户操作，拥有活动 Turn、信箱与取消句柄；同一会话的并发写入在这里收口。",
  },
  "turn": {
    name: "Turn 与 step 循环",
    en: "turn loop",
    role: "冻结本步输入后请求模型；只要还有工具结果、排队输入或明确跟进，就进入下一个 step，直到收束。",
  },
  "tool": {
    name: "工具路由与回执",
    en: "tool router",
    role: "按本步快照生成可见工具，校验调用、执行并把结果与 call id 配对；工具失败通常回给模型自纠。",
  },
  "sandbox": {
    name: "审批与执行边界",
    en: "policy + sandbox",
    role: "审批决定是否向人请求升级，沙箱和命令规则决定操作最终能做什么；两条轴不能互相替代。",
  },
  "history": {
    name: "历史与重放",
    en: "rollout history",
    role: "记录已提交的输入、模型输出、工具调用和回执；resume 与在线运行共用重放语义，compaction 只改变模型工作视图。",
  },
  "config": {
    name: "本步有效配置",
    en: "step context",
    role: "模型、基础指令、项目规则、环境事实、工具面与权限在 step 开始时被冻结；中途变化到下一个边界再生效。",
  },
};

const JOURNEY: Array<{ label: string; layers: string[]; story: string }> = [
  { label: "① 输入", layers: ["client", "appserver", "session"], story: "客户端提交请求；协议层把它变成会话操作，提交队列保证同一会话只有一个权威写入顺序。" },
  { label: "② 步快照", layers: ["session", "turn", "config", "tool"], story: "Turn 开始一个 step，冻结本步模型、指令、环境与可见工具；中途更新留到下一个边界。" },
  { label: "③ 模型", layers: ["turn", "history"], story: "模型基于重放出的工作历史返回文本或工具调用；流式片段可展示，完整输出项才进入可重放历史。" },
  { label: "④ 工具", layers: ["turn", "tool", "sandbox"], story: "调用先校验和裁决，再在执行边界内运行；成功、失败、取消都要生成与原调用配对的回执。" },
  { label: "⑤ 回注", layers: ["tool", "history", "turn"], story: "工具回执写入历史并进入下一次模型请求。模型此时才知道操作实际发生了什么。" },
  { label: "⑥ 收束", layers: ["turn", "session", "history"], story: "没有待处理工具、排队输入或跟进条件时 Turn 收束；中断也必须写下明确终态，而不是丢掉半轮。" },
  { label: "⑦ 持久化", layers: ["history", "appserver", "client"], story: "已提交事实可用于 resume、fork 与 UI 重建；客户端收到终态事件后再把本轮显示为完成。" },
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

  showLayer("turn");
}
