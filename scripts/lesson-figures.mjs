import { architectureFigure } from "./figures-architecture.mjs";
import { alignmentFigure } from "./figures-alignment.mjs";
import { systemsFigure } from "./figures-systems.mjs";
import { escapeHtml } from "./markdown.mjs";

// Static course figures. All coordinates are computed at build time.
function plot({ title, description, caption, xmin, xmax, ymax, ymin = 0, ticks, guides = [], curves, xlabel, ylabel }) {
  const left = 58, right = 601, top = 10, bottom = 132;
  const x = v => left + (v - xmin) / (xmax - xmin) * (right - left);
  const y = v => bottom - (v - ymin) / (ymax - ymin) * (bottom - top);
  const lines = curves.map(({ fn }, i) => {
    const points = Array.from({ length: 121 }, (_, j) => {
      const v = xmin + (xmax - xmin) * j / 120;
      return `${j ? "L" : "M"}${x(v).toFixed(1)} ${y(fn(v)).toFixed(1)}`;
    });
    return `<path d="${points.join(" ")}" class="curve curve-${i}" />`;
  }).join("");
  return `<figure class="lesson-figure"><figcaption>${title}</figcaption>
    <div class="figure-key">${curves.map(({ label }, i) => `<span><i class="key-${i}"></i>${label}</span>`).join("")}</div>
    <svg viewBox="0 0 620 159" role="img" aria-label="${description}">
      ${[ymin, (ymin + ymax) / 2, ymax].map(t => `<line x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}" class="plot-grid"/><text x="${left - 7}" y="${y(t)+4}" text-anchor="end">${+t.toFixed(2)}</text>`).join("")}
      ${guides.map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${bottom}" class="plot-guide"/>`).join("")}
      ${ticks.map(v => `<text x="${x(v)}" y="${bottom + 19}" text-anchor="middle">${v}</text>`).join("")}
      ${lines}
    </svg>
    <p class="figure-note">${ylabel}随${xlabel}的变化。${caption}</p>
  </figure>`;
}

function comparisonFigure({ type, title, rows, columns, note }) {
  let body;
  if (type === "bars") {
    const max = Math.max(...rows.map(row => row.value));
    body = `<dl class="comparison-bars">${rows.map(row =>
      `<div><dt>${escapeHtml(row.label)}</dt><dd><span class="bar-track" aria-hidden="true"><i style="width:${max ? 100 * row.value / max : 0}%"></i></span><span>${escapeHtml(row.display)}</span></dd></div>`
    ).join("")}</dl>`;
  } else {
    body = `<table class="comparison-table"><thead><tr>${columns.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  return `<figure class="lesson-figure"><figcaption>${escapeHtml(title)}</figcaption>${body}<p class="figure-note">${escapeHtml(note)}</p></figure>`;
}

export function lessonFigure(lesson) {
  if (lesson.id === "2.1") {
    // Use the fitted parameters actually reported in the lesson's comparison table.
    const fit = direction => lesson.body.match(new RegExp(direction + " KL（[^）]+）\\s*([\\d.]+)\\s+([\\d.]+)\\s+[\\d.]+"));
    const forward = fit("前向"), reverse = fit("反向");
    const peaks = lesson.body.match(/两个峰在 (\d+) 和 (\d+)/);
    if (!forward || !reverse || !peaks) return "";
    const density = ([, mean, sd]) => v => Math.exp(-0.5 * ((v - Number(mean)) / sd) ** 2) / (Number(sd) * Math.sqrt(2 * Math.PI));
    return plot({ title: "同一个双峰教师，两种学生分布", description: "前向 KL 拟合出较宽的单峰，反向 KL 拟合出集中在教师左峰的窄峰。",
      caption: "两条竖虚线标出教师分布的峰。", xlabel: "样本取值", ylabel: "学生概率密度",
      xmin: 0, xmax: 40, ymin: 0, ymax: 0.3, ticks: [0, +peaks[1], 20, +peaks[2], 40], guides: [+peaks[1], +peaks[2]],
      curves: [{ label: "前向 KL", fn: density(forward) }, { label: "反向 KL", fn: density(reverse) }] });
  }
  if (lesson.id === "2.3") {
    return plot({ title: "优势符号决定在哪一侧停止奖励", description: "正优势的目标在比率 1.2 以上持平，负优势的目标在 0.8 以下持平。",
      caption: "示例取 ε = 0.2，竖虚线标出裁剪边界。", xlabel: "新旧策略概率比", ylabel: "单样本 PPO 目标",
      xmin: 0.4, xmax: 1.6, ymin: -1.6, ymax: 1.6, ticks: [0.4, 0.8, 1, 1.2, 1.6], guides: [0.8, 1.2],
      curves: [{ label: "正优势 A = 1", fn: r => Math.min(r, 1.2) }, { label: "负优势 A = −1", fn: r => -Math.max(r, 0.8) }] });
  }
  const comparison = architectureFigure(lesson.id) ?? alignmentFigure(lesson.id) ?? systemsFigure(lesson.id);
  return comparison ? comparisonFigure(comparison) : "";
}
