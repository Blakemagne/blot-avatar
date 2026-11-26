import { finishMesh, ROOT_PASSES, type CoatMesh } from './coat-surface';
export { ROOT_PASSES, ROOT_DENSITY, type CoatMesh } from './coat-surface';
import { dotRenderer } from './dot-renderer-registry';
// Ported from open-bot-avatar (MIT): the hair roots, their passes and the level of detail (dom/fluffy/mesh.ts, renderer.ts). The mesh is our own.
//
// A coat's geometry: the body as triangles, and the roots its hairs grow from. A renderer draws the fur over
// these (src/coat/); this file only does the maths, so it runs the same in a node test.
//
// Each piece of a body is the convex hull of its spheres, and such a hull is easy to cover exactly. For a
// direction n, the point of the hull furthest that way (its support point) is c + r n on the sphere that
// reaches furthest in that direction. So every direction of an icosphere becomes a point on the surface with n
// as its normal, and the icosphere's triangles become a closed mesh of the piece. Flat faces and the cone bands
// between spheres come out by themselves, as long triangles between points on different spheres; those are
// split until no edge is longer than MAX_EDGE, and every new point is put back on the hull exactly (the hull's
// nearest point, with its true normal). The pieces are separate closed meshes that overlap, as the pieces do.
//
// Where two pieces meet, their surfaces fold into each other at a crease, and a coat lit and combed by each
// piece's own normals draws the crease as a hard line, light on one side and dark on the other (the flower's
// face did, under its top petal and over its bottom one). Fur fills a seam: so near another piece a vertex's
// normal is eased toward that piece's (SEAM), as the normals of the pieces' smooth union would be, and the pile
// lies on across the seam as a soft fold. Only the normals are eased; the points stay on the hulls.
//
// Units: body units throughout (x right, y UP, z toward the viewer, as in body.ts). Open-bot-avatar measures in
// the viewBox units of its 100-unit box; its numbers come over multiplied by COAT_UNIT.

import type { Body, Piece, Solid } from './body';

/**
 * One of open-bot-avatar's viewBox units in body units. Its box's 8..92 is our -1..1, the same mapping that
 * makes its outlines into bodies (BOX_SCALE in outline/inflate.ts: 42 box units to one body unit), so a coat
 * here is the same coat for the same outline: about 0.0238.
 */
export const COAT_UNIT = 1 / 42;
/**
 * No edge of a coat's mesh is longer than this, body units. The pile is shaded per pixel, so the mesh only has
 * to carry the outline and the normals: 0.06 bends a ball's rim less than a tenth of a pixel at 200 px. At
 * 0.06 the bodies take 4,000 to 33,000 vertices; at 0.04 an earlier build of this took 14,000 to 89,000.
 * (Open-bot-avatar's grid step was 1.05, 0.025 here.)
 */
export const MAX_EDGE = 0.06;
/** The longest hair, body units (open-bot-avatar's 3.8). A root buried deeper than this in another piece is dropped. */
export const STRAND_MAX = 3.8 * COAT_UNIT;
/** The shortest hair (open-bot-avatar's 1.6). */
export const STRAND_MIN = 1.6 * COAT_UNIT;
/** How far the pile stands off the surface at most, body units (open-bot-avatar's 4): room to leave round the body. */
export const PILE_REACH = 4 * COAT_UNIT;
/**
 * How far from another piece a vertex's normal starts turning toward that piece's, body units. At a crease the
 * two meet half way, from either side. About the pile's reach and a quarter: fur from both sides fills the
 * valley. More than STRAND_MAX, so that a vertex buried deeper than this in another piece shows in no pass, and
 * keeps its own normal.
 */
export const SEAM = 0.12;
/** Shells of pile at full detail. */
export const SHELLS = 5;
/**
 * Device pixels per body unit from which a coat is drawn in full (open-bot-avatar's 2.56 per viewBox unit: 128
 * CSS px on a 2x display there). One body unit is half the avatar's size, so this is an avatar of about 108 CSS
 * px on a 2x display, or 215 at 1x.
 */
export const FULL_DETAIL = 2.56 / COAT_UNIT;

/** How many roots the first `passes` passes of `total` roots hold. */
export function rootsIn(total: number, passes: number): number {
  let count = 0;
  for (let pass = 0; pass < passes; pass++) count += Math.max(0, Math.ceil((total - pass) / ROOT_PASSES));
  return count;
}

/**
 * How much of a coat to draw at `pxPerUnit` device pixels per body unit (an avatar `size` CSS px wide on a
 * display of ratio dpr: size * dpr / 2). A small avatar gets fewer shells and a share of its strands
 * (`strandPasses` of ROOT_PASSES), each `strandWidth` times as wide so they cover the same. Open-bot-avatar's
 * ladder, in our units. There is no size below which none is drawn.
 */
