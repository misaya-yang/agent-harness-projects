export type CourseStats = {
  completedCount: number;
  totalCount: number;
  percent: number;
};

type CourseProgress = {
  completedChapters: string[];
  updatedAt: number;
};

type ProgressState = {
  version: 1;
  courses: Record<string, CourseProgress>;
};

const STORAGE_KEY = "agent-learning-progress-v1";
const COURSE_IDS = ["codex", "grok", "deepseek", "pi"];
const TOTAL_CHAPTERS = 12;
let storageAvailable = true;
let memoryState = emptyState();

function emptyCourse(): CourseProgress {
  return { completedChapters: [], updatedAt: Date.now() };
}

function emptyState(): ProgressState {
  return {
    version: 1,
    courses: Object.fromEntries(COURSE_IDS.map((id) => [id, emptyCourse()])),
  };
}

function sanitize(value: unknown): ProgressState {
  const input = value && typeof value === "object" ? value as Partial<ProgressState> : {};
  const source = input.version === 1 && input.courses && typeof input.courses === "object" ? input.courses : {};
  const state = emptyState();
  COURSE_IDS.forEach((id) => {
    const course = (source as Record<string, Partial<CourseProgress>>)[id];
    if (!course) return;
    state.courses[id] = {
      completedChapters: Array.isArray(course.completedChapters)
        ? [...new Set(course.completedChapters.filter((chapter): chapter is string => typeof chapter === "string" && chapter.length > 0))].slice(0, TOTAL_CHAPTERS)
        : [],
      updatedAt: typeof course.updatedAt === "number" ? course.updatedAt : Date.now(),
    };
  });
  return state;
}

function readState(): ProgressState {
  if (!storageAvailable) return memoryState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryState;
    memoryState = sanitize(JSON.parse(raw));
    return memoryState;
  } catch {
    memoryState = emptyState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
    } catch {
      storageAvailable = false;
    }
    return memoryState;
  }
}

function writeState(state: ProgressState, courseId: string): void {
  memoryState = state;
  if (storageAvailable) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      storageAvailable = false;
    }
  }
  window.dispatchEvent(new CustomEvent("learning-progress-update", { detail: { courseId } }));
}

export function getCourseProgress(courseId: string): CourseStats {
  const completedCount = readState().courses[courseId]?.completedChapters.length ?? 0;
  return {
    completedCount,
    totalCount: TOTAL_CHAPTERS,
    percent: Math.round((completedCount / TOTAL_CHAPTERS) * 100),
  };
}

export function isChapterCompleted(courseId: string, chapterId: string): boolean {
  return readState().courses[courseId]?.completedChapters.includes(chapterId) ?? false;
}

export function toggleChapterCompletion(courseId: string, chapterId: string): boolean {
  if (!chapterId || chapterId === "top") return false;
  const state = readState();
  const course = state.courses[courseId] ?? emptyCourse();
  const completed = course.completedChapters.includes(chapterId);
  course.completedChapters = completed
    ? course.completedChapters.filter((id) => id !== chapterId)
    : [...course.completedChapters, chapterId].slice(0, TOTAL_CHAPTERS);
  course.updatedAt = Date.now();
  state.courses[courseId] = course;
  writeState(state, courseId);
  return !completed;
}

export function resetCourseProgress(courseId: string): void {
  const state = readState();
  state.courses[courseId] = emptyCourse();
  writeState(state, courseId);
}

export function getCurrentCourseId(): string {
  const id = document.body.dataset.agent;
  return id && COURSE_IDS.includes(id) ? id : "codex";
}

function updateProgressUI(courseId: string): void {
  const state = readState();
  const progress = state.courses[courseId] ?? emptyCourse();
  const stats = getCourseProgress(courseId);
  const completed = new Set(progress.completedChapters);

  document.querySelectorAll<HTMLAnchorElement>("#reader-map .reader-phase-list a").forEach((link) => {
    link.classList.toggle("is-completed", completed.has(link.hash.slice(1)));
  });
  document.querySelectorAll<HTMLElement>("#reader-map .reader-phase").forEach((phase) => {
    const links = Array.from(phase.querySelectorAll<HTMLAnchorElement>(".reader-phase-list a"));
    const count = links.filter((link) => completed.has(link.hash.slice(1))).length;
    const tag = phase.querySelector<HTMLElement>(".phase-completion-tag");
    if (tag) tag.textContent = `${count}/${links.length} 完成`;
    phase.classList.toggle("is-completed", links.length > 0 && count === links.length);
  });

  const mapHead = document.querySelector<HTMLElement>("#reader-map .reader-map-head");
  if (mapHead) {
    let summary = mapHead.querySelector<HTMLElement>(".reader-map-summary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "reader-map-summary";
      mapHead.append(summary);
    }
    summary.innerHTML = `
      <div class="progress-bar-label"><span>全课学习进度</span><strong>${stats.completedCount} / ${stats.totalCount} 章 · ${stats.percent}%</strong></div>
      <div class="progress-track" role="progressbar" aria-valuenow="${stats.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="课程总体学习进度"><div class="progress-fill" style="width:${stats.percent}%"></div></div>
      <button class="cbtn reset-progress-btn" type="button" data-reset-progress>重置进度</button>`;
    summary.querySelector("[data-reset-progress]")?.addEventListener("click", () => {
      if (window.confirm("确定重置当前课程的学习进度吗？")) resetCourseProgress(courseId);
    });
  }

  document.querySelectorAll<HTMLAnchorElement>(".rail a[data-spy-link], .chapter-nav a[data-spy-link]").forEach((link) => {
    link.classList.toggle("is-completed", completed.has(link.hash.slice(1)));
  });
  const rail = document.querySelector<HTMLElement>(".rail");
  if (rail) {
    let summary = rail.querySelector<HTMLElement>(".rail-progress");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "rail-progress";
      rail.append(summary);
    }
    summary.innerHTML = `<div class="rail-progress-bar"><div class="rail-progress-fill" style="width:${stats.percent}%"></div></div><span class="rail-progress-text">${stats.completedCount}/${stats.totalCount} 章 · ${stats.percent}%</span>`;
  }

  const activeId = document.querySelector<HTMLElement>(".reader-view.is-active")?.id ?? "";
  const completeButton = document.querySelector<HTMLButtonElement>("[data-reader-complete]");
  if (completeButton) {
    const done = completed.has(activeId);
    completeButton.disabled = !activeId || activeId === "top";
    completeButton.setAttribute("aria-pressed", String(done));
    completeButton.classList.toggle("primary", done);
    const text = completeButton.querySelector(".btn-text");
    if (text) text.textContent = done ? "已学完" : "完成打卡";
  }
}

let initialized = false;

export function initLearningProgress(): void {
  if (initialized) return;
  initialized = true;
  const courseId = getCurrentCourseId();
  readState();
  window.addEventListener("learning-progress-update", () => updateProgressUI(courseId));
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      memoryState = event.newValue ? sanitize(JSON.parse(event.newValue)) : emptyState();
    } catch {
      memoryState = emptyState();
    }
    window.dispatchEvent(new CustomEvent("learning-progress-update", { detail: { courseId } }));
  });
  updateProgressUI(courseId);
}
