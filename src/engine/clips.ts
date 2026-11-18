// Clips: the little moves of the Bot's avatar as data. A clip is a curve over a fixed time that adds to the
// pose the rig's springs give (or scales it), and ends exactly where it began. The rig keeps one frame's sum
// of them in `Channels`, plays each clip at a fixed place in its step, and owns everything that is not a
// curve over a fixed time (the springs, the random timing, the loops of what the Bot is doing).
//
// To add a move: an entry in CLIPS (or, from outside this package, in RigOptions.clips). It may read only
// what `View` gives it and what it was started with; it draws no random numbers.

import { smooth, track } from './ease';
import { BLINK_HEIGHT } from './faces';
import type { Fx } from './fx';
import { deg } from './math';

/** What one frame of moves adds to the springs' pose. The rig resets it every step. */
export interface Channels {
  /** Radians added to the pose (start 0). */
  yaw: number; pitch: number; roll: number;
  /** Look units added to the eyes (start 0). */
  eyeX: number; eyeY: number;
  /** Body units off the ground (start 0). */
  lift: number;
  /** Factors (start 1): taller, bigger, eyes more open. */
  stretch: number; scale: number; open: number;
  /** Set by the figure and the change of shape; a clip may multiply eyeScale. */
  eyeScale: number; dot: number;
  /**
   * Radians added to each antenna's swing, the viewer's left and right (start 0). Positive swings the tip
   * outward, away from the middle. Only a body with antennas shows them.
   */
  antL: number; antR: number;
  /** Body units the body is moved to the right (start 0). */
  x: number;
  /** Added to the eyes' bend (start 0): positive curves them into the arches of a smile. */
  arc: number;
  /** How far the viewer's left and right eye are closed on top of the blink, 0..1 each (start 0): a wink. */
  winkL: number; winkR: number;
  /** A glow, 0..1 (start 0), for a renderer that draws one. Nothing in the paths changes with it. */
  glow: number;
  /** The effects showing this frame (start empty): a clip pushes the ones it draws. */
  fx: Fx[];
}

/**
 * What the avatar is like to move, each 0..1. The engine's own feel is PERSONALITY: weight, squash and wobble at
 * 0.5, flare and float at 0; every clip moves exactly as it always did there. A heavy body hops lower and lands harder; one that squashes more stretches further; a
 * wobbly one rings after it lands; one that flares glows as it moves; one that floats hovers off the ground.
 */
export interface Personality { weight: number; squash: number; wobble: number; flare: number; float: number }
export const PERSONALITY: Readonly<Personality> = { weight: 0.5, squash: 0.5, wobble: 0.5, flare: 0, float: 0 };

/**
 * What a clip may read: the body's turn from its spring (before any clip), the room a look has left,
 * 1 - min(1, |eyeX| / most) (none through the middle of a spin), and what the avatar is like (left out, the
 * engine's own feel).
 */
export interface View { readonly yaw: number; readonly room: number; readonly feel?: Readonly<Personality> }

/** Fixed when a clip starts. dir is +1 or -1; amount is 0..2; from is where a replaced clip left off (pop and dots). */
export interface Cue { dir: number; amount: number; from: number }

/** A clip that is playing: `at` ms in, `u` = at / ms. `ms` is how long this playing of it takes (the clip's own, unless it was stretched). */
export interface Playing { readonly clip: Clip; at: number; u: number; readonly cue: Cue; readonly ms: number }

/**
 * Where a clip plays in the rig's step. 'poke' and 'cue' are for anyone; the others are the rig's own: 'pop'
 * is emphasis(), 'blink' the blink, 'wait' the waiting nod, 'change' the eyes going to dots in a change of
 * shape, and 'mood' the jolt of a face coming on.
 */
export type Lane = 'poke' | 'cue' | 'pop' | 'blink' | 'wait' | 'change' | 'mood';

export interface Clip {
  readonly lane: Lane;
  /** How long it plays, in ms: finite, more than 0. */
  readonly ms: number;
  /** One frame, u in [0, 1). The clip owns its operators, so the order of the arithmetic is the clip's. No randomness. */
  apply(o: Channels, p: Playing, v: View): void;
}

