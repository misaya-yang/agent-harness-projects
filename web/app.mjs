import { setupLessonReader } from "./lesson-reader.mjs";
import { setupTechMap } from "./tech-map.mjs";

const root = document.documentElement;
const prefix = "misaya-academy:";
const select = selector => document.querySelector(selector);
const selectAll = selector => [...document.querySelectorAll(selector)];
function get(key, fallback) {
  try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; }
  catch { return fallback; }
}
function set(key, value) {
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); }
  catch { /* The current page remains usable if storage is unavailable. */ }
}

const themeButton = select("[data-theme-toggle]");
function updateThemeControl() {
  const dark = root.classList.contains("dark");
  themeButton.setAttribute("aria-pressed", String(dark));
  themeButton.setAttribute("aria-label", dark ? "切换浅色模式" : "切换深色模式");
  themeButton.title = themeButton.getAttribute("aria-label");
  select("[data-sun]").hidden = !dark;
  select("[data-moon]").hidden = dark;
}
updateThemeControl();

themeButton.addEventListener("click", () => {
  root.classList.toggle("dark");
  try {
    localStorage.setItem(prefix + "theme", root.classList.contains("dark") ? "dark" : "light");
  } catch { /* A blocked preference still takes effect for this page. */ }
  updateThemeControl();
  document.dispatchEvent(new Event("academy:theme"));
});

const disclosures = selectAll(".nav-disclosure");
function closeMenus(except) {
  for (const menu of disclosures) if (menu !== except) menu.open = false;
}
document.addEventListener("click", event => {
  closeMenus(event.target.closest("a") ? null : event.target.closest(".nav-disclosure"));
});
document.addEventListener("focusin", event => closeMenus(event.target.closest(".nav-disclosure")));
document.addEventListener("keydown", event => {
  const open = disclosures.find(menu => menu.open);
  if (event.key === "Escape" && open) {
    open.open = false;
    open.querySelector("summary").focus();
  }
});
if (!/Mac|iPhone|iPad/.test(navigator.platform)) select("[data-search-key]").textContent = "Ctrl K";

const motion = matchMedia("(prefers-reduced-motion: reduce)");
if (root.dataset.routeKind === "home") {
  const sky = select(".starfield");
  const skyButtons = selectAll("[data-sky-toggle]");
  let scene;
  const saveData = navigator.connection?.saveData;
  let failed = false;
  let contextLost = false;
  let paused = get("sky-paused", false);
  const rose = select("[data-rose-anchor]");
  let roseVisible = true;
  new IntersectionObserver(([entry]) => {
    roseVisible = entry.isIntersecting;
    sky.toggleAttribute("data-hero-away", !roseVisible);
    scene?.setPaused(paused || !roseVisible);
  }).observe(rose);
  function updateSkyControl() {
    root.toggleAttribute("data-static-rose", motion.matches || saveData || failed || contextLost || (!scene && paused));
    for (const control of skyButtons) {
      control.hidden = motion.matches || saveData || failed || contextLost || (!scene && !paused);
      control.setAttribute("aria-pressed", String(paused));
      const label = paused ? "继续星场动画" : "暂停星场动画";
      control.setAttribute("aria-label", label);
      control.querySelector(".starfield-toggle-label").textContent = label;
      control.querySelector("[data-pause]").hidden = paused;
      control.querySelector("[data-play]").hidden = !paused;
    }
  }
  async function setupSky() {
    if (motion.matches || saveData || (!scene && paused)) {
      scene?.dispose();
      scene = undefined;
      updateSkyControl();
      return;
    }
    try {
      const { createStarfield } = await import("./sky.js");
      if (motion.matches || paused || scene) return;
      scene = createStarfield(sky, { light: !root.classList.contains("dark"), reducedMotion: false, page: location.pathname });
      scene.setPaused(paused || !roseVisible);
      failed = false;
      contextLost = false;
      delete sky.dataset.fallback;
    } catch {
      failed = true;
    }
    updateSkyControl();
  }
  updateSkyControl();
  if ("requestIdleCallback" in window) requestIdleCallback(setupSky, { timeout: 1000 });
  else setTimeout(setupSky, 80);
  motion.addEventListener("change", setupSky);
  document.addEventListener("academy:theme", () => scene?.setTheme(!root.classList.contains("dark")));
  sky.addEventListener("webglcontextlost", () => {
    contextLost = true;
    sky.dataset.fallback = "true";
    updateSkyControl();
  }, true);
  sky.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    delete sky.dataset.fallback;
    updateSkyControl();
  }, true);
  for (const control of skyButtons) {
    control.addEventListener("click", () => {
      paused = !paused;
      if (scene) scene.setPaused(paused || !roseVisible);
      else if (!paused) setupSky();
      set("sky-paused", paused);
      updateSkyControl();
    });
    control.addEventListener("keydown", event => scene?.handleKey(event));
  }
}

