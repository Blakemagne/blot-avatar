// The square: a rounded block, half as deep as it is wide, with a low ridge down the middle of its face.

import type { Body } from '../body';
import { prism } from './parts';

/** The flat square's box, stood level: 1.75 wide, 1.63 tall. */
const W = 1.75, H = 1.627;
const CORNER_R = 0.2;
const x = W / 2 - CORNER_R, y = H / 2 - CORNER_R;

export const square: Body = {
  id: 'square',
  pieces: [prism([[-x, y, CORNER_R], [x, y, CORNER_R], [-x, -y, CORNER_R], [x, -y, CORNER_R]], 0.28, [0, 0.28, 0.4, 0.2])],
  eyes: { x: 0.19, y: 0.03, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
