// Faces. A face is numbers, not art: it says how an eye's outline is shaped, and the engine does the rest.
// Because a face is only numbers, one face eases into another by blending them, and every face survives the
// turn: the outline it describes is still lifted onto the body's surface point by point.

export interface Face {
  /** Eye width and height, as multiples of the body's own eye size. */
  width: number;
  height: number;
  /** 0 = square corners, 1 = fully round ends. */
  round: number;
  /** Radians; positive lifts the outer end of each eye. */
  tilt: number;
  /** Vertical offset, as a multiple of the eye's height. */
  lift: number;
  /** Bend: positive curves the eye into an arch (a smile for the eyes), negative into a bowl. */
  arc: number;
  /** Left / right difference in size: positive makes the viewer's right eye bigger. */
  uneven: number;
  /** Extra tilt for the viewer's right eye only. */
  skew: number;
  /** An upper lid: how much of the top of the eye it covers, 0..1. */
  brow: number;
  /** The lid's slope: positive drops its inner end (a frown), negative its outer end (worry). */
  slant: number;
  /** How far the viewer's left eye is narrowed, 0..1: 1 is a slit. The right eye stays open. */
  wink: number;
}

const face = (f: Partial<Face>): Face => ({ width: 1, height: 1, round: 1, tilt: 0, lift: 0, arc: 0, uneven: 0, skew: 0, brow: 0, slant: 0, wink: 0, ...f });

export const FACES = {
  neutral: face({}),
  /** Awake and listening: plainly taller, a little wider, and up a little. */
  attentive: face({ width: 1.12, height: 1.3, lift: 0.06 }),
  /** Wide open and round. */
  surprised: face({ width: 1.55, height: 0.98, lift: 0.12 }),
  /** Big and held high, pushed up into domes from below. */
  excited: face({ width: 1.6, height: 1.16, arc: 0.5, lift: 0.2 }),
  /** Arches. */
  happy: face({ width: 1.5, height: 0.38, arc: 0.95 }),
  /** Squeezed shut: each arch turned on its side to point at the nose, "> <". */
  laughing: face({ width: 1.3, height: 0.36, arc: 1.15, tilt: 1.4, lift: 0.04 }),
  /** Lids down at the inner ends. */
  angry: face({ width: 1.3, height: 0.86, brow: 0.5, slant: 0.75, lift: -0.06 }),
  /** Lids down at the outer ends, eyes low. */
  sad: face({ width: 1.2, height: 0.84, brow: 0.46, slant: -0.7, lift: -0.16 }),
  /** Wide open and high, the tops leaning in together: worry. */
  scared: face({ width: 1.02, height: 1.12, tilt: 0.3, lift: 0.3 }),
  /** Narrowed, one more than the other. */
  suspicious: face({ width: 1.3, height: 0.3, uneven: 0.2, tilt: 0.1, round: 0.7 }),
  /** Both eyes leaning the same way, one bigger: a head cocked at a puzzle. */
  confused: face({ width: 1, height: 0.82, tilt: -0.42, skew: 0.84, uneven: -0.18, lift: 0.04 }),
  /** One eye opened wider, both up a little. */
  curious: face({ width: 1.08, height: 1.08, uneven: 0.2, lift: 0.1 }),
  /** Half closed from above, held high, the outer ends lifted. */
  proud: face({ width: 1.15, height: 0.88, brow: 0.46, tilt: 0.24, lift: 0.36 }),
  /** Small and low, turned down. */
  shy: face({ width: 0.84, height: 0.5, brow: 0.2, slant: -0.3, lift: -0.34 }),
  /** Heavy lids over wide, low eyes that droop at the outer ends. */
  bored: face({ width: 1.36, height: 0.92, brow: 0.55, tilt: -0.14, lift: -0.26, round: 0.75 }),
  /** Flat low lines. */
  sleepy: face({ width: 1.5, height: 0.15, lift: -0.42 }),
  /** Uneven sizes: one eye narrowed to a slit, the other wide open. */
  inspecting: face({ width: 1.15, height: 0.92, uneven: 0.26, wink: 0.8 }),
  /** Narrowed. */
  squinted: face({ width: 1.14, height: 0.34 }),
  /** Closed and content: bowls. */
  calm: face({ width: 1.4, height: 0.28, arc: -0.8, lift: -0.08 }),
  /** Wide ovals. */
  oval: face({ width: 1.55, height: 0.66 }),
} satisfies Record<string, Face>;

export type FaceName = keyof typeof FACES;
export const FACE_NAMES = Object.keys(FACES) as FaceName[];

/** Names that are another face under a second name. (None today: every name has its own face.) */
export const FACE_ALIASES: Partial<Record<FaceName, FaceName>> = {};

/** The face for a name; a name the engine does not know is the neutral face. */
export function faceFor(name: string): Face {
  return Object.hasOwn(FACES, name) ? FACES[name as FaceName] : FACES.neutral;
}

