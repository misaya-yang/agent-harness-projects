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

const menu = select(".academy-menu");
document.addEventListener("click", event => {
  if (menu.open && (!menu.contains(event.target) || event.target.closest("a"))) menu.open = false;
});
menu.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});

const motion = matchMedia("(prefers-reduced-motion: reduce)");
const sky = select(".starfield");
const skyButtons = selectAll("[data-sky-toggle]");
let scene;
let paused = get("sky-paused", false);
function updateSkyControl() {
  for (const control of skyButtons) {
    control.hidden = !scene || motion.matches;
    control.setAttribute("aria-pressed", String(paused));
    const label = paused ? "继续星场动画" : "暂停星场动画";
    control.setAttribute("aria-label", label);
    control.querySelector(".starfield-toggle-label").textContent = label;
    control.querySelector("[data-pause]").hidden = paused;
    control.querySelector("[data-play]").hidden = !paused;
  }
}
async function setupSky() {
  scene?.dispose();
  scene = undefined;
  try {
    const { createStarfield } = await import("./sky.js");
    if (scene) return;
    scene = createStarfield(sky, {
      light: !root.classList.contains("dark"),
      reducedMotion: motion.matches,
      page: location.pathname,
    });
    scene.setPaused(paused);
    delete sky.dataset.fallback;
  } catch {
    sky.dataset.fallback = "true";
  }
  updateSkyControl();
}
if ("requestIdleCallback" in window) requestIdleCallback(setupSky, { timeout: 1000 });
else setTimeout(setupSky, 80);
motion.addEventListener("change", setupSky);
document.addEventListener("academy:theme", () => scene?.setTheme(!root.classList.contains("dark")));
sky.addEventListener("webglcontextlost", () => {
  sky.dataset.fallback = "true";
  for (const button of skyButtons) button.hidden = true;
}, true);
sky.addEventListener("webglcontextrestored", () => {
  delete sky.dataset.fallback;
  updateSkyControl();
}, true);
for (const control of skyButtons) {
  control.addEventListener("click", () => {
    paused = !paused;
    scene?.setPaused(paused);
    set("sky-paused", paused);
    updateSkyControl();
  });
  control.addEventListener("keydown", event => scene?.handleKey(event));
}

const picks = selectAll("[data-pick]");
const previews = selectAll("[data-preview]");
for (const button of picks) {
  button.addEventListener("click", () => {
    for (const pick of picks) pick.setAttribute("aria-pressed", String(pick === button));
    for (const preview of previews) preview.hidden = preview.dataset.preview !== button.dataset.pick;
    if (matchMedia("(max-width: 768px)").matches) {
      select(".academy-preview-grid").scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "nearest" });
    }
  });
}

const lessonId = document.body.dataset.lesson;
const completeButtons = selectAll("[data-complete]");
const questions = selectAll("[data-question]");
const resumeLinks = selectAll("[data-resume]");
const total = select("[data-total]");
const meter = select(".reading-meter span");
const tocLinks = selectAll('nav[aria-label="本篇目录"] a');
const headings = [...new Set(tocLinks.map(link => link.hash))]
  .map(hash => document.getElementById(hash.slice(1))).filter(Boolean);
