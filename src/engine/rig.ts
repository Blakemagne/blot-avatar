// The rig: what moves the avatar. Pure and stepped with dt; there are no timers in here, so a test can run
// it frame by frame and get the same frames for the same seed.
//
// A look moves the EYES first (they slide on the surface toward the target, fast) and the BODY follows them
// (yaw and pitch toward where the eyes have got to, slower). Left alone, it drifts into a subtle three-quarter view every few seconds and
// back, and blinks at random.
//
// On top of that sit the little moves. Each is a curve over a fixed time, added to the pose the springs give,
// so each ends exactly where it began: three pokes (a half-spin, a nod, a hop), a change of shape (the outline
// morphs, the eyes shrink to dots, the new body lands with a tilt and blinks), a face easing into another,
// what the Bot is doing (thinking, working, waiting, speaking), and the loading figures.
// The ones that are only a curve over a fixed time (the pokes, the pop, the blink, the waiting nod, the eyes
// going to dots) are clips, in clips.ts: Rig.play plays one by name, and RigOptions.clips adds more.
//
// A rig can start in a pose (a still avatar's) and can be told to come to rest in one. At rest it is a still
// picture again, exactly, and no step changes it: that is how a live avatar takes over from a still one, and
// hands back to it, with nothing jumping.
//
// Each thing the Bot does moves in a way of its own, big enough to tell apart on a 22 px avatar: thinking
// looks up and away and holds; working reads, line after line, with a beat at each new line; waiting rocks
// slowly from side to side; speaking bobs with each syllable. Left idle, it breathes.

import type { Body } from './body';
import { BLINK_MS, CLIPS, PERSONALITY, PICKUP_STAR, POKES, TAU, advance, checkClips, start, type Channels, type Clip, type Personality, type Playing, type View } from './clips';
import { inOut, smooth, track } from './ease';
import { ACTIVITY_FACES, FACES, FACE_KEYS, MANNER_KEYS, PLAIN, faceFor, mannerFor, mixFace, type Face, type Manner } from './faces';
import { FORMS, type Figure, type Form } from './figures';
import type { Fx } from './fx';
import { deg, type Pose } from './math';
import { caught, type Source } from './morph';

/** What a renderer needs to draw one frame. Only the first four are needed for a still. */
export interface RigState {
  pose: Pose;
  /** Where the eyes have slid to, -1..1 on each axis (x right, y up); the body says how far that is. */
  eye: { x: number; y: number };
  /** Eye height factor: 1 open, BLINK_HEIGHT at the middle of a blink, a little over 1 as a spoken syllable opens the eyes. */
  lid: number;
  face: Face;
  /** The body on screen. When the rig has one it is drawn, whatever body the renderer was handed. */
  body?: Body;
  /** A change of shape under way: the outline is `k` of the way from `from` to `body`. */
  morph?: { from: Source; k: number } | null;
  /** 0..1: how far the eyes have shrunk into dots. */
  dot?: number;
  /** Eye size: 1 as the face says, 0 not drawn. */
  eyeScale?: number;
  /** Squash and stretch: the body is this much taller and, to keep its bulk, that much narrower. It stands on its base. */
  stretch?: number;
  /** How far the body is off the ground, in body units (1 = half the drawing box). */
  lift?: number;
  /** Overall size: 1, more during an emphasis pop. */
  scale?: number;
  /** 1 as built, -1 mirrored left to right; in between only while it flips. */
  flip?: number;
  /** The loading figure the body has turned into, if any. */
  figure?: Figure | null;
  /**
   * How far each antenna is swung from where it rests, the viewer's left and right, in radians (positive is
   * outward). Set only while the body has antennas.
   */
  antennas?: [left: number, right: number];
  /** Body units the body is moved to the right (a dash, a rock). */
  shift?: number;
  /** Added to the face's bend: the eyes' arches of a moment of delight. */
  arc?: number;
  /** Each eye's own height factor on top of `lid`, viewer's left then right: a wink shuts one. */
  lids?: [number, number];
  /** 0..1: a glow, for a renderer that draws one. */
  glow?: number;
  /** The effects showing (fx.ts): a mark, a "!", Zs, sparks, rings, a pulse, speed lines, ultracode's twinkles and star. */
  fx?: Fx[] | null;
  /**
   * Ultracode (Rig.setUltra), only while any of it shows: how much (0..1), and how far the rainbow's bands have
   * slid round their cycle (0..1). The rig changes it in place.
   */
  ultra?: { amount: number; phase: number };
}

export { BLINK_MS, HOP_DOWN, HOP_HEIGHT, HOP_UP, NOD, NOD_SQUASH, POKES, POKE_MS, POP, POP_MS, type PokeKind } from './clips';
export type Activity = 'idle' | 'thinking' | 'working' | 'waiting' | 'speaking' | 'sleeping';
export const ACTIVITIES: readonly Activity[] = ['idle', 'thinking', 'working', 'waiting', 'speaking', 'sleeping'];

export interface RigOptions {
  /** Seed for the blink and idle timing. The same seed and the same steps give the same frames. */
  seed?: number;
  /** Left alone, breathe, and drift into a three-quarter view now and then (default on). */
  idle?: boolean;
  /** Blink at random (default on). */
  blinks?: boolean;
  /** The body to start as. Without one, the first setBody is taken as the start and nothing morphs. */
  body?: Body;
  /** The pose to start in (where a still avatar stood). The body eases from there to wherever the eyes lead it. */
  pose?: Pose;
  /** Start at rest in `pose` (see `rest`): a still picture until it is woken. */
  rest?: boolean;
  /** Extra clips, played as pokes or cues after the rig's own (see clips.ts and checkClips). */
  clips?: Readonly<Record<string, Clip>>;
  /** What it is like to move (clips.ts Personality); left out, the engine's own feel. */
  personality?: Partial<Personality>;
}

/** How far a full look turns the body. */
export const LOOK_YAW = deg(48);
export const LOOK_PITCH = deg(14);
/** One face eases into another over this long. */
export const FACE_MS = 150;
/** How many pokes wait their turn behind the one that is playing; more than that are dropped. */
export const POKE_QUEUE = 2;
/** A change of shape: the outline morphs for MORPH_MS; the new body lands at LAND_AT (a knock that tilts it); it blinks at BLINK_AT. */
export const MORPH_MS = 400, LAND_AT = 300, BLINK_AT = 660, CHANGE_MS = BLINK_AT + BLINK_MS;
/**
 * The landing: a push that sets the body rolling (it tips to just under 4 degrees) and squashes it (about 6%).
 * The push is spread over KICK_MS, so the tilt begins gently: a lean, not a knock.
 */
export const SETTLE_KICK = deg(130), SQUASH_KICK = 3, KICK_MS = 90;
/** The body turns into a figure (or back) over this long. */
export const FIGURE_MS = 420;
/** With a form: the figure comes up FIGURE_AFTER into the activity, stays FIGURE_HOLD, and the face is back for FIGURE_REST, over and over. A progress ring stays. */
export const FIGURE_AFTER = 350, FIGURE_HOLD = 3000, FIGURE_REST = 2400;
/** Mirroring flips over this long. */
export const FLIP_MS = 220;

/** Spring rates (1/s), both critically damped: the eyes get there about four times sooner than the body. */
const EYE_RATE = 34;
const BODY_RATE = 8;
const LEVEL_RATE = 45;
const GATE_RATE = 9;
const PROGRESS_RATE = 10;

/** The idle drift's reach, as a share of a full look: about 22 degrees of yaw and 10 of pitch. */
const IDLE_YAW = deg(22) / LOOK_YAW, IDLE_PITCH = deg(10) / LOOK_PITCH;

/** Idle: a slow breath. The body is this much taller at the top of one, and one takes this long. */
export const BREATH = 0.014, BREATH_MS = 4200;
/** The breath is so slow that it is only worked out this often: between its drifts and blinks an idle avatar is redrawn 16 times a second, not 60. */
const BREATH_STEP = 60;
/** Thinking: one look up and aside and back takes this long. */
const THINK_MS = 3800;
/**
 * Working: the eyes read a line, left to right, WORK_SWEEP of a look each side, for WORK_READ of every WORK_MS,
 * and come back quickly for the next one. The body turns after them WORK_FOLLOW of the way (about 13 degrees
 * each side: on a 22 px avatar it is the turn that carries the eyes far enough to see), and takes a little
 * knock (WORK_KICK, about 4% shorter) as each new line starts.
 */
