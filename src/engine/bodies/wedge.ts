// The wedge: a little rounded pyramid. One sphere at the apex and four at the corners of a square base (two
// in front, two behind), so from the front it is a triangle with a straight base, and a base corner swings
// round as it turns.
//
// One more sphere pushes the middle of the front out (and one the back), low down. That gives the front a
// soft ridge down its middle, and each eye sits on one of the two flat flanks beside it. The flanks turn
// slightly away from each other: turn the body and the near eye opens up to the viewer while the far one
// thins out and goes round the edge.
//
// How far the flanks turn away is one number that pays both ways. A flank that falls back by `a` for every
// unit outward is edge on at a yaw of atan(1 / a), which is where the far eye goes. And when the body looks up
// by an angle p, the same slope tips each eye by atan(a sin p), inner end up, on a face that is squashing as
// it leans back: tipped far enough, the eyes read as worried. With the ridge where it is, `a` is 0.3: the far
// eye is a slit by 55 degrees of yaw and gone by 60, and the eyes are still level pills with the body looking
// up 20 degrees (at 0.44 the far eye went five degrees sooner and the eyes were sad lozenges by 18).
//
// The ridge spheres sit low enough that the whole of each eye is on its flank, so an eye squashes evenly, and
// high and small enough to stay inside the outline while the body nods up or down by 30 degrees, so the base
// stays straight: any lower and they would hang below the front corners as a chin.

import type { Body } from '../body';
import { D } from '../math';

/** The front view's box at pose zero: the flat wedge's, stood upright. */
const W = 2.09, H = 2.0;
const APEX_R = 0.27, BASE_R = 0.38;
/** How far the base corners sit in front of and behind the centre plane. */
const CORNER_Z = 0.5;
/** The ridge spheres: how high, how far out, how big. */
const RIDGE_Y = -0.44, RIDGE_Z = 0.71, RIDGE_R = 0.3;
/** Near things are drawn bigger: size the base so that the front corners still fit the box. */
const near = (D - CORNER_Z) / D;
const bx = (W / 2) * near - BASE_R;
const by = (-H / 2) * near + BASE_R;
const ay = H / 2 - APEX_R;

export const wedge: Body = {
  id: 'wedge',
  pieces: [[
    [0, ay, 0, APEX_R],
    [-bx, by, CORNER_Z, BASE_R], [bx, by, CORNER_Z, BASE_R], [0, RIDGE_Y, RIDGE_Z, RIDGE_R],
    [-bx, by, -CORNER_Z, BASE_R], [bx, by, -CORNER_Z, BASE_R], [0, RIDGE_Y, -RIDGE_Z, RIDGE_R],
  ]],
  eyes: { x: 0.23, y: -0.08, w: 0.24, h: 0.44, slideX: 0.13, slideY: 0.1 },
};
