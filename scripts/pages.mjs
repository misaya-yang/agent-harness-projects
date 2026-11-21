import { readFileSync } from "node:fs";
import { lessonTopics } from "./lesson-topics.mjs";
import { lessonFigure } from "./lesson-figures.mjs";
import { available, lessons, modules, learningOrder, stages } from "./curriculum.mjs";

const title = "Misaya Academy";
const description = "从大模型架构到后训练、多模态、生成模型与训练工程，沿着讲义、推导、代码和自测系统学习 AI 算法。";
export const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
);
const icons = new Map();
function icon(name, size = 18) {
  if (!icons.has(name)) {
    const url = new URL(`../node_modules/lucide-static/icons/${name}.svg`, import.meta.url);
    icons.set(name, readFileSync(url, "utf8").replace(/^[\s\S]*?(?=<svg)/, ""));
  }
  return icons.get(name).replace("<svg", '<svg aria-hidden="true" focusable="false"').replace(/(height|width)="24"/g, `$1="${size}"`);
}

function courseLinks(activeModule, showResume) {
  return `<div class="course-links">${modules.map(module =>
    `<a href="${module.url}"${module === activeModule ? ' class="current-module"' : ""}><span class="module-code">${module.id}</span>${module.title}</a>`
  ).join("")}<a class="all-courses" href="/#modules">${icon("library-big", 16)}全部课程${icon("arrow-right", 14)}</a>
    ${showResume ? `<a class="resume-course" data-resume href="${learningOrder[0].url}">${icon("book-open", 16)}<span>开始学习</span></a>` : ""}</div>`;
}

function studyNav(current) {
  return [["/roadmap.html", "route", "学习路线"], ["/progress.html", "chart-no-axes-column", "我的学习"]].map(([url, glyph, label]) =>
    `<a class="nav-link" href="${url}"${url === current ? ' aria-current="page"' : ""}>${icon(glyph, 16)}${label}</a>`
  ).join("");
}

const themeControl = `<button class="nav-icon-button nav-theme-toggle" data-theme-toggle type="button" aria-label="切换浅色模式" aria-pressed="true"><span data-sun>${icon("sun", 17)}</span><span data-moon hidden>${icon("moon", 17)}</span></button>`;
const motionControl = `<button class="starfield-toggle" type="button" data-sky-toggle aria-pressed="false" aria-label="暂停星场动画" aria-describedby="starfield-keys" hidden><span data-pause>${icon("pause", 14)}</span><span data-play hidden>${icon("play", 14)}</span><span class="starfield-toggle-label">暂停星场动画</span></button>`;

