// Static SVG figures referenced from lessons with an ```academy-figure fence. They replace diagrams that used to be
// drawn with box-drawing characters. Colours come from CSS variables, so both themes share one drawing.
import { escapeText as esc } from "../web/labs/graphics.mjs";

const text = (x, y, value, cls = "figure-text", anchor = "start") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(value)}</text>`;

const figures = {
  // 6.3 §1: the singular-value spectrum of a momentum matrix, log scale (illustrative).
  "6.3-spectrum": () => {
    const x0 = 64, span = 480;
    const at = v => x0 + (Math.log10(v) + 3) / 3 * span;
    const bars = [["σ₁", 1, 0.95], ["σ₂", 0.62, 0.8], ["σ₃", 0.38, 0.65], ["σ₄", 0.09, 0.5]];
    const rows = bars.map(([label, v, opacity], i) => {
      const y = 22 + i * 32;
      return `${text(x0 - 14, y + 13, label, "figure-mono", "end")}<rect x="${x0}" y="${y}" width="${(at(v) - x0).toFixed(1)}" height="16" rx="8" fill="var(--c-amber)" fill-opacity="${opacity}"/>`;
    }).join("");
    const tail = [0, 1, 2].map(i => `<rect x="${x0}" y="${152 + i * 11}" width="${(at(0.004) - x0 - i * 4).toFixed(1)}" height="7" rx="3.5" fill="var(--c-blue)" fill-opacity="${0.5 - i * 0.08}"/>`).join("");
    const ticks = [[0.001, "10⁻³"], [0.01, "10⁻²"], [0.1, "10⁻¹"], [1, "1"]].map(([v, label]) =>
      `<path d="M${at(v).toFixed(1)} 12 V196" class="${v === 0.001 ? "figure-axis" : "figure-grid"}"/>${text(at(v).toFixed(1), 214, label, "figure-mono", "middle")}`).join("");
    const svg = `<svg viewBox="0 0 680 222" role="img" aria-label="动量矩阵奇异值的对数刻度条形图：前三个奇异值接近 1，其余几百个约为千分之四">
      ${ticks}${rows}${text(x0 - 14, 170, "σ₅…", "figure-mono", "end")}${tail}
      ${text(at(1) + 10, 34, "少数大方向", "figure-text ink")}${text(at(1) + 10, 52, "拿走几乎全部步长", "figure-text")}
      ${text(at(0.004) + 14, 170, "几百个“稀有方向”：方向本身有用，步长却小到可以忽略", "figure-text body")}
    </svg>`;
    return { svg, caption: "动量矩阵 M 的奇异值谱（示意，对数刻度）。SGD 在每个奇异方向上的步长正比于 σᵢ。" };
  },
};

export function renderFigure(id) {
  const make = figures[id];
  if (!make) throw Error(`Unknown figure ${id}`);
  const { svg, caption } = make();
  return `<figure class="academy-figure">${svg}<figcaption><b>图</b>${esc(caption)}</figcaption></figure>\n`;
}
export const figureIds = Object.keys(figures);