export function coatDetail(pxPerUnit: number): { shells: number; strandPasses: number; strandWidth: number } {
  const detail = Math.max(0, Math.min(1, pxPerUnit / FULL_DETAIL));
  // By the root, not in proportion: strands that get much wider show as wisps along the outline.
  const strandPasses = Math.max(ROOT_PASSES / 4, Math.ceil(ROOT_PASSES * Math.sqrt(detail)));
  return { shells: Math.max(2, Math.ceil(SHELLS * detail)), strandPasses, strandWidth: ROOT_PASSES / strandPasses };
}

const meshes = new WeakMap<Solid, CoatMesh>();

/**
 * The coat's mesh and roots for a body: of what is drawn as its outline (Body.outline when it has one, else its
 * pieces). Worked out once per body and kept. The same body always gives the same arrays, value for value.
 */
export function coatMesh(body: Body): CoatMesh {
  if (body.wardrobeHost) return coatMesh(body.wardrobeHost);
  if (body.dotStyle) {
    const fitted = dotRenderer?.dotMesh(body.dotStyle.catalogId ? 'catalog-' + body.id : body.dotStyle.character ?? body.id);
    if (fitted) return fitted;
  }
  const solid: Solid = body.outline ?? body;
  let m = meshes.get(solid);
  if (!m) { m = meshOf(solid); meshes.set(solid, m); }
  return m;
}

// The icospheres: unit directions and their triangles, counter-clockwise seen from outside.

const icos: { dirs: Float64Array; tris: Uint32Array }[] = [];

function icosphere(level: number): { dirs: Float64Array; tris: Uint32Array } {
  if (icos[level]) return icos[level];
  const t = (1 + Math.sqrt(5)) / 2;
  const dirs: number[] = [];
  for (const [x, y, z] of [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]) {
    const l = Math.hypot(x, y, z);
    dirs.push(x / l, y / l, z / l);
  }
  let tris = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  // Outward: the cross product of two edges points the way the corners do.
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i] * 3, tris[i + 1] * 3, tris[i + 2] * 3];
    const ux = dirs[b] - dirs[a], uy = dirs[b + 1] - dirs[a + 1], uz = dirs[b + 2] - dirs[a + 2];
    const vx = dirs[c] - dirs[a], vy = dirs[c + 1] - dirs[a + 1], vz = dirs[c + 2] - dirs[a + 2];
    const out = (uy * vz - uz * vy) * dirs[a] + (uz * vx - ux * vz) * dirs[a + 1] + (ux * vy - uy * vx) * dirs[a + 2];
    if (out < 0) { const k = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = k; }
  }
  for (let l = 0; l < level; l++) {
    const mids = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      let m = mids.get(key);
      if (m === undefined) {
        const x = dirs[a * 3] + dirs[b * 3], y = dirs[a * 3 + 1] + dirs[b * 3 + 1], z = dirs[a * 3 + 2] + dirs[b * 3 + 2], len = Math.hypot(x, y, z);
        m = dirs.length / 3;
        dirs.push(x / len, y / len, z / len);
        mids.set(key, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    tris = next;
  }
  icos[level] = { dirs: Float64Array.from(dirs), tris: Uint32Array.from(tris) };
  return icos[level];
}

/** The angle along one edge of the level-0 icosphere, radians; each level halves it. */
const ICO_EDGE = 1.0515;

// A piece, ready for the support map, the nearest point and the depth of a point inside it.

interface Hull {
  /** Spheres, flat: x, y, z, r. */
  s: Float64Array;
  n: number;
  /** Pairs of spheres with a cone band between them on the hull: i, j. */
  pairs: number[];
  /** Flat faces of the hull: normal x, y, z, plane offset d, then the three points where it touches its spheres. */
  faces: number[];
  /** A ball that holds the piece: x, y, z, r. */
  ball: [number, number, number, number];
}

function hullOf(piece: Piece): Hull {
  const n = piece.length, s = new Float64Array(n * 4);
  piece.forEach((sp, i) => s.set(sp, i * 4));
  const pairs: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (band(s, i, j)) pairs.push(i, j);
  const faces: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) touching(s, i, j, k, faces);
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += s[i * 4] / n; my += s[i * 4 + 1] / n; mz += s[i * 4 + 2] / n; }
  let br = 0;
  for (let i = 0; i < n; i++) br = Math.max(br, Math.hypot(s[i * 4] - mx, s[i * 4 + 1] - my, s[i * 4 + 2] - mz) + s[i * 4 + 3]);
  return { s, n, pairs, faces, ball: [mx, my, mz, br] };
}

/**
 * Is there a cone band between spheres i and j on the hull: a direction in which the two reach equally far and
 * no other sphere further? Those directions are a circle, n . u = beta; each other sphere k leaves an arc of it
 * where it does not reach further. If the arcs have a point in common, one of them starts there.
 */
