import { mulberry32 } from "./roseForm";

/**
 * The deep sky behind every page: one wrapping tile of stars and nebula that
 * the camera looks into. Positions live in tile units (0..1, wrapping), so
 * the same sky reads at any viewport size and a page change can pan across
 * it instead of cutting to a new one.
 *
 * A single band of nebula crosses the tile diagonally, rising to the right.
 * Its spine is where `u.x + u.y + bandWarp(u)` is a whole number. The warp
 * is a sum of sines with whole frequencies, so it wraps with the tile and
 * the shader and this module agree exactly on where the band runs: stars
 * gathered on it stay on it.
 */

const TAU = Math.PI * 2;

/** Stars in the buffer; a viewport draws the share its area needs. */
export const SKY_STARS = 9000;
/** Stars per CSS px² of tile at full share. */
export const SKY_DENSITY = 0.0012;
/** How far the nebula sits: it parallaxes at this share of the nearest stars. */
export const NEBULA_DEPTH = 0.34;
/**
 * The tile hangs from the viewport's top left, reaching this far past each
 * edge, so a viewport that grows or shrinks (a phone's address bar) leaves
 * every star where it was.
 */
export const SKY_MARGIN = 48;

/** The band's sideways wander, in band units. Mirrors BAND_GLSL. */
export function bandWarp(x: number, y: number) {
  return (
    0.06 * Math.sin(TAU * (x - y) + 1.3) +
    0.032 * Math.sin(TAU * (2 * x + y) + 4.1) +
    0.018 * Math.sin(TAU * (3 * x - 2 * y) + 2.4)
  );
}

export const BAND_GLSL = /* glsl */ `
  float bandWarp(vec2 u) {
    return 0.06 * sin(6.28318530718 * (u.x - u.y) + 1.3)
      + 0.032 * sin(6.28318530718 * (2.0 * u.x + u.y) + 4.1)
      + 0.018 * sin(6.28318530718 * (3.0 * u.x - 2.0 * u.y) + 2.4);
  }
`;

/** Tile side in CSS px for a viewport: always wider than the view. */
export function skyTile(width: number, height: number) {
  const view = Math.max(width, height);
  return Math.max(
    view + 4 * SKY_MARGIN,
    Math.min(2800, Math.max(1400, 1.6 * view))
  );
}

/** How many of the buffer's stars a tile of this size draws. */
export function skyShare(tile: number) {
  return Math.min(SKY_STARS, Math.round(SKY_DENSITY * tile * tile));
}

export interface SkySet {
  count: number;
  /** xy: tile position, z: depth (0 far .. 1 near), w: 1 on the band. */
  param: Float32Array;
  seed: Float32Array;
  /** x: brightness, y: core radius in CSS px, z: temperature, w: twinkle. */
  look: Float32Array;
}

export function buildSky(count = SKY_STARS, seed = 0x5a17): SkySet {
  const random = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(1e-6, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * random());
  };
  const param = new Float32Array(count * 4);
  const seeds = new Float32Array(count * 4);
  const look = new Float32Array(count * 4);

  /** A point on the band, `spread` band units off its spine. */
  const onBand = (spread: number) => {
    const x = random();
    const t = gauss() * spread;
    // Solve x + y + warp(x, y) = t for y; the warp is gentle, so a few
    // fixed-point steps settle it.
    let y = t - x;
    for (let i = 0; i < 4; i++) y = t - x - bandWarp(x, y);
    return [x, y - Math.floor(y)] as const;
  };

  for (let i = 0; i < count; i++) {
    const roll = random();
    let x: number;
    let y: number;
    let depth: number;
    let bright: number;
    let core: number;
    let temperature: number;
    let twinkle: number;
    let band = 0;

    if (roll < 0.62) {
      // Dust: the unresolved field. Faint, sub-pixel, far, and gathered onto
      // the band so that it reads as the band's grain.
      band = random() < 0.58 ? 1 : 0;
      [x, y] = band ? onBand(0.045) : [random(), random()];
      depth = band ? NEBULA_DEPTH + gauss() * 0.04 : 0.16 + 0.3 * random();
      bright = 0.035 + 0.16 * Math.pow(random(), 2.2);
      core = 0.36 + 0.24 * random();
      temperature = gauss() * 0.5;
      twinkle = random() < 0.25 ? 0.25 + 0.3 * random() : 0;
    } else if (roll < 0.94) {
      // The field: modest stars at middle depth.
      band = random() < 0.3 ? 1 : 0;
      [x, y] = band ? onBand(0.08) : [random(), random()];
      depth = band
        ? NEBULA_DEPTH + 0.06 + gauss() * 0.05
        : 0.4 + 0.35 * random();
      const u = random();
      bright = 0.12 + 1.1 * Math.pow(u, 4);
      core = 0.5 + 0.38 * Math.pow(u, 2);
      temperature = random() < 0.12 ? 2 : random() < 0.16 ? -2 : gauss() * 0.5;
      twinkle = random() < 0.45 ? 0.2 + 0.35 * random() : 0;
    } else {
      // Near stars: few, scattered anywhere, and a handful that dominate.
      band = random() < 0.12 ? 1 : 0;
      [x, y] = band ? onBand(0.1) : [random(), random()];
      depth = 0.75 + 0.25 * random();
      const u = random();
      bright = 0.4 + 5.5 * Math.pow(u, 10);
      core = 0.78 + 0.62 * Math.pow(u, 3);
      temperature = random() < 0.18 ? 2 : random() < 0.2 ? -2 : gauss() * 0.4;
      twinkle = 0.25 + 0.4 * random();
    }

    param.set([x, y, Math.max(0.12, Math.min(1, depth)), band], i * 4);
    look.set([bright, core, temperature, twinkle], i * 4);
    seeds.set([random(), random(), random(), random()], i * 4);
  }
  return { count, param, seed: seeds, look };
}

/**
 * The pan (CSS px, for the nearest layer) that runs the band's spine through
 * viewport point (cx, cy) at scroll 0, slid `along` px along the band. The
 * spine nearest `from` is chosen, so a page change moves the sky the short
 * way instead of a whole band over.
 */
export function panThrough(
  cx: number,
  cy: number,
  along: number,
  tile: number,
  from: { x: number; y: number }
) {
  const mx = SKY_MARGIN;
  const my = SKY_MARGIN;
  // pan = along * (1, -1) + k * (1, 1); only k moves the band sideways.
  let k = (from.x + from.y) / 2;
  for (let i = 0; i < 5; i++) {
    const ux = (cx + mx + (along + k) * NEBULA_DEPTH) / tile;
    const uy = (cy + my + (k - along) * NEBULA_DEPTH) / tile;
    const t = ux + uy + bandWarp(ux, uy);
    k += ((Math.round(t) - t) * tile) / (2 * NEBULA_DEPTH);
  }
  return { x: along + k, y: k - along };
}
