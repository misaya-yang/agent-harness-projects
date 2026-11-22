import "./styles/base.css";
import "./styles/home.css";
import { initTheme } from "./modules/theme";
import { initSeriesNav } from "./modules/series-nav";

initTheme();
initSeriesNav();

const topics = Array.from(document.querySelectorAll<HTMLDetailsElement>(".atlas-topic"));
const indexLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".atlas-topic-index a"));

function highlightTopic(id: string): void {
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
    if (topic.open) highlightTopic(topic.id);
  });
});

indexLinks.forEach((link) => {
  link.addEventListener("click", () => openTopic(link.hash.slice(1)));
});

window.addEventListener("hashchange", () => openTopic(location.hash.slice(1)));
openTopic(location.hash.slice(1) || "topic-loop");

const traceNotes: Record<string, string> = {
  model: "宿主将用户输入和可用工具一起交给模型。",
  tools: "工具执行完毕，结果与调用编号配对，进入下一次模型请求。",
  finish: "宿主确认没有待处理的工具工作，再把本轮结果写入会话。",
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
