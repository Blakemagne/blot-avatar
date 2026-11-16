// The star: six points, cut from a slab. Each point is a rounded triangle, from its tip to the two dips
// beside it, and a low roof in the middle carries the face. It is thin on purpose (a quarter as deep as it
// is tall): turned, it is still a star, with the points on both sides shortening together. (With a ball in
// the middle, the ball was all that was left of it by 60 degrees.)

import type { Body } from '../body';
import { ring, roof } from './parts';

/** The flat star's box, stood upright: 2.04 wide, 2.22 tall. */
const W = 2.037, H = 2.219;
/** The radius of a tip, and half the slab's thickness. */
const T = 0.25;
/** How far out the dips between the points are (their middles). */
const DIP = 0.486;
/** The side points are 30 degrees above and below level. */
const x = W / 2 - T, y = x * Math.tan(Math.PI / 6), top = H / 2 - T;
const tips = [[0, top], [x, y], [x, -y], [0, -top], [-x, -y], [-x, y]];
/** Clockwise from the dip after the top point: dips[i - 1] and dips[i] are either side of tips[i]. */
const dips = ring(6, DIP, T, 120).reverse();

export const star: Body = {
  id: 'star',
  pieces: [
    ...tips.map(([tx, ty], i) => [[tx, ty, 0, T], dips[(i + 5) % 6], dips[i]] as const),
    // The roof's four corners lie inside the four side points.
    roof(0.485, 0.28, T, 0.18, 0.11),
  ],
  eyes: { x: 0.2, y: 0.02, w: 0.23, h: 0.45, slideX: 0.13, slideY: 0.1 },
};
