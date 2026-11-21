import { mulberry32 } from "./roseForm";
import { sampleSignature } from "./signature";

/**
 * Every point of the field, sampled once from a fixed seed.
 *
 * Points of the rose do not store positions. They store where they live on
 * the rose's surface (`s` along the spiral, `v` up the petal, `n` off the
 * sheet) and the shader places them, so the same points follow the rose as it
 * unfurls, breathes and changes form.
 */
export const KIND = {
  /** Luminous streams along the petal rims. */
  RIM: 0,
  /** Faint dust across the petal sheets, gathered into veins. */
  VEIL: 1,
  /** The handwritten signature. */
  SCRIPT: 2,
  /** Loose dust orbiting the rose. */
  POLLEN: 3,
  // 4 was the far sky, which now has its own layer (sky.ts).
  /** A few out-of-focus motes close to the lens. */
  BOKEH: 5,
  /** The soft glow in the heart. */
  CORE: 6,
} as const;

export interface ParticleCounts {
  rim: number;
  beads: number;
  veil: number;
  script: number;
  scriptBeads: number;
  pollen: number;
  bokeh: number;
}

export const DESKTOP_COUNTS: ParticleCounts = {
  rim: 12000,
  beads: 150,
  veil: 13000,
  script: 230,
  scriptBeads: 14,
  pollen: 2000,
  bokeh: 8,
};

export interface ParticleSet {
  count: number;
  /** Points that are always drawn, at the head of the buffers. */
  fixed: number;
  /** xyz: surface coordinates or a position, w: kind. */
  param: Float32Array;
  /** Four independent randoms per point. */
  seed: Float32Array;
  /** x: brightness, y: core radius in CSS px, z: temperature, w: flow rate. */
  look: Float32Array;
}

/** Height of the script in rose units; the heart is about 0.6 across. */
export const SCRIPT_HEIGHT = 0.43;
/** Turns the density pattern is laid out for; forms near this read cleanly. */
const NOMINAL_TURNS = 4.3;
const TAU = Math.PI * 2;

