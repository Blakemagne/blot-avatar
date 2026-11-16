// The pebble: a bar of soap. Four fat spheres at the corners of a small rectangle make it a little wider
// than tall, and a ball pushed out of the front (and the back) gives the face a dome to sit on.
//
// As on the blob, that ball carries the eyes and is not drawn: the outline is the bar alone. The ball is
// inside the bar's outline in every pose a look can hold; side on it stood 0.1 proud of the bar, a shoulder
// on each side half way through a spin (10 px on a 200 px avatar).

import type { Body, Sphere } from '../body';
import { ROUND_LOOK, bothSides } from './parts';

/** The flat pebble's box, stood level: 1.89 wide, 1.74 tall. */
const W = 1.888, H = 1.736;
const R = 0.8;
const a = W / 2 - R, b = H / 2 - R;

const BAR: Sphere[] = [[-a, b, 0, R], [a, b, 0, R], [-a, -b, 0, R], [a, -b, 0, R]];

export const pebble: Body = {
  id: 'pebble',
  pieces: [[...BAR, ...bothSides([[0, 0, 0.3, 0.6]])]],
  outline: { pieces: [BAR] },
  eyes: { x: 0.22, y: 0.1, w: 0.24, h: 0.47, slideX: 0.15, slideY: 0.1 },
  look: ROUND_LOOK,
};
