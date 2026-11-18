// One frame: (body, colour, rig state, drawn size) in, everything a renderer needs out.

import type { Body, Decal } from './body';
import { antennaPieces, decalOutline } from './decals';
import { smooth } from './ease';
import { barWidth, eyePolys, facePoint } from './eyes';
import { eyeOutline } from './faces';
import { discAt, figureParts, figureRadius } from './figures';
import { area, bounds, rotation, type Mat3 } from './math';
import { isMix, leaf, mix, polar, profile, radial, rays, round, type Source } from './morph';
import type { RigState } from './rig';
import { silhouette, toPath } from './silhouette';

/** The drawing box: 55.2 units across with the body's unit box in its middle 36, as the flat avatars had. */
export const VIEW = 55.2;
export const VIEW_BOX = `0 0 ${VIEW} ${VIEW}`;
const MID = VIEW / 2, UNIT = 18;

export interface Drawing {
  viewBox: string;
  /** The body's outline: fill it with `fill` (nonzero rule). */
  body: string;
  /** The viewer's left eye and right eye; an empty string when that eye cannot be seen. Fill with `eyeFill`. */
  eyes: [string, string];
  fill: string;
  eyeFill: string;
  /**
   * Everything else the body carries (its antennas, its decals), each a path of its own in a colour of its own.
   * Paint them in order: the ones with `front` false under the body, then the body, then the ones with `front`
   * true, then the eyes. Only a body with antennas or decals has any.
   */
  layers?: Layer[];
}

/** One more path of a drawing: an antenna, a decal. */
export interface Layer {
  /** The antenna's or the decal's name, the same from frame to frame. */
  id: string;
  /** Its colour key (see Body.paint); a renderer may paint the key over. */
  part: string;
  d: string;
  /** The body's colour for it. */
  fill: string;
  /** Over the body (true), or under it, behind (false). */
  front: boolean;
}

/** How finely to draw at a size: points per sphere rim, points per eye, and how much bigger the eyes are drawn. */
export function detail(size: number): { rim: number; eye: number; boost: number } {
  if (size >= 96) return { rim: 72, eye: 76, boost: 1 };
  if (size >= 40) return { rim: 44, eye: 40, boost: 1 };
  // Tiny avatars get slightly bigger eyes, set that much further apart, or they close up into one speck.
  return { rim: 28, eye: 40, boost: size >= 28 ? 1.12 : 1.3 };
}

/**
 * Body and eye colours. For a hex colour ('#rrggbb') the eyes are white, except on a body too pale for white
 * to show, where they are dark. Any other CSS colour is the fill as it is, with white eyes.
 */
export function colours(colour: string): { fill: string; eyeFill: string } {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return { fill: colour, eyeFill: '#FFFFFF' };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { fill: colour, eyeFill: light > 0.72 ? '#1C1C1C' : '#FFFFFF' };
}

/** Body left showing between an eye and the body's outline, in body units (under 3 px on a 180 px avatar). */
export const EYE_RIM = 0.03;
/**
 * An eye, or a piece of one, drawn narrower than this many px is not drawn: a slit, then nothing. On a tiny
 * avatar, where that would be most of the eye, it is three tenths of the eye's own narrow side instead.
 */
export const THIN_PX = 1.5;
/** A face's flattest eye (a sleepy line) is drawn at least this many px tall. */
export const LINE_PX = 1.2;
/** An eye shrunk to a dot is a disc this many eye-widths across. */
export const DOT = 0.62;

/**
 * The near eye opens as the body turns. A turn alone narrows both eyes: the near one is on a face that is
 * leaning away too, and no perspective this mild makes up for that. So the eye on the near side is itself made
 * wider (and a touch taller) the further the body is round, and it grows on its outer side only, the one
 * coming toward the viewer. It is still a patch of the surface: it leans, bends and is cut like any eye. At a
 * full look it is drawn bigger than it is from the front, while the far one squeezes into a slit.
 */
export const NEAR_WIDE = 0.6, NEAR_TALL = 0.1;
const SIN_LOOK = Math.sin((48 * Math.PI) / 180);

const R: Mat3 = new Float64Array(9);
const outlines = [new Float64Array(160), new Float64Array(160)];
const spot = new Float64Array(12);

