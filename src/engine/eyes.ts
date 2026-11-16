// Eyes that live on the body's surface.
//
// An eye is a closed outline in face coordinates (u, v): the same x and y as the front view. Each point is
// lifted onto the surface, and is seen when the surface there faces the camera and no other part of the body
// is in front of it. The outline is cut where that stops being true, and the cut follows the body's edge. Then
// the points are rotated and projected like the body. So an eye foreshortens, squeezes into a slit and goes
// round the edge because it is a patch of the surface, not because anything fakes it.
//
// Two rules keep that tidy where it is drawn. An eye stops a little short of the body's outline, so a dark eye
// on a pale body never bites a notch out of the silhouette. And a piece too thin to draw as a slit is not drawn
// at all: a hairline along the edge reads as a scratch, not as an eye.

import { blocked, prepare, type Body, type Hit, type Prep } from './body';
import { surfaceAt } from './field';
import { D, area, cameraInBody, project, type Mat3 } from './math';

/** What keeps an eye tidy at the body's edge (screen units: 1 = half the drawing box). */
export interface Trim {
  /** The body's outline for this pose: one convex polygon per piece, as `silhouette` gives it. */
  outline: ArrayLike<number>[];
  /** How much body to leave between an eye and the outline. */
  rim: number;
  /** An eye, or a piece of one, drawn narrower than this is dropped; a much wider piece loses any end that tapers below twice this. */
  thin: number;
}

/** How far off the surface a sight line starts, so it cannot hit the patch it starts on. */
const OFF = 2e-3;

const hit: Hit = { z: 0, nx: 0, ny: 0, nz: 0 };

// The view being drawn, and the surface point `see` looked at last.
let body: Body, prep: Prep, R: Mat3, back = false, many = false;
let camX = 0, camY = 0, camZ = 0;
let X = 0, Y = 0, Z = 0;

/**
 * Lift face point (u, v) onto the surface. Face coordinates are where the point is DRAWN at pose zero, so the
 * lift runs along the camera's sight line through (u, v), not straight back: that keeps the eyes exactly as
 * the face describes them from the front, upright and level, on any surface. True when the camera can see the
 * point from the current pose; X, Y, Z is the point.
 */
function see(u: number, v: number): boolean {
  // The back of the body is the front mirrored; mirror u too, so the viewer's left eye stays on the left.
  if (back) u = -u;
  // A point at height z is drawn D / (D - z) times further out: close in on the z that puts it at (u, v).
  let k = 1 - 0.5 / D;
  for (let i = 0; i < 3; i++) {
    if (!surfaceAt(body, u * k, v * k, hit)) return false;
    k = 1 - hit.z / D;
  }
  const nz = back ? -hit.nz : hit.nz;
  X = u * k; Y = v * k; Z = back ? -hit.z : hit.z;
  const dx = camX - X, dy = camY - Y, dz = camZ - Z;
  if (hit.nx * dx + hit.ny * dy + nz * dz <= 0) return false;
  if (fenced) {
    const s = D / (D - (R[6] * X + R[7] * Y + R[8] * Z));
    if (!clear((R[0] * X + R[1] * Y + R[2] * Z) * s, -(R[3] * X + R[4] * Y + R[5] * Z) * s)) return false;
  }
  if (!many) return true;
  const l = Math.hypot(dx, dy, dz);
  return !blocked(prep, X + hit.nx * OFF, Y + hit.ny * OFF, Z + nz * OFF, dx / l, dy / l, dz / l);
}

/**
 * Where face point (u, v) is drawn for a pose, seen or not: screen x, y into out[at], out[at + 1]. False when
 * (u, v) is off the body. Used to carry the eyes from their place on one body to their place on another
 * while the shape changes.
 */
export function facePoint(of: Body, rot: Mat3, u: number, v: number, out: number[] | Float64Array, at = 0): boolean {
  const behind = rot[8] < 0;
  if (behind) u = -u;
  let k = 1 - 0.5 / D;
  for (let i = 0; i < 3; i++) {
    if (!surfaceAt(of, u * k, v * k, hit)) return false;
    k = 1 - hit.z / D;
  }
  project(rot, u * k, v * k, behind ? -hit.z : hit.z, out, at);
  return true;
}

// The outline's edges as lines (inward unit normal nx, ny and offset d: a point is nx x + ny y - d inside the
// edge), piece after piece, and for each piece a disc round its middle that is certainly clear of the rim.
let fenced = false, rim = 0, pieces = 0;
let lines = new Float64Array(3 * 256);
const from: number[] = [], to: number[] = [], disc: number[] = [];

