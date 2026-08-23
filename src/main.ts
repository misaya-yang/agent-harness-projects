import "./styles/base.css";
import "./styles/layout.css";
import "./styles/machine.css";

import { initReveal } from "./modules/reveal";
import { initSpy } from "./modules/spy";
import { initNavMenu } from "./modules/navmenu";
import { initHeroPause } from "./modules/hero-pause";
import { initLoopMachine } from "./modules/loop-machine";
import { initEventStream } from "./modules/event-stream";
import { initSandboxSim } from "./modules/sandbox-sim";
import { initContextMeter } from "./modules/context-meter";
import { initPlatformMap } from "./modules/platform-map";
import { initTheme } from "./modules/theme";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function boot(): void {
  initTheme();
  initReveal(reducedMotion.matches);
  initSpy();
  initNavMenu();
  initHeroPause();

  initLoopMachine(document.querySelector("#machine-loop"), reducedMotion);
  initEventStream(document.querySelector("#machine-stream"), reducedMotion);
  initSandboxSim(document.querySelector("#machine-sandbox"));
  initContextMeter(document.querySelector("#machine-context"));
  initPlatformMap(document.querySelector("#machine-platform"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
