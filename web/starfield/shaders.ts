import { BAND_GLSL, SKY_MARGIN } from "./sky";

/** Points in the chain that trails the pointer; the dust reacts to each. */
export const TRAIL_SAMPLES = 5;
/** Camera distance in rose radii; sets how strongly depth reads. */
export const CAMERA_DISTANCE = 5.2;

/**
 * Every point is one camera-facing quad. The vertex shader places it: points
 * of the rose are evaluated on the rose's surface from (s, v, n), so the
 * whole figure unfurls, breathes and changes form through a few uniforms.
 *
 * Screen quantities are device pixels, origin at the viewport centre, y up.
 */
export const PARTICLE_VERTEX = /* glsl */ `
  #define TRAIL ${TRAIL_SAMPLES}
  #define TAU 6.28318530718
  #define CAMERA ${CAMERA_DISTANCE.toFixed(2)}

  attribute vec4 aParam;
  attribute vec4 aSeed;
  attribute vec4 aLook;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uDpr;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform vec4 uQuatHeart;
  uniform vec4 uQuatRim;
  uniform float uPresence;
  uniform float uDisperse;
  uniform float uGrow;
  uniform float uOpen;
  uniform float uWrite;
  uniform float uPen;
  uniform float uBreath;
  uniform float uFlow;
  uniform float uLight;
  uniform float uGain;

  uniform float uTurns;
  uniform float uPetals;
  uniform float uOpenOuter;
  uniform float uOpenInner;
  uniform float uNotch;
  uniform float uRuffle;
  uniform float uDepth;
  uniform float uInnerLength;
  uniform float uTwist;
  uniform float uSignature;
  uniform float uWarmth;
  uniform float uScriptZ;

  uniform vec4 uQuiet;
  uniform vec4 uTrail[TRAIL];
  uniform vec2 uTrailVel[TRAIL];
  uniform vec3 uPointer;
  uniform float uFocus;
  uniform float uAperture;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vHot;
  varying vec4 vShape;
  varying vec2 vEdge;
  varying vec3 vStreak;

  vec3 rotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  float openingAt(float s) {
    float opening = uOpenOuter * pow(uOpenInner / uOpenOuter, s);
    // The bud stands nearly closed; the outer petals breathe a little.
    return opening * mix(0.24, 1.0, uOpen) + uBreath * (1.0 - s);
  }

  // 0 on a petal's lobes, 1 in the notch between two petals.
  float petalEdge(float theta) {
    float t = 1.0 - 2.0 * fract(theta * uPetals / TAU);
    float e = 1.25 * t * t - 0.25;
    return e * e;
  }

  float petalReach(float theta, float s, float edge) {
    float notch = uNotch * (1.0 - 0.6 * s);
    float ruffle = 1.0 + (1.0 - s) * uRuffle * 0.03 * sin(theta * uPetals * 6.0 + 1.7);
    // The sheet's outer end tucks under the turn above it instead of
    // stopping in the open.
    float tuck = mix(0.7, 1.0, smoothstep(0.0, 1.3 / (uPetals * uTurns), s));
    return (1.0 - notch * edge) * ruffle * tuck;
  }

  float petalLength(float s) {
    return mix(1.0, uInnerLength, s) * mix(0.7, 1.0, uOpen);
  }

  // Radius of the rim seen down the axis, at spiral angle theta.
  float rimRadius(float theta, float s) {
    float opening = openingAt(s);
    return petalReach(theta, s, petalEdge(theta)) * petalLength(s)
      * (sin(opening) + 0.15 * cos(opening));
  }

  vec3 rosePoint(float s, float v, float n, out float theta, out float lobe, out float radial) {
    theta = s * uTurns * TAU + uTwist;
    float opening = openingAt(s);
    float edge = petalEdge(theta);
    lobe = 1.0 - edge;
    float reach = petalReach(theta, s, edge) * petalLength(s);
    float belly = 1.95653 * v * v * (1.27689 * v - 1.0) * (1.27689 * v - 1.0);
    float sn = sin(opening);
    float cs = cos(opening);
    radial = reach * (v * sn + belly * cs) + n * cs;
    float height = reach * (v * cs - belly * sn) - n * sn
      + (1.0 - s) * uRuffle * 0.03 * sin(theta * uPetals * 4.0 + uTime * 0.21) * v;
    return vec3(radial * cos(theta), radial * sin(theta), height * uDepth);
  }

  // Night: emitted light. Cool rims, a blush through the middle, a warm heart.
  vec3 starColor(float s, float temperature) {
    float w = clamp(s + uWarmth * 0.34 + temperature * 0.1, 0.0, 1.0);
    vec3 color = mix(vec3(0.52, 0.72, 1.0), vec3(1.0, 0.8, 0.86), smoothstep(0.16, 0.62, w));
    color = mix(color, vec3(1.0, 0.8, 0.58), smoothstep(0.6, 1.0, w));
    color = mix(color, vec3(1.0, 0.56, 0.3), step(1.5, temperature));
    color = mix(color, vec3(0.34, 0.5, 1.0), step(1.5, -temperature));
    return color;
  }

  // Day: the same points printed on a cool white, written as absorbance, so
  // overlapping ink deepens and keeps its hue instead of greying. Cobalt on
  // the outer rims, through indigo and violet, to a magenta heart; each
  // point sits a little to one side of its neighbours' hue, and a few are
  // set apart in rose or ultramarine. Every ink leaves most of the blue
  // channel open, so dense beads stay a saturated blue rather than going
  // black. The signature is crimson.
  vec3 inkColor(float s, float temperature, float tint, float seal) {
    float w = clamp(s + uWarmth * 0.34 + temperature * 0.1 + (tint - 0.5) * 0.22, 0.0, 1.0);
    vec3 ink = mix(vec3(2.9, 2.45, 0.42), vec3(2.45, 2.5, 0.4), smoothstep(0.0, 0.3, w));
    ink = mix(ink, vec3(1.6, 2.6, 0.48), smoothstep(0.28, 0.66, w));
    ink = mix(ink, vec3(0.62, 2.5, 0.95), smoothstep(0.62, 1.0, w));
    ink = mix(ink, vec3(0.5, 2.3, 1.0), step(1.5, temperature));
    ink = mix(ink, vec3(2.8, 1.75, 0.24), step(1.5, -temperature));
    return mix(ink, vec3(0.35, 2.5, 1.6), seal);
  }

  void main() {
    float kind = aParam.w;
    float bright = aLook.x;
    float temperature = aLook.z;
    float alpha = 1.0;
    float s = 0.0;
    vec3 p = vec3(0.0);
    vec4 q = uQuatHeart;
    vec2 px;
    float depth = 0.0;
    float mass = 0.55 + 1.6 * aSeed.x * aSeed.x + 0.12 * bright;

    if (kind < 1.5) {
      // Rim streams and veil dust ride the spiral, slowly, toward the rims.
      s = fract(aParam.x - uTime * uFlow * aLook.w);
      float theta;
      float lobe;
      float radial;
      p = rosePoint(s, aParam.y, aParam.z, theta, lobe, radial);

      // Tucked under the next petal in: what the inner turn covers is hidden,
      // which is what separates one petal's arc from the next.
      float turn = 1.0 / uTurns;
      float covered = rimRadius(theta + TAU, min(1.0, s + turn));
      float heart = rimRadius(theta, s) * 0.72;
      covered = mix(covered, heart, smoothstep(1.0 - turn - 0.05, 1.0 - turn + 0.05, s));
      alpha *= smoothstep(covered * 0.9, covered * 1.0, radial);

      // The spiral is not a loop: ease points in and out at its two ends.
      alpha *= smoothstep(0.0, 0.03, s) * (1.0 - smoothstep(0.975, 1.0, s));
      // Petal tips carry the light; the notches fall back.
      float tip = smoothstep(0.0, 0.85, lobe);
      alpha *= kind < 0.5 ? mix(0.34, 1.0, tip) : mix(0.5, 1.0, tip);
      // Light comes from the heart: inner petals glow, outer ones cool off,
      // and a slow wave of it travels along the spiral.
      bright *= mix(0.74, kind < 0.5 ? 1.45 : 1.05, s * sqrt(s));
      bright *= 1.0 + 0.2 * sin(theta - uTime * 0.3);
      // The spiral draws itself from the heart outward.
      float front = 1.0 - uGrow * 1.24;
      alpha *= smoothstep(front, front + 0.16, s);
      bright *= 1.0 + 2.2 * exp(-pow((s - front - 0.1) / 0.06, 2.0)) * (1.0 - smoothstep(0.85, 1.0, uGrow));

      q = normalize(mix(uQuatRim, uQuatHeart, smoothstep(0.0, 1.0, s)));
    } else if (kind < 2.5) {
      // The signature; where a figure carries none, a small cluster of stamens.
      vec3 cluster = normalize(aSeed.xyz - 0.5 + 1e-3) * pow(aSeed.w, 0.6) * vec3(0.13, 0.13, 0.08);
      p = mix(cluster, vec3(aParam.xy, 0.0), uSignature);
      p.z += uScriptZ;
      float written = smoothstep(aParam.z - 0.03, aParam.z + 0.004, uWrite);
      alpha *= mix(smoothstep(0.7, 1.0, uGrow), written, uSignature);
      bright *= 1.0 + 1.5 * uSignature * exp(-pow((aParam.z - uPen) / 0.04, 2.0));
      bright *= mix(0.5, 1.3, uSignature);
      s = 1.0;
      mass *= 2.4;
    } else if (kind < 3.5) {
      // Pollen in slow orbit, faster nearer the heart.
      float radius = length(aParam.xy);
      float angle = uTime * 0.016 * aLook.w / (0.35 + radius);
      float c = cos(angle);
      float sn = sin(angle);
      p = vec3(aParam.x * c - aParam.y * sn, aParam.x * sn + aParam.y * c,
        aParam.z + 0.05 * sin(uTime * 0.13 * aLook.w + aSeed.y * TAU));
      s = clamp(1.0 - radius * 0.62, 0.0, 1.0);
      alpha *= smoothstep(0.35, 1.0, uGrow) * (1.0 - smoothstep(1.7, 2.4, radius) * 0.7);
      q = uQuatRim;
      mass *= 0.7;
    } else if (kind < 5.5) {
      p = vec3(
        aParam.x + 0.16 * sin(uTime * 0.05 * aLook.w + aSeed.x * TAU),
        aParam.y + 0.12 * sin(uTime * 0.04 * aLook.w + aSeed.y * TAU),
        aParam.z);
      s = aSeed.z;
      // Soft discs read as light at night and as stains on paper.
      alpha *= smoothstep(0.5, 1.0, uGrow) * (1.0 - uLight);
      q = uQuatRim;
      mass = 0.5;
    } else {
      p = vec3(0.0, 0.0, uScriptZ - 0.04);
      s = 1.0;
      alpha *= smoothstep(0.55, 1.0, uGrow);
      mass = 50.0;
    }

    // Leaving the page, the figure loosens into drifting dust.
    float scatter = uDisperse * (0.5 + 0.95 * aSeed.x);
    vec3 away = normalize(aSeed.yzw - 0.5 + 1e-3);
    p = p * (1.0 + 0.42 * scatter) + away * scatter * (0.2 + 0.85 * aSeed.w);
    alpha *= 1.0 - 0.82 * uDisperse;

    vec3 view = rotate(q, p);
    depth = view.z;
    // Nearer points catch a little more light.
    bright *= 1.0 + 0.4 * clamp(view.z, -0.5, 0.6);
    float persp = CAMERA / (CAMERA - view.z);
    px = uCenter + view.xy * persp * uRadius;
    alpha *= uPresence;

    // The pointer's wake: a short chain of soft points trails the hand.
    // Each parts the dust around it and carries it a little way along. The
    // parting is zero under the hand itself and falls away smoothly, so
    // nothing snaps; light dust yields most, bright stars hardly at all.
    vec2 push = vec2(0.0);
    for (int i = 0; i < TRAIL; i++) {
      vec4 node = uTrail[i];
      vec2 delta = (px - node.xy) / node.w;
      float fall = exp(-dot(delta, delta) * 1.5) * node.z;
      push += (delta * node.w * 0.4 + uTrailVel[i]) * fall;
    }
    px += push * min(1.7, 1.0 / mass);

    // Text columns stay quiet.
    float column = 1.0 - smoothstep(uQuiet.y, uQuiet.y + uQuiet.z, abs(px.x - uQuiet.x));
    alpha *= 1.0 - uQuiet.w * column;

    // A soft light follows the pointer through the dust.
    vec2 toPointer = px - uPointer.xy;
    float lit = uPointer.z * exp(-dot(toPointer, toPointer) / (uDpr * uDpr * 11000.0));
    bright *= 1.0 + lit * mix(0.85, 0.2, smoothstep(0.6, 3.0, bright));

    float prominence = smoothstep(1.1, 8.5, bright);
    float star = smoothstep(0.94, 1.02, aLook.y);
    float scale = clamp(pow(uRadius / (uDpr * 330.0), 0.5), 0.55, 1.2);
    // Dark dots on a light ground read thinner than light on dark.
    float core = aLook.y * uDpr * mix(1.0, persp, 0.85) * scale * mix(1.0, 1.12, uLight);
    float ext = mix(2.4, mix(5.0, 9.5, prominence), star);
    float halo = star * mix(0.05, 0.16, prominence);
    float spike = smoothstep(4.5, 9.0, aLook.x);

    if (kind > 5.5) {
      // The heart's glow: one wide, soft sprite.
      core = uRadius * 0.34 * mix(0.55, 1.0, uSignature);
      ext = 2.4;
      halo = 0.0;
      spike = 0.0;
      bright = mix(0.055, 0.03, uLight) * mix(0.6, 1.0, uSignature);
      prominence = 0.0;
    }

    // Depth of field: the whole flower sits inside the focal band and stays
    // sharp; dust well off it spreads and dims, and the few motes near the
    // lens open into discs.
    float blur = max(0.0, abs(depth - uFocus) - 0.22) * uAperture * uRadius;
    if (kind > 4.5 && kind < 5.5) blur *= 4.6;
    float spread = sqrt(core * core + blur * blur);
    float bokeh = smoothstep(1.4, 3.6, blur / core) * step(kind, 5.5);
    float energy = (core * core) / (spread * spread);
    // Below a pixel, hold the size and trade it for brightness: no flicker.
    float floorPx = mix(0.62, 0.8, smoothstep(1.0, 2.0, uDpr));
    float drawn = max(spread, floorPx);
    energy *= (spread * spread) / (drawn * drawn);
    // Small and in focus, a point is drawn hard-edged; depth blur and sheer
    // size (the few real stars, the heart's glow) soften it.
    float soft = max(
      smoothstep(0.35, 1.4, blur / core),
      smoothstep(1.1, 2.2, drawn / uDpr));
    // On paper a large point is a drop of ink, not a glow: keep its edge.
    soft *= mix(1.0, 0.3, uLight * step(kind, 5.5));

    // Bright stars scintillate, dust holds steady.
    float twinkle = 1.0 + star * 0.16 * sin(uTime * (0.7 + 1.7 * aSeed.y) + aSeed.z * TAU);

    float night = bright * alpha * energy * twinkle;
    // Ink does not glow: compress the range and keep dots solid.
    // The rims are drawn with a loaded pen, the veil with a dry one, and the
    // signature is pressed on.
    float load = kind < 0.5 ? 1.2 : (kind < 1.5 ? 0.95 : (kind < 2.5 ? mix(0.7, 1.5, uSignature) : 1.0));
    float day = pow(aLook.x, 0.42) * alpha * energy * (kind > 5.5 ? 0.05 : 1.15 * load)
      * mix(1.0, 1.2, lit);
    ext = mix(ext, mix(2.4, 3.6, prominence), uLight * step(kind, 5.5));
    // A soft ring of ink round a dense core reads as a burn: by day a bright
    // point keeps a clean edge and a fine cross.
    halo *= 1.0 - uLight;
    spike *= mix(1.0, 0.6, uLight);
    day = min(day, 1.25);

    vec3 nightColor = mix(starColor(s, temperature), vec3(1.0), 0.3 * prominence) * night;
    float seal = kind > 1.5 && kind < 2.5 ? uSignature : 0.0;
    vec3 dayColor = inkColor(s, temperature, aSeed.w, seal) * day;
    vColor = mix(nightColor, dayColor, uLight) * uGain;
    vHot = night * prominence * 0.7 * (1.0 - uLight) * uGain;

    float reach = mix(ext, 1.18, bokeh);
    vShape = vec4(reach, halo, spike, bokeh);
    vEdge = vec2(drawn, soft);
    vUv = position.xy;
    vStreak = vec3(1.0, 0.0, 0.0);

    float size = drawn * reach;
    vec2 corner = px + position.xy * size;
    // Nothing to draw: collapse the quad instead of rasterising it.
    float visible = step(0.0008, max(night, day * uLight));
    gl_Position = vec4(corner / (uResolution * 0.5) * visible, 0.0, 1.0);
    if (visible < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vHot;
  varying vec4 vShape;
  varying vec2 vEdge;
  // A point in motion is drawn as a short streak: xy is the screen direction
  // of the quad's long axis, z the half length of the streak in quad units.
  varying vec3 vStreak;

  void main() {
    // Distance from the streak's segment, not its centre: at rest the
    // segment is a point and this is the plain radial profile.
    vec2 q = vUv;
    q.x = sign(q.x) * max(0.0, abs(q.x) - vStreak.z);
    float d2 = dot(q, q);
    if (d2 > 1.0) discard;
    float d = sqrt(d2);
    float x = d * vShape.x;
    // In focus, a point is a disc with one device pixel of feather: crisp at
    // any size and any pixel ratio, with only a breath of skirt. Where depth
    // or size softens it, it opens into a gaussian.
    float feather = clamp(0.75 / vEdge.x, 0.05, 0.9);
    float pip = 1.0 - smoothstep(1.0 - feather, 1.0 + feather, x);
    float gauss = exp(-x * x * 0.5);
    float core = mix(1.4 * pip + 0.1 * gauss, gauss, vEdge.y);
    float halo = vShape.y * exp(-x * 0.62);
    // Spikes stay on the screen's axes whichever way the streak runs.
    vec2 a = abs(vStreak.xy * q.x + vec2(-vStreak.y, vStreak.x) * q.y);
    float spike = vShape.z * 0.42 * (
      exp(-a.y * vShape.x * 1.5) * exp(-a.x * 4.2) +
      exp(-a.x * vShape.x * 1.5) * exp(-a.y * 4.2));
    float disc = smoothstep(1.0, 0.84, d) * (0.55 + 0.45 * d2) * 2.0;
    float glow = mix(core + halo + spike, disc, vShape.w);
    // Fade to nothing at the quad's edge, whatever the profile.
    glow *= 1.0 - smoothstep(0.72, 1.0, d);
    gl_FragColor = vec4(vColor * glow + vec3(vHot * core), 1.0);
  }
`;