function fence(outline: ArrayLike<number>[], margin: number): void {
  fenced = true; rim = margin; pieces = outline.length;
  let at = 0;
  outline.forEach((p, h) => {
    const n = p.length / 2;
    if (lines.length < (at + n) * 3) { const more = new Float64Array((at + n) * 6); more.set(lines); lines = more; }
    // The inside is on the left of each edge when the area is positive, on the right when it is negative.
    const turn = area(p) < 0 ? -1 : 1;
    let mx = 0, my = 0, room = Infinity;
    for (let i = 0; i < n; i++) { mx += p[i * 2] / n; my += p[i * 2 + 1] / n; }
    from[h] = at;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = p[j * 2], ay = p[j * 2 + 1], ex = p[i * 2] - ax, ey = p[i * 2 + 1] - ay, l = Math.hypot(ex, ey);
      if (l < 1e-12) continue;
      const nx = (-turn * ey) / l, ny = (turn * ex) / l, d = nx * ax + ny * ay;
      lines[at * 3] = nx; lines[at * 3 + 1] = ny; lines[at * 3 + 2] = d;
      room = Math.min(room, nx * mx + ny * my - d);
      at++;
    }
    to[h] = at;
    disc[h * 3] = mx; disc[h * 3 + 1] = my; disc[h * 3 + 2] = Math.max(0, room - margin);
  });
}

/** Is screen point (x, y) on the body with at least the rim between it and the outline? */
function clear(x: number, y: number): boolean {
  for (let h = 0; h < pieces; h++) {
    const dx = x - disc[h * 3], dy = y - disc[h * 3 + 1], r = disc[h * 3 + 2];
    if (dx * dx + dy * dy < r * r) return true;
    let i = from[h];
    const end = to[h];
    while (i < end && lines[i * 3] * x + lines[i * 3 + 1] * y - lines[i * 3 + 2] >= rim) i++;
    if (i === end) return true;
  }
  return false;
}

/**
 * How thick a polygon is drawn, however it bends: the width of the round-ended bar that has its area and its
 * perimeter. Exact for such a bar (and for a disc); a slit curving along the body's edge is as thin as it looks.
 */
export function barWidth(poly: ArrayLike<number>): number {
  let twice = 0, round = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    twice += poly[i] * poly[j + 1] - poly[j] * poly[i + 1];
    round += Math.hypot(poly[j] - poly[i], poly[j + 1] - poly[i + 1]);
  }
  return (round - Math.sqrt(Math.max(0, round * round - 2 * Math.PI * Math.abs(twice)))) / Math.PI;
}

/** Between a seen point and an unseen one: the last seen point before the edge, projected onto `out`. */
function edge(su: number, sv: number, hu: number, hv: number, out: number[]): [number, number] {
  for (let k = 0; k < 10; k++) {
    const mu = (su + hu) / 2, mv = (sv + hv) / 2;
    if (see(mu, mv)) { su = mu; sv = mv; } else { hu = mu; hv = mv; }
  }
  if (see(su, sv)) { out.push(0, 0); project(R, X, Y, Z, out, out.length - 2); }
  return [su, sv];
}

/**
 * Take the spikes off a piece of an eye. Where the eye's outline meets the edge it was cut along at a shallow
 * angle, the piece tapers to a point that is too thin to draw long before it ends. From each of its two
 * corners (point 0 and point `corner`), walk both sides away from the corner and drop the points passed until
 * the sides are `wide` apart. (A blunter corner loses its point too, back to where it is `wide` across: a soft
 * corner.) A piece that is narrower than that all the way is a slit, not a spike, and is left as it is.
 */
export function blunt(poly: number[], corner: number, wide: number): number[] {
  const n = poly.length / 2;
  if (wide <= 0 || n < 3) return poly;
  const gap = (i: number, j: number) => Math.hypot(poly[i * 2] - poly[j * 2], poly[i * 2 + 1] - poly[j * 2 + 1]);
  /** From point p to the stretch of outline between points a and b. */
  const reach = (p: number, a: number, b: number) => {
    const ax = poly[a * 2], ay = poly[a * 2 + 1], ex = poly[b * 2] - ax, ey = poly[b * 2 + 1] - ay;
    const t = Math.max(0, Math.min(1, ((poly[p * 2] - ax) * ex + (poly[p * 2 + 1] - ay) * ey) / (ex * ex + ey * ey || 1)));
    return Math.hypot(poly[p * 2] - ax - t * ex, poly[p * 2 + 1] - ay - t * ey);
  };
  const drop = new Uint8Array(n);
  let dropped = 0;
  for (const tip of [0, corner]) {
    // f steps forward and g steps back from the tip, keeping the two walks level by the distance walked.
    let f = 1, g = 1, ahead = gap(tip, (tip + 1) % n), behind = gap(tip, (tip + n - 1) % n);
    for (;;) {
      if (f + g >= n - 1) return poly;
      const i = (tip + f) % n, j = (tip + n - g) % n;
      // How far apart the sides are here: from the front of each walk to the last step of the other.
      if (Math.min(reach(i, j, (j + 1) % n), reach(j, i, (i + n - 1) % n)) >= wide) break;
      if (ahead <= behind) { ahead += gap(i, (i + 1) % n); f++; } else { behind += gap(j, (j + n - 1) % n); g++; }
    }
    if (f === 1 && g === 1) continue;
    for (let k = 1 - g; k < f; k++) { const at = (tip + n + k) % n; if (!drop[at]) { drop[at] = 1; dropped++; } }
  }
  if (!dropped) return poly;
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (!drop[i]) out.push(poly[i * 2], poly[i * 2 + 1]);
  return out;
}

