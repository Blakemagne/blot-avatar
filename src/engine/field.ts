// The front surface as a height field: z(x, y) with normals, on a grid over the body's front view.
//
// One field per body, cached. A grid node is worked out the first time something asks for it (the eyes only
// ever visit a small part of the face), then read back with bilinear interpolation. The back of the body is
// the same field mirrored in z, which is why bodies are built symmetric front to back.

import { prepare, surfaceTop, type Body, type Hit, type Prep } from './body';

/** Grid nodes per body unit. */
const PER_UNIT = 64;

interface Field {
  prep: Prep;
  x0: number; y0: number; cols: number; rows: number;
  /** 0 = not worked out yet, 1 = on the body, 2 = outside it. */
  state: Uint8Array;
  z: Float64Array; nx: Float32Array; ny: Float32Array; nz: Float32Array;
}

const fields = new WeakMap<Body, Field>();
const hit: Hit = { z: 0, nx: 0, ny: 0, nz: 0 };

function fieldOf(body: Body): Field {
  let f = fields.get(body);
  if (f) return f;
  const prep = prepare(body);
  const [bx0, by0, bx1, by1] = prep.box;
  const pad = 2 / PER_UNIT;
  const cols = Math.ceil((bx1 - bx0 + 2 * pad) * PER_UNIT) + 1, rows = Math.ceil((by1 - by0 + 2 * pad) * PER_UNIT) + 1;
  const n = cols * rows;
  f = { prep, x0: bx0 - pad, y0: by0 - pad, cols, rows, state: new Uint8Array(n), z: new Float64Array(n), nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n) };
  fields.set(body, f);
  return f;
}

function node(f: Field, i: number, j: number): number {
  const k = j * f.cols + i;
  if (f.state[k] === 0) {
    if (surfaceTop(f.prep, f.x0 + i / PER_UNIT, f.y0 + j / PER_UNIT, hit)) {
      f.state[k] = 1; f.z[k] = hit.z; f.nx[k] = hit.nx; f.ny[k] = hit.ny; f.nz[k] = hit.nz;
    } else f.state[k] = 2;
  }
  return f.state[k] === 1 ? k : -1;
}

/**
 * The front surface at face coordinates (u, v): height and unit normal into `out`. False when (u, v) is not
 * on the body (or within one grid cell of its edge as seen from the front).
 */
export function surfaceAt(body: Body, u: number, v: number, out: Hit): boolean {
  const f = fieldOf(body);
  const gx = (u - f.x0) * PER_UNIT, gy = (v - f.y0) * PER_UNIT;
  const i = Math.floor(gx), j = Math.floor(gy);
  if (i < 0 || j < 0 || i >= f.cols - 1 || j >= f.rows - 1) return false;
  const a = node(f, i, j), b = node(f, i + 1, j), c = node(f, i, j + 1), d = node(f, i + 1, j + 1);
  if (a < 0 || b < 0 || c < 0 || d < 0) return false;
  const tx = gx - i, ty = gy - j;
  const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
  out.z = f.z[a] * wa + f.z[b] * wb + f.z[c] * wc + f.z[d] * wd;
  const nx = f.nx[a] * wa + f.nx[b] * wb + f.nx[c] * wc + f.nx[d] * wd;
  const ny = f.ny[a] * wa + f.ny[b] * wb + f.ny[c] * wc + f.ny[d] * wd;
  const nz = f.nz[a] * wa + f.nz[b] * wb + f.nz[c] * wc + f.nz[d] * wd;
  const l = Math.hypot(nx, ny, nz) || 1;
  out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
  return true;
}
