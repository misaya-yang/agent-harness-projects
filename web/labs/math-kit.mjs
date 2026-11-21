// Shared helpers for the M0 math labs: number formatting, seeded random numbers, a few special functions and the
// two SVG primitives every custom figure uses.
import { escapeText as esc } from "./graphics.mjs";

const f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);
const pct = (v, digits = 1) => (v * 100).toFixed(digits) + "%";
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function sci(v) {
  if (!Number.isFinite(v)) return "∞";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 1e-3 || a >= 1e5) {
    const e = Math.floor(Math.log10(a));
    return (v / 10 ** e).toFixed(2) + "×10" + String(e).split("").map(c => SUP[c]).join("");
  }
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(2) : v.toPrecision(3);
}
const grid = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const xy = n => Number(n.toFixed(2));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normals(seed) {
  const r = rng(seed);
  let spare = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    const u = Math.max(r(), 1e-12), w = r(), m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * w);
    return m * Math.cos(2 * Math.PI * w);
  };
}
const normalPdf = (x, m = 0, s = 1) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const normSf = z => 0.5 * erfc(z / Math.SQRT2);
function lgamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function logSumExp(values) {
  const m = Math.max(...values);
  return m + Math.log(values.reduce((s, v) => s + Math.exp(v - m), 0));
}
const figure = (w, h, label, body) =>
  `<svg class="lab-figure" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
const text = (x, y, value, cls = "", anchor = "start") =>
  `<text x="${xy(x)}" y="${xy(y)}" text-anchor="${anchor}"${cls ? ` class="${cls}"` : ""}>${esc(value)}</text>`;

export { f2, f3, pct, sci, grid, clamp, xy, rng, normals, normalPdf, erfc, normSf, lgamma, logSumExp, figure, text, esc };