const lessonRecord = id => get("lesson:" + id, {});
const lastLesson = get("last", "");
const validId = id => /^\d+\.\d+$/.test(id);
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
  for (const label of selectAll("[data-module-progress]")) {
    const moduleIds = label.dataset.moduleProgress.split(" ").filter(Boolean);
    const done = moduleIds.filter(id => lessonRecord(id).done).length;
    label.textContent = done ? `已学完 ${done} / ${moduleIds.length}` : "";
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
for (const link of resumeLinks) {
  if (!validId(lastLesson)) continue;
  link.href = "/lessons/" + lastLesson.replace(".", "-") + ".html?resume=1";
  link.textContent = "继续学习";
}
updateProgress();
window.addEventListener("storage", updateProgress);
window.addEventListener("pageshow", updateProgress);

if (meter) {
  let tracking = false;
  let timer;
  let scrolled = false;
  const readingLine = 118;
  const sectionStarts = () => [0, ...headings.map(heading => Math.max(0, heading.getBoundingClientRect().top + scrollY - readingLine))];
  const savePosition = () => {
    if (!scrolled) return;
    const starts = sectionStarts();
    const index = starts.findLastIndex(start => start <= scrollY);
    const end = starts[index + 1] ?? document.documentElement.scrollHeight;
    const fraction = (scrollY - starts[index]) / Math.max(1, end - starts[index]);
    writeLesson({ scroll: Math.round(scrollY), position: { section: headings[index - 1]?.id ?? "", fraction } });
  };
  function readPosition() {
    tracking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    meter.style.width = Math.min(100, 100 * scrollY / Math.max(1, max)) + "%";
    const current = headings.findLast(heading => heading.getBoundingClientRect().top <= readingLine) ?? headings[0];
    for (const link of tocLinks) {
      if (link.hash === "#" + current?.id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  const restore = () => {
    const wantsResume = new URLSearchParams(location.search).has("resume");
    if (wantsResume && !location.hash) {
      if (record.position && Number.isFinite(record.position.fraction)) {
        const index = record.position.section
          ? headings.findIndex(heading => heading.id === record.position.section) + 1
          : 0;
        const starts = sectionStarts();
        const end = starts[index + 1] ?? document.documentElement.scrollHeight;
        scrollTo(0, starts[index] + record.position.fraction * (end - starts[index]));
      } else if (Number.isFinite(record.scroll)) {
        scrollTo(0, record.scroll);
      }
    }
    readPosition();
    addEventListener("scroll", () => {
      if (!tracking) {
        tracking = true;
        requestAnimationFrame(readPosition);
      }
      scrolled = true;
      clearTimeout(timer);
      timer = setTimeout(savePosition, 180);
    }, { passive: true });
  };
  if (document.readyState === "complete") restore();
  else addEventListener("load", restore, { once: true });
  addEventListener("pagehide", savePosition);
}

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
const searchStatus = select("[data-search-status]");
let searchIndex;
function openSearch() {
  if (dialog.open) return;
  dialog.showModal();
  root.setAttribute("data-sky-covered", "");
  searchInput.focus();
  searchInput.select();
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
  if (event.key === "ArrowDown") searchResults.querySelector("a")?.focus();
  if (event.key === "Enter") searchResults.querySelector("a")?.click();
});

const normalize = text => text.normalize("NFKC").toLowerCase();
async function renderSearch() {
  const index = await searchIndex;
  if (!index) {
    searchStatus.textContent = "课程索引暂时无法加载。请重新打开搜索。";
    return;
  }
  const query = normalize(searchInput.value).trim();
  searchResults.replaceChildren();
  if (!query) {
    searchStatus.textContent = "输入标题、技术名词或课文编号。";
    return;
  }
  const words = query.split(/\s+/);
  const matches = index.map(lesson => {
    const name = normalize(`${lesson.id} ${lesson.title} ${lesson.module}`);
    const body = normalize(lesson.body);
    const score = words.reduce((sum, word) => sum + (name.includes(word) ? 4 : body.includes(word) ? 1 : -100), 0);
    return { lesson, score, offset: body.indexOf(words[0]) };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score);
  searchStatus.textContent = matches.length ? `找到 ${matches.length} 篇课文` : "没有找到匹配的课文。";
  for (const { lesson, offset } of matches.slice(0, 14)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = lesson.url;
    link.textContent = `${lesson.id} ${lesson.title}`;
    const context = document.createElement("small");
    const from = Math.max(0, offset - 22);
    context.textContent = lesson.module + (offset >= 0 ? " · " + (from ? "…" : "") + lesson.body.slice(from, from + 82) : "");
    link.append(context);
    item.append(link);
    searchResults.append(item);
  }
}
