const ENTRIES: Record<string, { title: string; role: string; boundary: string }> = {
  active: {
    title: "Active History",
    role: "当前 Agent Loop 用来派生下一次模型请求的工作集，包含消息、工具调用、回执和一个当前 compaction checkpoint。",
    boundary: "Compaction 可以替换；不会自动回读完整 transcript。",
  },
  rollout: {
    title: "Thread Rollout",
    role: "持久 Thread 的追加式会话日志，记录消息、检查点、World State、设置与必要事件。",
    boundary: "用于 resume、fork 与审计；不是每轮完整塞给模型。",
  },
  review: {
    title: "Guardian Review History",
    role: "保留审批判断需要的用户意图和原始证据，使模型历史被压缩后仍能审查授权。",
    boundary: "普通 compaction 不清除；显式 rollback 会同步调整相关证据。",
  },
  verified: {
    title: "Verified Answers",
    role: "由宿主确认的少量高价值问答，当前快照有条数与字节总量上限。",
    boundary: "是窄事实缓存，不是完整授权记录，也不是长期聊天记忆。",
  },
  longterm: {
    title: "Long-term Memories",
    role: "为后续 Thread 提供经筛选的上下文。提取和摘要读取按所选记忆版本与配置处理。",
    boundary: "实验性 thread/memory/read 读取已加载线程所选版本的摘要。恢复线程历史使用 resume。",
  },
};

export function initExtensionAtlas(root: HTMLElement | null): void {
  if (!root) return;
  const title = root.querySelector<HTMLElement>("[data-atlas-title]");
  const role = root.querySelector<HTMLElement>("[data-atlas-role]");
  const boundary = root.querySelector<HTMLElement>("[data-atlas-boundary]");

  const select = (id: string): void => {
    const entry = ENTRIES[id];
    if (!entry || !title || !role || !boundary) return;
    title.textContent = entry.title;
    role.textContent = entry.role;
    boundary.textContent = entry.boundary;
    root.querySelectorAll<HTMLButtonElement>("[data-atlas]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.atlas === id));
    });
  };

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-atlas]");
    if (button) select(button.dataset.atlas ?? "");
  });

  select("active");
}