function band(s: Float64Array, i: number, j: number): boolean {
  const a = i * 4, b = j * 4;
  let ux = s[a] - s[b], uy = s[a + 1] - s[b + 1], uz = s[a + 2] - s[b + 2];
  const E = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const beta = (s[b + 3] - s[a + 3]) / E;
  if (E < 1e-12 || Math.abs(beta) >= 1) return false;
  ux /= E; uy /= E; uz /= E;
  // Two unit vectors square to u, and the circle: n(phi) = beta u + side (cos phi p + sin phi q).
  let px = -uy, py = ux, pz = 0;
  if (Math.abs(uz) > 0.9) { px = 0; py = -uz; pz = uy; }
  const pl = Math.sqrt(px * px + py * py + pz * pz);
  px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const side = Math.sqrt(1 - beta * beta);
  // Sphere k reaches no further than i where n . (ci - ck) >= rk - ri: P cos phi + Q sin phi >= G.
  const starts: number[] = [], arcs: number[] = [];
  for (let k = 0; k < s.length; k += 4) {
    if (k === a || k === b) continue;
    const wx = s[a] - s[k], wy = s[a + 1] - s[k + 1], wz = s[a + 2] - s[k + 2];
    const P = side * (px * wx + py * wy + pz * wz), Q = side * (qx * wx + qy * wy + qz * wz);
    const G = s[k + 3] - s[a + 3] - beta * (ux * wx + uy * wy + uz * wz), R = Math.sqrt(P * P + Q * Q);
    if (R < 1e-12) { if (G > 1e-9) return false; continue; }
    const c = G / R;
    if (c > 1 + 1e-9) return false;
    if (c <= -1) continue;
    const mid = Math.atan2(Q, P), half = Math.acos(Math.min(1, c));
    starts.push(mid - half);
    arcs.push(P, Q, G);
  }
  if (!starts.length) return true;
  for (const phi of starts) {
    const cs = Math.cos(phi), sn = Math.sin(phi);
    let all = true;
    for (let m = 0; m < arcs.length && all; m += 3) if (arcs[m] * cs + arcs[m + 1] * sn < arcs[m + 2] - 1e-9) all = false;
    if (all) return true;
  }
  return false;
}

/** The planes that touch spheres i, j and k from outside and that every other sphere is behind: flat faces of the hull. */
function touching(s: Float64Array, i: number, j: number, k: number, out: number[]): void {
  const a = i * 4, b = j * 4, c = k * 4;
  const ux = s[b] - s[a], uy = s[b + 1] - s[a + 1], uz = s[b + 2] - s[a + 2];
  const vx = s[c] - s[a], vy = s[c + 1] - s[a + 1], vz = s[c + 2] - s[a + 2];
  const uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz, uv = ux * vx + uy * vy + uz * vz;
  const det = uu * vv - uv * uv;
  if (det < 1e-12) return;
  // n = s u + t v + h w, with n . u = ra - rb and n . v = ra - rc, and w the unit normal of the centres' plane (as body.ts).
  const e = s[a + 3] - s[b + 3], f = s[a + 3] - s[c + 3];
  const p = (e * vv - f * uv) / det, q = (f * uu - e * uv) / det;
  const px = p * ux + q * vx, py = p * uy + q * vy, pz = p * uz + q * vz;
  const m2 = px * px + py * py + pz * pz;
  if (m2 >= 1) return;
  let wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
  const wl = Math.hypot(wx, wy, wz);
  wx /= wl; wy /= wl; wz /= wl;
  const h = Math.sqrt(1 - m2);
  for (const sign of [1, -1]) {
    const nx = px + sign * h * wx, ny = py + sign * h * wy, nz = pz + sign * h * wz;
    const d = nx * s[a] + ny * s[a + 1] + nz * s[a + 2] + s[a + 3];
    let face = true;
    for (let l = 0; l < s.length && face; l += 4) if (nx * s[l] + ny * s[l + 1] + nz * s[l + 2] + s[l + 3] > d + 1e-9) face = false;
    if (!face) continue;
    out.push(nx, ny, nz, d);
    for (const o of [a, b, c]) out.push(s[o] + s[o + 3] * nx, s[o + 1] + s[o + 3] * ny, s[o + 2] + s[o + 3] * nz);
  }
}

/** The sphere that reaches furthest in direction n. */
function support(hull: Hull, nx: number, ny: number, nz: number): number {
  const { s, n } = hull;
  let best = -Infinity, k = 0;
  for (let i = 0; i < n; i++) {
    const v = nx * s[i * 4] + ny * s[i * 4 + 1] + nz * s[i * 4 + 2] + s[i * 4 + 3];
    if (v > best) { best = v; k = i; }
  }
  return k;
}

/** How far the hull reaches in direction n (its support function). */
function reach(hull: Hull, nx: number, ny: number, nz: number): number {
  const k = support(hull, nx, ny, nz), s = hull.s;
  return nx * s[k * 4] + ny * s[k * 4 + 1] + nz * s[k * 4 + 2] + s[k * 4 + 3];
}

