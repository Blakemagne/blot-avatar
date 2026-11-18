// Decals and antennas: what a body may carry besides its eyes, each drawn as a layer of its own.
//
// A decal is a flat outline in face coordinates, lifted onto the surface exactly as an eye is (eyePolys), so
// a sticker leans, thins and goes round the edge with the body. An antenna is two tapered capsules swung
// about a pivot, outlined as any piece is (silhouette).

import type { Antennas, DecalShape, Sphere } from './body';

/** The corners of the shapes that have corners, in a box of -1..1, counter-clockwise from the right or the top. */
const CORNERS: Partial<Record<DecalShape, readonly number[]>> = {
  diamond: [1, 0, 0, 1, -1, 0, 0, -1],
  bolt: [0.28, 1, -0.62, -0.08, -0.04, -0.08, -0.3, -1, 0.62, 0.16, 0.04, 0.16],
  star: Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.46 : 1;
    return [r * Math.cos(a), r * Math.sin(a)];
  }).flat(),
};

/** `n` points evenly spaced along a closed polygon, flat [x0, y0, ...]. */
function resample(poly: readonly number[], n: number): Float64Array {
  const m = poly.length / 2, lens: number[] = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, l = Math.hypot(poly[j * 2] - poly[i * 2], poly[j * 2 + 1] - poly[i * 2 + 1]);
    lens.push(l); total += l;
  }
  const out = new Float64Array(n * 2);
  let leg = 0, start = 0;
  for (let k = 0; k < n; k++) {
    const at = (k / n) * total;
    while (leg < m - 1 && at > start + lens[leg]) { start += lens[leg]; leg++; }
    const t = lens[leg] ? (at - start) / lens[leg] : 0, j = (leg + 1) % m;
    out[k * 2] = poly[leg * 2] + (poly[j * 2] - poly[leg * 2]) * t;
    out[k * 2 + 1] = poly[leg * 2 + 1] + (poly[j * 2 + 1] - poly[leg * 2 + 1]) * t;
  }
  return out;
}

/**
 * A decal's outline: `n` points counter-clockwise round its middle, flat [du0, dv0, ...] in face coordinates,
 * `w` wide and `h` tall before it is turned by `turn` radians.
 */
export function decalOutline(shape: DecalShape, w: number, h: number, turn: number, n: number): Float64Array {
  let unit: Float64Array;
  if (shape === 'circle') {
    unit = new Float64Array(n * 2);
    for (let k = 0; k < n; k++) { const a = (k * 2 * Math.PI) / n; unit[k * 2] = Math.cos(a); unit[k * 2 + 1] = Math.sin(a); }
  } else if (shape === 'rounded') {
    // A squircle: as round at the corners as a phone's icon.
    unit = new Float64Array(n * 2);
    for (let k = 0; k < n; k++) {
      const a = (k * 2 * Math.PI) / n, c = Math.cos(a), s = Math.sin(a);
      unit[k * 2] = Math.sign(c) * Math.abs(c) ** 0.5; unit[k * 2 + 1] = Math.sign(s) * Math.abs(s) ** 0.5;
    }
  } else if (shape === 'heart') {
    const pts: number[] = [];
    for (let k = 0; k < 96; k++) {
      const t = (k * 2 * Math.PI) / 96;
      pts.push((16 * Math.sin(t) ** 3) / 16, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) / 14.5);
    }
    // (The curve runs clockwise; turned round it is counter-clockwise, as every outline here is.)
    const ccw: number[] = [];
    for (let k = pts.length / 2 - 1; k >= 0; k--) ccw.push(pts[k * 2], pts[k * 2 + 1]);
    unit = resample(ccw, n);
  } else unit = resample(CORNERS[shape] ?? CORNERS.diamond!, n);
  const ct = Math.cos(turn), st = Math.sin(turn), out = new Float64Array(n * 2);
  for (let k = 0; k < n; k++) {
    const x = (unit[k * 2] * w) / 2, y = (unit[k * 2 + 1] * h) / 2;
    out[k * 2] = x * ct - y * st; out[k * 2 + 1] = x * st + y * ct;
  }
  return out;
}

/**
 * The two antennas' pieces for a swing (radians from rest, positive outward; the viewer's left, then right),
 * each grown to `grow` of its length (0 to 1, as a body changes shape). Left first. A stalk is two capsules,
 * pivot to joint and joint to tip, the whip bent `follow` further than the base.
 */
export function antennaPieces(a: Antennas, swing: readonly [number, number], grow: number): [Sphere[][], Sphere[][]] {
  const [px, py, pz] = a.pivot, [r0, r1, r2] = a.radii;
  const one = (side: -1 | 1, s: number): Sphere[][] => {
    const t = a.rest + s, tw = t + a.follow * s;
    const jx = side * px + side * Math.sin(t) * a.base * grow, jy = py + Math.cos(t) * a.base * grow;
    const tx = jx + side * Math.sin(tw) * a.whip * grow, ty = jy + Math.cos(tw) * a.whip * grow;
    const p: Sphere = [side * px, py, pz, r0 * grow], j: Sphere = [jx, jy, pz, r1 * grow], tip: Sphere = [tx, ty, pz, r2 * grow];
    return [[p, j], [j, tip]];
  };
  return [one(-1, swing[0]), one(1, swing[1])];
}
