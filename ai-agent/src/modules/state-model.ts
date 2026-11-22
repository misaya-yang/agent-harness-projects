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
  let turn = 0;
  let item = 0;
  const stateEl = root.querySelector<HTMLElement>("[data-state]");
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
    if (turnEl) turnEl.textContent = String(turn).padStart(2, "0");
    if (itemEl) itemEl.textContent = String(item).padStart(2, "0");
    if (note) note.textContent = message;
  };

  const act = (action: string): void => {
    switch (action) {
      case "start":
        state = "active";
        turn += 1;
        item += 1;
        append("k-user", `thread/start → turn/start · turn_${turn}`);
        append("k-sys", "item/started · userMessage");
        render("新 Thread 已建立，本轮开始流式产生 Item。现实协议要求连接先完成 initialize 握手。");
        break;
      case "item":
        if (state !== "active") {
          render("只有活跃 Turn 才能继续产生 Item；先 start 或 resume。 ");
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
        item += 1;
        append("k-user", `turn/steer · append item_${item}`);
        render("Steer 不创建新 Turn，而是向当前在途 Turn 追加用户输入。 ");
        break;
      case "complete":
        if (state !== "active") return;
        state = "idle";
        append("k-sys", "turn/completed · status=completed");
        render("Turn 完成，Thread 保留历史并回到 idle，可继续下一轮或归档。 ");
        break;
      case "interrupt":
        if (state !== "active") return;
        state = "interrupted";
        append("k-warn", "turn/interrupt → turn/completed · interrupted");
        render("Interrupt 请求取消在途工作；最终仍以 turn/completed 通知收尾。 ");
        break;
      case "resume":
        state = "active";
        turn += 1;
        item += 1;
        append("k-sys", `thread/resume → turn/start · turn_${turn}`);
        render("Resume 重新加载已持久化 Thread，新的 Turn 追加到原历史。 ");
        break;
      case "fork":
        state = "idle";
        turn = Math.max(turn, 1);
        append("k-tool", "thread/fork · forkedFromId=thread_origin");
        render("Fork 复制指定历史边界并得到新的 Thread ID；原 Thread 不被修改。 ");
        break;
      case "archive":
        state = "archived";
        append("k-sys", "thread/archive → thread/archived");
        render("Archive 移动持久化日志并发出通知；它与永久删除不是同一件事。 ");
        break;
      case "reset":
        state = "new";
        turn = 0;
        item = 0;
        log?.replaceChildren();
        render("从连接初始化前的状态重新开始。 ");
        break;
    }
  };

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (button) act(button.dataset.action ?? "");
  });

  render("从连接初始化前的状态重新开始。 ");
}
