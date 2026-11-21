// Interactive technology map on the roadmap page. The server renders every node, so the map
// stays readable without JavaScript; this script adds selection, dependency paths and routes.
const SVG = "http://www.w3.org/2000/svg";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem("misaya-academy:" + key)) ?? fallback; }
  catch { return fallback; }
}

export function setupTechMap(root) {
  const data = JSON.parse(root.querySelector("[data-map-data]").textContent);
  const canvas = root.querySelector("[data-map-canvas]");
  const svg = root.querySelector("[data-map-links]");
  const layer = root.querySelector("[data-map-paths]");
  const detail = root.querySelector("[data-map-detail]");
  const stageBar = root.querySelector("[data-map-stages]");
  const byId = new Map(data.nodes.map(node => [node.id, node]));
  const elements = new Map([...root.querySelectorAll("[data-node]")].map(el => [el.dataset.node, el]));
  const dependents = new Map(data.nodes.map(node => [node.id, []]));
  for (const node of data.nodes) for (const ref of node.prerequisites) dependents.get(ref.id).push({ id: node.id, optional: ref.optional });

  const fallback = byId.has(stored("last", "")) ? stored("last", "") : "2.3";
  const state = { mode: "graph", selected: fallback, hovered: null, stage: 1, core: false };

  function ancestors(id) {
    const found = new Set();
    const walk = current => {
      for (const ref of byId.get(current).prerequisites) {
        if (ref.optional || found.has(ref.id)) continue;
        found.add(ref.id);
        walk(ref.id);
      }
    };
    walk(id);
    return found;
  }

  // Geometry is measured in the canvas' own coordinate space.
  function box(id) {
    const origin = canvas.getBoundingClientRect();
    const rect = elements.get(id).getBoundingClientRect();
    return { left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top,
      bottom: rect.bottom - origin.top, cx: rect.left - origin.left + rect.width / 2, cy: rect.top - origin.top + rect.height / 2, h: rect.height };
  }
  function curve(fromId, toId) {
    const a = box(fromId), b = box(toId);
    if (Math.abs(a.cy - b.cy) < a.h * 0.6) {
      // Same row: bow the link above the two nodes so it does not cross their labels.
      const [l, r] = a.cx < b.cx ? [a, b] : [b, a];
      const x1 = l.right - 6, x2 = r.left + 6, lift = Math.min(34, 12 + Math.abs(x2 - x1) / 6);
      const path = `M${x1} ${l.top + 4} C${x1 + 10} ${l.top - lift}, ${x2 - 10} ${r.top - lift}, ${x2} ${r.top + 4}`;
      return a.cx < b.cx ? path : `M${x2} ${r.top + 4} C${x2 - 10} ${r.top - lift}, ${x1 + 10} ${l.top - lift}, ${x1} ${l.top + 4}`;
    }
    const down = a.cy < b.cy;
    const y1 = down ? a.bottom : a.top, y2 = down ? b.top : b.bottom;
    const bend = Math.max(28, Math.abs(y2 - y1) * 0.45) * (down ? 1 : -1);
    return `M${a.cx} ${y1} C${a.cx} ${y1 + bend}, ${b.cx} ${y2 - bend}, ${b.cx} ${y2}`;
  }
  function link(fromId, toId, kind, optional = false) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", curve(fromId, toId));
    path.setAttribute("class", `map-link map-link-${kind}${optional ? " is-optional" : ""}`);
    path.setAttribute("marker-end", `url(#map-arrow-${kind === "route" ? "route" : kind === "next" ? "next" : "prereq"})`);
    layer.append(path);
  }

  function chain(summary) {
    return summary.split(/\s*→\s*/).filter(Boolean).map(step => `<li>${esc(step)}</li>`).join("");
  }
  function refs(list, label) {
    if (!list.length) return "";
    return `<h4>${label}</h4><div class="map-refs">${list.map(({ id, optional }) =>
      `<button type="button" data-goto="${id}">${id} ${esc(byId.get(id).name)}${optional ? '<small>可选</small>' : ""}</button>`).join("")}</div>`;
  }
  function showDetail(id) {
    if (!id) {
      detail.innerHTML = `<p class="map-detail-empty">点选任意一篇课文。图中会标出它的前置课文（虚线为可选前置）与后续课文，这里显示它要打通的那条核心链路。</p>`;
      return;
    }
    const node = byId.get(id);
    const done = stored("lesson:" + id, {}).done;
    const stage = data.stages[node.stage];
    const labs = node.labs.length
      ? `<ul class="map-labs">${node.labs.map(title => `<li>${esc(title)}</li>`).join("")}</ul>`
      : node.plannedLab ? `<p class="map-lab-plan"><strong>${esc(node.plannedLab.title)}</strong><span>能亲手发现：${esc(node.plannedLab.finding)}</span></p>` : "";
    detail.innerHTML = `<button type="button" class="map-detail-close" data-map-close aria-label="收起课文详情">×</button>
      <p class="map-detail-kicker">${node.module} · ${esc(node.moduleTitle)}</p>
      <h3><span>${node.id}</span>${esc(node.name)}</h3>
      <p class="map-detail-meta"><span class="map-pill ${node.url ? "is-live" : "is-planned"}">${node.url ? "已上线" : "规划中"}</span>
        <span>${node.priority === "P0" ? "核心课" : "拓展课"} · 约 ${node.hours} 小时</span>${done ? '<span class="map-pill is-done">已学完</span>' : ""}</p>
      <h4>核心链路</h4><ol class="map-chain">${chain(node.summary)}</ol>
      ${labs ? `<h4>${node.labs.length ? "互动实验" : "规划中的互动实验"}</h4>${labs}` : ""}
      ${refs(node.prerequisites, "前置课文")}
      ${refs(dependents.get(id), "后续课文")}
      <div class="map-detail-actions">${node.url
        ? `<a class="cosmos-cta" href="${node.url}">${done ? "复习课文" : "进入课文"}</a>`
        : `<p>规划中 · 属于「${esc(stage.label)}」阶段：${esc(stage.title)}</p>`}</div>`;
  }

  function render() {
    const focus = state.hovered ?? state.selected;
    for (const [id, el] of elements) {
      el.classList.toggle("is-done", Boolean(stored("lesson:" + id, {}).done));
      el.classList.toggle("is-filtered", state.core && byId.get(id).priority !== "P0");
      el.classList.remove("is-selected", "is-prereq", "is-ancestor", "is-next", "is-dim", "in-route");
      el.setAttribute("aria-pressed", String(id === state.selected));
      el.querySelector(".map-node-order").textContent = "";
    }
    layer.replaceChildren();
    const { width, height } = canvas.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    if (state.mode === "route") {
      const ids = data.stages[state.stage].ids;
      for (const [id, el] of elements) el.classList.toggle("is-dim", !ids.includes(id));
      ids.forEach((id, i) => {
        const el = elements.get(id);
        el.classList.add("in-route");
        el.querySelector(".map-node-order").textContent = i + 1;
        if (i) link(ids[i - 1], id, "route");
      });
      if (state.selected) elements.get(state.selected).classList.add("is-selected");
      return;
    }
    if (!focus) return;
    const direct = byId.get(focus).prerequisites;
    const upstream = ancestors(focus);
    const next = dependents.get(focus);
    const lit = new Set([focus, ...upstream, ...direct.map(ref => ref.id), ...next.map(ref => ref.id)]);
    for (const [id, el] of elements) el.classList.toggle("is-dim", !lit.has(id));
    elements.get(focus).classList.add("is-selected");
    for (const id of upstream) elements.get(id).classList.add("is-ancestor");
    for (const ref of direct) elements.get(ref.id).classList.add("is-prereq");
    for (const ref of next) elements.get(ref.id).classList.add("is-next");
    // Earlier links of the prerequisite chain first, so the direct links paint on top.
    for (const id of upstream) for (const ref of byId.get(id).prerequisites) {
      if (!ref.optional && upstream.has(ref.id)) link(ref.id, id, "chain");
    }
    for (const ref of direct) link(ref.id, focus, "prereq", ref.optional);
    for (const ref of next) link(focus, ref.id, "next", ref.optional);
  }

  function select(id) {
    state.selected = state.selected === id && state.mode === "graph" ? null : id;
    showDetail(state.selected);
    render();
  }

  root.addEventListener("click", event => {
    const nodeButton = event.target.closest("[data-node]");
    const goto = event.target.closest("[data-goto]");
    const mode = event.target.closest("[data-map-mode]");
    const stage = event.target.closest("[data-map-stage]");
    if (event.target.closest("[data-map-close]")) {
      state.selected = null;
      showDetail(null);
      render();
    } else if (nodeButton) select(nodeButton.dataset.node);
    else if (goto) {
      state.selected = goto.dataset.goto;
      showDetail(state.selected);
      render();
      elements.get(state.selected).scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } else if (mode) {
      state.mode = mode.dataset.mapMode;
      for (const button of root.querySelectorAll("[data-map-mode]")) button.setAttribute("aria-checked", String(button === mode));
      stageBar.hidden = state.mode !== "route";
      root.dataset.mode = state.mode;
      render();
    } else if (stage) {
      state.stage = Number(stage.dataset.mapStage);
      for (const button of stageBar.querySelectorAll("[data-map-stage]")) button.setAttribute("aria-checked", String(button === stage));
      render();
    }
  });
  root.querySelector("[data-map-filter=core]").addEventListener("change", event => {
    state.core = event.target.checked;
    render();
  });
  // Hover previews a node's neighbourhood without moving the pinned selection.
  canvas.addEventListener("pointerover", event => {
    const el = event.target.closest("[data-node]");
    if (event.pointerType !== "mouse" || !el || state.mode !== "graph" || state.hovered === el.dataset.node) return;
    state.hovered = el.dataset.node;
    render();
  });
  canvas.addEventListener("pointerleave", () => {
    if (state.hovered === null) return;
    state.hovered = null;
    render();
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.selected && state.mode === "graph") {
      state.selected = null;
      showDetail(null);
      render();
    }
  });
  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }).observe(canvas);
  addEventListener("storage", render);
  showDetail(state.selected);
  document.fonts.ready.then(render);
  render();
}
