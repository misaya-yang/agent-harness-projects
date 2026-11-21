import architecture from "./sources-architecture.mjs";
import alignment from "./sources-alignment.mjs";
import systems from "./sources-systems.mjs";
import { escapeText as esc } from "../web/labs/graphics.mjs";

export const lessonSources = { ...architecture, ...alignment, ...systems };

function sourceLink(source) {
  const url = new URL(source.url);
  if (url.protocol !== "https:" || !["direct", "search"].includes(source.kind)) throw Error("Invalid reference: " + source.label);
  const host = url.hostname.replace(/^www\./, "");
  return `<li><a href="${esc(url.href)}" rel="noreferrer" target="_blank"><span class="source-title">${esc(source.label)}</span><span class="source-origin">${source.kind === "search" ? "检索 · " : ""}${esc(host)}<span aria-hidden="true"> ↗</span></span></a></li>`;
}
export function sourceSection(id) {
  const sources = lessonSources[id];
  if (!sources?.length) return "";
  return `<section class="lesson-sources" data-part="sources"><h2 id="sources">参考来源</h2>
    <ol>${sources.map(sourceLink).join("")}</ol></section>`;
}
