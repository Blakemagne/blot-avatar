// One shape becoming another.
//
// A body's outline is the union of its pieces. Seen from the middle of the drawing every body is one closed
// curve that a ray from the middle crosses once, so the outline is a list of distances: how far out the body
// reaches along each of n evenly spaced rays. Two such lists blend number by number, and whatever is in
// between is again one closed curve round the middle: it cannot cross itself, and there is never a second
// outline to fade. That is the morph, between any two bodies, however many pieces either has.

import type { Body } from './body';
import type { Mat3 } from './math';
import { silhouette } from './silhouette';

/**
 * A change of shape caught part way: so much of one body, so much of another (the shares add up to 1).
 * A new change can start from one, so a change during a change carries on from the in-between.
 */
export interface Mix { parts: { body: Body; share: number }[]; wears: Body }
/** What a morph starts from: a body, or an earlier morph that was still going. */
export type Source = Body | Mix;

export const isMix = (s: Source): s is Mix => 'parts' in s;
/** The body a source's eyes are on. */
export const leaf = (s: Source): Body => (isMix(s) ? s.wears : s);

/**
 * A loading figure's two coats change over this share at each end of its way: the body's fades out over the first,
 * the figure's own in over the last (a change of shape keeps its coat on: see draw.ts).
 */
export const COAT_FADE = 0.25;

/** At most this many bodies in a mix; past that the one with the least share is let go. */
const MOST = 5;

/**
 * A morph caught `k` of the way from `a` to `b`. The eyes are on the old body for the first half of a morph
 * (see draw.ts), so one caught before half way still wears the body it set off from.
 */
export function caught(a: Source, b: Body, k: number): Mix {
  const parts = (isMix(a) ? a.parts : [{ body: a, share: 1 }]).map((p) => ({ body: p.body, share: p.share * (1 - k) }));
  const same = parts.find((p) => p.body === b);
  if (same) same.share += k; else parts.push({ body: b, share: k });
  while (parts.length > MOST) parts.splice(parts.reduce((least, p, i) => (p.share < parts[least].share ? i : least), 0), 1);
  const sum = parts.reduce((t, p) => t + p.share, 0);
  for (const p of parts) p.share /= sum;
  return { parts, wears: k < 0.5 ? leaf(a) : b };
}

const TAU = 2 * Math.PI;
const rings = new Map<number, Float64Array>();
/** cos, sin of ray i of n. Screen coordinates (y down), so the rays run clockwise as drawn; ray 3n/4 is straight up. */
function ring(n: number): Float64Array {
  let t = rings.get(n);
  if (!t) {
    t = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { t[i * 2] = Math.cos((i * TAU) / n); t[i * 2 + 1] = Math.sin((i * TAU) / n); }
    rings.set(n, t);
  }
  return t;
}

/** How many rays to draw with at a size (a multiple of four, so one points exactly up, down, left and right). */
export const rays = (size: number): number => (size >= 96 ? 144 : size >= 40 ? 96 : 64);

/**
 * How far the union of `polys` (flat screen polygons, each convex) reaches from the middle along each of n
 * rays. Each edge is visited once and only the rays that pass between its two ends are tested.
 */
export function radial(polys: ArrayLike<number>[], n: number, out: Float64Array = new Float64Array(n)): Float64Array {
  const dir = ring(n);
  out.fill(0, 0, n);
  for (const p of polys) {
    const m = p.length / 2;
    if (m < 3) continue;
    let ax = p[m * 2 - 2], ay = p[m * 2 - 1];
    let fa = (Math.atan2(ay, ax) / TAU) * n;
    for (let j = 0; j < m; j++) {
      const bx = p[j * 2], by = p[j * 2 + 1], fb = (Math.atan2(by, bx) / TAU) * n;
      // The rays between the two ends, the shorter way round.
      let from = fa, span = fb - fa;
      if (span > n / 2) span -= n; else if (span < -n / 2) span += n;
      if (span < 0) { from = fb; span = -span; }
      const ex = bx - ax, ey = by - ay, c = ax * ey - ay * ex;
      for (let i = Math.ceil(from - 1e-9), end = from + span + 1e-9; i <= end; i++) {
        const k = ((i % n) + n) % n;
        const den = dir[k * 2] * ey - dir[k * 2 + 1] * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = c / den;
        if (t > out[k]) out[k] = t;
      }
      ax = bx; ay = by; fa = fb;
    }
  }
  // A ray that met nothing (the middle is outside the body there) still needs a point: keep the curve closed.
  for (let i = 0; i < n; i++) if (!(out[i] > 1e-3)) out[i] = 1e-3;
  return out;
}

/** The outline of a source for a pose, as n distances. `rim` is how finely each sphere is traced. */
export function profile(src: Source, R: Mat3, rim: number, n: number): Float64Array {
  if (!isMix(src)) return radial(silhouette(src, R, rim), n);
  const out = new Float64Array(n), one = new Float64Array(n);
  for (const p of src.parts) {
    radial(silhouette(p.body, R, rim), n, one);
    for (let i = 0; i < n; i++) out[i] += one[i] * p.share;
  }
  return out;
}

/** Blend two outlines in place into `a`: k of the way to `b`. */
export function mix(a: Float64Array, b: ArrayLike<number>, k: number): Float64Array {
  for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k;
  return a;
}

/** Blend an outline in place toward a circle of radius r. */
export function round(a: Float64Array, r: number, k: number): Float64Array {
  for (let i = 0; i < a.length; i++) a[i] += (r - a[i]) * k;
  return a;
}

/**
 * n distances as one flat polygon round (cx, cy). `hole` winds it the other way, so that in one path with the
 * body it is cut out instead of added.
 */
export function polar(r: ArrayLike<number>, hole = false, cx = 0, cy = 0): Float64Array {
  const n = r.length, dir = ring(n), out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const k = hole ? (n - i) % n : i;
    out[i * 2] = cx + r[k] * dir[k * 2];
    out[i * 2 + 1] = cy + r[k] * dir[k * 2 + 1];
  }
  return out;
}

/** Does the closed polygon cross itself? (Every pair of edges that do not share a corner.) */
export function crosses(poly: ArrayLike<number>): boolean {
  const n = poly.length / 2;
  const turn = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n, ax = poly[i * 2], ay = poly[i * 2 + 1], bx = poly[i2 * 2], by = poly[i2 * 2 + 1];
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      const cx = poly[j * 2], cy = poly[j * 2 + 1], dx = poly[j2 * 2], dy = poly[j2 * 2 + 1];
      if (turn(ax, ay, bx, by, cx, cy) * turn(ax, ay, bx, by, dx, dy) < 0 && turn(cx, cy, dx, dy, ax, ay) * turn(cx, cy, dx, dy, bx, by) < 0) return true;
    }
  }
  return false;
}
