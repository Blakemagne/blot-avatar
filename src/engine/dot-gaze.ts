import { gazeCoefficients, gazeParts } from './dot-gaze-data';
import { DOT_RADIUS } from './dot-depth';

const decoded = new Map<number, Int32Array>();

/** An explicit stationary response is also a measured rig. */
export function hasGazeRig(key: string): boolean {
  return gazeParts[key] !== undefined;
}

/** Move an insert on the wearer's surface, after applying its neutral fit and eyelid pivot. */
export function gazeTransform(key: string, section: number, axes: number[], x: number, y: number): number[] | undefined {
  const fit = gazeParts[key]?.[section];
  if (fit === undefined) return;
  const index = typeof fit === 'number' ? fit : fit[Number(x > 0) + 2 * Number(y > 0)];
  if (index < 0 || (!x && !y)) return axes;
  let coefficients = decoded.get(index);
  if (!coefficients) {
    const bytes = Uint8Array.from(atob(gazeCoefficients[index]), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    let offset = 0;
    coefficients = Int32Array.from({ length: 96 }, () => {
      const word = view.getInt16(offset, true);
      offset += 2;
      if (word !== -32768) return word;
      const wide = view.getInt32(offset, true);
      offset += 4;
      return wide;
    });
    decoded.set(index, coefficients);
  }
  x = Math.min(1, Math.max(-1, x));
  y = Math.min(1, Math.max(-1, y));
  const xx = x*x, yy = y*y;
  const terms = [x, y, xx, yy, x*y, xx*y, x*yy, xx*yy];
  const relative = [1,0,0, 0,1,0, 0,0,1, 0,0,0];
  for (let i = 0; i < terms.length; i++) {
    for (let j = 0; j < 12; j++) relative[j] += terms[i] * coefficients[12*i+j] / 10000;
  }
  return transformAxes(relative, axes);
}

/** Compose a bone in native radius units with a fitted part in blot body units. */
export function transformAxes(relative: readonly number[], axes: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < 12; i += 3) {
    for (let j = 0; j < 3; j++) {
      result.push(relative[j]*axes[i] + relative[3+j]*axes[i+1] + relative[6+j]*axes[i+2]
        + (i === 9 ? DOT_RADIUS*relative[9+j] : 0));
    }
  }
  return result;
}

/** Retarget an oval's in-plane expression to the front sheet of this head.
 * Its depth change and its two tangent vectors must agree at the eye centre. */
export function seatMovingOval(bone: number[], x: number, y: number, depth: (x: number,y: number) => number | undefined): void {
  const u = bone[0]*x + bone[3]*y + bone[9], v = bone[1]*x + bone[4]*y + bone[10];
  const h = depth(x,y), moved = depth(u,v);
  if (h === undefined || moved === undefined) return;
  const step = .027;
  const slope = (x: number,y: number,z: number,dx: number,dy: number) =>
    ((depth(x+dx,y+dy) ?? z) - (depth(x-dx,y-dy) ?? z))/(2*step);
  const ax = slope(x,y,h,step,0), ay = slope(x,y,h,0,step);
  const bx = slope(u,v,moved,step,0), by = slope(u,v,moved,0,step);
  bone[2] = bx*bone[0] + by*bone[1] - ax;
  bone[5] = bx*bone[3] + by*bone[4] - ay;
  bone[11] = moved-h-bone[2]*x-bone[5]*y;
}
