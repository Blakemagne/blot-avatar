// Jacrispy: the head of a Reachy Mini, as an avatar. A wide rounded head with two round black lenses (a big
// one on the viewer's left, a smaller one on the right, as the robot's own are), the bar that holds them, and
// two thin antennas that come up from the back of the head and swing. jacrispyFace() puts the same face (the
// lenses, the bar and the antennas) on any other body.
//
// The proportions are measured from the Reachy Mini's published model (Pollen Robotics): the head is 150 by
// 94 mm, the lenses are 41 and 32 mm across and 68 mm apart. No geometry from that model is used here; only
// its proportions. See THIRD_PARTY_NOTICES.

import type { Antennas, Body, Decal, Piece, Sphere } from '../body';
import type { Channels, Clip } from '../clips';
import { track } from '../ease';
import { surfaceAt } from '../field';
import { deg } from '../math';

/** A rounded box: eight spheres of radius r, their centres at +-x, the two heights given, and +-z. */
function box(x: number, y0: number, y1: number, z: number, r: number): Piece {
  const out: Sphere[] = [];
  for (const sx of [-1, 1]) for (const y of [y0, y1]) for (const sz of [-1, 1]) out.push([sx * x, y, sz * z, r]);
  return out;
}

/**
 * His head, and nothing else of him: 150 mm wide and 94 tall on the robot, here 1.96 wide and 1.2 tall and a
 * little less deep, with well rounded corners: the white tablet of the station's icon. It sits low in the
 * picture to leave room above it for the antennas.
 */
const MID_Y = -0.42, HW = 0.62, HH = 0.24, HZ = 0.12, HR = 0.36;
const HEAD: Piece = box(HW, MID_Y - HH, MID_Y + HH, HZ, HR);
/** A millimetre on the robot, in body units: the head is 1.96 wide for 150 mm. */
const MM = (2 * (HW + HR)) / 150;

/**
 * Its colours, from the robot's own model: black antennas, near-black lens caps for rims, the dark grey
 * glasses holder for the bridge and the grey camera between the lenses. The lenses themselves (the eyes) are
 * JACRISPY_EYE. A renderer may paint any of these over.
 */
export const JACRISPY_PAINT = { antenna: '#141414', rim: '#141414', bridge: '#141414', camera: '#7F7F7F' } as const;
/** The colour to draw its body in: the white of its shell. */
export const JACRISPY_COLOUR = '#F4F2EC';
/** The colour to draw its eyes in: his lenses, black as on the station's icon and the stickers. */
export const JACRISPY_EYE = '#161616';

/**
 * What makes a face his, measured from the Reachy Mini's model (mm, its head 150 wide). The lenses, with their
 * caps: 41 and 32 across. The glasses holder shows as a bar between them at their middle height; drawn a
 * sixth as tall as a lens, a little more than on the robot, so it reads at avatar size. The camera, 6 across, sits in
 * the middle of it. Each antenna: a rod about 4 across, a spring 10 across wound round it from 11 mm to 43 mm
 * above the head, and a cap on its tip.
 */
const LENS_BIG = 41, LENS_SMALL = 32, BAR = 0.17, CAMERA = 6, CAP = 3;

export interface FaceOptions {
  /** A ring round each lens, in the rim colour (default off: on the icon each lens is one black disc). */
  rims?: boolean;
  /** The bar between the lenses (default on). */
  bridge?: boolean;
  /** The camera in the middle of the bar (default off: too small to read at avatar size). */
  camera?: boolean;
  /** The two antennas (default on). */
  antennas?: boolean;
}

/**
 * The face: two lenses of the robot's two sizes, the bar between them, and if asked for their rims and the
 * camera, all worked out from a body's own eyes, so it fits any body. The eyes keep their place and their
 * average size. Lenses are rigid: neither opens as the body turns.
 */