export const WORK_MS = 1800, WORK_READ = 0.76, WORK_SWEEP = 0.42, WORK_FOLLOW = 0.8;
const WORK_KICK = 2;
/**
 * Waiting: it rocks from side to side, WAIT_ROCK of roll each way, once every WAIT_ROCK_MS. It turns WAIT_TURN
 * toward a side a quarter of a rock before it leans that way, so it is never stopped: as the lean turns round
 * the turn is in full swing, and the other way about. The eyes go first of all (WAIT_EYES of a look, WAIT_LEAD
 * radians ahead of the turn).
 */
export const WAIT_ROCK = deg(4.5), WAIT_TURN = deg(7), WAIT_ROCK_MS = 2800;
const WAIT_EYES = 0.3, WAIT_LEAD = 0.5;
/**
 * Speaking: it bobs with each syllable. At a full syllable it is this far off the ground, this much taller,
 * and its eyes this much more open. A quiet voice still shows: the level is raised to the power SPEAK_GAIN
 * (0.2 moves it 0.38 of the way). And it never goes dead: when no level has come for SPEAK_QUIET_MS it talks
 * to a rhythm of its own, SPEAK_FLOOR of a full syllable at most, until a level comes again.
 */
export const SPEAK_LIFT = 0.06, SPEAK_STRETCH = 0.075, SPEAK_EYES = 0.2, SPEAK_GAIN = 0.6, SPEAK_FLOOR = 0.7, SPEAK_QUIET_MS = 700;
/** A level under this is no voice at all (the hiss of an open line). */
const HUSH = 0.02;
/** ... and its head sways a little as it talks. */
const SPEAK_SWAY = deg(2), SPEAK_SWAY_MS = 2300;
/**
 * Antennas (a body that has them). Left alone they sway, slowly and a little, one way and then the other
 * (ANT_SWAY each way, once every ANT_SWAY_MS). Thinking lifts the one on the side it looks to and drops the
 * other; working draws both in; waiting swings them with the rock; each syllable flicks them out.
 */
export const ANT_SWAY = deg(5), ANT_SWAY_MS = 4000;
const ANT_THINK = deg(22), ANT_WORK = deg(-9), ANT_WAIT = deg(10), ANT_SPEAK = deg(12);
/** A figure's own turning, in radians per ms. (The dots' is the pace of their pulse: once along the row every 1.5 s.) */
const SPIN: Record<Form, number> = { ring: TAU / 1000, orbit: TAU / 1400, radar: TAU / 1900, progress: 0, dots: TAU / 1500 };

/**
 * A face's manner (faces.ts) comes on over MANNER_SLOW ms for a face with no energy, MANNER_QUICK for one with
 * all of it. The posture is thrown a little past where it is going and settles (THROWN); the habits fade in.
 */
export const MANNER_SLOW = 800, MANNER_QUICK = 300;
const THROWN = [0, 0, 0.42, 1.22, 0.75, 0.97, 1, 1];
/** The habits at full strength: the tremble's lean, the sway's lean and how long one takes, how far the eyes search and how long a search takes, how fast a happy bounce goes, how long one nodding off takes. */
export const TREMBLE = deg(1.2), SWAY = deg(3.2), SWAY_MS = 4200, SCAN = 0.32, SCAN_MS = 7300, BOUNCE_HZ = 2.2, DOZE_MS = 4600;
/**
 * Left alone it is never quite still: the eyes wander a little, never repeating, and the head goes with them.
 * As far as WANDER_X and WANDER_Y of a look and WANDER_ROLL of lean, worked out on the
 * breath's own clock and steps, so an idle avatar is not redrawn more often than it was). While it watches the pointer, less.
 */
export const WANDER_X = 0.1, WANDER_Y = 0.08, WANDER_ROLL = deg(1.8);
/** Watching the pointer it leans toward it: this much per unit of look, and this much more per unit of look a second it moves. */
export const LEAN = deg(3.5), LEAN_SPEED = deg(0.5);
/** One blink in TWICE is a double, the second TWICE_MS after the first. */
export const TWICE = 0.16, TWICE_MS = 80;
/**
 * Asleep: the lids close (SLEEP_SHUT of the way, at SLEEP_RATE), the body sinks SLEEP_SINK, and the breath
 * goes SLEEP_DEEP times as deep and slows by 1 + SLEEP_SLOW.
 */
export const SLEEP_RATE = 2.2, SLEEP_SHUT = 0.94, SLEEP_SINK = 0.04, SLEEP_DEEP = 2.5, SLEEP_SLOW = 0.7;
/** Waking is quicker than falling asleep. */
export const WAKE_RATE = 7;
/** A body that floats (Personality.float) hovers this high at most, bobbing this share of it every HOVER_MS. */
export const HOVER = 0.12, HOVER_BOB = 0.25, HOVER_MS = 2600;
/** With a mark showing, it glances at it once every GLANCE_MS. */
export const GLANCE_MS = 3400;
/** A visit to another shape (Rig.visit) stays this long by default before it changes back. */
export const VISIT_MS = 900;
/**
 * Ultracode: turned on from nothing, the power waits ULTRA_WAIT ms (the star is dropping in) and eases in over
 * ULTRA_IN; turned off, it eases out from wherever it is over ULTRA_OUT; turned on again before it is all gone,
 * it eases back in from there over ULTRA_IN. The rainbow's bands go once round in ULTRA_CYCLE ms.
 */
export const ULTRA_WAIT = 220, ULTRA_IN = 450, ULTRA_OUT = 550, ULTRA_CYCLE = 1000 / 0.24;

/** A smooth wander that never repeats: three waves of unrelated lengths, -1..1. */
export function wander(t: number, ms: number): number {
  return 0.55 * Math.sin((TAU * t) / ms) + 0.3 * Math.sin((TAU * t) / (ms * 0.537) + 1.7) + 0.15 * Math.sin((TAU * t) / (ms * 0.291) + 4.1);
}

/** A small seedable random source (mulberry32): numbers in [0, 1). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A critically damped spring, solved exactly for any dt. It stops, exactly on its target, once what is left
 * cannot be seen: a thousandth of a look or of a radian is under a tenth of a pixel on a 200 px avatar. (It
 * used to run on to a hundred-thousandth: two thirds of a second more of redraws that moved nothing.)
 */
class Spring {
  x = 0; v = 0; to = 0;
  rate: number;
  constructor(rate: number) { this.rate = rate; }
  step(dt: number): void {
    const d = this.x - this.to, k = this.rate, e = Math.exp(-k * dt), c = this.v + k * d;
    this.x = this.to + (d + c * dt) * e;
    this.v = (this.v - c * k * dt) * e;
    if (Math.abs(this.x - this.to) < 1e-3 && Math.abs(this.v) < 1e-2) { this.x = this.to; this.v = 0; }
  }
  get still(): boolean { return this.x === this.to && this.v === 0; }
}

/**
 * Something on a springy stalk: knocked, it swings out, back past where it was, and dies away. Solved exactly
 * for any dt. `decay` is how fast it dies (1/s), `beat` how fast it swings (rad/s).
 */
class Wobble {
  x = 0; v = 0;
  private decay: number; private beat: number;
  constructor(decay: number, beat: number) { this.decay = decay; this.beat = beat; }
  step(dt: number): void {
    if (this.x === 0 && this.v === 0) return;
    const s = this.decay, w = this.beat, e = Math.exp(-s * dt), c = Math.cos(w * dt), n = Math.sin(w * dt);
    const a = this.x, b = (this.v + s * a) / w;
    this.x = e * (a * c + b * n);
    this.v = e * ((b * w - s * a) * c - (a * w + s * b) * n);
    // Too small to see: it has stopped.
    if (Math.abs(this.x) < 2e-4 && Math.abs(this.v) < 4e-3) { this.x = 0; this.v = 0; }
  }
  get still(): boolean { return this.x === 0 && this.v === 0; }
}

/**
 * An antenna: it heads for where it is sent and swings past it, back and forth, dying away, as a springy stalk
 * does. Exact for any dt (a Wobble about the target).
 */
class Stalk {
  to = 0;
  private w = new Wobble(6.5, 15);
  get x(): number { return this.to + this.w.x; }
  /** Send it somewhere new: it starts from where it is, so it swings there. */
  aim(to: number): void { if (to !== this.to) { this.w.x += this.to - to; this.to = to; } }
  /** Put it there at once, still. */
  set(to: number): void { this.to = to; this.w.x = 0; this.w.v = 0; }
  step(dt: number): void { this.w.step(dt); }
  get still(): boolean { return this.w.still; }
}

