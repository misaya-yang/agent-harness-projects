import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { lessonTopics } from "./lesson-topics.mjs";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { lessonById } from "./curriculum.mjs";

const md = new MarkdownIt({ html: false, linkify: true });
const escape = md.utils.escapeHtml;
export { escape as escapeHtml };
hljs.registerLanguage("python", python);
export const mathErrors = [];

md.use(texmath, { delimiters: "dollars", engine: katex });
for (const name of Object.keys(md.renderer.rules)) {
  if (!name.startsWith("math_")) continue;
  md.renderer.rules[name] = (tokens, index, options, env) => {
    const displayMode = name.startsWith("math_block") || name.includes("double");
    // The exported notes escape each TeX backslash twice, including line breaks.
    const expression = tokens[index].content.replaceAll("\\\\", "\\").trim();
    try {
      const rendered = katex.renderToString(expression, { displayMode, throwOnError: true, strict: "ignore", trust: false });
      return displayMode ? `<div class="math-block" tabindex="0" aria-label="公式">${rendered}</div>\n` : rendered;
    } catch (error) {
      mathErrors.push({ lesson: env.lesson, message: error.message, expression });
      return `<code class="math-fallback">${escape(expression)}</code>`;
    }
  };
}

const text = tokens => (tokens ?? []).map(token => token.type === "link_open" || token.type === "link_close" ? "" : token.content).join("");
function sectionInfo(title, topic) {
  const name = title.replace(/^\d+[.、]\s*/, "");
  if (/^痛点与钩子/.test(name)) return { title: topic?.problem ?? name, kind: "text" };
  if (/^第一性原理/.test(name)) return { title: topic?.concepts ?? name, kind: "text" };
  if (/^承重墙推导/.test(name)) return { title: topic?.derivation ?? "数学推导", kind: "proof" };
  if (/^极简代码锚点/.test(name)) return { title: name.replace("极简代码锚点", "代码实现"), kind: "code" };
  if (/^实战直觉/.test(name)) return { title: "工程应用与常见误区", kind: "practice" };
  if (/自测/.test(name)) return { title: "自测", kind: "quiz" };
  return { title: name, kind: "text" };
}

md.renderer.rules.fence = (tokens, index) => {
  const { info, content } = tokens[index];
  const highlighted = info === "python" ? hljs.highlight(content, { language: "python" }).value : escape(content);
  const pre = `<pre tabindex="0"><code>${highlighted}</code></pre>`;
  if (!info) return pre + "\n";
  return `<div class="markdown-code-block"><div class="markdown-code-toolbar"><span>${escape(info)}</span><button type="button" data-copy>复制代码</button></div>${pre}</div>\n`;
};
md.renderer.rules.table_open = () => '<div class="technical-table-wrap" tabindex="0" role="region" aria-label="表格"><table>';
md.renderer.rules.table_close = () => "</table></div>";
const originalText = md.renderer.rules.text;
md.renderer.rules.text = (tokens, index, options, env, self) => {
  const value = tokens[index].content;
  if (env.roadmap) return originalText(tokens, index, options, env, self);
  let result = "";
  let offset = 0;
  for (const match of value.matchAll(/→\s*(\d+\.\d+)(?:\s*§\s*(\d+))?/g)) {
    const lesson = lessonById.get(match[1]);
    if (!lesson?.url) continue;
    result += escape(value.slice(offset, match.index));
    const anchor = match[2] ? `#section-${match[2]}` : "";
    result += `<a href="${lesson.url}${anchor}">${escape(match[0])}</a>`;
    offset = match.index + match[0].length;
  }
  return result + escape(value.slice(offset));
};

function prepareTokens(tokens, env) {
  let quizSection = false;
  let question = 0;
  for (const [i, token] of tokens.entries()) {
    if (token.type === "heading_open" && (token.tag === "h2" || token.tag === "h3")) {
      if (token.tag === "h2" && token.level === 0) {
        const title = text(tokens[i + 1].children);
        const number = title.match(/^(\d+)\./)?.[1];
        const id = number ? `section-${number}` : `section-${env.outline.length + 1}`;
        token.attrSet("id", id);
        env.outline.push({ id, ...sectionInfo(title, env.topic) });
        quizSection = !env.roadmap && /自测/.test(title);
      } else if (token.tag === "h3") {
        const subsection = text(tokens[i + 1].children).match(/^(\d+\.\d+)/)?.[1];
        if (subsection) token.attrSet("id", `section-${subsection.replace(".", "-")}`);
      }
    }
    if (quizSection && token.type === "ordered_list_open" && token.level === 0) {
      token.attrJoin("class", "quiz");
    }
    if (quizSection && token.type === "list_item_open" && token.level === 1) {
      question++;
      token.meta = { question };
    }
    if (token.type === "inline") {
      const linked = token.children.some(part => part.type === "link_open");
      if (linked) for (const part of token.children) {
        if (part.type === "text") part.type = "literal_text";
      }
    }
  }
}

md.renderer.rules.literal_text = (tokens, index) => escape(tokens[index].content);
md.renderer.rules.list_item_open = (tokens, index) => {
  const question = tokens[index].meta?.question;
  return question
    ? `<li><input type="checkbox" data-question="${question}" aria-label="确认已完成自测第 ${question} 题">`
    : "<li>";
};

export function renderMarkdown(markdown, { isRoadmap = false, id } = {}) {
  const env = { roadmap: isRoadmap, lesson: id, topic: lessonTopics(id), outline: [] };
  // The opening quote contains the core intuition and a separate set of recall cues.
  const source = markdown.replace(/^(> [^\n]+\n)(> \*\*唤醒标签\*\*)/, "$1>\n$2");
  const tokens = md.parse(source, env);
  prepareTokens(tokens, env);
  const plain = tokens.filter(token => token.type === "inline" && token.level < 3).map(token => text(token.children)).join(" ");
  const render = group => md.renderer.render(group, md.options, env);
  if (isRoadmap) return { html: render(tokens), outline: env.outline, plain };

  // Keep native anchor IDs, while allowing the page to present each material type differently.
  const starts = tokens.map((token, i) => token.type === "heading_open" && token.tag === "h2" && !token.level ? i : -1).filter(i => i >= 0);
  const opening = tokens.slice(0, starts[0] ?? tokens.length);
  const intro = render(opening);
  const searchable = group => group.filter(token => token.type === "inline" || token.type === "fence")
    .map(token => token.type === "fence" ? token.content : text(token.children)).join(" ").replace(/\s+/g, " ");
  const parts = starts.map((start, i) => {
    const body = tokens.slice(start + 3, starts[i + 1] ?? tokens.length);
    if (body.at(-1)?.type === "hr") body.pop();
    const section = env.outline[i];
    // The notes mark the practice subsections with standalone bold paragraphs.
    let groups;
    if (section.kind === "practice") {
      const markers = body.flatMap((token, j) => {
        if (token.type !== "paragraph_open" || token.level !== 0) return [];
        const label = body[j + 1].content?.match(/^\*\*([^*]+)\*\*$/)?.[1];
        return label ? [{ label, start: j }] : [];
      });
      if (markers[0]?.start === 0 && markers.some(marker => marker.label.includes("与工程"))) {
        groups = markers.map(({ label, start }, j) => {
          const group = body.slice(start + 3, markers[j + 1]?.start);
          return { id: section.id + "-note-" + (j + 1), label, html: render(group), searchText: searchable(group) };
        });
      }
    }
    return { ...section, html: groups ? "" : render(body), groups, searchText: searchable(body) };
  });
  return { intro, introText: searchable(opening), parts, outline: env.outline, plain };
}
