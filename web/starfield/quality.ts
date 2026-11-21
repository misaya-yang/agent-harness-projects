/**
 * Render scales, finest first. The steps are few because each change
 * reallocates the targets, and shallow because points are a pixel or two
 * wide: below ~0.7 the browser's upscale turns them into soft blocks.
 */
export const RENDER_SCALES = [1, 0.85, 0.72] as const;

/** Frames judged together; a median shrugs off the odd long frame. */
const WINDOW = 72;
/** Shader compilation and page load say nothing about steady cost. */
const WARMUP_MS = 2500;
/** A window slower than 45 fps is worth trying fewer pixels for. */
const SLOW_MS = 1000 / 45;
const FAST_MS = 1000 / 55;
/** Fewer pixels must buy back at least this share of the frame time. */
const GAIN = 0.87;
const MAX_RECOVERY_WINDOWS = 48;

/**
 * Adaptive resolution that has to earn its keep.
 *
 * A slow frame *interval* is not proof of a slow GPU: browsers pace
 * animation frames to 30 fps in low-power modes, and a busy page delays
 * frames whatever the canvas costs. So a lower scale is only ever a trial.
 * If the frame time does not improve, the pixels are given back and the
 * scale is left alone for good; the picture stays sharp instead of paying
 * for a problem resolution cannot fix.
 */
export class RenderQuality {
  private index = 0;
  private samples: number[] = [];
  private started = -1;
  private lastObserved = -Infinity;
  private slowWindows = 0;
  private fastWindows = 0;
  private recoveryWindows = 6;
  private trial: { from: number; before: number } | null = null;
  private settled = false;

  get scale(): number {
    return RENDER_SCALES[this.index];
  }

  /** The device pixel ratio to render at for this display and scale. */
  pixelRatio(devicePixelRatio: number) {
    return (
      Math.round(Math.min(devicePixelRatio || 1, 2) * this.scale * 100) / 100
    );
  }

  /**
   * Feeds one frame interval. Returns true when the scale changed and the
   * targets should be resized.
   */
  observe(frameMs: number, now: number): boolean {
    if (this.started < 0) this.started = now;
    // A paused loop says nothing about load: drop the window it interrupted.
    const resumed = now - this.lastObserved > 250;
    this.lastObserved = now;
    if (resumed || frameMs > 250) {
      this.samples.length = 0;
      return false;
    }
    if (now - this.started < WARMUP_MS) return false;
    this.samples.push(frameMs);
    if (this.samples.length < WINDOW) return false;
    const median = this.samples.sort((a, b) => a - b)[WINDOW >> 1];
    this.samples.length = 0;
    return this.judge(median);
  }

  private judge(median: number): boolean {
    if (this.trial) {
      const { from, before } = this.trial;
      this.trial = null;
      this.slowWindows = this.fastWindows = 0;
      if (median > before * GAIN) {
        this.index = from;
        this.settled = true;
        return true;
      }
      return false;
    }
    const slow = median > SLOW_MS;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.fastWindows = median < FAST_MS ? this.fastWindows + 1 : 0;

    if (
      slow &&
      !this.settled &&
      this.slowWindows >= 2 &&
      this.index < RENDER_SCALES.length - 1
    ) {
      this.trial = { from: this.index, before: median };
      this.index++;
      this.slowWindows = 0;
      return true;
    }
    if (this.index > 0 && this.fastWindows >= this.recoveryWindows) {
      this.index--;
      this.fastWindows = 0;
      // An upgrade that has to be undone waits twice as long next time.
      this.recoveryWindows = Math.min(
        MAX_RECOVERY_WINDOWS,
        this.recoveryWindows * 2
      );
      return true;
    }
    return false;
  }
}
