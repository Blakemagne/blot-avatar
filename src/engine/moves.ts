// Moves in plain words. A move is a list of lines; each line is a part of the avatar, a verb, how far in units
// people think in (degrees, percent, body units, shares of a full look), and the shape it takes over the move:
//
//   export const wink = cue(900, { amountUpTo: 1 }, [
//     eyes.wink(toward).along(hold({ by: 14, till: 55, goneBy: 80 })),
//     head.lean(toward, 6).along(leaning),
//     eyes.glance(toward, 0.06).along(leaning),
//   ]);
//
// The rules a move must keep are built in, so a move written this way keeps them without trying: it only adds to
// the pose or scales it, it starts and ends at rest (checked when it is defined), a turn to a side follows the side
// it was played toward and is held to the room a look has left, a squash goes as far as the body gives, a jump as
// high as the body is light, effects show only while the move plays, and nothing is random.
//
// `cue`, `poke` and `move` compile the lines into an ordinary Clip once, when the move is defined; each frame then
// only works out each shape once and adds or scales the channels. Nothing is made per frame but the effects shown.
//
// Times inside a move are percent of the move: `peak(45, 12)` is a peak at 45% of the way through, 12% wide.

import { smooth, track } from './ease';
import { PERSONALITY, TAU, give, high, ring } from './feel';
import type { Channels, Clip, Lane, Personality, Playing, View } from './clips';
import type { FxKind } from './fx';
import { deg } from './math';

type Feel = Readonly<Personality>;
type ShapeFn = (p: Playing, f: Feel) => number;

/** A share of the move from a percent (14 is 0.14: the very number `0.14` is). */
const pc = (percent: number, what: string): number => {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error(`${what}: ${percent} is not a percent of the move (0 to 100)`);
  return percent / 100;
};

// ---------------------------------------------------------------------------------------------------------------
// Shapes: how much of a line shows through the move, 0 at rest. Built once, when the move is defined.

/** How much of a line shows at each moment of the move. Most shapes run from 0, up to about 1, and back to 0. */
export class Shape {
  /** @internal */ constructor(readonly fn: ShapeFn) {}
  /** This shape times another: an envelope over a wave, a fade over a swing. */
  times(other: Shape): Shape { const a = this.fn, b = other.fn; return new Shape((p, f) => a(p, f) * b(p, f)); }
  /** Comes in gently, all there by `percent` of the way through. */
  fadeIn(percent: number): Shape { const a = this.fn, by = pc(percent, 'fadeIn'); return by === 0 ? this : new Shape((p, f) => a(p, f) * smooth(p.u / by)); }
  /** Goes out gently from `percent` of the way through to the end. */
  fadeOut(percent: number): Shape { const a = this.fn, from = pc(percent, 'fadeOut'), w = 1 - from; return w === 0 ? this : new Shape((p, f) => a(p, f) * (1 - smooth((p.u - from) / w))); }
  /** Dwindles evenly to nothing over the move. */
  dwindling(): Shape { const a = this.fn; return new Shape((p, f) => a(p, f) * (1 - p.u)); }
  /** Bigger the wobblier the body (as much again at the most wobbly, half at the least; as it is at the engine's own feel). */
  byWobble(): Shape { const a = this.fn; return new Shape((p, f) => a(p, f) * (0.5 + f.wobble)); }
  /** How big it is, whichever way it goes (a squash that comes with a swing to either side). */
  size(): Shape { const a = this.fn; return new Shape((p, f) => Math.abs(a(p, f))); }
}

type Ease = 'gentle' | 'fast' | 'steady';
const EASE: Record<Ease, (q: number) => number> = {
  gentle: smooth,
  // Off at once and slowing into the beat (a dash).
  fast: (q) => 1 - (1 - q) ** 5,
  steady: (q) => q,
};

/**
 * Beats: where a line is, by when, as text. Each beat is `<how much> by <when>%`, or `hold till <when>%`, with
 * `fast` (off at once, slowing into it) or `steady` (an even pace) after it if it is not eased in and out:
 *
 *   beats('1 by 14%, hold till 55%, 0 by 80%')        up by 14%, held, gone by 80%
 *   beats('1 by 30%, -0.16 by 70%, 0 by 100%')        down, back a little past rest, settled
 *   beats('-0.24 by 18%, 1 by 45% fast, hold till 60%, 0 by 100%')
 *
 * It starts at 0, comes to rest at each beat, and must end at 0 (it stays at its last beat to the end).
 */
