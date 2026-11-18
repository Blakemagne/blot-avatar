// Effects: what is drawn beside the body, never part of it. A mark on its outline, a "!" above its head, sleep's
// Zs, sparks, rings that pass behind it and in front, a pulse, speed lines. Like everything else here they are
// numbers in and flat polygons out: the rig (or a clip) says which effect is showing and how far in it is, and
// draw.ts places it against the body's outline for that frame, so an effect follows the body wherever it goes.
//
// To add one: a kind in FxKind, and its shape in fxParts. It draws no random numbers: anything that looks
// scattered is spread by a fixed rule (scatter), so the same frame is always the same picture.

import { clamp01, smooth } from './ease';

export type FxKind = 'mark' | 'bang' | 'spray' | 'burst' | 'rings' | 'pulse' | 'streaks' | 'zzz';
export const FX_KINDS: readonly FxKind[] = ['mark', 'bang', 'spray', 'burst', 'rings', 'pulse', 'streaks', 'zzz'];

/** One effect on screen. `u` is how far through a one-shot it is (0..1); `t` the ms of a loop; `dir` +1 or -1; `amount` how much of it shows (0..1). */
export interface Fx { kind: FxKind; u: number; t: number; dir: number; amount: number }

/**
 * Who paints a part: 'body' in the body's colour, 'eye' in the eyes', 'accent' in the renderer's accent colour
 * (the body's colour unless it is given one), 'shadow' in a dark shade.
 */
export type FxRole = 'body' | 'eye' | 'accent' | 'shadow';

/** A part of an effect: flat polygons in body units (x right, y down), painted in one colour and opacity, behind the body or in front of it. */
export interface FxPart { layer: 'back' | 'front'; role: FxRole; opacity: number; polys: Float64Array[] }

/** The body this frame, as the effects see it: its box, its middle, and how far it reaches along n rays from that middle. */
export interface FxFrame {
  x0: number; y0: number; x1: number; y1: number;
  cx: number; cy: number;
  /** Lazily: the outline's reach along n rays from (cx, cy), ray 0 pointing right and turning clockwise as drawn. */
  reach(): Float64Array;
}

const TAU = 2 * Math.PI;
const frac = (x: number): number => x - Math.floor(x);
/** A fixed spread for the i-th of something: 0..1, the same every time. */
export const scatter = (i: number, salt = 0): number => frac(Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453);

/** A disc of radius r at (x, y), m points. */
export function disc(x: number, y: number, r: number, m = 14): Float64Array {
  const out = new Float64Array(m * 2);
  for (let i = 0; i < m; i++) { const a = (i * TAU) / m; out[i * 2] = x + r * Math.cos(a); out[i * 2 + 1] = y + r * Math.sin(a); }
  return out;
}

/** A capsule standing from (x, ya) to (x, yb) (ya above), half as wide as r. */
function capsule(x: number, ya: number, yb: number, r: number, m = 10): Float64Array {
  const out = new Float64Array((m + 1) * 4);
  let k = 0;
  // The top cap, left to right over the top, then the bottom cap, right to left under the bottom.
  for (let i = 0; i <= m; i++) { const a = Math.PI + (i * Math.PI) / m; out[k++] = x + r * Math.cos(a); out[k++] = ya + r * Math.sin(a); }
  for (let i = 0; i <= m; i++) { const a = (i * Math.PI) / m; out[k++] = x + r * Math.cos(a); out[k++] = yb + r * Math.sin(a); }
  return out;
}

/** A filled Z, s across, centred on (x, y). */
function zed(x: number, y: number, s: number): Float64Array {
  const pts = [-0.5, -0.5, 0.5, -0.5, 0.5, -0.3, -0.16, 0.3, 0.5, 0.3, 0.5, 0.5, -0.5, 0.5, -0.5, 0.3, 0.16, -0.3, -0.5, -0.3];
  const out = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) { out[i] = x + pts[i] * s; out[i + 1] = y + pts[i + 1] * s; }
  return out;
}

