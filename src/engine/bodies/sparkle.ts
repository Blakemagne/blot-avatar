// The sparkle: four points, cut from a slab. Each point is a rounded triangle, from its tip to the two dips
// beside it, and a low roof in the middle carries the face. Turned, the side points shorten and stay points.

import type { Body } from '../body';
import { ring, roof } from './parts';

/** The flat sparkle's box, stood upright: 2.19 wide, 2.22 tall. */
const W = 2.19, H = 2.224;
/** The radius of a tip, and half the slab's thickness. */
const T = 0.33;
/** How far out the dips between the points are (their middles), on the diagonals. */
const DIP = 0.35;
const x = W / 2 - T, y = H / 2 - T;
const tips = [[0, y], [x, 0], [0, -y], [-x, 0]];
/** Clockwise from the dip after the top point: dips[i - 1] and dips[i] are either side of tips[i]. */
const dips = ring(4, DIP, T, 135).reverse();

export const sparkle: Body = {
  id: 'sparkle',
  pieces: [
    ...tips.map(([tx, ty], i) => [[tx, ty, 0, T], dips[(i + 3) % 4], dips[i]] as const),
    // The roof's four corners lie inside the two side points. The dips are close to the eyes on this shape,
    // so the eyes slide a little less far up and down than on the others.
    roof(0.45, 0.14, T, 0.3, 0.105),
  ],
  eyes: { x: 0.2, y: 0.04, w: 0.23, h: 0.45, slideX: 0.13, slideY: 0.08 },
};