export function beats(text: string): Shape {
  const keys = [0, 0], eases: Ease[] = [];
  let last = 0;
  for (const raw of text.split(',')) {
    const beat = raw.trim().toLowerCase();
    if (!beat) continue;
    let m = /^hold\s+till\s+([\d.]+)\s*%(?:\s+(fast|steady))?$/.exec(beat);
    let value: number, when: number, ease: Ease;
    if (m) { value = keys[keys.length - 1]; when = pc(Number(m[1]), `beats '${text}'`); ease = 'gentle'; }
    else {
      m = /^(-?[\d.]+)\s+by\s+([\d.]+)\s*%(?:\s+(fast|steady))?$/.exec(beat);
      if (!m) throw new Error(`beats '${text}': cannot read '${raw.trim()}' (write '<how much> by <when>%' or 'hold till <when>%')`);
      value = Number(m[1]); when = pc(Number(m[2]), `beats '${text}'`); ease = (m[3] as Ease | undefined) ?? 'gentle';
      if (!Number.isFinite(value)) throw new Error(`beats '${text}': '${m[1]}' is not a number`);
    }
    if (!(when > last) && !(keys.length === 2 && when === 0 && last === 0)) throw new Error(`beats '${text}': each beat comes after the one before`);
    if (when === 0) { keys[1] = value; if (value !== 0) throw new Error(`beats '${text}': a move starts at rest (0 at 0%)`); continue; }
    keys.push(when, value); eases.push(ease); last = when;
  }
  if (keys.length < 4) throw new Error(`beats '${text}': no beats`);
  if (keys[keys.length - 1] !== 0) throw new Error(`beats '${text}': a move ends at rest: the last beat is 0`);
  // All eased in and out: exactly the engine's own track on these keys.
  if (eases.every((e) => e === 'gentle')) return new Shape((p) => track(keys, p.u));
  const fns = eases.map((e) => EASE[e]), n = fns.length;
  return new Shape((p) => {
    const u = p.u;
    if (u <= 0) return keys[1];
    for (let i = 0; i < n; i++) {
      const u0 = keys[2 * i], u1 = keys[2 * i + 2];
      if (u < u1) { const v0 = keys[2 * i + 1], v1 = keys[2 * i + 3]; return v0 === v1 ? v0 : v0 + (v1 - v0) * fns[i]((u - u0) / (u1 - u0)); }
    }
    return keys[keys.length - 1];
  });
}

/** Up to full by `by`% (eased), held till `till`%, and gone by `goneBy`% (the end, if not given). */
export function hold(t: { by: number; till: number; goneBy?: number }): Shape {
  return beats(`1 by ${t.by}%, hold till ${t.till}%, 0 by ${t.goneBy ?? 100}%`);
}
/** A soft peak at `at`% of the way through, nothing further than `wide`% either side of it. */
export function peak(at: number, wide: number): Shape {
  const a = pc(at, 'peak'), w = pc(wide, 'peak');
  if (!(w > 0)) throw new Error('peak: it is some width wide (more than 0%)');
  return new Shape((p) => Math.max(0, 1 - ((p.u - a) / w) ** 2) ** 2);
}
/** In the air from `from`% to `to`%, like a thrown ball: up fast, hanging, down fast (not eased); 1 at the top. */
export function flight(from: number, to: number): Shape {
  const a = pc(from, 'flight'), b = pc(to, 'flight'), w = b - a;
  if (!(w > 0)) throw new Error('flight: it lands after it leaves');
  return new Shape((p) => { const u = p.u; return u > a && u < b ? 4 * ((u - a) / w) * (1 - (u - a) / w) : 0; });
}
/** Up and back down once over the whole move, gently at both ends. */
export const hump = (): Shape => new Shape((p) => Math.sin(Math.PI * p.u) ** 2);
/** Even swings back and forth, `times` whole swings over the move; `ahead` starts it that share of one swing early (the eyes a beat ahead). */
export function wave(times: number, opts: { ahead?: number } = {}): Shape {
  const w = TAU * times, ph = TAU * (opts.ahead ?? 0);
  return ph === 0 ? new Shape((p) => Math.sin(w * p.u)) : new Shape((p) => Math.sin(w * p.u + ph));
}
/**
 * A swing that starts at nothing and dies away, in real time: `perSecond` swings a second, dying by `dies` per
 * second. A move stretched to take longer swings at the same pace. It never quite stops: end it with `.fadeOut(%)`.
 */
