/**
 * 协议事件流演示器：
 * 回放一轮真实形态的 Submission/Event 序列（JSONL 观感），
 * 支持播放/暂停、速度切换与重放；减弱动效下直接完整呈现。
 */

interface Line {
  cls: string;
  dir?: "in" | "out" | "ev";
  text: string;
  note?: string;
}

const SCRIPT: Line[] = [
  { cls: "k-user", dir: "in", text: '→ Op::TurnInput { input: "测试 test_login 挂了，修一下"' },
  { cls: "k-sys", text: "◂ EventMsg::TurnStarted          (wire: task_started)" },
  { cls: "k-model", text: '◂ AgentMessageContentDelta "先复现：跑一下这个用例。"' },
  { cls: "k-tool", dir: "out", text: '→ shell ["cargo","test","login"]' },
  { cls: "k-warn", text: "◂ EventMsg::ExecCommandEnd { exit_code: 1 }" },
  { cls: "k-model", text: '◂ AgentMessageContentDelta "断言过期了：登录页已改版，更新断言并补快照。"' },
  { cls: "k-tool", dir: "out", text: '→ apply_patch *** Update File: tests/login.rs' },
  { cls: "k-warn", text: "◂ requestApproval(file_change) —— 策略要求请示用户", note: "平台侧落库为 approval 行 · TTL 600s" },
  { cls: "k-user", dir: "in", text: '→ decision { decision: "approve" }' },
  { cls: "k-sys", text: "◂ EventMsg::PatchAppliedBegin / End { success: true }" },
  { cls: "k-tool", dir: "out", text: '→ shell ["cargo","test","login"]' },
  { cls: "k-tool", text: "◂ EventMsg::ExecCommandEnd { exit_code: 0 · 6 passed }" },
  { cls: "k-model", text: '◂ AgentMessageContentDelta "已修复：……建议把快照纳入 CI。"' },
  { cls: "k-sys", text: "◂ EventMsg::TurnComplete          (wire: task_complete)" },
  { cls: "k-sys", text: "◂ EventMsg::TokenCount { 21,407 tok · cache_read 71% }" },
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
