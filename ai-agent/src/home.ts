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