const lessonId = document.body.dataset.lesson;
const completeButtons = selectAll("[data-complete]");
const questions = selectAll("[data-question]");
const resumeLinks = selectAll("[data-resume]");
const total = select("[data-total]");
const lessonRecord = id => get("lesson:" + id, {});
const collections = selectAll("[data-collection]");
const studyOrder = document.body.dataset.studyOrder.split(" ");
const record = lessonId ? lessonRecord(lessonId) : {};
if (lessonId) set("last", lessonId);

function updateProgress() {
  const completed = lessonId && Boolean(lessonRecord(lessonId).done);
  for (const button of completeButtons) {
    button.setAttribute("aria-pressed", String(completed));
    button.querySelector("span").textContent = completed ? "已学完" : "标记学完";
  }
  const markers = selectAll("[data-done]");
  const ids = new Set(markers.map(marker => marker.dataset.done));
  let count = 0;
  for (const id of ids) if (lessonRecord(id).done) count++;
  for (const marker of markers) marker.hidden = !lessonRecord(marker.dataset.done).done;
  const progress = select("#course-progress");
  if (total && progress) {
    total.textContent = count;
    progress.value = count;
  }
  const last = get("last", "");
  for (const group of collections) {
    const ids = group.dataset.collection.split(" ").filter(Boolean);
    if (!ids.length) continue;
    const done = ids.filter(id => lessonRecord(id).done).length;
    if (total || done) group.querySelector("[data-collection-count]").textContent = `${done} / ${ids.length} 已学完`;
    else group.querySelector("[data-collection-count]").textContent = `${ids.length} 篇课文`;
  }
  for (const label of selectAll("[data-lesson-status]")) {
    const id = label.dataset.lessonStatus;
    const lesson = lessonRecord(id);
    const checked = Object.values(lesson.quiz ?? {}).filter(Boolean).length;
    const started = id === last || lesson.position || lesson.scroll || checked;
    label.textContent = (lesson.done ? "已学完" : started ? "在读" : "未开始") + (checked ? ` · 已自测 ${checked} 题` : "");
    const link = label.closest("a");
    link.search = started && !lesson.done ? "?resume=1" : "";
  }
}

function writeLesson(fields) {
  Object.assign(record, lessonRecord(lessonId), fields);
  set("lesson:" + lessonId, record);
}

for (const button of completeButtons) button.addEventListener("click", () => {
  writeLesson({ done: !lessonRecord(lessonId).done });
  updateProgress();
});
for (const field of questions) {
  field.checked = Boolean(record.quiz?.[field.dataset.question]);
  field.addEventListener("change", () => {
    writeLesson({ quiz: { ...lessonRecord(lessonId).quiz, [field.dataset.question]: field.checked } });
  });
}
function updateResumeLinks() {
  if (!resumeLinks.length) return;
  const last = get("last", "");
  for (const link of resumeLinks) {
    const order = link.dataset.scope ? link.dataset.scope.split(" ") : studyOrder;
    const index = order.indexOf(last);
    let target = index < 0 ? order[0] : last;
    let label = index < 0 ? (link.dataset.scope ? "开始本模块" : "开始学习") : "继续学习";
    if (lessonRecord(target).done) {
      const after = order.indexOf(target) + 1;
      const remaining = [...order.slice(after), ...order.slice(0, after)].find(id => !lessonRecord(id).done);
      if (remaining) { target = remaining; label = "学习下一课"; }
      else label = "复习课文";
    }
    const saved = lessonRecord(target);
    const resume = Boolean(target === last || saved.position || saved.scroll);
    link.href = "/lessons/" + target.replace(".", "-") + ".html" + (resume ? "?resume=1" : "");
    (link.querySelector("span") ?? link).textContent = label;
    link.title = label + " · " + target;
    const title = link.closest(".resume-line")?.querySelector("[data-resume-title]");
    if (title) {
      const row = select(`[data-lesson-status="${target}"]`)?.closest("a");
      title.textContent = target + "　" + (row?.querySelector(".row-content strong").textContent ?? "");
    }
  }
}
function refreshStudy() {
  updateProgress();
  updateResumeLinks();
}
refreshStudy();
if (collections.length) {
  const last = get("last", "");
  const nextId = !total ? studyOrder.find(id => !lessonRecord(id).done) : last;
  const group = collections.find(item => item.dataset.collection.split(" ").includes(nextId));
  if (group) for (const item of collections) item.open = item === group;
}
window.addEventListener("storage", refreshStudy);
window.addEventListener("pageshow", refreshStudy);

