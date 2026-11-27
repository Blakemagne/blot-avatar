// A body from an outline: an avatar definition (one SVG path and its eyes) made into the engine's body, so it
// turns, leans, morphs and wears every face the way the built-in shapes do.
//
// The outline is blown up like a balloon. Every point inside it gets the largest disc round it that stays in
// the outline; the discs whose middles run along the outline's spine (its medial axis) are kept, and each
// becomes a sphere as thick as the disc is wide, in the body's middle plane. So a round part is a ball, a
// long part a tube, a corner a point, and a hole stays open. Spheres that can be hulled together without
// the hull leaving the outline become one convex piece, which is what a body is made of. Front on, the
// pieces cover the outline to within a fraction of a unit; turned, it has a body as deep as it is wide.
//
// It is worked out once per definition (a few tens of milliseconds) and kept.

import type { Body, EyeSpec, Piece, Sphere } from '../body';
import { eyeShapes } from '../draw';
import { ACTIVITY_FACES, FACES } from '../faces';
import { LOOK_PITCH, LOOK_YAW, type RigState } from '../rig';
import { EYE_H, EYE_W, type AvatarDefinition, type AvatarEyes } from './definition';
import { bounds, flattenPath, insideRow, isInside, parsePath, type Point } from './path';

/**
 * How far a look may turn one of these bodies (see Body.look), most first: the first at which both eyes still
 * show, held in a look any way at 64 px. A face set off to one side of a round part goes round its rim soonest.
 */
const LOOKS = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
/** Box units to body units: the box's 8..92 is the body's -1..1. */
export const BOX_SCALE = 42;
/** The grid the outline is measured on, box units. */
const CELL = 0.5;
/** How far a piece may reach past the outline, box units: a hull of discs cuts across a curve a little. */
const SPILL = 0.45;
/** The smallest sphere: corners sharper than this are rounded. */
const LEAST = 1.1;
/** Spine discs lie at least this share of their radius apart. */
const GAP = 0.3;
/** How many spheres one piece may hold. */
const MOST = 14;
/** Eyes are drawn up to this much bigger than the definition's size, where the face has room (as open-bot-avatar does). */
const EYE_BOOST = 1.45;
/** The smallest eye's height, body units. */
const LEAST_EYE = 0.42;
/** An eye's width for its height, as the built-in shapes' eyes are. */
const ASPECT = 0.52;
/** The gap between the eyes, as a share of one eye's width, that a bigger eye must leave. */
const APART = 0.75;
/** Room each eye keeps from the outline, box units, as it grows and as it slides to look. */
const EYE_ROOM = 2.5;

interface Grid {
  x0: number; y0: number; cols: number; rows: number;
  /** Signed distance to the outline: positive inside. */
  sd: Float64Array;
  /** The nearest point of the outline. */
  fx: Float64Array; fy: Float64Array;
}

/** Distance from (x, y) to the outline's edges, and the nearest point on them. */
function nearest(edges: Float64Array, x: number, y: number, out: { d: number; x: number; y: number }): void {
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < edges.length; i += 4) {
    const ax = edges[i], ay = edges[i + 1], ex = edges[i + 2] - ax, ey = edges[i + 3] - ay;
    const len = ex * ex + ey * ey;
    let t = len > 0 ? ((x - ax) * ex + (y - ay) * ey) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * ex, py = ay + t * ey, d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) { best = d; bx = px; by = py; }
  }
  out.d = Math.sqrt(best); out.x = bx; out.y = by;
}

/**
 * The outline's own edges: the parts of the subpaths' edges with fill on one side only. Where two subpaths
 * overlap (an ear over a head) the edges inside both are not outline, and a disc may run across them.
 */