/**
 * A point of the surface: position, unit normal, and the patch it is on: sphere k is k, the band of pair p
 * (its index in Hull.pairs, halved) is n + p, flat face f (its index in Hull.faces / 13) is n + pairs + f, and
 * -1 is not known.
 */
interface Spot { x: number; y: number; z: number; nx: number; ny: number; nz: number; on: number }

/** The nearest point to q on the hull of one pair of spheres, between the two (Infinity when it is at an end). */
function onPair(s: Float64Array, a: number, b: number, qx: number, qy: number, qz: number, out: Spot): number {
  // The pair's hull is every ball c(t) = ci + t e, r(t) = ri + t rho; the distance to ball t is convex in t.
  const ex = s[b] - s[a], ey = s[b + 1] - s[a + 1], ez = s[b + 2] - s[a + 2], rho = s[b + 3] - s[a + 3];
  const wx = qx - s[a], wy = qy - s[a + 1], wz = qz - s[a + 2];
  const A = ex * ex + ey * ey + ez * ez, B = wx * ex + wy * ey + wz * ez, C = wx * wx + wy * wy + wz * wz;
  const K = Math.max(0, A * C - B * B);
  const t = (B + rho * Math.sqrt(K / (A - rho * rho))) / A;
  if (t <= 0 || t >= 1) return Infinity;
  const vx = wx - t * ex, vy = wy - t * ey, vz = wz - t * ez, l = Math.sqrt(vx * vx + vy * vy + vz * vz), r = s[a + 3] + t * rho;
  if (l < 1e-12) return Infinity;
  out.nx = vx / l; out.ny = vy / l; out.nz = vz / l;
  out.x = s[a] + t * ex + r * out.nx; out.y = s[a + 1] + t * ey + r * out.ny; out.z = s[a + 2] + t * ez + r * out.nz;
  return l - r;
}

/**
 * The point of the hull nearest to q, a point outside it, and the hull's normal there. Every sphere, the hull
 * of every pair and every flat face is part of the hull, and the hull's surface is made of their surfaces, so
 * the nearest of their nearest points is the hull's. False when q is not outside.
 */
function nearest(hull: Hull, qx: number, qy: number, qz: number, out: Spot): boolean {
  const { s, n, pairs, faces } = hull;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const vx = qx - s[i * 4], vy = qy - s[i * 4 + 1], vz = qz - s[i * 4 + 2], l = Math.sqrt(vx * vx + vy * vy + vz * vz), r = s[i * 4 + 3];
    if (l - r < best && l > 1e-12) {
      best = l - r;
      out.nx = vx / l; out.ny = vy / l; out.nz = vz / l;
      out.x = s[i * 4] + r * out.nx; out.y = s[i * 4 + 1] + r * out.ny; out.z = s[i * 4 + 2] + r * out.nz; out.on = i;
    }
  }
  for (let p = 0; p < pairs.length; p += 2) {
    const d = onPair(s, pairs[p] * 4, pairs[p + 1] * 4, qx, qy, qz, pair);
    if (d < best) { best = d; out.x = pair.x; out.y = pair.y; out.z = pair.z; out.nx = pair.nx; out.ny = pair.ny; out.nz = pair.nz; out.on = n + p / 2; }
  }
  for (let f = 0; f < faces.length; f += 13) {
    const nx = faces[f], ny = faces[f + 1], nz = faces[f + 2], h = nx * qx + ny * qy + nz * qz - faces[f + 3];
    if (h <= 0 || h >= best) continue;
    const px = qx - h * nx, py = qy - h * ny, pz = qz - h * nz;
    let pos = 0, neg = 0;
    for (let e = 0; e < 3; e++) {
      const o = f + 4 + e * 3, o2 = f + 4 + ((e + 1) % 3) * 3;
      const ax = faces[o], ay = faces[o + 1], az = faces[o + 2];
      const ux = faces[o2] - ax, uy = faces[o2 + 1] - ay, uz = faces[o2 + 2] - az, vx = px - ax, vy = py - ay, vz = pz - az;
      const side = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
      if (side > 1e-12) pos++; else if (side < -1e-12) neg++;
    }
    if (pos && neg) continue;
    best = h;
    out.x = px; out.y = py; out.z = pz; out.nx = nx; out.ny = ny; out.nz = nz; out.on = n + pairs.length / 2 + f / 13;
  }
  return best > 1e-9 && best < Infinity;
}

const pair: Spot = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, on: -1 };

/**
 * The point of the hull's surface nearest to p, a point inside it, and the normal there: p moved out by its
 * depth along the direction that gives the least reach(n) - n . p (see `deeper` for why the candidates below
 * hold it). Patch: a sphere when the direction is one sphere's, a flat face's, or -1. False when p is outside.
 */
