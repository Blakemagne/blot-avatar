// Building blocks the bodies share. A body is spheres; these only save writing them out one by one.

import type { Piece, Sphere } from '../body';
import { D } from '../math';

/**
 * Near things are drawn bigger. A sphere built at depth z, with its centre and its radius both multiplied by
 * this, is drawn from the front where the unscaled sphere would be drawn at depth zero.
 */
const shrink = (z: number): number => (D - z) / D;

/**
 * How far a look turns a ball (the blob, the teardrop, the pebble), as a share of a full look: see Body.look.
 * At 0.8 the body is turned 38 degrees: the near eye is four fifths of its front size and the far one a slit
 * at the rim, a third of it, and both are still there with the look up and across as far as it goes, at 64 px
 * too. (At 0.85 the far eye was lost there; by 0.9 it is going straight across, and at 1 it has gone.)
 */
export const ROUND_LOOK = 0.8;

/** The same spheres in front of the centre plane and behind it: every body is its own mirror image front to back. */
export const bothSides = (front: readonly Sphere[]): Sphere[] => [...front, ...front.map(([x, y, z, r]): Sphere => [x, y, -z, r])];

/**
 * How far a face's two flanks turn away from each other, and why it is this little. A flank that faces `f`
 * degrees off the front is seen `f` further round than the body is turned (and a few degrees more, for the
 * perspective), and the eye on it is drawn as wide as the cosine of that. A full look turns the body 48 degrees
 * and holds it there. With flanks at 11 to 13 degrees the far eye is then still half as wide as the near one:
 * a slit, and plainly an eye. These faces began at 21 to 25 degrees, and there the far eye at the full look
 * was a line 2 px wide with body showing on both sides of it, which reads as a crack in the face. On a body
 * whose face is not its outline (a tile, a star) an eye cannot go round the edge during a look, because the
 * edge is somewhere else: it narrows as anything on the face of a flat thing does, and goes only when the
 * body spins. (On a ball it does go round, at the rim: that is the blob, the teardrop and the pebble.)
 */

/**
 * A prism with a low ridge on its face, as one convex piece. `corners` are the corner spheres [x, y, r] of its
 * front view; they are set at depth z and again at -z, sized so that the front view is that outline, and once
 * more half way between. The middle ones stand a little proud of the other two, so an edge that runs front to
 * back is bowed, and a corner of the outline stays one round corner as the body starts to turn (with only the
 * front and back spheres, the side coming into view cut a straight bevel across it). A corner on the middle
 * line (the point of a roof) is not bowed: no side comes into view round it, and bowed, the line it draws out
 * into as the body turns would sag at both ends.
 *
 * `ridge` is the face: two small spheres of radius r on the middle line, at y + half and y - half, pushed
 * forward to depth rz (and their mirror images behind). The hull joins them to the corners, so the face is a
 * soft upright ridge with one flat flank each side of it, falling back all the way to the block's side edge,
 * and each eye rests on a flank. Turned, the block is still a tile: both eyes narrow, the far one more.
 * (A dome was here first, a ball pushed out of the face. Its sides were twice as steep under the eyes.)
 */
export function prism(corners: readonly (readonly [x: number, y: number, r: number])[], z: number, ridge: readonly [y: number, half: number, rz: number, r: number]): Piece {
  const k = shrink(z), [y, half, rz, r] = ridge;
  return [...corners.map(([cx, cy, cr]): Sphere => (cx === 0 ? [0, cy * k, 0, cr * k] : [cx, cy, 0, cr])), ...bothSides([...corners.map(([cx, cy, cr]): Sphere => [cx * k, cy * k, z, cr * k]), [0, y + half, rz, r], [0, y - half, rz, r]])];
}

/**
 * A ball in the middle with one tapered capsule from it to each tip (a point of a star, a petal, a puff).
 * Every piece holds the whole core, so each capsule leaves it without a crease; the only creases are where
 * two capsules meet.
 */
export const sprout = (core: Sphere, tips: readonly Sphere[]): Piece[] => tips.map((tip): Piece => [core, tip]);