/** A ring round (x, y): the reach r (n rays) pushed out by `out`, `thick` wide. One polygon and its hole. */
function band(r: ArrayLike<number>, x: number, y: number, out: number, thick: number): Float64Array[] {
  const n = r.length, a = new Float64Array(n * 2), b = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ang = (i * TAU) / n, c = Math.cos(ang), s = Math.sin(ang), k = n - 1 - i;
    a[i * 2] = x + (r[i] + out) * c; a[i * 2 + 1] = y + (r[i] + out) * s;
    // The hole, wound the other way.
    const ak = (k * TAU) / n;
    b[i * 2] = x + (r[k] + out - thick) * Math.cos(ak); b[i * 2 + 1] = y + (r[k] + out - thick) * Math.sin(ak);
  }
  return [a, b];
}

/** A tapered streak from (x, y), `len` long toward -dir, `half` wide at its root. */
function streak(x: number, y: number, len: number, half: number, dir: number): Float64Array {
  return new Float64Array([x, y - half, x, y + half, x - dir * len, y]);
}

/** Half the drawing box, in body units (draw.ts VIEW / 2 / UNIT): sparks are kept inside it. */
const BOX = 55.2 / 2 / 18;

/** Where the mark sits: up and to the right, on the outline. */
export const MARK_ANGLE = (-50 * Math.PI) / 180;
/** The mark's dot, and its sonar ring: one goes out every SONAR_MS. */
export const MARK_R = 0.15, SONAR_MS = 1400;
/** The rings: tilt, size (as a share of the body's half width) and flatness, and how long each one's light takes to go round. */
export const RINGS = [
  { tilt: -0.38, size: 1.32, flat: 0.24, ms: 1300 },
  { tilt: 0.52, size: 1.42, flat: 0.3, ms: 1700 },
  { tilt: 0.08, size: 1.22, flat: 0.17, ms: 2100 },
];
/** When ring i comes in during a rings cue, and when they all go. */
export const ringShows = (i: number, u: number): number => smooth((u - 0.08 * i) / 0.16) * (1 - smooth((u - 0.82) / 0.16));

/** Where on screen ring i's light is at time t (ms), and whether it is in front of the body. */
export function ringLight(i: number, t: number, f: { cx: number; cy: number; x0: number; x1: number }): { x: number; y: number; front: boolean } {
  const g = RINGS[i], half = (f.x1 - f.x0) / 2, a = g.size * half, b = a * g.flat, ph = (t / g.ms) * TAU;
  const lx = a * Math.cos(ph), ly = b * Math.sin(ph), c = Math.cos(g.tilt), s = Math.sin(g.tilt);
  return { x: f.cx + lx * c - ly * s, y: f.cy + lx * s + ly * c, front: Math.sin(ph) > 0 };
}

