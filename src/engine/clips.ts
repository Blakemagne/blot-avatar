// Clips: the little moves of the Bot's avatar as data. A clip is a curve over a fixed time that adds to the
// pose the rig's springs give (or scales it), and ends exactly where it began. The rig keeps one frame's sum
// of them in `Channels`, plays each clip at a fixed place in its step, and owns everything that is not a
// curve over a fixed time (the springs, the random timing, the loops of what the Bot is doing).
//
// To add a move: an entry in CLIPS (or, from outside this package, in RigOptions.clips). It may read only
// what `View` gives it and what it was started with; it draws no random numbers.

import { smooth, track } from './ease';
import { BLINK_HEIGHT } from './faces';
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
}

/** What a clip may read: the body's turn from its spring (before any clip), and the room a look has left, 1 - min(1, |eyeX| / most) (none through the middle of a spin). */
export interface View { readonly yaw: number; readonly room: number }

/** Fixed when a clip starts. dir is +1 or -1; amount is 0..2; from is where a replaced clip left off (pop and dots). */
export interface Cue { dir: number; amount: number; from: number }

/** A clip that is playing: `at` ms in, `u` = at / ms. */
export interface Playing { readonly clip: Clip; at: number; u: number; readonly cue: Cue }

/**
 * Where a clip plays in the rig's step. 'poke' and 'cue' are for anyone; the others are the rig's own: 'pop'
 * is emphasis(), 'blink' the blink, 'wait' the waiting nod and 'change' the eyes going to dots in a change of shape.
 */
export type Lane = 'poke' | 'cue' | 'pop' | 'blink' | 'wait' | 'change';

export interface Clip {
  readonly lane: Lane;
  /** How long it plays, in ms: finite, more than 0. */
  readonly ms: number;
  /** One frame, u in [0, 1). The clip owns its operators, so the order of the arithmetic is the clip's. No randomness. */
  apply(o: Channels, p: Playing, v: View): void;
}

/** Start a clip. */
export function start(clip: Clip, cue?: Partial<Cue>): Playing {
  return { clip, at: 0, u: 0, cue: { dir: 1, amount: 1, from: 0, ...cue } };
}

/**
 * Play one frame of a clip: dt ms further in, and applied, or null once it is over (u >= 1: the frame that
 * reaches the end is not applied, and the move is back where it began).
 */
export function advance(p: Playing | null, dtMs: number, o: Channels, v: View): Playing | null {
  if (!p) return null;
  p.at += dtMs;
  const u = p.at / p.clip.ms;
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
    apply(o, p) {
      const u = p.u;
      // Down quickly, back up a little past level, and settle. The eyes drop first, and the body gives a
      // little as it dips, so that a body whose outline hardly changes with pitch still visibly nods.
      const dip = track([0, 0, 0.3, 1, 0.7, -0.16, 1, 0], u);
      o.pitch = -NOD * dip;
      o.stretch = 1 - NOD_SQUASH * dip;
      o.eyeY = -0.45 * track([0, 0, 0.16, 1, 0.55, 0, 1, 0], u);
    },
  },
  hop: {
    lane: 'poke', ms: POKE_MS.hop,
    apply(o, p) {
      const u = p.u;
      // Squash, spring up long, hang, come down long, squash on landing, settle. The flight is a thrown
      // ball's (not eased): that is what makes it a hop and not a slide.
      o.stretch = track(HOP_STRETCH, u);
      if (u > HOP_UP && u < HOP_DOWN) { const q = (u - HOP_UP) / (HOP_DOWN - HOP_UP); o.lift = HOP_HEIGHT * 4 * q * (1 - q); }
      o.eyeY = track([0, 0, 0.14, -0.3, 0.36, 0.5, 0.6, 0, 0.8, -0.35, 1, 0], u);
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
      const closed = Math.sin((Math.PI * p.at) / BLINK_MS) ** 2;
      o.open = (1 - (1 - BLINK_HEIGHT) * closed) * o.open;
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
    apply(o, p) {
      const u = p.u, a = p.cue.amount;
      // A squash, a big hop, a squash, a smaller hop, a settle; the eyes go up with each hop and narrow a little, smiling.
      o.stretch *= 1 + a * track([0, 0, 0.08, -0.08, 0.18, 0.08, 0.4, 0, 0.5, -0.06, 0.58, 0.05, 0.78, 0, 0.86, -0.04, 1, 0], u);
      if (u > 0.1 && u < 0.46) { const q = (u - 0.1) / 0.36; o.lift += a * BOUNCE_HEIGHT * 4 * q * (1 - q); }
      else if (u > 0.54 && u < 0.84) { const q = (u - 0.54) / 0.3; o.lift += a * 0.55 * BOUNCE_HEIGHT * 4 * q * (1 - q); }
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
