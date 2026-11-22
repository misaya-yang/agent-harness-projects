import { test } from "node:test";
import assert from "node:assert/strict";
import { labDefinitions, renderLab } from "./lesson-labs.mjs";
import { lessonById } from "./curriculum.mjs";
import { lessonSources } from "./lesson-sources.mjs";
import { drawModel } from "../web/labs/graphics.mjs";

for (const [id, lab] of Object.entries(labDefinitions)) {
  test(`${id}: lesson, references, accessible static view and parameter boundaries`, () => {
    // A lesson may hold several labs: "6.3" and "6.3-polynomial" both belong to lesson 6.3.
    const lessonId = id.split("-")[0];
    const lesson = lessonById.get(lessonId);
    const markers = [...lesson.body.matchAll(/^```academy-lab\s*\n([^\n]+)\n```$/gm)].map(match=>match[1]);
    assert.equal(markers.filter(marker=>marker === id).length, 1);
    assert.ok(markers.every(marker=>marker === lessonId || marker.startsWith(lessonId + "-")));
    assert.ok(lab.check?.question && lab.check.answer);
    assert.ok(lessonSources[lessonId].some(source=>source.kind === "direct"));
    for (const source of lessonSources[lessonId]) assert.equal(new URL(source.url).protocol, "https:");
    const initial = Object.fromEntries(lab.controls.map(c=>[c.key,c.initial]));
    const states = [initial];
    for (const c of lab.controls) {
      const values = c.options?.map(o=>o.value) ?? [c.min, c.max];
      states.push(...values.map(value=>({ ...initial, [c.key]: value })));
    }
    const outputs = new Set();
    for (const state of states) {
      const result = lab.evaluate(state);
      const visual = drawModel(result, 288, id);
      assert.match(visual, /<svg/);
      assert.ok(result.readout && result.explanation);
      assert.doesNotMatch(visual + result.readout + result.explanation, /NaN|Infinity|undefined/);
      outputs.add(visual + result.readout);
    }
    assert.ok(outputs.size > 1, "Changing the parameters must affect the teaching example");
    assert.match(renderLab(id, lessonId), /data-readout/);
  });
}

test("Roofline uses consistent decimal units and the smaller hardware limit", () => {
  const lab = labDefinitions["5.1"];
  for (const [hardware, peak] of [["h100-bf16", 989], ["h100-fp8", 1979]]) {
    for (const intensityExponent of [-1, 2, 3, 5]) {
      const result = lab.evaluate({ hardware, intensityExponent });
      assert.equal(result.markers[0].x, peak / 3.35);
      assert.equal(result.point.y, Math.min(3.35 * 10 ** intensityExponent, peak));
    }
  }
});

test("worked examples match the interactive curves at the same parameter settings", () => {
  // Ordered as in each figure's legend. Expected values come from the lesson's
  // independent Python calculation. Allow half a unit in its last printed digit.
  const examples = [
    ["1.1-correlation", -0.25, [1, 1.118]],
    ["1.2-phase", 4, [0.878, 0.071]],
    ["1.3-absorb", 1, [0.670, 0.670, 0.500]],
    ["1.4-capacity", 6, [2, 6]],
    ["1.5-traffic", 4, [128, 0]],
    ["2.1-gradient", 50, [-0.347, 0]],
    ["2.2-votes", 0, [0.500, 0.750]],
    ["2.3-credit", 0.5, [0.400, 0.400, 0.400]],
    ["2.4-curvature", 2, [0.119, 0.094]],
    ["2.5-groups", 10, [0.344, 0.570]],
    ["2.6-mask", 6, [2, 0.500]],
    ["1.6-retention", 7, [0.478, 0.932]],
    ["2.7-ess", 8, [0.396, 0.920]],
    ["3.1-mask", 64, [0.0625, 0.25]],
    ["3.2-context", 256, [0.160, 0.400]],
    ["3.3-conflict", 1, [0.500, 0.500]],
    ["4.1-noise-error", 20, [0.200, 0.100]],
    ["4.2-euler", 4, [1.895, 2]],
    ["4.3-guidance-error", 4, [0.700, 0.100]],
    ["5.1-batch-bytes", 8, [57.500, 40]],
    ["5.2-pipeline", 8, [0.467, 0.273]],
    ["5.3-qk-clip", 200, [100, 200]],
    ["5.4-pass-k", 5, [0.806, 0.763]],
  ];
  for (const [id, x, expected] of examples) {
    const lab = labDefinitions[id];
    const key = lab.controls[0].key;
    const model = lab.evaluate({ [key]: x });
    assert.equal(model.series.length, expected.length, id);
    for (const [i, series] of model.series.entries()) {
      const sample = series.points.find(([at]) => Math.abs(at - x) < 1e-8);
      assert.ok(sample && Math.abs(sample[1] - expected[i]) <= 0.000501,
        `${id}: ${series.label} at ${x}, expected ${expected[i]}, got ${sample?.[1]}`);
    }
    assert.ok(Math.abs(model.point.y - expected[0]) < 0.000501, id);
    const control = lab.controls[0];
    const readouts = [control.min, control.initial, control.max].map(value =>
      lab.evaluate({ [key]: value }).readout);
    assert.ok(new Set(readouts).size > 1, id);
  }
});

test("the three new core lessons reproduce their worked retrieval and data examples", () => {
  function at(id, changes = {}) {
    const lab = labDefinitions[id];
    const initial = Object.fromEntries(lab.controls.map(c => [c.key, c.initial]));
    return lab.evaluate({ ...initial, ...changes });
  }
  // 48 successful hits and two successful misses. Holding the old hit rate
  // fixed would instead predict 60 successful hits and the same two misses.
  const rates = at("5.5", { recall: 0.8, hit: 0.6 }).rows.map(row => Math.round(row.value));
  assert.deepEqual(rates, [50, 62, 49]);
  assert.match(at("6.2").readout, /原始 91 → 精确 81 → 近重 71 → 过滤 61 token/);
  assert.match(at("6.2", { near: 0.6 }).readout, /原始 91 → 精确 81 → 近重 61 → 过滤 51 token/);
  for (const [ef, hits, visits] of [[3, 0, 10], [6, 3, 22]]) {
    const { readout } = at("8.1-graph", { m: 3, ef });
    assert.ok(readout.includes(`召回 ${hits}/3`) && readout.includes(`计算距离 ${visits}/36`), readout);
  }
});
