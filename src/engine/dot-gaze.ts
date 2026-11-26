import { gazeCoefficients, gazeParts } from './dot-gaze-data';
import { DOT_RADIUS } from './dot-depth';

const decoded = new Map<number, Int16Array>();

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
    coefficients = Int16Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(2 * i, true));
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
  const result: number[] = [];
  for (let i = 0; i < 12; i += 3) {
    for (let j = 0; j < 3; j++) {
      result.push(relative[j]*axes[i] + relative[3+j]*axes[i+1] + relative[6+j]*axes[i+2]
        + (i === 9 ? DOT_RADIUS*relative[9+j] : 0));
    }
  }
  return result;
}
