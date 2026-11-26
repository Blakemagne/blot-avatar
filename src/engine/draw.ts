import type { DotFaceMotion } from './dot-features';
// One frame: (body, colour, rig state, drawn size) in, everything a renderer needs out.

import type { Body, Decal } from './body';
import { antennaPieces, decalOutline } from './decals';
import { dotFace, dotExtra } from './dot-parts';
import { smooth } from './ease';
import { barWidth, eyePolys, facePoint } from './eyes';
import { FACES, eyeOutline, type Face } from './faces';
import { REST, discAt, figureBody, figureParts, figureRadius, type FigureShape } from './figures';
import { disc, fxParts, type FxFrame, type FxPart, type FxRole } from './fx';
import { area, bounds, rotation, type Mat3 } from './math';
import { COAT_FADE, COAT_SWAP, coatsAt, isMix, leaf, mix, polar, profile, radial, rays, round, type Source } from './morph';
import type { RigState } from './rig';
import { silhouette, toPath } from './silhouette';

/** The drawing box: 55.2 units across with the body's unit box in its middle 36, as the flat avatars had. */
export const VIEW = 55.2;
export const VIEW_BOX = `0 0 ${VIEW} ${VIEW}`;
/** One body unit in drawing units: a body point (x, y) on screen is drawn at VIEW / 2 + x * VIEW_UNIT, VIEW / 2 + y * VIEW_UNIT. */
export const VIEW_UNIT = 18;
const MID = VIEW / 2, UNIT = VIEW_UNIT;

export interface Drawing {
  viewBox: string;
  /** The body's outline: fill it with `fill` (nonzero rule). */
  body: string;
  /** The viewer's left eye and right eye; an empty string when that eye cannot be seen. Fill with `eyeFill`. */
  eyes: [string, string];
  fill: string;
  eyeFill: string;
  /** What is drawn beside the body (fx.ts): `back` before the body path, `front` after the eyes. None when nothing shows. */
  effects?: DrawnFx[];
  /** 0..1: how much the body glows, for a renderer that draws a glow. */
  glow?: number;
  /**
   * Everything else the body carries (its antennas, its decals), each a path of its own in a colour of its own.
   * Paint them in order: the ones with `front` false under the body, then the body, then the ones with `front`
   * true, then the eyes. Only a body with antennas or decals has any.
   */
  layers?: Layer[];
  /** What a renderer needs to draw a coat of fur for this frame; only when drawAvatar is asked for it. */
  coat?: DrawnCoat;
  /**
   * Ultracode, only while any of it shows (RigState.ultra): how much of its finish to paint over the body path
   * (0..1), and how far the rainbow's bands have slid round their cycle (0..1). The engine draws no gradient:
   * the renderer paints the rainbow, its sheen and its rim over `body`. Its halo and twinkles are in `effects`.
   */
  ultra?: { amount: number; phase: number };
}

/**
 * A coat stretched onto the outline drawn in a change of shape (DrawnCoat.warp): two distances a ray; `past`, how
 * far the body's own outline goes past the further of the two rays either side at most (a renderer sizes its
 * picture by it); and `press`, 0..1, how far the edges of thin pieces that the outline drawn cuts off are pressed
 * onto it (see stretched()): none at the body's own end of the change, all of them a little way from it.
 */
export interface CoatWarp { own: Float64Array; reach: Float64Array; past: number; press: number }

/**
 * Where a coat stretched onto a changing outline draws a point `rho` from the middle (projected, drawing units),
 * `t` of the way from one ray to the next, where the coat's own body reaches `own0` and `own1` and the outline drawn
 * `reach0` and `reach1` (`a` and `at` between the two). Inside its own outline it is stretched in proportion, onto the
 * outline drawn there. Between that and the further of the two rays (`b`) lies the edge of a thin piece the nearer
 * ray misses, an ear or a leaf, which the outline drawn (straight from ray to ray) cuts off: `press` of the way it is
 * pressed onto the outline (and it never goes out past the further ray). Past both, the pile is only moved, so the
 * fur keeps its length. So nothing is flung out past the outline, and at rest (`press` 0) nothing moves. The vertex
 * shader moves each point of the surface so, and the pile on it with it, as it stands (coat/shaders.ts).
 */
