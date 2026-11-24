// A coat's geometry: every body, built-in or from a definition, is covered by closed meshes that lie on its
// pieces exactly, with normals that turn across the seams between pieces and roots spread evenly over it in
// passes, the same every time. And a drawing asked for a coat carries the pose, the 2D move and the eyes a
// renderer needs, and changes nothing else. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { BODIES, FACES, GALLERY, deg, drawAvatar, outlineBody, rotation } = await import('../index.ts');
const { COAT_UNIT, FULL_DETAIL, MAX_EDGE, ROOT_DENSITY, ROOT_PASSES, SEAM, STRAND_MAX, coatDetail, coatMesh, meshOf, rootsIn } = await import('./coat.ts');
const { prepare, surfaceTop } = await import('./body.ts');
const { BOX_SCALE } = await import('./outline/inflate.ts');

const EVERY = [...Object.entries(BODIES), ...GALLERY.map((g) => [`gallery ${g.definition.id}`, outlineBody(g.definition)])];
const piecesOf = (body) => (body.outline ?? body).pieces;
const reach = (piece, nx, ny, nz) => { let most = -Infinity; for (const [x, y, z, r] of piece) most = Math.max(most, nx * x + ny * y + nz * z + r); return most; };
const still = (yaw = 0, pitch = 0, more = {}) => ({ pose: { yaw: deg(yaw), pitch: deg(pitch), roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral, ...more });
/** Every body's mesh as the hulls are, each vertex with its own piece's normal (no easing at the seams). */
const hulls = new Map();
const hullMesh = (id, body) => hulls.get(id) ?? hulls.set(id, meshOf(body.outline ?? body, 0)).get(id);

/** Every body's mesh, timed: built once here, so later tests read it from the cache. */
const built = new Map();
test('every body builds a coat; the time each takes', (t) => {
  // (A copy of the blob first, so the first timed body does not pay for warming up.)
  coatMesh({ ...BODIES.blob, outline: { pieces: [[[0, 0, 0, 0.5]]] } });
  for (const [id, body] of EVERY) {
    const t0 = performance.now(), m = coatMesh(body), ms = performance.now() - t0;
    built.set(id, m);
    t.diagnostic(`${id}: ${ms.toFixed(1)} ms, ${m.vertices.length / 6} vertices, ${m.indices.length / 3} triangles, ${m.roots.length / 8} roots`);
  }
});

test('the unit is the one outlines are made with', () => {
  assert.equal(COAT_UNIT, 1 / BOX_SCALE);
});

test('each mesh is closed: every edge is in two triangles, once each way, and no edge is long', () => {
  for (const [id, body] of EVERY) {
    const { vertices: v, indices } = coatMesh(body), count = v.length / 6;
    const seen = new Map();
    for (let i = 0; i < indices.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = indices[i + e], b = indices[i + ((e + 1) % 3)];
        assert.ok(a < count && b < count && a !== b, id);
        const key = a * count + b;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        const len = Math.hypot(v[a * 6] - v[b * 6], v[a * 6 + 1] - v[b * 6 + 1], v[a * 6 + 2] - v[b * 6 + 2]);
        assert.ok(len <= MAX_EDGE + 1e-6, `${id}: an edge of ${len}`);
      }
    }
    for (const [key, n] of seen) {
      assert.equal(n, 1, `${id}: an edge used twice the same way`);
      const a = Math.floor(key / count), b = key % count;
      assert.equal(seen.get(b * count + a), 1, `${id}: an open edge`);
    }
  }
});

test('triangles are wound counter-clockwise seen from outside their piece', () => {
  for (const [id, body] of EVERY) {
    const { vertices: v, indices } = hullMesh(id, body);
    let wrong = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 6, indices[i + 1] * 6, indices[i + 2] * 6];
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * (v[a + 3] + v[b + 3] + v[c + 3]) + ny * (v[a + 4] + v[b + 4] + v[c + 4]) + nz * (v[a + 5] + v[b + 5] + v[c + 5]) < 0) wrong++;
    }
    assert.equal(wrong, 0, `${id}: ${wrong} triangles face inward`);
  }
});