/** What the avatar wears while its Bot is doing something. Idle has none: it wears the face it was given. */
export const ACTIVITY_FACES = {
  /** Thoughtful: a little smaller, one eye more open than the other. */
  thinking: face({ width: 1, height: 0.9, uneven: 0.16, lift: 0.08 }),
  /** Focused: lids lowered and level, with the least frown of concentration. */
  working: face({ width: 1.1, height: 0.84, brow: 0.32, slant: 0.1 }),
  /** Expectant: big round eyes turned up at whoever it is waiting for. */
  waiting: face({ width: 1.34, height: 0.96, lift: 0.22 }),
  /** Bright. (The eyes also open with each syllable: see the rig.) */
  speaking: face({ width: 1.14, height: 1, lift: 0.08 }),
} satisfies Record<string, Face>;

/** Every number of a face, in the order the rig compares them. */
export const FACE_KEYS: readonly (keyof Face)[] = ['width', 'height', 'round', 'tilt', 'lift', 'arc', 'uneven', 'skew', 'brow', 'slant', 'wink'];

/** Blend two faces into `out`: k of the way from a to b. */
export function mixFace(a: Face, b: Face, k: number, out: Face): Face {
  for (const key of FACE_KEYS) out[key] = k >= 1 ? b[key] : a[key] + (b[key] - a[key]) * k;
  return out;
}

export const sameFace = (a: Face, b: Face): boolean => FACE_KEYS.every((key) => a[key] === b[key]);

/** How tall the eyes are at the middle of a blink, as a fraction of their height. */
export const BLINK_HEIGHT = 0.3;
/** A full wink takes this much off the eye's height. */
const WINK = 0.82;

/**
 * One eye's outline: `n` points, evenly spaced along a rounded bar of the body's eye size `w` by `h`, as
 * flat [du0, dv0, du1, dv1, ...] offsets from the eye's centre in face coordinates. `side` is -1 for the
 * viewer's left eye and 1 for the right; `lid` scales the height (a blink). `floor` is the least height an
 * eye is drawn with (a flat line on a tiny avatar must not thin out to nothing).
 */
export function eyeOutline(face: Face, side: -1 | 1, w: number, h: number, lid: number, n: number, out: Float64Array = new Float64Array(n * 2), floor = 0): Float64Array {
  const grow = 1 + side * face.uneven;
  const open = side < 0 ? 1 - WINK * face.wink : 1;
  const a = (w * face.width * grow) / 2, b = Math.max((h * face.height * grow * lid * open) / 2, floor / 2);
  const rho = Math.max(1e-6, face.round * Math.min(a, b));
  const sx = a - rho, sy = b - rho, quarter = (Math.PI / 2) * rho;
  // Walk the outline counter-clockwise from the middle of the right side: up, round the corner, along the top.
  const legs = [sy, quarter, 2 * sx, quarter, 2 * sy, quarter, 2 * sx, quarter, sy];
  const total = 4 * quarter + 4 * sx + 4 * sy;
  const turn = side * face.tilt + (side > 0 ? face.skew : 0), ct = Math.cos(turn), st = Math.sin(turn);
  const dv = face.lift * h;
  // The upper lid: a straight edge across the eye. It covers `brow` of the height at the eye's middle and
  // slopes down toward the nose (slant > 0) or away from it. It never comes lower than a slit's worth.
  const lidded = face.brow > 0, cut = b * (1 - 2 * face.brow), slope = side * face.slant, least = -b + Math.min(2 * b, Math.max(0.36 * b, floor));
  let leg = 0, start = 0;
  for (let i = 0; i < n; i++) {
    const at = (i / n) * total;
    while (leg < 8 && at > start + legs[leg]) { start += legs[leg]; leg++; }
    const t = at - start;
    let x: number, y: number;
    switch (leg) {
      case 0: x = a; y = t; break;
      case 1: x = sx + rho * Math.cos(t / rho); y = sy + rho * Math.sin(t / rho); break;
      case 2: x = sx - t; y = b; break;
      case 3: x = -sx - rho * Math.sin(t / rho); y = sy + rho * Math.cos(t / rho); break;
      case 4: x = -a; y = sy - t; break;
      case 5: x = -sx - rho * Math.cos(t / rho); y = -sy - rho * Math.sin(t / rho); break;
      case 6: x = -sx + t; y = -b; break;
      case 7: x = sx + rho * Math.sin(t / rho); y = -sy - rho * Math.cos(t / rho); break;
      default: x = a; y = -sy + t; break;
    }
    if (lidded) { const top = Math.max(cut + slope * x, least); if (y > top) y = top; }
    // The bend is measured against the eye's width, so a thin eye can still curve into a clear arch.
    if (face.arc !== 0) y += face.arc * a * (0.4 - (x / a) * (x / a));
    out[i * 2] = x * ct - y * st;
    out[i * 2 + 1] = x * st + y * ct + dv;
  }
  return out;
}