function inner(hull: Hull, px: number, py: number, pz: number, out: Spot): boolean {
  const { s, n, pairs, faces } = hull;
  let best = Infinity, bx = 0, by = 0, bz = 0, on = -1;
  for (let i = 0; i < n; i++) {
    const vx = px - s[i * 4], vy = py - s[i * 4 + 1], vz = pz - s[i * 4 + 2], l = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (l < 1e-12) continue;
    const k = support(hull, vx / l, vy / l, vz / l);
    const g = (vx * s[k * 4] + vy * s[k * 4 + 1] + vz * s[k * 4 + 2] - (vx * px + vy * py + vz * pz)) / l + s[k * 4 + 3];
    if (g < best) { best = g; bx = vx / l; by = vy / l; bz = vz / l; on = k; }
  }
  for (let f = 0; f < faces.length; f += 13) {
    const g = faces[f + 3] - (faces[f] * px + faces[f + 1] * py + faces[f + 2] * pz);
    if (g < best) { best = g; bx = faces[f]; by = faces[f + 1]; bz = faces[f + 2]; on = n + pairs.length / 2 + f / 13; }
  }
  for (let p = 0; p < pairs.length; p += 2) {
    const a = pairs[p] * 4, b = pairs[p + 1] * 4;
    let ux = s[a] - s[b], uy = s[a + 1] - s[b + 1], uz = s[a + 2] - s[b + 2];
    const E = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= E; uy /= E; uz /= E;
    const beta = (s[b + 3] - s[a + 3]) / E;
    const vx = s[a] - px, vy = s[a + 1] - py, vz = s[a + 2] - pz, vu = vx * ux + vy * uy + vz * uz;
    const qx = vx - vu * ux, qy = vy - vu * uy, qz = vz - vu * uz, ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (ql < 1e-12) continue;
    const side = Math.sqrt(Math.max(0, 1 - beta * beta));
    const nx = beta * ux - (side * qx) / ql, ny = beta * uy - (side * qy) / ql, nz = beta * uz - (side * qz) / ql;
    const g = reach(hull, nx, ny, nz) - (nx * px + ny * py + nz * pz);
    if (g < best) { best = g; bx = nx; by = ny; bz = nz; on = -1; }
  }
  if (!(best >= -1e-12 && best < Infinity)) return false;
  out.x = px + best * bx; out.y = py + best * by; out.z = pz + best * bz; out.nx = bx; out.ny = by; out.nz = bz; out.on = on;
  return true;
}

/**
 * Is p more than `limit` deep inside the hull? Its depth is the least over directions n of reach(n) - n . p.
 * That least is at a direction from a sphere's centre through p, at a flat face's normal, or on the arc of
 * directions where a pair of spheres reach equally far. Every direction gives an upper bound, so p is that
 * deep only if none of them is under the limit, and the first that is answers no. (`n` is a direction to try
 * first: the root's own normal, which mostly answers at once.)
 */
function deeper(hull: Hull, px: number, py: number, pz: number, limit: number, hx: number, hy: number, hz: number): boolean {
  const { s, n, pairs, faces } = hull;
  if (reach(hull, hx, hy, hz) - (hx * px + hy * py + hz * pz) <= limit) return false;
  for (let i = 0; i < n; i++) {
    const vx = px - s[i * 4], vy = py - s[i * 4 + 1], vz = pz - s[i * 4 + 2], l = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (l > 1e-12 && reach(hull, vx / l, vy / l, vz / l) - (vx * px + vy * py + vz * pz) / l <= limit) return false;
  }
  for (let f = 0; f < faces.length; f += 13) if (faces[f + 3] - (faces[f] * px + faces[f + 1] * py + faces[f + 2] * pz) <= limit) return false;
  for (let p = 0; p < pairs.length; p += 2) {
    // Both spheres reach equally far where n . u = beta, u from j's centre to i's: a circle of directions.
    // On it, n . (ci - p) is least at the direction below.
    const a = pairs[p] * 4, b = pairs[p + 1] * 4;
    let ux = s[a] - s[b], uy = s[a + 1] - s[b + 1], uz = s[a + 2] - s[b + 2];
    const E = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= E; uy /= E; uz /= E;
    const beta = (s[b + 3] - s[a + 3]) / E;
    const vx = s[a] - px, vy = s[a + 1] - py, vz = s[a + 2] - pz, vu = vx * ux + vy * uy + vz * uz;
    const qx = vx - vu * ux, qy = vy - vu * uy, qz = vz - vu * uz, ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (ql < 1e-12) continue;
    const side = Math.sqrt(Math.max(0, 1 - beta * beta));
    const nx = beta * ux - (side * qx) / ql, ny = beta * uy - (side * qy) / ql, nz = beta * uz - (side * qz) / ql;
    if (reach(hull, nx, ny, nz) - (nx * px + ny * py + nz * pz) <= limit) return false;
  }
  return true;
}

/** Seeded, so a body always grows the same coat (open-bot-avatar's generator and seed). */