function shell({ name, summary = description, url, type = "public", activeModule, body, id, outline = "", math = false }) {
  const canonicalOrigin = process.env.SITE_URL || "https://ai-algorithm-academy.lvy-u.chatgpt.site";
  const pageTitle = name ? `${name} · ${title}` : `${title} · AI 算法研习`;
  return `<!doctype html>
<html lang="zh-CN" class="dark" data-route-kind="${type}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${escape(pageTitle)}</title>
  <meta name="description" content="${escape(summary)}">
  <link rel="canonical" href="${escape(canonicalOrigin + url)}">
  <link rel="icon" href="/assets/academy.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/misaya/typefaces.css">
  <link rel="stylesheet" href="/misaya/frame.css">
  <link rel="stylesheet" href="/misaya/starfield.css">
  <link rel="stylesheet" href="/misaya/cosmos.css">
  <link rel="stylesheet" href="/misaya/surfaces.css">
  ${math ? '<link rel="stylesheet" href="/katex/katex.min.css">' : ""}
  <link rel="stylesheet" href="/academy.css">
  <script src="/theme.js"></script>
  <script type="module" src="/app.js"></script>
</head>
<body data-study-order="${learningOrder.map(lesson => lesson.id).join(" ")}"${id ? ` data-lesson="${id}"` : ""}>
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="public-universe">
    <div class="starfield" aria-hidden="true"></div>
    ${type === "home" ? `<span id="starfield-keys" class="sr-only">方向键转动玫瑰，Escape 恢复姿态。</span>
    <div class="starfield-desktop-control">${motionControl}</div>` : ""}
    <div class="space-page ${type === "home" ? "observatory-home" : ""}">
      <header class="site-header">
        <div class="academy-header">
          <a href="/" class="brand-wordmark" lang="en" aria-label="Misaya Academy 首页"><img src="/assets/academy.svg" width="32" height="32" alt="">${title}</a>
          <nav aria-label="学习导航" class="academy-primary-nav">
            <details class="course-switcher nav-disclosure">
              <summary class="nav-link${activeModule ? " is-current" : ""}">${icon("library-big", 16)}课程库${icon("chevron-down", 13)}</summary>
              <div class="nav-panel">${courseLinks(activeModule, !id)}</div>
            </details>
            ${studyNav(url)}
          </nav>
          <div class="nav-tools">
            ${outline ? `<details class="nav-disclosure reader-header-outline"><summary class="nav-link">${icon("list", 16)}本课目录</summary><div class="nav-panel">${outline}</div></details>` : ""}
            <button class="search-trigger" type="button" data-search aria-label="搜索课程">${icon("search", 16)}<span>搜索课程</span><kbd data-search-key>⌘ K</kbd></button>
            ${themeControl}
            <details class="academy-menu nav-disclosure">
              <summary class="nav-icon-button" aria-label="${outline ? "课文目录与学习导航" : "学习导航"}">${icon(outline ? "list" : "menu", 19)}</summary>
              <div class="nav-panel">
                ${outline}
                <nav aria-label="移动学习导航">${studyNav(url)}${courseLinks(activeModule, !id)}</nav>
                ${type === "home" ? `<div class="starfield-menu-control">${motionControl}</div>` : ""}
              </div>
            </details>
          </div>
        </div>
      </header>
      ${body}
      <footer class="observatory-footer">
        <div class="observatory-container"><span>Misaya Academy · AI 算法研习</span><a href="https://misaya.online/">Misaya Notes</a></div>
      </footer>
    </div>
  </div>
  <dialog class="search-dialog" aria-labelledby="search-title">
    <div class="search-heading"><h2 id="search-title">搜索课程</h2><button class="nav-icon-button" type="button" data-search-close aria-label="关闭搜索">${icon("x")}</button></div>
    <label class="sr-only" for="search-term">课程名称或关键词</label>
    <input id="search-term" type="search" autocomplete="off" placeholder="例如 RoPE、KL 散度、显存" autofocus>
    <p data-search-status role="status"></p>
    <ul data-search-suggestions>${(activeModule ? liveLessons(activeModule.lessons) : modules.map(module => liveLessons(module.lessons)[0]).filter(Boolean)).filter(item => item.id !== id).slice(0, 4).map(item => `<li><a href="${item.url}">${item.id}　${escape(item.name)}<small>${escape(lessonTopics(item.id)?.problem ?? item.module.title)}</small></a></li>`).join("")}</ul>
    <ul data-search-results></ul>
  </dialog>
</body>
</html>`;
}

export const hoursLabel = number => `约 ${number} 小时`;
const priorityLabel = lesson => lesson.priority === "P0" ? "核心课" : "拓展课";
const status = lesson => `<span class="lesson-check" data-done="${lesson.id}" aria-label="已学完" hidden>${icon("check", 16)}</span>`;
const softLink = (url, label) => `<a href="${url}" class="cosmos-link">${label}</a>`;
const start = (link, label, attr = "") => `<a href="${link}" class="cosmos-cta" ${attr}>${label}</a>`;
const breadcrumb = () => `<nav class="breadcrumb" aria-label="面包屑"><a href="/#modules">课程库</a></nav>`;
const pageHeading = (heading, lead) => `<header class="academy-page-heading"><h1>${escape(heading)}</h1><p>${escape(lead)}</p></header>`;
const liveLessons = items => items.filter(lesson => lesson.url);
const studyHours = items => items.reduce((sum, item) => sum + item.hours, 0);
const lessonIds = items => items.map(item => item.id).join(" ");

function lessonList(items, { questions = false, study = false } = {}) {
  return `<ol class="lesson-list">${items.map(lesson => {
    const prompt = questions && lesson.url ? lessonTopics(lesson.id)?.problem : "";
    const detail = `<span class="row-id">${lesson.id}</span><span class="row-content"><strong>${escape(lesson.name)}</strong>${prompt ? `<small>${escape(prompt)}</small>` : ""}</span>`;
    if (!lesson.url) return `<li><div class="lesson-pending">${detail}<span class="row-meta">待补充</span></div></li>`;
    const info = study ? `<span data-lesson-status="${lesson.id}">未开始</span>` : `<span>${priorityLabel(lesson)}</span>`;
    return `<li><a href="${lesson.url}">${detail}<span class="row-meta">${info}<span>${hoursLabel(lesson.hours)}</span>${status(lesson)}</span></a></li>`;
  }).join("")}</ol>`;
}

