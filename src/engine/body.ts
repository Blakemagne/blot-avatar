// The body: convex pieces made of spheres.
//
// A piece is the convex hull of its spheres (one sphere is a ball, two a tapered capsule, five a rounded
// pyramid, eight a rounded box). The body is the union of its pieces. The surface of such a hull is made of
// three kinds of patch only: part of a sphere, part of the cone between two spheres, and a flat triangle
// touching three spheres. Everything here is closed form on those patches, so there is no mesh.

export type Sphere = readonly [x: number, y: number, z: number, r: number];
export type Piece = readonly Sphere[];

/** Where the eyes rest, in face coordinates (the same x and y as the front view), and how far they may slide. */
export interface EyeSpec {
  /** Half the distance between the two eye centres. */
  x: number;
  /** Height of the eye line. */
  y: number;
  /** Width and height of one eye at the neutral face. */
  w: number;
  h: number;
  /** How far a look slides the eyes on the surface, sideways and up or down. */
  slideX: number;
  slideY: number;
}

/**
 * A body. Build it symmetric front to back (every piece mirrored in z, or its own mirror image), because the
 * face is drawn on whichever side is turned to the viewer.
 */
export interface Body {
  id: string;
  pieces: readonly Piece[];
  eyes: EyeSpec;
  /**
   * How far a look turns this body and slides its eyes, as a share of a full look (1 when not given). A ball
   * takes less: its far eye goes round the rim, and at the full look it is gone and the near eye is turning
   * away after it, one slit on a blank ball. Held a little short, the near eye is whole and the far one is a
   * slit at the rim. (A spin still goes all the way round.)
   */
  look?: number;
  /**
   * What is drawn as the body's outline, when that is not all of `pieces`: the eyes always ride on `pieces`.
   * For a face that swells a little out of the body it is drawn on (the blob's). Whatever is left out must
   * stay inside this outline in every pose a look can hold, where the eyes show; it is only out of the
   * picture further round, in a spin, when the eyes have gone.
   */
  outline?: Solid;
}

/** Pieces, and nothing else: all that an outline is worked out from. */
export interface Solid { readonly pieces: readonly Piece[] }

/** A flat face of a piece: the plane n . p = d, and the triangle of points where it touches three spheres. */
interface Tri { nx: number; ny: number; nz: number; d: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number }

interface PiecePrep {
  /** Spheres, flat: x, y, z, r. */
  s: Float64Array;
  n: number;
  tris: Tri[];
  /** A ball that holds the whole piece: x, y, z, r. */
  ball: [number, number, number, number];
}

export interface Prep { pieces: PiecePrep[]; box: [number, number, number, number] }

const preps = new WeakMap<Solid, Prep>();

export function prepare(body: Solid): Prep {
  let p = preps.get(body);
  if (!p) { p = build(body); preps.set(body, p); }
  return p;
}

function build(body: Solid): Prep {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pieces = body.pieces.map((piece): PiecePrep => {
    const n = piece.length;
    const s = new Float64Array(n * 4);
    let mx = 0, my = 0, mz = 0;
    piece.forEach((sp, i) => {
      s.set(sp, i * 4);
      mx += sp[0] / n; my += sp[1] / n; mz += sp[2] / n;
      x0 = Math.min(x0, sp[0] - sp[3]); x1 = Math.max(x1, sp[0] + sp[3]);
      y0 = Math.min(y0, sp[1] - sp[3]); y1 = Math.max(y1, sp[1] + sp[3]);
    });
    let br = 0;
    for (const sp of piece) br = Math.max(br, Math.hypot(sp[0] - mx, sp[1] - my, sp[2] - mz) + sp[3]);
    const tris: Tri[] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) tangentPlanes(piece[i], piece[j], piece[k], tris);
    return { s, n, tris, ball: [mx, my, mz, br] };
  });
  return { pieces, box: [x0, y0, x1, y1] };
}