export function stretched(rho: number, own0: number, own1: number, reach0: number, reach1: number, t: number, press: number): number {
  const a = own0 + (own1 - own0) * t, at = reach0 + (reach1 - reach0) * t;
  if (rho <= a) return (rho * at) / a;
  const b = Math.max(own0, own1), far = own0 >= own1 ? reach0 : reach1;
  const top = at + (1 - press) * Math.max(0, Math.min(far - at, b - a));
  return rho <= b ? at + ((top - at) * (rho - a)) / (b - a) : top + rho - b;
}

/** Over this share of a change of shape from its body's own end, the edges of a coat's thin pieces are pressed onto the outline. */
const PRESS = 0.15;

/**
 * A coat for one frame (see coat.ts for the mesh). The coat's image depends on `rotation` and on the eyes it
 * clears round, and nothing else: draw it in the drawing's own units, then place it with `affine`, the same 2D
 * move the body, eyes and layers have had. Paint order: the layers behind, the coat, the body path, the layers
 * in front, the eyes. The body path is the flat body: while a coat shows, fill it at 1 - opacity (none at 1).
 */
export interface DrawnCoat {
  dotFace?: DotFaceMotion;
  /** The body the coat is of: coatMesh(body). Not always the body drawn: in a morph it is the one it leaves, then the one it becomes. */
  body: Body;
  /**
   * 0..1: how much of the coat shows. 1 on a body, and all through a change of shape (see `warp`). As the body
   * turns into a loading figure it eases to 0 over the first quarter of the way, and the figure's own coat
   * (`shape`) back to 1 over the last quarter.
   */
  opacity: number;
  /**
   * In a change of shape, the outline drawn is a blend of two bodies' that is neither one's, so the coat of `body`
   * is stretched onto it along rays from the middle of the drawing (n rays as morph.ts counts them: clockwise from
   * the right as drawn, y down). `own[i]` is how far `body`'s own outline reaches along ray i and `reach[i]` how far
   * the outline drawn does, both read between the two rays either side of a point. A point of the coat, before
   * `affine`, is drawn where stretched() puts it. Unset on a body and on a figure's own coat.
   */
  warp?: CoatWarp;
  /**
   * In a change of shape, the other body's coat (the one it becomes before half way, the one it leaves after),
   * stretched onto the same outline by its own `warp`. Near half way the two cross over: where both have fur the
   * picture is this coat at 1 - `share` and the other at `share` (0.5 at half way, where the two swap places, and 0
   * further than COAT_SWAP from it), and where only the other has, that at twice its share, so the fur never changes
   * from one frame to the next. It is named all through the change,
   * at share 0 too, so a renderer can make its mesh before it is needed. (A change that cut into one near half way
   * has, over its first COAT_SWAP, the coat that was laid over then, fading out: see coatsAt.)
   */
  also?: { body: Body; warp: CoatWarp; share: number };
  /**
   * While the body is a loading figure (and `body` is that figure's, from figures.ts): how the figure's mesh is moved
   * into this frame's shape. A renderer that ignores it draws the figure at rest.
   */
  shape?: FigureShape;
  /**
   * The pose's rotation, row by row (math.ts rotation): a body point p goes to p' = R p, body units, y up, z
   * toward the viewer. It is then drawn in perspective from a camera at z = D (6): with s = D / (D - p'z), at
   * X = VIEW / 2 + VIEW_UNIT * s * p'x and Y = VIEW / 2 - VIEW_UNIT * s * p'y in drawing units (y down), before `affine`.
   */
  rotation: Mat3;
  /**
   * The 2D move after the projection (squash and stretch, the pop, the hop, a move to the side, the mirror flip),
   * as [a, b, c, d, e, f] in drawing units: X' = a X + c Y + e, Y' = b X + d Y + f (the order of SVG's matrix()
   * and the canvas's setTransform). [1, 0, 0, 1, 0, 0] when there is none. b and c are always 0; a is negative when mirrored.
   */
  affine: [number, number, number, number, number, number];
  /**
   * Both eyes, as one SVG path in drawing units before `affine`: where they are in the coat's own image, for the
   * pile to be cleared under them. The same polygons as Drawing.eyes (which are after it). Empty when no eye
   * shows. The same string is the same eyes, so it can key a mask.
   */
  eyes: string;
}

