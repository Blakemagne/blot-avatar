// The house: a rounded pentagonal prism. A ridge on top, two eaves, two feet, the same again behind: turn it
// and the point of the roof draws out into a ridge.

import type { Body } from '../body';
import { prism } from './parts';

/** The flat house's box, stood upright: 1.78 wide, 1.83 tall. */
const W = 1.782, H = 1.827;
const R = 0.2;
/** How high the eaves are. */
const EAVES = 0.2;
const x = W / 2 - R;

export const house: Body = {
  id: 'house',
  pieces: [prism([[0, H / 2 - R, R], [-x, EAVES, R], [x, EAVES, R], [-x, -H / 2 + R, R], [x, -H / 2 + R, R]], 0.28, [-0.1, 0.3, 0.4, 0.2])],
  eyes: { x: 0.2, y: -0.08, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