function collection(items, { title, label, open = false, study = false }) {
  const live = liveLessons(items);
  const count = live.length ? `${live.length} 篇课文` : "待补充";
  return `<details class="study-collection" data-collection="${lessonIds(live)}"${open ? " open" : ""}>
    <summary><span class="collection-label">${escape(label)}</span><span class="collection-title">${escape(title)}</span><span class="collection-meta" data-collection-count>${count}</span>${icon("chevron-down", 16)}</summary>
    ${lessonList(items, { study })}
  </details>`;
}

export function homePage() {
  const first = learningOrder[0];
  return shell({ url: "/", type: "home", body: `<main id="main" class="study-home">
    <section class="study-hero" aria-labelledby="hero-title">
      <div class="study-hero-copy">
        <h1 id="hero-title">AI 算法研习</h1>
        <p>从推理为什么慢，到后训练怎样学会偏好。用算例、公式和代码读懂模型的设计。</p>
        <div class="study-actions">${start(first.url, "开始学习", "data-resume")}${softLink("/roadmap.html", "查看学习路线")}</div>
        <p class="hero-facts">${modules.length} 个模块 · ${available.length} 篇课文 · 建议投入 ${studyHours(available)} 小时</p>
      </div>
      <div class="rose-anchor rose-anchor--home" data-rose-anchor data-rose-follow="0.8" aria-hidden="true"></div>
    </section>
    <section class="catalog-section" id="modules" aria-labelledby="modules-title" data-rose-quiet>
      <h2 id="modules-title">课程库</h2>
      <ol class="module-directory">${modules.map(module => {
        const items = liveLessons(module.lessons);
        return `<li><a href="${module.url}"><span class="row-id">${module.id}</span><span class="directory-text"><strong>${module.title}</strong><small>${module.description}</small></span><span class="directory-count">${items.length} 篇课文</span></a></li>`;
      }).join("")}</ol>
    </section>
  </main>` });
}

export function modulePage(module) {
  const items = liveLessons(module.lessons);
  const pending = module.lessons.length - items.length;
  return shell({ name: module.title, summary: module.description, url: module.url, type: "module", activeModule: module,
    body: `<main class="academy-page" id="main">
      ${breadcrumb()}
      ${pageHeading(module.title, module.description)}
      <div class="module-study-bar"><p class="study-facts">${module.id} · ${items.length} 篇课文 · 约 ${studyHours(items)} 小时${pending ? ` · ${pending} 篇待补充` : ""}</p>
      ${items.length ? start(items[0].url, "开始本模块", `data-resume data-scope="${lessonIds(items)}"`) : ""}</div>
      ${lessonList(module.lessons, { questions: true })}
    </main>` });
}

export function roadmapPage(rendered) {
  return shell({ name: "学习路线", url: "/roadmap.html", type: "roadmap", math: true, body: `<main class="academy-page" id="main">
    ${pageHeading("学习路线", "先从推理成本切入，再看后训练的目标。每个阶段围绕一个问题，课文按建议顺序排列。")}
    <div class="study-actions">${start(learningOrder[0].url, "开始学习", "data-resume")}${softLink("/#modules", "按模块浏览")}</div>
    <section class="collection-list" aria-label="学习阶段">${stages.map((stage, i) => collection(stage.lessons, { title: stage.title, label: stage.label, open: !i })).join("")}</section>
    <details class="roadmap-original"><summary>完整路线图与术语约定</summary><div class="article-prose">${rendered.html}</div></details>
  </main>` });
}

export function progressPage() {
  const first = learningOrder[0];
  return shell({ name: "我的学习", url: "/progress.html", type: "progress", body: `<main class="academy-page" id="main">
    ${pageHeading("我的学习", "从上次读到的位置继续。完成状态、节内位置和自测记录保存在当前浏览器。")}
    <section class="progress-panel" aria-labelledby="progress-title">
      <div class="progress-numbers"><h2 id="progress-title">课程进度</h2><span><strong data-total>0</strong> / ${available.length} 篇已学完</span></div>
      <progress id="course-progress" aria-label="课程总进度" max="${available.length}" value="0"></progress>
      <div class="resume-line"><strong data-resume-title>${first.id}　${escape(first.name)}</strong>${start(first.url, "开始学习", "data-resume")}</div>
    </section>
    <section class="collection-list" aria-label="各模块学习记录">${modules.map(module => collection(liveLessons(module.lessons), { title: module.title, label: module.id, study: true })).join("")}</section>
  </main>` });
}

