// The body's outline for a pose.
//
// Seen through the camera a sphere is a disc (very nearly: the true outline is traced here, so that a point on
// the sphere's edge lands exactly on it), and the hull of spheres is the hull of their discs. So for each piece:
// trace each sphere's rim, take the convex hull, and emit one closed subpath. All pieces wind the same way, so
// one path with the default nonzero fill is their union.

import { prepare, type Body } from './body';
import { D, type Mat3 } from './math';

const tables = new Map<number, Float64Array>();
function circle(k: number): Float64Array {
  let t = tables.get(k);
  if (!t) {
    t = new Float64Array(k * 2);
    for (let i = 0; i < k; i++) { t[i * 2] = Math.cos((i * 2 * Math.PI) / k); t[i * 2 + 1] = Math.sin((i * 2 * Math.PI) / k); }
    tables.set(k, t);
  }
  return t;
}

let pts = new Float64Array(1024);
let order = new Uint32Array(512);
let stack = new Uint32Array(1024);

/**
 * One convex polygon per piece, flat [x0, y0, x1, y1, ...] in screen units (x right, y down, 1 unit = half
 * the drawing box). `k` is how many points trace each sphere's rim.
 */
export function silhouette(body: Body, R: Mat3, k: number): Float64Array[] {
  const prep = prepare(body.outline ?? body);
  const ring = circle(k);
  const out: Float64Array[] = [];
  for (const pp of prep.pieces) {
    const total = pp.n * k;
    if (pts.length < total * 2) { pts = new Float64Array(total * 2); order = new Uint32Array(total); stack = new Uint32Array(total * 2); }
    for (let i = 0; i < pp.n; i++) {
      const o = i * 4, x = pp.s[o], y = pp.s[o + 1], z = pp.s[o + 2], r = pp.s[o + 3];
      // From the camera to the sphere's centre, then the cone of rays that graze the sphere.
      let ax = R[0] * x + R[1] * y + R[2] * z, ay = R[3] * x + R[4] * y + R[5] * z, az = R[6] * x + R[7] * y + R[8] * z - D;
      const len = Math.hypot(ax, ay, az);
      ax /= len; ay /= len; az /= len;
      const sb = r / len, cb = Math.sqrt(1 - sb * sb);
      // Two unit vectors across the cone's axis.
      let e1x = 1 - ax * ax, e1y = -ax * ay, e1z = -ax * az;
      const l1 = Math.hypot(e1x, e1y, e1z);
      e1x /= l1; e1y /= l1; e1z /= l1;
      const e2x = ay * e1z - az * e1y, e2y = az * e1x - ax * e1z, e2z = ax * e1y - ay * e1x;
      for (let j = 0; j < k; j++) {
        const c = ring[j * 2] * sb, s = ring[j * 2 + 1] * sb;
        const dx = cb * ax + c * e1x + s * e2x, dy = cb * ay + c * e1y + s * e2y, dz = cb * az + c * e1z + s * e2z;
        const t = -D / dz, at = (i * k + j) * 2;
        pts[at] = t * dx;
        pts[at + 1] = -t * dy;
      }
    }
    out.push(hull(total));
  }
  return out;
}

/** Convex hull (monotone chain) of the first `n` points in `pts`. */
function hull(n: number): Float64Array {
  for (let i = 0; i < n; i++) order[i] = i;
  const sorted = order.subarray(0, n).sort((a, b) => pts[a * 2] - pts[b * 2] || pts[a * 2 + 1] - pts[b * 2 + 1]);
  const cross = (o: number, a: number, b: number) => (pts[a * 2] - pts[o * 2]) * (pts[b * 2 + 1] - pts[o * 2 + 1]) - (pts[a * 2 + 1] - pts[o * 2 + 1]) * (pts[b * 2] - pts[o * 2]);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const p = sorted[i];
    while (m >= 2 && cross(stack[m - 2], stack[m - 1], p) <= 0) m--;
    stack[m++] = p;
  }
  const lower = m + 1;
  for (let i = n - 2; i >= 0; i--) {
    const p = sorted[i];
    while (m >= lower && cross(stack[m - 2], stack[m - 1], p) <= 0) m--;
    stack[m++] = p;
  }
  m--;
  const out = new Float64Array(m * 2);
  for (let i = 0; i < m; i++) { out[i * 2] = pts[stack[i] * 2]; out[i * 2 + 1] = pts[stack[i] * 2 + 1]; }
  return out;
}

/** Flat polygons as one SVG path, each a closed subpath. `scale` and `mid` map screen units to path units. */
export function toPath(polys: ArrayLike<number>[], scale: number, mid: number): string {
  let d = '';
  for (const p of polys) {
    if (p.length < 6) continue;
    for (let i = 0; i < p.length; i += 2) {
      d += (i === 0 ? 'M' : 'L') + Math.round((mid + p[i] * scale) * 100) / 100 + ' ' + Math.round((mid + p[i + 1] * scale) * 100) / 100;
    }
    d += 'Z';
  }
  return d;
}
