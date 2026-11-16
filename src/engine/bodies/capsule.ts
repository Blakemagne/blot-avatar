// The capsule (blot's shape id is "tablet"): a pill lying on its side, the hull of two equal spheres.

import type { Body } from '../body';

/** The flat tablet's box, stood level: 2.05 wide, 1.41 tall. */
const R = 0.703, HALF = 2.047 / 2 - R;

export const capsule: Body = {
  id: 'tablet',
  pieces: [[[-HALF, 0, 0, R], [HALF, 0, 0, R]]],
  eyes: { x: 0.27, y: 0.12, w: 0.24, h: 0.44, slideX: 0.16, slideY: 0.1 },
};