export function lessonPage(lesson, rendered) {
  const index = available.indexOf(lesson);
  const sequence = [available[index - 1], available[index + 1]];
  const completed = `<button type="button" class="study-button" data-complete aria-pressed="false">${icon("check", 16)}<span>标记学完</span></button>`;
  const topic = lessonTopics(lesson.id);
  const outline = `<nav class="lesson-outline" aria-label="本课目录"><h2>本课目录</h2><ol>${rendered.parts.map(part =>
    `<li><a href="#${part.id}">${escape(part.title)}</a></li>`
  ).join("")}</ol></nav>`;
  const sections = rendered.parts.map(part => {
    const heading = escape(part.title);
    if (part.groups) {
      const applications = part.groups.find(group => group.label.includes("与工程"));
      const references = part.groups.filter(group => group !== applications).map(group =>
        `<details class="practice-note" data-note="${group.id}"><summary id="${group.id}">${escape(group.label)}${icon("chevron-down", 14)}</summary><div class="article-prose">${group.html}</div></details>`).join("");
      return `<section class="lesson-section" data-part="${part.id}"><h2 id="${part.id}">${heading}</h2>
        <div id="${applications.id}" class="article-prose">${applications.html}</div>${references}</section>`;
    }
    const body = `<div class="article-prose">${part.html}</div>`;
    const symbol = { proof: "sigma", code: "code-2", practice: "notebook-tabs" }[part.kind];
    if (symbol) return `<details class="lesson-supplement" data-part="${part.id}">
      <summary id="${part.id}">${icon(symbol, 18)}<h2>${heading}</h2>${icon("chevron-down", 16)}</summary>${body}
    </details>`;
    return `<section class="lesson-section" data-part="${part.id}"><h2 id="${part.id}">${heading}</h2>${body}</section>`;
  }).join("");

  return shell({ name: lesson.title, summary: lesson.summary, url: lesson.url, id: lesson.id, type: "reader", activeModule: lesson.module, math: true, outline, body: `<main class="paper-reader-container" id="main">
    <article class="paper-reader-main">
      <header class="article-reading-header" data-part="lesson-intro" id="lesson-intro">
        <nav class="reader-breadcrumb" aria-label="面包屑"><a href="/#modules">课程库</a>${icon("chevron-right", 12)}<a href="${lesson.module.url}">${lesson.module.title}</a>${icon("chevron-right", 12)}<span>${lesson.id}</span></nav>
        <h1 class="article-page-title">${escape(lesson.title)}</h1>
        ${topic ? `<p class="lesson-lead">${escape(topic.lead)}</p>` : ""}
        <div class="lesson-meta"><span>${priorityLabel(lesson)} · ${hoursLabel(lesson.hours)}</span>
        ${rendered.intro && topic ? `<details class="intro-notes"><summary id="course-notes">课前笔记${icon("chevron-down", 13)}</summary><div class="article-prose lesson-intro">${rendered.intro}</div></details>` : ""}</div>
        ${!topic ? `<div class="article-prose lesson-intro" id="course-notes">${rendered.intro}</div>` : ""}
      </header>
      ${lessonFigure(lesson)}
      ${sections}
      <div class="lesson-end">${completed}<a class="cosmos-link" href="${lesson.module.url}">返回模块</a></div>
      <nav aria-label="前后课文" class="lesson-sequence">${sequence.map((other, i) => other
        ? `<a href="${other.url}"><span>${i ? "下一篇" : "上一篇"}</span><strong>${other.id} ${escape(other.name)}</strong></a>`
        : "<span></span>").join("")}</nav>
    </article>
    <aside class="reader-margin">${outline}</aside>
  </main>` });
}

export const allPaths = ["/", "/roadmap.html", "/progress.html", ...modules.map(module => module.url), ...lessons.filter(lesson => lesson.url).map(lesson => lesson.url)];
