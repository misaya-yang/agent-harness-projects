/**
 * The handwritten "lvy", traced from the original drawing as two pen strokes
 * (source-image pixels). It sits in the rose's open heart.
 */
const STROKES: readonly (readonly [number, number])[][] = [
  [
    [529, 695],
    [552, 674],
    [578, 616],
    [610, 547],
    [625, 535],
    [617, 574],
    [587, 628],
    [558, 671],
    [559, 688],
    [575, 687],
    [602, 665],
    [624, 647],
    [631, 650],
    [626, 660],
    [616, 665],
  ],
  [
    [613, 665],
    [645, 650],
    [649, 663],
    [659, 665],
    [674, 653],
    [658, 699],
    [645, 739],
    [624, 767],
    [597, 778],
    [581, 774],
    [583, 756],
    [604, 727],
    [645, 702],
    [691, 685],
    [744, 680],
  ],
];

/** Centre of the script in the source drawing. */
const ORIGIN_X = 636;
const ORIGIN_Y = 656;
/** Source pixels across the script's taller side. */
const SOURCE_SPAN = 243;
/** A slight shear stands the steep slant up without losing the hand. */
const UPRIGHT = 0.14;

export interface SignaturePoint {
  x: number;
  y: number;
  /** Position along the whole signature in writing order, 0..1. */
  progress: number;
}

function catmullRom(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number
): [number, number] {
  // Centripetal parameterisation: no loops or overshoot at the tight turns
  // of the pen.
  const knot = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (
    a: readonly [number, number],
    b: readonly [number, number],
    ta: number,
    tb: number
  ): [number, number] => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

function densify(stroke: readonly (readonly [number, number])[]) {
  const points: [number, number][] = [];
  for (let i = 0; i < stroke.length - 1; i++) {
    const p0 = stroke[Math.max(0, i - 1)];
    const p1 = stroke[i];
    const p2 = stroke[i + 1];
    const p3 = stroke[Math.min(stroke.length - 1, i + 2)];
    for (let step = 0; step < 24; step++)
      points.push(catmullRom(p0, p1, p2, p3, step / 24));
  }
  const last = stroke[stroke.length - 1];
  points.push([last[0], last[1]]);
  return points;
}

/**
 * `count` points spaced evenly along the pen's path, in writing order.
 * `height` is the script's height in rose units.
 */
export function sampleSignature(count: number, height: number) {
  const scale = height / SOURCE_SPAN;
  const strokes = STROKES.map(densify);
  const lengths = strokes.map(points => {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++)
      cumulative.push(
        cumulative[i - 1] +
          Math.hypot(
            points[i][0] - points[i - 1][0],
            points[i][1] - points[i - 1][1]
          )
      );
    return cumulative;
  });
  const total = lengths.reduce((sum, c) => sum + c[c.length - 1], 0);
  const out: SignaturePoint[] = [];
  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? 0 : i / (count - 1);
    let distance = progress * total;
    let stroke = 0;
    while (
      stroke < strokes.length - 1 &&
      distance > lengths[stroke][lengths[stroke].length - 1]
    ) {
      distance -= lengths[stroke][lengths[stroke].length - 1];
      stroke++;
    }
    const cumulative = lengths[stroke];
    const points = strokes[stroke];
    let hi = 1;
    while (hi < cumulative.length - 1 && cumulative[hi] < distance) hi++;
    const span = cumulative[hi] - cumulative[hi - 1] || 1;
    const w = Math.min(1, Math.max(0, (distance - cumulative[hi - 1]) / span));
    const sx = points[hi - 1][0] + (points[hi][0] - points[hi - 1][0]) * w;
    const sy = points[hi - 1][1] + (points[hi][1] - points[hi - 1][1]) * w;
    const y = (ORIGIN_Y - sy) * scale;
    out.push({ x: (sx - ORIGIN_X) * scale - y * UPRIGHT, y, progress });
  }
  return out;
}
