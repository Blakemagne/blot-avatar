import { dotVolumes } from './dot-volumes';

export const HALF = 17 / 16;
// Orthographic reference framing: a unit-radius surface occupies 54.945% of a 512px camera.
export const DOT_RADIUS = .54945 * 512 / 296;

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

export function sample(values: readonly number[], n: number, x: number, y: number): number {
  const u = Math.max(0, Math.min(n - 1, (x / HALF + 1) * (n - 1) / 2));
  const v = Math.max(0, Math.min(n - 1, (y / HALF + 1) * (n - 1) / 2));
  const i = Math.floor(u), j = Math.floor(v);
  function row(dy: number) {
    const offset = n * Math.max(0, Math.min(n - 1, j + dy));
    return cubic(values[offset + Math.max(0, i - 1)], values[offset + i],
      values[offset + Math.min(n - 1, i + 1)], values[offset + Math.min(n - 1, i + 2)], u - i);
  }
  return .0001 * cubic(row(-1), row(0), row(1), row(2), v - j);
}

/** The measured front surface in blot body units for an orthographic ray. */
export function dotDepth(id: string, x: number, y: number): number | undefined {
  const v = dotVolumes[id];
  if (!v) return;
  const u = x / DOT_RADIUS, w = y / DOT_RADIUS;
  const q = sample(v.thicknessSquared, v.grid, u, w);
  if (q < 0) return;
  return DOT_RADIUS * ((v.centre ? sample(v.centre, v.grid, u, w) : 0) + Math.sqrt(q));
}
