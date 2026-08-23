const SURFACES: Record<string, { contract: string; best: string; transport: string }> = {
  cli: { contract: "交互式终端客户端", best: "本地探索、编码与人工在环任务", transport: "TUI ↔ Codex core" },
  ide: { contract: "编辑器内富客户端", best: "结合选区、诊断与代码审查上下文", transport: "IDE ↔ App Server" },
  appserver: { contract: "双向 JSON-RPC 协议", best: "把认证、历史、审批与流式事件嵌入产品", transport: "stdio / WebSocket / Unix socket" },
  sdk: { contract: "可编程 Agent 控制接口", best: "应用代码驱动本地 Codex Agent", transport: "SDK process / events" },
  exec: { contract: "非交互式命令入口", best: "脚本、CI 与确定输入输出的自动化", transport: "codex exec" },
  action: { contract: "GitHub 事件触发器", best: "PR 审查、CI 修复与仓库自动化", transport: "GitHub Action ↔ cloud run" },
};

export function initSurfaceSwitchboard(root: HTMLElement | null): void {
  if (!root) return;
  const contract = root.querySelector<HTMLElement>("[data-surface-contract]");
  const best = root.querySelector<HTMLElement>("[data-surface-best]");
  const transport = root.querySelector<HTMLElement>("[data-surface-transport]");

  const select = (id: string): void => {
    const entry = SURFACES[id];
    if (!entry || !contract || !best || !transport) return;
    contract.textContent = entry.contract;
    best.textContent = entry.best;
    transport.textContent = entry.transport;
    root.querySelectorAll<HTMLButtonElement>("[data-surface]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.surface === id));
    });
  };

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-surface]");
    if (button) select(button.dataset.surface ?? "");
  });

  select("cli");
}
