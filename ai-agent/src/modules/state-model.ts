type ThreadState = "new" | "active" | "idle" | "interrupted" | "archived";

const LABELS: Record<ThreadState, string> = {
  new: "尚未初始化",
  active: "turn inProgress",
  idle: "thread idle",
  interrupted: "turn interrupted",
  archived: "thread archived",
};

export function initStateModel(root: HTMLElement | null): void {
  if (!root) return;

  let state: ThreadState = "new";
  let thread = 0;
  let turn = 0;
  let item = 0;
  const stateEl = root.querySelector<HTMLElement>("[data-state]");
  const threadEl = root.querySelector<HTMLElement>("[data-thread-id]");
  const turnEl = root.querySelector<HTMLElement>("[data-turn-count]");
  const itemEl = root.querySelector<HTMLElement>("[data-item-count]");
  const log = root.querySelector<HTMLElement>("[data-log]");
  const note = root.querySelector<HTMLElement>("[data-state-note]");

  const append = (kind: string, text: string): void => {
    if (!log) return;
    const line = document.createElement("span");
    line.className = "ev";
    const payload = document.createElement("span");
    payload.className = kind;
    payload.textContent = text;
    line.append(payload);
    log.append(line);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 10) log.firstElementChild?.remove();
  };

  const render = (message: string): void => {
    if (stateEl) {
      stateEl.textContent = LABELS[state];
      stateEl.dataset.state = state;
    }
    if (threadEl) threadEl.textContent = thread ? `thread_${thread}` : "—";
    if (turnEl) turnEl.textContent = String(turn).padStart(2, "0");
    if (itemEl) itemEl.textContent = String(item).padStart(2, "0");
    if (note) note.textContent = message;
  };

  const act = (action: string): void => {
    switch (action) {
      case "start":
        if (state === "active" || state === "archived") {
          render("活跃线程需先结束当前回合。归档后可 Reset 开始新的实验。");
          return;
        }
        if (state === "new") {
          thread += 1;
          append("k-user", `thread/start · thread_${thread}`);
        }
        state = "active";
        turn += 1;
        item += 1;
        append("k-user", `turn/start → turn/started · turn_${turn}`);
        append("k-sys", "item/completed · userMessage");
        render("已开始一轮。首次 Start 同时创建 Thread，后续 Start 沿用当前 Thread。");
        break;
      case "item":
        if (state !== "active") {
          render("先用 Start 启动活跃 Turn，再追加示例 Item。");
          return;
        }
        item += 1;
        append("k-model", `item/started → item/completed · item_${item}`);
        render("Item 是最小输入/输出单元：消息、命令、文件变更、工具调用都属于 Item。 ");
        break;
      case "steer":
        if (state !== "active") {
          render("turn/steer 只能追加到正在进行的 Turn。 ");
          return;
        }
        append("k-user", `turn/steer · expectedTurnId=turn_${turn}`);
        render("输入已受理，等后续采样采用。回合与 Item 数量暂时保持不变。");
        break;
      case "complete":
        if (state !== "active") return;
        state = "idle";
        append("k-sys", "turn/completed · turn.status=completed");
        render("Turn 完成，Thread 保留历史并回到 idle，可继续下一轮或归档。 ");
        break;
      case "interrupt":
        if (state !== "active") return;
        state = "interrupted";
        append("k-warn", "turn/interrupt → turn/completed · interrupted");
        render("Interrupt 请求取消在途工作；最终仍以 turn/completed 通知收尾。 ");
        break;
      case "resume":
        if (state === "new") {
          render("先创建一个可恢复的 Thread。");
          return;
        }
        if (state === "archived") {
          render("请用未归档线程演示重连，或 Reset 后开始新的实验。");
          return;
        }
        append("k-sys", `thread/resume · thread_${thread}`);
        render("Resume 读取已有 Thread；需要继续工作时显式发起下一轮。");
        break;
      case "fork":
        if (state === "new" || state === "active" || state === "archived") {
          render("本实验在未归档 Thread 的回合边界演示 Fork。");
          return;
        }
        state = "idle";
        append("k-tool", `thread/fork · thread_${thread} → thread_${thread + 1}`);
        thread += 1;
        render("Fork 将已有历史复制到新 Thread。观察 Thread ID 变化，历史计数保留。");
        break;
      case "archive":
        if (state === "new" || state === "active" || state === "archived") {
          render("本实验在现有 Thread 的回合边界演示归档。");
          return;
        }
        state = "archived";
        append("k-sys", "thread/archive → thread/archived");
        render("Thread 已归档，历史计数仍保留。");
        break;
      case "reset":
        state = "new";
        thread = 0;
        turn = 0;
        item = 0;
        log?.replaceChildren();
        render("握手已完成。用 Start 建立 Thread 并开始首轮。");
        break;
    }
  };

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (button) act(button.dataset.action ?? "");
  });

  render("握手已完成。用 Start 建立 Thread 并开始首轮。");
}