/** The two eyes on a body whose outline for this pose is `outline`. */
function eyesOn(body: Body, state: RigState, size: number, outline: ArrayLike<number>[]): [Float64Array[], Float64Array[]] {
  const d = detail(size), e = body.eyes;
  const dot = state.dot ?? 0, grow = state.eyeScale ?? 1;
  if (grow <= 0.02) return [[], []];
  rotation(state.pose, R);
  const cu = state.eye.x * e.slideX, cv = e.y + state.eye.y * e.slideY;
  // How far round the body is, as a share of a full look: 1 turned right, -1 turned left, 0 facing (or backing) us.
  // (Seen from behind, the face is on the back and the same turn shows the other way round. And nearly edge
  // on nothing is opened: the eye there is going round the rim, and a wide one would jump from rim to rim.)
  const facing = Math.min(1, Math.max(0, (Math.abs(R[8]) - 0.1) / 0.3));
  const turned = Math.max(-1, Math.min(1, Math.sin(state.pose.yaw) / SIN_LOOK)) * (R[8] < 0 ? -1 : 1) * facing;
  const shapes = ([-1, 1] as const).map((side, i) => {
    // 1 body unit is half the drawn size. (A face built with eyes of two sizes draws each at its own.)
    const own = e.sizes ? e.sizes[i] : 1;
    const eye = eyeOutline(state.face, side, e.w * d.boost * own, e.h * d.boost * own, state.lid, d.eye, outlines[i], (LINE_PX * 2) / size).subarray(0, d.eye * 2);
    // The near eye opens: wider and a little taller about its own middle (so a face's lift and lean stay as
    // they are), and moved outward by what it gained, so its inner edge stays put and all the growth is on the
    // side coming toward the viewer. However wide the face draws its eyes, it never grows into the far one.
    const near = Math.max(0, -side * turned) ** 2;
    let out = 0;
    if (near > 0) {
      const wide = 1 + NEAR_WIDE * near, tall = 1 + NEAR_TALL * near;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < d.eye; k++) {
        x0 = Math.min(x0, eye[k * 2]); x1 = Math.max(x1, eye[k * 2]);
        y0 = Math.min(y0, eye[k * 2 + 1]); y1 = Math.max(y1, eye[k * 2 + 1]);
      }
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      for (let k = 0; k < d.eye; k++) { eye[k * 2] = mx + (eye[k * 2] - mx) * wide; eye[k * 2 + 1] = my + (eye[k * 2 + 1] - my) * tall; }
      out = side * (wide - 1) * (x1 - x0) / 2;
    }
    if (dot > 0 || grow !== 1) {
      // Toward a dot: every point of the outline heads for its place on a small circle, then the lot shrinks.
      const r = (DOT * e.w * d.boost) / 2;
      for (let k = 0; k < d.eye; k++) {
        const a = (k * 2 * Math.PI) / d.eye;
        eye[k * 2] = (eye[k * 2] + (r * Math.cos(a) - eye[k * 2]) * dot) * grow;
        eye[k * 2 + 1] = (eye[k * 2 + 1] + (r * Math.sin(a) - eye[k * 2 + 1]) * dot) * grow;
      }
    }
    const thin = Math.min((THIN_PX * 2) / size, 0.3 * barWidth(eye));
    return eyePolys(body, R, cu + side * e.x * d.boost + out, cv, eye, { outline, rim: EYE_RIM, thin });
  });
  return [shapes[0], shapes[1]];
}

/**
 * Where the two eyes' centres are drawn on a body (or part way between bodies) for this state: x, y of the
 * left, then of the right, into out[at...]. False when an eye's place is off its body.
 */
function eyeSpots(src: Source, state: RigState, size: number, out: Float64Array, at: number): boolean {
  if (isMix(src)) {
    const one = new Float64Array(4), sum = [0, 0, 0, 0];
    for (const p of src.parts) {
      if (!eyeSpots(p.body, state, size, one, 0)) return false;
      for (let i = 0; i < 4; i++) sum[i] += one[i] * p.share;
    }
    for (let i = 0; i < 4; i++) out[at + i] = sum[i];
    return true;
  }
  const e = src.eyes, boost = detail(size).boost;
  const cu = state.eye.x * e.slideX, cv = e.y + state.eye.y * e.slideY;
  return facePoint(src, R, cu - e.x * boost, cv, out, at) && facePoint(src, R, cu + e.x * boost, cv, out, at + 2);
}

/** The same polygon, wound the other way. */
function backward(p: Float64Array): Float64Array {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 2) { out[i] = p[p.length - 2 - i]; out[i + 1] = p[p.length - 1 - i]; }
  return out;
}

function shift(polys: Float64Array[], dx: number, dy: number): void {
  for (const p of polys) for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dy; }
}

/**
 * Everything on screen for a state, as flat screen polygons (x right, y down, 1 unit = half the drawing box):
 * the body's path (pieces, and any holes wound the other way) and the two eye paths.
 */
