/**
 * The camera's moves across the deep sky.
 *
 * A move is one smooth curve from where the camera is, at the speed it
 * already has, to rest on the new view: it leaves without a jolt (zero
 * acceleration at the start), arrives on a long soft tail, and takes longer
 * the further it goes, so a long trip is a glide rather than a lurch. A new
 * aim mid-flight starts a fresh curve from the current position and
 * velocity, so the path never kinks.
 *
 * Positions are CSS px for the nearest layer of stars; times are ms.
 */

/** How long a move of `distance` px takes, in ms. */
export function flightDuration(distance: number) {
  return Math.min(1900, Math.max(1050, 950 + distance * 0.55));
}

/**
 * Time warp that front-loads the curve: the camera reaches its top speed a
 * little before halfway and spends longer settling, the way a camera
 * operator lands a move. Monotonic, 0 → 1, flat at the end.
 */
const ARRIVAL = 1.35;
const warp = (t: number) => 1 - Math.pow(1 - t, ARRIVAL);
const warpRate = (t: number) => ARRIVAL * Math.pow(1 - t, ARRIVAL - 1);

export class SkyFlight {
  x = 0;
  y = 0;
  /** Current velocity, px per second. */
  vx = 0;
  vy = 0;
  active = false;

  private fromX = 0;
  private fromY = 0;
  private fromVx = 0;
  private fromVy = 0;
  private toX = 0;
  private toY = 0;
  private start = 0;
  private duration = 1;

  get targetX() {
    return this.toX;
  }
  get targetY() {
    return this.toY;
  }
  /** Current speed, px per second. */
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Puts the camera at (x, y), at rest. */
  jump(x: number, y: number) {
    this.x = this.toX = x;
    this.y = this.toY = y;
    this.vx = this.vy = 0;
    this.active = false;
  }

  /**
   * Flies to (x, y). A target within a few px of the current one only nudges
   * the end of the curve under way (layout settling as a page loads); a real
   * change of view plans a new curve from here.
   */
  aim(x: number, y: number, now: number) {
    if (this.active && Math.hypot(x - this.toX, y - this.toY) < 24) {
      this.toX = x;
      this.toY = y;
      return;
    }
    const distance = Math.hypot(x - this.x, y - this.y);
    if (distance < 0.5 && this.speed < 1) {
      this.jump(x, y);
      return;
    }
    this.fromX = this.x;
    this.fromY = this.y;
    this.fromVx = this.vx;
    this.fromVy = this.vy;
    this.toX = x;
    this.toY = y;
    this.start = now;
    // Already moving fast: allow the time to carry that speed into the turn
    // instead of overshooting.
    this.duration = flightDuration(Math.max(distance, this.speed * 0.6));
    this.active = true;
  }

  /** Moves the whole frame: a jump of the page's scroll folded into the pan. */
  shift(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.fromX += dx;
    this.fromY += dy;
    this.toX += dx;
    this.toY += dy;
  }

  /** Advances to `now`; returns whether the camera is still moving. */
  advance(now: number) {
    if (!this.active) return false;
    const t = (now - this.start) / this.duration;
    if (t >= 1) {
      this.jump(this.toX, this.toY);
      return false;
    }
    const u = warp(Math.max(0, t));
    const du = warpRate(Math.max(0, t));
    // Quintic Hermite: start position and velocity, end at rest, zero
    // acceleration at both ends.
    const u2 = u * u;
    const u3 = u2 * u;
    const u4 = u3 * u;
    const u5 = u4 * u;
    const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
    const h1 = u - 6 * u3 + 8 * u4 - 3 * u5;
    const h5 = 10 * u3 - 15 * u4 + 6 * u5;
    const d0 = -30 * u2 + 60 * u3 - 30 * u4;
    const d1 = 1 - 18 * u2 + 32 * u3 - 15 * u4;
    const d5 = 30 * u2 - 60 * u3 + 30 * u4;
    // The start velocity, in the warped curve's own units.
    const seconds = this.duration / 1000;
    const scale = seconds / ARRIVAL;
    const sx = this.fromVx * scale;
    const sy = this.fromVy * scale;
    this.x = h0 * this.fromX + h1 * sx + h5 * this.toX;
    this.y = h0 * this.fromY + h1 * sy + h5 * this.toY;
    const rate = du / seconds;
    this.vx = (d0 * this.fromX + d1 * sx + d5 * this.toX) * rate;
    this.vy = (d0 * this.fromY + d1 * sy + d5 * this.toY) * rate;
    return true;
  }
}

/** How deep a page sits: home, then the indexes and about, then a note. */
export function pageLevel(path: string) {
  if (path === "/") return 0;
  if (path.startsWith("/post/")) return 2;
  return 1;
}