/** Start a clip. `ms` stretches it (a slow blink): its move is the same, over a longer or shorter time. */
export function start(clip: Clip, cue?: Partial<Cue>, ms?: number): Playing {
  return { clip, at: 0, u: 0, cue: { dir: 1, amount: 1, from: 0, ...cue }, ms: ms !== undefined && Number.isFinite(ms) && ms > 0 ? ms : clip.ms };
}

/**
 * Play one frame of a clip: dt ms further in, and applied, or null once it is over (u >= 1: the frame that
 * reaches the end is not applied, and the move is back where it began).
 */
export function advance(p: Playing | null, dtMs: number, o: Channels, v: View): Playing | null {
  if (!p) return null;
  p.at += dtMs;
  const u = p.at / (p.ms ?? p.clip.ms);
  if (u >= 1) return null;
  p.u = u;
  p.clip.apply(o, p, v);
  return p;
}

export type PokeKind = 'spin' | 'nod' | 'hop';

/** How long each poke takes, start to rest. */
export const POKE_MS: Record<PokeKind, number> = { spin: 560, nod: 420, hop: 560 };
/** A nod dips this far, and the body is this much shorter at the bottom of it. */
export const NOD = deg(16), NOD_SQUASH = 0.05;
/** A hop: how high (body units), and when it leaves the ground and lands (share of the poke). */
export const HOP_HEIGHT = 0.4, HOP_UP = 0.19, HOP_DOWN = 0.74;
/** Squash and stretch through a hop: down, up long, round at the top, long again, down on landing, a rebound. */
export const HOP_STRETCH = [0, 1, 0.17, 0.89, 0.3, 1.11, 0.47, 1.02, 0.66, 1.07, 0.79, 0.88, 0.9, 1.03, 1, 1];
/** An emphasis pop. */
export const POP_MS = 380, POP = 0.16;
/** A blink, start to end, in ms. */
export const BLINK_MS = 150;
/** Waiting: a small nod now and then. */
export const WAIT_NOD = deg(7), WAIT_NOD_MS = 460;
/** A change of shape: the eyes shrink to dots and come back over this long. */
export const DOTS_MS = 420;
export const TAU = 2 * Math.PI;
/** A shake of the head, "no" or "can't do that": how long, how far it turns and leans, and how far the eyes go. */
export const SHAKE_MS = 700, SHAKE_YAW = deg(16), SHAKE_ROLL = deg(2), SHAKE_EYES = 0.3;
/** A bounce, "done!": how long, and how high the first hop goes (body units; the second is a little over half that). */
export const BOUNCE_MS = 720, BOUNCE_HEIGHT = 0.26;
/** A tilt of the head, "hm?": how long, start to back, and how far it leans. */
export const TILT_MS = 1100, TILT_ROLL = deg(10);

/** The engine's own feel, for a clip read without one. */
const feel = (v: View): Readonly<Personality> => v.feel ?? PERSONALITY;
/** How much further every squash and stretch goes: 1 at the engine's own feel, 0.4 for a body that hardly gives, 1.6 for one that is all give. */
export const give = (f: Readonly<Personality>): number => 0.4 + 1.2 * f.squash;
/** How high it goes: 1 at the engine's own feel, 1.5 for the lightest body, 0.5 for the heaviest. */
export const high = (f: Readonly<Personality>): number => 1.5 - f.weight;
/**
 * The ring of a wobbly body after it lands, `ms` after the landing, faded out by `left` (what is left of the
 * clip, 0..1): nothing at the engine's own feel or less, a few quick swings that die away above it.
 */
