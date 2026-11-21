import { readFileSync } from "node:fs";
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

const navItems = [["/", "首页"], ["/#modules", "课程目录"], ["/roadmap.html", "学习路线"], ["/progress.html", "学习进度"]];
const navLinks = current => navItems.map(([url, label]) =>
  `<a class="nav-ink${url === current ? ' nav-ink-active" aria-current="page' : ""}" href="${url}">${label}</a>`
).join("");

const themeControl = `<button class="nav-icon-button nav-theme-toggle" data-theme-toggle type="button" aria-label="切换浅色模式" aria-pressed="true"><span data-sun>${icon("sun", 17)}</span><span data-moon hidden>${icon("moon", 17)}</span></button>`;
const motionControl = `<button class="starfield-toggle" type="button" data-sky-toggle aria-pressed="false" aria-label="暂停星场动画" aria-describedby="starfield-keys" hidden><span data-pause>${icon("pause", 14)}</span><span data-play hidden>${icon("play", 14)}</span><span class="starfield-toggle-label">暂停星场动画</span></button>`;

function shell({ name, summary = description, url, type = "public", current = url, body, id, math = false }) {
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
<body${id ? ` data-lesson="${id}"` : ""}>
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="public-universe">
    <div class="starfield" aria-hidden="true"></div>
    <span id="starfield-keys" class="sr-only">方向键转动玫瑰，Escape 恢复姿态。</span>
    <div class="starfield-desktop-control">${motionControl}</div>
    ${type === "home" ? "" : `<div class="rose-anchor rose-anchor--page" data-figure="${type === "reader" ? "reader" : "list"}" data-rose-anchor data-rose-follow="0.6" aria-hidden="true"></div>`}
    <div class="space-page ${type === "home" ? "observatory-home" : ""}">
      <header class="site-header liquid-nav glass-dock">
        <div class="container academy-header">
          <a href="/" class="brand-wordmark" lang="en" aria-label="Misaya Academy 首页">${title}</a>
          <nav aria-label="主导航" class="academy-nav">
            <div class="academy-primary-nav">${navLinks(current)}</div>
            <button class="nav-icon-button" type="button" data-search aria-label="搜索课程" title="搜索课程">${icon("search", 17)}</button>
            ${themeControl}
            <details class="academy-menu">
              <summary class="nav-icon-button" aria-label="打开导航">${icon("menu", 19)}</summary>
              <div class="academy-menu-panel">${navLinks(current)}<div class="starfield-menu-control">${motionControl}</div></div>
            </details>
          </nav>
        </div>
        ${id ? '<div class="reading-meter" aria-hidden="true"><span></span></div>' : ""}
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
    <ul data-search-results></ul>
  </dialog>
</body>
</html>`;
}

export const hoursLabel = number => `约 ${number} 小时`;
const priorityLabel = lesson => lesson.priority === "P0" ? "核心课" : "拓展课";
const status = lesson => `<span class="lesson-check" data-done="${lesson.id}" aria-label="已学完" hidden>${icon("check", 16)}</span>`;
const moduleProgress = module => `data-module-progress="${module.lessons.filter(lesson => lesson.url).map(lesson => lesson.id).join(" ")}"`;
const softLink = (url, label) => `<a href="${url}" class="cosmos-link">${label}</a>`;
const start = (link, label, attr = "") => `<a href="${link}" class="cosmos-cta" ${attr}>${label}</a>`;
const breadcrumb = (url, name) => `<nav class="breadcrumb" aria-label="面包屑"><a href="/#modules">课程目录</a>${url ? `<span aria-hidden="true">/</span><a href="${url}">${name}</a>` : ""}</nav>`;
const pageHeading = (heading, lead) => `<header class="academy-page-heading"><h1 class="page-title">${heading}</h1><p>${lead}</p></header>`;

function lessonList(items, { summaries = false } = {}) {
  return `<ol class="lesson-list">${items.map(lesson => {
    const detail = `<span class="row-id">${lesson.id}</span><span class="row-content"><strong>${escape(lesson.name)}</strong>${summaries ? `<small>${escape(lesson.summary)}</small>` : ""}</span>`;
    const meta = lesson.url
      ? `<span class="row-meta"><span>${priorityLabel(lesson)}</span><span>${hoursLabel(lesson.hours)}</span></span>${status(lesson)}`
      : '<span class="row-meta">待补充</span>';
    return `<li>${lesson.url ? `<a href="${lesson.url}">${detail}${meta}</a>` : `<div class="lesson-pending">${detail}${meta}</div>`}</li>`;
  }).join("")}</ol>`;
}

export function homePage() {
  const studyHours = available.reduce((total, lesson) => total + lesson.hours, 0);
  const first = learningOrder[0];
  const picks = modules.map((module, i) => `<div class="observatory-paper-choice">
    <button type="button" data-pick="${module.id}" aria-pressed="${i === 0}" aria-controls="preview-${module.id}"><span class="observatory-paper-number">${module.id}</span><span>${module.title}</span></button>
    <a class="observatory-paper-open" href="${module.url}" aria-label="查看${module.title}">${icon("arrow-up-right", 17)}</a>
  </div>`).join("");
  const panels = modules.map((module, i) => {
    const count = module.lessons.filter(lesson => lesson.url).length;
    return `<div class="observatory-paper-preview" id="preview-${module.id}" data-preview="${module.id}" ${i ? "hidden" : ""}>
      <div class="observatory-paper-meta"><span>${module.id}</span><span>${count} 篇课文</span><span ${moduleProgress(module)}></span></div>
      <h3>${module.title}</h3>
      <p class="observatory-paper-excerpt">${module.description}</p>
      <ul class="observatory-paper-outline">${module.lessons.filter(lesson => lesson.url).slice(0, 3).map(lesson => `<li><a href="${lesson.url}">${escape(lesson.name)}</a></li>`).join("")}</ul>
      ${softLink(module.url, "查看模块")}
    </div>`;
  }).join("");
  return shell({ url: "/", type: "home", body: `<main id="main">
    <section class="cosmos-hero" aria-labelledby="hero-title">
      <div class="cosmos-hero-copy">
        <p class="cosmos-kicker"><span class="cosmos-kicker-pulse" aria-hidden="true"></span>AI 算法研习</p>
        <h1 id="hero-title" class="cosmos-hero-title" lang="en"><span>Misaya</span><span class="cosmos-hero-title-glow">Academy</span></h1>
        <p class="cosmos-hero-lead">从大模型架构到训练诊断。沿着公式、代码与自测，理解每个设计为什么成立。</p>
        <div class="cosmos-hero-actions">${start(first.url, "开始学习", "data-resume")}${softLink("/roadmap.html", "查看学习路线")}</div>
      </div>
      <div class="cosmos-hero-base">
        <dl class="cosmos-hero-index"><div><dt>模块</dt><dd>${modules.length}</dd></div><div><dt>课文</dt><dd>${available.length}</dd></div><div><dt>建议投入</dt><dd>${studyHours} 小时</dd></div></dl>
        <a class="cosmos-scroll" href="#modules"><span>课程目录</span><span class="cosmos-scroll-arrow">${icon("arrow-down", 14)}</span></a>
      </div>
      <div class="rose-anchor rose-anchor--home" data-rose-anchor data-rose-follow="0.8" aria-hidden="true"></div>
    </section>
    <div class="observatory-container observatory-content">
      <section id="modules" class="observatory-featured" aria-labelledby="modules-title" data-rose-quiet>
        <div class="observatory-featured-heading"><h2 id="modules-title">课程目录</h2>${softLink("/roadmap.html", "按学习路线浏览")}</div>
        <div class="observatory-paper-picker" aria-label="选择模块">${picks}</div>
        <div class="academy-preview-grid">${panels}</div>
      </section>
    </div>
  </main>` });
}

export function modulePage(module) {
  const count = module.lessons.filter(lesson => lesson.url).length;
  const pending = module.lessons.length - count;
  return shell({ name: module.title, summary: module.description, url: module.url, current: "/#modules",
    body: `<main class="academy-page observatory-container" id="main" data-rose-quiet>
      ${breadcrumb()}
      ${pageHeading(module.title, module.description)}
      <div class="article-meta module-meta"><span>${module.id} · ${count} 篇课文${pending ? ` · ${pending} 篇待补充` : ""}</span><span ${moduleProgress(module)}></span></div>
      ${lessonList(module.lessons, { summaries: true })}
    </main>` });
}

export function roadmapPage(rendered) {
  return shell({ name: "学习路线", url: "/roadmap.html", math: true, body: `<main class="academy-page observatory-container" id="main" data-rose-quiet>
    ${pageHeading("学习路线", "先从推理成本切入，再理解后训练。随后用训练诊断、生成模型与多模态把知识串起来。")}
    <div class="roadmap-guide">${stages.map(stage => `<section class="route-stage">
      <div class="technical-label">${stage.label}</div>
      <h2>${stage.title}</h2>${lessonList(stage.lessons)}
    </section>`).join("")}</div>
    <details class="roadmap-original"><summary>查看完整路线图与术语约定</summary><div class="article-prose">${rendered.html}</div></details>
  </main>` });
}

export function progressPage() {
  return shell({ name: "学习进度", url: "/progress.html", body: `<main class="academy-page observatory-container" id="main" data-rose-quiet>
    ${pageHeading("学习进度", "课程完成状态、自测与上次阅读位置保存在当前浏览器。")}
    <section class="progress-panel" aria-labelledby="progress-title">
      <h2 id="progress-title"><span data-total>0</span> / ${available.length} 篇已学完</h2>
      <progress id="course-progress" aria-label="课程总进度" max="${available.length}" value="0"></progress>
      ${start(learningOrder[0].url, "开始学习", "data-resume")}
    </section>
    ${modules.map(module => `<section class="route-stage">
      <div class="progress-module-heading"><h2>${module.title}</h2><span class="article-meta" ${moduleProgress(module)}></span></div>
      ${lessonList(module.lessons.filter(lesson => lesson.url))}
    </section>`).join("")}
  </main>` });
}

export function lessonPage(lesson, rendered) {
  const index = available.indexOf(lesson);
  const sequence = [available[index - 1], available[index + 1]];
  const completed = `<button type="button" class="study-button" data-complete aria-pressed="false">${icon("check", 16)}<span>标记学完</span></button>`;
  const toc = `<nav aria-label="本篇目录"><ol>${rendered.outline.map(({ id, title }) => `<li><a href="#${id}">${escape(title)}</a></li>`).join("")}</ol></nav>`;
  return shell({ name: lesson.title, summary: lesson.summary, url: lesson.url, id: lesson.id, type: "reader", current: "/#modules", math: true, body: `<main class="paper-reader-container" id="main">
    ${breadcrumb(lesson.module.url, lesson.module.title)}
    <div class="paper-reader-cockpit">
      <article class="reading-surface solid-reading paper-reader-main" data-rose-quiet>
        <header class="article-reading-header">
          <div class="article-meta lesson-meta"><span>${lesson.id} · ${priorityLabel(lesson)} · ${hoursLabel(lesson.hours)}</span>${completed}</div>
          <h1 class="article-page-title">${escape(lesson.title)}</h1>
        </header>
        <details class="mobile-toc"><summary>本篇目录</summary>${toc}</details>
        <div class="article-prose">${rendered.html}</div>
        <div class="lesson-end">
          ${completed}
          <a class="cosmos-link" href="${lesson.module.url}">返回${lesson.module.title}</a>
        </div>
        <nav aria-label="前后课文" class="lesson-sequence">${sequence.map((other, i) => other ? `<a href="${other.url}"><span>${i === 0 ? "上一篇" : "下一篇"}</span><strong>${other.id} ${escape(other.name)}</strong></a>` : "<span></span>").join("")}</nav>
      </article>
      <aside class="paper-toc-rail">
        <div class="toc-surface"><h2>本篇目录</h2>${toc}<a class="cosmos-link" href="${lesson.module.url}">本模块全部课文</a></div>
      </aside>
    </div>
  </main>` });
}

export const allPaths = ["/", "/roadmap.html", "/progress.html", ...modules.map(module => module.url), ...lessons.filter(lesson => lesson.url).map(lesson => lesson.url)];