test('every vertex is on the hull of a piece, with that hull\'s normal there, and no piece\'s front is above it', () => {
  for (const [id, body] of EVERY) {
    const pieces = piecesOf(body), { vertices: v } = hullMesh(id, body);
    const preps = pieces.map((piece) => prepare({ pieces: [piece] })), hit = { z: 0, nx: 0, ny: 0, nz: 0 };
    for (let i = 0; i < v.length; i += 6) {
      const [x, y, z, nx, ny, nz] = v.subarray(i, i + 6);
      assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-5, `${id}: a normal of length ${Math.hypot(nx, ny, nz)}`);
      // On the plane a piece reaches furthest to along the normal: its support point (to float precision).
      const on = pieces.map((piece, k) => (Math.abs(reach(piece, nx, ny, nz) - (nx * x + ny * y + nz * z)) < 2e-5 ? k : -1)).filter((k) => k >= 0);
      assert.ok(on.length, `${id}: vertex ${i / 6} at ${x}, ${y}, ${z} is on no piece's hull`);
      // And from the front it is that piece's surface (checked on a share of the vertices that face the viewer;
      // two pieces can share a plane, as the cloud's slabs do, so it is one of them).
      if (nz > 0.3 && i % 42 === 0) {
        const front = on.some((k) => surfaceTop(preps[k], x, y, hit) && Math.abs(hit.z - z) < 2e-4);
        assert.ok(front, `${id}: vertex at ${x}, ${y}, ${z} is not on the front of the piece it touches`);
      }
    }
  }
});

/** A ball that holds a piece: x, y, z, r. */
const balls = new WeakMap();
const ballOf = (piece) => {
  if (!balls.has(piece)) {
    const m = [0, 1, 2].map((k) => piece.reduce((sum, s) => sum + s[k], 0) / piece.length);
    balls.set(piece, [...m, Math.max(...piece.map(([x, y, z, r]) => Math.hypot(x - m[0], y - m[1], z - m[2]) + r))]);
  }
  return balls.get(piece);
};
/**
 * A lower bound on how far p is outside a piece (0 or less inside it). First how far p is outside a ball that holds
 * the piece, if that is more than `enough`; else how far p is in front of a plane the piece is behind, across n and
 * across the direction to p from the centre of the sphere it is nearest the surface of (or of every sphere: `every`).
 */
const apart = (piece, x, y, z, nx, ny, nz, enough, every = false) => {
  const [bx, by, bz, br] = ballOf(piece), ball = Math.hypot(x - bx, y - by, z - bz) - br;
  if (ball > enough) return ball;
  let most = nx * x + ny * y + nz * z - reach(piece, nx, ny, nz);
  const across = (cx, cy, cz) => {
    const l = Math.hypot(x - cx, y - cy, z - cz);
    if (l > 1e-12) most = Math.max(most, ((x - cx) * x + (y - cy) * y + (z - cz) * z) / l - reach(piece, (x - cx) / l, (y - cy) / l, (z - cz) / l));
  };
  if (every) for (const [cx, cy, cz] of piece) across(cx, cy, cz);
  else {
    let k = 0, e = Infinity;
    piece.forEach(([cx, cy, cz, r], j) => { const d = Math.hypot(x - cx, y - cy, z - cz) - r; if (d < e) { e = d; k = j; } });
    across(...piece[k]);
  }
  return most;
};

test('the coat is the hulls, with a normal eased toward another piece\'s only within SEAM of it', () => {
  for (const [id, body] of EVERY) {
    const pieces = piecesOf(body), hull = hullMesh(id, body), coat = coatMesh(body), h = hull.vertices, v = coat.vertices;
    assert.deepEqual(coat.indices, hull.indices, id);
    assert.equal(v.length, h.length, id);
    assert.equal(coat.roots.length, hull.roots.length, id);
    // Every vertex and every root where the hulls have it, with the same seeds.
    let moved = 0;
    for (let i = 0; i < v.length; i += 6) for (let k = 0; k < 3; k++) if (v[i + k] !== h[i + k]) moved++;
    for (let i = 0; i < coat.roots.length; i += 8) for (const k of [0, 1, 2, 6, 7]) if (coat.roots[i + k] !== hull.roots[i + k]) moved++;
    assert.equal(moved, 0, `${id}: ${moved} values moved`);
    let eased = 0, far = 0, wrong = 0, length = 1;
    for (let i = 0; i < v.length; i += 6) {
      const x = h[i], y = h[i + 1], z = h[i + 2], nx = h[i + 3], ny = h[i + 4], nz = h[i + 5];
      const l = Math.hypot(v[i + 3], v[i + 4], v[i + 5]);
      if (Math.abs(l - 1) > Math.abs(length - 1)) length = l;
      const same = v[i + 3] === nx && v[i + 4] === ny && v[i + 5] === nz;
      if (!same) eased++;
      // Its own piece is 0 away; if every other is SEAM or more, the normal is the hull's.
      let close = 0;
      for (const piece of pieces) if (apart(piece, x, y, z, nx, ny, nz, SEAM) < SEAM && ++close > 1) break;
      if (close <= 1) { far++; if (!same) wrong++; }
    }
    assert.ok(Math.abs(length - 1) < 1e-5, `${id}: a normal of length ${length}`);
    assert.equal(wrong, 0, `${id}: ${wrong} of the ${far} vertices far from the other pieces eased`);
    assert.ok(pieces.length === 1 ? eased === 0 : eased > 0, `${id}: ${eased} normals eased`);
  }
});

