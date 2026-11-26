// Clips: the little moves of the Bot's avatar as data. A clip is a curve over a fixed time that adds to the
// pose the rig's springs give (or scales it), and ends exactly where it began. The rig keeps one frame's sum
// of them in `Channels`, plays each clip at a fixed place in its step, and owns everything that is not a
// curve over a fixed time (the springs, the random timing, the loops of what the Bot is doing).
//
// To add a move: an entry in CLIPS (or, from outside this package, in RigOptions.clips), written in plain words
// with moves.ts (`cue`, `head.lean`, `beats`, ...). It may read only what `View` gives it and what it was started
// with; it draws no random numbers.

import { smooth, track } from './ease';
import { BLINK_HEIGHT } from './faces';
import { PERSONALITY, TAU } from './feel';
import type { Fx } from './fx';
import { deg } from './math';
import {
  beats, body, byHand, cue, exclamation, eyes, fallingStar, flight, head, hold, hump, move, orbits, peak, poke, pulse, snapBack, sparks,
  sparksAllRound, speedLines, surge, toward, away, wave, wobble,
} from './moves';

export { PERSONALITY, TAU, bump, give, high, ring } from './feel';

/** What one frame of moves adds to the springs' pose. The rig resets it every step. */
export interface Channels {
  dotPlayback?: import('./dot-motion').DotPlayback;
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
 * shape, 'mood' the jolt of a face coming on, and 'power' the pickup as ultracode comes on (Rig.setUltra).
 */
export type Lane = 'poke' | 'cue' | 'pop' | 'blink' | 'wait' | 'change' | 'mood' | 'power';

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
/** A shake of the head, "no" or "can't do that": how long, how far it turns and leans, and how far the eyes go. */
export const SHAKE_MS = 700, SHAKE_YAW = deg(16), SHAKE_ROLL = deg(2), SHAKE_EYES = 0.3;
/** A bounce, "done!": how long, and how high the first hop goes (body units; the second is a little over half that). */
export const BOUNCE_MS = 720, BOUNCE_HEIGHT = 0.26;
/** A tilt of the head, "hm?": how long, start to back, and how far it leans. */
export const TILT_MS = 1100, TILT_ROLL = deg(10);

/** A blink is shut this far through it: it shuts quickly and opens again more slowly. */
export const BLINK_SHUT = 0.42;
/** How far shut a blink is, 0..1, through it. */
export const blinkCurve = (u: number): number => (u < BLINK_SHUT ? Math.sin((Math.PI / 2) * (u / BLINK_SHUT)) ** 2 : Math.sin((Math.PI / 2) * ((1 - u) / (1 - BLINK_SHUT))) ** 2);

/** The new moves: how long each takes, in ms. */
export const DELIGHT_MS = 1000, JOLT_MS = 560, WINK_MS = 900, WIDE_MS = 1400, ALERT_MS = 1000, RECOIL_MS = 1000, LEAN_MS = 1600,
  TUG_MS = 1000, SETTLE_MS = 900, FLARE_MS = 1400, FLOAT_MS = 4800, LOOK_MS = 1300, EXCLAIM_MS = 2000, BURST_MS = 2200,
  COMET_MS = 2300, RINGS_MS = 3600, ROCK_MS = 2000;
/** A rock turns about a point this far below the body's middle (body units). */
export const ROCK_BELOW = 0.75;
/** Ultracode's pickup: the star dropping in and the squash as it lands, start to end, in ms. */
export const PICKUP_MS = 700;
/** The pickup's star shows until this far through it, in per cent: a pickup past it has no star left to drop. */
export const PICKUP_STAR = 69;

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

// ---- The moves, in plain words (moves.ts). Times are percent of the move; sizes are degrees, percent, body units
// or shares of a full look. A few are written by hand (`byHand`): the ones whose arithmetic is not a size times a
// shape, such as the spin's half turn.

// The nod: down quickly, back up a little past level, and settle. The eyes drop first, and the body gives a
// little as it dips, so that a body whose outline hardly changes with pitch still visibly nods.
const nodding = beats('1 by 30%, -0.16 by 70%, 0 by 100%');
// The hop: squash, spring up long, hang, come down long, squash on landing, settle. The flight is a thrown ball's
// (not eased): that is what makes it a hop and not a slide. A heavy body goes less high, one that gives more
// stretches further, a wobbly one rings after it lands, one that flares glows.
const hopping = beats('-0.11 by 17%, 0.11 by 30%, 0.02 by 47%, 0.07 by 66%, -0.12 by 79%, 0.03 by 90%, 0 by 100%');
// The shake: four half-swings, each smaller than the last (about 14, 10, 6 and 2 degrees), so three of them read
// as a shake and not a twitch. The eyes lead.
const shaking = wave(2).dwindling().fadeIn(10);
// The tilt: a quick lean a touch too far, a settle back, a hold of about a third of a second, and back; the eyes
// go up and a little that way first, a beat ahead.
const tilting = beats('1.12 by 20%, 1 by 36%, hold till 70%, 0 by 100%'), tiltEyes = beats('1 by 14%, hold till 64%, 0 by 94%');
const happy = beats('1 by 12%, hold till 75%, 0 by 100%');
const winking = hold({ by: 20, till: 60 });
const wideOpen = beats('0 by 12%, 1 by 30%, hold till 72%, 0 by 100%');
const startled = beats('1 by 14%, 0.15 by 38%, 0 by 70%');
const jumpBack = beats('1 by 10%, 0.8 by 50%, 0 by 100%'), staring = hold({ by: 6, till: 60 });
const leaning = beats('1.1 by 22%, 1 by 34%, hold till 74%, 0 by 100%');
const tugged = snapBack(7).fadeOut(85);
const surging = surge(15, { dies: 4 }).fadeOut(85);
const afloat = hold({ by: 22, till: 78 }), bobbing = afloat.times(wave(2));
const glancing = beats('1 by 10%, hold till 72%, 0 by 90%'), following = hold({ by: 25, till: 78 });
const exclaiming = hold({ by: 18, till: 80 });
const squeezed = beats('1 by 22%, 0 by 27%');
const shown = hold({ by: 12, till: 82 });

/** Every clip the rig knows, in an order that matters: the pokes play in this order, and cues compose in it. */
export const CLIPS: {
  readonly spin: Clip; readonly nod: Clip; readonly hop: Clip; readonly pop: Clip; readonly blink: Clip; readonly waitNod: Clip; readonly dots: Clip;
  readonly shake: Clip; readonly bounce: Clip; readonly tilt: Clip;
  readonly delight: Clip; readonly kick: Clip;
  readonly wink: Clip; readonly wide: Clip; readonly alert: Clip; readonly recoil: Clip; readonly lean: Clip; readonly tug: Clip;
  readonly settle: Clip; readonly flare: Clip; readonly float: Clip; readonly look: Clip; readonly exclaim: Clip; readonly burst: Clip;
  readonly comet: Clip; readonly rings: Clip; readonly rock: Clip;
  readonly pickup: Clip;
} = {
  // Half a turn. Past edge-on the far side of the body is the same body, so the turn carries on as the front
  // coming round from the other side: the yaw steps back by half a turn and ends where it began. The eyes shrink
  // away as the face goes round the edge and grow back as it comes round the other side, so no frame has an eye
  // on each side: gone by about 66 degrees, whole inside 41 (eased in and out at the two ends of the poke, for a
  // spin that starts from a body already turned that far).
  spin: poke(POKE_MS.spin, [
    byHand((o, p, v) => {
      const u = p.u, d = p.cue.dir, e = spinCurve(u);
      o.yaw += Math.PI * d * (d * (v.yaw + Math.PI * d * e) > Math.PI / 2 ? e - 1 : e);
      o.eyeScale *= 1 - (1 - smooth((Math.abs(Math.cos(v.yaw + o.yaw)) - 0.4) / 0.35)) * smooth(Math.min(u, 1 - u) / 0.12);
    }, 'the spin'),
  ]),
  nod: poke(POKE_MS.nod, [
    head.dip(16).along(nodding),
    body.squash(5).along(nodding),
    eyes.down(0.45).along(beats('1 by 16%, 0 by 55%')),
  ]),
  hop: poke(POKE_MS.hop, [
    body.stretch(100).along(hopping),
    body.jump(HOP_HEIGHT).along(flight(19, 74)),
    eyes.up(1).along(beats('-0.3 by 14%, 0.5 by 36%, 0 by 60%, -0.35 by 80%, 0 by 100%')),
    body.ringsOutAfter(74),
    body.flares(1).along(peak(12, 12)).and.flares(1).along(peak(74, 12)),
  ]),
  // Up and back, a little under, and settled; a pop that replaced one still showing starts where that one was.
  pop: move('pop', POP_MS, {}, [
    byHand((o, p) => { o.scale *= 1 + POP * p.cue.amount * track([0, 0, 0.3, 1, 0.62, -0.18, 1, 0], p.u) + p.cue.from * (1 - smooth(p.at / 90)); }, 'the pop'),
  ]),
  blink: move('blink', BLINK_MS, {}, [
    byHand((o, p) => { o.open = (1 - (1 - BLINK_HEIGHT) * blinkCurve(p.u)) * o.open; }, 'the blink'),
  ]),
  waitNod: move('wait', WAIT_NOD_MS, {}, [
    head.dip(7).along(beats('1 by 34%, -0.12 by 74%, 0 by 100%')),
  ]),
  // The eyes are dots through the middle of a change of shape. (From where they were: if the eyes are already dots
  // from a change that was under way, they stay dots.)
  dots: move('change', DOTS_MS, {}, [
    byHand((o, p) => {
      const at = p.at, from = p.cue.from;
      o.dot = Math.max(o.dot, at < 150 ? from + (1 - from) * smooth(at / 150) : at < 250 ? 1 : 1 - smooth((at - 250) / 170));
    }, 'the dots'),
  ]),
  // The cues: moves anyone may play.
  shake: cue(SHAKE_MS, [
    head.turn(toward, 16).along(shaking),
    head.lean(toward, 2).along(shaking),
    // (The eyes are not held to the room a look has left, as they never were.)
    eyes.glance(toward, SHAKE_EYES).along(wave(2, { ahead: 0.6 / TAU }).dwindling().fadeIn(10)).ignoringRoom(),
  ]),
  // A bounce, "done!": a squash, a big hop, a squash, a smaller hop, a settle; the eyes go up with each hop and
  // narrow a little, smiling.
  bounce: cue(BOUNCE_MS, [
    body.stretch(100).along(beats('-0.08 by 8%, 0.08 by 18%, 0 by 40%, -0.06 by 50%, 0.05 by 58%, 0 by 78%, -0.04 by 86%, 0 by 100%')),
    body.jump(BOUNCE_HEIGHT).along(flight(10, 46)),
    body.jump(0.55 * BOUNCE_HEIGHT).along(flight(54, 84)),
    eyes.up(1).along(beats('0.25 by 20%, 0 by 45%, 0.18 by 62%, 0 by 85%')),
    eyes.narrow(20).along(hump()),
  ]),
  // A tilt of the head, "hm?".
  tilt: cue(TILT_MS, [
    head.lean(toward, 10).along(tilting),
    eyes.up(0.18).along(tiltEyes),
    eyes.glance(toward, 0.12).along(tiltEyes),
  ]),
  // Delight: stretched up and off the ground, the eyes turned to happy arches, sparks thrown up.
  delight: cue(DELIGHT_MS, { amountUpTo: 1 }, [
    body.stretch(10).along(beats('-0.4 by 10%, 1 by 22%, -0.3 by 45%, 0.1 by 70%, 0 by 100%')),
    body.jump(0.1).along(flight(12, 60)),
    eyes.smile(0.9).along(happy),
    eyes.narrow(50).along(happy),
    eyes.up(0.2).along(happy),
    sparks().during(14, 95),
    // (The glow is as big however hard it is played, as it always was.)
    body.flares(1).along(peak(25, 25)).ignoringAmount(),
  ]),
  // The rig's own: the jolt of a face coming on. Up (amount > 0: a pop of surprise), or a flinch down and back
  // (amount < 0), springing back past where it was and settling.
  kick: move('mood', JOLT_MS, {}, [
    byHand((o, p) => {
      const a = p.cue.amount * p.cue.dir, t = (p.u * p.ms) / 1000;
      const k = ((Math.exp(-6 * t) * Math.sin(2 * Math.PI * 2.2 * t)) / 0.72) * (1 - smooth((p.u - 0.8) / 0.2));
      o.lift += a * k;
      if (a < 0) { o.scale *= 1 + 0.6 * a * Math.abs(k); o.pitch += deg(60) * -a * k; }
      else o.stretch *= 1 + 1.2 * a * k;
    }, 'the kick'),
  ]),
  // One eye shuts quickly and holds, and opens; the head leans a little that way and comes up.
  wink: cue(WINK_MS, { amountUpTo: 1 }, [
    eyes.wink(toward).along(hold({ by: 14, till: 55, goneBy: 80 })),
    head.lean(toward, 6).along(winking),
    body.rise(0.02).along(winking),
    eyes.up(0.08).along(winking),
    eyes.glance(toward, 0.06).along(winking),
  ]),
  // A squint, then the eyes go wide and round, and it draws itself up.
  wide: cue(WIDE_MS, [
    eyes.narrow(35).along(beats('1 by 7%, 0 by 18%')),
    eyes.widen(12).along(wideOpen),
    eyes.grow(28).along(wideOpen),
    body.stretch(3.5).along(wideOpen),
    body.rise(0.03).along(wideOpen),
    eyes.up(0.1).along(wideOpen),
  ]),
  // Up sharply and taller, eyes open, then settled; a pulse of its own outline goes out from it.
  alert: cue(ALERT_MS, [
    body.jump(0.09).along(startled),
    body.stretch(7).along(startled).and.squash(4).along(peak(45, 12)),
    eyes.widen(20).along(beats('1 by 10%, hold till 75%, 0 by 100%')),
    eyes.up(0.12).along(startled),
    pulse().during(5, 80),
    body.flares(1).along(peak(15, 20)).notAtRest('a body that flares is already glowing a little on the first frame (known; kept as it was)'),
  ]),
  // Something on one side: it jumps back away from it, eyes wide on it, lands, and settles.
  recoil: cue(RECOIL_MS, [
    head.lean(away, 7).along(jumpBack),
    head.turn(away, 10).along(jumpBack),
    body.slide(away, 0.08).along(jumpBack),
    body.jump(0.13).along(flight(6, 42)),
    body.stretch(8).along(peak(20, 10)).and.squash(8).along(peak(48, 8)),
    eyes.grow(25).along(staring),
    eyes.widen(15).along(staring),
    eyes.glance(toward, 0.3).along(staring),
    body.ringsOutAfter(42),
    body.flares(0.6).along(peak(10, 15)).notAtRest('a body that flares is already glowing a little on the first frame (known; kept as it was)'),
  ]),
  // A lean to one side, a touch too far, held, and back up.
  lean: cue(LEAN_MS, [
    head.lean(toward, 9).along(leaning),
    head.turn(toward, 8).along(leaning),
    body.slide(toward, 0.04).along(leaning),
    eyes.glance(toward, 0.18).along(leaning),
    head.raise(2).along(leaning),
  ]),
  // Pulled one way, sharply, then it springs back past where it was and rings out. The eyes lag behind.
  tug: cue(TUG_MS, [
    head.lean(toward, 12).along(tugged),
    body.slide(toward, 0.08).along(tugged),
    body.squash(4).along(tugged.size()),
    eyes.glance(away, 0.2).along(beats('1 by 6%, 0 by 30%')),
  ]),
  // A wobble that dies away, as if set down a little hard.
  settle: cue(SETTLE_MS, [
    head.lean(toward, 6).along(wobble(3.2, { dies: 4 }).fadeOut(80).byWobble()),
    body.squash(7).along(wobble(2.6, { dies: 4.5 }).fadeOut(80).byWobble()),
  ]),
  // A surge of glow that flickers and dies away; the body swells with it (one that does not glow still swells).
  flare: cue(FLARE_MS, { amountUpTo: 1 }, [
    byHand((o, p, v) => {
      const f = v.feel ?? PERSONALITY, u = p.u, k = Math.min(1, p.cue.amount) * smooth(u / 0.15) * Math.exp(-4 * Math.max(0, u - 0.15)) * (1 - smooth((u - 0.85) / 0.15));
      // At most a full glow, flickering six times a second; a body that does not flare still glows a little.
      o.glow += Math.min(1, k * (f.flare > 0 ? f.flare : 0.6) * (1 + 0.12 * Math.sin((TAU * 6 * u * p.ms) / 1000)));
    }, 'the flare glow'),
    body.swell(5).along(surging),
    head.raise(4).along(surging),
    eyes.widen(10).along(surging),
  ]),
  // Up off the ground, two slow bobs, and down again.
  float: cue(FLOAT_MS, { amountUpTo: 1 }, [
    body.rise(0.12).along(afloat).and.rise(0.03).along(bobbing),
    head.sway(2).along(bobbing),
    body.stretch(1).along(bobbing).ignoringFeel(),
  ]),
  // A glance to one side and up, held, and back: the eyes go first, the head after them.
  look: cue(LOOK_MS, { amountUpTo: 1 }, [
    eyes.glance(toward, 0.7).along(glancing),
    eyes.up(0.3).along(glancing),
    head.turn(toward, 18).along(following),
    head.raise(4).along(following),
  ]),
  // A "!" gathers above its head out of sparks, holds, and falls apart; it draws itself up, eyes wide.
  exclaim: cue(EXCLAIM_MS, { amountUpTo: 1 }, [
    body.stretch(12).along(beats('0 by 16%, 1 by 26%, 0.5 by 40%, hold till 80%, 0 by 100%')),
    eyes.widen(25).along(exclaiming),
    eyes.grow(12).along(exclaiming),
    body.rise(0.03).along(exclaiming),
    eyes.up(0.15).along(exclaiming),
    exclamation(),
  ]),
  // Draws in, then lets go: a pop out past its size, sparks flying off all round, and a pulse.
  burst: cue(BURST_MS, { amountUpTo: 1 }, [
    body.shrink(15).along(squeezed).ignoringFeel().and.swell(10).along(peak(32, 8)),
    eyes.narrow(50).along(squeezed),
    eyes.grow(15).along(peak(35, 15)),
    sparksAllRound().during(25, 100),
    pulse().during(25, 100).doneBy(70),
    body.flares(1).along(peak(30, 20)),
  ]),
  // A wind-up the other way, a dash with speed lines streaming off behind, and back with a lean the other way.
  comet: cue(COMET_MS, { amountUpTo: 1 }, [
    body.slide(toward, 0.5).along(beats('-0.24 by 18%, 1 by 45% fast, hold till 60%, 0 by 100%')),
    head.lean(toward, 8).along(beats('-0.6 by 15%, 1 by 25%, 0.2 by 50%, -0.5 by 75%, 0 by 100%')),
    body.squash(10).along(peak(30, 12)).and.stretch(4).along(peak(12, 8)),
    eyes.glance(toward, 0.25).along(beats('1 by 18%, hold till 60%, -0.4 by 80%, 0 by 100%')),
    eyes.grow(10).along(peak(35, 20)),
    speedLines().during(18, 72),
  ]),
  // Rings come round it one by one, passing behind it and in front, with a light going round each; it rises a
  // little and its eyes follow the first light.
  rings: cue(RINGS_MS, { amountUpTo: 1 }, [
    body.rise(0.04).along(shown),
    eyes.circle(0.35, 0.2, { everyMs: 1300 }).along(shown),
    orbits(),
  ]),
  // A rock from side to side about a point below it, like a toy that will not fall over, dying away.
  rock: cue(ROCK_MS, { amountUpTo: 1 }, [
    body.rock(toward, 9, { below: ROCK_BELOW }).along(wobble(1.5, { dies: 1.6 }).fadeOut(85)),
  ]),
  // The rig's own: ultracode's pickup. A star drops in from up and to the right, and the body squashes from its
  // feet as it lands, in by 150 ms and back by 300. (Last, so every clip before it keeps its place.)
  pickup: move('power', PICKUP_MS, {}, [
    body.squash(10).along(beats('1 by 21%, 0 by 43%')),
    fallingStar().during(0, PICKUP_STAR),
  ]),
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
