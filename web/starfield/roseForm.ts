/**
 * The rose, as a formula.
 *
 * One spiral sheet wound around the heart: `s` runs along the spiral from the
 * outermost petal (0) to the heart (1), `v` runs up a petal from its base (0)
 * to its rim (1). The sheet's rim rises into `petals` lobes per turn and dips
 * into a notch between them; the petals open wide at the outside and stand
 * nearly upright around the heart. Every figure on the site is this one
 * surface with different numbers, so one figure can turn into another just by
 * easing the numbers.
 *
 * `rosePoint` here mirrors `rosePoint` in shaders.ts. The shader draws; this
 * copy sizes the figure on the page and lets tests measure it.
 */

export interface RoseForm {
  /** How many times the sheet winds around the heart. */
  turns: number;
  /** Petal lobes per turn. Non-integers stagger one turn against the next. */
  petals: number;
  /** Opening angle of the outermost petals, radians from the axis. */
  openOuter: number;
  /** Opening angle of the petals around the heart. */
  openInner: number;
  /** Depth of the notch between petals, as a fraction of petal length. */
  notch: number;
  /** Waviness of the outer rims. */
  ruffle: number;
  /** Height of the cup relative to its width. */
  depth: number;
  /** Length of the innermost petals relative to the outermost. */
  innerLength: number;
  /** Angle of the whole spiral about its axis. */
  twist: number;
  /** Presence of the handwritten signature in the heart, 0..1. */
  signature: number;
  /** Shifts the palette: 0 leaves it balanced, +1 warm, -1 cool. */
  warmth: number;
  /** Resting pose, Euler XYZ in radians. */
  tiltX: number;
  tiltY: number;
  tiltZ: number;
}

export const FORM_KEYS = [
  "turns",
  "petals",
  "openOuter",
  "openInner",
  "notch",
  "ruffle",
  "depth",
  "innerLength",
  "twist",
  "signature",
  "warmth",
  "tiltX",
  "tiltY",
  "tiltZ",
] as const satisfies readonly (keyof RoseForm)[];

/** The identity: an open garden rose with the signature in its heart. */
export const HOME_ROSE: RoseForm = {
  turns: 3.75,
  petals: 3.4,
  openOuter: 1.62,
  openInner: 0.46,
  notch: 0.5,
  ruffle: 1,
  depth: 0.82,
  innerLength: 0.62,
  twist: 0.4,
  signature: 1,
  warmth: 0,
  tiltX: -0.3,
  tiltY: 0.1,
  tiltZ: 0.04,
};

const TAU = Math.PI * 2;
/** The petal profile's flare at the rim, from the belly term at v = 1. */
const RIM_FLARE = 0.15;

export function openingAt(form: RoseForm, s: number) {
  return form.openOuter * Math.pow(form.openInner / form.openOuter, s);
}

/** 0 on a petal's lobes, 1 in the notch between two petals. */
export function petalEdge(form: RoseForm, theta: number) {
  const m = ((((theta * form.petals) / TAU) % 1) + 1) % 1;
  const t = 1 - 2 * m;
  const e = 1.25 * t * t - 0.25;
  return e * e;
}

function petalReach(form: RoseForm, theta: number, s: number) {
  const notch = form.notch * (1 - 0.6 * s);
  const ruffle =
    1 + (1 - s) * form.ruffle * 0.03 * Math.sin(theta * form.petals * 6 + 1.7);
  // The sheet's outer end tucks under the turn above it instead of stopping
  // in the open.
  const t = Math.min(1, Math.max(0, s / (1.3 / (form.petals * form.turns))));
  const tuck = 0.7 + 0.3 * t * t * (3 - 2 * t);
  return (1 - notch * petalEdge(form, theta)) * ruffle * tuck;
}

/** A point of the open rose, in units of its outer radius. */
export function rosePoint(
  form: RoseForm,
  s: number,
  v: number,
  n = 0,
  out: [number, number, number] = [0, 0, 0]
) {
  const theta = s * form.turns * TAU + form.twist;
  const opening = openingAt(form, s);
  const reach = petalReach(form, theta, s);
  const length = 1 + (form.innerLength - 1) * s;
  const belly = 1.95653 * v * v * (1.27689 * v - 1) * (1.27689 * v - 1);
  const sin = Math.sin(opening);
  const cos = Math.cos(opening);
  const r = reach * length * (v * sin + belly * cos) + n * cos;
  const h =
    reach * length * (v * cos - belly * sin) -
    n * sin +
    (1 - s) * form.ruffle * 0.03 * Math.sin(theta * form.petals * 4) * v;
  out[0] = r * Math.cos(theta);
  out[1] = r * Math.sin(theta);
  out[2] = h * form.depth;
  return out;
}

