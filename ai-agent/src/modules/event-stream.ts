/** 回放一次 steer 后又 interrupt 的在途 Turn；减弱动效下直接完整呈现。 */

interface Line {
  cls: string;
  dir?: "in" | "out" | "ev";
  text: string;
  note?: string;
}

const SCRIPT: Line[] = [
  { cls: "k-user", dir: "in", text: 'turn/start { threadId, input: [{ type: "text", text: "修复 test_login" }] }' },
  { cls: "k-sys", dir: "out", text: "turn/started { turn.id: turn_42 }" },
  { cls: "k-tool", dir: "out", text: "item/started { type: commandExecution }" },
  { cls: "k-user", dir: "in", text: 'turn/steer { threadId, expectedTurnId: turn_42, input: [{ type: "text", text: "不要修改数据库" }] }' },
  { cls: "k-sys", dir: "out", text: "turn/steer result { turnId: turn_42 }", note: "已受理，仍等待后续采样" },
  { cls: "k-tool", dir: "out", text: "item/completed { commandExecution · exitCode: 1 }" },
  { cls: "k-sys", text: "内部 · 在后续采样边界消费排队输入" },
  { cls: "k-user", text: '内部 · 活跃历史新增“不要修改数据库”' },
  { cls: "k-model", text: "next sampling step · 新约束已可见" },
  { cls: "k-tool", dir: "out", text: "item/started { type: commandExecution }" },
  { cls: "k-user", dir: "in", text: "turn/interrupt { threadId, turnId: turn_42 }" },
  { cls: "k-warn", text: "内部 · 触发取消并尝试收尾" },
  { cls: "k-tool", text: "内部 · Core 尝试结算在途工具" },
  { cls: "k-sys", text: "内部 · 记录中断边界", note: "副作用可能已部分发生" },
  { cls: "k-sys", text: "核对宿主日志 · 进程可能已产生副作用" },
  { cls: "k-sys", dir: "out", text: "turn/interrupt result {}" },
  { cls: "k-sys", dir: "out", text: "turn/completed { threadId, turn: { id: turn_42, status: interrupted } }" },
];

export function initEventStream(
  root: HTMLElement | null,
  reducedMotion: MediaQueryList,
): void {
  if (!root) return;

  const log = root.querySelector<HTMLElement>("[data-log]");
  const playBtn = root.querySelector<HTMLButtonElement>("[data-play]");
  const speedBtn = root.querySelector<HTMLButtonElement>("[data-speed]");
  const againBtn = root.querySelector<HTMLButtonElement>("[data-restart]");
  const phase = root.querySelector<HTMLElement>("[data-phase]");
  if (!log || !playBtn) return;

  const speeds = [1, 4] as const;
  let speedIdx = 0;
  let cursor = 0;
  let timer = 0;
  let playing = false;

  const appendLine = (line: Line): void => {
    const span = document.createElement("span");
    span.className = "ev";
    const arrow =
      line.dir === "in" ? "↑ " : line.dir === "out" ? "↓ " : line.dir === "ev" ? "· " : "  ";
    const k = document.createElement("span");
    k.className = line.cls;
    k.textContent = arrow + line.text;
    span.append(k);
    if (line.note) {
      const n = document.createElement("span");
      n.className = "t";
      n.textContent = "   ← " + line.note;
      span.append(n);
    }
    log.append(span);
    log.scrollTop = log.scrollHeight;
  };

  const renderAll = (): void => {
    log.replaceChildren();
    for (const line of SCRIPT) appendLine(line);
    cursor = SCRIPT.length;
    playing = false;
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.textContent = "▶ 播放";
    if (phase) phase.textContent = `${SCRIPT.length}/${SCRIPT.length} · 完成`;
  };

  const tick = (): void => {
    if (cursor >= SCRIPT.length) {
      playing = false;
      playBtn.setAttribute("aria-pressed", "false");
      playBtn.textContent = "▶ 重播";
      if (phase) phase.textContent = `${SCRIPT.length}/${SCRIPT.length} · 完成`;
      return;
    }
    appendLine(SCRIPT[cursor]);
    cursor += 1;
    if (phase) phase.textContent = `${cursor}/${SCRIPT.length}`;
    timer = window.setTimeout(tick, 520 / speeds[speedIdx]);
  };

  const setPlaying = (on: boolean): void => {
    playing = on;
    playBtn.setAttribute("aria-pressed", String(on));
    playBtn.textContent = on ? "⏸ 暂停" : cursor >= SCRIPT.length ? "▶ 重播" : "▶ 播放";
    if (on) {
      if (cursor >= SCRIPT.length) {
        log.replaceChildren();
        cursor = 0;
      }
      tick();
    } else {
      window.clearTimeout(timer);
    }
  };

  // 减弱动效：跳过流式过程，一次性给出全部内容。
  if (reducedMotion.matches) {
    renderAll();
  }

  playBtn.addEventListener("click", () => setPlaying(!playing));
  againBtn?.addEventListener("click", () => {
    window.clearTimeout(timer);
    log.replaceChildren();
    cursor = 0;
    setPlaying(true);
  });
  speedBtn?.addEventListener("click", () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    speedBtn.textContent = `${speeds[speedIdx]}×`;
    speedBtn.setAttribute("aria-pressed", String(speeds[speedIdx] === 4));
  });

  // 页面隐藏时暂停流式回放。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && playing) setPlaying(false);
  });
}