/** One piece as a closed mesh: positions and normals (6 per vertex) and triangles. */
function pieceMesh(hull: Hull): { v: number[]; t: number[] } {
  const { s, n, pairs, faces } = hull, bands = n + pairs.length / 2;
  let rmax = 0;
  for (let i = 0; i < n; i++) rmax = Math.max(rmax, s[i * 4 + 3]);
  // Fine enough that an arc of the largest sphere needs splitting about once.
  const level = Math.max(1, Math.min(5, Math.ceil(Math.log2((ICO_EDGE * rmax) / (2 * MAX_EDGE)))));
  const ico = icosphere(level);
  const v: number[] = [], on: number[] = [];
  for (let i = 0; i < ico.dirs.length; i += 3) {
    const nx = ico.dirs[i], ny = ico.dirs[i + 1], nz = ico.dirs[i + 2], k = support(hull, nx, ny, nz);
    v.push(s[k * 4] + s[k * 4 + 3] * nx, s[k * 4 + 1] + s[k * 4 + 3] * ny, s[k * 4 + 2] + s[k * 4 + 3] * nz, nx, ny, nz);
    on.push(k);
  }
  const spot: Spot = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, on: -1 };
  const mids = new Map<number, number>();
  /** The point between vertices a and b, on the hull. */
  const mid = (a: number, b: number): number => {
    const key = a < b ? a * 16777216 + b : b * 16777216 + a;
    let m = mids.get(key);
    if (m !== undefined) return m;
    const A = a * 6, B = b * 6;
    let nx = v[A + 3] + v[B + 3], ny = v[A + 4] + v[B + 4], nz = v[A + 5] + v[B + 5];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    m = on.length;
    const k = on[a], same = k >= 0 && k === on[b];
    const mx = (v[A] + v[B]) / 2, my = (v[A + 1] + v[B + 1]) / 2, mz = (v[A + 2] + v[B + 2]) / 2;
    const out = 0.5 * Math.sqrt((v[A] - v[B]) ** 2 + (v[A + 1] - v[B + 1]) ** 2 + (v[A + 2] - v[B + 2]) ** 2) + 0.01;
    if (same && k < n && support(hull, nx, ny, nz) === k) {
      // Both on one sphere, and so is the direction between them: its support point.
      v.push(s[k * 4] + s[k * 4 + 3] * nx, s[k * 4 + 1] + s[k * 4 + 3] * ny, s[k * 4 + 2] + s[k * 4 + 3] * nz, nx, ny, nz);
      on.push(k);
    } else if (same && k >= bands) {
      // Both on one flat face: the midpoint is on it too.
      const f = (k - bands) * 13;
      v.push(mx, my, mz, faces[f], faces[f + 1], faces[f + 2]);
      on.push(k);
    } else if (inner(hull, mx, my, mz, spot) || nearest(hull, mx + out * nx, my + out * ny, mz + out * nz, spot)) {
      // Across a band, or from one patch to another: the midpoint is inside the hull (it is convex), so out to
      // the nearest point of the surface. (Or, a midpoint a hair outside it, back from a little way off.)
      v.push(spot.x, spot.y, spot.z, spot.nx, spot.ny, spot.nz);
      on.push(spot.on);
    } else {
      v.push(mx, my, mz, nx, ny, nz);
      on.push(-1);
    }
    mids.set(key, m);
    return m;
  };
  const long = (a: number, b: number): boolean => {
    const dx = v[a * 6] - v[b * 6], dy = v[a * 6 + 1] - v[b * 6 + 1], dz = v[a * 6 + 2] - v[b * 6 + 2];
    return dx * dx + dy * dy + dz * dz > MAX_EDGE * MAX_EDGE;
  };
  const d2 = (a: number, b: number): number => (v[a * 6] - v[b * 6]) ** 2 + (v[a * 6 + 1] - v[b * 6 + 1]) ** 2 + (v[a * 6 + 2] - v[b * 6 + 2]) ** 2;
  let t = Array.from(ico.tris);
  // (A coarse triangle across a thin face can come out facing in; set it right before it is split into many.)
  unfold(v, t);
  // Split every long edge (decided by the edge alone, so both its triangles agree), until none is left.
  for (let pass = 0; pass < 24; pass++) {
    const next: number[] = [];
    let split = false;
    for (let i = 0; i < t.length; i += 3) {
      const c0 = t[i], c1 = t[i + 1], c2 = t[i + 2];
      const f0 = long(c0, c1), f1 = long(c1, c2), f2 = long(c2, c0), count = +f0 + +f1 + +f2;
      if (count === 0) { next.push(c0, c1, c2); continue; }
      split = true;
      if (count === 3) {
        const m0 = mid(c0, c1), m1 = mid(c1, c2), m2 = mid(c2, c0);
        next.push(c0, m0, m2, m0, c1, m1, m2, m1, c2, m0, m1, m2);
        continue;
      }
      // Turned so that the corners are a, b, c with the long edge(s) a-b (and b-c).
      let a = c0, b = c1, c = c2;
      if (count === 1) {
        if (f1) [a, b, c] = [c1, c2, c0];
        else if (f2) [a, b, c] = [c2, c0, c1];
        const m = mid(a, b);
        next.push(a, m, c, m, b, c);
      } else {
        if (!f0) [a, b, c] = [c1, c2, c0];
        else if (!f1) [a, b, c] = [c2, c0, c1];
        const mab = mid(a, b), mbc = mid(b, c);
        next.push(mab, b, mbc);
        if (d2(a, mbc) < d2(mab, c)) next.push(a, mab, mbc, a, mbc, c);
        else next.push(a, mab, c, mab, mbc, c);
      }
    }
    t = next;
    if (!split) break;
  }
  unfold(v, t);
  return { v, t };
}

