/**
 * 协议事件流演示器：
 * 回放一轮当前 App Server Thread/Turn/Item 通知序列（JSONL 观感），
 * 支持播放/暂停、速度切换与重放；减弱动效下直接完整呈现。
 */

interface Line {
  cls: string;
  dir?: "in" | "out" | "ev";
  text: string;
  note?: string;
}

const SCRIPT: Line[] = [
  { cls: "k-user", dir: "in", text: 'turn/start { threadId, input: [{ type: "text", text: "修复 test_login" }] }' },
  { cls: "k-sys", text: "◂ turn/started { turn.id: turn_42 }" },
  { cls: "k-sys", text: "◂ item/started { type: agentMessage }" },
  { cls: "k-model", text: '◂ item/agentMessage/delta "先复现这个用例。"' },
  { cls: "k-sys", text: "◂ item/completed { type: agentMessage }" },
  { cls: "k-tool", dir: "out", text: "◂ item/started { type: commandExecution }" },
  { cls: "k-warn", text: "◂ item/commandExecution/requestApproval", note: "threadId + turnId + itemId" },
  { cls: "k-user", dir: "in", text: '→ { decision: "accept" }' },
  { cls: "k-sys", text: "◂ serverRequest/resolved { requestId }" },
  { cls: "k-tool", text: "◂ item/completed { commandExecution · exitCode: 1 }" },
  { cls: "k-tool", dir: "out", text: "◂ item/started { type: fileChange }" },
  { cls: "k-tool", text: "◂ item/completed { fileChange · status: completed }" },
  { cls: "k-model", text: '◂ item/agentMessage/delta "已修复并验证 6 passed。"' },
  { cls: "k-sys", text: "◂ item/completed { type: agentMessage }" },
  { cls: "k-sys", text: "◂ turn/completed { status: completed }" },
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