export function buildParticles(
  counts: ParticleCounts = DESKTOP_COUNTS,
  seed = 0x1f7a
): ParticleSet {
  const random = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(1e-6, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * random());
  };
  type Row = [number, number, number, number, number, number, number, number];
  const head: Row[] = [];
  const body: Row[] = [];

  // Temperature: 0 follows the rose's own gradient; a few points are set
  // apart as warm (+2) or deep blue (-2) accents, as real star fields have.
  const temperature = (warm: number, blue: number) => {
    const roll = random();
    if (roll < warm) return 2;
    if (roll < warm + blue) return -2;
    return gauss() * 0.4;
  };

  // The glow in the heart.
  head.push([0, 0, 0, KIND.CORE, 1, 1, 0, 0]);

  // The signature: a fine dotted line, then brighter beads strung along it.
  for (const point of sampleSignature(counts.script, SCRIPT_HEIGHT))
    head.push([
      point.x + gauss() * 0.0012,
      point.y + gauss() * 0.0012,
      point.progress,
      KIND.SCRIPT,
      0.7 + random() * 0.45,
      0.78 + random() * 0.16,
      0,
      0,
    ]);
  for (const point of sampleSignature(counts.scriptBeads, SCRIPT_HEIGHT))
    head.push([
      point.x + gauss() * 0.003,
      point.y + gauss() * 0.003,
      point.progress,
      KIND.SCRIPT,
      2.2 + random() * 2.6,
      1.0 + random() * 0.5,
      random() < 0.3 ? 2 : 0,
      0,
    ]);

  // Density along the rims gathers into clusters and thins into gaps.
  const clump = (s: number) => {
    const a = s * NOMINAL_TURNS * TAU;
    return Math.min(
      1,
      Math.max(
        0.12,
        0.56 +
          0.3 * Math.sin(a * 5.3 + 0.7) +
          0.24 * Math.sin(a * 12.7 + 2.1) * Math.sin(a * 1.9 + 4.0)
      )
    );
  };

  // Rim streams: one tight strand on the edge, two weaving just inside it,
  // and a thin spray thrown off it.
  for (let i = 0; i < counts.rim; ) {
    const s = random();
    if (random() > clump(s)) continue;
    const a = s * NOMINAL_TURNS * TAU;
    const pick = random();
    let v: number;
    let n: number;
    let bright: number;
    if (pick < 0.5) {
      v = 1 - Math.abs(gauss()) * 0.004;
      n = gauss() * 0.003;
      bright = 0.4 + 1.3 * Math.pow(random(), 3);
    } else if (pick < 0.7) {
      v = 0.966 + 0.012 * Math.sin(a * 3.1 + 0.4) + gauss() * 0.007;
      n = 0.006 * Math.sin(a * 2.3) + gauss() * 0.005;
      bright = 0.22 + 0.8 * Math.pow(random(), 3);
    } else if (pick < 0.88) {
      v = 0.925 + 0.02 * Math.sin(a * 1.7 + 2.2) + gauss() * 0.01;
      n = 0.012 * Math.sin(a * 2.9 + 1.3) + gauss() * 0.007;
      bright = 0.16 + 0.6 * Math.pow(random(), 3);
    } else {
      v = 1 + gauss() * 0.03;
      n = gauss() * 0.032;
      bright = 0.08 + 0.3 * random();
    }
    // A few points of each stream swell into small pearls.
    const pearl = pick < 0.7 && random() < 0.035;
    body.push([
      s,
      v,
      n,
      KIND.RIM,
      pearl ? 0.9 + 1.5 * random() : bright,
      pearl ? 0.98 + 0.26 * random() : 0.5 + 0.45 * random() * random(),
      temperature(0.07, 0.05),
      0.75 + random() * 0.5,
    ]);
    i++;
  }

  // Beads: the few bright stars strung along the rims. Brightness follows a
  // steep power law, so most are modest and a handful dominate.
  for (let i = 0; i < counts.beads; ) {
    const s = random();
    if (random() > clump(s) * 0.85 + 0.15) continue;
    const u = random();
    const bright = 1.2 + 10 * Math.pow(u, 6);
    body.push([
      s,
      1 - Math.abs(gauss()) * 0.012,
      gauss() * 0.006,
      KIND.RIM,
      bright,
      1.0 + 1.7 * Math.pow(u, 3),
      temperature(0.16, 0.1),
      0.8 + random() * 0.4,
    ]);
    i++;
  }

  // Veil: dust over the petal sheets, denser toward the rim, most of it
  // gathered onto radial veins.
  const veins = 96;
  for (let i = 0; i < counts.veil; i++) {
    const veined = random() < 0.74;
    const s = veined
      ? (Math.floor(random() * veins) + 0.5 + gauss() * 0.07) / veins
      : random();
    const inward = Math.pow(random(), 1.9);
    const v = 1 - 0.5 * inward;
    // Lit at the rim, fading into the petal.
    const falloff = 0.22 + 0.78 * Math.pow(1 - inward, 1.6);
    body.push([
      Math.min(0.9999, Math.max(0, s)),
      v,
      gauss() * 0.006,
      KIND.VEIL,
      ((veined ? 0.15 : 0.09) + 0.4 * Math.pow(random(), 2.4)) * falloff,
      0.36 + 0.28 * random(),
      temperature(0.03, 0.08),
      0.45 + random() * 0.35,
    ]);
  }

  // Pollen: a loose halo around the rose, thinning with distance.
  for (let i = 0; i < counts.pollen; i++) {
    const radius = 0.42 + 1.9 * Math.pow(random(), 1.7);
    const angle = random() * TAU;
    const rare = random() < 0.035;
    body.push([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      gauss() * (0.16 + 0.2 * radius),
      KIND.POLLEN,
      rare ? 0.9 + 2.4 * random() : 0.05 + 0.42 * Math.pow(random(), 4),
      rare ? 1.0 + 0.5 * random() : 0.4 + 0.5 * random(),
      temperature(0.08, 0.14),
      0.4 + random() * 1.2,
    ]);
  }

  // Bokeh: motes between the rose and the lens.
  for (let i = 0; i < counts.bokeh; i++) {
    // Kept to the outskirts: nothing soft drifts across the signature.
    const angle = random() * TAU;
    const radius = 0.85 + random() * 0.75;
    body.push([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      1.4 + random() * 1.8,
      KIND.BOKEH,
      0.16 + random() * 0.3,
      1.4 + random() * 1.4,
      temperature(0.12, 0.3),
      0.5 + random(),
    ]);
  }

  // Shuffle the body, so that drawing any leading share of it thins every
  // layer evenly on small screens.
  for (let i = body.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = body[i];
    body[i] = body[j];
    body[j] = swap;
  }

  const rows = head.concat(body);
  const count = rows.length;
  const param = new Float32Array(count * 4);
  const seeds = new Float32Array(count * 4);
  const look = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const row = rows[i];
    param.set([row[0], row[1], row[2], row[3]], i * 4);
    look.set([row[4], row[5], row[6], row[7]], i * 4);
    seeds.set([random(), random(), random(), random()], i * 4);
  }
  return { count, fixed: head.length, param, seed: seeds, look };
}
