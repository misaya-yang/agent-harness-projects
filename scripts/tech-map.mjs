import { lessons, lessonById, modules, roadmap, stages } from "./curriculum.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Direct prerequisites of each lesson. "~" marks a helpful but optional prerequisite.
// Keep this in step with §4 of the roadmap.
const prerequisites = {
  "0.1": [], "0.2": [], "0.3": [], "0.4": ["0.3", "0.1"], "0.5": ["0.3"], "0.6": ["0.2", "~0.1"],
  "0.7": ["0.3", "~0.4"], "0.8": ["0.5", "0.4"], "0.9": ["0.4", "~0.7"],
  "1.0": ["0.2", "~0.1"], "1.1": ["1.0"], "1.2": ["1.0", "~1.3"], "1.3": ["5.1", "~0.1"], "1.4": ["1.3"], "1.5": ["5.1"],
  "1.6": ["1.5"], "1.7": ["1.1"], "1.8": ["~0.5"],
  "2.0": ["0.3"], "2.1": ["0.5"], "2.2": ["2.3"], "2.3": ["2.0"], "2.4": ["2.2", "2.1"], "2.5": ["2.3"], "2.6": ["2.5"],
  "2.7": ["2.6"], "2.8": ["2.1", "~0.1"], "2.9": ["2.5", "2.1"],
  "3.1": ["1.0"], "3.2": ["3.1"], "3.3": ["3.2", "4.2"], "3.4": ["3.2", "4.5"],
  "4.1": ["0.4", "~0.9"], "4.2": ["0.4", "~0.9", "~4.1"], "4.3": ["4.2", "~0.7"], "4.4": ["4.3", "4.5"], "4.5": ["0.8"], "4.6": ["4.4"],
  "5.1": ["1.0"], "5.2": ["1.4"], "5.3": ["1.1"], "5.4": ["~2.5", "~0.3"], "5.5": ["5.4", "2.6", "8.3"], "5.6": ["1.5"],
  "6.1": ["5.1"], "6.2": ["6.1"], "6.3": ["0.6", "~0.1"], "6.4": ["6.3"], "6.5": ["6.2", "1.2"],
  "7.1": ["0.5"], "7.2": ["7.1", "7.4"], "7.3": ["5.1"], "7.4": ["1.3"], "7.5": ["7.1", "2.5"],
  "8.1": ["0.1", "~3.1"], "8.2": ["8.1"], "8.3": ["7.1", "~2.6"], "8.4": ["8.2", "1.6"],
  "9.1": ["1.7"], "9.2": ["2.2"], "9.3": ["5.4"],
};

// Layers read top to bottom like a technology stack. Each layer holds one or two modules.
const layers = [
  { label: "地基", modules: ["M0"] },
  { label: "模型", modules: ["M1", "M6"] },
  { label: "对齐", modules: ["M2"] },
  { label: "落地", modules: ["M7", "M8"] },
  { label: "模态", modules: ["M3", "M4"] },
  { label: "贯穿", modules: ["M5", "M9"] },
];

for (const lesson of lessons) {
  const list = prerequisites[lesson.id];
  if (!list) throw new Error(`技术地图缺少 ${lesson.id} 的前置课文`);
  for (const ref of list) if (!lessonById.has(ref.replace("~", ""))) throw new Error(`${lesson.id} 的前置课文 ${ref} 不存在`);
}
if (Object.keys(prerequisites).length !== lessons.length) throw new Error("技术地图里有路线图之外的课文");
const placed = layers.flatMap(layer => layer.modules);
if (placed.length !== modules.length || modules.some(module => !placed.includes(module.id))) {
  throw new Error("技术地图必须恰好放置每个模块一次");
}
// The dependency graph must stay acyclic, otherwise "前置" has no meaning.
const visiting = new Set(), finished = new Set();
function visit(id, path) {
  if (finished.has(id)) return;
  if (visiting.has(id)) throw new Error(`技术地图存在循环依赖：${[...path, id].join(" → ")}`);
  visiting.add(id);
  for (const ref of prerequisites[id]) visit(ref.replace("~", ""), [...path, id]);
  visiting.delete(id);
  finished.add(id);
}
for (const id of Object.keys(prerequisites)) visit(id, []);

// The roadmap's lab table (§6) has exactly three cells per row: lesson, lab, finding.
const plannedLabs = new Map(Array.from(roadmap.matchAll(/^\| (\d+\.\d+) \| ([^|\n]+) \| ([^|\n]+) \|$/gm),
  ([, id, lab, finding]) => [id, { title: lab.trim(), finding: finding.trim() }]));

const shortName = name => name.replace(/\s*\*\*\[[^\]]+\]\*\*/g, "").replace(/\s*\[[^\]]+\]/g, "");

