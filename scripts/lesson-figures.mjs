import { architectureFigure } from "./figures-architecture.mjs";
import { alignmentFigure } from "./figures-alignment.mjs";
import { systemsFigure } from "./figures-systems.mjs";
import { escapeText as esc } from "../web/labs/graphics.mjs";

// Keep the book's reported data available next to the live model, including its assumptions.
export function lessonReferenceTable(id) {
  const data = architectureFigure(id) ?? alignmentFigure(id) ?? systemsFigure(id);
  if (!data) return "";
  const columns = data.columns ?? ["条件", "数值"];
  const rows = data.type === "bars" ? data.rows.map(r => [r.label, r.display]) : data.rows;
  return `<details class="lab-data"><summary>讲义算例 · ${esc(data.title)}</summary><table>
    <thead><tr>${columns.map(col=>`<th scope="col">${esc(col)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([first,...rest])=>`<tr><th scope="row">${esc(first)}</th>${rest.map(val=>`<td>${esc(val)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table><p>${esc(data.note)}</p></details>`;
}
