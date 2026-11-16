// The blob: a ball with a soft nose. One big sphere is the whole outline (an exact circle, as the flat blob
// is), and a smaller one pushed forward out of it, with its mirror image behind, makes the face a rounder dome
// than the ball alone, so the eyes turn with it more plainly: the near eye a tenth wider and the far one a
// fifth smaller at a full look than on the bare ball.
//
// The nose carries the eyes and is not drawn. It stands 0.04 proud of the ball, and it is inside the ball's
// outline until the body is turned 53 degrees: a look holds the blob at 38 (47 off straight on, with a nod on
// top), so in every pose a look can hold, the picture is the same with the nose drawn or not. Further round
// it showed: a bulge on each side of the ball half way through a spin, 4 px on a 200 px avatar, when the eyes
// were shrinking away or gone. No nose that does anything can stay inside the ball all the way round (inside
// it from every side, it is inside the ball and changes nothing), so the outline is the ball alone, a circle
// from every side, and the eyes are kept inside it as they are inside any outline.
// (A ball squashed front to back was tried and dropped: it takes a ring of spheres, and a ring draws a circle
// with faint corners.)

import type { Body, Sphere } from '../body';
import { ROUND_LOOK, bothSides } from './parts';

/** The ball: the flat blob is a circle of this radius. */
const BALL: Sphere = [0, 0, 0, 0.92];

export const blob: Body = {
  id: 'blob',
  pieces: [[BALL, ...bothSides([[0, 0, 0.36, 0.6]])]],
  outline: { pieces: [[BALL]] },
  eyes: { x: 0.23, y: 0.12, w: 0.24, h: 0.46, slideX: 0.15, slideY: 0.1 },
  look: ROUND_LOOK,
};