/** Radius of the rim at angle-along-spiral `s`, seen down the axis. */
export function rimRadius(form: RoseForm, s: number) {
  const theta = s * form.turns * TAU + form.twist;
  const opening = openingAt(form, s);
  const length = 1 + (form.innerLength - 1) * s;
  return (
    petalReach(form, theta, s) *
    length *
    (Math.sin(opening) + RIM_FLARE * Math.cos(opening))
  );
}

/** Radius of the open heart, where the signature sits. */
export function heartRadius(form: RoseForm) {
  let min = Infinity;
  const from = 1 - 1 / form.turns;
  for (let i = 0; i <= 64; i++)
    min = Math.min(min, rimRadius(form, from + (i / 64) * (1 - from)));
  return min;
}

/** Largest rim radius: the figure's footprint before perspective. */
export function outerRadius(form: RoseForm) {
  let max = 0;
  const to = Math.min(1, 1.5 / form.turns);
  for (let i = 0; i <= 144; i++)
    max = Math.max(max, rimRadius(form, (i / 144) * to));
  return max;
}

export function lerpForm(a: RoseForm, b: RoseForm, t: number): RoseForm {
  const out = { ...a };
  for (const key of FORM_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/** FNV-1a: the same path always gives the same figure. */
export function hashPath(path: string) {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++)
    hash = Math.imul(hash ^ path.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTION_FORMS: Record<string, Partial<RoseForm>> = {
  // The author's page carries the signed rose, seen a little more from above.
  "/about": { tiltX: -0.3, tiltY: -0.24, tiltZ: -0.1 },
  // Algorithms: a crisp five-fold bloom, the most geometric of the family.
  "/algorithms": {
    turns: 2.8,
    petals: 5,
    openOuter: 1.5,
    openInner: 0.62,
    notch: 0.56,
    ruffle: 0,
    depth: 0.7,
    innerLength: 0.5,
    signature: 0,
    warmth: -0.55,
    tiltX: -0.62,
    tiltY: 0.28,
    tiltZ: 0.3,
  },
  // Applications: a loose, open three-fold bloom with soft rims.
  "/applications": {
    turns: 3.4,
    petals: 2.6,
    openOuter: 1.72,
    openInner: 0.5,
    notch: 0.4,
    ruffle: 1,
    depth: 0.9,
    innerLength: 0.66,
    signature: 0,
    warmth: 0.6,
    tiltX: -0.52,
    tiltY: -0.3,
    tiltZ: -0.2,
  },
  // The archive: many small petals laid nearly flat, a ledger of entries.
  "/archive": {
    turns: 3.2,
    petals: 8.4,
    openOuter: 1.52,
    openInner: 0.95,
    notch: 0.5,
    ruffle: 0.2,
    depth: 0.5,
    innerLength: 0.36,
    signature: 0,
    warmth: -0.2,
    tiltX: -0.7,
    tiltY: 0.16,
    tiltZ: 0.4,
  },
  // Search: no petals at all, a bare spiral to follow inward.
  "/search": {
    turns: 3.1,
    petals: 1,
    openOuter: 1.5,
    openInner: 0.8,
    notch: 0,
    ruffle: 0,
    depth: 0.42,
    innerLength: 0.3,
    signature: 0,
    warmth: -0.35,
    tiltX: -0.78,
    tiltY: 0.3,
    tiltZ: 0.7,
  },
};

/** A figure of its own for every article, tag and category, fixed by the path. */
function seededForm(path: string): RoseForm {
  const random = mulberry32(hashPath(path));
  const range = (min: number, max: number) => min + (max - min) * random();
  const openOuter = range(1.3, 1.78);
  return {
    turns: range(2.5, 4.4),
    // Keep clear of whole numbers: staggered turns read as a flower, aligned
    // turns as a gear.
    petals: Math.floor(range(2, 7)) + range(0.35, 0.65),
    openOuter,
    openInner: range(0.36, Math.min(0.9, openOuter * 0.6)),
    notch: range(0.28, 0.6),
    ruffle: range(0, 1),
    depth: range(0.55, 0.95),
    innerLength: range(0.4, 0.7),
    twist: range(0, TAU),
    signature: 0,
    warmth: range(-0.7, 0.7),
    tiltX: range(-0.72, -0.4),
    tiltY: range(-0.36, 0.36),
    tiltZ: range(-0.5, 0.5),
  };
}

export function normalizePath(path: string) {
  const key = path.split(/[?#]/)[0] || "/";
  return key.length > 1 ? key.replace(/\/+$/, "") : key;
}

export function formForPath(path: string): RoseForm {
  const key = normalizePath(path);
  if (key === "/") return HOME_ROSE;
  const section = SECTION_FORMS[key];
  if (section) return { ...HOME_ROSE, ...section };
  return seededForm(key);
}
