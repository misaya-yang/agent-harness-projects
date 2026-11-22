// DOM-free renderers provide the same drawing in static HTML, print and the interactive reader.
export const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const fmt = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
function tickLabel(value) {
  const n = Math.abs(value);
  if (n && (n < 0.001 || n >= 1e7)) return value.toExponential(0).replace("e+", "e");
  if (n >= 1000) return fmt.format(value / 1000) + "k";
  return fmt.format(value === 0 ? 0 : value);
}
const xy = n => Number(n.toFixed(2));
function ticks(lo, hi, count, log) {
  if (log) {
    const first = Math.ceil(Math.log10(lo) - 1e-10), last = Math.floor(Math.log10(hi) + 1e-10);
    const stride = Math.max(1, Math.ceil((last - first + 1) / count));
    const powers = [];
    for (let e = first; e <= last; e += stride) powers.push(10 ** e);
    return powers.length > 1 ? powers : [lo, hi];
  }
  const rough = (hi - lo) / Math.max(1, count - 1);
  const base = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find(s => s * base >= rough) ?? 10) * base;
  const values = [];
  for (let i = Math.ceil(lo / step - 1e-9); i <= Math.floor(hi / step + 1e-9); i++) values.push(i * step);
  return values.length > 1 ? values : [lo, hi];
}
function axis(domain, values, log, start, end) {
  let [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)];
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || (log && lo <= 0)) throw Error("Invalid graph domain");
  if (hi === lo) {
    if (log) { lo /= 2; hi *= 2; }
    else { const d = Math.max(0.01, Math.abs(lo) * 0.1); lo -= d; hi += d; }
  }
  const a = log ? Math.log(lo) : lo, b = log ? Math.log(hi) : hi;
  return { lo, hi, to: value => start + ((log ? Math.log(value) : value) - a) / (b - a) * (end - start) };
}
const legend = entries => `<div class="lab-key">${entries.map(([name, color]) => `<span><i style="--swatch:var(--${color})"></i>${escapeText(name)}</span>`).join("")}</div>`;
function linePlot(model, width, key, paired = false, panelIndex = 0) {
  const w = Math.max(180, Math.round(width)), h = paired ? 172 : w < 380 ? 200 : 230;
  const l = w < 330 ? 39 : 48, r = w - 14, t = 14, b = h - 25;
  const logX = model.scaleX === "log", logY = model.scaleY === "log";
  const valid = ([x,y]) => Number.isFinite(x) && Number.isFinite(y) && (!logX || x > 0) && (!logY || y > 0);
  const points = model.series.flatMap(s => s.points.filter(valid));
  const x = axis(model.domainX, points.map(p => p[0]), logX, l, r);
  const y = axis(model.domainY, points.map(p => p[1]), logY, b, t);
  const colors = model.series.map((_, i) => paired && model.series.length === 2 ?
    (i === 0 ? "lab-neutral" : panelIndex === 0 ? "lab-blue" : "lab-teal") : ["lab-blue","lab-teal","lab-amber","lab-violet","lab-neutral"][i % 5]);
  const clip = 'clip-' + key;
  const regions = (model.regions ?? []).map((region, i) => {
    const left = x.to(region.from), right = x.to(region.to);
    const color = i ? "lab-teal" : "lab-blue";
    return `<rect x="${xy(left)}" y="${t}" width="${xy(right-left)}" height="${b-t}" fill="var(--${color})" fill-opacity=".075"/>
      <text x="${xy((left+right)/2)}" y="${t+18}" text-anchor="middle" class="lab-region" style="fill:var(--${color})">${escapeText(region.label)}</text>`;
  }).join("");
  const paths = model.series.map((series, i) => {
    let pen = false;
    const d = series.points.map(p => {
      if (!valid(p)) { pen = false; return ""; }
      const command = pen ? "L" : "M"; pen = true;
      return command + xy(x.to(p[0])) + " " + xy(y.to(p[1]));
    }).join(" ");
    const singles = series.points.length === 1 && valid(series.points[0]) ? `<circle cx="${xy(x.to(series.points[0][0]))}" cy="${xy(y.to(series.points[0][1]))}" r="3" fill="var(--${colors[i]})"/>` : "";
    const shade = paired && i === 1 && series.points.length ? `<path d="${d} L${xy(x.to(series.points.at(-1)[0]))} ${b} L${xy(x.to(series.points[0][0]))} ${b} Z" fill="var(--${colors[i]})" fill-opacity=".15"/>` : "";
    return `${shade}<path d="${d}" fill="none" stroke="var(--${colors[i]})" stroke-width="${paired && i===0 ? 1.7 : 2.8}" ${paired && i===0 ? 'stroke-dasharray="4 4"' : ''} stroke-linecap="round" stroke-linejoin="round"/>${singles}`;
  }).join("");
  const marks = (model.markers ?? []).filter(mark => mark.x >= x.lo && mark.x <= x.hi);
  const point = model.point;
  const pin = point && valid([point.x,point.y]) && point.x >= x.lo && point.x <= x.hi && point.y >= y.lo && point.y <= y.hi ?
    `<g><path d="M${l} ${y.to(point.y)} H${x.to(point.x)} V${b}" class="lab-guide"/><circle cx="${x.to(point.x)}" cy="${y.to(point.y)}" r="5" class="lab-point"><title>${escapeText(point.label)}</title></circle></g>` : "";
  const xticks=ticks(x.lo,x.hi,w<300?4:6,logX), yticks=ticks(y.lo,y.hi,4,logY);
  const keyItems = [...model.series.map((s,i)=>[s.label,colors[i]]), ...marks.filter(m=>m.label).map(m=>[`${m.label} (${tickLabel(m.x)})`,"lab-neutral"])];
  if(pin && point.label) keyItems.push([point.label,"lab-amber"]);
  const ridge = model.regions?.length === 2 ? model.series[0].points[1] : null;
  return `<div class="lab-axis-name">${escapeText(model.yLabel)}${logY ? " · 对数轴" : ""}</div>
    <svg class="lab-cartesian" data-x-left="${l}" data-x-right="${r}" data-x-min="${x.lo}" data-x-max="${x.hi}" data-log-x="${logX}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeText([model.yLabel,model.xLabel,...model.series.map(s=>s.label)].join("，"))}">
      <defs><clipPath id="${clip}"><rect x="${l-1}" y="${t-3}" width="${r-l+2}" height="${b-t+6}"/></clipPath></defs>
      ${regions}
      ${yticks.map(v=>`<path d="M${l} ${xy(y.to(v))} H${r}" class="lab-grid"/><text x="${l-6}" y="${xy(y.to(v))+4}" text-anchor="end">${tickLabel(v)}</text>`).join("")}
      <path d="M${l} ${t} V${b} H${r}" class="lab-axis"/>
      ${xticks.map(v=>`<path d="M${xy(x.to(v))} ${b}v4" class="lab-axis"/><text x="${xy(x.to(v))}" y="${b+18}" text-anchor="middle">${tickLabel(v)}</text>`).join("")}
      <g clip-path="url(#${clip})">${marks.map(m=>`<path d="M${xy(x.to(m.x))} ${t} V${b}" class="lab-guide"/>`).join("")}${paths}${ridge ? `<path d="M${xy(x.to(ridge[0]))} ${xy(y.to(ridge[1]))} H${r}" stroke="var(--lab-teal)" stroke-width="3"/><circle cx="${xy(x.to(ridge[0]))}" cy="${xy(y.to(ridge[1]))}" r="3.5" fill="var(--lab-teal)"/>` : ""}${pin}</g>
    </svg><div class="lab-x-name">${escapeText(model.xLabel)}${logX ? " · 对数轴" : ""}</div>${paired ? "" : legend(keyItems)}`;
}
function matrix(panel, index) {
  const cells = panel.cells, rows = cells.length, cols = cells[0].length;
  const rowLabels = panel.rows ?? [], colLabels = panel.columns ?? [];
  const side = rowLabels.some(Boolean) ? 36 : 12, top = colLabels.some(Boolean) ? 27 : 10;
  const grid = 150, w = grid + side + 12, h = grid + top + 10;
  const cw = grid / cols, ch = grid / rows;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeText(panel.title ?? panel.label)}，${rows} 行 ${cols} 列">
   ${rowLabels.map((s,i)=>`<text x="${side-4}" y="${top+ch*(i+.5)+3}" text-anchor="end" class="lab-cell-label">${escapeText(s)}</text>`).join("")}
   ${colLabels.map((s,i)=>`<text x="${side+cw*(i+.5)}" y="${top-6}" text-anchor="middle" class="lab-cell-label">${escapeText(s)}</text>`).join("")}
   ${cells.flatMap((row,i)=>row.map((val,j)=>`<rect x="${xy(side+j*cw+0.6)}" y="${xy(top+i*ch+0.6)}" width="${xy(cw-1.2)}" height="${xy(ch-1.2)}" rx="1.4" class="lab-cell lab-cell-${val}"/>`)).join("")}
   ${Number.isInteger(panel.focusRow)?`<rect x="${side}" y="${top+panel.focusRow*ch}" width="${grid}" height="${ch}" rx="2" fill="none" stroke="var(--lab-amber)" stroke-width="2"/>`:""}
  </svg>`;
}
function vectors(panel, index, allPanels) {
  const all = allPanels.flatMap(p=>p.vectors);
  const d = Math.max(...allPanels.map(p=>p.domain || 1));
  const hasNegativeX = all.some(v=>v.x<0);
  const lowest = Math.min(0,...all.map(v=>v.y)), highest = Math.max(0,...all.map(v=>v.y));
  const originX = hasNegativeX ? 113 : 22;
  const scale = Math.min((hasNegativeX ? 96 : 180)/d, 112/Math.max(1,highest-lowest));
  const originY = Math.max(22+highest*scale, Math.min(108,132+lowest*scale));
  const color = index ? "lab-teal" : "lab-blue";
  const from = panel.vectors[0], to = panel.vectors.at(-1);
  return `<svg viewBox="0 0 226 155" role="img" aria-label="${escapeText(panel.title)}">
    <g transform="translate(${originX} ${originY})">
    <path d="M${8-originX} 0H${214-originX} M0 ${12-originY}V${139-originY}" class="lab-guide"/>
    <circle r="${xy(Math.hypot(from.x,from.y)*scale)}" class="lab-guide" fill="none"/>
    <path d="M0 0 L${xy(from.x*scale)} ${xy(-from.y*scale)} L${xy(to.x*scale)} ${xy(-to.y*scale)} Z" fill="var(--${color})" fill-opacity=".16"/>
    <path d="M${xy(from.x*scale)} ${xy(-from.y*scale)} L${xy(to.x*scale)} ${xy(-to.y*scale)}" stroke="var(--${color})" stroke-dasharray="3 3"/>
    ${panel.vectors.map((v,i)=>{
      const x=v.x*scale,y=-v.y*scale, tone=i===panel.vectors.length-1?color:"lab-neutral";
      const angle=Math.atan2(y,x)*180/Math.PI;
      return `<g><path d="M0 0 L${xy(x)} ${xy(y)}" stroke="var(--${tone})" stroke-width="2.5"/><path d="M0 0l-7 -3v6z" transform="translate(${xy(x)} ${xy(y)}) rotate(${xy(angle)})" fill="var(--${tone})"/><title>${escapeText(v.label)}</title></g>`;
    }).join("")}
    <circle r="2.2" fill="var(--observatory-ink)"/>
    </g></svg>${legend(panel.vectors.map((v,i)=>[v.label,i===panel.vectors.length-1?color:"lab-neutral"]))}
    <div class="lab-panel-detail">输出长度 ${fmt.format(Math.hypot(to.x,to.y))}</div>`;
}
function compare(model, width, key) {
  const split = width >= 480 || model.panels.every(p=>p.shape==="vectors" || p.shape==="matrix");
  const panelWidth = split ? Math.max(130,(width-24)/2) : width;
  const sharedKey = model.panels.every(p=>p.shape === "distribution" && p.series?.length === 2)
    ? legend([[model.panels[0].series[0].label, "lab-neutral"], ...model.panels.map((p,i)=>[p.title+" · "+p.series[1].label,i?"lab-teal":"lab-blue"])])
    : "";
  return `<div class="lab-panels ${split ? "lab-side-by-side" : ""}">${model.panels.map((p,i)=>{
    let svg;
    // A lab may draw its own figure (for example the Newton–Schulz ellipses in 6.3).
    if (p.shape === "svg") svg=p.svg;
    else if (p.shape === "vectors") svg=vectors(p,i,model.panels);
    else if (p.shape === "matrix" || p.cells) svg=matrix(p,i);
    else svg=linePlot(p,panelWidth,key+"-"+i,true,i);
    return `<div class="lab-panel"><strong class="lab-panel-title">${escapeText(p.title ?? p.label)}</strong>${svg}${p.headline ? `<strong class="lab-panel-result">${escapeText(p.headline)}</strong>` : ""}${p.detail ? `<div class="lab-panel-detail">${escapeText(p.detail)}</div>` : ""}</div>`;
  }).join("")}</div>${sharedKey}${model.legend ? legend(model.legend.map(item=>[item.label,["lab-empty","lab-blue","lab-teal"][item.value] ?? "lab-neutral"])) : ""}`;
}
function bars(model) {
  const values=model.rows.map(r=>Number(r.value));
  const ref = model.reference;
  const max = Math.max(0, model.maxValue ?? 0, ref?.value ?? 0, ...values);
  const min = Math.min(0, ref?.value ?? 0, model.minValue ?? 0, ...values);
  const span = max - min || 1;
  const zero = -min/span * 1000;
  const guide = ref ? (ref.value-min)/span*1000 : null;
  const base = `<line x1="${zero}" x2="${zero}" y1="0" y2="20" class="lab-axis"/>`;
  return `<div class="lab-axis-name">${escapeText(model.unit)} · 刻度 ${tickLabel(min)}–${tickLabel(max || (min ? 0 : 1))}</div>
    <div class="lab-bars" role="list">${model.rows.map(({label,value,display},i)=>{
      const end=(value-min)/span*1000;
      return `<div class="lab-bar-row" role="listitem"><span>${escapeText(label)}</span><svg viewBox="0 0 1000 20" preserveAspectRatio="none" class="lab-bar-track" aria-hidden="true">
        <rect x="0" y="6" width="1000" height="8" fill="var(--lab-grid)"/>
        <rect x="${xy(Math.min(zero,end))}" y="4" width="${xy(Math.abs(end-zero))}" height="12" fill="var(--${i%2?"lab-teal":"lab-blue"})"/>
        ${base}${guide == null ? "" : `<line x1="${guide}" x2="${guide}" y1="0" y2="20" stroke="var(--lab-amber)" vector-effect="non-scaling-stroke" stroke-width="2"/>`}</svg><strong>${escapeText(display ?? (fmt.format(value)+" "+(model.unit??"")))}</strong></div>`;
    }).join("")}</div>${ref ? legend([[`${ref.label} · ${tickLabel(ref.value)} ${model.unit ?? ""}`,"lab-amber"]]) : ""}`;
}
export function needsPlotWidth(model) {
  return model.type === "lines" || (model.type === "panels" &&
    !model.panels.every(panel => panel.shape === "vectors" || panel.shape === "matrix"));
}

export function drawModel(model, width = 620, key = "model") {
  // A lab may draw its whole figure itself (custom SVG built from the same evaluate() call).
  if (model.type === "svg") return model.svg;
  if (model.type==="lines") return linePlot(model,width,key);
  if (model.type==="panels") return compare(model,width,key);
  if (model.type==="bars") return bars(model);
  if (model.type === "diagram" && model.shape === "token-track") {
    const roles = { action: "模型动作", environment: "环境观测", harness: "框架插入" };
    return `<div class="lab-token-track">${model.nodes.map(node => {
      const tokens = node.tokens;
      const cell = Math.min(46, 112 / tokens.length), start = (136 - cell * tokens.length) / 2;
      const blocks = tokens.map((token,i)=>`<rect x="${start+i*cell+2}" y="5" rx="5" width="${cell-4}" height="28" class="token-block"/>
        <text x="${start+(i+.5)*cell}" y="23" text-anchor="middle">${escapeText(token)}</text>`).join("");
      return `<div class="token-step" data-role="${escapeText(node.role)}" data-scored="${Boolean(node.active)}">
        <small>${escapeText(roles[node.role])}</small><strong>${escapeText(node.label)}</strong>
        <svg viewBox="0 0 136 49" aria-label="${escapeText(tokens.join("，"))}，mask = ${Number(node.active)}" role="img">
        <path d="M2 19H134" stroke="var(--lab-line)" stroke-dasharray="3 3"/>${blocks}
        <path d="M${start+3} 36v5h${cell*tokens.length-6}v-5" class="token-bracket"/></svg>
        <span class="token-mask">mask = ${node.active ? "1" : "0"}</span><p>${escapeText(node.detail)}</p></div>`;
    }).join("")}</div>`;
  }
  if (model.type==="diagram") return `<div class="lab-flow">${model.nodes.map((node,i)=>`<div class="lab-node ${node.active ? "is-active" : ""}"><span class="node-track" aria-hidden="true"><i></i></span><strong>${escapeText(node.label)}</strong><span>${escapeText(node.detail)}</span></div>`).join("")}</div>`;
  throw Error("Unknown lab plot: " + model.type);
}