/** Is triangle a, b, c wound counter-clockwise seen from the side its corners' normals point to? */
function outward(v: number[], a: number, b: number, c: number): boolean {
  const A = a * 6, B = b * 6, C = c * 6;
  const ux = v[B] - v[A], uy = v[B + 1] - v[A + 1], uz = v[B + 2] - v[A + 2], wx = v[C] - v[A], wy = v[C + 1] - v[A + 1], wz = v[C + 2] - v[A + 2];
  return (uy * wz - uz * wy) * (v[A + 3] + v[B + 3] + v[C + 3]) + (uz * wx - ux * wz) * (v[A + 4] + v[B + 4] + v[C + 4]) + (ux * wy - uy * wx) * (v[A + 5] + v[B + 5] + v[C + 5]) > 0;
}

/**
 * Splitting a long thin triangle across a cone band can leave a sliver whose corners, put back on the hull,
 * have crossed over: it faces in. Swap the edge it shares with a neighbour for the quad's other diagonal when
 * both new triangles face out. The mesh stays closed: only which pair of corners an edge joins changes.
 */
function unfold(v: number[], t: number[]): void {
  const key = (a: number, b: number): number => a * 16777216 + b;
  /** Each edge, a to b as wound, to its triangle's first index in t. */
  const edges = new Map<number, number>();
  for (let i = 0; i < t.length; i += 3) for (let e = 0; e < 3; e++) edges.set(key(t[i + e], t[i + ((e + 1) % 3)]), i);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < t.length; i += 3) {
      if (outward(v, t[i], t[i + 1], t[i + 2])) continue;
      for (let e = 0; e < 3; e++) {
        const a = t[i + e], b = t[i + ((e + 1) % 3)], c = t[i + ((e + 2) % 3)];
        const j = edges.get(key(b, a));
        if (j === undefined) continue;
        const d = t[j] !== a && t[j] !== b ? t[j] : t[j + 1] !== a && t[j + 1] !== b ? t[j + 1] : t[j + 2];
        if (edges.has(key(c, d)) || edges.has(key(d, c)) || !outward(v, a, d, c) || !outward(v, d, b, c)) continue;
        // a, b, c and b, a, d become a, d, c and d, b, c.
        for (const k of [i, j]) for (let f = 0; f < 3; f++) edges.delete(key(t[k + f], t[k + ((f + 1) % 3)]));
        t[i] = a; t[i + 1] = d; t[i + 2] = c;
        t[j] = d; t[j + 1] = b; t[j + 2] = c;
        for (const k of [i, j]) for (let f = 0; f < 3; f++) edges.set(key(t[k + f], t[k + ((f + 1) % 3)]), k);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
}

/**
 * A solid's coat, made anew (coatMesh keeps one per body: use that). `seam` is how far the normals are eased
 * near another piece; at 0 every vertex keeps its own piece's normal, which is how the tests check the hulls.
 */
export function meshOf(solid: Solid, seam = SEAM): CoatMesh {
  const hulls = solid.pieces.map(hullOf);
  const verts: number[] = [], idx: number[] = [];
  /** Where each piece's triangles start in idx, and their count. */
  const spans: [number, number][] = [];
  for (const hull of hulls) {
    const { v, t } = pieceMesh(hull);
    const base = verts.length / 6;
    spans.push([idx.length, t.length]);
    for (const x of v) verts.push(x);
    for (const i of t) idx.push(i + base);
  }
  // Each vertex among the other pieces (seamAt): its normal eased near them, and which one, if any, it is
  // buried in deeper than the longest hair. Depth inside a convex piece is least at a triangle's corners, so a
  // triangle with all three buried in one piece grows nothing.
  const owner = new Int32Array(verts.length / 6);
  spans.forEach(([start, count], piece) => { for (let i = start; i < start + count; i++) owner[idx[i]] = piece; });
  const sunk = new Int32Array(verts.length / 6).fill(-1);
  if (hulls.length > 1) for (let i = 0; i < sunk.length; i++) sunk[i] = seamAt(hulls, owner[i], verts, i * 6, seam);
  return finishMesh(verts, idx,
    i => sunk[idx[i]] >= 0 && sunk[idx[i]] === sunk[idx[i + 1]] && sunk[idx[i]] === sunk[idx[i + 2]],
    hulls.length > 1 ? (i, x, y, z, nx, ny, nz) => buriedIn(hulls, owner[idx[i]], x, y, z, nx, ny, nz) >= 0 : undefined,
  );
}

/** 1 at 0, 0 from 1, smoothly (flat at both ends). */
const ease = (t: number): number => (t <= 0 ? 1 : t >= 1 ? 0 : (1 - t) * (1 - t) * (1 + 2 * t));

/** seamAt's: each piece near the vertex, as its distance and its normal there (d, x, y, z); and a point found. */
const near: number[] = [];
const found: Spot = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, on: -1 };