export function ring(f: Readonly<Personality>, ms: number, left: number): number {
  const w = Math.max(0, f.wobble - 0.5) * 2;
  if (w === 0) return 0;
  const t = ms / 1000;
  return 0.07 * w * Math.exp(-(9 - 4 * w) * t) * Math.sin(TAU * (3.2 + 1.5 * (1 - f.weight)) * t) * smooth(left / 0.15);
}
/** A soft bump: 0 away from `at`, 1 at it, over `wide` each side. */
export const bump = (u: number, at: number, wide: number): number => Math.max(0, 1 - ((u - at) / wide) ** 2) ** 2;
/** A blink is shut this far through it: it shuts quickly and opens again more slowly. */
export const BLINK_SHUT = 0.42;
/** How far shut a blink is, 0..1, through it. */
export const blinkCurve = (u: number): number => (u < BLINK_SHUT ? Math.sin((Math.PI / 2) * (u / BLINK_SHUT)) ** 2 : Math.sin((Math.PI / 2) * ((1 - u) / (1 - BLINK_SHUT))) ** 2);
/** A damped swing that starts at nothing: `t` seconds in, `hz` swings a second, dying away at `decay` per second. */
const swing = (t: number, hz: number, decay: number): number => Math.exp(-decay * t) * Math.sin(2 * Math.PI * hz * t);
/** A thrown ball's arc between u = a and u = b: 0 at both, 1 in the middle. */
const arc = (u: number, a: number, b: number): number => (u > a && u < b ? 4 * ((u - a) / (b - a)) * (1 - (u - a) / (b - a)) : 0);
/** Push an effect for this frame. */
const show = (o: Channels, kind: Fx['kind'], u: number, dir = 1, amount = 1, t = 0): void => { o.fx.push({ kind, u, t, dir, amount }); };

/** The new moves: how long each takes, in ms. */
export const DELIGHT_MS = 1000, JOLT_MS = 560, WINK_MS = 900, WIDE_MS = 1400, ALERT_MS = 1000, RECOIL_MS = 1000, LEAN_MS = 1600,
  TUG_MS = 1000, SETTLE_MS = 900, FLARE_MS = 1400, FLOAT_MS = 4800, LOOK_MS = 1300, EXCLAIM_MS = 2000, BURST_MS = 2200,
  COMET_MS = 2300, RINGS_MS = 3600, ROCK_MS = 2000;
/** A rock turns about a point this far below the body's middle (body units). */
export const ROCK_BELOW = 0.75;

/**
 * The half-spin, 0 to 1 over the poke: a wind-up the other way (about 6 degrees), the turn itself at an
 * even, readable pace through the middle seven tenths, a little too far (about 4 degrees) and back.
 */
export function spinCurve(u: number): number {
  let e = smooth((u - 0.1) / 0.7);
  if (u < 0.2) e -= 0.034 * Math.sin((Math.PI * u) / 0.2) ** 2;
  if (u > 0.72) e += 0.025 * Math.sin((Math.PI * (u - 0.72)) / 0.28) ** 2;
  return e;
}