/** One more path of a drawing: an antenna, a decal. */
export interface Layer {
  solid?: boolean;
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

/** One part of an effect as a path: paint it in its role's colour at its opacity, behind the body or in front. */
export interface DrawnFx { layer: 'back' | 'front'; role: FxRole; opacity: number; d: string }

/** A shadow under a body that is off the ground: this dark at most, and gone by the time it is this high. */
export const SHADOW = 0.2, SHADOW_GONE = 0.7;

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

/** The face, lid and look the eyes of `e` are drawn with: for fixed lenses, always the plain open front ones. */
function seen(e: Body['eyes'], state: RigState): { face: Face; lid: number; x: number; y: number } {
  return e.fixed ? { face: FACES.neutral, lid: 1, x: 0, y: 0 } : { face: state.face, lid: state.lid, x: state.eye.x, y: state.eye.y };
}

/** The two eyes on a body whose outline for this pose is `outline`. */
function eyesOn(body: Body, state: RigState, size: number, outline: ArrayLike<number>[]): [Float64Array[], Float64Array[]] {
  const d = detail(size), e = body.eyes;
  const dot = state.dot ?? 0, grow = state.eyeScale ?? 1;
  if (grow <= 0.02) return [[], []];
  const look = seen(e, state);
  const cu = (e.cx ?? 0) + look.x * e.slideX, cv = e.y + look.y * e.slideY;
  // How far round the body is, as a share of a full look: 1 turned right, -1 turned left, 0 facing (or backing) us.
  // (Seen from behind, the face is on the back and the same turn shows the other way round. And nearly edge
  // on nothing is opened: the eye there is going round the rim, and a wide one would jump from rim to rim.)
  const facing = Math.min(1, Math.max(0, (Math.abs(R[8]) - 0.1) / 0.3));
  const turned = Math.max(-1, Math.min(1, Math.sin(state.pose.yaw) / SIN_LOOK)) * (R[8] < 0 ? -1 : 1) * facing;
  // (The arches of delight bend the eyes of a face: never a fixed lens.)
  const face: Face = state.arc && !e.fixed ? { ...look.face, arc: look.face.arc + state.arc } : look.face;
  const shapes = ([-1, 1] as const).map((side, i) => {
    // 1 body unit is half the drawn size. (A face built with eyes of two sizes draws each at its own, and a wink
    // shuts one eye on top of the blink: never a fixed lens.)
    const own = e.sizes ? e.sizes[i] : 1;
    const lid = look.lid * (state.lids && !e.fixed ? state.lids[i] : 1);
    const eye = eyeOutline(face, side, e.w * d.boost * own, e.h * d.boost * own, lid, d.eye, outlines[i], (LINE_PX * 2) / size).subarray(0, d.eye * 2);
    // The near eye opens: wider and a little taller about its own middle (so a face's lift and lean stay as
    // they are), and moved outward by what it gained, so its inner edge stays put and all the growth is on the
    // side coming toward the viewer. However wide the face draws its eyes, it never grows into the far one.
    const near = Math.max(0, -side * turned) ** 2 * (e.open ?? 1);
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
  const e = src.eyes, boost = detail(size).boost, look = seen(e, state);
  const cu = (e.cx ?? 0) + look.x * e.slideX, cv = e.y + look.y * e.slideY;
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
function compose(given: Body, state: RigState, size: number, coat = false): { body: Float64Array[]; eyes: [Float64Array[], Float64Array[]]; layers: Piece[]; shadow: Float64Array | null; opacity: number; frame: Float64Array[]; affine: readonly number[]; bare: Float64Array[] | null; reach: Float64Array | null; shape: FigureShape | null } {
  const body = state.body ?? given, d = detail(size);
  const portrait = body.dotStyle?.character;
  rotation(portrait && portrait !== 'Blossie' && portrait !== 'Felipe flower'
    ? { ...state.pose, yaw: state.pose.yaw + 8 * Math.PI / 180 } : state.pose, R);
  if (portrait === 'Felipe flower') {
    const rest = [0.9681,-0.0058,0.2505, 0,0.99973,0.02316, -0.25057,-0.02242,0.96784];
    for (let i = 0; i < 9; i += 3) {
      const a = R[i], b = R[i+1], c = R[i+2];
      for (let j = 0; j < 3; j++) R[i+j] = a*rest[j] + b*rest[3+j] + c*rest[6+j];
    }
  }
  const own = silhouette(body, R, d.rim);
  const morph = state.morph, fig = state.figure && state.figure.k > 0 ? state.figure : null;
  let outline: Float64Array[] = own, eyes: [Float64Array[], Float64Array[]];
  let wearer = body, fence: ArrayLike<number>[] = own;
  /** In a change of shape or a figure: the outline drawn, as distances along rays (before the move below). */
  let reach: Float64Array | null = null;
  let shape: FigureShape | null = null;

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
    reach = r;
    // (The figure's parts first: the spinner shapes the disc's own edge.)
    const parts = fig ? figureParts(fig, n, 2 / size, r) : null;
    outline = [polar(r)];
    if (coat && parts) {
      // The figure's coat follows the same numbers: the band between the hole and the outline, or the balls.
      if (parts.hole) {
        const band = new Float32Array(2 * n);
        band.set(parts.hole, 0); band.set(r, n);
        shape = { kind: 'band', rays: n, band };
      } else if (parts.balls && parts.balls.length) shape = { kind: 'balls', from: REST[fig!.form]!, to: Float32Array.from(parts.balls) };
    }
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
  const grow = fig ? 1 - fig.k : 1;
  // (No stalk thinner than STALK_PX across, so a small drawing still shows them: half the drawing is size / 2 px.)
  const least = STALK_PX / size;
  // In a morph the old body's antennas draw in over its first half and the new one's grow out over its second,
  // so neither stands on an outline that is not yet (or no longer) under it.
  const kIn = morph ? smooth(Math.max(0, 2 * morph.k - 1)) : 1, kOut = morph ? smooth(Math.max(0, 1 - 2 * morph.k)) : 0;
  if (body.antennas && kIn * grow > 0.02) stalks(body, state, d.rim, kIn * grow, least, layers);
  const from = morph ? leaf(morph.from) : null;
  if (from && from !== body && from.antennas && kOut * grow > 0.02) stalks(from, state, d.rim, kOut * grow, least, layers);
  let dotMask: Float64Array[] | undefined;
  if (wearer.dotStyle && !fig && !morph) {
    const face = dotFace(wearer, wearer.dotStyle, state, R, size);
    layers.push(...face, ...dotExtra(wearer, wearer.dotStyle, R, d.rim));
    if (coat) dotMask = face.flatMap(p => p.polys.map(poly => poly.slice()));
    eyes = [[], []];
  }
  if (wearer.decals) marks(wearer, state, size, fence, layers);

  // Squash and stretch (standing on the base, as wide as it is short), the pop, the hop, a move to the side, the mirror flip.
  // (A move to the side is mirrored with everything else: a lean that slides right slides left when mirrored.)
  const tall = state.stretch ?? 1, big = state.scale ?? 1, up = state.lift ?? 0, flip = state.flip ?? 1, dx = (state.shift ?? 0) * flip;
  let shadow: Float64Array | null = null, opacity = 0;
  // (For a coat: the eyes before the move, and the move, x' = a x + e and y' = d y + f in body units.)
  let affine: readonly number[] = IDENTITY, bare: Float64Array[] | null = coat ? dotMask ?? [...eyes[0], ...eyes[1]] : null;
  if (tall !== 1 || big !== 1 || up !== 0 || flip !== 1 || dx !== 0) {
    // (The ground is under the body itself: a figure's little ball going round below it does not lift it.)
    const box = bounds(fig ? [outline[0]] : outline), ground = box[3], kx = (big * flip) / tall;
    if (bare) { bare = bare.map((p) => p.slice()); affine = [kx, 0, 0, tall * big, dx, ground * (1 - tall) * big - up]; }
    for (const polys of [outline, eyes[0], eyes[1], ...layers.map((l) => l.polys)]) {
      for (const p of polys) for (let i = 0; i < p.length; i += 2) { p[i] = p[i] * kx + dx; p[i + 1] = (ground + (p[i + 1] - ground) * tall) * big - up; }
    }
    // Mirrored, the eye that was on the left is on the right.
    if (flip < 0) eyes = [eyes[1], eyes[0]];
    // Off the ground, a shadow on it: smaller and fainter the higher it goes, so the height of a hop reads.
    if (up > 0.002) {
      const high = Math.min(1, up / SHADOW_GONE), half = ((box[2] - box[0]) / 2) * Math.abs(kx) * (0.85 - 0.4 * high);
      // (Not for the hair a face lifts its chest by: only for a body plainly off the ground.)
      opacity = SHADOW * smooth((up - 0.015) / 0.05) * (1 - high);
      if (opacity > 0.004) {
        shadow = disc(0, 0, 1, 24);
        const cx = ((box[0] + box[2]) / 2) * kx + dx, cy = ground * big + 0.03;
        for (let i = 0; i < shadow.length; i += 2) { shadow[i] = cx + shadow[i] * half; shadow[i + 1] = cy + shadow[i + 1] * Math.max(0.035, half * 0.16); }
      }
    }
  }
  // The effects are placed against the body itself: not a figure's little ball going round it.
  return { body: outline, eyes, layers, shadow, opacity, frame: fig && fig.form === 'orbit' ? [outline[0]] : outline, affine, bare, reach, shape };
}

const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

export { COAT_SWAP };

/**
 * Which body wears the coat, and how much of it shows, for a drawing whose outline is `reach` (rays; null on a
 * body). In a change of shape the coat stays on: it is the body it leaves until half way and the one it becomes
 * after, each stretched onto the blended outline (DrawnCoat.warp), the two crossing over near half way (coatsAt). A
 * loading figure has nothing of the body under it to wear the body's coat, so that fades out over the first quarter
 * of the way in (stretched as ever, if the shape is changing too), and from there on the coat is the figure's own,
 * whatever shape the body under the figure is changing to (none shows until the last quarter, but a renderer can
 * make its mesh meanwhile). Coming out goes back the same way, onto the body (or the change of shape) under it.
 * (Call it after compose(), for this pose's R.)
 */
function coatOf(given: Body, state: RigState, size: number, reach: Float64Array | null): Pick<DrawnCoat, 'body' | 'opacity' | 'warp' | 'also'> & { figure: boolean } {
  const morph = state.morph, fig = state.figure && state.figure.k > 0 ? state.figure : null;
  if (fig && fig.k >= COAT_FADE) return { body: figureBody(fig.form), opacity: smooth((fig.k - 1 + COAT_FADE) / COAT_FADE), figure: true };
  const drawn = state.body ?? given;
  const opacity = fig ? 1 - smooth(fig.k / COAT_FADE) : 1;
  if (!morph || !reach) return { body: drawn, opacity, figure: false };
  const rim = detail(size).rim, n = reach.length, { wears, other, share } = coatsAt(morph.from, drawn, morph.k);
  const old = leaf(morph.from), k = morph.k;
  const warpOf = (b: Body): CoatWarp => {
    const polys = silhouette(b, R, rim), own = radial(polys, n);
    const press = b === drawn ? smooth((1 - k) / PRESS) : b === old ? smooth(k / PRESS) : 1;
    let past = 0;
    for (const p of polys) {
      for (let j = 0; j < p.length; j += 2) {
        const i = Math.floor((((Math.atan2(p[j + 1], p[j]) / (2 * Math.PI)) * n) % n + n) % n) % n;
        past = Math.max(past, Math.hypot(p[j], p[j + 1]) - Math.max(own[i], own[(i + 1) % n]));
      }
    }
    return { own, reach, past, press };
  };
  const out: Pick<DrawnCoat, 'body' | 'opacity' | 'warp' | 'also'> & { figure: boolean } = { body: wears, opacity, warp: warpOf(wears), figure: false };
  if (other !== wears) out.also = { body: other, warp: warpOf(other), share };
  return out;
}

/** A figure's coat is turned by the figure itself, never by the pose: the spinner's fur goes round with its comet (clockwise as drawn). */
function figureTurn(state: RigState): Mat3 {
  const a = state.figure!.form === 'ring' ? -state.figure!.turn : 0, c = Math.cos(a), s = Math.sin(a);
  return Float64Array.of(c, -s, 0, s, c, 0, 0, 0, 1);
}

/** The body as the effects see it this frame: its box, its middle, and (only if asked for) its reach from the middle. */
function frameOf(outline: Float64Array[], size: number): FxFrame {
  const [x0, y0, x1, y1] = bounds(outline), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let reach: Float64Array | null = null;
  return {
    x0, y0, x1, y1, cx, cy,
    reach() {
      if (!reach) reach = radial(outline.map((p) => { const q = new Float64Array(p.length); for (let i = 0; i < p.length; i += 2) { q[i] = p[i] - cx; q[i + 1] = p[i + 1] - cy; } return q; }), rays(size));
      return reach;
    },
  };
}

/** The effects of a state, drawn against the body's outline, plus the shadow of a lifted body. */
function effectsOf(state: RigState, outline: Float64Array[], size: number, shadow: Float64Array | null, opacity: number): FxPart[] {
  const parts: FxPart[] = [];
  if (shadow) parts.push({ layer: 'back', role: 'shadow', opacity, polys: [shadow] });
  if (state.fx && state.fx.length) {
    const f = frameOf(outline, size), way = (state.flip ?? 1) < 0 ? -1 : 1;
    // (Mirrored, an effect that has a way to go, speed lines or sparks, goes the other way with the body.)
    for (const fx of state.fx) parts.push(...fxParts(way < 0 && fx.dir ? { ...fx, dir: -fx.dir } : fx, f, 2 / size));
  }
  return parts;
}

/** Screen polygons of the effects for a rig state (the shadow of a lifted body included). */
export function effectShapes(body: Body, state: RigState, size: number): FxPart[] {
  const c = compose(body, state, size);
  return effectsOf(state, c.frame, size, c.shadow, c.opacity);
}

/** A layer before it is a path: screen polygons, and what it is. */
interface Piece { solid?: boolean; id: string; part: string; fill: string; front: boolean; polys: Float64Array[] }

/** The thinnest an antenna's stalk is drawn, in pixels across. */
const STALK_PX = 1.4;

/** Body colours for a key the body does not paint. */
const UNPAINTED = '#1C1C1C';

/**
 * The antennas of `of`, grown to `grow`, into `out`: always behind the body, so the part of each stalk that is
 * inside the head never shows and each one comes up out of the top of the outline, however the body turns.
 */
function stalks(of: Body, state: RigState, rim: number, grow: number, least: number, out: Piece[]): void {
  const a = of.antennas!, swing = state.antennas ?? [0, 0];
  const [left, right] = antennaPieces(a, swing, grow, least);
  const fill = of.paint?.[a.paint] ?? UNPAINTED;
  [left, right].forEach((pieces, i) => {
    out.push({ id: i ? 'antenna-right' : 'antenna-left', part: a.paint, fill, front: false, polys: silhouette({ pieces }, R, Math.max(16, Math.round(rim / 2))) });
  });
}

/**
 * Where a decal that sits behind an eye is, and how big, for this state: it slides with the eye, opens with
 * the near eye as the body turns (keeping its inner edge, as the eye does), and goes to nothing with a dot. It
 * keeps to its size for a face that draws the eyes wider, growing only as the square root of that, so a rim
 * stays a rim round a wide eye and two of them do not run together.
 */
function behindEye(of: Body, dc: Decal, state: RigState, size: number): { cu: number; cv: number; sx: number; sy: number; w: number } {
  if (dc.eye === 'both') {
    // Halfway between the two eyes, as big as they are on average; a span reaches from one's middle to the
    // other's. (Each is placed as an eye's own rim would be, so a span's ends stay under the rims.)
    const l = behindEye(of, { ...dc, eye: 'left', w: of.eyes.w }, state, size), r = behindEye(of, { ...dc, eye: 'right', w: of.eyes.w }, state, size);
    const k = Math.min(l.sy, r.sy);
    if (!dc.span) return { cu: (l.cu + r.cu) / 2, cv: (l.cv + r.cv) / 2, sx: k, sy: k, w: dc.w * k };
    // A span reaches a little way into each eye from its inner edge, so whatever shape a face gives the eyes,
    // no end of it shows beyond them.
    const into = 0.3, inL = l.cu + (of.eyes.w * l.sx * (1 - into)) / 2, inR = r.cu - (of.eyes.w * r.sx * (1 - into)) / 2;
    return { cu: (inL + inR) / 2, cv: (l.cv + r.cv) / 2, sx: k, sy: k, w: Math.max(0, inR - inL) + dc.w * k };
  }
  const e = of.eyes, boost = detail(size).boost, side = dc.eye === 'left' ? -1 : 1, i = side < 0 ? 0 : 1;
  const own = e.sizes ? e.sizes[i] : 1, look = seen(e, state), f = look.face;
  const k = boost * own * Math.sqrt(Math.max(1, f.width * (1 + side * f.uneven))) * (state.eyeScale ?? 1) * (1 - (state.dot ?? 0));
  const facing = Math.min(1, Math.max(0, (Math.abs(R[8]) - 0.1) / 0.3));
  const turned = Math.max(-1, Math.min(1, Math.sin(state.pose.yaw) / SIN_LOOK)) * (R[8] < 0 ? -1 : 1) * facing;
  const near = Math.max(0, -side * turned) ** 2 * (e.open ?? 1), wide = 1 + NEAR_WIDE * near, tall = 1 + NEAR_TALL * near;
  const out = (side * (wide - 1) * dc.w * k) / 2;
  return { cu: (e.cx ?? 0) + look.x * e.slideX + side * e.x * boost + out, cv: e.y + look.y * e.slideY, sx: k * wide, sy: k * tall, w: dc.w * k * wide };
}

/** The decals of `of` that can be seen, each a layer over the body, into `out`. */
function marks(of: Body, state: RigState, size: number, fence: ArrayLike<number>[], out: Piece[]): void {
  const d = detail(size), thin = (THIN_PX * 2) / size;
  for (const dc of of.decals!) {
    let cu = dc.at[0], cv = dc.at[1], sx = 1 - (state.dot ?? 0), sy = sx, w = dc.w * sx;
    if (dc.eye) ({ cu, cv, sx, sy, w } = behindEye(of, dc, state, size));
    if (sx <= 0.02 || w <= 0) continue;
    const shape = decalOutline(dc.shape, w, dc.h * sy, dc.turn ?? 0, d.eye);
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

/**
 * One frame. `body` is drawn unless the state carries its own (a rig that was given one): then that one is.
 * With `coat`, the drawing also carries what a coat of fur needs (Drawing.coat); the rest is the same either way.
 */
export function drawAvatar(body: Body, colour: string, state: RigState, size: number, opts?: { coat?: boolean }): Drawing {
  const { body: outline, eyes, layers, shadow, opacity, frame, affine, bare, reach, shape } = compose(body, state, size, opts?.coat === true);
  const out: Drawing = { viewBox: VIEW_BOX, body: toPath(outline, UNIT, MID), eyes: [toPath(eyes[0], UNIT, MID), toPath(eyes[1], UNIT, MID)], ...colours(colour) };
  if (layers.length) {
    // The ones behind first, then the ones in front: the order to paint them in.
    out.layers = [...layers.filter((l) => !l.front), ...layers.filter((l) => l.front)]
      .map((l) => ({ id: l.id, part: l.part, d: toPath(l.polys, UNIT, MID), fill: l.fill, front: l.front, ...(l.solid ? { solid: true } : {}) }));
  }
  const parts = shadow || state.fx?.length ? effectsOf(state, frame, size, shadow, opacity) : null;
  if (parts && parts.length) out.effects = parts.filter((p) => p.opacity > 0.004 && p.polys.length).map((p) => ({ layer: p.layer, role: p.role, opacity: Math.round(p.opacity * 1000) / 1000, d: toPath(p.polys, UNIT, MID) }));
  if (state.glow) out.glow = state.glow;
  // (A copy: the rig changes its own in place.)
  if (state.ultra) out.ultra = { amount: state.ultra.amount, phase: state.ultra.phase };
  if (bare) {
    const [a, , , d, e, f] = affine, { figure, ...wears } = coatOf(body, state, size, reach);
    const move: DrawnCoat['affine'] = [a, 0, 0, d, MID * (1 - a) + UNIT * e, MID * (1 - d) + UNIT * f];
    const dotFace = wears.body.dotStyle && !figure && !state.morph ? {
      x: state.eye.x, y: state.eye.y, left: state.lid*(state.lids?.[0] ?? 1), right: state.lid*(state.lids?.[1] ?? 1),
    } : undefined;
    // (A figure's coat has no eyes to part round: the marks and eye dots are drawn over its fur.)
    out.coat = figure
      ? { ...wears, rotation: figureTurn(state), affine: move, eyes: '', ...(shape ? { shape } : {}) }
      : { ...wears, ...(dotFace ? { dotFace } : {}), rotation: new Float64Array(R), affine: move, eyes: toPath(bare, UNIT, MID) };
  }
  return out;
}

/** Screen polygons of the antennas and decals for a rig state, in the order they are painted. */
export function layerShapes(body: Body, state: RigState, size: number): { id: string; front: boolean; polys: Float64Array[] }[] {
  const { layers } = compose(body, state, size);
  return [...layers.filter((l) => !l.front), ...layers.filter((l) => l.front)].map((l) => ({ id: l.id, front: l.front, polys: l.polys }));
}