/**
 * The vertex at v[o] (position, normal) of piece `own`, among the other pieces: its normal eased toward theirs
 * within `seam` of them, in place; and the piece other than its own that it is deeper than STRAND_MAX inside, or
 * -1 (the first, as buriedIn finds it).
 *
 * Each piece's distance d from p (less than 0 inside it) and its normal at the point nearest p are the value and
 * the gradient of its distance field. The eased normal is the normals of the pieces near p weighted by
 * ease((d - least) / seam), least being the least d (0, p's own piece, unless p is inside another): the gradient
 * of a smooth union of the pieces. Far from the others it is p's own normal; at a crease, where p's own piece
 * and another both have d = 0, it is half way between the two, from either side. A vertex deeper than `seam` in
 * another piece shows in no pass, and keeps its own.
 */
function seamAt(hulls: Hull[], own: number, v: number[], o: number, seam: number): number {
  const px = v[o], py = v[o + 1], pz = v[o + 2], deep = Math.max(seam, STRAND_MAX);
  let sunk = -1, least = 0;
  near.length = 0;
  for (let q = 0; q < hulls.length; q++) {
    if (q === own) continue;
    const hull = hulls[q], s = hull.s, [bx, by, bz, br] = hull.ball;
    if ((px - bx) ** 2 + (py - by) ** 2 + (pz - bz) ** 2 >= (br + seam) ** 2) continue;
    // The sphere whose surface p is nearest. Deep inside it, p is deep inside q. Well in front of the plane q
    // reaches to in the direction from its centre, p is well outside q.
    let e = Infinity, k = 0, l = 0;
    for (let j = 0; j < hull.n; j++) {
      const vx = px - s[j * 4], vy = py - s[j * 4 + 1], vz = pz - s[j * 4 + 2], lj = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (lj - s[j * 4 + 3] < e) { e = lj - s[j * 4 + 3]; k = j; l = lj; }
    }
    let d = e;
    if (e >= -deep) {
      if (l > 1e-12) {
        const ux = (px - s[k * 4]) / l, uy = (py - s[k * 4 + 1]) / l, uz = (pz - s[k * 4 + 2]) / l;
        if (ux * px + uy * py + uz * pz - reach(hull, ux, uy, uz) >= seam) continue;
      }
      // Outside q, the nearest point (nearest() takes p to be outside: so it is, if p is in front of the plane
      // q reaches to there; and it is not, if p is in one of q's spheres). Inside, the nearest point of the surface.
      if (e > 1e-9 && nearest(hull, px, py, pz, found) && found.nx * px + found.ny * py + found.nz * pz - reach(hull, found.nx, found.ny, found.nz) > 1e-9) {
        d = Math.hypot(found.x - px, found.y - py, found.z - pz);
      } else if (inner(hull, px, py, pz, found)) d = -Math.hypot(found.x - px, found.y - py, found.z - pz);
      else continue;
    }
    if (d < -STRAND_MAX && sunk < 0) sunk = q;
    if (d < -deep) return sunk;
    if (d < seam) {
      near.push(d, found.nx, found.ny, found.nz);
      least = Math.min(least, d);
    }
  }
  if (!near.length || seam <= 0) return sunk;
  const w = ease(-least / seam);
  let nx = w * v[o + 3], ny = w * v[o + 4], nz = w * v[o + 5];
  for (let i = 0; i < near.length; i += 4) {
    const wi = ease((near[i] - least) / seam);
    nx += wi * near[i + 1]; ny += wi * near[i + 2]; nz += wi * near[i + 3];
  }
  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-9) { v[o + 3] = nx / len; v[o + 4] = ny / len; v[o + 5] = nz / len; }
  return sunk;
}

/** The piece other than its own that p is deeper than STRAND_MAX inside, or -1. (n: p's normal, tried first.) */
function buriedIn(hulls: Hull[], own: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
  for (let q = 0; q < hulls.length; q++) {
    if (q === own) continue;
    const [bx, by, bz, br] = hulls[q].ball;
    if ((px - bx) ** 2 + (py - by) ** 2 + (pz - bz) ** 2 > (br - STRAND_MAX) ** 2) continue;
    if (deeper(hulls[q], px, py, pz, STRAND_MAX, nx, ny, nz)) return q;
  }
  return -1;
}