function lenses(eyes: Body['eyes'], o: FaceOptions): { eyes: Body['eyes']; decals: Decal[] } {
  const mean = (LENS_BIG + LENS_SMALL) / 2, sizes = [LENS_BIG / mean, LENS_SMALL / mean] as const;
  const mm = eyes.w / mean;
  const decals: Decal[] = [];
  if (o.bridge ?? true) decals.push({ id: 'bridge', at: [0, 0], w: 0, h: BAR * eyes.w, shape: 'rounded', paint: 'bridge', eye: 'both', span: true });
  if (o.rims ?? false) {
    for (const eye of ['left', 'right'] as const) {
      const k = (mean + 2 * CAP) / mean;
      decals.push({ id: `rim-${eye}`, at: [0, 0], w: eyes.w * k, h: eyes.h * k, shape: 'circle', paint: 'rim', eye });
    }
  }
  if ((o.bridge ?? true) && (o.camera ?? false)) decals.push({ id: 'camera', at: [0, 0], w: CAMERA * mm, h: CAMERA * mm, shape: 'circle', paint: 'camera', eye: 'both' });
  return { eyes: { ...eyes, sizes: [sizes[0], sizes[1]], open: 0 }, decals };
}

/**
 * His antennas, for a stalk that pivots at `pivot` and shows `shown` of its length above the top of the head
 * (the rest is behind it). Proportions from the robot: the spring from 6% to 30% of what shows, the rod 4 mm
 * across for a head 150 mm wide, here given as `mm` body units to the millimetre.
 */
function stalks(pivot: readonly [number, number, number], hidden: number, shown: number, mm: number): Antennas {
  const len = hidden + shown, coilFrom = hidden + 0.06 * shown, coilTo = hidden + 0.3 * shown;
  return {
    pivot, base: coilTo, whip: len - coilTo,
    radii: [2.6 * mm, 2 * mm, 1.9 * mm], rest: deg(6), follow: 0.08, paint: 'antenna',
    coil: { from: coilFrom / coilTo, to: 1, r: 6 * mm, turns: 4 },
    cap: { len: 9 * mm, r: 2.6 * mm },
  };
}

/**
 * His eyes, from the robot: the lenses' middles 68 mm apart at the middle of the head's height, and their
 * average size (lenses() makes them 41 and 32 mm across).
 */
const EYES: Body['eyes'] = { x: 34 * MM, y: MID_Y, w: ((LENS_BIG + LENS_SMALL) / 2) * MM, h: ((LENS_BIG + LENS_SMALL) / 2) * MM, slideX: 0.04, slideY: 0.03 };

/**
 * A jacrispy body: his head, his face and his antennas. The antennas stand on the back of the head, near its
 * outer corners as on the robot, and show above it about 0.7 times the head's width (a little shorter than on
 * the robot, so the head can be big in the picture).
 */
export function jacrispy(opts: FaceOptions = {}): Body {
  const face = lenses(EYES, opts);
  const top = MID_Y + HH + HR;
  const body: Body = { id: 'jacrispy', pieces: [HEAD], eyes: face.eyes, decals: face.decals, paint: { ...JACRISPY_PAINT } };
  if (opts.antennas ?? true) body.antennas = stalks([0.72, top - 0.34, -0.24], 0.34, 1.0, MM);
  return body;
}

/**
 * His face on another body: round lenses as far apart and as big against that body's face as his are on his
 * head (a little less, since most bodies are rounder than his head and their sides turn away sooner), with
 * the bar, and his antennas behind its top, as far apart as on him and as long as there is room for in the
 * picture. The body is otherwise as it was.
 */
export function jacrispyFace(base: Body, opts: FaceOptions = {}): Body {
  // Half the body's width at the height of its eyes, seen from the front.
  const half = halfWidthAt(base, base.eyes.y) ?? 0.8;
  // As on his head: the lenses' middles at 34 mm either side of a head 75 mm to the side, 36.5 mm across on average.
  const size = Math.min(0.5, (36.5 / 75) * half);
  const eyes: Body['eyes'] = { ...base.eyes, x: Math.min(0.45, (34 / 75) * half), w: size, h: size };
  const face = lenses(eyes, opts);
  const out: Body = { ...base, id: `${base.id}+jacrispy`, eyes: face.eyes, decals: [...(base.decals ?? []), ...face.decals], paint: { ...JACRISPY_PAINT, ...base.paint } };
  if (opts.antennas ?? true) {
    const x = Math.min(1.6 * eyes.x, 0.62), top = topAt(base, x);
    if (top !== null) {
      // A millimetre as on him: his eyes 65 mm apart, centre to centre.
      const mm = (2 * eyes.x) / 65, hidden = 0.36;
      out.antennas = stalks([x, top - hidden, -0.2], hidden, Math.max(0.3, Math.min(0.62, 1.44 - top)), mm);
    } else delete out.antennas;
  }
  return out;
}

