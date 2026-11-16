// Rotation and perspective for the Bot's avatar.
//
// Body space: x right, y UP, z toward the viewer. A pose turns the body about y (yaw, positive turns the face
// to the viewer's right), then about x (pitch, positive looks up), then about z (roll). The camera sits on the
// z axis at distance D; a point at depth z is drawn D / (D - z) times bigger, which is what makes the near eye
// larger than the far one. Screen space is x right, y DOWN, so y is flipped at the very end.

/** Camera distance in body units (1 unit = half of the avatar's drawing box). */
export const D = 6;

export interface Pose { yaw: number; pitch: number; roll: number }

/** A 3x3 rotation, row by row. */
export type Mat3 = Float64Array;

export const deg = (d: number): number => (d * Math.PI) / 180;

export function rotation(p: Pose, out: Mat3 = new Float64Array(9)): Mat3 {
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
  // Rx(pitch) * Ry(yaw)
  const a0 = cy, a1 = 0, a2 = sy;
  const b0 = -sp * sy, b1 = cp, b2 = sp * cy;
  // Rz(roll) in front of it
  out[0] = cr * a0 - sr * b0; out[1] = cr * a1 - sr * b1; out[2] = cr * a2 - sr * b2;
  out[3] = sr * a0 + cr * b0; out[4] = sr * a1 + cr * b1; out[5] = sr * a2 + cr * b2;
  out[6] = -cp * sy; out[7] = -sp; out[8] = cp * cy;
  return out;
}

/** The camera's position in the body's own (unrotated) coordinates: R transposed times (0, 0, D). */
export function cameraInBody(R: Mat3): [number, number, number] {
  return [R[6] * D, R[7] * D, R[8] * D];
}

/** Rotate a body point and project it. Writes screen x, y (y down) into out[at], out[at + 1]. */
export function project(R: Mat3, x: number, y: number, z: number, out: number[] | Float64Array, at: number): void {
  const px = R[0] * x + R[1] * y + R[2] * z;
  const py = R[3] * x + R[4] * y + R[5] * z;
  const pz = R[6] * x + R[7] * y + R[8] * z;
  const s = D / (D - pz);
  out[at] = px * s;
  out[at + 1] = -py * s;
}

/** Signed area of a flat [x0, y0, x1, y1, ...] polygon (shoelace); the sign follows the winding. */
export function area(poly: ArrayLike<number>): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    a += poly[i] * poly[j + 1] - poly[j] * poly[i + 1];
  }
  return a / 2;
}

/** Bounding box [minX, minY, maxX, maxY] of flat polygons. */
export function bounds(polys: ArrayLike<number>[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) {
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i];
      if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1];
      if (p[i + 1] > y1) y1 = p[i + 1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Is (x, y) inside the flat polygon? Even-odd rule. */
export function inside(poly: ArrayLike<number>, x: number, y: number): boolean {
  let hit = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