/**
 * The deep sky's stars: one camera-facing quad each, placed in a wrapping
 * tile that the camera pans across. Nearer stars move further for the same
 * pan, scroll or pointer travel, which is what gives the field its depth.
 * Shares PARTICLE_FRAGMENT with the figure, so a star of the sky and a star
 * of the rose are drawn the same way.
 */
export const SKY_VERTEX = /* glsl */ `
  #define TAU 6.28318530718

  attribute vec4 aParam;
  attribute vec4 aSeed;
  attribute vec4 aLook;

  uniform vec2 uResolution;
  uniform vec2 uView;
  uniform float uDpr;
  uniform float uTile;
  uniform vec2 uOffset;
  uniform float uTime;
  uniform float uMotion;
  uniform float uLight;
  uniform float uGain;
  uniform float uLevel;
  uniform vec4 uQuiet;
  // The camera's travel: velocity (CSS px/s for the nearest layer, screen
  // axes, y down) times the exposure, and the forward push of a page change
  // about a focal point (CSS px from the top left).
  uniform vec2 uSmear;
  uniform vec3 uPush;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vHot;
  varying vec4 vShape;
  varying vec2 vEdge;
  varying vec3 vStreak;

  void main() {
    float depth = aParam.z;
    float bright = aLook.x;
    float temperature = aLook.z;

    // Where the tile puts the star on screen, in CSS px from the top left.
    vec2 s = mod(aParam.xy * uTile - uOffset * depth, uTile) - ${SKY_MARGIN.toFixed(1)};
    // Travelling into a new page, nearer stars stream outward further.
    s = uPush.xy + (s - uPush.xy) * (1.0 + uPush.z * depth);
    vec2 px = vec2(s.x - uView.x * 0.5, uView.y * 0.5 - s.y) * uDpr;

    // Behind a text column the sky is calmer: dimmer, it holds still, and no
    // star there is bright enough to flare between the lines.
    float column = 1.0 - smoothstep(uQuiet.y, uQuiet.y + uQuiet.z, abs(px.x - uQuiet.x));
    column *= step(0.001, uQuiet.w);
    float calm = uQuiet.w * column;
    bright = mix(bright, min(bright, 0.55), column);

    // Scintillation comes and goes: a quick flicker under a slow swell, so
    // only a few stars are visibly twinkling at any moment.
    float swell = smoothstep(0.2, 1.0, sin(uTime * (0.09 + 0.16 * aSeed.z) + aSeed.w * TAU));
    float flicker = sin(uTime * (0.8 + 2.1 * aSeed.x) + aSeed.y * TAU);
    float twinkle = 1.0 + aLook.w * uMotion * swell * flicker * (1.0 - column);

    float prominence = smoothstep(1.1, 6.5, bright);
    float star = smoothstep(0.95, 1.15, aLook.y);
    float core = aLook.y * uDpr * mix(1.0, 1.12, uLight);
    float floorPx = mix(0.62, 0.8, smoothstep(1.0, 2.0, uDpr));
    float drawn = max(core, floorPx);
    float energy = (core * core) / (drawn * drawn);
    float soft = smoothstep(1.1, 2.2, drawn / uDpr) * mix(1.0, 0.3, uLight);

    float ext = mix(2.4, mix(5.0, 9.0, prominence), star);
    float halo = star * mix(0.05, 0.16, prominence);
    float spike = smoothstep(4.0, 7.5, bright);
    // In print a star is a clean dot, a bright one with a fine cross; a soft
    // ring of ink round a dark core reads as a burn, not a star.
    ext = mix(ext, mix(2.4, 4.2, prominence), uLight);
    halo *= 1.0 - uLight;
    spike *= mix(1.0, 0.7, uLight);

    float alpha = uLevel * (1.0 - calm);

    // Moving fast, a point smears along its path: the exposure of one frame.
    // Nearer stars travel further and streak longer; the light spreads over
    // the streak rather than adding to it.
    vec2 smear = vec2(uSmear.x, -uSmear.y) * depth * uDpr;
    float run = min(length(smear), 26.0 * uDpr);
    vec2 axis = run > 1e-3 ? normalize(smear) : vec2(1.0, 0.0);
    float reach = 0.5 * run;
    float spread = drawn / (drawn + reach);

    // Night: cool blue-white through to warm, the band's own stars blushed.
    float w = clamp(0.5 + temperature * 0.35, 0.0, 1.0);
    vec3 night = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.86, 0.74), smoothstep(0.2, 0.8, w));
    night = mix(night, vec3(1.0, 0.62, 0.38), step(1.5, temperature));
    night = mix(night, vec3(0.42, 0.56, 1.0), step(1.5, -temperature));
    night = mix(night, vec3(1.0, 0.8, 0.9), 0.3 * aParam.w);
    night = mix(night, vec3(1.0), 0.3 * prominence);
    float glow = bright * alpha * energy * twinkle * spread;

    // Day: a star atlas in cobalt. The field is printed as clean cobalt
    // points, the brightest in deep indigo, the band's and the warm ones in
    // violet, the cool ones in ultramarine; the unresolved dust is left
    // unprinted except as a fine violet grain along the band. Every ink
    // keeps its blue channel open, so even the darkest point is a saturated
    // blue, never black. (Red specks on white read as confetti, not stars.)
    vec3 ink = mix(vec3(2.9, 2.4, 0.32), vec3(3.2, 3.0, 0.75), prominence);
    ink = mix(ink, vec3(1.7, 2.6, 0.38), aParam.w * 0.85);
    ink = mix(ink, vec3(1.35, 2.5, 0.4), step(1.5, temperature));
    ink = mix(ink, vec3(2.8, 1.75, 0.22), step(1.5, -temperature));
    float printed = mix(smoothstep(0.14, 0.42, bright), 0.55 * smoothstep(0.03, 0.16, bright), aParam.w * step(bright, 0.24));
    float speck = min(1.15, pow(bright, 0.9) * 1.3) * printed * alpha * energy * spread;

    vColor = mix(night * glow, ink * speck, uLight) * uGain;
    vHot = glow * prominence * 0.7 * (1.0 - uLight) * uGain;
    vShape = vec4(ext, halo, spike, 0.0);
    vEdge = vec2(drawn, soft);

    float size = drawn * ext;
    vec2 side = vec2(-axis.y, axis.x);
    vec2 corner = px + axis * position.x * (size + reach) + side * position.y * size;
    vUv = vec2(position.x * (size + reach) / size, position.y);
    vStreak = vec3(axis, reach / size);

    float visible = step(0.0008, max(glow * (1.0 - uLight), speck * uLight));
    gl_Position = vec4(corner / (uResolution * 0.5), 0.0, 1.0);
    if (visible < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

/**
 * The nebula, rendered small and drawn smooth. One band of glowing gas
 * crosses the sky: a broad cool glow, a rose-violet body with a brighter
 * spine, and dark lanes of dust across it. By day the same shapes are a
 * thin wash of ink on the paper. The target stores emission (night) or
 * absorbance (day), divided by uRange.
 */
export const NEBULA_FRAGMENT = /* glsl */ `
  #define TAU 6.28318530718
  #define PI 3.14159265359

  // The target covers the view and a margin round it, so small moves of the
  // sky are a shift of this texture rather than a fresh render.
  uniform vec2 uArea;
  uniform float uMargin;
  uniform float uTile;
  uniform vec2 uOffset;
  uniform vec2 uMorph;
  uniform float uLight;
  uniform float uLevel;
  uniform float uRange;
  varying vec2 vUv;

  ${BAND_GLSL}

  vec2 gradient(vec2 cell, vec2 period) {
    cell = mod(cell, period);
    float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) * TAU;
    return vec2(cos(a), sin(a));
  }

  // Gradient noise that wraps every 'period' cells on each axis.
  float noise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(gradient(i, period), f);
    float b = dot(gradient(i + vec2(1.0, 0.0), period), f - vec2(1.0, 0.0));
    float c = dot(gradient(i + vec2(0.0, 1.0), period), f - vec2(0.0, 1.0));
    float d = dot(gradient(i + vec2(1.0, 1.0), period), f - vec2(1.0, 1.0));
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
  }

  // Five octaves at whole frequencies per axis, so it wraps with the tile;
  // about 0..1. Unequal frequencies stretch it into streaks.
  float fbm(vec2 p, vec2 frequency) {
    float sum = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(0.0);
    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise(p * frequency + shift, frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
      shift += vec2(7.31, 3.17);
    }
    return clamp(0.5 + sum * 1.1, 0.0, 1.0);
  }

  void main() {
    vec2 s = vec2(vUv.x, 1.0 - vUv.y) * uArea - uMargin;
    vec2 u = fract((s + ${SKY_MARGIN.toFixed(1)} + uOffset) / uTile);

    // Band coordinates: along the band, and across it (with its wander).
    // Whole-number combinations of the tile's axes, so they wrap with it.
    vec2 ab = vec2(u.x - u.y, u.x + u.y + bandWarp(u));
    float across = sin(PI * ab.y);
    float a2 = across * across;
    float spine = exp(-a2 / 0.012);
    float band = exp(-a2 / 0.055);
    float glow = exp(-a2 / 0.32);

    // The gas churns slowly: its folds are pushed around by a field that
    // itself drifts across the tile.
    vec2 fold = vec2(
      fbm(ab + uMorph, vec2(2.0)),
      fbm(ab - uMorph.yx + 0.37, vec2(2.0))) - 0.5;
    float cloud = fbm(ab + fold * 0.12, vec2(4.0));
    float detail = fbm(ab + fold * 0.2, vec2(12.0));
    // Filaments and rifts run with the band, as dust lanes do.
    float streak = fbm(ab + fold * 0.08, vec2(3.0, 16.0));
    float ridge = 1.0 - abs(2.0 * streak - 1.0);
    ridge *= ridge * ridge;
    float lanes = smoothstep(0.5, 0.7, fbm(ab + fold * 0.22 + 0.61, vec2(4.0, 20.0)));

    float body = pow(cloud, 1.4) * (0.5 + 1.0 * ridge) * (0.7 + 0.6 * detail);
    float density = glow * (0.16 + 0.42 * cloud) * 0.3
      + band * body
      + spine * cloud * (0.35 + 1.1 * ridge);
    density *= 1.0 - 0.86 * lanes * smoothstep(0.05, 0.6, band);
    // Knots: small bright clumps along the body, where the gas is lit from
    // within.
    float knot = band * cloud * smoothstep(0.64, 0.86, detail) * (1.0 - lanes);

    // Cool at the edges, rose-violet in the body, warm in the knots.
    float heat = band * cloud;
    vec3 night = mix(vec3(0.1, 0.2, 1.0), vec3(0.46, 0.27, 1.0), smoothstep(0.08, 0.42, heat));
    night = mix(night, vec3(1.0, 0.33, 0.62), smoothstep(0.34, 0.8, heat));
    night = night * density + vec3(1.0, 0.62, 0.62) * knot * 0.9;

    // By day, a watercolour of light rather than a smudge of grey: periwinkle
    // at the edges, lilac in the body, rose where it is densest. Each wash
    // takes red and green but leaves the blue channel almost untouched, which
    // is what keeps it clear and luminous on the white instead of muddy.
    vec3 day = mix(vec3(0.56, 0.4, 0.015), vec3(0.34, 0.6, 0.03), smoothstep(0.1, 0.5, heat));
    day = mix(day, vec3(0.1, 0.56, 0.2), smoothstep(0.45, 0.85, heat));
    day = day * density + vec3(0.06, 0.5, 0.22) * knot * 0.7;

    vec3 value = mix(night, day, uLight) * uLevel;
    gl_FragColor = vec4(clamp(value / uRange, 0.0, 1.0), 1.0);
  }
