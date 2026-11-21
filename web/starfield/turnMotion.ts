import { Quaternion, Vector2, Vector3 } from "three";

export type TurnPhase = "idle" | "dragging" | "gliding" | "returning";

/** The heart follows the hand closely; the rims follow a beat later. */
const FOLLOW_RATE = 16;
const RIM_FOLLOW_RATE = 7;
const RETURN_RATE = 1.5;
const RIM_RETURN_RATE = 1.15;
/** The hand's turn rate is averaged over ~70ms of frames. */
const VELOCITY_WINDOW = 0.07;
/** A flick glides on, slowing with a ~0.7s time constant. */
const GLIDE_DECAY = 1.45;
const GLIDE_MAX_SPEED = 9;
const GLIDE_MIN_SPEED = 0.25;
const GLIDE_END_SPEED = 0.05;
/** The rose keeps the pose it was left in for a while before turning home. */
const REST = 2.6;
const SETTLED = 1.5e-3;

const IDENTITY = new Quaternion();
const axis = new Vector3();
const step = new Quaternion();

/** Turns `q` by (x about the screen's horizontal, y about its vertical). */
function turnBy(q: Quaternion, x: number, y: number) {
  const angle = Math.hypot(x, y);
  if (!(angle > 1e-9) || !Number.isFinite(angle)) return q;
  step.setFromAxisAngle(axis.set(x / angle, y / angle, 0), angle);
  // Screen axes, whatever the pose: the rose turns the way the hand moves
  // even when it is already upside down.
  return q.premultiply(step).normalize();
}

/**
 * Dragging turns the rose like a ball under the hand: horizontal travel
 * turns it about the vertical axis, vertical travel tips it over, always
 * about the screen's axes. The heart follows the hand and the outer petals
 * trail behind it, so the rose fans a little as it turns and gathers when it
 * stops. Let go mid-flick and it glides on, keeps its pose for a moment, then
 * turns back to face the reader by the shortest way.
 */
export class TurnMotion {
  /** Where the hand has turned it to. */
  readonly target = new Quaternion();
  /** The heart's turn, easing after the target. */
  readonly spin = new Quaternion();
  /** The rims' turn, a beat behind the heart. */
  readonly rimSpin = new Quaternion();
  /** Turn rate in radians per second (x: tipping, y: turning). */
  readonly velocity = new Vector2();
  phase: TurnPhase = "idle";
  private readonly pending = new Vector2();
  private rest = 0;

  begin() {
    this.phase = "dragging";
    this.rest = 0;
    this.velocity.set(0, 0);
    this.pending.set(0, 0);
  }

  /** Turns the target by a drag in CSS pixels (y down). */
  drag(deltaX: number, deltaY: number, radiansPerPixel = 0.0055) {
    if (this.phase !== "dragging") return;
    const x = deltaY * radiansPerPixel;
    const y = deltaX * radiansPerPixel;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pending.x += x;
    this.pending.y += y;
    turnBy(this.target, x, y);
  }

  /** A keyboard step: turns, holds, then heads home. */
  nudge(x: number, y: number, hold = 1.6) {
    this.phase = "returning";
    this.velocity.set(0, 0);
    this.rest = hold;
    turnBy(this.target, x, y);
  }

  release() {
    if (this.phase !== "dragging") return;
    if (this.velocity.length() > GLIDE_MIN_SPEED) {
      this.velocity.clampLength(0, GLIDE_MAX_SPEED);
      this.phase = "gliding";
      return;
    }
    this.velocity.set(0, 0);
    this.startReturn(REST);
  }

  /** Turns home now. */
  home() {
    if (this.phase === "idle") return;
    this.velocity.set(0, 0);
    this.startReturn(0);
  }

  reset() {
    this.target.identity();
    this.spin.identity();
    this.rimSpin.identity();
    this.velocity.set(0, 0);
    this.pending.set(0, 0);
    this.rest = 0;
    this.phase = "idle";
  }

  private startReturn(rest: number) {
    this.phase = "returning";
    this.rest = Math.max(0, rest);
    if (this.rest === 0) this.target.identity();
  }

  advance(dt: number) {
    if (this.phase === "idle" || !(dt > 0)) return;
    if (this.phase === "dragging") {
      // A hand that stops before letting go leaves no glide behind.
      const blend = 1 - Math.exp(-dt / VELOCITY_WINDOW);
      this.velocity.x += (this.pending.x / dt - this.velocity.x) * blend;
      this.velocity.y += (this.pending.y / dt - this.velocity.y) * blend;
      this.pending.set(0, 0);
    } else if (this.phase === "gliding") {
      // Exact exponential integration: the same glide at 30, 60 or 120 Hz.
      const decay = Math.exp(-dt * GLIDE_DECAY);
      const travel = (1 - decay) / GLIDE_DECAY;
      turnBy(this.target, this.velocity.x * travel, this.velocity.y * travel);
      this.velocity.multiplyScalar(decay);
      if (this.velocity.length() < GLIDE_END_SPEED) {
        this.velocity.set(0, 0);
        this.startReturn(REST);
      }
    }
    if (this.phase === "returning" && this.rest > 0) {
      this.rest -= dt;
      if (this.rest <= 0) this.target.identity();
    }
    const homing = this.phase === "returning" && this.rest <= 0;
    this.spin.slerp(
      this.target,
      1 - Math.exp(-(homing ? RETURN_RATE : FOLLOW_RATE) * dt)
    );
    this.rimSpin.slerp(
      this.target,
      1 - Math.exp(-(homing ? RIM_RETURN_RATE : RIM_FOLLOW_RATE) * dt)
    );
    if (
      homing &&
      this.spin.angleTo(IDENTITY) < SETTLED &&
      this.rimSpin.angleTo(IDENTITY) < SETTLED
    )
      this.reset();
  }

  /** Whether the rose is away from its resting pose. */
  get active() {
    return this.phase !== "idle";
  }

  /** Composes a turn (plus a small sway) over the resting pose. */
  static pose(
    spin: Quaternion,
    swayX: number,
    swayY: number,
    home: Quaternion,
    out: Quaternion
  ) {
    out.copy(home).premultiply(spin);
    return turnBy(out, swayX, swayY);
  }
}
