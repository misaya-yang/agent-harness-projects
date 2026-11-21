import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { lessonById } from "./curriculum.mjs";

const md = new MarkdownIt({ html: false, linkify: true });
const escape = md.utils.escapeHtml;
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
const shortHeading = title => title.replace(/：.*$/, "");

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
      if (token.tag === "h2") {
        const title = text(tokens[i + 1].children);
        const number = title.match(/^(\d+)\./)?.[1];
        const id = number ? `section-${number}` : `section-${env.outline.length + 1}`;
        token.attrSet("id", id);
        env.outline.push({ id, title: shortHeading(title) });
        quizSection = !env.roadmap && /自测/.test(title);
      } else {
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
  const env = { roadmap: isRoadmap, lesson: id, outline: [] };
  const tokens = md.parse(markdown, env);
  prepareTokens(tokens, env);
  const plain = tokens.filter(token => token.type === "inline" && token.level < 3).map(token => text(token.children)).join(" ");
  return { html: md.renderer.render(tokens, md.options, env), outline: env.outline, plain };
}