if (lessonId) setupLessonReader(record, writeLesson);
const techMap = select("[data-tech-map]");
if (techMap) setupTechMap(techMap);

for (const button of selectAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const code = button.closest(".markdown-code-block").querySelector("code");
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "已复制";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "已选中代码";
    }
    clearTimeout(button.resetText);
    button.resetText = setTimeout(() => { button.textContent = "复制代码"; }, 1500);
  });
}

const dialog = select(".search-dialog");
const searchInput = select("#search-term");
const searchResults = select("[data-search-results]");
const suggestions = select("[data-search-suggestions]");
const searchStatus = select("[data-search-status]");
let searchIndex;
function openSearch() {
  if (dialog.open) return;
  dialog.showModal();
  root.setAttribute("data-sky-covered", "");
  searchInput.focus();
  searchInput.select();
  renderSearch();
}
select("[data-search]").addEventListener("click", openSearch);
select("[data-search-close]").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => root.removeAttribute("data-sky-covered"));
dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
});
document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
});
searchInput.addEventListener("input", renderSearch);
searchInput.addEventListener("keydown", event => {
  const first = (suggestions.hidden ? searchResults : suggestions).querySelector("a");
  if (event.key === "ArrowDown" && first) { event.preventDefault(); first.focus(); }
  if (event.key === "Enter") first?.click();
});

const normalize = text => text.normalize("NFKC").toLowerCase();
async function renderSearch() {
  const query = normalize(searchInput.value).trim();
  suggestions.hidden = Boolean(query);
  searchResults.replaceChildren();
  if (!query) {
    searchStatus.textContent = document.body.dataset.lesson ? "本模块其他课文" : "课程推荐";
    return;
  }
  if (!searchIndex) {
    searchStatus.textContent = "正在加载课程索引…";
    searchIndex = fetch("/search-index.json").then(response => {
      if (!response.ok) throw new Error("Search index unavailable");
      return response.json();
    }).catch(() => {
      searchIndex = undefined;
      return null;
    });
  }
  const index = await searchIndex;
  if (query !== normalize(searchInput.value).trim()) return;
  if (!index) {
    searchStatus.textContent = "课程索引暂时无法加载。请重新打开搜索。";
    return;
  }
  const words = query.split(/\s+/);
  const matches = index.map(lesson => {
    const name = normalize(`${lesson.id} ${lesson.title} ${lesson.module}`);
    const body = normalize(lesson.body);
    const score = words.reduce((sum, word) => sum + (name.includes(word) ? 4 : body.includes(word) ? 1 : -100), 0);
    let section, offset = body.indexOf(words[0]);
    if (!words.every(word => name.includes(word)) && lesson.sections?.length) {
      let best = 0;
      for (const [i, part] of lesson.sections.entries()) {
        const passage = normalize(lesson.body.slice(part.start, lesson.sections[i + 1]?.start));
        const weight = words.reduce((n, word) => n + (normalize(part.title).includes(word) ? 3 : Number(passage.includes(word))), 0);
        if (weight > best) {
          best = weight;
          section = part;
          const match = words.find(word => passage.includes(word));
          offset = part.start + (match ? passage.indexOf(match) : 0);
        }
      }
    }
    return { lesson, score, section, offset };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score);
  searchStatus.textContent = matches.length ? `找到 ${matches.length} 篇课文` : "没有找到匹配的课文。";
  for (const { lesson, section, offset } of matches.slice(0, 14)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = lesson.url + (section ? "#" + section.id : "");
    link.textContent = `${lesson.id} ${lesson.title}`;
    const context = document.createElement("small");
    const from = Math.max(section?.start ?? 0, offset - 22);
    context.textContent = (section?.title ?? lesson.module) + (offset >= 0 ? " · " + (from ? "…" : "") + lesson.body.slice(from, from + 82) : "");
    link.append(context);
    item.append(link);
    searchResults.append(item);
  }
}
