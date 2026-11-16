// The flower: six petals, cut from a slab. Each petal is a round disc, and a low roof in the middle carries
// the face. Turned, the petals on both sides narrow together and stay petals.

import type { Body } from '../body';
import { lobes, roof } from './parts';

/** The flat flower's box, stood upright: 1.86 wide, 1.99 tall. */
const W = 1.861, H = 1.989;
const PETAL_R = 0.41;
/** Half the slab's thickness. */
const T = 0.27;
const x = W / 2 - PETAL_R, top = H / 2 - PETAL_R, y = top / 2;
/** Counter-clockwise from the right-hand petal above the middle. */
const petals = [[x, y], [0, top], [-x, y], [-x, -y], [0, -top], [x, -y]] as const;

export const flower: Body = {
  id: 'flower',
  // The roof's four corners are the middles of the four side petals.
  pieces: [...lobes(petals, PETAL_R, T, 7), roof(x, y, T, 0.18, 0.12)],
  eyes: { x: 0.2, y: 0.04, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
