// Loading figures: what the body can briefly turn into while a Bot thinks or works.
//
// A figure is drawn with what an avatar already has: one body colour and one eye colour. The body's outline
// blends into a disc (see morph.ts), and this file adds the rest: a hole wound the other way so the disc
// becomes a ring, a second ball in the body colour, or a mark in the eye colour.

import { smooth } from './ease';
import { polar } from './morph';

export type Form = 'orbit' | 'radar' | 'progress' | 'ring' | 'dots';
export const FORMS: readonly Form[] = ['orbit', 'radar', 'progress', 'ring', 'dots'];

/** A figure on screen. */
export interface Figure {
  form: Form;
  /** How far the body has become the figure: 0 the body, 1 the figure. */
  k: number;
  /** The figure's own turning, in radians, clockwise as drawn. */
  turn: number;
  /** 0..1, for the progress ring. */
  progress: number;
}

const TAU = 2 * Math.PI;
/** The radius of the disc the body becomes. */
const RADIUS: Record<Form, number> = { orbit: 0.6, radar: 0.9, progress: 0.9, ring: 0.88, dots: 0.24 };
/** The dots: where the two side dots end up, how big they are, and how much bigger a dot is at the top of its pulse. */
export const DOTS = { at: 0.62, r: 0.22, peak: 0.28 };
/** How big dot i (0 left, 1 the body, 2 right) is at the figure's turn: a pulse that runs along the row. */
export const dotPulse = (turn: number, i: number): number => { const w = frac(turn / TAU - i / 3); return 1 + DOTS.peak * (w < 0.45 ? Math.sin((Math.PI * w) / 0.45) : 0); };
export const figureRadius = (form: Form): number => RADIUS[form];

/** The body is a disc by 60% of the way in; the figure's own parts grow from 35%. */
export const discAt = (k: number): number => smooth(k / 0.6);
const grown = (k: number): number => smooth((k - 0.35) / 0.65);

/** The orbiting ball: how far out it circles and how big it is. */
export const ORBIT = { at: 0.9, r: 0.14 };
/** Ring thickness: the thin part and the thick part. */
const THIN = 0.08, THICK = 0.3;
/** The spinner's comet: how much of the round its tail takes. The rest is open. */
export const COMET = 0.66;

const frac = (x: number): number => x - Math.floor(x);

/**
 * The figure's parts beyond its disc, as flat screen polygons: `body` goes into the body's path (holes are
 * wound to cut out), `marks` are drawn in the eye colour. `n` is how many points round a circle; `px` is the
 * size of one drawn pixel in body units, so that a thin ring is never thinner than two pixels (at a pixel and
 * a bit the progress ring's track was a faint grey line on a 22 px avatar). `rim`
 * is the disc's own outline, n distances from the middle: the spinner draws it in to shape its comet.
 */
export function figureParts(fig: Figure, n: number, px: number, rim?: Float64Array): { body: Float64Array[]; marks: Float64Array[] } {
  const g = grown(fig.k), R = RADIUS[fig.form];
  const body: Float64Array[] = [], marks: Float64Array[] = [];
  if (g <= 0) return { body, marks };
  const thin = Math.max(THIN, 2 * px);
  if (fig.form === 'ring' || fig.form === 'progress') {
    const r = new Float64Array(n), p = fig.progress;
    // The spinner: a comet going round, with a round head at `turn` and a tail behind it that thins to
    // nothing. It has no track: past the tail the ring is open, which is what tells it from a progress ring
    // in a single frame. It comes up as a whole ring, thick at the head, and opens as the figure arrives:
    // the comet draws in from the disc's edge to the middle of the band, and where it has no thickness the
    // disc's outline and the hole's are the same line, with nothing between them.
    const mid = R - THICK / 2, cap = THICK / 2 / mid, open = fig.form === 'ring' ? smooth((fig.k - 0.45) / 0.55) : 0;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      let thick: number;
      if (fig.form === 'ring') {
        const behind = frac((fig.turn - a) / TAU), ahead = (1 - behind) * TAU;
        const half = behind < COMET ? (THICK / 2) * (1 - behind / COMET) : ahead < cap ? (THICK / 2) * Math.sqrt(1 - (ahead / cap) ** 2) : 0;
        thick = Math.max(thin, 2 * half);
        if (open >= 1) { r[i] = mid - half; if (rim) rim[i] = mid + half; continue; }
        if (open > 0) { r[i] = g * (R - thick + (mid - half - R + thick) * open); if (rim) rim[i] += (mid + half - rim[i]) * open; continue; }
      } else {
        // A thin track with a thick arc from the top, clockwise, as far as the progress.
        const along = frac((a + Math.PI / 2) / TAU + 0.5 / n);
        const filled = p <= 0 ? 0 : p >= 1 ? 1 : 1 - smooth((along - p) / 0.02);
        // (On a tiny avatar the arc is thickened with the track, so that done still stands out from to do.)
        thick = thin + (Math.max(THICK, 1.9 * thin) - thin) * filled;
      }
      // The hole opens from the middle.
      r[i] = g * (R - thick);
    }
    body.push(polar(r, true));
  } else if (fig.form === 'dots') {
    // Three dots: the body is the middle one, and the other two bud out of its sides. A pulse runs along them.
    const m = Math.max(12, n >> 1);
    body.push(polar(new Float64Array(m).fill(R * dotPulse(fig.turn, 1))));
    for (const side of [-1, 1]) {
      const r = Math.max(DOTS.r * g, 1.2 * px * g) * dotPulse(fig.turn, side < 0 ? 0 : 2);
      body.push(polar(new Float64Array(m).fill(r), false, side * (R * 0.5 + (DOTS.at - R * 0.5) * g), 0));
    }
  } else if (fig.form === 'orbit') {
    // A small ball that buds out of the body and circles it.
    const at = 0.25 + (ORBIT.at - 0.25) * g, r = ORBIT.r * g;
    const m = Math.max(12, n >> 1), ball = new Float64Array(m).fill(Math.max(r, 1.2 * px * g));
    body.push(polar(ball, false, at * Math.cos(fig.turn), at * Math.sin(fig.turn)));
  } else {
    // Radar: a scope drawn on the disc in the eye colour: a range ring, and a sweep going round.
    const reach = R - 0.13, wide = 0.62 * g, steps = Math.max(4, Math.ceil((wide / TAU) * n));
    const sweep = new Float64Array((steps + 2) * 2);
    for (let i = 0; i <= steps; i++) {
      const a = fig.turn - wide + (wide * i) / steps;
      sweep[(i + 1) * 2] = reach * Math.cos(a);
      sweep[(i + 1) * 2 + 1] = reach * Math.sin(a);
    }
    // The ring is wound as the sweep is, and its inside the other way, so the sweep shows across it.
    const line = Math.max(0.055, 1.1 * px), at = reach * g;
    marks.push(polar(new Float64Array(n).fill(at)), polar(new Float64Array(n).fill(at - line), true), sweep);
  }
  return { body, marks };
}
