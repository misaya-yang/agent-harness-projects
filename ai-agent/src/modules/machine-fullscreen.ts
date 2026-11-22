let initialized = false;

export function initMachineFullscreen(): void {
  if (initialized || !document.fullscreenEnabled) return;
  initialized = true;

  document.querySelectorAll<HTMLElement>(".machine").forEach((machine) => {
    const bar = machine.querySelector<HTMLElement>(".machine-bar");
    if (!bar || bar.querySelector("[data-machine-fullscreen]")) return;
    const button = document.createElement("button");
    button.className = "cbtn machine-fullscreen-btn";
    button.type = "button";
    button.dataset.machineFullscreen = "";
    button.setAttribute("aria-label", "进入全屏实验视图");
    button.innerHTML = `<span aria-hidden="true">⛶</span><span>全屏视图</span>`;
    button.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === machine) await document.exitFullscreen();
        else await machine.requestFullscreen();
      } catch {
        // 浏览器或嵌入环境拒绝全屏时保持原布局。
      }
    });
    bar.append(button);
  });

  document.addEventListener("fullscreenchange", () => {
    document.querySelectorAll<HTMLElement>(".machine").forEach((machine) => {
      const active = document.fullscreenElement === machine;
      const button = machine.querySelector<HTMLButtonElement>("[data-machine-fullscreen]");
      machine.classList.toggle("is-fullscreen", active);
      if (!button) return;
      button.setAttribute("aria-label", active ? "退出全屏实验视图" : "进入全屏实验视图");
      button.innerHTML = active
        ? `<span aria-hidden="true">✕</span><span>退出全屏</span>`
        : `<span aria-hidden="true">⛶</span><span>全屏视图</span>`;
    });
  });
}
