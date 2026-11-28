/** The roots are stored in this many passes over the surface; any first few passes are an even share of the coat. */
export const ROOT_PASSES = 8;
/**
 * Hair roots per square body unit. Open-bot-avatar's 3.3 per square unit is 5821 here, but its bodies are
 * slabs at most 30 deep and ours are as deep as they are wide, with two to four times the surface; this gives
 * the blob's ball about 38,000 roots. To be judged by eye.
 */
export const ROOT_DENSITY = 3600;

export interface CoatMesh {
  /**
   * Per vertex, 6 floats: position x, y, z, then the unit normal the coat stands along; body units, y up, z toward
   * the viewer. The normal is the hull's own, eased toward another piece's within SEAM of it.
   */
  vertices: Float32Array;
  /** Optional unit-circle strand coordinate per vertex on groomed hair. */
  grain?: Float32Array;
  /** Local comb direction for each root on a groomed surface. */
  tangents?: Float32Array;
  /** Triangles, three vertex indices each, wound counter-clockwise seen from outside their piece. */
  indices: Uint32Array;
  /**
   * Hair roots, 8 floats each: position x, y, z, unit normal, and two random numbers in [0, 1). Stored in
   * ROOT_PASSES passes over the whole surface, pass p holding roots p, p + 8, p + 16... of the scatter: the first
   * rootsIn(count, k) roots are an even k/8 share of the coat.
   */
  roots: Float32Array;
  /** Bounds of the vertices: x0, y0, z0, x1, y1, z1, body units. */
  box: readonly [number, number, number, number, number, number];
  /** The furthest any vertex is from the body's origin (the point every pose turns about), body units. */
  radius: number;
}

function randomFrom(seed: number): () => number {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Scatter deterministic roots over the triangles and measure the finished mesh. */
export function finishMesh(verts: number[] | Float32Array, idx: number[] | Uint32Array, skipFace?: (index: number) => boolean,
  buried?: (index: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => boolean, withRoots = true): CoatMesh {
  // Roots by area, open-bot-avatar's way: per triangle, floor(area * density + a random share).
  const random = randomFrom(51821);
  const roots: number[] = [];
  for (let i = 0; withRoots && i < idx.length; i += 3) {
    if (skipFace?.(i)) continue;
    const a = idx[i] * 6, b = idx[i + 1] * 6, c = idx[i + 2] * 6;
    const abx = verts[b] - verts[a], aby = verts[b + 1] - verts[a + 1], abz = verts[b + 2] - verts[a + 2];
    const acx = verts[c] - verts[a], acy = verts[c + 1] - verts[a + 1], acz = verts[c + 2] - verts[a + 2];
    const area = 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    const n = Math.floor(area * ROOT_DENSITY + random());
    for (let k = 0; k < n; k++) {
      const u = Math.sqrt(random()), w = u * random();
      const wa = 1 - u, wb = u - w, wc = w;
      const px = wa * verts[a] + wb * verts[b] + wc * verts[c], py = wa * verts[a + 1] + wb * verts[b + 1] + wc * verts[c + 1], pz = wa * verts[a + 2] + wb * verts[b + 2] + wc * verts[c + 2];
      let nx = wa * verts[a + 3] + wb * verts[b + 3] + wc * verts[c + 3], ny = wa * verts[a + 4] + wb * verts[b + 4] + wc * verts[c + 4], nz = wa * verts[a + 5] + wb * verts[b + 5] + wc * verts[c + 5];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const r0 = random(), r1 = random();
      // A hair rooted deeper inside another piece than the longest hair never shows.
      if (buried?.(i, px, py, pz, nx, ny, nz)) continue;
      roots.push(px, py, pz, nx, ny, nz, r0, r1);
    }
  }
  const total = roots.length / 8;
  const passes = new Float32Array(roots.length);
  let at = 0;
  for (let pass = 0; pass < ROOT_PASSES; pass++) {
    for (let i = pass; i < total; i += ROOT_PASSES) for (let k = 0; k < 8; k++) passes[at++] = roots[8 * i + k];
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, radius = 0;
  for (let i = 0; i < verts.length; i += 6) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    radius = Math.max(radius, Math.hypot(x, y, z));
  }
  return { vertices: verts instanceof Float32Array ? verts : Float32Array.from(verts), indices: idx instanceof Uint32Array ? idx : Uint32Array.from(idx), roots: passes, box: [x0, y0, z0, x1, y1, z1], radius };
}
