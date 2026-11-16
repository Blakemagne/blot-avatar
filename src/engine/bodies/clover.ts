// The clover: four round leaves on the diagonals, cut from a thick slab, with a low roof in the middle for
// the face. Turned, the near pair of leaves slides across the far pair.

import type { Body } from '../body';
import { lobes, roof } from './parts';

/** The flat clover's box, stood upright: 1.73 wide, 1.7 tall. */
const W = 1.734, H = 1.7;
const LEAF_R = 0.537;
/** Half the slab's thickness. */
const T = 0.34;
const x = W / 2 - LEAF_R, y = H / 2 - LEAF_R;
/** Counter-clockwise from the top right. */
const leaves = [[x, y], [-x, y], [-x, -y], [x, -y]] as const;

export const clover: Body = {
  id: 'clover',
  // The roof's four corners lie inside the four leaves, near their middles.
  pieces: [...lobes(leaves, LEAF_R, T, 9), roof(0.44, 0.34, T, 0.26, 0.1)],
  eyes: { x: 0.2, y: 0.06, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