let seen = new Uint8Array(128);
let screen = new Float64Array(256);

/**
 * The parts of one eye the camera can see, as flat screen polygons [x0, y0, x1, y1, ...] (x right, y down,
 * 1 unit = half the drawing box). `outline` is flat [du, dv, ...] offsets from the eye's centre (cu, cv).
 * Empty when the eye has gone round the edge. With `trim`, the eye also keeps clear of the body's outline and
 * loses any piece too thin to draw.
 */
export function eyePolys(of: Body, rot: Mat3, cu: number, cv: number, outline: ArrayLike<number>, trim?: Trim): Float64Array[] {
  body = of; prep = prepare(of); R = rot;
  fenced = false;
  if (trim) fence(trim.outline, trim.rim);
  const thin = trim ? trim.thin : 0;
  many = prep.pieces.length > 1;
  // The face is on whichever side of the body is turned to the viewer.
  back = R[8] < 0;
  [camX, camY, camZ] = cameraInBody(R);
  const n = outline.length / 2;
  if (seen.length < n) { seen = new Uint8Array(n); screen = new Float64Array(n * 2); }
  let count = 0;
  for (let i = 0; i < n; i++) {
    seen[i] = see(cu + outline[i * 2], cv + outline[i * 2 + 1]) ? 1 : 0;
    if (seen[i]) { project(R, X, Y, Z, screen, i * 2); count++; }
  }
  if (count === 0) return [];
  if (count === n) {
    const whole = screen.slice(0, n * 2);
    return barWidth(whole) >= thin ? [whole] : [];
  }
  const polys: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    let j = (i + 1) % n;
    if (seen[i] || !seen[j]) continue;
    // One run of seen points: in over the edge, along the outline, out over the edge, back along the edge.
    const poly: number[] = [];
    const [inU, inV] = edge(cu + outline[j * 2], cv + outline[j * 2 + 1], cu + outline[i * 2], cv + outline[i * 2 + 1], poly);
    let last = j;
    while (seen[j]) { poly.push(screen[j * 2], screen[j * 2 + 1]); last = j; j = (j + 1) % n; }
    const hidU = cu + outline[j * 2], hidV = cv + outline[j * 2 + 1];
    // The two corners of the piece: point 0, and the point where the outline goes back over the edge.
    const corner = poly.length / 2;
    const [outU, outV] = edge(cu + outline[last * 2], cv + outline[last * 2 + 1], hidU, hidV, poly);
    along(outU, outV, inU, inV, hidU, hidV, poly);
    const width = poly.length >= 6 ? barWidth(poly) : 0;
    if (width < thin) continue;
    // A piece cut along the edge ends where it tapers below twice the thinnest slit: a blunt end, not a spike.
    // Never below more than half its own width, though: a piece that is itself a slit keeps its length.
    const piece = blunt(poly, Math.min(corner, poly.length / 2 - 1), Math.min(2 * thin, width / 2));
    if (piece.length >= 6 && barWidth(piece) >= thin) polys.push(Float64Array.from(piece));
  }
  return polys;
}

/**
 * Follow the edge of what can be seen from (au, av) to (bu, bv), both on it, adding points to `out`. A
 * straight cut would leave a sliver of body between the eye and the body's outline; this hugs the outline.
 * (hu, hv) is any unseen point of the eye, which tells which side of the cut is hidden.
 */
function along(au: number, av: number, bu: number, bv: number, hu: number, hv: number, out: number[]): void {
  const cu = bu - au, cv = bv - av, len = Math.hypot(cu, cv);
  if (len < 1e-4) return;
  // Unit normal of the cut, pointing to the hidden side.
  let nu = -cv / len, nv = cu / len;
  if ((hu - au) * nu + (hv - av) * nv < 0) { nu = -nu; nv = -nv; }
  const steps = Math.min(12, Math.max(2, Math.ceil(len / 0.02)));
  const stride = Math.max(len / 4, 0.01);
  for (let k = 1; k < steps; k++) {
    const u = au + (cu * k) / steps, v = av + (cv * k) / steps;
    // Walk across the cut until seen turns to unseen (or back), then close in on the edge.
    const start = see(u, v), dir = start ? 1 : -1;
    let m = 1;
    while (m <= 4 && see(u + nu * stride * m * dir, v + nv * stride * m * dir) === start) m++;
    if (m > 4) {
      if (!start) continue;
      m = 4;
      if (see(u + nu * stride * m, v + nv * stride * m)) { out.push(0, 0); project(R, X, Y, Z, out, out.length - 2); }
      continue;
    }
    const near = stride * (m - 1) * dir, far = stride * m * dir;
    if (start) edge(u + nu * near, v + nv * near, u + nu * far, v + nv * far, out);
    else edge(u + nu * far, v + nv * far, u + nu * near, v + nv * near, out);
  }
}