/** The parts of one effect for a frame. `px` is one drawn pixel in body units (nothing is drawn thinner than that). */
export function fxParts(fx: Fx, f: FxFrame, px: number): FxPart[] {
  const u = clamp01(fx.u), parts: FxPart[] = [];
  const dot = (r: number) => Math.max(r, 0.8 * px);
  switch (fx.kind) {
    case 'mark': {
      // A dot on the outline, up and to the right, that pops on; and a sonar ring going out from it.
      const k = clamp01(fx.amount);
      if (k <= 0) break;
      const reach = f.reach(), n = reach.length, i = Math.round((((MARK_ANGLE / TAU) % 1) + 1) % 1 * n) % n;
      const x = f.cx + reach[i] * Math.cos(MARK_ANGLE), y = f.cy + reach[i] * Math.sin(MARK_ANGLE);
      const r = MARK_R * (k + 0.28 * Math.sin(Math.PI * k));
      parts.push({ layer: 'front', role: 'accent', opacity: 1, polys: [disc(x, y, dot(r), 18)] });
      const s = frac(fx.t / SONAR_MS), ring = MARK_R + 0.34 * s, thick = Math.max(px, 0.04 * (1 - s) + 0.008);
      if (k >= 1) parts.push({ layer: 'front', role: 'accent', opacity: 0.5 * (1 - s), polys: band(new Float64Array(24).fill(ring), x, y, 0, thick) });
      break;
    }
    case 'bang': {
      // A "!" up beside the head, to the right (above it there is not room in the drawing box): sparks gather into
      // it, it holds with a little bob, and it falls apart into sparks.
      const x = Math.min(f.x1 + 0.16, 1.2), top = f.y0 - 0.3, bottom = f.y0 + 0.15, dy = f.y0 + 0.33, w = 0.08;
      const gather = smooth(u / 0.22), part = smooth((u - 0.8) / 0.2);
      if (u >= 0.2 && u < 0.82) {
        const bob = 0.03 * Math.sin(TAU * 2 * (u - 0.2)), pop = 1 + 0.15 * (1 - smooth((u - 0.2) / 0.1));
        const mid = (top + bottom) / 2, half = ((bottom - top) / 2) * pop;
        parts.push({ layer: 'front', role: 'accent', opacity: 1, polys: [capsule(x, mid - half + bob, mid + half + bob, w * pop), disc(x, dy + bob, w * pop, 14)] });
      }
      if (u < 0.24 || u > 0.78) {
        const sparks: Float64Array[] = [];
        for (let i = 0; i < 16; i++) {
          // Each spark's place on the glyph, and where it comes from (or goes to).
          const on = i < 12 ? { x, y: top + ((bottom - top) * i) / 11 } : { x: x + w * 0.8 * Math.cos((i * TAU) / 4), y: dy + w * 0.8 * Math.sin((i * TAU) / 4) };
          // (From the left, toward the head, and a little up or down: there is no room further out.)
          const far = 0.3 + 0.2 * scatter(i, 1), dx = -far, dy2 = far * 0.7 * (scatter(i) - 0.5);
          const off = u < 0.5 ? 1 - gather : part;
          sparks.push(disc(on.x + dx * off, on.y + dy2 * off, dot(0.045 * (1 - 0.5 * off)), 8));
        }
        parts.push({ layer: 'front', role: 'accent', opacity: u < 0.5 ? 0.3 + 0.7 * gather : 1 - part, polys: sparks });
      }
      break;
    }
    case 'spray': {
      // A few sparks thrown up and out from the top of the head, falling as they fade.
      const sparks: Float64Array[] = [], ox = f.cx + 0.3 * fx.dir, oy = f.y0 + 0.12;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + fx.dir * (0.15 + 0.85 * scatter(i, 2)), v = 1.1 + 0.6 * scatter(i, 3);
        const x = ox + v * Math.cos(a) * u, y = oy + v * Math.sin(a) * u + 1.6 * u * u;
        sparks.push(disc(x, y, dot(0.055 * (1 - 0.5 * u)), 8));
      }
      parts.push({ layer: 'front', role: 'accent', opacity: 1 - u * u, polys: sparks });
      break;
    }
    case 'burst': {
      // Sparks fly out from all round the edge, half of them behind the body.
      const reach = f.reach(), n = reach.length, back: Float64Array[] = [], front: Float64Array[] = [];
      const go = 1 - (1 - u) ** 3;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996, k = Math.floor(((a / TAU) % 1) * n) % n, far = reach[k] + (0.12 + 0.45 * scatter(i, 4)) * go;
        // (Held inside the drawing box, give or take a spark: a long body's corners are near its edge already.)
        let x = f.cx + far * Math.cos(a), y = f.cy + far * Math.sin(a);
        const over = Math.max(Math.abs(x), Math.abs(y)) / BOX;
        if (over > 1) { x /= over; y /= over; }
        (i % 2 ? back : front).push(disc(x, y, dot(0.05 * (1 - 0.6 * u)), 8));
      }
      parts.push({ layer: 'back', role: 'accent', opacity: 1 - u, polys: back }, { layer: 'front', role: 'accent', opacity: 1 - u, polys: front });
      break;
    }
    case 'pulse': {
      // The outline itself, going out from the body and fading as it goes.
      const thick = Math.max(px, 0.05 * (1 - u) + 0.012);
      parts.push({ layer: 'back', role: 'accent', opacity: 0.6 * (1 - u) * clamp01(fx.amount || 1), polys: band(f.reach(), f.cx, f.cy, 0.04 + 0.45 * smooth(u), thick) });
      break;
    }
    case 'rings': {
      // Tilted rings round the body: the half behind it is drawn before the body, the half in front after it,
      // each with a light going round.
      const half = (f.x1 - f.x0) / 2, m = 40, w = Math.max(px, 0.045);
      for (let i = 0; i < RINGS.length; i++) {
        const show = ringShows(i, u);
        if (show <= 0) continue;
        const g = RINGS[i], a = g.size * half * (0.85 + 0.15 * show), b = a * g.flat, c = Math.cos(g.tilt), s = Math.sin(g.tilt);
        for (const front of [false, true]) {
          // Half the ring: [0, pi] is the near side (it is lower on screen, y down), [pi, 2 pi] the far side.
          const from = front ? 0 : Math.PI, outer = new Float64Array((m + 1) * 2), inner = new Float64Array((m + 1) * 2);
          for (let j = 0; j <= m; j++) {
            const ph = from + (j * Math.PI) / m, lx = a * Math.cos(ph), ly = b * Math.sin(ph);
            // Out along the ellipse's normal in the ring's own plane.
            const nx = b * Math.cos(ph), ny = a * Math.sin(ph), nl = Math.hypot(nx, ny) || 1, ox = (nx / nl) * (w / 2), oy = (ny / nl) * (w / 2);
            const px1 = lx + ox, py1 = ly + oy, px2 = lx - ox, py2 = ly - oy;
            outer[j * 2] = f.cx + px1 * c - py1 * s; outer[j * 2 + 1] = f.cy + px1 * s + py1 * c;
            inner[(m - j) * 2] = f.cx + px2 * c - py2 * s; inner[(m - j) * 2 + 1] = f.cy + px2 * s + py2 * c;
          }
          const strip = new Float64Array(outer.length + inner.length);
          strip.set(outer); strip.set(inner, outer.length);
          parts.push({ layer: front ? 'front' : 'back', role: 'accent', opacity: 0.75 * show, polys: [strip] });
        }
        const l = ringLight(i, fx.t, f);
        parts.push({ layer: l.front ? 'front' : 'back', role: 'accent', opacity: show, polys: [disc(l.x, l.y, dot(0.075), 12)] });
      }
      break;
    }
    case 'streaks': {
      // Speed lines streaming off the trailing edge.
      const env = Math.sin(Math.PI * u), h = (f.y1 - f.y0) / 2, edge = fx.dir > 0 ? f.x0 + 0.12 : f.x1 - 0.12, lines: Float64Array[] = [];
      if (env <= 0) break;
      for (let i = 0; i < 5; i++) {
        const y = f.cy + h * 0.75 * (i / 2 - 1), len = (0.45 + 0.5 * scatter(i, 5)) * env * (1 - 0.3 * Math.abs(i - 2) / 2);
        lines.push(streak(edge, y, len, Math.max(px / 2, 0.035), fx.dir));
      }
      parts.push({ layer: 'back', role: 'accent', opacity: 0.65 * env, polys: lines });
      break;
    }
    case 'zzz': {
      // Zs rising from the top of the head, growing and fading, one after another.
      const k = clamp01(fx.amount);
      if (k <= 0) break;
      for (let i = 0; i < 3; i++) {
        const s = frac((fx.t + 1000 * i) / 3000), x = f.cx + 0.42 + 0.48 * s, y = f.y0 + 0.08 - 0.5 * s, size = 0.12 + 0.14 * s;
        parts.push({ layer: 'front', role: 'accent', opacity: k * Math.sin(Math.PI * s), polys: [zed(x, y, Math.max(size, 4 * px))] });
      }
      break;
    }
  }
  return parts;
}