function compose(given: Body, state: RigState, size: number): { body: Float64Array[]; eyes: [Float64Array[], Float64Array[]]; layers: Piece[] } {
  const body = state.body ?? given, d = detail(size);
  rotation(state.pose, R);
  const own = silhouette(body, R, d.rim);
  const morph = state.morph, fig = state.figure && state.figure.k > 0 ? state.figure : null;
  let outline: Float64Array[] = own, eyes: [Float64Array[], Float64Array[]];
  let wearer = body, fence: ArrayLike<number>[] = own;

  if (!morph && !fig) eyes = eyesOn(body, state, size, own);
  else {
    // The outline as distances from the middle, blended: from the old shape, and toward a figure's disc.
    const n = rays(size);
    let r = radial(own, n);
    if (morph) {
      r = mix(profile(morph.from, R, d.rim, n), r, morph.k);
      // The eyes stay on the old body for the first half and are on the new one for the second. By then they
      // are dots, and each dot is carried from its place on the one to its place on the other.
      const old = leaf(morph.from);
      if (morph.k < 0.5) { wearer = old; fence = silhouette(old, R, d.rim); }
      eyes = eyesOn(wearer, state, size, fence);
      if (eyeSpots(morph.from, state, size, spot, 0) && eyeSpots(body, state, size, spot, 4) && eyeSpots(wearer, state, size, spot, 8)) {
        const k = morph.k;
        shift(eyes[0], spot[0] + (spot[4] - spot[0]) * k - spot[8], spot[1] + (spot[5] - spot[1]) * k - spot[9]);
        shift(eyes[1], spot[2] + (spot[6] - spot[2]) * k - spot[10], spot[3] + (spot[7] - spot[3]) * k - spot[11]);
      }
    } else eyes = eyesOn(body, state, size, own);
    if (fig) round(r, figureRadius(fig.form), discAt(fig.k));
    // (The figure's parts first: the spinner shapes the disc's own edge.)
    const parts = fig ? figureParts(fig, n, 2 / size, r) : null;
    outline = [polar(r)];
    if (parts) {
      outline.push(...parts.body);
      if (parts.marks.length) {
        // Radar: the eyes stay, as dots on the scope, in one path with its marks and wound against the
        // sweep. So as the sweep passes over a dot, the dot shows through it in the body's colour.
        const way = Math.sign(area(parts.marks[parts.marks.length - 1]));
        const dots = [...eyes[0], ...eyes[1]].map((p) => (Math.sign(area(p)) === way ? backward(p) : p));
        eyes = [[...dots, ...parts.marks], []];
      }
    }
  }

  // The antennas (of the body it is becoming, and of the one it is leaving) and the decals of the body that
  // wears the eyes. None of it on a body that has none, so no other body's frames change.
  const layers: Piece[] = [];
  const grow = fig ? 1 - fig.k : 1, k = morph ? smooth(morph.k) : 1;
  if (body.antennas && k * grow > 0.02) stalks(body, state, d.rim, k * grow, layers);
  const from = morph ? leaf(morph.from) : null;
  if (from && from !== body && from.antennas && (1 - k) * grow > 0.02) stalks(from, state, d.rim, (1 - k) * grow, layers);
  if (wearer.decals) marks(wearer, state, size, fence, layers);

  // Squash and stretch (standing on the base, as wide as it is short), the pop, the hop, the mirror flip.
  const tall = state.stretch ?? 1, big = state.scale ?? 1, up = state.lift ?? 0, flip = state.flip ?? 1;
  if (tall !== 1 || big !== 1 || up !== 0 || flip !== 1) {
    // (The ground is under the body itself: a figure's little ball going round below it does not lift it.)
    const ground = bounds(fig ? [outline[0]] : outline)[3], kx = (big * flip) / tall;
    for (const polys of [outline, eyes[0], eyes[1], ...layers.map((l) => l.polys)]) {
      for (const p of polys) for (let i = 0; i < p.length; i += 2) { p[i] *= kx; p[i + 1] = (ground + (p[i + 1] - ground) * tall) * big - up; }
    }
    // Mirrored, the eye that was on the left is on the right.
    if (flip < 0) eyes = [eyes[1], eyes[0]];
  }
  return { body: outline, eyes, layers };
}

/** A layer before it is a path: screen polygons, and what it is. */
interface Piece { id: string; part: string; fill: string; front: boolean; polys: Float64Array[] }

/** Body colours for a key the body does not paint. */
const UNPAINTED = '#1C1C1C';

/**
 * The antennas of `of`, grown to `grow`, into `out`: each in front of the body when its base is nearer the
 * camera than the middle of the body at that height (turned side on, the near one), behind it otherwise.
 */
function stalks(of: Body, state: RigState, rim: number, grow: number, out: Piece[]): void {
  const a = of.antennas!, swing = state.antennas ?? [0, 0];
  const [left, right] = antennaPieces(a, swing, grow);
  const fill = of.paint?.[a.paint] ?? UNPAINTED;
  [left, right].forEach((pieces, i) => {
    const [p, j] = pieces[0];
    // Depth toward the camera of the base's middle, against the body's own middle at that height.
    const mx = (p[0] + j[0]) / 2, my = (p[1] + j[1]) / 2, mz = (p[2] + j[2]) / 2;
    const front = R[6] * mx + R[7] * my + R[8] * mz - (R[7] * my) > 1e-3;
    out.push({ id: i ? 'antenna-right' : 'antenna-left', part: a.paint, fill, front, polys: silhouette({ pieces }, R, Math.max(16, Math.round(rim / 2))) });
  });
}