/** Half a body's width at height y, seen from the front: searched in from the side. */
function halfWidthAt(b: Body, y: number): number | null {
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  for (let x = 1.6; x > 0; x -= 0.01) {
    if (surfaceAt(b, x, y, hit)) {
      let lo = x, hi = x + 0.01;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (surfaceAt(b, mid, y, hit)) lo = mid; else hi = mid; }
      return lo;
    }
  }
  return null;
}

/** The top of a body's outline from the front at x (or null if it has none there): searched down from above. */
function topAt(b: Body, x: number): number | null {
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  for (let v = 1.6; v > -1.6; v -= 0.01) {
    if (surfaceAt(b, x, v, hit)) {
      // And back up in small steps, to the edge.
      let lo = v, hi = v + 0.01;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (surfaceAt(b, x, mid, hit)) lo = mid; else hi = mid; }
      return lo;
    }
  }
  return null;
}

/** The moods jacrispy's friend app (PSC) sends. */
export type JacrispyMood = 'happy' | 'curious' | 'laughing' | 'loving' | 'thoughtful' | 'surprised' | 'sad' | 'calm';

/**
 * What each mood looks like: a face, where the antennas are held (degrees outward, the viewer's left and
 * right), how long they take to get there (ms; a spring's swing when not given), and the move it plays as it
 * comes on: the recording in Pollen Robotics' Reachy Mini emotions library (Apache 2.0) that the mood is, as
 * measured below. The held antennas are where each recording leaves them. (Sad hangs them as far down as they
 * can still be seen beside the head; on the robot they go further, behind it.)
 */
export const JACRISPY_MOODS: Readonly<Record<JacrispyMood, { face: string; antennas: readonly [number, number]; ms?: number; cue: string; recording: string }>> = {
  happy: { face: 'happy', antennas: [30, 12], cue: 'cheer', recording: 'cheerful1' },
  curious: { face: 'curious', antennas: [13, -5], cue: 'glance', recording: 'curious1' },
  laughing: { face: 'laughing', antennas: [18, 15], cue: 'laugh', recording: 'laughing1' },
  loving: { face: 'happy', antennas: [2, 2], cue: 'bashful', recording: 'loving1' },
  thoughtful: { face: 'inspecting', antennas: [15, 10], cue: 'ponder', recording: 'thoughtful1' },
  surprised: { face: 'surprised', antennas: [21, -3], cue: 'startle', recording: 'surprised1' },
  sad: { face: 'sad', antennas: [115, 128], ms: 2200, cue: 'slump', recording: 'sad1' },
  calm: { face: 'calm', antennas: [-1, -3], cue: 'breathe', recording: 'serenity1' },
};
export const JACRISPY_MOOD_NAMES = Object.keys(JACRISPY_MOODS) as JacrispyMood[];

/** Antenna poses to try, in degrees outward, the viewer's left and right. */
export const ANTENNA_POSES: Readonly<Record<string, readonly [number, number]>> = {
  rest: [0, 0], up: [-8, -8], wide: [30, 30], out: [80, 80], droop: [115, 128], left: [32, -20], right: [-20, 32], cross: [-18, -18],
};

const both = (o: Channels, l: number, r: number): void => { o.antL += l; o.antR += r; };
/** dir -1 plays a move the other way round: the turn and the lean mirrored, the antennas swapped. */
const sides = (o: Channels, dir: number, l: number, r: number): void => { if (dir < 0) both(o, r, l); else both(o, l, r); };
/**
 * His moves, for RigOptions.clips. The mood moves are the recordings in Pollen Robotics' Reachy Mini emotions
 * library, measured every quarter or half second (head turn, nod and lean, antennas, and height) and drawn as
 * curves, each ending where it began so it plays over any held pose; the comments give what was measured.
 * The others are short antenna moves to play any time.
 */
