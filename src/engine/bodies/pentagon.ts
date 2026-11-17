// The pentagon: a rounded regular pentagonal prism, point up, with a low ridge down the middle of its face.
// Unlike the house, its sides lean in from the shoulders to a narrower foot. Turn it and the point on top
// draws out into a ridge.

import type { Body } from '../body';
import { prism } from './parts';

/** How far each corner sphere's centre is from the middle of the pentagon. */
const OUT = 0.76;
const R = 0.2;
/** A regular pentagon is not centred in its own box: drop it so the box is. */
const DROP = (OUT * (1 - Math.cos(Math.PI / 5))) / 2;
/** The shoulders, at 18 degrees above level, and the feet, at 54 below. */
const sx = OUT * Math.cos(Math.PI / 10), sy = OUT * Math.sin(Math.PI / 10) - DROP;
const fx = OUT * Math.cos((3 * Math.PI) / 10), fy = -OUT * Math.sin((3 * Math.PI) / 10) - DROP;
/** Point up, then round. The top corner is exactly on the middle line, and each side is the other's exact mirror image. */
const corners: [number, number, number][] = [[0, OUT - DROP, R], [sx, sy, R], [fx, fy, R], [-fx, fy, R], [-sx, sy, R]];

export const pentagon: Body = {
  id: 'pentagon',
  pieces: [prism(corners, 0.28, [0, 0.3, 0.4, 0.2])],
  eyes: { x: 0.2, y: 0, w: 0.22, h: 0.43, slideX: 0.13, slideY: 0.1 },
};