test('where two pieces meet, the coat\'s normals turn across the seam instead of folding there', () => {
  // Vertices of two pieces within half an edge of each other, neither more than a hair inside any piece: the
  // surface either side of a seam. There the hulls' normals fold by up to 137 degrees; the coat's turn by at
  // most 40 (on the flower, whose face showed its seams as lines, the hulls' by 92 and the coat's by 7).
  const NEAR = MAX_EDGE / 2, HAIR = -0.005;
  for (const [id, body] of EVERY) {
    const pieces = piecesOf(body);
    if (pieces.length === 1) continue;
    const hull = hullMesh(id, body), h = hull.vertices, v = coatMesh(body).vertices, count = h.length / 6;
    // Which piece's closed mesh each vertex is in: the mesh's connected parts.
    const up = Int32Array.from({ length: count }, (_, i) => i);
    const find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
    for (let t = 0; t < hull.indices.length; t += 3) for (const e of [1, 2]) { const a = find(hull.indices[t]), b = find(hull.indices[t + e]); if (a !== b) up[b] = a; }
    const part = Int32Array.from({ length: count }, (_, i) => find(i));
    const out = new Map();
    const outside = (i) => {
      if (!out.has(i)) {
        const [x, y, z, nx, ny, nz] = h.subarray(i * 6, i * 6 + 6);
        out.set(i, pieces.every((piece) => apart(piece, x, y, z, nx, ny, nz, HAIR, true) > HAIR));
      }
      return out.get(i);
    };
    const angle = (m, a, b) => Math.acos(Math.min(1, m[a * 6 + 3] * m[b * 6 + 3] + m[a * 6 + 4] * m[b * 6 + 4] + m[a * 6 + 5] * m[b * 6 + 5])) * (180 / Math.PI);
    // Vertices by cells NEAR wide, so a vertex's neighbours are in its cell and the 26 round it.
    const cell = (i) => [0, 1, 2].map((k) => Math.floor(h[i * 6 + k] / NEAR) + 512), key = (cx, cy, cz) => (cx * 1024 + cy) * 1024 + cz;
    const grid = new Map();
    for (let i = 0; i < count; i++) { const k = key(...cell(i)); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
    let pairs = 0, hullMost = 0, coatMost = 0;
    for (let i = 0; i < count; i++) {
      const [cx, cy, cz] = cell(i), x = h[i * 6], y = h[i * 6 + 1], z = h[i * 6 + 2];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
          if (j <= i || part[i] === part[j] || Math.hypot(h[j * 6] - x, h[j * 6 + 1] - y, h[j * 6 + 2] - z) >= NEAR || !outside(i) || !outside(j)) continue;
          pairs++;
          hullMost = Math.max(hullMost, angle(h, i, j));
          coatMost = Math.max(coatMost, angle(v, i, j));
        }
      }
    }
    assert.ok(coatMost < 45, `${id}: normals ${coatMost.toFixed(1)} degrees apart across a seam (the hulls' ${hullMost.toFixed(1)})`);
    if (id === 'flower') {
      assert.ok(pairs > 20 && hullMost > 80, `flower: ${pairs} pairs, the hulls' normals ${hullMost.toFixed(1)} degrees apart`);
      assert.ok(coatMost < 10, `flower: normals ${coatMost.toFixed(1)} degrees apart across a seam`);
    }
  }
});