function edgesOf(polys: Point[][]): Float64Array {
  const out: number[] = [];
  const side = 0.04;
  for (const p of polys) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [ax, ay] = p[j], [bx, by] = p[i], len = Math.hypot(bx - ax, by - ay);
      if (len === 0) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, steps = Math.max(1, Math.ceil(len / 0.5));
      let from = -1;
      for (let s = 0; s <= steps; s++) {
        let keep = false;
        if (s < steps) {
          const mx = ax + ((bx - ax) * (s + 0.5)) / steps, my = ay + ((by - ay) * (s + 0.5)) / steps;
          keep = isInside(polys, mx + nx * side, my + ny * side) !== isInside(polys, mx - nx * side, my - ny * side);
        }
        if (keep && from < 0) from = s;
        if (!keep && from >= 0) {
          out.push(ax + ((bx - ax) * from) / steps, ay + ((by - ay) * from) / steps, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
          from = -1;
        }
      }
    }
  }
  return Float64Array.from(out);
}

function measure(polys: Point[][], edges: Float64Array): Grid {
  const b = bounds(polys), pad = 2;
  const x0 = Math.floor(b.minX) - pad, y0 = Math.floor(b.minY) - pad;
  const cols = Math.ceil((b.maxX + pad - x0) / CELL), rows = Math.ceil((b.maxY + pad - y0) / CELL);
  const n = cols * rows, sd = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n);
  const xs = Array.from({ length: cols }, (_, i) => x0 + (i + 0.5) * CELL), row = new Uint8Array(cols), hit = { d: 0, x: 0, y: 0 };
  for (let j = 0; j < rows; j++) {
    const y = y0 + (j + 0.5) * CELL;
    insideRow(polys, y, xs, row);
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      nearest(edges, xs[i], y, hit);
      sd[k] = row[i] ? hit.d : -hit.d; fx[k] = hit.x; fy[k] = hit.y;
    }
  }
  return { x0, y0, cols, rows, sd, fx, fy };
}

/** The signed distance at a point, read off the grid (bilinear). */
function sdAt(g: Grid, x: number, y: number): number {
  const gx = (x - g.x0) / CELL - 0.5, gy = (y - g.y0) / CELL - 0.5;
  const i = Math.max(0, Math.min(g.cols - 2, Math.floor(gx))), j = Math.max(0, Math.min(g.rows - 2, Math.floor(gy)));
  const tx = Math.max(0, Math.min(1, gx - i)), ty = Math.max(0, Math.min(1, gy - j)), k = j * g.cols + i;
  return (g.sd[k] * (1 - tx) + g.sd[k + 1] * tx) * (1 - ty) + (g.sd[k + g.cols] * (1 - tx) + g.sd[k + g.cols + 1] * tx) * ty;
}

/** A disc: middle and radius, box units. */
type Disc = [x: number, y: number, r: number];

/**
 * The discs along the outline's spine. A cell is on the spine when the nearest point of the outline jumps
 * between it and a neighbour (one sees one side, the other the other side); the jump has to be a good part of
 * the cell's depth, so a wobble in the outline grows no spine of its own. Then the deepest cells first, each
 * kept unless a disc already kept holds it, or one lies closer than half its own radius.
 */
function spine(g: Grid): Disc[] {
  const cand: number[] = [];
  for (let j = 1; j < g.rows - 1; j++) {
    for (let i = 1; i < g.cols - 1; i++) {
      const k = j * g.cols + i, d = g.sd[k];
      if (d < LEAST) continue;
      const jump = Math.max(1.2, 0.3 * d);
      for (const n of [k + 1, k - 1, k + g.cols, k - g.cols, k + g.cols + 1, k - g.cols - 1, k + g.cols - 1, k - g.cols + 1]) {
        if (g.sd[n] <= 0) continue;
        if (Math.hypot(g.fx[n] - g.fx[k], g.fy[n] - g.fy[k]) >= jump) { cand.push(k); break; }
      }
    }
  }
  cand.sort((a, b) => g.sd[b] - g.sd[a]);
  const discs: Disc[] = [];
  for (const k of cand) {
    const x = g.x0 + ((k % g.cols) + 0.5) * CELL, y = g.y0 + (Math.floor(k / g.cols) + 0.5) * CELL, r = g.sd[k];
    let keep = true;
    for (const [dx, dy, dr] of discs) {
      const s = Math.hypot(x - dx, y - dy);
      if (s + r <= dr + 0.3 || s < GAP * r) { keep = false; break; }
    }
    if (keep) discs.push([x, y, r]);
  }
  return discs;
}

