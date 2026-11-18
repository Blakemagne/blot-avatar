// Jacrispy: a Reachy Mini shaped body, as a chibi. A wide rounded head with two round lenses for eyes (a big
// one on the viewer's left, a smaller one on the right, as the robot's own are), two thin antennas on top that
// swing, and a round body that tapers up to the head from a broad foot. Stickers go in named slots.
//
// The proportions are measured from the Reachy Mini's published model (Pollen Robotics) and then squeezed:
// the head is the same shape but bigger against the body, and the antennas are shorter, so it reads at
// avatar size. No geometry from that model is used here; only its proportions. See THIRD_PARTY_NOTICES.

import type { Body, Decal, DecalShape, Piece, Sphere } from '../body';
import type { Channels, Clip } from '../clips';
import { track } from '../ease';
import { deg } from '../math';

/** A rounded box: eight spheres of radius r, their centres at +-x, the two heights given, and +-z. */
function box(x: number, y0: number, y1: number, z: number, r: number): Piece {
  const out: Sphere[] = [];
  for (const sx of [-1, 1]) for (const y of [y0, y1]) for (const sz of [-1, 1]) out.push([sx * x, y, sz * z, r]);
  return out;
}

/**
 * A round band seen from above: `n` spheres of radius t whose hull is a circle of radius `out` at height y.
 * Set half a step off the axes, so it is its own mirror image front to back and left to right.
 */
const band = (y: number, out: number, t: number, n = 12): Sphere[] =>
  Array.from({ length: n }, (_, i): Sphere => {
    const a = ((i + 0.5) * 2 * Math.PI) / n;
    return [(out - t) * Math.cos(a), y, (out - t) * Math.sin(a), t];
  });

/**
 * The head: 1.62 wide, 1.04 tall and as deep, its middle 0.38 above the body's (a chibi: on the robot the head
 * is as wide as the body and half as tall as the whole). Two spheres on its middle line stand a little proud
 * of the face, front and back, so the face is a low roof with a flank for each eye: turned, the near eye opens
 * up and the far one thins, as on every blot body. (Flat, the far eye stayed as big as the near one.)
 */
const HEAD_Y = 0.38, HW = 0.53, HH = 0.24, HZ = 0.24, HR = 0.28, RIDGE = 0.13;
const HEAD: Piece = [
  ...box(HW, HEAD_Y - HH, HEAD_Y + HH, HZ, HR),
  ...[-1, 1].flatMap((sz) => [-1, 1].map((sy): Sphere => [0, HEAD_Y + sy * HH, sz * (HZ + RIDGE), HR])),
];
/** The body: a broad foot, a short round middle, and a dome that narrows up into the head. */
const T = 0.1;
const FOOT: Piece = [...band(-0.8, 0.48, T), ...band(-0.7, 0.48, T)];
const MIDDLE: Piece = [...band(-0.72, 0.6, T), ...band(-0.5, 0.6, T)];
const DOME: Piece = [...band(-0.51, 0.6, T), ...band(-0.02, 0.42, T)];

/** Where a sticker can go: its middle in face coordinates, and the most room it has there. */
export const STICKER_SLOTS = {
  chest: { at: [0, -0.28], w: 0.24, h: 0.24 },
  belly: { at: [0, -0.6], w: 0.24, h: 0.16 },
  hipLeft: { at: [-0.36, -0.58], w: 0.16, h: 0.16 },
  hipRight: { at: [0.36, -0.58], w: 0.16, h: 0.16 },
  foreheadLeft: { at: [-0.5, 0.74], w: 0.12, h: 0.12 },
  foreheadRight: { at: [0.5, 0.74], w: 0.12, h: 0.12 },
} as const;
export type StickerSlot = keyof typeof STICKER_SLOTS;

/** A sticker to put on: which slot, what shape, what colour, and how big as a share of the slot's room. */
export interface Sticker {
  slot: StickerSlot;
  shape: DecalShape;
  colour: string;
  /** 0 to 1 of the slot's room (1 when not given). */
  size?: number;
  /** Radians, counter-clockwise. */
  turn?: number;
}

/** The stickers it wears until told otherwise: placeholders, for the real ones to replace. */
export const EXAMPLE_STICKERS: readonly Sticker[] = [
  { slot: 'chest', shape: 'star', colour: '#F2B33D', turn: deg(-8) },
  { slot: 'hipRight', shape: 'heart', colour: '#E2566B', turn: deg(12) },
];

/** Its own colours: the antennas, the rims round the lenses. A renderer may paint any of these over. */
export const JACRISPY_PAINT = { antenna: '#2A2D31', rim: '#3B4148' } as const;
/** The colour to draw its body in (the eyes come out dark on it). */
export const JACRISPY_COLOUR = '#F4F2EC';

export interface JacrispyOptions {
  /** The stickers it wears (EXAMPLE_STICKERS when not given; [] for none). */
  stickers?: readonly Sticker[];
  /** Draw a grey rim round each lens (default on). */
  rims?: boolean;
}

/**
 * The eyes: two round lenses on the face, the viewer's left one bigger, as on the robot (there the small one is
 * three quarters of the big one; here it is closer, so it can still be read at 16 px).
 */
