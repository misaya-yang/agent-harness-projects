import {
  AddEquation,
  Camera,
  Color,
  CustomBlending,
  DataTexture,
  Euler,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferAttribute,
  LinearFilter,
  Mesh,
  NoBlending,
  OneFactor,
  Quaternion,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { BloomPyramidPass } from "./bloomPyramid";
import { buildParticles } from "./particles";
import { RenderQuality } from "./quality";
import {
  FORM_KEYS,
  formForPath,
  hashPath,
  mulberry32,
  normalizePath,
  openingAt,
  outerRadius,
  type RoseForm,
} from "./roseForm";
import {
  COMPOSITE_FRAGMENT,
  NEBULA_FRAGMENT,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  QUAD_VERTEX,
  SKY_VERTEX,
  TRAIL_SAMPLES,
} from "./shaders";
import { COVERED_ATTRIBUTE, DEPART_EVENT } from "@/lib/skyEvents";
import { SkyFlight, pageLevel } from "./flight";
import { NEBULA_DEPTH, buildSky, panThrough, skyShare, skyTile } from "./sky";
import { TurnMotion } from "./turnMotion";

/** Page colours behind the field. Keep in sync with styles/starfield.css. */
export const NIGHT_SKY = "#181818";
export const DAY_PAPER = "#f5f7fc";

/** Where a page wants its figure: the box's inscribed circle is the footprint. */
export const ANCHOR_SELECTOR = "[data-rose-anchor]";
/** A text column the sky stays out of. */
export const QUIET_SELECTOR = "[data-rose-quiet]";


const KEY_TURN = Math.PI / 12;
const INTRO_SECONDS = 4.2;
/** A press becomes a drag once it has travelled this far, in CSS pixels. */
const DRAG_SLOP = 4;
/** Things a press belongs to before it belongs to the rose. */
const INTERACTIVE =
  "a,button,input,textarea,select,summary,label,[role='button'],[contenteditable='true'],[data-rose-ignore]";
/** How quickly each point of the pointer's chain closes on the one ahead. */
const CHAIN_RATES = [24, 12, 8.5, 6.4, 5];
const CHAIN_WEIGHTS = [0.5, 0.42, 0.34, 0.26, 0.18];
/** The sky drifts along its band, in CSS px per second for the nearest stars. */
const SKY_DRIFT = { x: 0.9, y: -0.9 };
/** Scrolling moves the nearest stars at this share of the page's speed. */
const SKY_SCROLL = 0.2;
/** A sky with nothing else moving twinkles at this rate, not the display's. */
const SKY_FPS = 30;
/** Nebula emission (night) or absorbance (day) that fills its 8-bit target. */
const NEBULA_RANGE = 0.1;
const NEBULA_RANGE_DAY = 0.26;
/** Nebula strength: emitted light at night, ink absorbance by day. */
const NEBULA_NIGHT = 0.03;
const NEBULA_DAY = 0.25;
/** How much a text column calms each layer: [wide screens, phones]. */
const QUIET_FIGURE = 0.86;
const QUIET_STARS = [0.62, 0.35];
const QUIET_NEBULA = [0.58, 0.25];
/**
 * A scroll this far in one frame is a jump (a new page starting at its top,
 * a restored position), not a scroll: it is folded into the pan so the sky
 * does not cut.
 */
const SCROLL_JUMP = 480;
/** Exposure of one frame, in seconds: how long a moving star smears. */
const SHUTTER = 1 / 110;
/**
 * The forward push of a page change, as a share of the nearest stars'
 * distance from the focal point: going deeper (home → index → note), across,
 * or back up.
 */
const PUSH = { deeper: 0.075, across: 0.05, up: 0.032 };
/** The nebula target reaches this share of the view past each edge. */
const NEBULA_REACH = 0.14;
/** Even at rest the gas churns; it is re-rendered at least this often. */
const NEBULA_REFRESH_MS = 700;

/** Whether the element itself carries text a reader might want to select. */
const hasOwnText = (element: Element | null) => {
  for (let node = element?.firstChild; node; node = node.nextSibling)
    if (node.nodeType === 3 && node.nodeValue?.trim()) return true;
  return false;
};

export interface StarfieldOptions {
  light: boolean;
  reducedMotion: boolean;
  page: string;
}

export interface StarfieldHandle {
  setTheme(light: boolean): void;
  setPage(path: string): void;
  setPaused(paused: boolean): void;
  handleKey(event: KeyboardEvent): void;
  dispose(): void;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
/** Frame-rate independent approach of `value` toward `target`. */
const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

export function createStarfield(
  host: HTMLElement,
  options: StarfieldOptions
): StarfieldHandle {
  const reduced = options.reducedMotion;
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "default",
  });
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.dataset.starfield = "true";
  // The buffer is sized in device pixels; the element always spans the host.
  // Left to its intrinsic size a canvas shows its buffer scaled up.
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(canvas);

  // Light adds up beyond 1 before tone mapping, so the buffer is half-float
  // where the device can render to one.
  const hdr =
    renderer.extensions.has("EXT_color_buffer_float") ||
    renderer.extensions.has("EXT_color_buffer_half_float");
  const gain = hdr ? 1 : 0.2;

  const particles = buildParticles();
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      3
    )
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute(
    "aParam",
    new InstancedBufferAttribute(particles.param, 4)
  );
  geometry.setAttribute(
    "aSeed",
    new InstancedBufferAttribute(particles.seed, 4)
  );
  geometry.setAttribute(
    "aLook",
    new InstancedBufferAttribute(particles.look, 4)
  );
  geometry.instanceCount = particles.count;

  const trail = Array.from(
    { length: TRAIL_SAMPLES },
    () => new Vector4(0, 0, 0, 1)
  );
  const trailVelocity = Array.from(
    { length: TRAIL_SAMPLES },
    () => new Vector2()
  );
  // The chain itself, in CSS pixels.
  const chain = Array.from({ length: TRAIL_SAMPLES }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    energy: 0,
  }));
  let chainPlaced = false;

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uDpr: { value: 1 },
    uCenter: { value: new Vector2() },
    uRadius: { value: 100 },
    uQuatHeart: { value: new Quaternion() },
    uQuatRim: { value: new Quaternion() },
    uPresence: { value: 0 },
    uDisperse: { value: 0 },
    uGrow: { value: reduced ? 1 : 0 },
    uOpen: { value: reduced ? 1 : 0 },
    uWrite: { value: reduced ? 1.1 : 0 },
    uPen: { value: -1 },
    uBreath: { value: 0 },
    uFlow: { value: 0.0013 },
    uLight: { value: options.light ? 1 : 0 },
    uGain: { value: gain },
    uTurns: { value: 4 },
    uPetals: { value: 3.6 },
    uOpenOuter: { value: 1.6 },
    uOpenInner: { value: 0.46 },
    uNotch: { value: 0.46 },
    uRuffle: { value: 1 },
    uDepth: { value: 0.8 },
    uInnerLength: { value: 0.62 },
    uTwist: { value: 0 },
    uSignature: { value: 1 },
    uWarmth: { value: 0 },
    uScriptZ: { value: 0.2 },
    uQuiet: { value: new Vector4(0, 0, 1, 0) },
    uTrail: { value: trail },
    uTrailVel: { value: trailVelocity },
    uPointer: { value: new Vector3() },
    uFocus: { value: 0.12 },
    uAperture: { value: 0.0022 },
  };
  const material = new ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  // The deep sky: its own stars, drawn with the figure's fragment shader.
  const sky = buildSky();
  const skyGeometry = new InstancedBufferGeometry();
  skyGeometry.setAttribute("position", geometry.getAttribute("position"));
  skyGeometry.setIndex(geometry.getIndex());
  skyGeometry.setAttribute(
    "aParam",
    new InstancedBufferAttribute(sky.param, 4)
  );
  skyGeometry.setAttribute("aSeed", new InstancedBufferAttribute(sky.seed, 4));
  skyGeometry.setAttribute("aLook", new InstancedBufferAttribute(sky.look, 4));
  skyGeometry.instanceCount = 0;
  const skyUniforms = {
    uResolution: uniforms.uResolution,
    uDpr: uniforms.uDpr,
    uView: { value: new Vector2(1, 1) },
    uTile: { value: 2000 },
    uOffset: { value: new Vector2() },
    uTime: uniforms.uTime,
    uMotion: { value: reduced ? 0 : 1 },
    uLight: uniforms.uLight,
    uGain: uniforms.uGain,
    uLevel: { value: 1 },
    uQuiet: { value: new Vector4(0, 0, 1, 0) },
    uSmear: { value: new Vector2() },
    uPush: { value: new Vector3() },
  };
  const skyMaterial = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: skyUniforms,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const skyMesh = new Mesh(skyGeometry, skyMaterial);
  skyMesh.frustumCulled = false;

  const scene = new Scene();
  scene.add(skyMesh);
  scene.add(mesh);
  const camera = new Camera();

  // The nebula is soft, so it is rendered small and filtered up.
  const nebulaTarget = new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const nebulaUniforms = {
    uArea: { value: new Vector2(1, 1) },
    uMargin: { value: 0 },
    uTile: skyUniforms.uTile,
    uOffset: { value: new Vector2() },
    uMorph: { value: new Vector2() },
    uLight: uniforms.uLight,
    uLevel: { value: NEBULA_NIGHT },
    uRange: { value: NEBULA_RANGE },
  };
  const nebula = new FullScreenQuad(
    new ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      uniforms: nebulaUniforms,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    })
  );

  const target = new WebGLRenderTarget(1, 1, {
    type: hdr ? HalfFloatType : UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const bloom = new BloomPyramidPass({
    levels: 4,
    resolutionScale: 0.42,
    threshold: 0.9,
    knee: 0.8,
    radius: 0.62,
    strength: 1,
  });
  bloom.pyramidOnly = true;
  const black = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;

  const compositeUniforms = {
    tScene: { value: target.texture },
    tBloom: { value: black as DataTexture | WebGLRenderTarget["texture"] },
    tNebula: { value: nebulaTarget.texture },
    uNebulaSize: { value: new Vector2(1, 1) },
    uNebulaMap: { value: new Vector4(1, 1, 0, 0) },
    uNebulaPush: { value: new Vector3(0.5, 0.5, 1) },
    uNebulaRange: { value: NEBULA_RANGE },
    uQuiet: { value: new Vector4(0, 0, 1, 0) },
    uBloom: { value: 0.40 },
    uBleed: { value: 0.085 },
    uInk: { value: 1.2 },
    uLight: { value: options.light ? 1 : 0 },
    uExposure: { value: 0.9 },
    uGain: { value: 1 / gain },
    uNight: { value: new Color(NIGHT_SKY) },
    uPaper: { value: new Color(DAY_PAPER) },
    uAir: { value: new Color(0.012, 0.02, 0.042) },
    uGlow: { value: new Vector3(0, 0, 1) },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
  };
  const composite = new FullScreenQuad(
    new ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: compositeUniforms,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    })
  );

  // --- State ---------------------------------------------------------------
  const quality = new RenderQuality();
  const turn = new TurnMotion();
  const home = new Quaternion();
  const homeEuler = new Euler();
  let width = 1;
  let height = 1;
  let dpr = 1;
  let time = 0;
  // Start with the petals already visible, then let them finish opening.
  let intro = reduced ? INTRO_SECONDS : 1.4;
  let light = options.light ? 1 : 0;
  let lightTarget = light;
  let paused = false;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let last = 0;
  let dirty = true;
  let page = normalizePath(options.page);
  let form: RoseForm = { ...formForPath(page) };
  let formTarget: RoseForm = formForPath(page);

  // The figure's place on the page, in document CSS pixels. Position and
  // size glide on a critically damped spring, so a figure moving between
  // pages sets off and lands without a jolt.
  const place = { x: 0, y: 0, size: 0, follow: 1, level: 1 };
  const placeTarget = { x: 0, y: 0, size: 0, follow: 1, level: 1 };
  const placeVelocity = { x: 0, y: 0, size: 0 };
  let placed = false;
  let anchor: HTMLElement | null = null;
  // An anchor the layout has hidden (display: none) asks for no figure.
  let anchorShown = false;
  let anchorMissingSince = 0;
  let presence = 0;
  let quiet: HTMLElement | null = null;
  const quietBox = { x: 0, half: 0, strength: 0 };
  let quietStrength = 0;

  // The sky: the camera's pan across its tile. A page change flies it to the
  // new page's view along one smooth curve (flight.ts).
  let tile = 2000;
  let tileSet = false;
  const flight = new SkyFlight();
  let panSet = false;
  // Scroll jumps folded into the pan since the last page change, in pan px.
  let folded = 0;
  let lastScrollY = 0;
  let scrollSeen = false;
  let scrollVelocity = 0;
  let pageChangedAt = -Infinity;
  // Where along the band this page looks, in pan px; chosen once per page.
  let pageAlong: number | null = null;
  // The forward push of a page change, and where it pushes from.
  let push = 0;
  let pushAmount = PUSH.across;
  let departedAt = -Infinity;
  const focal = { x: 0, y: 0 };
  const smear = new Vector2();
  let covered = root().hasAttribute(COVERED_ATTRIBUTE);
  // What the nebula target was last rendered for.
  const nebulaDrawn = {
    valid: false,
    x: 0,
    y: 0,
    at: 0,
    level: -1,
    light: -1,
    margin: 0,
  };
  let nebulaRenders = 0;
  let skyLive = false;
  let lastDraw = 0;
  let draws = 0;
  let liveReasons: Record<string, boolean> = {};
  const startedAt = performance.now();

  const pointer = { x: 0, y: 0, seen: false, fine: true, moved: -100 };
  const parallax = new Vector2();
  let pointerLight = 0;
  let hover = 0;
  // 1 at a page change, easing to 0: the figure loosens and gathers again.
  let turnOver = 0;
  let wakeGate = 1;
  let swayEase = 1;
  // A press on the artwork; it turns the rose once it has clearly moved.
  let press: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    turning: boolean;
  } | null = null;
  let grabbable = false;
  function root() {
    return host.ownerDocument.documentElement;
  }

  const invalidate = () => {
    dirty = true;
    schedule();
  };

  // --- Layout --------------------------------------------------------------
  const measure = () => {
    if (!anchor || !anchor.isConnected)
      anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR);
    anchorShown = false;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        anchorShown = true;
        placeTarget.level = Number(anchor.dataset.rosePresence ?? 1) || 1;
        placeTarget.x = rect.left + rect.width / 2 + window.scrollX;
        placeTarget.y = rect.top + rect.height / 2 + window.scrollY;
        placeTarget.size = Math.min(rect.width, rect.height);
        placeTarget.follow = Number(anchor.dataset.roseFollow ?? 1) || 1;
        if (!placed) {
          Object.assign(place, placeTarget);
          placed = true;
        }
      }
    }
    aimSky();
    if (!quiet || !quiet.isConnected)
      quiet = document.querySelector<HTMLElement>(QUIET_SELECTOR);
    if (quiet) {
      const rect = quiet.getBoundingClientRect();
      quietBox.x = rect.left + rect.width / 2 - width / 2;
      quietBox.half = rect.width / 2;
      quietBox.strength = 1;
    } else quietBox.strength = 0;
    invalidate();
  };

  /**
   * Where this page looks into the sky. The band runs through the page's
   * figure, or through a point of the page's own toward the upper right,
   * and the view slides a little along the band from page to page.
   */
  function aimSky() {
    const random = mulberry32(hashPath(page) ^ 0x9e3779b9);
    if (pageAlong === null) pageAlong = (random() - 0.5) * 0.5 * tile;
    else random();
    const along = pageAlong;
    const ownX = width * (0.7 + 0.22 * random());
    const ownY = 60 + 200 * random();
    const cx = anchorShown ? placeTarget.x : ownX;
    const cy = anchorShown ? placeTarget.y : ownY;
    focal.x = Math.min(width, Math.max(0, cx));
    focal.y = Math.min(height, Math.max(0, cy));
    const from = panSet
      ? { x: flight.targetX, y: flight.targetY }
      : { x: flight.x, y: flight.y };
    const next = panThrough(cx, cy, along, tile, from);
    const now = performance.now();
    // The first view, and any view without motion, is taken at once.
    if (!panSet || reduced || paused || now - startedAt < 1500) {
      flight.jump(next.x, next.y);
      panSet = true;
    } else flight.aim(next.x, next.y, now);
  }

  /**
   * Scroll jumps since the last page change live in `folded`; a new page
   * takes them into its pan before choosing its view, so the trip starts
   * from what is on screen and finds the nearest way to the new view.
   */
  function foldScroll() {
    if (!folded) return;
    flight.shift(0, folded);
    // The page's place along the band moves with the frame, so a fold that
    // lands after the trip is planned does not shorten it.
    if (pageAlong !== null) pageAlong -= folded / 2;
    folded = 0;
  }

  const resize = () => {
    // The host's own box, not the window: a scrollbar narrows the page, and
    // a buffer sized for the window would be squeezed into it and resampled.
    width = Math.max(1, host.clientWidth || window.innerWidth);
    height = Math.max(1, host.clientHeight || window.innerHeight);
    const compact = width < 720;
    dpr = quality.pixelRatio(window.devicePixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    const size = renderer.getDrawingBufferSize(new Vector2());
    target.setSize(size.x, size.y);
    bloom.setSize(size.x, size.y);
    uniforms.uResolution.value.copy(size);
    uniforms.uDpr.value = size.x / width;
    compositeUniforms.uResolution.value.copy(size);
    // Small screens draw a share of the dust; the signature stays whole.
    const share = compact ? 0.56 : 1;
    geometry.instanceCount =
      particles.fixed + Math.floor((particles.count - particles.fixed) * share);

    // The sky's tile keeps its size through small changes, such as a phone's
    // address bar coming and going, so its stars stay put.
    const ideal = skyTile(width, height);
    if (
      !tileSet ||
      tile < Math.max(width, height) + 120 ||
      ideal < tile * 0.75
    ) {
      tile = ideal;
      tileSet = true;
      panSet = false;
      pageAlong = null;
    }
    skyUniforms.uTile.value = tile;
    skyUniforms.uView.value.set(width, height);
    skyGeometry.instanceCount = skyShare(tile);
    // The nebula target covers the view and a margin round it, at about a
    // third of the CSS size: the gas is soft, and it is filtered up.
    const margin = Math.round(NEBULA_REACH * Math.max(width, height));
    const areaWidth = width + 2 * margin;
    const areaHeight = height + 2 * margin;
    const nebulaScale = Math.min(1 / 3, 720 / areaWidth);
    nebulaTarget.setSize(
      Math.max(64, Math.round(areaWidth * nebulaScale)),
      Math.max(64, Math.round(areaHeight * nebulaScale))
    );
    nebulaUniforms.uArea.value.set(areaWidth, areaHeight);
    nebulaUniforms.uMargin.value = margin;
    nebulaDrawn.valid = false;
    nebulaDrawn.margin = margin;
    compositeUniforms.uNebulaSize.value.set(
      nebulaTarget.width,
      nebulaTarget.height
    );
    measure();
  };

  const bodyObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  bodyObserver?.observe(document.body);
  let observedOnce = false;
  const hostObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          // The first callback only reports the size already measured.
          if (observedOnce) resize();
          observedOnce = true;
        })
      : null;
  hostObserver?.observe(host);

  // --- Input ---------------------------------------------------------------
  const toField = (clientX: number, clientY: number, out: Vector2) =>
    out.set(
      (clientX - width / 2) * uniforms.uDpr.value,
      (height / 2 - clientY) * uniforms.uDpr.value
    );
  const scratch = new Vector2();

  /** Whether a viewport point lies on the visible artwork. */
  const overFigure = (clientX: number, clientY: number) => {
    if (!placed || presence < 0.3) return false;
    const x = place.x - window.scrollX;
    const y = place.y - window.scrollY * place.follow;
    return Math.hypot(clientX - x, clientY - y) <= place.size * 0.52;
  };
  /**
   * Whether a press on this element is the rose's to take. The page's own
   * box for the figure always is; elsewhere over the artwork, anything
   * interactive or textual keeps its press.
   */
  const yields = (element: Element | null, touch: boolean) => {
    if (!element?.closest) return false;
    if (element.closest(ANCHOR_SELECTOR)) return true;
    // Touch scrolls the page except where the page says otherwise.
    if (touch) return false;
    return !element.closest(INTERACTIVE) && !hasOwnText(element);
  };
  const setGrabbable = (next: boolean) => {
    if (next === grabbable) return;
    grabbable = next;
    if (next) root().setAttribute("data-rose-hover", "true");
    else root().removeAttribute("data-rose-hover");
  };

  const onPointerMove = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) {
      if (!press.turning) {
        const far =
          Math.hypot(
            event.clientX - press.startX,
            event.clientY - press.startY
          ) > DRAG_SLOP;
        if (!far) return;
        press.turning = true;
        press.x = event.clientX;
        press.y = event.clientY;
        turn.begin();
        root().setAttribute("data-rose-dragging", "true");
        host.ownerDocument.getSelection()?.removeAllRanges();
        // Keep the drag when the hand leaves the window.
        try {
          root().setPointerCapture(event.pointerId);
        } catch {
          /* The pointer is already gone; pointerup still ends the drag. */
        }
      }
      // A drag across the figure turns it a little over half a turn.
      const perPixel = Math.min(0.012, Math.max(0.0035, 3.6 / place.size));
      turn.drag(event.clientX - press.x, event.clientY - press.y, perPixel);
      press.x = event.clientX;
      press.y = event.clientY;
      invalidate();
      return;
    }
    if (event.pointerType === "touch") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    pointer.fine = event.pointerType !== "pen" || event.pressure === 0;
    pointer.moved = time;
    setGrabbable(
      !reduced &&
        event.buttons === 0 &&
        overFigure(event.clientX, event.clientY) &&
        yields(event.target as Element | null, false)
    );
    invalidate();
  };
  const onPointerLeave = () => {
    pointer.seen = false;
    setGrabbable(false);
  };
  const endPress = (event?: PointerEvent) => {
    if (!press || (event && event.pointerId !== press.id)) return;
    const { id, turning } = press;
    press = null;
    if (!turning) return;
    turn.release();
    root().removeAttribute("data-rose-dragging");
    try {
      root().releasePointerCapture(id);
    } catch {
      /* Already released. */
    }
    invalidate();
  };
  const onPointerUp = (event: PointerEvent) => endPress(event);
  const onBlur = () => endPress();
  const onPointerDown = (event: PointerEvent) => {
    if (reduced || press || event.button !== 0 || !event.isPrimary) return;
    if (!overFigure(event.clientX, event.clientY)) return;
    if (!yields(event.target as Element | null, event.pointerType === "touch"))
      return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      turning: false,
    };
  };
  // A press on the rose is never the start of a text selection.
  const onSelectStart = (event: Event) => {
    if (press) event.preventDefault();
  };
  const onScroll = () => invalidate();
  const onVisibility = () => {
    last = 0;
    invalidate();
    schedule();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
  };
  const onContextRestored = () => {
    contextLost = false;
    nebulaDrawn.valid = false;
    resize();
    schedule();
  };
  /** How hard a trip from the current page to `next` pushes forward. */
  const pushFor = (next: string) => {
    const change = pageLevel(next) - pageLevel(page);
    return change > 0 ? PUSH.deeper : change < 0 ? PUSH.up : PUSH.across;
  };
  // A link to another page has been followed: the old page dims while the
  // next one loads, and the sky starts to lean toward it, and the figure to
  // loosen, at once.
  const onDepart = (event: Event) => {
    if (reduced || paused) return;
    const to = (event as CustomEvent<{ to?: string }>).detail?.to;
    if (!to) return;
    let next: string;
    try {
      next = normalizePath(new URL(to, location.href).pathname);
    } catch {
      return;
    }
    if (next === page) return;
    pushAmount = pushFor(next);
    departedAt = performance.now();
    if (turnOver < 0.05) turnOver = 1;
    invalidate();
    schedule();
  };
  const coverObserver =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          const next = root().hasAttribute(COVERED_ATTRIBUTE);
          if (next === covered) return;
          covered = next;
          if (!covered) {
            invalidate();
            schedule();
          }
        })
      : null;
  coverObserver?.observe(root(), { attributeFilter: [COVERED_ATTRIBUTE] });

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, {
    passive: true,
    capture: true,
  });
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("blur", onBlur);
  document.addEventListener("selectstart", onSelectStart);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  window.addEventListener(DEPART_EVENT, onDepart);

  // --- Frame ---------------------------------------------------------------
  const heartQuat = uniforms.uQuatHeart.value;
  const rimQuat = uniforms.uQuatRim.value;

  const update = (dt: number, now: number) => {
    const moving = !reduced && !paused;
    if (moving) {
      time += dt;
      intro += dt;
    }
    const settle = reduced ? 1e6 : 1;

    // Theme and form ease; nothing snaps.
    light = approach(light, lightTarget, 5 * settle, dt);
    if (Math.abs(light - lightTarget) < 0.002) light = lightTarget;
    let formMoving = false;
    for (const key of FORM_KEYS) {
      const next = approach(form[key], formTarget[key], 2.6 * settle, dt);
      if (Math.abs(next - formTarget[key]) > 1e-4) formMoving = true;
      form[key] = next;
    }

    // Place: ease across a page change, follow scroll exactly.
    if (!anchor || !anchor.isConnected) measure();
    if (!anchor || !anchorShown) {
      if (!anchorMissingSince) anchorMissingSince = performance.now();
    } else anchorMissingSince = 0;
    const hasAnchor =
      placed &&
      (!anchorMissingSince || performance.now() - anchorMissingSince < 500);
    for (const key of ["x", "y", "size"] as const) {
      if (reduced) {
        place[key] = placeTarget[key];
        placeVelocity[key] = 0;
        continue;
      }
      // Critically damped: sets off smoothly, lands without overshoot.
      const omega = 7;
      const pull =
        omega * omega * (placeTarget[key] - place[key]) -
        2 * omega * placeVelocity[key];
      placeVelocity[key] += pull * dt;
      place[key] += placeVelocity[key] * dt;
      if (
        Math.abs(placeTarget[key] - place[key]) < 0.05 &&
        Math.abs(placeVelocity[key]) < 0.5
      ) {
        place[key] = placeTarget[key];
        placeVelocity[key] = 0;
      }
    }
    for (const key of ["follow", "level"] as const)
      place[key] = approach(place[key], placeTarget[key], 5 * settle, dt);
    const placeMoving =
      placeVelocity.x !== 0 || placeVelocity.y !== 0 || placeVelocity.size !== 0;
    const scrollY = window.scrollY;
    // A jump of the scroll (a new page starting at its top, a restored
    // position) would cut the sky by a fifth of its length. It is folded into
    // the pan instead, and a page just changed takes it into its trip.
    if (scrollSeen && !reduced) {
      const jump = scrollY - lastScrollY;
      if (Math.abs(jump) > Math.max(SCROLL_JUMP, height * 0.6)) {
        folded -= jump * SKY_SCROLL;
        if (now - pageChangedAt < 2500) {
          foldScroll();
          aimSky();
        }
      } else
        scrollVelocity = approach(
          scrollVelocity,
          jump / Math.max(dt, 1e-3),
          18,
          dt
        );
    }
    if (Math.abs(scrollVelocity) < 4 || reduced) scrollVelocity = 0;
    lastScrollY = scrollY;
    scrollSeen = true;
    const leave = Math.max(1, (place.y + place.size * 0.5) / place.follow);
    const progress = clamp01(scrollY / leave);
    const presenceTarget = hasAnchor
      ? place.level * (1 - smooth(0.62, 1, progress))
      : 0;
    presence = approach(presence, presenceTarget, 4 * settle, dt);
    if (Math.abs(presence - presenceTarget) < 1e-4) presence = presenceTarget;
    quietStrength = approach(quietStrength, quietBox.strength, 4 * settle, dt);

    // Turning: the hand, then a little life of its own.
    turn.advance(moving ? dt : 0);
    const aim = pointer.seen && pointer.fine && !reduced ? 1 : 0;
    parallax.x = approach(
      parallax.x,
      aim * ((pointer.x / width) * 2 - 1),
      2.4,
      dt
    );
    parallax.y = approach(
      parallax.y,
      aim * ((pointer.y / height) * 2 - 1),
      2.4,
      dt
    );
    const swayX = reduced
      ? 0
      : 0.03 * Math.sin(time * 0.17) + parallax.y * 0.07;
    const swayY = reduced
      ? 0
      : 0.045 * Math.sin(time * 0.11 + 1.3) + parallax.x * 0.1;
    homeEuler.set(form.tiltX, form.tiltY, form.tiltZ, "XYZ");
    home.setFromEuler(homeEuler);
    // The hand has the rose while it turns: its own sway waits.
    const ease = turn.phase === "dragging" || turn.phase === "gliding" ? 0 : 1;
    swayEase = approach(swayEase, ease, 3, dt);
    TurnMotion.pose(
      turn.spin,
      swayX * swayEase,
      swayY * swayEase,
      home,
      heartQuat
    );
    TurnMotion.pose(
      turn.rimSpin,
      swayX * 1.2 * swayEase,
      swayY * 1.2 * swayEase,
      home,
      rimQuat
    );

    // Intro: the spiral draws out from the heart, opens, and is signed.
    const grow = easeOut(intro / 2.5);
    const open = easeInOut((intro - 0.2) / 3.3);
    const write = clamp01((intro - 1.8) / 2) * 1.08;
    let pen = -1;
    if (!reduced && intro > INTRO_SECONDS + 4) {
      const cycle = (time % 13) / 2.6;
      if (cycle < 1) pen = -0.1 + cycle * 1.2;
    }

    const scale = uniforms.uDpr.value;
    const u = uniforms;
    u.uTime.value = time;
    u.uGrow.value = reduced ? 1 : grow;
    u.uOpen.value = reduced ? 1 : open;
    u.uWrite.value = reduced ? 1.1 : write;
    u.uPen.value = pen;
    u.uBreath.value = reduced ? 0 : 0.03 * Math.sin(time * 0.21);
    u.uLight.value = light;
    u.uPresence.value = presence;
    // Changing pages, the figure loosens a little as it travels and takes
    // its new form, then gathers: one figure becoming another, not a cut.
    turnOver = approach(turnOver, 0, 2.6, dt);
    if (turnOver < 0.004) turnOver = 0;
    const loosen = reduced ? 0 : 0.26 * 4 * turnOver * (1 - turnOver);
    u.uDisperse.value = Math.max(smooth(0.1, 0.92, progress), loosen);
    u.uTurns.value = form.turns;
    u.uPetals.value = form.petals;
    u.uOpenOuter.value = form.openOuter;
    u.uOpenInner.value = form.openInner;
    u.uNotch.value = form.notch;
    u.uRuffle.value = form.ruffle;
    u.uDepth.value = form.depth;
    u.uInnerLength.value = form.innerLength;
    u.uTwist.value = form.twist + time * 0.011;
    u.uSignature.value = form.signature;
    u.uWarmth.value = form.warmth;
    // The script floats inside the cup, below the innermost rim.
    const innerOpening = openingAt(form, 1);
    u.uScriptZ.value =
      form.innerLength *
      (Math.cos(innerOpening) - 0.15 * Math.sin(innerOpening)) *
      form.depth *
      0.55;
    u.uFocus.value = u.uScriptZ.value * 0.6;

    const radius =
      (place.size * 0.5 * scale) / (outerRadius(formTarget) * 1.04);
    u.uRadius.value = Math.max(1, radius);
    u.uCenter.value.set(
      (place.x - window.scrollX - width / 2) * scale,
      (height / 2 - (place.y - scrollY * place.follow)) * scale
    );
    const compact = width < 720 ? 1 : 0;
    u.uQuiet.value.set(
      quietBox.x * scale,
      quietBox.half * scale,
      90 * scale,
      quietStrength * (QUIET_FIGURE + 0.1 * light)
    );
    skyUniforms.uQuiet.value.set(
      quietBox.x * scale,
      quietBox.half * scale,
      110 * scale,
      // By day a speck between the lines reads as dirt, not depth: the
      // column is almost clear of stars.
      quietStrength * (QUIET_STARS[compact] + (0.94 - QUIET_STARS[compact]) * light)
    );
    compositeUniforms.uQuiet.value.set(
      (quietBox.x + width / 2) * scale,
      quietBox.half * scale,
      160 * scale,
      quietStrength * QUIET_NEBULA[compact]
    );

    // The sky: the flight carries the view to this page's, the band drifts
    // on, and scroll and the pointer move nearer stars further.
    if (moving) flight.advance(now);
    else if (flight.active) flight.jump(flight.targetX, flight.targetY);
    const panMoving = flight.active;
    const offsetX = flight.x + SKY_DRIFT.x * time + parallax.x * 18;
    const offsetY =
      flight.y +
      folded +
      SKY_DRIFT.y * time +
      (reduced ? 0 : scrollY * SKY_SCROLL) +
      parallax.y * 12;
    skyUniforms.uOffset.value.set(offsetX, offsetY);
    skyUniforms.uLevel.value = 1 - 0.3 * light;
    nebulaUniforms.uOffset.value.set(
      offsetX * NEBULA_DEPTH,
      offsetY * NEBULA_DEPTH
    );
    nebulaUniforms.uMorph.value.set((time * 0.0005) % 1, (time * 0.00031) % 1);
    nebulaUniforms.uLevel.value =
      NEBULA_NIGHT + (NEBULA_DAY - NEBULA_NIGHT) * light;
    nebulaUniforms.uRange.value =
      NEBULA_RANGE + (NEBULA_RANGE_DAY - NEBULA_RANGE) * light;

    // Travel shows: fast-moving stars smear over one frame's exposure, and a
    // page change pushes the view forward toward where the new page looks,
    // nearer stars streaming outward faster, then settles.
    if (moving) {
      smear.set(
        flight.vx * SHUTTER,
        (flight.vy + scrollVelocity * SKY_SCROLL) * SHUTTER
      );
      const departing = now - departedAt < 900 && !flight.active;
      const pushAim = departing
        ? pushAmount * 0.3
        : pushAmount * smooth(0, 1400, flight.speed);
      push = approach(push, pushAim, departing ? 2.5 : 5, dt);
      if (push < 1e-4 && pushAim === 0) push = 0;
    } else {
      smear.set(0, 0);
      push = 0;
    }
    skyUniforms.uSmear.value.copy(smear);
    skyUniforms.uPush.value.set(focal.x, focal.y, push);
    const nebulaScale = 1 + push * NEBULA_DEPTH;
    compositeUniforms.uNebulaPush.value.set(
      focal.x / width,
      1 - focal.y / height,
      nebulaScale
    );
    const smearing = smear.x !== 0 || smear.y !== 0 || push > 0;
    skyLive = moving;

    // Pointer: a chain of points trails the hand, each easing after the one
    // ahead. Their own speed is what stirs the dust, so the wake rises with
    // the motion, spreads along its path, and settles as the chain gathers
    // again. Hovering stirs; a drag turns, and stills the wake.
    const hovering =
      pointer.seen && pointer.fine && !reduced && !paused && !press?.turning
        ? 1
        : 0;
    const step = Math.max(dt, 1e-3);
    hover = approach(hover, hovering * presence, hovering ? 7 : 4, dt);
    if (hover < 1e-4) hover = 0;
    wakeGate = approach(wakeGate, press?.turning ? 0 : 1, 14, dt);
    if (!chainPlaced && pointer.seen) {
      for (const node of chain) {
        node.x = pointer.x;
        node.y = pointer.y;
      }
      chainPlaced = true;
    }
    const reach = Math.min(96, Math.max(58, height * 0.085));
    let trailLive = false;
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      const node = chain[i];
      const aheadX = i ? chain[i - 1].x : pointer.x;
      const aheadY = i ? chain[i - 1].y : pointer.y;
      const close = 1 - Math.exp(-CHAIN_RATES[i] * dt);
      const stepX = (aheadX - node.x) * close;
      const stepY = (aheadY - node.y) * close;
      node.x += stepX;
      node.y += stepY;
      const blend = 1 - Math.exp(-14 * dt);
      node.vx += (stepX / step - node.vx) * blend;
      node.vy += (stepY / step - node.vy) * blend;
      const speed = Math.hypot(node.vx, node.vy);
      // Quick to rise, slow to fall: the dust eases back into place.
      const stirred = Math.min(1, speed / 760) * hover;
      node.energy = approach(
        node.energy,
        stirred,
        stirred > node.energy ? 11 : 2.3,
        dt
      );
      // Exponential easing never reaches zero on its own; a wake this faint
      // is gone, and must not keep the loop drawing.
      if (node.energy < 1e-3 && stirred < 1e-3) node.energy = 0;
      if (node.energy > 0 || speed > 2) trailLive = true;
      toField(node.x, node.y, scratch);
      trail[i].set(
        scratch.x,
        scratch.y,
        node.energy * CHAIN_WEIGHTS[i] * wakeGate,
        reach * (1 + 0.16 * i) * scale
      );
      // Carried about a frame's travel along the motion, never far.
      const carry =
        speed > 1 ? Math.min(speed * 0.017, reach * 0.17) / speed : 0;
      trailVelocity[i].set(node.vx * carry * scale, -node.vy * carry * scale);
    }
    const lightAim = hovering && time - pointer.moved < 2.5 ? 1 : 0;
    pointerLight = approach(pointerLight, lightAim, lightAim ? 5 : 1.4, dt);
    // The light rides the head of the chain, so it glides after the hand.
    toField(chain[0].x, chain[0].y, scratch);
    u.uPointer.value.set(scratch.x, scratch.y, pointerLight * presence);

    compositeUniforms.uLight.value = light;
    compositeUniforms.uTime.value = time;
    compositeUniforms.uGlow.value.set(
      u.uCenter.value.x,
      u.uCenter.value.y,
      u.uRadius.value * 1.25
    );
    const air = presence * (1 - 0.7 * u.uDisperse.value) * (1 - light);
    compositeUniforms.uAir.value.setRGB(
      0.0011 * air,
      0.0019 * air,
      0.0042 * air
    );

    // Keep drawing at the display's rate while anything moves visibly. The
    // figure's own idle drift (spiral flow, sway, twist) stays under about
    // 15 px/s, sub-pixel at the sky's gentler rate, so it is drawn with the
    // sky; only the pen's sweep along the signature needs every frame.
    const figureLive = presence > 0.004 && moving && pen > -0.5;
    const turning = moving && turn.active;
    const themeMoving = light !== lightTarget;
    const presenceMoving = Math.abs(presence - presenceTarget) > 0.002;
    // The pointer's light falls only on the figure.
    const pointerLit = pointerLight * presence > 0.004;
    const introLive = moving && intro < INTRO_SECONDS + 0.5;
    if (import.meta.env.DEV)
      liveReasons = {
        figure: figureLive,
        pan: panMoving,
        trail: trailLive,
        turn: turning,
        form: formMoving,
        turnOver: turnOver > 0,
        theme: themeMoving,
        presence: presenceMoving,
        pointer: pointerLit,
        intro: introLive,
        smear: smearing,
        place: placeMoving,
      };
    return (
      figureLive ||
      panMoving ||
      smearing ||
      placeMoving ||
      trailLive ||
      turning ||
      formMoving ||
      turnOver > 0 ||
      themeMoving ||
      presenceMoving ||
      pointerLit ||
      introLive
    );
  };

  /**
   * The gas moves slowly, so its target is kept while the view only shifts
   * within the target's margin; the composite samples it shifted. It is
   * rendered afresh when the shift outgrows the margin, when its colours
   * change, and every so often for its slow churn.
   */
  const drawNebula = (now: number) => {
    const offset = nebulaUniforms.uOffset.value;
    const margin = nebulaDrawn.margin;
    const level = nebulaUniforms.uLevel.value;
    const stale =
      !nebulaDrawn.valid ||
      Math.abs(offset.x - nebulaDrawn.x) > margin * 0.8 ||
      Math.abs(offset.y - nebulaDrawn.y) > margin * 0.8 ||
      level !== nebulaDrawn.level ||
      uniforms.uLight.value !== nebulaDrawn.light ||
      (skyLive && now - nebulaDrawn.at > NEBULA_REFRESH_MS);
    if (stale) {
      renderer.setRenderTarget(nebulaTarget);
      nebula.render(renderer);
      nebulaDrawn.valid = true;
      nebulaDrawn.x = offset.x;
      nebulaDrawn.y = offset.y;
      nebulaDrawn.at = now;
      nebulaDrawn.level = level;
      nebulaDrawn.light = uniforms.uLight.value;
      // The composite reads the target with the range it was written with.
      compositeUniforms.uNebulaRange.value = nebulaUniforms.uRange.value;
      nebulaRenders++;
    }
    // Where this view sits in the target (see COMPOSITE_FRAGMENT).
    const areaWidth = width + 2 * margin;
    const areaHeight = height + 2 * margin;
    const dx = offset.x - nebulaDrawn.x;
    const dy = offset.y - nebulaDrawn.y;
    compositeUniforms.uNebulaMap.value.set(
      width / areaWidth,
      height / areaHeight,
      (dx + margin) / areaWidth,
      1 - (height + dy + margin) / areaHeight
    );
  };

  const draw = (now: number) => {
    draws++;
    drawNebula(now);
    // A figure scrolled away costs nothing.
    mesh.visible = uniforms.uPresence.value > 0.002;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    if (hdr) {
      bloom.render(renderer, target, target);
      compositeUniforms.tBloom.value = bloom.output ?? black;
    }
    renderer.setRenderTarget(null);
    composite.render(renderer);
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    // Hidden, or under a sheet that covers the whole viewport: nothing to
    // draw. The loop resumes when that changes.
    if (contextLost || document.hidden || covered) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    const frameMs = last ? now - last : 16.7;
    last = now;
    const live = update(dt, now);
    // With nothing but the sky moving, it is drawn at a gentler rate.
    const skyFps = width < 720 ? 24 : SKY_FPS;
    const skyDue = skyLive && now - lastDraw >= 1000 / skyFps - 4;
    if (live || dirty || skyDue) {
      draw(now);
      lastDraw = now;
      dirty = false;
      canvas.dataset.ready = "true";
      if (live && !reduced && quality.observe(frameMs, now)) resize();
    }
    if (live || skyLive) schedule();
    else last = 0;
  };
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(tick);
  }

  // Each touch-action applies to the element the gesture starts on.
  resize();
  schedule();

  if (import.meta.env.DEV)
    (window as unknown as Record<string, unknown>).__starfield = {
      uniforms,
      compositeUniforms,
      skyUniforms,
      nebulaUniforms,
      turn,
      get state() {
        return {
          time,
          intro,
          presence,
          place,
          form,
          page,
          dpr,
          light,
          tile,
          pan: { x: flight.x, y: flight.y, vx: flight.vx, vy: flight.vy },
          panTarget: { x: flight.targetX, y: flight.targetY },
          folded,
          push,
          smear: { x: smear.x, y: smear.y },
          nebulaRenders,
          skyStars: skyGeometry.instanceCount,
          draws,
          figureDrawn: mesh.visible,
          live: Object.keys(liveReasons).filter(key => liveReasons[key]),
        };
      },
      /** Jumps the intro to a point in seconds. */
      setIntro(seconds: number) {
        intro = seconds;
        invalidate();
      },
      /** Tries a form without navigating. */
      setForm(partial: Partial<RoseForm>) {
        formTarget = { ...formTarget, ...partial };
        invalidate();
      },
    };

  return {
    setTheme(next) {
      lightTarget = next ? 1 : 0;
      invalidate();
    },
    setPage(path) {
      const key = normalizePath(path);
      if (key === page) return;
      // A trip already announced by its departure keeps its push and its
      // loosening; one that was not (back, forward) starts both now.
      if (performance.now() - departedAt > 1200) {
        pushAmount = pushFor(key);
        turnOver = 1;
      } else if (turnOver < 0.05) turnOver = 1;
      departedAt = -Infinity;
      // Every page change is a journey along the band: deeper pages lie one
      // way, the way back the other, and pages at the same depth to either
      // side by the order of their addresses, so a trip and its return
      // mirror each other. Its length is the new page's own.
      const level = pageLevel(key) - pageLevel(page);
      const side =
        level !== 0 ? Math.sign(level) : hashPath(key) > hashPath(page) ? 1 : -1;
      const reach = 0.2 + 0.2 * mulberry32(hashPath(key) ^ 0x51ed27)();
      foldScroll();
      const currentAlong = (flight.targetX - flight.targetY) / 2;
      pageAlong = currentAlong + side * reach * tile;
      page = key;
      pageChangedAt = performance.now();
      formTarget = formForPath(key);
      anchor = null;
      quiet = null;
      turn.home();
      measure();
      invalidate();
      schedule();
    },
    setPaused(next) {
      paused = next;
      invalidate();
    },
    handleKey(event) {
      if (reduced) return;
      if (event.key === "Escape") turn.home();
      else if (event.key === "ArrowLeft") turn.nudge(0, -KEY_TURN);
      else if (event.key === "ArrowRight") turn.nudge(0, KEY_TURN);
      else if (event.key === "ArrowUp") turn.nudge(-KEY_TURN, 0);
      else if (event.key === "ArrowDown") turn.nudge(KEY_TURN, 0);
      else return;
      event.preventDefault();
      invalidate();
    },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      bodyObserver?.disconnect();
      hostObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener(DEPART_EVENT, onDepart);
      coverObserver?.disconnect();
      document.removeEventListener("selectstart", onSelectStart);
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave
      );
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      root().removeAttribute("data-rose-dragging");
      root().removeAttribute("data-rose-hover");
      geometry.dispose();
      material.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      nebulaTarget.dispose();
      nebula.material.dispose();
      nebula.dispose();
      target.dispose();
      bloom.dispose();
      black.dispose();
      composite.material.dispose();
      composite.dispose();
      renderer.dispose();
      canvas.remove();
      if (import.meta.env.DEV)
        delete (window as unknown as Record<string, unknown>).__starfield;
    },
  };
}