/** Is the hull of two discs inside the outline (to within SPILL)? It is every disc between them. */
function joins(g: Grid, a: Disc, b: Disc): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2)));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (sdAt(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < a[2] + (b[2] - a[2]) * t - SPILL) return false;
  }
  return true;
}

/** A disc as a 24-gon a hair outside it. */
function rimOf([x, y, r]: Disc): Point[] {
  const n = 24, out = r / Math.cos(Math.PI / n), pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push([x + out * Math.cos((i * 2 * Math.PI) / n), y + out * Math.sin((i * 2 * Math.PI) / n)]);
  return pts;
}

/** The convex hull of points (monotone chain), counter-clockwise as drawn in these y-down units. */
function hullOf(pts: Point[]): Point[] {
  pts = pts.slice();
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Point[] = [], hi: Point[] = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

/** Is the disc inside the convex polygon (wound as hullOf winds it)? */
function holds(poly: Point[], [x, y, r]: Disc): boolean {
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const ex = poly[a][0] - poly[b][0], ey = poly[a][1] - poly[b][1], len = Math.hypot(ex, ey);
    if (len === 0) continue;
    // Distance of the middle inside the edge's line; the hull runs counter-clockwise in these (y down) units.
    if ((ex * (y - poly[b][1]) - ey * (x - poly[b][0])) / len < r) return false;
  }
  return true;
}

/** Every grid cell whose middle is inside a convex polygon. */
function cellsIn(g: Grid, poly: Point[], visit: (k: number) => boolean | void): boolean {
  let yMin = Infinity, yMax = -Infinity;
  for (const p of poly) { yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]); }
  const j0 = Math.max(0, Math.ceil((yMin - g.y0) / CELL - 0.5)), j1 = Math.min(g.rows - 1, Math.floor((yMax - g.y0) / CELL - 0.5));
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * CELL;
    let xa = Infinity, xb = -Infinity;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [ax, ay] = poly[a], [bx, by] = poly[b];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const x = ax + ((y - ay) * (bx - ax)) / (by - ay);
        xa = Math.min(xa, x); xb = Math.max(xb, x);
      }
    }
    if (xa > xb) continue;
    const i0 = Math.max(0, Math.ceil((xa - g.x0) / CELL - 0.5)), i1 = Math.min(g.cols - 1, Math.floor((xb - g.x0) / CELL - 0.5));
    for (let i = i0; i <= i1; i++) if (visit(j * g.cols + i) === false) return false;
  }
  return true;
}

/**
 * Cells in a convex polygon not yet covered, or -1 when the polygon leaves the outline by more than SPILL. A cell
 * of the face counts FACE_WEIGHT times.
 */
function newIn(g: Grid, poly: Point[], covered: Uint8Array, face: Uint8Array | null): number {
  let c = 0;
  return cellsIn(g, poly, (k) => { if (g.sd[k] < -SPILL) return false; if (!covered[k]) c += face && face[k] ? FACE_WEIGHT : 1; }) ? c : -1;
}

/** How much more a cell of the face counts than any other, while the first piece is built. */
const FACE_WEIGHT = 40;

/**
 * The spheres grouped into pieces. Each piece starts at the disc that covers most of what is not yet covered
 * and takes in, one at a time, the joined disc that adds most, as long as the hull of them all stays inside
 * the outline. It stops when nothing more fits or nothing more is added.
 *
 * The first piece is the face's: it is built to cover `face` (everywhere an eye can be) before anything else, so
 * the eyes ride one smooth hull and no seam between two pieces runs under them.
 */