/**
 * Where a decal that sits behind an eye is, and how big, for this state: it slides with the eye, opens with
 * the near eye as the body turns (keeping its inner edge, as the eye does), and goes to nothing with a dot. It
 * keeps to its size for a face that draws the eyes wider, growing only as the square root of that, so a rim
 * stays a rim round a wide eye and two of them do not run together.
 */
function behindEye(of: Body, dc: Decal, state: RigState, size: number): { cu: number; cv: number; sx: number; sy: number } {
  const e = of.eyes, boost = detail(size).boost, side = dc.eye === 'left' ? -1 : 1, i = side < 0 ? 0 : 1;
  const own = e.sizes ? e.sizes[i] : 1, f = state.face;
  const k = boost * own * Math.sqrt(Math.max(1, f.width * (1 + side * f.uneven))) * (state.eyeScale ?? 1) * (1 - (state.dot ?? 0));
  const facing = Math.min(1, Math.max(0, (Math.abs(R[8]) - 0.1) / 0.3));
  const turned = Math.max(-1, Math.min(1, Math.sin(state.pose.yaw) / SIN_LOOK)) * (R[8] < 0 ? -1 : 1) * facing;
  const near = Math.max(0, -side * turned) ** 2, wide = 1 + NEAR_WIDE * near, tall = 1 + NEAR_TALL * near;
  const out = (side * (wide - 1) * dc.w * k) / 2;
  return { cu: state.eye.x * e.slideX + side * e.x * boost + out, cv: e.y + state.eye.y * e.slideY, sx: k * wide, sy: k * tall };
}

/** The decals of `of` that can be seen, each a layer over the body, into `out`. */
function marks(of: Body, state: RigState, size: number, fence: ArrayLike<number>[], out: Piece[]): void {
  const d = detail(size), thin = (THIN_PX * 2) / size;
  for (const dc of of.decals!) {
    let cu = dc.at[0], cv = dc.at[1], sx = 1 - (state.dot ?? 0), sy = sx;
    if (dc.eye) ({ cu, cv, sx, sy } = behindEye(of, dc, state, size));
    if (sx <= 0.02) continue;
    const shape = decalOutline(dc.shape, dc.w * sx, dc.h * sy, dc.turn ?? 0, d.eye);
    const polys = eyePolys(of, R, cu, cv, shape, { outline: fence, rim: EYE_RIM, thin });
    if (polys.length) out.push({ id: dc.id, part: dc.paint, fill: of.paint?.[dc.paint] ?? UNPAINTED, front: true, polys });
  }
}

/**
 * Screen polygons of the two eyes (viewer's left, then right) for a rig state: what `drawAvatar` draws.
 * The state's own body, when it has one, is the one drawn.
 */
export function eyeShapes(body: Body, state: RigState, size: number): [Float64Array[], Float64Array[]] {
  return compose(body, state, size).eyes;
}

/** Screen polygons of the body for a rig state: one per piece, or one outline (and any holes) while it changes shape. */
export function bodyShapes(body: Body, state: RigState, size: number): Float64Array[] {
  return compose(body, state, size).body;
}

/** One frame. `body` is drawn unless the state carries its own (a rig that was given one): then that one is. */
export function drawAvatar(body: Body, colour: string, state: RigState, size: number): Drawing {
  const { body: outline, eyes, layers } = compose(body, state, size);
  const out: Drawing = { viewBox: VIEW_BOX, body: toPath(outline, UNIT, MID), eyes: [toPath(eyes[0], UNIT, MID), toPath(eyes[1], UNIT, MID)], ...colours(colour) };
  if (layers.length) {
    // The ones behind first, then the ones in front: the order to paint them in.
    out.layers = [...layers.filter((l) => !l.front), ...layers.filter((l) => l.front)]
      .map((l) => ({ id: l.id, part: l.part, d: toPath(l.polys, UNIT, MID), fill: l.fill, front: l.front }));
  }
  return out;
}

/** Screen polygons of the antennas and decals for a rig state, in the order they are painted. */
export function layerShapes(body: Body, state: RigState, size: number): { id: string; front: boolean; polys: Float64Array[] }[] {
  const { layers } = compose(body, state, size);
  return [...layers.filter((l) => !l.front), ...layers.filter((l) => l.front)].map((l) => ({ id: l.id, front: l.front, polys: l.polys }));
}
