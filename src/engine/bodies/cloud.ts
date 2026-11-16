// The cloud: five puffs cut from a thick slab, where the flat cloud has them: a big one up and to the left, a
// smaller one beside it, one out to each side, and a broad one underneath. A low roof in the middle carries
// the face. It is the one body that is not its own mirror image left to right.
//
// (The puffs were balls round a ball, with another ball pushed out of the middle for the face. A ball is as
// deep as it is wide: turned as far as a look turns it, the balls slid in behind one another, the scallops
// closed up, and it read as a ball with a ball behind it. A slab narrows when it turns and keeps its outline.)

import type { Body, Piece } from '../body';
import { rim, roof } from './parts';

/** Half the slab's thickness. */
const T = 0.3;
/** The puffs, [x, y, radius], counter-clockwise from the big one at the top left. From the front the cloud is these five circles. */
const PUFFS = [[-0.19, 0.173, 0.673], [-0.482, -0.228, 0.512], [-0.034, -0.208, 0.637], [0.441, -0.145, 0.555], [0.282, 0.275, 0.475]] as const;
/** A point inside all five circles: every piece reaches in to it, so together they fill the cloud. */
const MIDDLE = [-0.05, 0] as const;
/** The spheres along a puff's edge are at most this many degrees apart: closer than that the edge is round, not cornered. */
const STEP = 18;

const TURN = 360, deg = (x: number, y: number): number => (Math.atan2(y, x) * 180) / Math.PI;
const wrap = (a: number): number => ((a % TURN) + TURN) % TURN;

/**
 * The part of puff i's circle that is the cloud's outline, as [from, to] in degrees about its centre,
 * counter-clockwise: every other puff hides the stretch of it that lies inside that puff, and what is left is
 * one arc, from where one neighbour's cover ends to where the next one's begins.
 */
function shown(i: number): [number, number] {
  const [x, y, r] = PUFFS[i];
  // Each other puff covers the angles within `half` of `at`.
  const covers = PUFFS.flatMap(([qx, qy, qr], j) => {
    const d = Math.hypot(qx - x, qy - y), c = (d * d + r * r - qr * qr) / (2 * d * r);
    return j === i || c >= 1 ? [] : [{ at: deg(qx - x, qy - y), half: (Math.acos(Math.max(-1, c)) * 180) / Math.PI }];
  });
  const hidden = (a: number): boolean => covers.some((c) => Math.abs(wrap(a - c.at + 180) - 180) < c.half - 1e-9);
  const from = covers.map((c) => c.at + c.half).find((a) => !hidden(a))!, to = covers.map((c) => c.at - c.half).find((a) => !hidden(a))!;
  return [from, from + wrap(to - from)];
}

/** One puff: the rounded edge of a disc along its arc of the outline, joined to the middle. */
const puff = (i: number): Piece => {
  const [from, to] = shown(i);
  return [[MIDDLE[0], MIDDLE[1], 0, T], ...rim(PUFFS[i][0], PUFFS[i][1], PUFFS[i][2], T, from, to, Math.ceil((to - from) / STEP) + 1)];
};

export const cloud: Body = {
  id: 'cloud',
  // The roof's four corners lie inside the four outer puffs.
  pieces: [...PUFFS.map((_, i) => puff(i)), roof(0.44, 0.34, T, 0.26, 0.1)],
  eyes: { x: 0.2, y: 0.06, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