export function wobble(perSecond: number, opts: { dies: number }): Shape {
  const d = opts.dies;
  return new Shape((p) => { const t = (p.u * p.ms) / 1000; return Math.exp(-d * t) * Math.sin(2 * Math.PI * perSecond * t); });
}
/** Up to full by `by`% and dying away from there by `dies` (per whole move), as a surge does. End it with `.fadeOut(%)`. */
export function surge(by: number, opts: { dies: number }): Shape {
  const b = pc(by, 'surge'), d = opts.dies;
  return new Shape((p) => (b === 0 ? 1 : smooth(p.u / b)) * Math.exp(-d * Math.max(0, p.u - b)));
}
/**
 * Pulled sharply by `by`%, then springing back past where it was and ringing out: a lighter body swings
 * faster, a stiffer one stops sooner. End it with `.fadeOut(%)`.
 */
export function snapBack(by: number): Shape {
  const b = pc(by, 'snapBack');
  if (!(b > 0)) throw new Error('snapBack: it is pulled over some of the move (more than 0%)');
  return new Shape((p, f) => {
    if (p.u < b) return smooth(p.u / b);
    const t = ((p.u - b) * p.ms) / 1000;
    return Math.cos(TAU * (2.2 + 1.5 * (1 - f.weight)) * t) * Math.exp(-(2 + 6 * (1 - f.wobble)) * t);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Lines: a part of the avatar, a verb, a size and a shape.

/** The side a move goes to: `toward` the side it was played toward, or `away` from it. */
export type Side = 'toward' | 'away';
export const toward: Side = 'toward', away: Side = 'away';

type AddCh = 'yaw' | 'pitch' | 'roll' | 'eyeX' | 'eyeY' | 'lift' | 'x' | 'arc' | 'glow' | 'antL' | 'antR';
type ScaleCh = 'stretch' | 'scale' | 'open' | 'eyeScale';
/** What the avatar's feel does to a part: how far it gives, how high it goes, how much it flares. */
type FeelBy = 'give' | 'high' | 'flare' | null;
interface Part { size: number; side: 0 | 1 | -1; room: boolean; feel: FeelBy; amount: boolean; shape: Shape; flaresOnly: boolean }

const ADD: Record<AddCh, (o: Channels, x: number) => void> = {
  yaw: (o, x) => { o.yaw += x; }, pitch: (o, x) => { o.pitch += x; }, roll: (o, x) => { o.roll += x; },
  eyeX: (o, x) => { o.eyeX += x; }, eyeY: (o, x) => { o.eyeY += x; }, lift: (o, x) => { o.lift += x; },
  x: (o, x) => { o.x += x; }, arc: (o, x) => { o.arc += x; }, glow: (o, x) => { o.glow += x; },
  antL: (o, x) => { o.antL += x; }, antR: (o, x) => { o.antR += x; },
};
const SCALE: Record<ScaleCh, (o: Channels, x: number) => void> = {
  stretch: (o, x) => { o.stretch *= x; }, scale: (o, x) => { o.scale *= x; }, open: (o, x) => { o.open *= x; }, eyeScale: (o, x) => { o.eyeScale *= x; },
};

/** What a compiled line runs each frame: `vals` holds this frame's shapes, `a` the cue's amount (capped). */
type Run = (o: Channels, p: Playing, v: View, f: Feel, a: number, vals: Float64Array) => void;
type Slot = (s: Shape) => number;

/** One line of a move. */
export abstract class Line {
  /** What it says, for an error. @internal */ label = 'a line';
  /** @internal */ offRest: string | null = null;
  /** @internal */ abstract compile(slot: Slot): Run;
  /**
   * This line is not at rest at the start or the end of the move, and that is known (say why). Without it, a line
   * that is not at rest at both ends is refused when the move is defined.
   */
  notAtRest(why: string): this { this.offRest = why; return this; }
}

/** One part's number this frame: side and size, the room left, the feel, then the amount times the shape. */
function partRun(pt: Part, k: number): (p: Playing, v: View, f: Feel, a: number, vals: Float64Array) => number {
  const c = pt.size, side = pt.side, room = pt.room, feel = pt.feel, amount = pt.amount, only = pt.flaresOnly;
  return (p, v, f, a, vals) => {
    // (A part that flares shows only on a body that flares.)
    if (only && !(f.flare > 0)) return 0;
    let n = side === 0 ? c : side === 1 ? p.cue.dir * c : -p.cue.dir * c;
    if (room) n = n * v.room;
    if (feel === 'give') n = n * give(f); else if (feel === 'high') n = n * high(f); else if (feel === 'flare') n = n * f.flare;
    return amount ? n * (a * vals[k]) : n * vals[k];
  };
}

/** A line on one channel, of one part or of several joined with `.and`. */
export class Verb extends Line {
  private parts: Part[] = [];
  private pending: Omit<Part, 'shape'> | null = null;
  /** @internal */ constructor(readonly ch: AddCh | ScaleCh, readonly scales: boolean, private room: boolean, private feel: FeelBy, label: string) { super(); this.label = label; }
  /** @internal */ begin(size: number, side: Side | null, feel: FeelBy = this.feel): this {
    if (this.pending) throw new Error(`${this.label}: give it a shape with .along(...) before .and`);
    if (!Number.isFinite(size)) throw new Error(`${this.label}: ${size} is not a size`);
    this.pending = { size, side: side === null ? 0 : side === 'toward' ? 1 : -1, room: this.room, feel, amount: true, flaresOnly: feel === 'flare' };
    return this;
  }
  /** The shape it takes over the move. */
  along(shape: Shape): this {
    if (!this.pending) throw new Error(`${this.label}: .along(...) comes once, after the verb`);
    this.parts.push({ ...this.pending, shape }); this.pending = null; return this;
  }
  private lastPart(what: string): Part {
    const pt = this.parts[this.parts.length - 1];
    if (!pt || this.pending) throw new Error(`${this.label}: .${what}() comes after .along(...)`);
    return pt;
  }
  /** The same on every body: not changed by how far the body gives or how light it is. */
  ignoringFeel(): this { this.lastPart('ignoringFeel').feel = null; return this; }
  /** Not held to the room a look has left (a move that goes round, not toward a side). */
  ignoringRoom(): this { this.lastPart('ignoringRoom').room = false; return this; }
  /** As big however hard the move is played (it still shows only while the move does). */
  ignoringAmount(): this { this.lastPart('ignoringAmount').amount = false; return this; }
  /** Another part on the same channel, summed with this one before it is applied: one factor, not two. */
  get and(): this { return this; }
  // The verbs that read on after `.and`: each must be on this line's channel.
  // (Each keeps its own feel: a rise after a jump is the same on every body, a flare after a glow only on one that flares.)
  stretch(percent: number): this { return this.same('stretch', percent / 100, 'give'); }
  squash(percent: number): this { return this.same('stretch', -percent / 100, 'give'); }
  swell(percent: number): this { return this.same('scale', percent / 100, 'give'); }
  shrink(percent: number): this { return this.same('scale', -percent / 100, 'give'); }
  rise(units: number): this { return this.same('lift', units, null); }
  jump(units: number): this { return this.same('lift', units, 'high'); }
  glow(amount: number): this { return this.same('glow', amount, null); }
  flares(amount: number): this { return this.same('glow', amount, 'flare'); }
  private same(ch: AddCh | ScaleCh, size: number, feel: FeelBy): this {
    if (ch !== this.ch) throw new Error(`${this.label}: .and joins parts on one channel, and ${ch} is not ${this.ch}`);
    return this.begin(size, null, feel);
  }
  /**
   * What this line puts on its channel this frame: a factor (1 + its parts) on a channel that scales, a term (its
   * parts summed) on one that adds. @internal
   */
  term(slot: Slot): Term {
    if (this.pending || !this.parts.length) throw new Error(`${this.label}: it has no shape (end it with .along(...))`);
    const runs = this.parts.map((pt) => partRun(pt, slot(pt.shape)));
    const one = runs[0], n = runs.length, ch = this.ch, scales = this.scales;
    if (scales) {
      if (n === 1) return { ch, scales, fn: (p, v, f, a, vals) => 1 + one(p, v, f, a, vals) };
      return { ch, scales, fn: (p, v, f, a, vals) => { let s = 1; for (let i = 0; i < n; i++) s += runs[i](p, v, f, a, vals); return s; } };
    }
    if (n === 1) return { ch, scales, fn: one };
    return { ch, scales, fn: (p, v, f, a, vals) => { let s = 0; for (let i = 0; i < n; i++) s += runs[i](p, v, f, a, vals); return s; } };
  }
  /** @internal */ compile(slot: Slot): Run { return channelRun([this.term(slot)]); }
}

/** A line's share of one channel this frame. */
interface Term { ch: AddCh | ScaleCh; scales: boolean; fn: (p: Playing, v: View, f: Feel, a: number, vals: Float64Array) => number }

/**
 * One write to a channel for every line of a move on it: the factors multiplied, or the terms summed, first. So a
 * move played on top of anything comes out exactly as that and the move alone, put together.
 */
function channelRun(terms: Term[]): Run {
  const n = terms.length, first = terms[0].fn, fns = terms.map((t) => t.fn);
  if (terms[0].scales) {
    const set = SCALE[terms[0].ch as ScaleCh];
    if (n === 1) return (o, p, v, f, a, vals) => set(o, first(p, v, f, a, vals));
    return (o, p, v, f, a, vals) => { let k = first(p, v, f, a, vals); for (let i = 1; i < n; i++) k = k * fns[i](p, v, f, a, vals); set(o, k); };
  }
  const add = ADD[terms[0].ch as AddCh];
  if (n === 1) return (o, p, v, f, a, vals) => add(o, first(p, v, f, a, vals));
  return (o, p, v, f, a, vals) => { let s = first(p, v, f, a, vals); for (let i = 1; i < n; i++) s = s + fns[i](p, v, f, a, vals); add(o, s); };
}

const verb = (label: string, ch: AddCh | ScaleCh, scales: boolean, room: boolean, feel: FeelBy, size: number, side: Side | null = null): Verb =>
  new Verb(ch, scales, room, feel, label).begin(size, side);

/** The whole avatar's pose: turns, leans and nods, in degrees. */
export const head = {
  /** Turns its face toward a side (no further than the room a look has left). */
  turn: (side: Side, degrees: number) => verb(`head.turn(${side}, ${degrees})`, 'yaw', false, true, null, deg(degrees), side),
  /** Leans over toward a side. */
  lean: (side: Side, degrees: number) => verb(`head.lean(${side}, ${degrees})`, 'roll', false, false, null, deg(degrees), side),
  /** Leans to its right whichever side the move was played toward (for a sway that goes both ways in turn). */
  sway: (degrees: number) => verb(`head.sway(${degrees})`, 'roll', false, false, null, deg(degrees)),
  /** Nods down. */
  dip: (degrees: number) => verb(`head.dip(${degrees})`, 'pitch', false, false, null, -deg(degrees)),
  /** Tips its face up. */
  raise: (degrees: number) => verb(`head.raise(${degrees})`, 'pitch', false, false, null, deg(degrees)),
};

/** Where the body is and its size: body units (1 is about the body's radius) and percent. */
export const body = {
  /** Up off the ground, the same for every body. */
  rise: (units: number) => verb(`body.rise(${units})`, 'lift', false, false, null, units),
  /** Up off the ground as a jump: a heavy body goes less high, a light one higher. */
  jump: (units: number) => verb(`body.jump(${units})`, 'lift', false, false, 'high', units),
  /** Moved toward a side. */
  slide: (side: Side, units: number) => verb(`body.slide(${side}, ${units})`, 'x', false, false, null, units, side),
  /** Taller and thinner (a body that gives more goes further). */
  stretch: (percent: number) => verb(`body.stretch(${percent})`, 'stretch', true, false, 'give', percent / 100),
  /** Shorter and wider (a body that gives more goes further). */
  squash: (percent: number) => verb(`body.squash(${percent})`, 'stretch', true, false, 'give', -percent / 100),
  /** Bigger all over. */
  swell: (percent: number) => verb(`body.swell(${percent})`, 'scale', true, false, 'give', percent / 100),
  /** Smaller all over. */
  shrink: (percent: number) => verb(`body.shrink(${percent})`, 'scale', true, false, 'give', -percent / 100),
  /** Glows, for a renderer that draws a glow (1 is a full glow). */
  glow: (amount: number) => verb(`body.glow(${amount})`, 'glow', false, false, null, amount),
  /** Glows only if the body is one that flares, as much as it flares. */
  flares: (amount: number) => verb(`body.flares(${amount})`, 'glow', false, false, 'flare', amount),
  /** A wobbly body rings on after it lands at `percent` of the way through (nothing at the engine's own feel). */
  ringsOutAfter: (percent: number) => new RingOut(pc(percent, 'body.ringsOutAfter')),
  /** Rocks toward a side about a point `below` body units under its middle, like a toy that will not fall over. */
  rock: (side: Side, degrees: number, opts: { below: number }) => new Rock(side, deg(degrees), opts.below),
};

/** The eyes: looks in shares of a full look (1 is as far as a look goes), opening and size in percent. */
export const eyes = {
  /** A look toward a side (no further than the room a look has left). */
  glance: (side: Side, look: number) => verb(`eyes.glance(${side}, ${look})`, 'eyeX', false, true, null, look, side),
  /** A look up. */
  up: (look: number) => verb(`eyes.up(${look})`, 'eyeY', false, false, null, look),
  /** A look down. */
  down: (look: number) => verb(`eyes.down(${look})`, 'eyeY', false, false, null, -look),
  /** Opened wider (taller). */
  widen: (percent: number) => verb(`eyes.widen(${percent})`, 'open', true, false, null, percent / 100),
  /** Narrowed, a squint (100 is shut). */
  narrow: (percent: number) => verb(`eyes.narrow(${percent})`, 'open', true, false, null, -percent / 100),
  /** Bigger and rounder. */
  grow: (percent: number) => verb(`eyes.grow(${percent})`, 'eyeScale', true, false, null, percent / 100),
  /** Bent into the happy arches of a smile (1 is a full smile). */
  smile: (amount: number) => verb(`eyes.smile(${amount})`, 'arc', false, false, null, amount),
  /** The eye on that side shuts (the shape's 1 is shut). */
  wink: (side: Side) => new Wink(side),
  /** Round and round, `across` and `up` in shares of a full look, once every `everyMs` ms. */
  circle: (across: number, up: number, opts: { everyMs: number }) => new Circle(across, up, opts.everyMs),
};

/** Antennas, on a body that has them: degrees outward (in, if less than 0). */
export const antennas = {
  spread: (degrees: number) => new Spread(deg(degrees)),
};

/** A line of one shape that is not a plain size on one channel. */
abstract class Shaped extends Line {
  protected shape: Shape | null = null;
  /** The shape it takes over the move. */
  along(s: Shape): this { this.shape = s; return this; }
  protected slotOf(slot: Slot): number { if (!this.shape) throw new Error(`${this.label}: it has no shape (end it with .along(...))`); return slot(this.shape); }
}
class Wink extends Shaped {
  constructor(private side: Side) { super(); this.label = `eyes.wink(${side})`; }
  compile(slot: Slot): Run {
    const k = this.slotOf(slot), sg = this.side === 'toward' ? 1 : -1;
    return (o, p, _v, _f, a, vals) => { const x = a * vals[k]; if (sg * p.cue.dir > 0) o.winkR += x; else o.winkL += x; };
  }
}
class Circle extends Shaped {
  constructor(private across: number, private up: number, private every: number) { super(); this.label = 'eyes.circle'; }
  compile(slot: Slot): Run {
    const k = this.slotOf(slot), ax = this.across, ay = this.up, ms = this.every;
    // (Not held to the room a look has left: it goes round, not toward a side, and the rig keeps the eyes inside a full look.)
    return (o, p, _v, _f, a, vals) => { const env = a * vals[k], ph = (p.at / ms) * TAU; o.eyeX += ax * env * Math.cos(ph); o.eyeY -= ay * env * Math.sin(ph); };
  }
}
class Spread extends Shaped {
  constructor(private size: number) { super(); this.label = 'antennas.spread'; }
  compile(slot: Slot): Run {
    const k = this.slotOf(slot), c = this.size;
    return (o, _p, _v, _f, a, vals) => { const x = c * (a * vals[k]); o.antL += x; o.antR += x; };
  }
}
class Rock extends Shaped {
  constructor(private side: Side, private size: number, private below: number) { super(); this.label = `body.rock(${side})`; }
  compile(slot: Slot): Run {
    const k = this.slotOf(slot), c = this.size, below = this.below, sg = this.side === 'toward' ? 1 : -1;
    // The lean turns it, and moving it the other way keeps the point below still.
    return (o, p, _v, _f, a, vals) => { const r = a * sg * p.cue.dir * c * vals[k]; o.roll += r; o.x += below * Math.sin(r); };
  }
}
class RingOut extends Line {
  constructor(private after: number) { super(); this.label = 'body.ringsOutAfter'; }
  compile(): Run {
    const after = this.after;
    return (o, p, _v, f, a) => { if (p.u > after) o.stretch *= 1 + a * ring(f, (p.u - after) * p.ms, 1 - p.u); };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Effects: shown only while the move plays (and while `during` says) and the move is played at all; as big as
// the move is played, at most 1; one that has a way to go follows the move's side.

class Effect extends Line {
  private from = 0; private to = 1; private done: number | null = null;
  constructor(private kind: FxKind, private sided: boolean, private clock = false) { super(); this.label = `effect ${kind}`; }
  /** Shown from `from`% to `to`% of the way through, playing from its start to its end over that time. */
  during(from: number, to: number): this {
    const a = pc(from, `${this.label}.during`), b = pc(to, `${this.label}.during`);
    if (!(b > a)) throw new Error(`${this.label}: it shows for some of the move`);
    this.from = a; this.to = b; return this;
  }
  /** It reaches its end by `percent` of the way through and stays there until it goes. */
  doneBy(percent: number): this { this.done = pc(percent, `${this.label}.doneBy`); return this; }
  compile(): Run {
    if (this.done !== null && !(this.done > this.from && this.done <= this.to)) throw new Error(`${this.label}: it is done after it starts showing and before it goes`);
    const kind = this.kind, from = this.from, to = this.to, w = (this.done ?? to) - from, clamp = this.done !== null, sided = this.sided, clock = this.clock;
    return (o, p, _v, _f, a) => {
      const u = p.u;
      if (!(u > from && u < to && a > 0)) return;
      const q = (u - from) / w;
      o.fx.push({ kind, u: clamp && q > 1 ? 1 : q, t: clock ? p.at : 0, dir: sided ? p.cue.dir : 1, amount: a < 1 ? a : 1 });
    };
  }
}
/** Sparks thrown up and out from the top of the head, toward the move's side. */
export const sparks = (): Effect => new Effect('spray', true);
/** Sparks flying off from all round the edge. */
export const sparksAllRound = (): Effect => new Effect('burst', false);
/** A "!" that gathers out of sparks beside the head, holds, and falls apart. */
export const exclamation = (): Effect => new Effect('bang', false);
/** The body's own outline going out from it. */
export const pulse = (): Effect => new Effect('pulse', false);
/** Tilted rings round the body, passing behind it and in front, a light going round each. */
export const orbits = (): Effect => new Effect('rings', false, true);
/** Speed lines streaming off behind it, away from the move's side. */
export const speedLines = (): Effect => new Effect('streaks', true);

// ---------------------------------------------------------------------------------------------------------------
// The way out: a line written in the channels' own arithmetic, for a move that is not a size times a shape (the
// spin's half turn, the eyes going to dots). It must keep the rules itself, and is still checked for rest.

export function byHand(apply: (o: Channels, p: Playing, v: View) => void, label = 'byHand'): Line {
  const line = new (class extends Line { compile(): Run { return (o, p, v) => apply(o, p, v); } })();
  line.label = label;
  return line;
}

// ---------------------------------------------------------------------------------------------------------------
// The move.

export interface MoveOptions {
  /** Played harder than this, it moves as if played with this (unset: as hard as it is played, up to 2). */
  amountUpTo?: number;
}

const FEELS: readonly Feel[] = [
  PERSONALITY,
  { weight: 0, squash: 0, wobble: 0, flare: 0, float: 0 },
  { weight: 1, squash: 1, wobble: 1, flare: 1, float: 1 },
  { weight: 0, squash: 1, wobble: 1, flare: 1, float: 0 },
  { weight: 1, squash: 0, wobble: 0, flare: 0.5, float: 0 },
];
/** How near rest a line must be at the very start and end of its move. */
const REST = 1e-9;
const REST_CHANNELS: Readonly<Channels> = { yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0, x: 0, arc: 0, winkL: 0, winkR: 0, glow: 0, fx: [] };

/** Refuse a line that is not at rest at the start and end of its move, at any side, amount and feel. */
function atRest(clip: Clip, line: Line, run: Run, shapes: ShapeFn[], vals: Float64Array, cap: number): void {
  if (line.offRest !== null) return;
  for (const u of [0, 1]) for (const dir of [1, -1]) for (const amount of [1, 2]) for (const f of FEELS) {
    const p: Playing = { clip, at: u * clip.ms, u, cue: { dir, amount, from: 0 }, ms: clip.ms };
    const v: View = { yaw: 0, room: 1, feel: f };
    for (let i = 0; i < shapes.length; i++) vals[i] = shapes[i](p, f);
    const o: Channels = { ...REST_CHANNELS, fx: [] };
    run(o, p, v, f, amount < cap ? amount : cap, vals);
    for (const key of Object.keys(REST_CHANNELS) as (keyof Channels)[]) {
      if (key === 'fx') { if (o.fx.length) throw new Error(`${line.label}: it shows an effect at the ${u ? 'end' : 'start'} of the move`); continue; }
      const d = Math.abs((o[key] as number) - (REST_CHANNELS[key] as number));
      if (!(d <= REST)) {
        throw new Error(`${line.label}: it is not at rest at the ${u ? 'end' : 'start'} of the move (${key} is off by ${d.toPrecision(3)}). Shape it to 0 there, or say why with .notAtRest('...')`);
      }
    }
  }
}

/** A move in a lane: the rig's own lanes (blink, wait, ...) as well as 'poke' and 'cue'. Inside the engine only. */
export function move(lane: Lane, ms: number, opts: MoveOptions, lines: readonly Line[]): Clip {
  if (!(Number.isFinite(ms) && ms > 0)) throw new Error(`a move takes a time over 0 ms, not ${ms}`);
  if (opts.amountUpTo !== undefined && !(opts.amountUpTo > 0 && opts.amountUpTo !== Infinity)) throw new Error(`amountUpTo is an amount over 0, not ${opts.amountUpTo}`);
  const shapes: ShapeFn[] = [], at = new Map<Shape, number>();
  const slot: Slot = (s) => { let i = at.get(s); if (i === undefined) { i = shapes.length; shapes.push(s.fn); at.set(s, i); } return i; };
  // Every line on one channel joins the first line on it, in one write (channelRun); the others run where they are.
  const groups = new Map<string, Term[]>(), order: (Run | Term[])[] = [];
  for (const l of lines) {
    if (!(l instanceof Verb)) { order.push(l.compile(slot)); continue; }
    const t = l.term(slot);
    const g = groups.get(t.ch);
    if (g) g.push(t); else { const terms = [t]; groups.set(t.ch, terms); order.push(terms); }
  }
  const runs = order.map((r) => (typeof r === 'function' ? r : channelRun(r))), n = runs.length, m = shapes.length;
  // This frame's shapes, each worked out once (two lines may share one). Written and read inside one apply, and
  // apply never runs inside another, so every avatar playing this move can share it.
  const vals = new Float64Array(m), cap = opts.amountUpTo ?? Infinity;
  const clip: Clip = {
    lane, ms,
    apply(o, p, v) {
      const f = v.feel ?? PERSONALITY, am = p.cue.amount, a = am < cap ? am : cap;
      for (let i = 0; i < m; i++) vals[i] = shapes[i](p, f);
      for (let i = 0; i < n; i++) runs[i](o, p, v, f, a, vals);
    },
  };
  for (const l of lines) atRest(clip, l, l.compile(slot), shapes, vals, cap);
  return clip;
}

/** A move anyone may play by name (Rig.play, mount's play, RigOptions.clips). */
export function cue(ms: number, optsOrLines: MoveOptions | readonly Line[], lines?: readonly Line[]): Clip {
  return Array.isArray(optsOrLines) ? move('cue', ms, {}, optsOrLines as readonly Line[]) : move('cue', ms, optsOrLines as MoveOptions, lines ?? []);
}
/** A move a poke plays (a click on the avatar): always played at amount 1. */
export function poke(ms: number, lines: readonly Line[]): Clip { return move('poke', ms, {}, lines); }