/** Every clip the rig knows, in an order that matters: the pokes play in this order, and cues compose in it. */
export const CLIPS: {
  readonly spin: Clip; readonly nod: Clip; readonly hop: Clip; readonly pop: Clip; readonly blink: Clip; readonly waitNod: Clip; readonly dots: Clip;
  readonly shake: Clip; readonly bounce: Clip; readonly tilt: Clip;
  readonly delight: Clip; readonly kick: Clip;
  readonly wink: Clip; readonly wide: Clip; readonly alert: Clip; readonly recoil: Clip; readonly lean: Clip; readonly tug: Clip;
  readonly settle: Clip; readonly flare: Clip; readonly float: Clip; readonly look: Clip; readonly exclaim: Clip; readonly burst: Clip;
  readonly comet: Clip; readonly rings: Clip; readonly rock: Clip;
} = {
  spin: {
    lane: 'poke', ms: POKE_MS.spin,
    apply(o, p, v) {
      const u = p.u, d = p.cue.dir;
      // Half a turn. Past edge-on the far side of the body is the same body, so the turn carries on as the
      // front coming round from the other side: the yaw steps back by half a turn and ends where it began.
      const e = spinCurve(u);
      o.yaw = Math.PI * d * (d * (v.yaw + Math.PI * d * e) > Math.PI / 2 ? e - 1 : e);
      // The eyes shrink away as the face goes round the edge and grow back as it comes round the other
      // side, so no frame has an eye on each side: gone by about 66 degrees, whole inside 41. (Eased in and
      // out at the two ends of the poke, for a spin that starts from a body already turned that far.)
      o.eyeScale *= 1 - (1 - smooth((Math.abs(Math.cos(v.yaw + o.yaw)) - 0.4) / 0.35)) * smooth(Math.min(u, 1 - u) / 0.12);
    },
  },
  nod: {
    lane: 'poke', ms: POKE_MS.nod,
    apply(o, p, v) {
      const u = p.u;
      // Down quickly, back up a little past level, and settle. The eyes drop first, and the body gives a
      // little as it dips, so that a body whose outline hardly changes with pitch still visibly nods.
      const dip = track([0, 0, 0.3, 1, 0.7, -0.16, 1, 0], u);
      o.pitch = -NOD * dip;
      o.stretch = 1 - NOD_SQUASH * give(feel(v)) * dip;
      o.eyeY = -0.45 * track([0, 0, 0.16, 1, 0.55, 0, 1, 0], u);
    },
  },
  hop: {
    lane: 'poke', ms: POKE_MS.hop,
    apply(o, p, v) {
      const u = p.u, f = feel(v);
      // Squash, spring up long, hang, come down long, squash on landing, settle. The flight is a thrown
      // ball's (not eased): that is what makes it a hop and not a slide. A heavy body goes less high, one
      // that squashes more stretches further, a wobbly one rings after it lands, one that flares glows.
      o.stretch = 1 + (track(HOP_STRETCH, u) - 1) * give(f);
      if (u > HOP_UP && u < HOP_DOWN) { const q = (u - HOP_UP) / (HOP_DOWN - HOP_UP); o.lift = HOP_HEIGHT * high(f) * 4 * q * (1 - q); }
      o.eyeY = track([0, 0, 0.14, -0.3, 0.36, 0.5, 0.6, 0, 0.8, -0.35, 1, 0], u);
      if (u > HOP_DOWN) o.stretch *= 1 + ring(f, (u - HOP_DOWN) * p.ms, 1 - u);
      if (f.flare > 0) o.glow += f.flare * (bump(u, 0.12, 0.12) + bump(u, HOP_DOWN, 0.12));
    },
  },
  pop: {
    lane: 'pop', ms: POP_MS,
    apply(o, p) {
      // Up and back, a little under, and settled; a pop that replaced one still showing starts where that one was.
      o.scale *= 1 + POP * p.cue.amount * track([0, 0, 0.3, 1, 0.62, -0.18, 1, 0], p.u) + p.cue.from * (1 - smooth(p.at / 90));
    },
  },
  blink: {
    lane: 'blink', ms: BLINK_MS,
    apply(o, p) {
      o.open = (1 - (1 - BLINK_HEIGHT) * blinkCurve(p.u)) * o.open;
    },
  },
  waitNod: {
    lane: 'wait', ms: WAIT_NOD_MS,
    apply(o, p) {
      o.pitch -= WAIT_NOD * track([0, 0, 0.34, 1, 0.74, -0.12, 1, 0], p.u);
    },
  },
  dots: {
    lane: 'change', ms: DOTS_MS,
    apply(o, p) {
      // The eyes are dots through the middle of a change of shape. (From where they were: if the eyes are
      // already dots from a change that was under way, they stay dots.)
      const at = p.at, from = p.cue.from;
      o.dot = Math.max(o.dot, at < 150 ? from + (1 - from) * smooth(at / 150) : at < 250 ? 1 : 1 - smooth((at - 250) / 170));
    },
  },
  // The cues: moves anyone may play. Each only adds to what is there or scales it, starts and ends at
  // nothing, and turns the body only in the room a look has left (v.room), so a ball held at a full look
  // keeps its far eye.
  shake: {
    lane: 'cue', ms: SHAKE_MS,
    apply(o, p, v) {
      const u = p.u, k = p.cue.dir * p.cue.amount * (1 - u) * smooth(u / 0.1), w = Math.sin(4 * Math.PI * u);
      // Four half-swings, each smaller than the last (about 14, 10, 6 and 2 degrees), so three of them read
      // as a shake and not a twitch. The eyes lead.
      o.yaw += k * SHAKE_YAW * v.room * w;
      o.roll += k * SHAKE_ROLL * w;
      o.eyeX += k * SHAKE_EYES * Math.sin(4 * Math.PI * u + 0.6);
    },
  },
  bounce: {
    lane: 'cue', ms: BOUNCE_MS,
    apply(o, p, v) {
      const u = p.u, a = p.cue.amount, f = feel(v), h = a * high(f);
      // A squash, a big hop, a squash, a smaller hop, a settle; the eyes go up with each hop and narrow a little, smiling.
      o.stretch *= 1 + a * give(f) * track([0, 0, 0.08, -0.08, 0.18, 0.08, 0.4, 0, 0.5, -0.06, 0.58, 0.05, 0.78, 0, 0.86, -0.04, 1, 0], u);
      if (u > 0.1 && u < 0.46) { const q = (u - 0.1) / 0.36; o.lift += h * BOUNCE_HEIGHT * 4 * q * (1 - q); }
      else if (u > 0.54 && u < 0.84) { const q = (u - 0.54) / 0.3; o.lift += h * 0.55 * BOUNCE_HEIGHT * 4 * q * (1 - q); }
      o.eyeY += a * track([0, 0, 0.2, 0.25, 0.45, 0, 0.62, 0.18, 0.85, 0, 1, 0], u);
      o.open *= 1 - 0.2 * a * Math.sin(Math.PI * u) ** 2;
    },
  },
  tilt: {
    lane: 'cue', ms: TILT_MS,
    apply(o, p, v) {
      const u = p.u, d = p.cue.dir, a = p.cue.amount;
      // The eyes go up and a little that way first, and the head follows: a quick lean a touch too far, a
      // settle back, a hold of about a third of a second, and back, the eyes a beat ahead again.
      const k = a * track([0, 0, 0.2, 1.12, 0.36, 1, 0.7, 1, 1, 0], u), e = a * track([0, 0, 0.14, 1, 0.64, 1, 0.94, 0], u);
      o.roll += d * TILT_ROLL * k;
      o.eyeY += 0.18 * e;
      o.eyeX += d * 0.12 * v.room * e;
    },
  },
  // Delight: stretched up and off the ground, the eyes turned to happy arches, sparks thrown up.
  delight: {
    lane: 'cue', ms: DELIGHT_MS,
    apply(o, p, v) {
      const u = p.u, f = feel(v), happy = Math.min(1, p.cue.amount) * track([0, 0, 0.12, 1, 0.75, 1, 1, 0], u);
      o.stretch *= 1 + 0.1 * give(f) * Math.min(1, p.cue.amount) * track([0, 0, 0.1, -0.4, 0.22, 1, 0.45, -0.3, 0.7, 0.1, 1, 0], u);
      o.lift += 0.1 * high(f) * Math.min(1, p.cue.amount) * arc(u, 0.12, 0.6);
      o.arc += 0.9 * happy; o.open *= 1 - 0.5 * happy;
      o.eyeY += 0.2 * happy;
      if (u > 0.14 && u < 0.95 && p.cue.amount > 0) show(o, 'spray', (u - 0.14) / 0.81, p.cue.dir, Math.min(1, p.cue.amount));
      if (f.flare > 0) o.glow += f.flare * bump(u, 0.25, 0.25);
    },
  },
  // The rig's own: the jolt of a face coming on. Up (amount > 0: a pop of surprise), or a flinch down and
  // back (amount < 0), springing back past where it was and settling.
  kick: {
    lane: 'mood', ms: JOLT_MS,
    apply(o, p) {
      const a = p.cue.amount * p.cue.dir, t = (p.u * p.ms) / 1000, k = (swing(t, 2.2, 6) / 0.72) * (1 - smooth((p.u - 0.8) / 0.2));
      o.lift += a * k;
      if (a < 0) { o.scale *= 1 + 0.6 * a * Math.abs(k); o.pitch += deg(60) * -a * k; }
      else o.stretch *= 1 + 1.2 * a * k;
    },
  },
  // The cues that follow are new moves anyone may play, under the same rules as the three above.
  wink: {
    lane: 'cue', ms: WINK_MS,
    apply(o, p, v) {
      // One eye shuts quickly and holds, and opens; the head leans a little that way and comes up.
      const u = p.u, d = p.cue.dir, a = Math.min(1, p.cue.amount);
      const shut = a * track([0, 0, 0.14, 1, 0.55, 1, 0.8, 0, 1, 0], u), k = a * track([0, 0, 0.2, 1, 0.6, 1, 1, 0], u);
      if (d > 0) o.winkR += shut; else o.winkL += shut;
      o.roll += d * deg(6) * k; o.lift += 0.02 * k; o.eyeY += 0.08 * k; o.eyeX += d * 0.06 * v.room * k;
    },
  },
  wide: {
    lane: 'cue', ms: WIDE_MS,
    apply(o, p, v) {
      // A squint, then the eyes go wide and round, and it draws itself up.
      const u = p.u, a = p.cue.amount, f = feel(v);
      const w = a * track([0, 0, 0.12, 0, 0.3, 1, 0.72, 1, 1, 0], u), sq = a * track([0, 0, 0.07, 1, 0.18, 0, 1, 0], u);
      o.open *= (1 - 0.35 * sq) * (1 + 0.12 * w); o.eyeScale *= 1 + 0.28 * w;
      o.stretch *= 1 + 0.035 * give(f) * w; o.lift += 0.03 * w; o.eyeY += 0.1 * w;
    },
  },
  alert: {
    lane: 'cue', ms: ALERT_MS,
    apply(o, p, v) {
      // Up sharply and taller, eyes open, then settled; a pulse of its own outline goes out from it.
      const u = p.u, a = p.cue.amount, f = feel(v), up = a * track([0, 0, 0.14, 1, 0.38, 0.15, 0.7, 0, 1, 0], u);
      o.lift += 0.09 * high(f) * up;
      o.stretch *= 1 + 0.07 * give(f) * up - 0.04 * give(f) * a * bump(u, 0.45, 0.12);
      o.open *= 1 + 0.2 * a * track([0, 0, 0.1, 1, 0.75, 1, 1, 0], u); o.eyeY += 0.12 * up;
      if (u > 0.05 && u < 0.8 && a > 0) show(o, 'pulse', (u - 0.05) / 0.75, 1, Math.min(1, a));
      if (f.flare > 0) o.glow += a * f.flare * bump(u, 0.15, 0.2);
    },
  },
  recoil: {
    lane: 'cue', ms: RECOIL_MS,
    apply(o, p, v) {
      // Something on one side: it jumps back away from it, eyes wide on it, lands, and settles.
      const u = p.u, d = p.cue.dir, a = p.cue.amount, f = feel(v);
      const k = a * track([0, 0, 0.1, 1, 0.5, 0.8, 1, 0], u), e = a * track([0, 0, 0.06, 1, 0.6, 1, 1, 0], u);
      o.roll -= d * deg(7) * k; o.yaw -= d * deg(10) * v.room * k; o.x -= d * 0.08 * k;
      o.lift += 0.13 * a * high(f) * arc(u, 0.06, 0.42);
      o.stretch *= 1 + give(f) * a * (0.08 * bump(u, 0.2, 0.1) - 0.08 * bump(u, 0.48, 0.08));
      o.eyeScale *= 1 + 0.25 * e; o.open *= 1 + 0.15 * e; o.eyeX += d * 0.3 * v.room * e;
      if (u > 0.42) o.stretch *= 1 + a * ring(f, (u - 0.42) * p.ms, 1 - u);
      if (f.flare > 0) o.glow += 0.6 * a * f.flare * bump(u, 0.1, 0.15);
    },
  },
  lean: {
    lane: 'cue', ms: LEAN_MS,
    apply(o, p, v) {
      // A lean to one side, a touch too far, held, and back up.
      const u = p.u, d = p.cue.dir, k = p.cue.amount * track([0, 0, 0.22, 1.1, 0.34, 1, 0.74, 1, 1, 0], u);
      o.roll += d * deg(9) * k; o.yaw += d * deg(8) * v.room * k; o.x += d * 0.04 * k; o.eyeX += d * 0.18 * v.room * k; o.pitch += deg(2) * k;
    },
  },
  tug: {
    lane: 'cue', ms: TUG_MS,
    apply(o, p, v) {
      // Pulled one way, sharply, then it springs back past where it was and rings out. The eyes lag behind.
      const u = p.u, d = p.cue.dir, a = p.cue.amount, f = feel(v), t = ((u - 0.07) * p.ms) / 1000;
      const jerk = u < 0.07 ? smooth(u / 0.07) : Math.cos(TAU * (2.2 + 1.5 * (1 - f.weight)) * t) * Math.exp(-(2 + 6 * (1 - f.wobble)) * t);
      const k = a * jerk * (1 - smooth((u - 0.85) / 0.15));
      o.roll += d * deg(12) * k; o.x += d * 0.08 * k; o.stretch *= 1 - 0.04 * give(f) * Math.abs(k);
      o.eyeX -= d * 0.2 * v.room * a * track([0, 0, 0.06, 1, 0.3, 0, 1, 0], u);
    },
  },
  settle: {
    lane: 'cue', ms: SETTLE_MS,
    apply(o, p, v) {
      // A wobble that dies away, as if set down a little hard.
      const f = feel(v), t = (p.u * p.ms) / 1000, w = p.cue.amount * (0.5 + f.wobble) * (1 - smooth((p.u - 0.8) / 0.2));
      o.roll += p.cue.dir * deg(6) * w * swing(t, 3.2, 4);
      o.stretch *= 1 - 0.07 * give(f) * w * swing(t, 2.6, 4.5);
    },
  },
  flare: {
    lane: 'cue', ms: FLARE_MS,
    apply(o, p, v) {
      // A surge of glow that flickers and dies away; the body swells with it (one that does not glow still swells).
      const u = p.u, f = feel(v), k = Math.min(1, p.cue.amount) * smooth(u / 0.15) * Math.exp(-4 * Math.max(0, u - 0.15)) * (1 - smooth((u - 0.85) / 0.15));
      o.glow += Math.min(1, k * (f.flare > 0 ? f.flare : 0.6) * (1 + 0.12 * Math.sin((TAU * 6 * u * p.ms) / 1000)));
      o.scale *= 1 + 0.05 * give(f) * k; o.pitch += deg(4) * k; o.open *= 1 + 0.1 * k;
    },
  },
  float: {
    lane: 'cue', ms: FLOAT_MS,
    apply(o, p) {
      // Up off the ground, two slow bobs, and down again.
      const u = p.u, env = Math.min(1, p.cue.amount) * track([0, 0, 0.22, 1, 0.78, 1, 1, 0], u), bob = Math.sin(TAU * 2 * u);
      o.lift += env * (0.12 + 0.03 * bob); o.roll += deg(2) * env * bob; o.stretch *= 1 + 0.01 * env * bob;
    },
  },
  look: {
    lane: 'cue', ms: LOOK_MS,
    apply(o, p, v) {
      // A glance to one side and up, held, and back: the eyes go first, the head after them.
      const u = p.u, d = p.cue.dir, a = Math.min(1, p.cue.amount);
      const e = a * track([0, 0, 0.1, 1, 0.72, 1, 0.9, 0, 1, 0], u), b = a * track([0, 0, 0.25, 1, 0.78, 1, 1, 0], u);
      o.eyeX += d * 0.7 * v.room * e; o.eyeY += 0.3 * e;
      o.yaw += d * deg(18) * v.room * b; o.pitch += deg(4) * b;
    },
  },
  exclaim: {
    lane: 'cue', ms: EXCLAIM_MS,
    apply(o, p, v) {
      // A "!" gathers above its head out of sparks, holds, and falls apart; it draws itself up, eyes wide.
      const u = p.u, f = feel(v), k = Math.min(1, p.cue.amount) * track([0, 0, 0.18, 1, 0.8, 1, 1, 0], u);
      o.stretch *= 1 + 0.12 * give(f) * Math.min(1, p.cue.amount) * track([0, 0, 0.16, 0, 0.26, 1, 0.4, 0.5, 0.8, 0.5, 1, 0], u);
      o.open *= 1 + 0.25 * k; o.eyeScale *= 1 + 0.12 * k; o.lift += 0.03 * k; o.eyeY += 0.15 * k;
      if (u > 0 && u < 1 && p.cue.amount > 0) show(o, 'bang', u, 1, Math.min(1, p.cue.amount));
    },
  },
  burst: {
    lane: 'cue', ms: BURST_MS,
    apply(o, p, v) {
      // Draws in, then lets go: a pop out past its size, sparks flying off all round, and a pulse.
      const u = p.u, f = feel(v), a = Math.min(1, p.cue.amount), squeeze = a * track([0, 0, 0.22, 1, 0.27, 0, 1, 0], u);
      o.scale *= 1 - 0.15 * squeeze + 0.1 * give(f) * a * bump(u, 0.32, 0.08);
      o.open *= 1 - 0.5 * squeeze; o.eyeScale *= 1 + 0.15 * a * bump(u, 0.35, 0.15);
      if (u > 0.25 && u < 1 && a > 0) { show(o, 'burst', (u - 0.25) / 0.75, 1, a); show(o, 'pulse', Math.min(1, (u - 0.25) / 0.45), 1, a); }
      if (f.flare > 0) o.glow += a * f.flare * bump(u, 0.3, 0.2);
    },
  },
  comet: {
    lane: 'cue', ms: COMET_MS,
    apply(o, p, v) {
      // A wind-up the other way, a dash with speed lines streaming off behind, and back with a lean the other way.
      const u = p.u, d = p.cue.dir, a = Math.min(1, p.cue.amount), f = feel(v);
      const out = u < 0.18 ? -0.12 * smooth(u / 0.18) : u < 0.45 ? -0.12 + 0.62 * (1 - (1 - (u - 0.18) / 0.27) ** 5) : u < 0.6 ? 0.5 : 0.5 * (1 - smooth((u - 0.6) / 0.4));
      o.x += d * a * out;
      o.roll += d * a * deg(8) * track([0, 0, 0.15, -0.6, 0.25, 1, 0.5, 0.2, 0.75, -0.5, 1, 0], u);
      o.stretch *= 1 - 0.1 * a * give(f) * bump(u, 0.3, 0.12) + 0.04 * a * give(f) * bump(u, 0.12, 0.08);
      o.eyeX += d * a * 0.25 * v.room * track([0, 0, 0.18, 1, 0.6, 1, 0.8, -0.4, 1, 0], u); o.eyeScale *= 1 + 0.1 * a * bump(u, 0.35, 0.2);
      if (u > 0.18 && u < 0.72 && a > 0) show(o, 'streaks', (u - 0.18) / 0.54, d, a);
    },
  },
  rings: {
    lane: 'cue', ms: RINGS_MS,
    apply(o, p) {
      // Rings come round it one by one, passing behind it and in front, with a light going round each; it
      // rises a little and its eyes follow the first light.
      const u = p.u, a = Math.min(1, p.cue.amount), env = a * track([0, 0, 0.12, 1, 0.82, 1, 1, 0], u), ph = (p.at / 1300) * TAU;
      o.lift += 0.04 * env; o.eyeX += 0.35 * env * Math.cos(ph); o.eyeY -= 0.2 * env * Math.sin(ph);
      if (u > 0 && u < 1 && a > 0) show(o, 'rings', u, 1, a, p.at);
    },
  },
  rock: {
    lane: 'cue', ms: ROCK_MS,
    apply(o, p) {
      // A rock from side to side about a point below it, like a toy that will not fall over, dying away.
      const t = (p.u * p.ms) / 1000, a = Math.min(1, p.cue.amount) * p.cue.dir * deg(9) * Math.exp(-1.6 * t) * Math.sin(TAU * 1.5 * t) * (1 - smooth((p.u - 0.85) / 0.15));
      // About a point ROCK_BELOW under the middle: the roll turns it, and moving it the other way keeps that point still.
      o.roll += a; o.x += ROCK_BELOW * Math.sin(a);
    },
  },
};