export const JACRISPY_CLIPS: Readonly<Record<string, Clip>> = {
  /**
   * cheerful1, 2.8 s: antennas held (30 and 12 degrees out); the head leans 6 degrees one way in the first
   * half second, comes back, and drifts 7 degrees the other way.
   */
  cheer: {
    lane: 'cue', ms: 2800,
    apply(o, p) {
      o.roll += p.cue.dir * p.cue.amount * deg(7) * track([0, 0, 0.18, 0.9, 0.36, 0, 0.55, -0.5, 0.72, -0.7, 0.9, -1, 1, 0], p.u);
      o.lift += p.cue.amount * 0.03 * Math.max(0, Math.sin(p.u * 4 * Math.PI)) * Math.sin(Math.PI * p.u);
    },
  },
  /**
   * curious1, the first 5.4 s: it looks 40 degrees to one side as the antenna on the other side swings out to
   * 77 degrees, comes back, then looks 41 degrees the other way with the other antenna out to 85. It leans
   * away from the side it looks to, about a quarter of the turn.
   */
  glance: {
    lane: 'cue', ms: 5400,
    apply(o, p, v) {
      const a = p.cue.amount, d = p.cue.dir, u = p.u;
      const turn = a * deg(40) * track([0, 0, 0.09, 0.27, 0.185, 0.52, 0.28, 0.95, 0.37, 1, 0.46, 0.97, 0.556, 0.48, 0.65, 0.07, 0.74, -0.46, 0.83, -1, 0.92, -0.9, 1, 0], u);
      o.yaw += d * turn * v.room;
      o.roll -= d * 0.25 * turn;
      o.eyeX += d * 0.5 * v.room * (turn / deg(40));
      sides(o, d, a * deg(64) * track([0, 0, 0.14, 0, 0.185, 0.39, 0.28, 1, 0.37, 1, 0.46, 0.55, 0.556, 0, 1, 0], u),
        a * deg(90) * track([0, 0, 0.65, 0, 0.74, 0.79, 0.83, 1, 0.9, 0.8, 0.97, 0, 1, 0], u));
    },
  },
  /**
   * laughing1, 4.6 s: the head goes back 22 degrees and holds there two seconds, leaning about 7 degrees and
   * rocking 3 either side of that about 1.3 times a second, bobbing up to 10 mm about twice a second. The
   * antennas open 2 degrees, then dip 9 together and come back.
   */
  laugh: {
    lane: 'cue', ms: 4600,
    apply(o, p) {
      const a = p.cue.amount, u = p.u, t = u * 4.6;
      const held = track([0, 0, 0.16, 0, 0.22, 0.1, 0.27, 1, 0.75, 1, 0.81, 0.8, 0.86, 0.5, 0.92, 0.18, 1, 0], u);
      o.pitch += a * deg(22) * held;
      o.roll += p.cue.dir * a * held * (deg(-7) + deg(3) * Math.sin(t * 2 * Math.PI * 1.3));
      o.lift += a * 10 * MM * held * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI * 2));
      const k = a * deg(9) * track([0, 0, 0.2, 0, 0.27, 0.25, 0.38, 0.25, 0.48, -0.1, 0.6, -1, 0.66, -1, 0.72, -0.8, 0.76, 0, 1, 0], u);
      both(o, k, k);
    },
  },
  /**
   * loving1, 5.6 s: the head goes down 13 degrees more and turns 12 away, and stays; the antennas flutter out
   * 3 degrees either way, about once a second.
   */
  bashful: {
    lane: 'cue', ms: 5600,
    apply(o, p, v) {
      const a = p.cue.amount, u = p.u, t = u * 5.6;
      o.pitch -= a * deg(13) * track([0, 0, 0.1, 0, 0.18, 0.6, 0.27, 1, 0.85, 1, 1, 0], u);
      const env = track([0, 0, 0.1, 1, 0.85, 1, 1, 0], u);
      o.yaw -= p.cue.dir * a * deg(12) * env * v.room;
      o.eyeY -= 0.3 * env;
      const k = a * deg(3) * Math.sin(t * 2 * Math.PI) * env;
      both(o, k, k);
    },
  },
  /**
   * thoughtful1, 5.9 s: the head goes up 20 degrees and leans 10, slowly (by 2.5 s), holds two seconds,
   * and comes back. Antennas held (15 and 10 out).
   */
  ponder: {
    lane: 'cue', ms: 5900,
    apply(o, p) {
      const a = p.cue.amount, u = p.u;
      const k = track([0, 0, 0.1, 0.05, 0.17, 0.13, 0.25, 0.56, 0.34, 0.77, 0.42, 1, 0.78, 1, 0.85, 0.66, 0.93, 0.25, 1, 0], u);
      o.pitch += a * deg(20) * k;
      o.roll -= p.cue.dir * a * deg(10) * k;
      o.eyeY += 0.5 * k;
    },
  },
  /**
   * surprised1, 2.5 s: still for a second, then the antennas fling out, 98 and 102 degrees, in a quarter
   * second, hold a quarter, and are back by 2 s; the head turns 6 degrees and sinks 5 mm as they do, and
   * comes up 4 mm above where it was as they come back.
   */
  startle: {
    lane: 'cue', ms: 2480,
    apply(o, p, v) {
      const a = p.cue.amount, u = p.u;
      const k = track([0, 0, 0.31, 0, 0.4, 0.36, 0.5, 1, 0.6, 1, 0.7, 0.47, 0.81, 0, 1, 0], u);
      sides(o, p.cue.dir, a * deg(98) * k, a * deg(102) * k);
      o.yaw -= p.cue.dir * a * deg(6) * track([0, 0, 0.45, 0, 0.5, 1, 0.7, 1, 0.81, 0.1, 1, 0], u) * v.room;
      o.lift += a * MM * track([0, 0, 0.45, 0, 0.6, -5, 0.7, -5, 0.81, 2, 0.9, 4, 1, 0], u);
    },
  },
  /**
   * sad1, 9 s: the head goes down 13 degrees and leans 3 more, rising 7 mm and then sinking 11 (the antennas
   * fall over the same time: the mood holds them down, in JACRISPY_MOODS); it stays low, then comes back.
   */
  slump: {
    lane: 'cue', ms: 9000,
    apply(o, p) {
      const a = p.cue.amount, u = p.u;
      const k = track([0, 0, 0.11, 0, 0.17, 0.45, 0.22, 0.75, 0.28, 0.55, 0.33, 0.92, 0.39, 0.85, 0.45, 1, 0.88, 1, 1, 0], u);
      o.pitch -= a * deg(13) * k;
      o.roll += p.cue.dir * a * deg(3) * k;
      o.eyeY -= 0.35 * k;
      o.lift += a * MM * track([0, 0, 0.06, 7, 0.11, 8, 0.17, 1, 0.22, -4, 0.33, -8, 0.45, -11, 0.88, -11, 1, 0], u);
      o.stretch *= 1 - a * 0.03 * k;
    },
  },
  /**
   * serenity1, 4.6 s: the head is still; the antennas rise together, to 88 and 76 degrees out, over two
   * seconds (a breath in), and come back down in one.
   */
  breathe: {
    lane: 'cue', ms: 4580,
    apply(o, p) {
      const a = p.cue.amount, k = track([0, 0, 0.11, 0, 0.22, 0.3, 0.33, 0.6, 0.44, 0.95, 0.55, 1, 0.66, 0.5, 0.76, 0, 1, 0], p.u);
      sides(o, p.cue.dir, a * deg(88) * k, a * deg(76) * k);
      o.stretch *= 1 + a * 0.02 * k;
    },
  },
  /** Both antennas flick up and settle: "oh!". */
  perk: {
    lane: 'cue', ms: 520,
    apply(o, p) {
      const k = p.cue.amount * deg(-18) * track([0, 0, 0.18, 1, 0.42, -0.25, 0.66, 0.1, 1, 0], p.u);
      both(o, k, k); o.lift += p.cue.amount * 0.04 * track([0, 0, 0.18, 1, 0.5, 0, 1, 0], p.u);
    },
  },
  /** The antennas sway against each other, as his idle does (15 degrees, half a second each way). */
  wiggle: {
    lane: 'cue', ms: 2000,
    apply(o, p) {
      const k = p.cue.amount * deg(15) * Math.sin(p.u * 2 * 2 * Math.PI) * Math.sin(Math.PI * p.u);
      both(o, k, -k);
    },
  },
  /** One antenna twitches (the side `dir` says, +1 the viewer's right). */
  twitch: {
    lane: 'cue', ms: 360,
    apply(o, p) {
      const k = p.cue.amount * deg(20) * track([0, 0, 0.15, 1, 0.35, -0.4, 0.6, 0.15, 1, 0], p.u);
      if (p.cue.dir > 0) o.antR += k; else o.antL += k;
    },
  },
};