/** Data handed to the browser. `labTitles` maps lesson IDs to the titles of their live labs. */
function mapData(labTitles) {
  const stageOf = new Map(stages.flatMap((stage, i) => stage.ids.map(id => [id, i])));
  return {
    nodes: lessons.map(lesson => ({
      id: lesson.id, name: shortName(lesson.name), module: lesson.module.id, moduleTitle: lesson.module.title,
      summary: lesson.summary, priority: lesson.priority, hours: lesson.hours, url: lesson.url,
      prerequisites: prerequisites[lesson.id].map(ref => ({ id: ref.replace("~", ""), optional: ref.startsWith("~") })),
      labs: labTitles?.[lesson.id] ?? [], plannedLab: plannedLabs.get(lesson.id) ?? null, stage: stageOf.get(lesson.id),
    })),
    stages: stages.map(stage => ({ label: stage.label, title: stage.title, ids: stage.ids })),
  };
}

function node(lesson) {
  const live = Boolean(lesson.url);
  return `<button type="button" class="map-node${live ? " is-live" : " is-planned"}${lesson.priority === "P0" ? " is-core" : ""}" data-node="${lesson.id}" aria-pressed="false" aria-label="${esc(`${lesson.id} ${shortName(lesson.name)}，${live ? "已上线" : "规划中"}，${lesson.priority === "P0" ? "核心课" : "拓展课"}`)}">
    <span class="map-node-id">${lesson.id}</span><span class="map-node-name">${esc(shortName(lesson.name))}</span><span class="map-node-order" aria-hidden="true"></span>
  </button>`;
}

export function techMapSection({ labTitles = {} } = {}) {
  const live = lessons.filter(lesson => lesson.url).length;
  const moduleById = new Map(modules.map(module => [module.id, module]));
  const body = layers.map(layer => `<div class="map-layer">
      <h3 class="map-layer-label">${esc(layer.label)}</h3>
      <div class="map-layer-modules">${layer.modules.map(id => {
        const module = moduleById.get(id);
        return `<section class="map-module" style="--span:${module.lessons.length}" aria-label="${esc(`${module.id} ${module.title}`)}">
          <a class="map-module-title" href="${module.url}"><span>${module.id}</span>${esc(module.title)}</a>
          <div class="map-nodes">${module.lessons.map(node).join("")}</div>
        </section>`;
      }).join("")}</div>
    </div>`).join("");

  return `<section class="tech-map" data-tech-map aria-labelledby="tech-map-title">
    <header class="tech-map-heading">
      <div><h2 id="tech-map-title">技术地图</h2>
      <p>${lessons.length} 篇课文按技术栈从地基到应用分层排列。点选一篇课文，查看它依赖哪些课文、又通向哪里；切到"学习路线"，看每个阶段怎样穿过这张图。</p></div>
      <dl class="tech-map-stats"><div><dt>已上线</dt><dd>${live}</dd></div><div><dt>规划中</dt><dd>${lessons.length - live}</dd></div><div><dt>总时长</dt><dd>${lessons.reduce((sum, lesson) => sum + lesson.hours, 0)}h</dd></div></dl>
    </header>
    <div class="tech-map-toolbar" role="toolbar" aria-label="技术地图视图">
      <div class="map-modes" role="radiogroup" aria-label="视图">
        <button type="button" role="radio" aria-checked="true" data-map-mode="graph">依赖关系</button>
        <button type="button" role="radio" aria-checked="false" data-map-mode="route">学习路线</button>
      </div>
      <label class="map-filter"><input type="checkbox" data-map-filter="core"><span>只看核心课</span></label>
      <div class="map-legend" aria-hidden="true"><span class="legend-live">已上线</span><span class="legend-planned">规划中</span><span class="legend-done">已学完</span></div>
    </div>
    <div class="map-stages" data-map-stages hidden role="radiogroup" aria-label="学习阶段">${stages.map((stage, i) =>
      `<button type="button" role="radio" aria-checked="${i === 1}" data-map-stage="${i}"><span>${esc(stage.label)}</span>${esc(stage.title)}</button>`).join("")}</div>
    <div class="tech-map-body">
      <div class="map-canvas" data-map-canvas>
        <svg class="map-links" data-map-links aria-hidden="true"><defs>${["prereq", "next", "route"].map(kind =>
          `<marker id="map-arrow-${kind}" class="map-arrow-${kind}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z"/></marker>`).join("")}
        </defs><g data-map-paths></g></svg>
        ${body}
      </div>
      <aside class="map-detail" data-map-detail aria-live="polite">
        <p class="map-detail-empty">点选任意一篇课文。图中会标出它的前置课文（虚线为可选前置）与后续课文，这里显示它要打通的那条核心链路。</p>
      </aside>
    </div>
    <script type="application/json" data-map-data>${JSON.stringify(mapData(labTitles)).replace(/</g, "\\u003c")}</script>
  </section>`;
}