const EYES = { x: 0.38, y: HEAD_Y, w: 0.46, h: 0.46, slideX: 0.06, slideY: 0.05, sizes: [1.04, 0.96] } as const;

/** A jacrispy body with these stickers and rims. */
export function jacrispy(opts: JacrispyOptions = {}): Body {
  const paint: Record<string, string> = { ...JACRISPY_PAINT };
  const decals: Decal[] = [];
  if (opts.rims ?? true) {
    for (const eye of ['left', 'right'] as const) decals.push({ id: `rim-${eye}`, at: [0, 0], w: EYES.w * 1.2, h: EYES.h * 1.2, shape: 'circle', paint: 'rim', eye });
  }
  for (const s of opts.stickers ?? EXAMPLE_STICKERS) {
    const slot = STICKER_SLOTS[s.slot], k = Math.max(0, Math.min(1, s.size ?? 1)), key = `sticker-${s.slot}`;
    if (!slot || k <= 0) continue;
    paint[key] = s.colour;
    decals.push({ id: key, at: slot.at, w: slot.w * k, h: slot.h * k, shape: s.shape, turn: s.turn, paint: key });
  }
  return {
    id: 'jacrispy',
    pieces: [HEAD, DOME, MIDDLE, FOOT],
    eyes: { ...EYES, sizes: [EYES.sizes[0], EYES.sizes[1]] },
    antennas: { pivot: [0.5, HEAD_Y + HH + 0.2, 0], base: 0.24, whip: 0.34, radii: [0.07, 0.045, 0.028], rest: deg(10), follow: 0.35, paint: 'antenna' },
    decals,
    paint,
  };
}

/** The moods jacrispy's friend app (PSC) sends. */
export type JacrispyMood = 'happy' | 'curious' | 'laughing' | 'loving' | 'thoughtful' | 'surprised' | 'sad' | 'calm';

/**
 * What each mood looks like: a face, where the antennas are held (degrees outward, the viewer's left and
 * right), and a move to play as it comes on (one of the rig's cues or JACRISPY_CLIPS), if any.
 */
export const JACRISPY_MOODS: Readonly<Record<JacrispyMood, { face: string; antennas: readonly [number, number]; cue?: string }>> = {
  happy: { face: 'happy', antennas: [14, 14], cue: 'wiggle' },
  curious: { face: 'curious', antennas: [-6, 22], cue: 'tilt' },
  laughing: { face: 'laughing', antennas: [20, 20], cue: 'boing' },
  loving: { face: 'happy', antennas: [-14, -14], cue: 'perk' },
  thoughtful: { face: 'inspecting', antennas: [24, -4] },
  surprised: { face: 'surprised', antennas: [-10, -10], cue: 'perk' },
  sad: { face: 'sad', antennas: [34, 34] },
  calm: { face: 'calm', antennas: [6, 6] },
};
export const JACRISPY_MOOD_NAMES = Object.keys(JACRISPY_MOODS) as JacrispyMood[];

/** Antenna poses to try, in degrees outward, the viewer's left and right. */
export const ANTENNA_POSES: Readonly<Record<string, readonly [number, number]>> = {
  rest: [0, 0], up: [-10, -10], wide: [30, 30], droop: [55, 55], left: [32, -24], right: [-24, 32], cross: [-22, -22],
};

const both = (o: Channels, l: number, r: number): void => { o.antL += l; o.antR += r; };

/**
 * Antenna moves, for RigOptions.clips. Each ends where it began, so it plays over whatever pose the
 * antennas are held in.
 */
export const JACRISPY_CLIPS: Readonly<Record<string, Clip>> = {
  /** Both antennas flick up and settle: "oh!". */
  perk: {
    lane: 'cue', ms: 520,
    apply(o, p) {
      const k = p.cue.amount * deg(-18) * track([0, 0, 0.18, 1, 0.42, -0.25, 0.66, 0.1, 1, 0], p.u);
      both(o, k, k); o.lift += p.cue.amount * 0.04 * track([0, 0, 0.18, 1, 0.5, 0, 1, 0], p.u);
    },
  },
  /** The antennas wave against each other, three times: happy. */
  wiggle: {
    lane: 'cue', ms: 900,
    apply(o, p) {
      const k = p.cue.amount * deg(16) * Math.sin(p.u * 6 * Math.PI) * Math.sin(Math.PI * p.u);
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
  /** A hop with the antennas thrown out and springing back: a laugh. */
  boing: {
    lane: 'cue', ms: 760,
    apply(o, p) {
      const a = p.cue.amount, u = p.u;
      const k = a * deg(26) * track([0, 0, 0.12, -0.4, 0.3, 1, 0.48, -0.5, 0.64, 0.35, 0.8, -0.15, 1, 0], u);
      both(o, k, k);
      if (u > 0.1 && u < 0.5) { const q = (u - 0.1) / 0.4; o.lift += a * 0.18 * 4 * q * (1 - q); }
      o.stretch *= 1 + a * track([0, 0, 0.1, -0.07, 0.25, 0.06, 0.5, -0.05, 0.62, 0, 1, 0], u);
    },
  },
};