function group(g: Grid, discs: Disc[], face: Uint8Array): number[][] {
  const n = discs.length, link: number[][] = discs.map(() => []);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (Math.hypot(discs[a][0] - discs[b][0], discs[a][1] - discs[b][1]) > discs[a][2] + discs[b][2] + 6) continue;
      if (joins(g, discs[a], discs[b])) { link[a].push(b); link[b].push(a); }
    }
  }
  // What is to be covered: everything deeper than the spill.
  const covered = new Uint8Array(g.sd.length);
  let left = 0;
  for (let k = 0; k < g.sd.length; k++) if (g.sd[k] > SPILL) left++; else covered[k] = 1;
  const pieces: number[][] = [];
  while (left > 0) {
    let seed = -1, best = 0;
    const weigh = pieces.length ? null : face;
    for (let a = 0; a < n; a++) { const c = newIn(g, rimOf(discs[a]), covered, weigh); if (c > best) { best = c; seed = a; } }
    if (seed < 0 || best < 4) break;
    const piece = [seed];
    let poly = rimOf(discs[seed]);
    for (;;) {
      if (piece.length >= (weigh ? 2 * MOST : MOST)) break;
      let pick = -1, more = 0, next: Point[] | null = null;
      const near = new Set<number>();
      for (const a of piece) for (const b of link[a]) if (!piece.includes(b)) near.add(b);
      const now = newIn(g, poly, covered, weigh);
      for (const b of near) {
        // (A disc inside the hull so far adds nothing.)
        if (holds(poly, discs[b])) continue;
        const p = hullOf(poly.concat(rimOf(discs[b])));
        const c = newIn(g, p, covered, weigh) - now;
        if (c > more) { more = c; pick = b; next = p; }
      }
      if (pick < 0 || !next) break;
      piece.push(pick); poly = next;
    }
    cellsIn(g, poly, (k) => { if (!covered[k]) { covered[k] = 1; left--; } });
    pieces.push(piece);
  }
  return pieces;
}

/**
 * How the eyes sit. The definition's eyes are 4 by 11 units at scale 1; drawn, they are as much as 1.45 times
 * that where the outline leaves room, and as wide as the engine's eyes are for their height. They slide to look
 * as far as the outline lets them, up to what the built-in shapes do.
 */
function eyeSpec(g: Grid, e: AvatarEyes): EyeSpec {
  const room = (boost: number, dx: number, dy: number) => {
    const h = EYE_H * e.scale * boost, w = Math.max(EYE_W * e.scale * boost, ASPECT * h);
    // (As far apart as the built-in shapes' eyes are for their width: a turn opens the near eye toward the far one.)
    if (boost > 1 && e.spacing - w < APART * w) return false;
    for (const side of [-1, 1]) {
      const cx = e.x + (side * e.spacing) / 2 + dx, cy = e.y + dy;
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * 2 * Math.PI;
        if (sdAt(g, cx + (w / 2) * Math.cos(t), cy + (h / 2) * Math.sin(t)) < EYE_ROOM) return false;
      }
    }
    return true;
  };
  let boost = 1;
  for (let b = EYE_BOOST; b > 1; b -= 0.05) if (room(b, 0, 0)) { boost = b; break; }
  const reach = (ux: number, uy: number, most: number) => {
    for (let k = 1; k > 0; k -= 0.1) if (room(boost, ux * k * most, uy * k * most)) return k * most;
    return 0;
  };
  // (Never smaller than the built-in shapes' eyes go, or at 16 px they are specks.)
  let h = Math.max(EYE_H * e.scale * boost, LEAST_EYE * BOX_SCALE), w = Math.max(EYE_W * e.scale * boost, ASPECT * h);
  // (But no wider than leaves them apart: a turn opens the near eye toward the far one.)
  const widest = e.spacing / (1 + APART);
  if (w > widest) { h *= widest / w; w = widest; }
  let sx = Math.min(reach(-1, 0, 5.5), reach(1, 0, 5.5)), sy = Math.min(reach(0, -1, 4.2), reach(0, 1, 4.2));
  // (A look slides both ways at once, up and across: the corners must fit too.)
  while ((sx > 0 || sy > 0) && ![[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([ux, uy]) => room(boost, ux * sx, uy * sy))) { sx *= 0.9; sy *= 0.9; }
  return {
    x: e.spacing / 2 / BOX_SCALE,
    ...(e.x !== 50 ? { cx: (e.x - 50) / BOX_SCALE } : {}),
    y: (50 - e.y) / BOX_SCALE,
    w: w / BOX_SCALE,
    h: h / BOX_SCALE,
    slideX: Math.max(0.03, sx / BOX_SCALE),
    slideY: Math.max(0.03, sy / BOX_SCALE),
  };
}

