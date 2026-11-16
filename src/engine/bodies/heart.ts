// The heart: two halves that share everything but their lobe. Each half is the hull of one fat lobe, the small
// tip at the bottom, and a ball in the middle that pushes the front (and the back) out, so the face sits on a
// rounded surface and not in the valley between the lobes. The only dent in the union is the cleft on top.

import type { Body, Sphere } from '../body';

/** The flat heart's box, stood upright: 1.93 wide, 1.69 tall. */
const W = 1.932, H = 1.689;
const LOBE_R = 0.52, TIP_R = 0.27;
const lx = W / 2 - LOBE_R, ly = H / 2 - LOBE_R;
const tip: Sphere = [0, -H / 2 + TIP_R, 0, TIP_R];
const puff: Sphere = [0, -0.02, 0, 0.6];

export const heart: Body = {
  id: 'heart',
  pieces: [
    [[-lx, ly, 0, LOBE_R], tip, puff],
    [[lx, ly, 0, LOBE_R], tip, puff],
  ],
  eyes: { x: 0.21, y: 0.1, w: 0.22, h: 0.42, slideX: 0.13, slideY: 0.1 },
};
