import { frontDepth } from '../coat/face-surface';
import type { CoatMesh } from './coat-surface';
import { DOT_RADIUS, sectionMesh } from './dot-mesh';

// Bounds of the native wink at 26 columns, relative to the outer lash.
// These follow the two edges of the ink separately as the eye opens.
const closedTop = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 5, 5, 4, 3, 3, 3];
const closedBottom = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 8, 8, 9, 9, 9, 9, 8, 8, 8, 7, 7, 6, 5];
const openTop = [1, 1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -3, -4, -5, -6, -7, -7, -7, -7, -6, -6, -5, -4, -2, 1];
const openBottom = [1, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 8, 11, 13, 14, 15, 15, 16, 16, 16, 15, 15, 14, 13, 11, 8];

const cache = new WeakMap<CoatMesh, Map<number, CoatMesh>>();

function sample(row: number[], u: number) {
  const x = Math.max(0,Math.min(25,u)), i = Math.min(24,Math.floor(x)), f = x-i;
  const smooth = (j: number) => (row[Math.max(0,j-1)] + 2*row[j] + row[Math.min(25,j+1)])/4;
  return smooth(i)*(1-f) + smooth(i+1)*f;
}

/** The outer lash stays on the cheek while the centre opens into a swept eye. */
export function sweptBlink(crease: CoatMesh, shell: CoatMesh, side: number, openness: number) {
  const step = Math.max(0,Math.min(32,Math.round(32*openness)));
  if (!step) return crease;
  let poses = cache.get(crease);
  if (!poses) { poses = new Map(); cache.set(crease,poses); }
  const saved = poses.get(step);
  if (saved) return saved;
  const b = crease.box, width = b[3]-b[0], radius = width*.55, progress = step/32;
  const cx = (b[0]+b[3])/2, cy = b[4]-.08*width;
  const shape = (x: number,y: number) => {
    const u = .5 - side*x*radius/width;
    if (u<=0 || u>=1) return -Math.abs(u-.5)+.5;
    const column = 26*u-.5;
    const blend = (closed: number[],open: number[]) => sample(closed,column)*(1-progress)+sample(open,column)*progress;
    const hi = b[4]-(blend(closedTop,openTop)-.5)*width/26;
    const lo = b[4]-(blend(closedBottom,openBottom)+.5)*width/26;
    const v = (2*(cy+y*radius)-hi-lo)/(hi-lo);
    const bevel = Math.min(.025,(hi-lo)*.4)/radius;
    return bevel*bevel*(1-v*v)*Math.min(1,26*u,26*(1-u));
  };
  const midplane = (x: number,y: number) =>
    ((frontDepth(shell,cx+radius*x,cy+radius*y) ?? b[2])+.018)/radius;
  const result = sectionMesh([cx/DOT_RADIUS,cy/DOT_RADIUS,0],radius/DOT_RADIUS,64,shape,midplane);
  poses.set(step,result);
  return result;
}