/** Every cell an eye can cover, resting or sliding to look, and a unit round that. */
function faceOf(g: Grid, e: EyeSpec): Uint8Array {
  const face = new Uint8Array(g.sd.length), S = BOX_SCALE;
  const hw = ((e.w / 2 + e.slideX) * S) + 1, hh = ((e.h / 2 + e.slideY) * S) + 1, cy = 50 - e.y * S;
  const mid = 50 + (e.cx ?? 0) * S;
  for (const cx of [mid - e.x * S, mid + e.x * S]) {
    const i0 = Math.max(0, Math.floor((cx - hw - g.x0) / CELL)), i1 = Math.min(g.cols - 1, Math.ceil((cx + hw - g.x0) / CELL));
    const j0 = Math.max(0, Math.floor((cy - hh - g.y0) / CELL)), j1 = Math.min(g.rows - 1, Math.ceil((cy + hh - g.y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (g.sd[j * g.cols + i] > SPILL) face[j * g.cols + i] = 1;
  }
  return face;
}

/** Does the body show both eyes at 64 px, held in a look any way (as the rig holds one: see Rig.face)? */
function bothShow(body: Body): boolean {
  const most = body.look ?? 1;
  for (let a = 0; a < 360; a += 15) {
    const x = Math.cos((a * Math.PI) / 180) * most, y = Math.sin((a * Math.PI) / 180);
    // (Every face straight across and on the diagonals, where an eye is lost first; the plain face all round.)
    for (const face of a % 45 === 0 ? FACE_LIST : [FACES.neutral]) {
      const state: RigState = { pose: { yaw: x * LOOK_YAW, pitch: y * LOOK_PITCH, roll: 0 }, eye: { x, y }, lid: 1, face };
      const [left, right] = eyeShapes(body, state, 64);
      if (!left.length || !right.length) return false;
    }
  }
  return true;
}
const FACE_LIST = [FACES.neutral, ...Object.values(ACTIVITY_FACES)];

const made = new Map<string, Body>();

/**
 * The body for an avatar definition. Check a definition you did not write with validateAvatar first: this
 * one throws on a path it cannot read. The same definition (by its id, path, eyes and wardrobe) gives the same body.
 */
export function outlineBody(def: AvatarDefinition): Body {
  const key = JSON.stringify([def.id, def.body.path, def.eyes, def.wardrobe]);
  let body = made.get(key);
  if (body) return body;
  const polys = flattenPath(parsePath(def.body.path));
  if (!polys.length) throw new Error(`${def.id}: the path encloses nothing`);
  const g = measure(polys, edgesOf(polys));
  const eyes = eyeSpec(g, def.eyes);
  const discs = spine(g);
  const pieces: Piece[] = group(g, discs, faceOf(g, eyes)).map((ids) => ids.map((id): Sphere => {
    const [x, y, r] = discs[id];
    return [(x - 50) / BOX_SCALE, (50 - y) / BOX_SCALE, 0, r / BOX_SCALE];
  }));
  // The eyes ride the face's piece alone, one smooth hull, so no seam where it meets another piece runs under
  // them; the outline is every piece.
  const base: Body = { id: def.id, pieces: pieces.slice(0, 1), outline: { pieces }, eyes, ...(def.wardrobe ? { wardrobe: def.wardrobe } : {}) };
  body = { ...base, look: LOOKS.find((look) => bothShow({ ...base, look })) ?? LOOKS[LOOKS.length - 1] };
  if (made.size >= 64) made.delete(made.keys().next().value as string);
  made.set(key, body);
  return body;
}
