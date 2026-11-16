// The teardrop: a drop. The hull of a big ball and a small one above it. It is round about its upright axis,
// as a drop is: turning it left or right moves only the eyes over it, and a nod tips its point toward you.

import type { Body } from '../body';
import { ROUND_LOOK } from './parts';

/** The flat teardrop's box, stood upright: 1.73 wide, 2.0 tall. */
const W = 1.726, H = 2.003;
const TIP_R = 0.2;
const R = W / 2;

export const teardrop: Body = {
  id: 'teardrop',
  pieces: [[[0, -H / 2 + R, 0, R], [0, H / 2 - TIP_R, 0, TIP_R]]],
  eyes: { x: 0.22, y: -0.02, w: 0.24, h: 0.45, slideX: 0.16, slideY: 0.1 },
  look: ROUND_LOOK,
};