test('the same body gives the same coat, value for value, built again from scratch', () => {
  const hash = (m) => createHash('sha256').update(new Uint8Array(m.vertices.buffer)).update(new Uint8Array(m.indices.buffer)).update(new Uint8Array(m.roots.buffer)).digest('hex');
  const copy = (body) => ({ ...body, pieces: body.pieces.map((p) => p.map((s) => [...s])), outline: body.outline && { pieces: body.outline.pieces.map((p) => p.map((s) => [...s])) } });
  for (const id of ['blob', 'cloud', 'square', 'star']) {
    assert.equal(coatMesh(BODIES[id]), coatMesh(BODIES[id]), id);
    assert.equal(hash(coatMesh(copy(BODIES[id]))), hash(coatMesh(BODIES[id])), id);
  }
});

test('roots: unit normals, seeds in 0..1, on the surface, and as many as the area asks for', () => {
  for (const [id, body] of EVERY) {
    const { roots, box } = coatMesh(body), count = roots.length / 8;
    assert.ok(count > 15000 && count < 70000, `${id}: ${count} roots`);
    for (let i = 0; i < count; i++) {
      const o = i * 8;
      assert.ok(Math.abs(Math.hypot(roots[o + 3], roots[o + 4], roots[o + 5]) - 1) < 1e-5, id);
      assert.ok(roots[o + 6] >= 0 && roots[o + 6] < 1 && roots[o + 7] >= 0 && roots[o + 7] < 1, id);
      for (let k = 0; k < 3; k++) assert.ok(roots[o + k] >= box[k] - 1e-6 && roots[o + k] <= box[k + 3] + 1e-6, id);
    }
  }
  // A body of one piece keeps every root: one per 1 / ROOT_DENSITY of its area, give or take chance.
  for (const id of ['blob', 'square', 'tablet', 'wedge', 'hex']) {
    const { vertices: v, indices, roots } = coatMesh(BODIES[id]);
    let area = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 6, indices[i + 1] * 6, indices[i + 2] * 6];
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    }
    const ratio = roots.length / 8 / (area * ROOT_DENSITY);
    assert.ok(Math.abs(ratio - 1) < 0.02, `${id}: ${ratio}`);
  }
  // The ball's mesh is the ball (radius 0.92): its area is 4 pi r^2 to within the chords.
  const { vertices: v } = coatMesh(BODIES.blob);
  for (let i = 0; i < v.length; i += 6) assert.ok(Math.abs(Math.hypot(v[i], v[i + 1], v[i + 2]) - 0.92) < 1e-5);
});

test('a root buried in another piece deeper than the longest hair is not kept', () => {
  // Checked by many directions: the least of reach(n) - n . p over them is a little over the depth.
  const dirs = [];
  for (let i = 0; i < 2000; i++) {
    const z = 1 - (2 * (i + 0.5)) / 2000, r = Math.sqrt(1 - z * z), a = i * Math.PI * (3 - Math.sqrt(5));
    dirs.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  const depth = (piece, x, y, z) => Math.min(...dirs.map(([a, b, c]) => reach(piece, a, b, c) - (a * x + b * y + c * z)));
  for (const id of ['cloud', 'star', 'gallery barbell']) {
    const body = id.startsWith('gallery') ? outlineBody(GALLERY.find((g) => `gallery ${g.definition.id}` === id).definition) : BODIES[id];
    const pieces = piecesOf(body), { roots } = coatMesh(body);
    for (let i = 0; i < roots.length / 8; i += 97) {
      const [x, y, z] = roots.subarray(i * 8, i * 8 + 3);
      // Its own piece has it at the surface, 0 deep; every other no deeper than a hair (and the directions' slack).
      const deepest = Math.max(...pieces.map((piece) => depth(piece, x, y, z)));
      assert.ok(deepest < STRAND_MAX + 0.02, `${id}: a root ${deepest} deep in another piece`);
    }
  }
});

test('the roots are stored in passes that each cover the whole body', () => {
  for (const id of ['blob', 'cloud', 'gallery mug']) {
    const { roots } = built.get(id) ?? coatMesh(BODIES[id]);
    const total = roots.length / 8;
    assert.equal(rootsIn(total, ROOT_PASSES), total);
    assert.equal(rootsIn(total, 0), 0);
    assert.ok(Math.abs(rootsIn(total, ROOT_PASSES / 4) / total - 0.25) < 1e-3);
    const box = (from, to) => {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = from; i < to; i++) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], roots[i * 8 + k]); b[k + 3] = Math.max(b[k + 3], roots[i * 8 + k]); }
      return b;
    };
    const all = box(0, total);
    for (let pass = 0; pass < ROOT_PASSES; pass++) {
      const one = box(rootsIn(total, pass), rootsIn(total, pass + 1));
      one.forEach((edge, k) => assert.ok(Math.abs(edge - all[k]) < 0.03, `${id}: pass ${pass} reaches ${edge}, all of them ${all[k]}`));
    }
  }
});

