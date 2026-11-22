import * as careerHardware from "../web/labs/career-hardware.mjs";
import * as trainingData from "../web/labs/training-data.mjs";
import * as searchRag from "../web/labs/search-rag.mjs";
import * as visualGeneration from "../web/labs/visual-generation.mjs";
import * as scheduleContext from "../web/labs/schedule-context.mjs";
import * as audioInference from "../web/labs/audio-inference.mjs";
import * as agentMemory from "../web/labs/agent-memory.mjs";
import * as trustEvaluation from "../web/labs/trust-evaluation.mjs";
import * as architecture from "../web/labs/architecture.mjs";
import * as alignment from "../web/labs/alignment.mjs";
import * as systems from "../web/labs/systems.mjs";
import * as pretraining from "../web/labs/pretraining.mjs";
import * as foundations from "../web/labs/foundations.mjs";
import { drawModel, needsPlotWidth, escapeText as esc } from "../web/labs/graphics.mjs";
import { lessonReferenceTable } from "./lesson-figures.mjs";

export const labGroups = {
  foundations, architecture, alignment, systems, pretraining,
  "career-hardware": careerHardware,
  "training-data": trainingData,
  "search-rag": searchRag,
  "visual-generation": visualGeneration,
  "schedule-context": scheduleContext,
  "audio-inference": audioInference,
  "agent-memory": agentMemory,
  "trust-evaluation": trustEvaluation,
};
export const labDefinitions = Object.assign({}, ...Object.values(labGroups));
export const labAnchor = id => "lab-" + id.replaceAll(".", "-");

function controlField(control, prefix) {
  const id = prefix + "-" + control.key;
  if (control.options) {
    if (control.options.length > 4) {
      return `<label class="lab-choice"><span>${esc(control.label)}</span><select data-key="${esc(control.key)}">${control.options.map(o=>`<option value="${esc(o.value)}"${o.value === control.initial ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
    }
    return `<fieldset class="lab-choice"><legend>${esc(control.label)}</legend><div class="lab-options">${control.options.map(o=>
      `<label><input type="radio" data-key="${esc(control.key)}" name="${esc(id)}" value="${esc(o.value)}"${o.value === control.initial ? " checked" : ""}><span>${esc(o.label)}</span></label>`
    ).join("")}</div></fieldset>`;
  }
  return `<label class="lab-slider" for="${esc(id)}"><span>${esc(control.label)}</span><output for="${esc(id)}" data-value="${esc(control.key)}">${esc(control.format ? control.format(control.initial) : String(control.initial)+(control.unit ?? ""))}</output>
    <input id="${esc(id)}" type="range" data-key="${esc(control.key)}" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.initial}" style="--fill:${((control.initial - control.min) / (control.max - control.min) * 100).toFixed(2)}%"></label>`;
}

export function renderLab(id, lessonId) {
  const lab = labDefinitions[id];
  if (!lab || (id !== lessonId && !id.startsWith(lessonId+"-"))) throw Error(`Unexpected lab ${id} in ${lessonId}`);
  const anchor = labAnchor(id);
  const state = Object.fromEntries(lab.controls.map(c=>[c.key,c.initial]));
  const model = lab.evaluate(state);
  return `<figure id="${anchor}" class="learning-lab" data-lab="${id}" aria-labelledby="${anchor}-title">
    <figcaption><h3 id="${anchor}-title">${esc(lab.title)}</h3><p>${esc(lab.question)}</p></figcaption>
    <div class="lab-plate">
      <div class="lab-scene" data-scene${needsPlotWidth(model) ? " data-width-dependent" : ""}${lab.scrub ? ' data-scrub="true"' : ""}>${drawModel(model, 630, anchor)}</div>
      ${lab.scrub ? '<div class="lab-gesture">可在图中左右拖动工作点</div>' : ""}
      <div class="lab-caption" data-caption${model.caption ? "" : " hidden"}>${esc(model.caption)}</div>
      <form class="lab-controls" aria-label="${esc(lab.title)}参数" hidden>
        <div class="lab-fields">${lab.controls.map(c=>controlField(c,anchor)).join("")}</div>
        <div class="lab-actions">${lab.presets?.length ? `<div class="lab-presets"><span>示例工况</span>${lab.presets.map((preset,i)=>`<button type="button" data-preset="${i}">${esc(preset.label)}</button>`).join("")}</div>` : ""}
        <button type="reset" class="lab-reset">恢复初始值</button></div>
      </form>
    </div>
    <div class="lab-findings"><strong data-readout>${esc(model.readout)}</strong><p data-explanation>${esc(model.explanation)}</p></div>
    ${lab.check ? `<details class="lab-check"><summary>${esc(lab.check.question)}</summary><p>${esc(lab.check.answer)}</p></details>` : ""}
    <span class="sr-only" data-announcement role="status"></span>
    ${id === lessonId ? lessonReferenceTable(id) : ""}
  </figure>`;
}