const named = (lane: Lane): string[] => Object.keys(CLIPS).filter((k) => (CLIPS as Readonly<Record<string, Clip>>)[k].lane === lane);
/** The pokes, in the order a plain poke() plays them. */
export const POKES: readonly PokeKind[] = named('poke') as PokeKind[];
/** The cues: moves anyone may play (Rig.play), each in a lane of its own, composed in this order. */
export const CUES: readonly string[] = named('cue');

/**
 * For RigOptions.clips: extra clips, played as pokes or as cues. Throws if a name is one of CLIPS, a lane is
 * not 'poke' or 'cue', a time is not a finite number over 0, or a clip has no apply.
 */
export function checkClips(extra: Readonly<Record<string, Clip>>): void {
  for (const [name, c] of Object.entries(extra)) {
    if (Object.hasOwn(CLIPS, name)) throw new Error(`clip ${name}: the rig has one of that name`);
    if (!c || (c.lane !== 'poke' && c.lane !== 'cue')) throw new Error(`clip ${name}: lane must be 'poke' or 'cue'`);
    if (!(Number.isFinite(c.ms) && c.ms > 0)) throw new Error(`clip ${name}: ms must be a finite number over 0`);
    if (typeof c.apply !== 'function') throw new Error(`clip ${name}: no apply`);
  }
}
