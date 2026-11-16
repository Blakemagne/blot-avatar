// The hex: a rounded hexagonal prism, point up, with a low ridge down the middle of its face. Turn it and a
// facet comes into view round each corner of the outline.

import type { Body } from '../body';
import { prism } from './parts';

/** The flat hex's box, stood upright: 1.81 wide, 1.95 tall. */
const W = 1.812, H = 1.952;
const R = 0.22;
const x = W / 2 - R, y = H / 2 - R;

export const hex: Body = {
  id: 'hex',
  pieces: [prism([[0, y, R], [x, y / 2, R], [x, -y / 2, R], [0, -y, R], [-x, -y / 2, R], [-x, y / 2, R]], 0.26, [0, 0.3, 0.38, 0.2])],
  eyes: { x: 0.23, y: 0.03, w: 0.24, h: 0.46, slideX: 0.13, slideY: 0.1 },
};
