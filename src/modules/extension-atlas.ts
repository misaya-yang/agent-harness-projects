const ENTRIES: Record<string, { title: string; role: string; boundary: string }> = {
  agents: { title: "AGENTS.md", role: "随仓库传播的项目指导：命令、约定、评审要求与目录级规则。", boundary: "进入提示上下文；它约束行为，不执行工具。" },
  memory: { title: "Memories", role: "把跨对话仍有用的局部事实与偏好带到后续工作。", boundary: "是持久上下文，不等于模型参数或完整聊天历史。" },
  skill: { title: "Skills", role: "把可复用流程、领域知识与依赖声明封装成按需加载的能力。", boundary: "可作为 turn input item 显式注入；仍受工具权限约束。" },
  mcp: { title: "MCP", role: "连接外部工具、资源与共享系统，并支持 OAuth、资源读取和 elicitation。", boundary: "远端内容是不可信输入；副作用工具仍需审批。" },
  app: { title: "Apps / Connectors", role: "在策略允许时，把经过产品化封装的外部系统能力暴露给模型。", boundary: "可访问、已启用、可调用是三个不同状态。" },
  dynamic: { title: "Dynamic tools", role: "客户端在 Thread 启动时注入的动态工具，并通过 item/tool/call 回调执行。", boundary: "当前属于实验性 App Server API。" },
  hook: { title: "Hooks", role: "在生命周期节点运行确定性脚本，用于校验、日志、安全检查与记忆生成。", boundary: "钩子代码需要被信任；它不是模型自行决定的工具调用。" },
  subagent: { title: "Subagents", role: "把有边界的专业子任务交给独立上下文与工具配置的 Agent。", boundary: "委派扩大并行度，但不自动扩大主任务的授权范围。" },
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

  select("agents");
}