/** The two planes that touch three spheres from outside (none when one sphere sits too deep between the others). */
function tangentPlanes(a: Sphere, b: Sphere, c: Sphere, out: Tri[]): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz, uv = ux * vx + uy * vy + uz * vz;
  const det = uu * vv - uv * uv;
  if (det < 1e-12) return;
  // n = s u + t v + h w with n . u = ra - rb and n . v = ra - rc, w the unit normal of the centres' plane.
  const e = a[3] - b[3], f = a[3] - c[3];
  const s = (e * vv - f * uv) / det, t = (f * uu - e * uv) / det;
  const px = s * ux + t * vx, py = s * uy + t * vy, pz = s * uz + t * vz;
  const m2 = px * px + py * py + pz * pz;
  if (m2 >= 1) return;
  let wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
  const wl = Math.hypot(wx, wy, wz);
  wx /= wl; wy /= wl; wz /= wl;
  const h = Math.sqrt(1 - m2);
  for (const sign of [1, -1]) {
    const nx = px + sign * h * wx, ny = py + sign * h * wy, nz = pz + sign * h * wz;
    out.push({
      nx, ny, nz, d: nx * a[0] + ny * a[1] + nz * a[2] + a[3],
      ax: a[0] + a[3] * nx, ay: a[1] + a[3] * ny, az: a[2] + a[3] * nz,
      bx: b[0] + b[3] * nx, by: b[1] + b[3] * ny, bz: b[2] + b[3] * nz,
      cx: c[0] + c[3] * nx, cy: c[1] + c[3] * ny, cz: c[2] + c[3] * nz,
    });
  }
}

/** A point of the front surface: its height and its unit normal. */
export interface Hit { z: number; nx: number; ny: number; nz: number }

/**
 * The front surface at (x, y): the highest z of the body there, with the surface normal. False when (x, y)
 * is outside the body's front view.
 */
export function surfaceTop(prep: Prep, x: number, y: number, out: Hit): boolean {
  let best = -Infinity;
  for (const pp of prep.pieces) {
    const { s, n } = pp;
    for (let i = 0; i < n; i++) {
      const o = i * 4, dx = x - s[o], dy = y - s[o + 1], r = s[o + 3];
      const q = r * r - dx * dx - dy * dy;
      if (q < 0) continue;
      const h = Math.sqrt(q), z = s[o + 2] + h;
      if (z > best) { best = z; out.nx = dx / r; out.ny = dy / r; out.nz = h / r; }
    }
    for (const t of pp.tris) {
      if (t.nz < 1e-9) continue;
      const z = (t.d - t.nx * x - t.ny * y) / t.nz;
      if (z <= best) continue;
      const e1 = (t.bx - t.ax) * (y - t.ay) - (t.by - t.ay) * (x - t.ax);
      const e2 = (t.cx - t.bx) * (y - t.by) - (t.cy - t.by) * (x - t.bx);
      const e3 = (t.ax - t.cx) * (y - t.cy) - (t.ay - t.cy) * (x - t.cx);
      if ((e1 >= 0 && e2 >= 0 && e3 >= 0) || (e1 <= 0 && e2 <= 0 && e3 <= 0)) { best = z; out.nx = t.nx; out.ny = t.ny; out.nz = t.nz; }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = i * 4, b = j * 4;
        if (Math.max(s[a + 2] + s[a + 3], s[b + 2] + s[b + 3]) <= best) continue;
        const z = coneTop(s[a], s[a + 1], s[a + 2], s[a + 3], s[b], s[b + 1], s[b + 2], s[b + 3], x, y, best, out);
        if (z > best) best = z;
      }
    }
  }
  out.z = best;
  return best > -Infinity;
}

/**
 * The top of the cone between two spheres at (x, y), if it beats `best`. The hull of two spheres is every
 * ball c(t), r(t) for t from 0 to 1, so its top is the highest ball top there: one variable, concave, solved
 * by bisection on the slope. The two end balls are the caller's.
 */
function coneTop(ax: number, ay: number, az: number, ar: number, bx: number, by: number, bz: number, br: number, x: number, y: number, best: number, out: Hit): number {
  const ex = bx - ax, ey = by - ay, ez = bz - az, rho = br - ar;
  const a0 = ax - x, b0 = ay - y;
  // Q(t) = r(t)^2 - (distance in x, y to the ball's centre)^2; the ball covers (x, y) where Q >= 0.
  const q2 = rho * rho - ex * ex - ey * ey, q1 = 2 * (ar * rho - a0 * ex - b0 * ey), q0 = ar * ar - a0 * a0 - b0 * b0;
  const Q = (t: number) => (q2 * t + q1) * t + q0;
  let lo = 0, hi = 1;
  const in0 = q0 >= 0, in1 = Q(1) >= 0;
  if (!in0 || !in1) {
    let mid: number;
    if (in0) mid = 0;
    else if (in1) mid = 1;
    else {
      if (q2 >= 0) return -Infinity;
      mid = -q1 / (2 * q2);
      if (mid <= 0 || mid >= 1 || Q(mid) <= 0) return -Infinity;
    }
    if (!in0) { let u = 0, v = mid; for (let k = 0; k < 26; k++) { const m = (u + v) / 2; if (Q(m) >= 0) v = m; else u = m; } lo = v; }
    if (!in1) { let u = mid, v = 1; for (let k = 0; k < 26; k++) { const m = (u + v) / 2; if (Q(m) >= 0) u = m; else v = m; } hi = u; }
  }
  // Slope of the ball top along t, times 2 sqrt(Q): positive below the best ball, negative above it.
  const slope = (t: number) => 2 * ez * Math.sqrt(Math.max(Q(t), 0)) + 2 * q2 * t + q1;
  if (slope(lo) <= 0 || slope(hi) >= 0) return -Infinity;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (slope(m) > 0) lo = m; else hi = m; }
  const t = (lo + hi) / 2, h = Math.sqrt(Math.max(Q(t), 0)), z = az + t * ez + h;
  if (z <= best) return -Infinity;
  const r = ar + t * rho;
  out.nx = (x - ax - t * ex) / r; out.ny = (y - ay - t * ey) / r; out.nz = h / r;
  return z;
}