`;

export const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * The one full-screen pass. The particle buffer holds emitted light at night
 * and ink absorbance by day; only the transfer function differs.
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tNebula;
  uniform vec2 uNebulaSize;
  // Where this frame's view falls in the (possibly older, larger) nebula
  // target: uv * xy + zw; and the push about a focal point (xy in uv, z the
  // scale), the same push the stars take, at the nebula's depth.
  uniform vec4 uNebulaMap;
  uniform vec3 uNebulaPush;
  uniform float uNebulaRange;
  uniform vec4 uQuiet;
  uniform float uBloom;
  uniform float uBleed;
  uniform float uInk;
  uniform float uLight;
  uniform float uExposure;
  uniform float uGain;
  uniform vec3 uNight;
  uniform vec3 uPaper;
  uniform vec3 uAir;
  uniform vec3 uGlow;
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;

  // Stephen Hill's ACES fit: highlights roll off toward white, not clip.
  vec3 fit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 inputMatrix = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 outputMatrix = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    return clamp(outputMatrix * fit(inputMatrix * color), 0.0, 1.0);
  }
  vec3 encode(vec3 linear) {
    return mix(
      linear * 12.92,
      pow(linear, vec3(0.41666)) * 1.055 - 0.055,
      step(vec3(0.0031308), linear));
  }
  // Cubic B-spline filtering from four bilinear taps: the small nebula
  // target upscales without the diamond pattern of plain bilinear.
  vec3 smoothSample(sampler2D tex, vec2 uv, vec2 size) {
    vec2 st = uv * size - 0.5;
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
    vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
    vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
    vec2 w3 = f3 / 6.0;
    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 h0 = (i - 0.5 + w1 / g0) / size;
    vec2 h1 = (i + 1.5 + w3 / g1) / size;
    return g0.y * (g0.x * texture2D(tex, h0).rgb + g1.x * texture2D(tex, vec2(h1.x, h0.y)).rgb)
      + g1.y * (g0.x * texture2D(tex, vec2(h0.x, h1.y)).rgb + g1.x * texture2D(tex, h1).rgb);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb * uGain;
    vec3 bloom = texture2D(tBloom, vUv).rgb * uGain;

    // A breath of air around the figure lifts it off the black.
    vec2 fromGlow = (gl_FragCoord.xy - uResolution * 0.5 - uGlow.xy) / max(uGlow.z, 1.0);
    float air = exp(-dot(fromGlow, fromGlow));

    // The nebula, calmer behind the text column, and never so bright there
    // that muted text loses its contrast: by night its light is capped, by
    // day its ink.
    vec2 nebulaUv = uNebulaPush.xy + (vUv - uNebulaPush.xy) / uNebulaPush.z;
    vec3 nebula = smoothSample(tNebula, nebulaUv * uNebulaMap.xy + uNebulaMap.zw, uNebulaSize) * uNebulaRange;
    float column = 1.0 - smoothstep(uQuiet.y, uQuiet.y + uQuiet.z, abs(gl_FragCoord.x - uQuiet.x));
    column *= step(0.001, uQuiet.w);
    nebula *= 1.0 - uQuiet.w * column;
    float strength = dot(nebula, vec3(0.2126, 0.7152, 0.0722));
    float cap = mix(1.0, mix(0.012, 0.05, uLight), column);
    nebula *= min(1.0, cap / max(strength, 1e-5));

    vec3 night = uNight + uAir * air + nebula + aces((scene + bloom * uBloom) * uExposure);
    // By day the paper is lit like porcelain: even across the middle, the far
    // corners a breath cooler, which gives the white some depth.
    vec2 fromMiddle = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float corner = smoothstep(0.5, 1.3, length(fromMiddle));
    vec3 paper = uPaper * (1.0 - corner * vec3(0.05, 0.036, 0.004));
    vec3 day = paper * exp(-(scene * uInk + bloom * uBleed + nebula));
    vec3 color = encode(clamp(mix(night, day, uLight), 0.0, 1.0));

    // Triangular dither keeps the soft gradients free of banding.
    float n = hash(gl_FragCoord.xy + fract(uTime) * 61.7)
      + hash(gl_FragCoord.xy * 1.37 + 17.0 + fract(uTime) * 23.1) - 1.0;
    gl_FragColor = vec4(color + n / 255.0, 1.0);
  }
`;