test('detail: all of it from FULL_DETAIL pixels per unit, less below, and never more as an avatar gets smaller', () => {
  assert.deepEqual(coatDetail(FULL_DETAIL), { shells: 5, strandPasses: ROOT_PASSES, strandWidth: 1 });
  assert.deepEqual(coatDetail(FULL_DETAIL * 4), { shells: 5, strandPasses: ROOT_PASSES, strandWidth: 1 });
  assert.deepEqual(coatDetail(FULL_DETAIL / 2), { shells: 3, strandPasses: 6, strandWidth: ROOT_PASSES / 6 });
  assert.deepEqual(coatDetail(1), { shells: 2, strandPasses: ROOT_PASSES / 4, strandWidth: 4 });
  let last = coatDetail(FULL_DETAIL * 1.2);
  for (let px = FULL_DETAIL * 1.2; px > 0; px -= 1) {
    const d = coatDetail(px);
    assert.ok(d.shells <= last.shells && d.strandPasses <= last.strandPasses);
    last = d;
  }
});

/** The numbers of an M/L path, in pairs. */
const points = (d) => { const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []; const out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };

test('a drawing asked for a coat is the same drawing, plus the coat', () => {
  for (const state of [still(), still(30, 10), still(-20, 0, { stretch: 1.1, lift: 0.2, flip: -1, shift: 0.1, scale: 1.05 })]) {
    for (const id of ['blob', 'cloud', 'house']) {
      const plain = drawAvatar(BODIES[id], '#FD690F', state, 96), coated = drawAvatar(BODIES[id], '#FD690F', state, 96, { coat: true });
      assert.equal(plain.coat, undefined);
      const { coat, ...rest } = coated;
      assert.deepEqual(rest, plain);
      assert.equal(coat.body, BODIES[id]);
      assert.equal(coat.opacity, 1);
      assert.deepEqual([...coat.rotation], [...rotation(state.pose)]);
    }
  }
});

test('the coat\'s eyes, moved by its affine, are the drawing\'s eyes', () => {
  const at = still(25, 5);
  const rest = drawAvatar(BODIES.blob, 'gray', at, 96, { coat: true });
  assert.deepEqual(rest.coat.affine, [1, 0, 0, 1, 0, 0]);
  assert.equal(rest.coat.eyes, rest.eyes[0] + rest.eyes[1]);
  const moved = drawAvatar(BODIES.blob, 'gray', { ...at, stretch: 1.15, lift: 0.3, flip: -1, shift: 0.2 }, 96, { coat: true });
  const [a, b, c, d, e, f] = moved.coat.affine;
  assert.equal(b, 0); assert.equal(c, 0); assert.ok(a < 0);
  const before = points(moved.coat.eyes), after = points(moved.eyes[1] + moved.eyes[0]);
  assert.equal(before.length, after.length);
  assert.ok(before.length > 20);
  before.forEach(([x, y], i) => {
    assert.ok(Math.abs(a * x + c * y + e - after[i][0]) < 0.03, `x ${a * x + e} against ${after[i][0]}`);
    assert.ok(Math.abs(b * x + d * y + f - after[i][1]) < 0.03, `y ${d * y + f} against ${after[i][1]}`);
  });
});

test('the mesh, turned by the coat\'s rotation and drawn as it says, fills the body\'s outline', () => {
  for (const id of ['blob', 'wedge', 'gallery mug']) {
    const body = id.startsWith('gallery') ? outlineBody(GALLERY.find((g) => `gallery ${g.definition.id}` === id).definition) : BODIES[id];
    for (const state of [still(), still(35, -12), still(-20, 0, { stretch: 0.9, lift: 0.15 })]) {
      const dr = drawAvatar(body, 'gray', state, 180, { coat: true }), R = dr.coat.rotation, [a, , , d, e, f] = dr.coat.affine;
      const { vertices: v } = coatMesh(body), D = 6, MID = 27.6, UNIT = 18;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < v.length; i += 6) {
        const px = R[0] * v[i] + R[1] * v[i + 1] + R[2] * v[i + 2], py = R[3] * v[i] + R[4] * v[i + 1] + R[5] * v[i + 2], pz = R[6] * v[i] + R[7] * v[i + 1] + R[8] * v[i + 2];
        const s = D / (D - pz), X = a * (MID + UNIT * s * px) + e, Y = d * (MID - UNIT * s * py) + f;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
      }
      const outline = points(dr.body);
      const bx0 = Math.min(...outline.map((p) => p[0])), bx1 = Math.max(...outline.map((p) => p[0])), by0 = Math.min(...outline.map((p) => p[1])), by1 = Math.max(...outline.map((p) => p[1]));
      for (const [m, o] of [[x0, bx0], [x1, bx1], [y0, by0], [y1, by1]]) assert.ok(Math.abs(m - o) < 0.05, `${id}: mesh edge ${m}, outline ${o}`);
    }
  }
});

