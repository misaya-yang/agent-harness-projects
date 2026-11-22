import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { renderLab, labDefinitions } from "./lesson-labs.mjs";
import { renderFigure } from "./static-figures.mjs";
import { lessonSources } from "./lesson-sources.mjs";
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
    const raw = tokens[index].content.trim();
    // Older exports doubled every command backslash. Native TeX uses a pair
    // for row breaks in matrices and alignments, which must reach KaTeX intact.
    const escapedExport = /(?:^|[^\\])\\\\[a-zA-Z]+/.test(raw) && !/(?:^|[^\\])\\[a-zA-Z]+/.test(raw);
    const expression = escapedExport ? raw.replaceAll("\\\\", "\\") : raw;
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
  if (/自测/.test(name)) return { title: /练习|迁移/.test(name) ? name : "自测", kind: "quiz" };
  return { title: name, kind: "text" };
}

md.renderer.rules.fence = (tokens, index, options, env) => {
  const { info, content } = tokens[index];
  if (info.trim() === "academy-lab") return renderLab(content.trim(), env.lesson);
  if (info.trim() === "academy-figure") return renderFigure(content.trim());
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
  const references = /→\s*(\d+\.\d+)(?:\s*§\s*(\d+))?|arXiv[：:\s]+(\d{4}\.\d{4,5}(?:v\d+)?)/gi;
  for (const match of value.matchAll(references)) {
    let url, citation;
    if (match[3]) {
      citation = env.arxiv.get(match[3]);
      url = citation?.url;
    } else {
      const lesson = lessonById.get(match[1]);
      if (lesson?.url) url = lesson.url + (match[2] ? "#section-" + match[2] : "");
    }
    if (!url) continue;
    result += escape(value.slice(offset, match.index));
    const attrs = citation ? ` class="inline-source" title="${escape(citation.label)}" target="_blank" rel="noreferrer"` : "";
    result += `<a href="${escape(url)}"${attrs}>${escape(match[0])}</a>`;
    offset = match.index + match[0].length;
  }
  return result + escape(value.slice(offset));
};

function prepareTokens(tokens, env) {
  let workedExamples = 0;
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
        const heading = text(tokens[i + 1].children);
        const subsection = heading.match(/^(\d+\.\d+)/)?.[1];
        if (subsection) token.attrSet("id", `section-${subsection.replace(".", "-")}`);
        else if (heading.startsWith("数值复算 · ")) {
          workedExamples++;
          token.attrSet("id", workedExamples === 1 ? "worked-example" : `worked-example-${workedExamples}`);
        }
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
      let linked = false;
      for (const part of token.children) {
        if (part.type === "link_open") linked = true;
        if (part.type === "link_close") linked = false;
        if (linked && part.type === "text") part.type = "literal_text";
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
  const arxiv = new Map();
  for (const source of lessonSources[id] ?? []) {
    const match = source.url.match(/^https:\/\/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?(?:$|[#?])/i);
    if (!match || source.kind !== "direct") continue;
    if (match[2]) arxiv.set(match[1]+match[2], source);
    if (!arxiv.has(match[1]) || !match[2]) arxiv.set(match[1], source);
  }
  const env = { roadmap: isRoadmap, lesson: id, topic: lessonTopics(id), outline: [], arxiv };
  // The opening quote contains the core intuition and a separate set of recall cues.
  const source = markdown.replace(/^(> [^\n]+\n)(> \*\*唤醒标签\*\*)/, "$1>\n$2");
  // The structured bibliography replaces the trailing source paragraph. Keep other notes.
  const bodySource = !isRoadmap && lessonSources[id]?.length ? source.replace(/(?:^|\n)> \*\*(?:前沿数据来源|主要来源|参考一手材料|原始资料)\*\*[：:][^\n]*\s*$/, "") : source;
  const tokens = md.parse(bodySource, env);
  const labs = tokens.filter(t => t.type === "fence" && t.info.trim() === "academy-lab").map(t=>t.content.trim());
  if (new Set(labs).size !== labs.length) throw Error("Duplicate lab in "+id);
  prepareTokens(tokens, env);
  const plain = tokens.filter(token => token.type === "inline" && token.level < 3).map(token => text(token.children)).join(" ");
  const render = group => md.renderer.render(group, md.options, env);
  if (isRoadmap) return { html: render(tokens), outline: env.outline, plain };

  // Keep native anchor IDs, while allowing the page to present each material type differently.
  const starts = tokens.map((token, i) => token.type === "heading_open" && token.tag === "h2" && !token.level ? i : -1).filter(i => i >= 0);
  const opening = tokens.slice(0, starts[0] ?? tokens.length);
  const intro = render(opening);
  const searchable = group => group.filter(token => token.type === "inline" || token.type === "fence")
    .map(token => token.type === "fence" ? (token.info.trim() === "academy-lab" ? labDefinitions[token.content.trim()]?.title : token.content) : text(token.children)).join(" ").replace(/\s+/g, " ");
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
    // Fold the implementation without hiding an experiment or the lesson's main argument.
    const codeSection = section.kind === "text" && /复算|代码|从零实现/.test(section.title)
      && body.some(token => token.attrGet("id")?.startsWith("worked-example"))
      && !body.some(token => token.type === "fence" && token.info.trim() === "academy-lab");
    return { ...section, kind: codeSection ? "code" : section.kind,
      html: groups ? "" : render(body), groups, searchText: searchable(body) };
  });
  return { intro, introText: searchable(opening), labs, parts, outline: env.outline, plain };
}
