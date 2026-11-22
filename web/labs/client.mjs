import { drawModel, needsPlotWidth } from "./graphics.mjs";

function activate(figure, lab) {
  const form = figure.querySelector(".lab-controls");
  const scene = figure.querySelector("[data-scene]");
  const caption = figure.querySelector("[data-caption]");
  const readout = figure.querySelector("[data-readout]");
  const explanation = figure.querySelector("[data-explanation]");
  const announcement = figure.querySelector("[data-announcement]");
  const fields = [...form.querySelectorAll("[data-key]")];
  const outputs = [...form.querySelectorAll("[data-value]")];
  let width = 0;
  let model;
  function render() {
    if (needsPlotWidth(model)) {
      width = Math.round(scene.getBoundingClientRect().width);
      if (!width) return;
    }
    scene.innerHTML = drawModel(model, width, figure.id);
  }
  function calculate() {
    const state = {};
    for (const control of lab.controls) {
      const field = fields.find(el => el.dataset.key === control.key && (el.type !== "radio" || el.checked));
      state[control.key] = control.options ? control.options.find(o=>String(o.value) === field.value).value : Number(field.value);
      if (field.type === "range") field.style.setProperty("--fill", ((Number(field.value) - Number(field.min)) / (Number(field.max) - Number(field.min)) * 100).toFixed(2) + "%");
      const output = outputs.find(el=>el.dataset.value === control.key);
      if (output) output.value = control.format ? control.format(state[control.key]) : String(state[control.key]) + (control.unit ?? "");
    }
    model = lab.evaluate(state);
    render();
    readout.textContent = model.readout;
    explanation.textContent = model.explanation;
    caption.textContent = model.caption ?? "";
    caption.hidden = !model.caption;
  }
  form.addEventListener("input", calculate);
  form.addEventListener("change", () => { announcement.textContent = readout.textContent; });
  function applyValues(values) {
    for (const input of fields) {
      if (!Object.hasOwn(values, input.dataset.key)) continue;
      const value = String(values[input.dataset.key]);
      if (input.type === "radio") input.checked = input.value === value;
      else input.value = value;
    }
    calculate();
    announcement.textContent = model.readout;
  }
  form.addEventListener("reset", event => {
    event.preventDefault();
    applyValues(Object.fromEntries(lab.controls.map(c=>[c.key,c.initial])));
  });
  form.addEventListener("submit", e=>e.preventDefault());
  if (lab.scrub) {
    const slider = fields.find(field => field.dataset.key === lab.scrub.key);
    let dragging;
    const move = event => {
      const svg = scene.querySelector("svg.lab-cartesian");
      const transform = svg?.getScreenCTM();
      if (!transform) return;
      const pos = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      const { xMin, xMax, xLeft, xRight, logX } = svg.dataset;
      const t = Math.max(0, Math.min(1, (pos.x - Number(xLeft)) / (Number(xRight) - Number(xLeft))));
      const x = logX === "true" ? Number(xMin) * Math.pow(Number(xMax) / Number(xMin), t) : Number(xMin) + (Number(xMax) - Number(xMin)) * t;
      const raw = lab.scrub.transform === "log10" ? Math.log10(x) : x;
      const step = Number(slider.step), lo = Number(slider.min), hi = Number(slider.max);
      const value = Math.min(hi, Math.max(lo, lo + Math.round((raw-lo)/step)*step));
      if (Number(slider.value) === value) return;
      slider.value = String(value);
      calculate();
    };
    scene.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.target.closest(".lab-cartesian")) return;
      dragging = event.pointerId;
      scene.setPointerCapture(dragging);
      move(event);
    });
    scene.addEventListener("pointermove", event => { if (event.pointerId === dragging) move(event); });
    scene.addEventListener("lostpointercapture", () => { dragging = undefined; announcement.textContent = readout.textContent; });
  }
  for (const button of form.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      applyValues(lab.presets[Number(button.dataset.preset)].values);
    });
  }
  form.hidden = false;
  // Intrinsically sized figures already contain the exact initial plot and readout.
  // A browser may restore non-default controls when navigating back to a lesson.
  const restored = fields.some(field => field.type === "radio" ? field.checked !== field.defaultChecked
    : field.tagName === "SELECT" ? field.value !== [...field.options].find(option => option.defaultSelected)?.value
    : field.value !== field.defaultValue);
  if (restored || scene.hasAttribute("data-width-dependent")) calculate();
  new ResizeObserver(() => {
    if (!model || !needsPlotWidth(model)) return;
    const w = Math.round(scene.getBoundingClientRect().width);
    if (w && w !== width) render();
  }).observe(scene);
}

export function activateLabs(definitions) {
  for (const figure of document.querySelectorAll("[data-lab]")) {
    const lab = definitions[figure.dataset.lab];
    if (lab) activate(figure, lab);
  }
}