test('the coat stays on through a change of shape, stretched onto the outline drawn, and crosses over to the new body near half way', async () => {
  const { radial } = await import('./morph.ts');
  const { silhouette } = await import('./silhouette.ts');
  const { COAT_SWAP, detail } = await import('./draw.ts');
  const MID = 27.6, UNIT = 18;
  const at = (k) => drawAvatar(BODIES.blob, 'gray', still(0, 0, { body: BODIES.square, morph: { from: BODIES.blob, k } }), 96, { coat: true });
  for (let i = 0; i <= 40; i++) {
    const k = i / 40, dr = at(k), c = dr.coat;
    assert.equal(c.opacity, 1, `${k}: all of the coat shows`);
    assert.equal(c.body, k < 0.5 ? BODIES.blob : BODIES.square, `${k}: the body it leaves, then the one it becomes`);
    // Each coat, stretched by its warp, reaches exactly as far as the outline drawn along every ray.
    const drawn = points(dr.body).map(([x, y]) => Math.hypot(x - MID, y - MID) / UNIT);
    for (const [body, warp] of [[c.body, c.warp], ...(c.also ? [[c.also.body, c.also.warp]] : [])]) {
      assert.equal(warp.length, drawn.length);
      const own = radial(silhouette(body, rotation(still().pose), detail(96).rim), warp.length);
      warp.forEach((w, j) => assert.ok(Math.abs(own[j] * w - drawn[j]) < 1e-3, `${k}, ray ${j}: ${own[j] * w} against ${drawn[j]}`));
    }
    // The other coat is laid over only near half way, at most half of it, and the two swap there without a jump.
    const share = c.also?.share ?? 0;
    if (Math.abs(k - 0.5) >= COAT_SWAP) assert.equal(share, 0, `${k}: one coat`);
    assert.ok(share <= 0.5);
  }
  const before = at(0.4999).coat, after = at(0.5).coat;
  assert.deepEqual([before.body, before.also.body, after.body, after.also.body], [BODIES.blob, BODIES.square, BODIES.square, BODIES.blob]);
  assert.ok(Math.abs(before.also.share - 0.5) < 0.01 && Math.abs(after.also.share - 0.5) < 0.01);
  // On a body there is nothing to stretch.
  assert.equal(at(1).coat.warp?.every((w) => Math.abs(w - 1) < 1e-9) ?? true, true);
  assert.equal(drawAvatar(BODIES.blob, 'gray', still(), 96, { coat: true }).coat.warp, undefined);
  const figure = (k) => drawAvatar(BODIES.blob, 'gray', still(0, 0, { figure: { form: 'ring', k, turn: 0, progress: 0 } }), 96, { coat: true }).coat.opacity;
  assert.equal(figure(0), 1);
  assert.ok(figure(0.1) > 0 && figure(0.1) < 1);
  assert.equal(figure(0.5), 0);
});

test('a change of shape that cuts into another keeps the coat on, on the body the eyes are on', async () => {
  const { Rig } = await import('../index.ts');
  const coatNow = (r) => drawAvatar(r.state.body, 'gray', r.state, 96, { coat: true }).coat;
  for (const [at, then] of [[0.9, [BODIES.star]], [0.04, [BODIES.star]], [0.9, [BODIES.star, BODIES.square]]]) {
    const rig = new Rig({ body: BODIES.blob });
    rig.setBody(BODIES.cloud);
    while (rig.state.morph && rig.state.morph.k < at) rig.step(4);
    let before = coatNow(rig);
    for (const body of then) {
      rig.setBody(body);
      rig.step(4);
      const after = coatNow(rig);
      assert.equal(after.body, before.body, `caught at ${at}: the coat stays on the body it was on`);
      assert.equal(after.opacity, 1);
      before = after;
    }
    while (rig.state.morph) { rig.step(16); assert.equal(coatNow(rig).opacity, 1); }
  }
});