/**
 * Does the ray from o along the unit direction d run into the body? Used to hide a point of the face that
 * another part of the body is in front of. Start the ray a hair off the surface, on the outside.
 */
export function blocked(prep: Prep, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  // Distance from a ball's centre to the ray, less its radius: negative means the ray enters the ball.
  const gap = (cx: number, cy: number, cz: number, r: number): number => {
    const mx = cx - ox, my = cy - oy, mz = cz - oz;
    const t = Math.max(0, mx * dx + my * dy + mz * dz);
    return Math.hypot(mx - t * dx, my - t * dy, mz - t * dz) - r;
  };
  for (const pp of prep.pieces) {
    if (gap(pp.ball[0], pp.ball[1], pp.ball[2], pp.ball[3]) > 0) continue;
    const { s, n } = pp;
    for (let i = 0; i < n; i++) if (gap(s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]) < 0) return true;
    // Between two spheres the hull is every ball c(t), r(t). The gap from the ray's line to that ball is
    // convex in t and least where its slope is zero, which is a quadratic: try its roots.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = i * 4, b = j * 4;
        const ex = s[b] - s[a], ey = s[b + 1] - s[a + 1], ez = s[b + 2] - s[a + 2], rho = s[b + 3] - s[a + 3];
        const mx = s[a] - ox, my = s[a + 1] - oy, mz = s[a + 2] - oz;
        const ed = ex * dx + ey * dy + ez * dz, md = mx * dx + my * dy + mz * dz;
        // Squared distance from the line to c(t): A t^2 + B t + C.
        const A = ex * ex + ey * ey + ez * ez - ed * ed, B = 2 * (mx * ex + my * ey + mz * ez - md * ed), C = mx * mx + my * my + mz * mz - md * md;
        const k = A - rho * rho;
        if (k <= 1e-12) continue;
        const root = Math.sqrt(Math.max(0, B * B - 4 * A * (B * B - 4 * rho * rho * C) / (4 * k)));
        for (const t of [(-B - root) / (2 * A), (-B + root) / (2 * A)]) {
          if (t > 0 && t < 1 && gap(s[a] + t * ex, s[a + 1] + t * ey, s[a + 2] + t * ez, s[a + 3] + t * rho) < 0) return true;
        }
      }
    }
    for (const t of pp.tris) {
      const along = t.nx * dx + t.ny * dy + t.nz * dz;
      if (Math.abs(along) < 1e-12) continue;
      const k = (t.d - t.nx * ox - t.ny * oy - t.nz * oz) / along;
      if (k <= 0) continue;
      const px = ox + k * dx, py = oy + k * dy, pz = oz + k * dz;
      const s1 = side(t.ax, t.ay, t.az, t.bx, t.by, t.bz, px, py, pz, t) >= 0, s2 = side(t.bx, t.by, t.bz, t.cx, t.cy, t.cz, px, py, pz, t) >= 0, s3 = side(t.cx, t.cy, t.cz, t.ax, t.ay, t.az, px, py, pz, t) >= 0;
      if (s1 === s2 && s2 === s3) return true;
    }
  }
  return false;
}

/** Which side of the edge a -> b the point p is on, seen along the triangle's normal. */
function side(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, py: number, pz: number, t: Tri): number {
  const ex = bx - ax, ey = by - ay, ez = bz - az, qx = px - ax, qy = py - ay, qz = pz - az;
  return (ey * qz - ez * qy) * t.nx + (ez * qx - ex * qz) * t.ny + (ex * qy - ey * qx) * t.nz;
}
