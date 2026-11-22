import "./styles/base.css";
import "./styles/home.css";
import { initTheme } from "./modules/theme";
import { initSeriesNav } from "./modules/series-nav";

initTheme();
initSeriesNav();

const topics = Array.from(document.querySelectorAll<HTMLDetailsElement>(".atlas-topic"));
const indexLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".atlas-topic-index a"));

function highlightTopic(id: string | undefined): void {
  indexLinks.forEach((link) => {
    if (link.hash === `#${id}`) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

function openTopic(id: string): void {
  const topic = topics.find((item) => item.id === id);
  if (!topic) return;
  topic.open = true;
  highlightTopic(id);
}

topics.forEach((topic) => {
  topic.addEventListener("toggle", () => {
    highlightTopic(topics.find(item => item.open)?.id);
  });
});

indexLinks.forEach((link) => {
  link.addEventListener("click", () => openTopic(link.hash.slice(1)));
});

window.addEventListener("hashchange", () => openTopic(location.hash.slice(1)));
openTopic(location.hash.slice(1) || "topic-loop");

const traceNotes: Record<string, string> = {
  model: "用户请求运行测试。宿主准备可用工具，模型据此提出一条测试命令。",
  tools: "测试退出码为 0。宿主用调用编号配对结果，再让模型根据这次结果作答。",
  finish: "模型给出最终答复，宿主检查停止条件并结束本回合。工具成功完成只是其中一步。",
};
const figure = document.querySelector<HTMLElement>("[data-run-figure]");
figure?.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-step-key]");
  if (!button) return;
  const key = button.dataset.stepKey!;
  figure.dataset.step = key;
  for (const step of figure.querySelectorAll("[data-step-key]")) step.setAttribute("aria-pressed", String(step === button));
  figure.querySelector(".run-explanation")!.textContent = traceNotes[key];
});

const query = document.querySelector<HTMLInputElement>("[data-case-search]");
query?.addEventListener("input", () => {
  const term = query.value.trim().toLowerCase();
  const entries = [...document.querySelectorAll<HTMLAnchorElement>(".project-card")];
  for (const entry of entries) entry.hidden = ![entry.textContent, entry.dataset.keywords].join(" ").toLowerCase().includes(term);
  document.querySelector(".atlas-case-list")?.classList.toggle("is-filtering", Boolean(term));
  document.querySelector<HTMLElement>("[data-case-empty]")!.hidden = entries.some(entry => !entry.hidden);
});