/**
 * What the face of a sprouted body sits on: a ball pushed forward out of the core (and its mirror image out
 * of the back). The eyes rest on its one smooth surface, clear of the creases where the capsules meet, and go
 * round its edge as the body turns. Keep it inside the core as seen from the front, so the outline is not changed.
 */
export const muzzle = (z: number, r: number, y = 0): Piece => [[0, y, z, r], [0, y, -z, r]];

/** `n` spheres [x, y, 0, t] evenly round the middle, `out` from it, the first at `from` degrees (0 is right, 90 is up). */
export const ring = (n: number, out: number, t: number, from = 0): Sphere[] =>
  Array.from({ length: n }, (_, i): Sphere => {
    const a = ((from + (i * 360) / n) * Math.PI) / 180;
    return [out * Math.cos(a), out * Math.sin(a), 0, t];
  });

/**
 * The rounded edge of a flat disc: `n` spheres of radius `t` whose hull, from the front, follows the circle of
 * radius `R` about (cx, cy) from `from` to `to` degrees. The disc is 2t thick; a ball of that outline would be 2R.
 */
export const rim = (cx: number, cy: number, R: number, t: number, from: number, to: number, n: number): Sphere[] =>
  Array.from({ length: n }, (_, i): Sphere => {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    return [cx + (R - t) * Math.cos(a), cy + (R - t) * Math.sin(a), 0, t];
  });

/**
 * The face of a flat body: a low roof over its middle. Two spheres pushed forward by `z`, one `ridge` above
 * the middle and one as far below it (and their mirror images behind), are joined to four spheres lying in
 * the body's flat part at (+-a, +-b). All of them are as thick as the body is there (`t`), so a flank falls
 * back by z for every a outward. That makes a soft ridge down the middle of the face with a flat flank
 * falling away from it on each side, and each eye rests on a flank. Turned, the near flank faces the viewer
 * and its eye opens up; the far flank leans away, and its eye thins to a slit. The roof is narrower than the
 * body until the body is nearly side on: turned, the body's own outline shows, not a ball in its middle.
 * And it is as round as the slab's own edge, so side on it is a swelling in the middle, not a box.
 *
 * (A ball for the face was tried first. Low enough to stay inside the outline, it left the far eye in two
 * specks, top and bottom, for a few degrees before it went: its round edge hid the middle of the eye first.)
 */
export const roof = (a: number, b: number, t: number, ridge: number, z: number): Piece =>
  [...bothSides([[0, ridge, z, t], [0, -ridge, z, t]]), [a, b, 0, t], [-a, b, 0, t], [-a, -b, 0, t], [a, -b, 0, t]];

/**
 * Round lobes (the petals of a flower, the leaves of a clover) as flat discs: one piece for each centre
 * [x, y], which go counter-clockwise round the middle. From the front a lobe is the circle of radius `R` about
 * its centre, from where it meets the lobe before it to where it meets the next; it is 2t thick, and its edge
 * is `n` spheres. The pieces leave the middle open: a `roof` goes there.
 */
export function lobes(centres: readonly (readonly [x: number, y: number])[], R: number, t: number, n: number): Piece[] {
  const deg = (x: number, y: number): number => (Math.atan2(y, x) * 180) / Math.PI;
  /** Where the circles about a and b cross, on the side away from the middle, as an angle about a. */
  const meet = ([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number]): number => {
    const hx = (bx - ax) / 2, hy = (by - ay) / 2, h = Math.hypot(hx, hy);
    const out = Math.sqrt(R * R - h * h) * (hx * (ay + hy) - hy * (ax + hx) > 0 ? 1 : -1);
    return deg(hx + (out * -hy) / h, hy + (out * hx) / h);
  };
  return centres.map((c, i) => {
    const from = meet(c, centres[(i + centres.length - 1) % centres.length]);
    let to = meet(c, centres[(i + 1) % centres.length]);
    while (to < from) to += 360;
    return rim(c[0], c[1], R, t, from, to, n);
  });
}