/** Into 0..1; anything that is not a number is 0. */
const unit = (v: number): number => (v > 0 ? Math.min(1, v) : 0);
/** How many numbers `mark` writes. */
const MARKS = 26 + FACE_KEYS.length;
const clampUnit = (v: unknown, or: number): number => (typeof v === 'number' && v === v ? Math.max(0, Math.min(1, v)) : or);

export class Rig {
  readonly state: RigState = {
    pose: { yaw: 0, pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: { ...FACES.neutral },
    morph: null, dot: 0, eyeScale: 1, stretch: 1, lift: 0, scale: 1, flip: 1, figure: null,
  };

  private rnd: () => number;
  private idle: boolean;
  private blinks: boolean;
  private eyeX = new Spring(EYE_RATE); private eyeY = new Spring(EYE_RATE);
  private yaw = new Spring(BODY_RATE); private pitch = new Spring(BODY_RATE); private roll = new Spring(BODY_RATE);
  /** A look set from outside; while there is one the idle drift waits. */
  private target: { x: number; y: number } | null = null;
  /** ms until the next blink, and the blink that is playing. */
  private blinkIn: number; private blinking: Playing | null = null;
  /** ms until the idle drift next changes, and whether it is away from the front. */
  private driftIn: number; private away = false;

  /** The face it was given (what it wears when idle), the face it is easing to, and where that easing started. */
  private given = 'neutral'; private worn: Face = FACES.neutral; private faceFrom: Face = { ...FACES.neutral }; private faceAt = FACE_MS;
  /** The clips it knows (CLIPS and any extra), its pokes in the order a plain poke() plays them, and its cues. */
  private clips: Readonly<Record<string, Clip>>; private pokes: readonly string[]; private cueNames: readonly string[];
  /** The poke that is playing, the ones waiting, and which a plain poke() plays next. */
  private poking: Playing | null = null;
  private queued: string[] = []; private nextPoke = 0; private spinDir = 1;
  /** The cues that are playing, by cueNames. */
  private cueing: (Playing | null)[];
  /** A change of shape under way, and its eyes going to dots. */
  private change: { at: number; dir: number; pushed: number } | null = null; private dotting: Playing | null = null;
  private settleDir = 1; private bodies = 0;
  /** What a landing sets going: the tilt, the squash, and the drawing-in while the shape changes. */
  private tilt = new Wobble(7.8, 17.45); private squash = new Wobble(11.1, 20.9); private dip = new Spring(22);
  /** What the Bot is doing, for how long, and the bits of state each activity keeps. */
  private activity: Activity = 'idle'; private form: Form | null = null; private actAt = 0;
  private side = 1; private cycle = 0; private nodIn = 0; private nodding: Playing | null = null;
  /** Waiting and speaking each come in and go out gently (0..1), and keep their own time while they show. */
  private wait = new Spring(GATE_RATE); private waitAt = 0;
  private talk = new Spring(GATE_RATE); private talkAt = 0;
  /** The syllable it is on when it talks to its own rhythm: how far in, how long, how strong, and how many more before a breath. */
  private sylAt = 0; private sylLen = 0; private sylAmp = 0; private sylLeft = 0;
  /** How long since a voice was last heard, in ms, and how much of its own rhythm shows (0..1). */
  private quiet = SPEAK_QUIET_MS; private own = new Spring(GATE_RATE);
  private breathAt = 0;
  /** The pose it has been told to rest in, and how awake it is (1, or 0 once at rest): the breath fades with it. */
  private home: Pose | null = null; private awake = new Spring(GATE_RATE);
  private loud = 0; private level = new Spring(LEVEL_RATE);
  private done = 0; private progress = new Spring(PROGRESS_RATE);
  /** The figure: how far in (0..1, before easing), which one, the clock that brings it up, and its turning. */
  private figK = 0; private figForm: Form = 'ring'; private figClock = 0; private turn = 0;
  private figure: Figure = { form: 'ring', k: 0, turn: 0, progress: 0 };
  private popping: Playing | null = null;
  /** The manner it is wearing (blended), the one it is going to and the one it came from, and how far in; the clock its habits keep; the jolt of a face coming on. */
  private manner: Manner = { ...PLAIN }; private mannerTo: Manner = PLAIN; private mannerFrom: Manner = { ...PLAIN }; private mannerAt = 1; private mannerMs = 1;
  private habitAt = 0; private kicking: Playing | null = null;
  /** What it is like to move. */
  private feel: Personality = { ...PERSONALITY };
  /** The wander and its clock; the lean toward the pointer; a second blink owed. */
  private wanderGate = new Spring(GATE_RATE); private wanderAt = 0; private wanderK = 0; private tick = -1;
  /** What the wander added last frame: eyes across, eyes up, lean, turn. */
  private wandered = new Float64Array(4);
  private leanGate = new Spring(GATE_RATE); private twice = false;
  /** Asleep (0..1) and for how long; the mark (0..1), whether it is wanted, and its clock; a hover's clock. */
  private sleep = new Spring(SLEEP_RATE); private sleepAt = 0;
  private markOn = false; private markK = new Spring(GATE_RATE); private markAt = 0;
  /** How far it floats (Personality.float, eased so a change does not jump). */
  private hover = new Spring(GATE_RATE / 3);
  /**
   * Ultracode: whether it is wanted; how much shows, where that easing started, how long ago and after what wait;
   * the clock its twinkles and bands keep; what the state is given; and the pickup that is playing.
   */
  private ultraOn = false; private ultraK = 0; private ultraFrom = 0; private ultraAt = 0; private ultraWait = 0;
  private ultraT = 0; private power = { amount: 0, phase: 0 }; private powering: Playing | null = null;
  /** A visit to another shape: the body to go back to, how long it has been, and how long it stays. */
  private visiting: { back: Body; at: number; stay: number } | null = null;
  private flipFrom = 1; private flipTo = 1; private flipAt = FLIP_MS;
  private paused = false;
  /** The antennas: where they are held (setAntennas), and each one's swing. */
  private held: [number, number] = [0, 0]; private antL = new Stalk(); private antR = new Stalk();
  /** A slow move to a new hold (setAntennas with a time), while it lasts. */
  private glide: { from: [number, number]; to: [number, number]; ms: number; at: number } | null = null;
  /** Whether it has been stepped yet. */
  private stepped = false;
  private before = new Float64Array(MARKS); private after = new Float64Array(MARKS);
  /** One frame's sum of the moves, and what a clip may read. */
  private o: Channels = { yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0, x: 0, arc: 0, winkL: 0, winkR: 0, glow: 0, fx: [] };
  private view: View;

  constructor(opts: RigOptions = {}) {
    this.rnd = random(opts.seed ?? 1);
    this.idle = opts.idle ?? true;
    this.blinks = opts.blinks ?? true;
    this.blinkIn = this.between(1200, 4500);
    this.driftIn = this.between(1800, 4500);
    if (opts.body) this.state.body = opts.body;
    if (opts.clips) checkClips(opts.clips);
    const clips: Readonly<Record<string, Clip>> = opts.clips ? { ...CLIPS, ...opts.clips } : CLIPS;
    this.clips = clips;
    // (The rig's own first, then the extra ones in their own order: an object would list a name like "2" before all others.)
    const names = opts.clips ? [...Object.keys(CLIPS), ...Object.keys(opts.clips)] : Object.keys(CLIPS);
    this.pokes = opts.clips ? names.filter((k) => clips[k].lane === 'poke') : POKES;
    this.cueNames = names.filter((k) => clips[k].lane === 'cue');
    this.cueing = this.cueNames.map(() => null);
    const r = this;
    this.view = {
      get yaw() { return r.yaw.x; },
      // (Through the middle of a spin there is none: the spin hides the eyes by its own yaw, and a cue's turn on top
      // would show one edge-on. It goes and comes back as the spin's own ends do, so nothing jumps.)
      get room() {
        const left = 1 - Math.min(1, Math.abs(r.eyeX.x) / r.most()), p = r.poking;
        return p && p.clip === CLIPS.spin ? left * (1 - smooth(Math.min(p.u, 1 - p.u) / 0.12)) : left;
      },
      get feel() { return r.feel; },
    };
    if (opts.personality) this.setPersonality(opts.personality);
    // (A body built to float is floating from the start.)
    this.hover.x = this.hover.to = this.idle && !opts.rest ? this.feel.float : 0;
    // Where in its wander it starts: two avatars side by side do not wander in step. (It eases in from the first
    // frame, as after a look: the first picture is the one it was built with.)
    this.wanderAt = Math.floor(this.rnd() * 60000);
    this.awake.x = this.awake.to = 1;
    const at = opts.pose;
    if (at) {
      this.yaw.x = this.yaw.to = at.yaw; this.pitch.x = this.pitch.to = at.pitch; this.roll.x = at.roll;
      this.state.pose = { yaw: at.yaw, pitch: at.pitch, roll: at.roll };
    }
    if (opts.rest) {
      this.home = at ? { yaw: at.yaw, pitch: at.pitch, roll: at.roll } : { yaw: 0, pitch: 0, roll: 0 };
      this.roll.to = this.home.roll;
      this.awake.x = this.awake.to = 0;
    }
  }

  private between(a: number, b: number): number { return a + (b - a) * this.rnd(); }

  /** Thinking, working and sleeping move the eyes themselves; a look waits until they are over. */
  private get driven(): boolean { return this.activity === 'thinking' || this.activity === 'working' || this.activity === 'sleeping'; }

  /**
   * Look toward (x, y): x right, y up, 0 0 straight ahead. The eyes go first. A look is a direction and how
   * far, and it is never further than 1 whichever way it points: a longer one is cut to 1 along its own
   * direction. (Each axis was held to 1 by itself, which made a look into a corner 1.4 long, the body turned
   * all the way and tipped all the way at once. That is the pose in which a ball that waits lost its far eye.)
   */
  look(x: number, y: number): void {
    // (A look that is not a number is no look: it would leave the springs with nowhere to go, for good.)
    if (x !== x || y !== y) return;
    let far = Math.hypot(x, y);
    // (An infinite one has no direction to keep: it is a full look to that side, or along that diagonal.)
    if (far === Infinity) { x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y)); far = Math.hypot(x, y); }
    this.target = far > 1 ? { x: x / far, y: y / far } : { x, y };
    this.away = false;
    this.unwander();
    if (!this.driven) this.face();
  }

  /**
   * The wander stops while it looks at something. What it had wandered to is handed to the springs, so the eyes
   * and head go on from where they are to the look, and nothing jumps.
   */
  private unwander(): void {
    if (this.wanderK === 0) return;
    const w = this.wandered;
    this.eyeX.x += w[0]; this.eyeY.x += w[1]; this.roll.x += w[2]; this.yaw.x += w[3];
    w.fill(0);
    this.wanderK = 0; this.wanderGate.x = this.wanderGate.v = this.wanderGate.to = 0;
  }

  /** Stop looking: back to the front, and the idle drift may start again. */
  stop(): void {
    if (!this.target) return;
    this.target = null;
    this.driftIn = this.between(1800, 4500);
    if (!this.driven) this.face();
  }

  /**
   * Come to rest in a pose and hold it: the eyes centre, the body eases round to the pose, and the breath, the
   * blinks and the idle drift stop. A poke, a change of shape or a face that is under way finishes first. Once
   * `resting` is true the picture is the still for that pose and stepping changes nothing. An activity wakes
   * it for as long as it lasts; rest(null) wakes it for good.
   */
  rest(pose: Pose | null): void {
    if (!pose) {
      if (!this.home) return;
      this.home = null;
      this.driftIn = this.between(1800, 4500);
      if (!this.driven) this.face();
      return;
    }
    this.home = { yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll };
    this.away = false;
  }

  /** Blink now. (At the pace of the face it wears: a sleepy face blinks slowly.) */
  blink(): void { if (!this.blinking) this.blinking = start(CLIPS.blink, undefined, BLINK_MS * this.mannerTo.blink); }

  /**
   * What it is like to move (clips.ts Personality): each 0..1, 0.5 the engine's own feel. Only the numbers
   * given change; one that is not a number is left as it was.
   */
  setPersonality(p: Partial<Personality>): void {
    const f = this.feel;
    for (const k of ['weight', 'squash', 'wobble', 'flare', 'float'] as const) f[k] = clampUnit(p?.[k], f[k]);
  }

  /** A mark on its outline, up and to the right, that it glances at now and then: something waits for whoever is watching. */
  setMark(on: boolean): void { this.markOn = !!on; }

  /**
   * Ultracode, a star's power, on until it is turned off. From nothing a star drops in, the body squashes as it
   * lands, and the power comes on: the body is filled with a rainbow whose bands slide round (RigState.ultra,
   * for a renderer to paint), a halo and twinkles show round it, and it floats. Turned off, it all fades.
   */
  setUltra(on: boolean): void {
    const want = !!on;
    if (want === this.ultraOn) return;
    this.ultraOn = want;
    this.ultraFrom = this.ultraK;
    if (want && this.ultraK === 0) {
      // (A pickup still playing from a moment ago plays on while its star still falls, and the power keeps its
      // time: no further on than the end of the wait, or it would come on at once. One past its star starts again.)
      if (!this.powering || this.powering.at >= (PICKUP_STAR / 100) * this.powering.ms) this.powering = start(CLIPS.pickup);
      this.ultraAt = Math.min(this.powering.at, ULTRA_WAIT); this.ultraWait = ULTRA_WAIT;
    } else {
      this.ultraAt = 0; this.ultraWait = 0;
      // Off before a frame of the pickup was played (a rig not stepped: off screen, or under reduced motion), there
      // is nothing to play out: it would drop a star with no power after it.
      if (!want && this.ultraK === 0 && this.powering?.at === 0) this.powering = null;
    }
  }

  /**
   * Go to another shape for a moment and come back: the change of shape there, `stay` ms (VISIT_MS) as that
   * shape, and the change back. A setBody meanwhile ends the visit where it is.
   */
  visit(body: Body, stay = VISIT_MS): void {
    const back = this.visiting ? this.visiting.back : this.state.body;
    if (!back || !body) return;
    this.morphTo(body);
    this.visiting = body === back ? null : { back, at: 0, stay: Number.isFinite(stay) && stay >= 0 ? stay : VISIT_MS };
  }

  /** Aim the eyes. The body is never aimed at the target: it turns after the eyes (see `step`). */
  private aim(x: number, y: number, roll: number): void {
    this.eyeX.to = x; this.eyeY.to = y; this.roll.to = roll;
  }

  /** The share of a full look this body takes (Body.look): 1 unless it declares less. */
  private most(): number {
    return Math.min(1, Math.abs(this.state.body?.look ?? 1)) || 1;
  }

  /**
   * Aim at the look target, or straight ahead. A mirrored avatar is drawn flipped, so it aims the other way to
   * look the same way. A body may turn less than all the way for a look (see Body.look).
   */
  private face(): void {
    if (this.target) this.aim(this.target.x * this.flipTo * this.most(), this.target.y, 0);
    else this.aim(0, 0, 0);
  }

  /**
   * Wear a face by name; a name the engine does not know is the neutral face. The eyes ease into it over
   * FACE_MS; its manner (faces.ts) comes on with it: the posture thrown and settled, a jolt if it has one, its habits.
   */
  setFace(name: string): void {
    this.given = name;
    // (While it does something its manner waits: every activity is worn plainly, and the face's manner comes on
    // when the activity ends.)
    this.wear(faceFor(name), this.activity === 'idle' ? mannerFor(name) : PLAIN);
  }

  private wear(face: Face, manner: Manner): void {
    if (face !== this.worn) {
      this.faceFrom = { ...this.state.face };
      this.worn = face;
      this.faceAt = 0;
    }
    if (manner !== this.mannerTo) {
      this.mannerFrom = { ...this.manner };
      this.mannerTo = manner;
      this.mannerAt = 0;
      this.mannerMs = MANNER_SLOW + (MANNER_QUICK - MANNER_SLOW) * manner.energy;
      // (A jolt during a jolt is not started again: that would drop the one in flight back to nothing in one frame.)
      if (manner.kick !== 0 && !this.kicking) this.kicking = start(CLIPS.kick, { dir: Math.sign(manner.kick), amount: Math.abs(manner.kick) });
    }
  }

  /**
   * React to a poke: 'spin' (an eased half-spin), 'nod' or 'hop'. With no kind it plays the next of the three,
   * so every poke differs from the last. A poke during a poke waits its turn (up to POKE_QUEUE of them).
   */
  poke(kind?: string): void {
    const k = typeof kind === 'string' && Object.hasOwn(this.clips, kind) && this.clips[kind].lane === 'poke' ? kind : this.pokes[this.nextPoke];
    if (this.poking && this.queued.length >= POKE_QUEUE) return;
    this.nextPoke = (this.pokes.indexOf(k) + 1) % this.pokes.length;
    if (this.poking) this.queued.push(k); else this.begin(k);
  }

  private begin(kind: string): void {
    let dir = 1;
    if (kind === 'spin') {
      // It spins the way it is already turned; from the front, the other way from last time.
      dir = Math.abs(this.yaw.x) > deg(3) ? Math.sign(this.yaw.x) : this.spinDir;
      this.spinDir = -dir;
    }
    this.poking = start(this.clips[kind], { dir });
  }

  /**
   * Play a clip by name: a poke as poke() plays it, 'blink', 'pop' (with `amount`, as emphasis()), or a cue
   * (with `dir` +1 or -1 and `amount` 0..2; a cue already playing plays on: started again it would jump back to
   * its start). False for a name it does not know and for the rig's own moves that only it plays (the waiting
   * nod, the eyes going to dots).
   */
  play(name: string, cue?: { dir?: number; amount?: number }): boolean {
    if (typeof name !== 'string' || !Object.hasOwn(this.clips, name)) return false;
    const clip = this.clips[name];
    switch (clip.lane) {
      case 'poke': this.poke(name); return true;
      case 'blink': this.blink(); return true;
      case 'pop': this.emphasis(cue?.amount ?? 1); return true;
      case 'cue': {
        const amount = cue?.amount, i = this.cueNames.indexOf(name);
        if (this.cueing[i]) return true;
        this.cueing[i] = start(clip, {
          dir: (cue?.dir ?? 1) < 0 ? -1 : 1,
          amount: typeof amount === 'number' && Number.isFinite(amount) ? Math.max(0, Math.min(2, amount)) : 1,
        });
        return true;
      }
      default: return false;
    }
  }

  /** Is a cue playing? */
  private anyCue(): boolean {
    for (let i = 0; i < this.cueing.length; i++) if (this.cueing[i]) return true;
    return false;
  }

  /**
   * Change shape: the outline morphs from the body on screen to this one, the eyes shrink to dots part way,
   * the new body lands with a soft tilt, then it blinks. A change during a change starts from the in-between.
   */
  setBody(body: Body): void {
    this.visiting = null;
    this.morphTo(body);
  }

  private morphTo(body: Body): void {
    const s = this.state;
    if (body === s.body) return;
    const from: Source | undefined = s.morph ? caught(s.morph.from, s.body!, s.morph.k) : s.body;
    s.body = body;
    this.bodies++;
    // The new body may turn a different way for the same look.
    if (this.target && !this.driven) this.face();
    if (!from) return;
    s.morph = { from, k: 0 };
    // (If the eyes are already dots from a change that was under way, they stay dots.)
    this.dotting = start(CLIPS.dots, { from: this.change ? s.dot ?? 0 : 0 });
    this.change = { at: 0, dir: this.settleDir, pushed: 0 };
    this.settleDir = -this.settleDir;
  }

  /**
   * What the Bot is doing. Thinking and working may take a form: the body then turns into that loading figure
   * for a few seconds at a time (a progress ring stays until the activity ends).
   */
  setActivity(kind: Activity | string, form?: Form | string | null): void {
    const k = (ACTIVITIES as readonly string[]).includes(kind) ? (kind as Activity) : 'idle';
    const f = (k === 'thinking' || k === 'working') && (FORMS as readonly string[]).includes(form ?? '') ? (form as Form) : null;
    if (k === this.activity) {
      if (f !== this.form) { this.form = f; this.figClock = 0; }
      return;
    }
    this.activity = k; this.form = f; this.actAt = 0; this.figClock = 0; this.cycle = 0;
    this.away = false;
    // A blink as one thing gives way to another: the switch happens behind it. (Not before the first frame: an
    // avatar that starts out busy has nothing to switch from.)
    if (this.blinks && this.stepped && (!this.home || k !== 'idle')) this.blink();
    if (k === 'thinking') this.side = this.rnd() < 0.5 ? -1 : 1;
    if (k === 'waiting') this.nodIn = this.between(1300, 2400);
    // Starting to speak with no voice to follow, its own rhythm is there from the first syllable.
    if (k === 'speaking' && this.talk.x === 0) { this.own.x = this.quiet >= SPEAK_QUIET_MS ? 1 : 0; this.own.v = 0; }
    if (k === 'idle') this.driftIn = this.between(1800, 4500);
    if (!this.driven) this.face();
    this.wear(k === 'idle' ? faceFor(this.given) : ACTIVITY_FACES[k], k === 'idle' ? mannerFor(this.given) : PLAIN);
  }

  /** How loud the Bot's voice is right now, 0..1. While it is speaking it bobs to this; given none, it bobs to a rhythm of its own. */
  setLevel(level: number): void { this.loud = unit(level); }

  /** How far along the work is, 0..1, for the progress ring. */
  setProgress(amount: number): void { this.done = unit(amount); }

  /** Flip left and right. It still looks toward what it was told to look at. */
  mirror(on = true): void {
    const to = on ? -1 : 1;
    if (to === this.flipTo) return;
    this.flipFrom = this.state.flip ?? 1; this.flipTo = to; this.flipAt = 0;
    if (!this.driven && this.target) this.face();
  }

  /** A short pop for a moment that matters: a quick scale-up and settle. `amount` 1 is the usual size. */
  emphasis(amount = 1): void {
    const a = Math.max(0, Math.min(2, amount));
    if (a > 0) this.popping = start(CLIPS.pop, { amount: a, from: this.popping ? (this.state.scale ?? 1) - 1 : 0 });
  }

  /**
   * Where the antennas are held, the viewer's left and right, in radians from where they rest (positive is
   * outward, away from the middle): a mood's pose. They swing there (or, given `ms`, move there slowly over
   * that long) and stay until told otherwise. Only a body with antennas shows it.
   */
  setAntennas(left: number, right: number, ms = 0): void {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return;
    // Over `ms`, eased in and out (a slow droop), from where they are held now; at once, a spring's swing.
    if (ms > 0 && Number.isFinite(ms)) this.glide = { from: [this.held[0], this.held[1]], to: [left, right], ms, at: 0 };
    else this.glide = null;
    if (!this.glide) this.held = [left, right];
  }

  /** Freeze everything where it is; pause(false) carries on from there. */
  pause(on = true): void { this.paused = on; }

  /** The numbers that decide the picture, for telling whether a step changed it. */
  private mark(out: Float64Array): void {
    const s = this.state, f = s.face, g = s.figure;
    out[0] = s.pose.yaw; out[1] = s.pose.pitch; out[2] = s.pose.roll; out[3] = s.eye.x; out[4] = s.eye.y; out[5] = s.lid;
    out[6] = s.dot!; out[7] = s.eyeScale!; out[8] = s.stretch!; out[9] = s.lift!; out[10] = s.scale!; out[11] = s.flip!;
    out[12] = s.morph ? s.morph.k : -1; out[13] = this.bodies;
    out[14] = g ? g.k : -1; out[15] = g ? g.turn : 0; out[16] = g ? g.progress : 0; out[17] = g ? FORMS.indexOf(g.form) : -1;
    for (let i = 0; i < FACE_KEYS.length; i++) out[18 + i] = f[FACE_KEYS[i]];
    const at = 18 + FACE_KEYS.length, a = s.antennas, lids = s.lids;
    out[at] = a ? a[0] : 0; out[at + 1] = a ? a[1] : 0;
    out[at + 2] = s.shift ?? 0; out[at + 3] = s.arc ?? 0; out[at + 4] = lids ? lids[0] : 1; out[at + 5] = lids ? lids[1] : 1; out[at + 6] = s.glow ?? 0; out[at + 7] = s.fx ? s.fx.length : 0;
  }

  /** Advance by dt milliseconds. True when the picture changed. Time only runs forward: a dt that is negative or not a finite number is no step. */
  step(dtMs: number): boolean {
    if (this.paused || !(dtMs >= 0) || dtMs === Infinity) return false;
    const s = this.state, o = this.o, v = this.view;
    this.stepped = true;
    this.mark(this.before);

    if (this.faceAt < FACE_MS) {
      this.faceAt = Math.min(FACE_MS, this.faceAt + dtMs);
      mixFace(this.faceFrom, this.worn, smooth(this.faceAt / FACE_MS), s.face);
    }
    if (this.mannerAt < this.mannerMs) {
      // The posture is thrown past where it is going and settles; everything else simply eases in.
      this.mannerAt = Math.min(this.mannerMs, this.mannerAt + dtMs);
      const a = this.mannerAt / this.mannerMs, thrown = a >= 1 ? 1 : track(THROWN, a), eased = smooth(a), m = this.manner, from = this.mannerFrom, to = this.mannerTo;
      for (const k of MANNER_KEYS) m[k] = a >= 1 ? to[k] : from[k] + (to[k] - from[k]) * (k === 'yaw' || k === 'pitch' || k === 'roll' || k === 'rise' ? thrown : eased);
    }

    // Where the eyes are sent. Idle drifts; thinking and working move them by the clock; otherwise the look stands.
    const act = this.activity;
    const home = act === 'idle' ? this.home : null;
    this.awake.to = home ? 0 : 1;
    this.awake.step(dtMs / 1000);
    if (home) {
      // Coming to rest: eyes to the middle, whatever they were told to look at.
      this.aim(0, 0, home.roll);
    } else if (act === 'idle') {
      if (this.idle && !this.target) {
        this.driftIn -= dtMs;
        if (this.driftIn <= 0) {
          if (this.away) {
            this.aim(0, 0, 0);
            this.driftIn = this.between(2500, 6000);
          } else {
            // A subtle three-quarter view: up to about 22 degrees of yaw, 10 of pitch, a few of roll.
            const side = this.rnd() < 0.5 ? -1 : 1;
            this.aim(side * this.between(0.5, 1) * IDLE_YAW, this.between(-0.4, 1) * IDLE_PITCH, side * deg(this.between(1.5, 4.5)));
            this.driftIn = this.between(1600, 3600);
          }
          this.away = !this.away;
        }
      }
    } else {
      this.actAt += dtMs;
      if (act === 'thinking') {
        // Up and to one side, hold, and back: slowly, with the head tipping a little that way.
        const cycle = Math.floor(this.actAt / THINK_MS);
        if (cycle !== this.cycle) { this.cycle = cycle; if (this.rnd() < 0.4) this.side = -this.side; }
        const away = track([0.04, 0, 0.3, 1, 0.62, 1, 0.88, 0], (this.actAt % THINK_MS) / THINK_MS);
        this.aim(this.side * 0.42 * away, 0.06 + 0.62 * away, this.side * deg(3.5) * away);
      } else if (act === 'working') {
        // Eyes down on the work, reading: steadily across a line, quickly back for the next.
        const u = (this.actAt % WORK_MS) / WORK_MS;
        const across = u < WORK_READ ? -1 + (2 * u) / WORK_READ : 1 - 2 * smooth((u - WORK_READ) / (1 - WORK_READ));
        this.aim(WORK_SWEEP * across, -0.32, 0);
        // A new line: a little knock, which the body takes like a landing (down a touch, and back). Not as a
        // loading figure: a progress ring holds its shape.
        const line = Math.floor(this.actAt / WORK_MS + 1 - WORK_READ);
        if (line !== this.cycle) { this.cycle = line; if (this.figK === 0) this.squash.v -= WORK_KICK; }
      } else if (act === 'sleeping') {
        // Asleep: the eyes low and the head tipped a little.
        this.aim(0, -0.3, deg(3));
      }
    }

    // The figure: up while the activity has a form and its clock says so, down otherwise.
    o.dot = 0; o.eyeScale = 1;
    const want = this.form;
    let up = false;
    if (want) {
      this.figClock += dtMs;
      const t = this.figClock - FIGURE_AFTER;
      up = t >= 0 && (want === 'progress' || t % (FIGURE_HOLD + FIGURE_REST) < FIGURE_HOLD);
    }
    if (this.figK === 0 && want) this.figForm = want;
    if (this.figForm !== want) up = false;
    if (up || this.figK > 0) {
      this.figK = up ? Math.min(1, this.figK + dtMs / FIGURE_MS) : Math.max(0, this.figK - dtMs / FIGURE_MS);
      // Back as a body: it blinks, as after any change of shape.
      if (this.figK === 0) { this.blinking = start(CLIPS.blink); this.turn = 0; }
    }
    this.progress.to = this.done;
    this.progress.step(dtMs / 1000);
    if (this.figK > 0) {
      this.turn = (this.turn + dtMs * SPIN[this.figForm]) % TAU;
      const g = this.figure;
      g.form = this.figForm; g.k = inOut(this.figK); g.turn = this.turn; g.progress = this.progress.x;
      s.figure = g;
      o.dot = smooth(g.k / 0.3);
      if (g.form === 'orbit' || g.form === 'radar') {
        // The eyes stay, as dots, and watch the little ball (or the sweep) go round.
        if (up && g.k > 0.5) this.aim(0.3 * Math.cos(g.turn), -0.4 * Math.sin(g.turn), 0);
      } else o.eyeScale = 1 - smooth((g.k - 0.2) / 0.3);
    } else s.figure = null;

    const dt = dtMs / 1000;
    this.eyeX.step(dt); this.eyeY.step(dt);
    // The body turns toward where the eyes are now, not toward the target: while the eyes are still setting
    // off it has nothing to follow, so it starts a beat (about 60 ms) after them.
    // (Reading, the eyes do the travelling and the body only part of it.)
    // (At rest, toward the rest pose: with the eyes back in the middle, exactly to it.)
    this.yaw.to = this.eyeX.x * LOOK_YAW * (act === 'working' ? WORK_FOLLOW : 1) + (home ? home.yaw : 0);
    this.pitch.to = this.eyeY.x * LOOK_PITCH + (home ? home.pitch : 0);
    this.yaw.step(dt); this.pitch.step(dt); this.roll.step(dt);

    // The little moves: each adds to the pose and comes back to nothing (clips.ts).
    o.yaw = 0; o.pitch = 0; o.roll = 0; o.eyeY = 0; o.eyeX = 0; o.lift = 0; o.stretch = 1; o.scale = 1; o.open = 1; o.antL = 0; o.antR = 0;
    o.x = 0; o.arc = 0; o.winkL = 0; o.winkR = 0; o.glow = 0; o.fx.length = 0;

    if (!this.poking && this.queued.length) this.begin(this.queued.shift()!);
    this.poking = advance(this.poking, dtMs, o, v);
    this.kicking = advance(this.kicking, dtMs, o, v);

    // A visit to another shape: back again once it has been there long enough.
    const visit = this.visiting;
    if (visit) {
      visit.at += dtMs;
      if (visit.at >= CHANGE_MS + visit.stay) { this.visiting = null; this.morphTo(visit.back); }
    }

    const ch = this.change;
    if (ch) {
      ch.at += dtMs;
      const at = ch.at;
      if (at < MORPH_MS && s.morph) s.morph.k = inOut(at / MORPH_MS); else s.morph = null;
      // The eyes are dots through the middle of it.
      this.dotting = advance(this.dotting, dtMs, o, v);
      // Landing: a push that tips it a few degrees (it springs back) and squashes it a little.
      if (ch.pushed < 1 && at > LAND_AT) {
        const share = smooth((at - LAND_AT) / KICK_MS) - ch.pushed;
        ch.pushed += share; this.tilt.v += ch.dir * SETTLE_KICK * share; this.squash.v -= SQUASH_KICK * share;
      }
      // Then the blink, and the change is over (the tilt dies away in its own time).
      if (at >= BLINK_AT) { this.blinking = start(CLIPS.blink); this.change = null; }
    }
    // It draws in a little while the shape is changing and fills out again as the new one arrives.
    this.dip.to = this.change && this.change.at < MORPH_MS * 0.55 ? 0.07 : 0;
    this.dip.step(dt); this.tilt.step(dt); this.squash.step(dt);
    o.roll += this.tilt.x; o.stretch *= 1 + this.squash.x; o.scale *= 1 - this.dip.x;

    // Waiting: it rocks slowly from side to side, like someone shifting their weight: the eyes go over, the
    // body turns after them, and then it leans that way.
    this.wait.to = act === 'waiting' ? 1 : 0;
    this.wait.step(dt);
    if (this.wait.x > 0) {
      this.waitAt += dtMs;
      const a = (this.waitAt / WAIT_ROCK_MS) * TAU;
      o.roll += this.wait.x * WAIT_ROCK * Math.sin(a);
      // (It turns only in the room a look has left: held at a full look it leans and does not turn further,
      // or a ball's far eye would go round the rim and come back with every rock.)
      o.yaw -= this.wait.x * WAIT_TURN * Math.cos(a) * (1 - Math.min(1, Math.abs(this.eyeX.x) / this.most()));
      o.eyeX -= this.wait.x * WAIT_EYES * Math.cos(a + WAIT_LEAD);
    } else this.waitAt = 0;
    // And a small nod now and then. One that has started finishes, whatever the Bot does next.
    if (act === 'waiting' && !this.nodding) {
      this.nodIn -= dtMs;
      if (this.nodIn <= 0) { this.nodding = start(CLIPS.waitNod); this.nodIn = this.between(2600, 5200); }
    } else this.nodding = advance(this.nodding, dtMs, o, v);

    // Speaking: a bob with each syllable. The voice's level drives it (a quiet one more than its share). When
    // no level comes, or none has for a while, a rhythm of its own takes over, so it never stands there dead.
    this.level.to = act === 'speaking' ? this.loud ** SPEAK_GAIN : 0;
    this.level.step(dt);
    this.talk.to = act === 'speaking' ? 1 : 0;
    this.talk.step(dt);
    this.quiet = act === 'speaking' && this.loud > HUSH ? 0 : Math.min(SPEAK_QUIET_MS, this.quiet + dtMs);
    this.own.to = act === 'speaking' && this.quiet >= SPEAK_QUIET_MS ? 1 : 0;
    this.own.step(dt);
    let voice = Math.min(1, this.level.x);
    if (this.talk.x > 0) {
      this.talkAt += dtMs; this.sylAt += dtMs;
      while (this.sylAt >= this.sylLen) {
        // The next syllable: a few in a row, each its own length and strength, then a short breath.
        this.sylAt -= this.sylLen;
        const rest = this.sylLeft <= 0;
        this.sylLeft = rest ? 3 + Math.floor(this.between(0, 5)) : this.sylLeft - 1;
        this.sylLen = rest ? this.between(110, 200) : this.between(170, 250);
        this.sylAmp = rest ? 0 : this.between(0.65, 1);
      }
      const own = SPEAK_FLOOR * this.talk.x * this.own.x * this.sylAmp * Math.sin((Math.PI * this.sylAt) / this.sylLen) ** 2;
      voice = 1 - (1 - own) * (1 - voice);
      o.roll += this.talk.x * SPEAK_SWAY * Math.sin((this.talkAt / SPEAK_SWAY_MS) * TAU);
    } else { this.talkAt = 0; this.sylAt = 0; this.sylLen = 0; this.sylLeft = 0; }
    if (voice !== 0) { o.lift += SPEAK_LIFT * voice; o.stretch *= 1 + SPEAK_STRETCH * voice; o.open += SPEAK_EYES * voice; }

    // The face's manner: its posture, and its habits. (All of it fades as it comes to rest, and the habits as it falls asleep.)
    const m = this.manner, awake = this.awake.x, lively = awake * (1 - this.sleep.x);
    // The breath's clock, which the wander and a hover keep too: quicker for a lively face, slower asleep.
    const pace = 1 + ((m.energy - 0.4) * 0.7) / 0.98;
    if (this.idle) this.breathAt += this.sleep.x > 0 ? (dtMs * pace) / (1 + SLEEP_SLOW * this.sleep.x) : dtMs * pace;
    if (awake > 0) {
      o.yaw += m.yaw * v.room * awake; o.pitch += m.pitch * awake; o.roll += m.roll * awake; o.lift += m.rise * awake;
    }
    if (this.idle && lively > 0 && (m.tremble || m.sway || m.scan || m.bounce || m.doze)) {
      this.habitAt += dtMs;
      // (The quick habits, the tremble and the bounce, every frame; the slow ones on the breath's steps, so a face
      // that only sways or searches is redrawn no more often than the breath.)
      const t = this.habitAt, sec = t / 1000, slow = Math.floor(this.breathAt / BREATH_STEP) * BREATH_STEP;
      if (m.tremble) {
        const w = m.tremble * lively;
        o.roll += w * TREMBLE * (Math.sin(41 * sec) + 0.6 * Math.sin(53.7 * sec + 1) + 0.4 * Math.sin(29.3 * sec + 2)) / 2;
        o.eyeX += w * 0.015 * Math.sin(37 * sec + 0.5);
      }
      if (m.sway) {
        const w = m.sway * lively, a = (TAU * slow) / SWAY_MS;
        o.roll += w * SWAY * Math.sin(a); o.eyeX += w * 0.05 * v.room * Math.sin(a - 0.6);
      }
      if (m.scan) {
        // Searching: the eyes go slowly from side to side, the head part of the way with them.
        const w = m.scan * lively, n = wander(slow, SCAN_MS);
        o.eyeX += w * SCAN * n * v.room; o.yaw += w * deg(10) * n * v.room;
      }
      if (m.bounce) {
        const w = m.bounce * lively, q = Math.abs(Math.sin(Math.PI * BOUNCE_HZ * sec));
        o.lift += w * 0.035 * q; o.stretch *= 1 + w * 0.03 * (q - 0.5);
      }
      if (m.doze) {
        // Nodding off: a long slow sink, the lids coming down with it, and a sudden catch back up.
        const w = m.doze * lively, u = (slow % DOZE_MS) / DOZE_MS, sink = u < 0.84 ? (u / 0.84) ** 2 : 1 - smooth((u - 0.84) / 0.16);
        o.lift -= w * 0.04 * sink; o.pitch -= w * deg(9) * sink; o.open *= 1 - w * 0.45 * sink;
      }
    } else this.habitAt = 0;

    // The wander: the eyes are never quite still, and the head goes a little way with them.
    // (While it watches the pointer the eyes are on that.)
    this.wanderGate.to = act === 'idle' && this.idle && !home && !this.target ? 1 : 0;
    this.wanderGate.step(dt);
    // (On the breath's clock and its steps, the gate included, so the two change on the same frames: an idle
    // avatar is redrawn no more often for it.)
    const tick = Math.floor(this.breathAt / BREATH_STEP);
    if (tick !== this.tick) { this.tick = tick; this.wanderK = this.wanderGate.x; }
    if (this.wanderK > 0) {
      const w = this.wanderK, tq = this.wanderAt + tick * BREATH_STEP;
      const nx = WANDER_X * wander(tq, 11300) + 0.03 * wander(tq, 3700), d = this.wandered;
      d[0] = w * nx; d[1] = w * (WANDER_Y * wander(tq, 9100) + 0.025 * wander(tq, 4300));
      d[2] = w * WANDER_ROLL * wander(tq, 13700); d[3] = w * nx * LOOK_YAW * 0.6 * v.room;
      o.eyeX += d[0]; o.eyeY += d[1]; o.roll += d[2]; o.yaw += d[3];
    } else this.wandered.fill(0);
    // Watching the pointer, it leans toward it, and more while the pointer moves.
    this.leanGate.to = this.target && !this.driven && !home ? 1 : 0;
    this.leanGate.step(dt);
    if (this.leanGate.x > 0) o.roll += this.leanGate.x * (LEAN * this.eyeX.x + LEAN_SPEED * Math.max(-5, Math.min(5, this.eyeX.v)));

    // Asleep: the lids close, it sinks, and Zs go up.
    this.sleep.to = act === 'sleeping' ? 1 : 0;
    this.sleep.rate = act === 'sleeping' ? SLEEP_RATE : WAKE_RATE;
    this.sleep.step(dt);
    const asleep = this.sleep.x;
    if (asleep > 0) {
      this.sleepAt += dtMs;
      o.open *= 1 - SLEEP_SHUT * asleep; o.lift -= SLEEP_SINK * asleep;
      if (asleep > 0.02) o.fx.push({ kind: 'zzz', u: 0, t: this.sleepAt, dir: 1, amount: asleep });
    } else this.sleepAt = 0;

    // A body that floats hovers off the ground, bobbing. (Worked out 30 times a second.) Powered, every body floats.
    this.hover.to = this.idle && !home ? (this.ultraOn ? Math.max(this.feel.float, 1) : this.feel.float) : 0;
    this.hover.step(dt);
    if (this.hover.x > 0) {
      const tq = Math.floor(this.breathAt / BREATH_STEP) * BREATH_STEP;
      o.lift += this.hover.x * HOVER * awake * (1 + HOVER_BOB * Math.sin((TAU * tq) / HOVER_MS));
    }

    // The mark: it pops on, sends out a ring now and then, and the eyes go to it every so often.
    this.markK.to = this.markOn ? 1 : 0;
    this.markK.step(dt);
    if (this.markK.x > 0) {
      this.markAt += dtMs;
      const k = this.markK.x, g = k * track([0, 0, 0.12, 1, 0.4, 1, 0.52, 0, 1, 0], (this.markAt % GLANCE_MS) / GLANCE_MS);
      o.eyeX += 0.32 * g * v.room * this.flipTo; o.eyeY += 0.28 * g; o.roll += deg(3) * g * this.flipTo;
      o.fx.push({ kind: 'mark', u: 0, t: this.markAt, dir: 1, amount: k });
    } else this.markAt = 0;

    // Ultracode: the power eases in once the star has dropped in, or out, from wherever it is. While any of it
    // shows, its clock runs: the bands slide round, and the halo and the twinkles show.
    if (this.ultraOn || this.ultraK > 0) {
      this.ultraAt += dtMs;
      const from = this.ultraFrom, q = this.ultraOn ? smooth((this.ultraAt - this.ultraWait) / ULTRA_IN) : smooth(this.ultraAt / ULTRA_OUT);
      this.ultraK = this.ultraOn ? (q >= 1 ? 1 : from + (1 - from) * q) : from * (1 - q);
    }
    if (this.ultraK > 0) {
      this.ultraT += dtMs;
      const pw = this.power;
      pw.amount = this.ultraK; pw.phase = (this.ultraT % ULTRA_CYCLE) / ULTRA_CYCLE;
      s.ultra = pw;
      o.fx.push({ kind: 'ultra', u: 0, t: this.ultraT, dir: 1, amount: this.ultraK });
    } else {
      this.ultraT = 0;
      if (s.ultra) delete s.ultra;
    }

    // Idle or not, it breathes: a little taller and back, slowly. (Not with idle off: then a rig left alone
    // is still. And not as a loading figure: a ring stays round.) A lively face breathes quicker, a sleeper slower and deeper.
    if (this.idle) {
      o.stretch *= 1 + BREATH * (1 + (SLEEP_DEEP - 1) * asleep) * awake * (1 - (s.figure ? s.figure.k : 0)) * Math.sin((Math.PI * Math.floor(this.breathAt / BREATH_STEP) * BREATH_STEP) / BREATH_MS) ** 2;
    }

    // The pop, then the cues, in the order the clips are listed.
    this.popping = advance(this.popping, dtMs, o, v);
    for (let i = 0; i < this.cueing.length; i++) this.cueing[i] = advance(this.cueing[i], dtMs, o, v);
    // And ultracode's pickup.
    this.powering = advance(this.powering, dtMs, o, v);

    if (this.flipAt < FLIP_MS) {
      this.flipAt = Math.min(FLIP_MS, this.flipAt + dtMs);
      s.flip = this.flipAt >= FLIP_MS ? this.flipTo : this.flipFrom + (this.flipTo - this.flipFrom) * inOut(this.flipAt / FLIP_MS);
    }

    if (!this.blinking && (home || asleep > 0.3)) {
      // At rest it does not blink, nor asleep.
    } else if (this.blinks && !this.blinking) {
      // A lively face blinks more often. Now and then a blink comes twice.
      this.blinkIn -= dtMs * pace;
      if (this.blinkIn <= 0) {
        this.blinking = start(CLIPS.blink, undefined, BLINK_MS * this.manner.blink);
        if (!this.twice && this.rnd() < TWICE) { this.blinkIn = TWICE_MS; this.twice = true; } else { this.blinkIn = this.between(2200, 6500); this.twice = false; }
      }
    } else this.blinking = advance(this.blinking, dtMs, o, v);
    s.lid = o.open;
    // (The newer numbers are on the state only while they show, so a rig that never uses them has the state it always had.)
    if (o.winkL > 0 || o.winkR > 0) s.lids = [1 - SLEEP_SHUT * Math.min(1, o.winkL), 1 - SLEEP_SHUT * Math.min(1, o.winkR)]; else if (s.lids) delete s.lids;
    if (o.x) s.shift = o.x; else if (s.shift !== undefined) delete s.shift;
    if (o.arc) s.arc = o.arc; else if (s.arc !== undefined) delete s.arc;
    if (o.glow > 0) s.glow = Math.min(1, o.glow); else if (s.glow !== undefined) delete s.glow;
    if (o.fx.length) s.fx = o.fx.slice(); else if (s.fx !== undefined) delete s.fx;

    // (`|| 0` so that a move that has come back to nothing leaves a plain zero, never a negative one.)
    // (The eyes slide no further than the body's own full look: past it a ball's far eye is round the rim.)
    const most = this.most();
    s.eye.x = Math.max(-most, Math.min(most, this.eyeX.x + o.eyeX)) || 0; s.eye.y = (this.eyeY.x + o.eyeY) || 0;
    s.pose.yaw = (this.yaw.x + o.yaw) || 0; s.pose.pitch = (this.pitch.x + o.pitch) || 0; s.pose.roll = (this.roll.x + o.roll) || 0;
    s.dot = o.dot; s.eyeScale = o.eyeScale; s.stretch = o.stretch; s.lift = o.lift; s.scale = o.scale;
    if (s.body?.antennas) this.antennas(dtMs, voice);
    else {
      if (s.antennas) s.antennas = undefined;
      // A body with none has nothing left to swing: a glide or a swing that was on its way ends where it was going,
      // so the rig can still come to rest (the stalks are only ever stepped on a body that has them).
      if (this.glide) { this.held = [this.glide.to[0], this.glide.to[1]]; this.glide = null; }
      if (!this.antL.still || !this.antR.still) { this.antL.set(this.held[0]); this.antR.set(this.held[1]); }
    }

    this.mark(this.after);
    // (An effect is always on its way somewhere: a frame with one is a new picture.)
    if (s.fx) return true;
    for (let i = 0; i < MARKS; i++) if (this.before[i] !== this.after[i]) return true;
    return false;
  }

  /**
   * The antennas for this step: held where they were told, moved by what the Bot is doing, swaying when idle
   * (with the breath, and as seldom), flicked by each syllable, and swung by any clip. Worked out only for a
   * body that has them, so no other body's frames change.
   */
  private antennas(dtMs: number, voice: number): void {
    const s = this.state, o = this.o, act = this.activity, dt = dtMs / 1000;
    const g = this.glide;
    if (g) {
      g.at += dtMs;
      const k = smooth(Math.min(1, g.at / g.ms));
      this.held = [g.from[0] + (g.to[0] - g.from[0]) * k, g.from[1] + (g.to[1] - g.from[1]) * k];
      if (g.at >= g.ms) { this.held = [g.to[0], g.to[1]]; this.glide = null; }
    }
    let l = this.held[0], r = this.held[1];
    if (act === 'thinking') { l += this.side < 0 ? ANT_THINK : -ANT_THINK / 3; r += this.side > 0 ? ANT_THINK : -ANT_THINK / 3; }
    else if (act === 'working') { l += ANT_WORK; r += ANT_WORK; }
    // (The first frame with antennas puts them where they are sent, still: a body that arrives with them does not swing in.)
    if (!s.antennas) { this.antL.set(l); this.antR.set(r); } else { this.antL.aim(l); this.antR.aim(r); }
    this.antL.step(dt); this.antR.step(dt);
    let sl = this.antL.x + o.antL, sr = this.antR.x + o.antR;
    if (this.idle) {
      const sway = ANT_SWAY * this.awake.x * Math.sin((2 * Math.PI * Math.floor(this.breathAt / BREATH_STEP) * BREATH_STEP) / ANT_SWAY_MS);
      sl += sway; sr -= sway;
    }
    if (this.wait.x > 0) { const w = this.wait.x * ANT_WAIT * Math.sin((this.waitAt / WAIT_ROCK_MS) * TAU); sl += w; sr -= w; }
    if (voice !== 0) { sl += ANT_SPEAK * voice; sr += ANT_SPEAK * voice; }
    const a = s.antennas ?? (s.antennas = [0, 0]);
    a[0] = sl || 0; a[1] = sr || 0;
  }

  /**
   * True when nothing is moving but its life: the breath, the wander, a hover, a face's habits (a blink or a
   * drift may still be on its way).
   */
  get still(): boolean {
    return !this.blinking && this.eyeX.still && this.eyeY.still && this.yaw.still && this.pitch.still && this.roll.still
      && !this.poking && !this.queued.length && !this.change && this.faceAt >= FACE_MS && !this.popping && this.flipAt >= FLIP_MS
      && this.figK === 0 && !this.nodding && this.level.still && this.activity === 'idle' && this.wait.x === 0 && this.talk.x === 0
      && this.tilt.still && this.squash.still && this.dip.still && !this.anyCue()
      && !this.kicking && this.mannerAt >= this.mannerMs && this.sleep.x === 0 && !this.markOn && this.markK.x === 0 && !this.visiting && this.leanGate.still
      && this.antL.still && this.antR.still && !this.glide
      && !this.ultraOn && this.ultraK === 0 && !this.powering;
  }

  /** True once it has come to rest (see `rest`): a still picture that no step will change until it is woken, poked or changed. */
  get resting(): boolean {
    const home = this.home;
    return home !== null && this.awake.x === 0 && this.still && this.wanderK === 0 && this.hover.x === 0 && this.yaw.x === home.yaw && this.pitch.x === home.pitch && this.roll.x === home.roll;
  }
}
