// Ported in part from open-bot-avatar (MIT): the distance sweep of dom/fluffy/socket.ts, by Dominik Scholz.
//
// The eyes in a coat's picture, as a field its shader reads: how far each texel is from the nearest eye's edge.
// The eyes are paths drawn over the coat; the field lets the coat part its pile round them (none under an eye,
// a little shade where the pile meets it), from the very polygons the eyes are drawn with (Drawing.coat.eyes).
// Worked out without a canvas: which texels are inside, the exact distance next to an edge, and a sweep from there.

/** How far the field reaches either side of an eye's edge, drawing units. Beyond it the eyes change nothing. */
export const EYE_REACH = 1.7;

/** One field: a square-texelled image of the distance to the eyes round them, in drawing units before the affine. */
export interface EyeField {
  /** One byte a texel, `w` by `h`, the first row at the top: 128 is an eye's edge, less is inside one. */
  data: Uint8Array;
  w: number;
  h: number;
  /** The box it covers, drawing units: x0, y0, x1, y1. */
  box: readonly [number, number, number, number];
}

/** The polygons of a path of M, L and Z with x, y pairs (as the engine writes the eyes): one array of x, y each. */
export function polygonsOf(path: string): number[][] {
  const polys: number[][] = [];
  let poly: number[] = [];
  for (let i = 0, n = path.length; i < n;) {
    const c = path.charCodeAt(i);
    if (c === 77) { poly = []; polys.push(poly); i++; continue; } // M
    if (c === 76 || c === 90 || c === 32 || c === 44) { i++; continue; } // L, Z, space, comma
    let j = i + 1;
    for (; j < n; j++) {
      const d = path.charCodeAt(j);
      if (!((d >= 48 && d <= 57) || d === 46 || d === 101 || ((d === 45 || d === 43) && path.charCodeAt(j - 1) === 101))) break;
    }
    poly.push(Number(path.slice(i, j)));
    i = j;
  }
  return polys.filter((p) => p.length >= 6);
}

const fields = new Map<string, EyeField>();

/**
 * The field of `eyes` (both eyes as one path, drawing units), `perUnit` texels to a drawing unit. Null when no eye
 * shows. The same eyes at the same detail are the same field: the last 32 are kept.
 */
export function eyeField(eyes: string, perUnit: number): EyeField | null {
  if (!eyes) return null;
  const key = `${perUnit}|${eyes}`;
  const known = fields.get(key);
  if (known) return known;
  const polys = polygonsOf(eyes);
  // The box round the eyes, with room for the field to fade out.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) {
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
    }
  }
  if (!(x0 <= x1 && y0 <= y1)) return null;
  x0 -= EYE_REACH; y0 -= EYE_REACH;
  const w = Math.ceil((x1 + EYE_REACH - x0) * perUnit) + 1, h = Math.ceil((y1 + EYE_REACH - y0) * perUnit) + 1, n = w * h;

  // Every edge, in texels (texel (i, j) has its middle at (i + 0.5, j + 0.5)), with its box for a quick miss.
  const edges: number[] = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i += 2) {
      const k = (i + 2) % p.length;
      edges.push((p[i] - x0) * perUnit, (p[i + 1] - y0) * perUnit, (p[k] - x0) * perUnit, (p[k + 1] - y0) * perUnit);
    }
  }

  // Inside or not, row by row: where the row's middle crosses the edges, and which way (nonzero, as SVG fills).
  const inside = new Uint8Array(n), crossings: number[] = [];
  for (let j = 0; j < h; j++) {
    const y = j + 0.5;
    crossings.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const ay = edges[e + 1], by = edges[e + 3];
      if ((ay <= y) === (by <= y)) continue;
      crossings.push(edges[e] + ((y - ay) * (edges[e + 2] - edges[e])) / (by - ay), by > ay ? 1 : -1);
    }
    if (!crossings.length) continue;
    const order = [];
    for (let c = 0; c < crossings.length; c += 2) order.push(c);
    order.sort((a, b) => crossings[a] - crossings[b]);
    let winding = 0, next = 0;
    for (let i = 0; i < w; i++) {
      const x = i + 0.5;
      while (next < order.length && crossings[order[next]] <= x) winding += crossings[order[next++] + 1];
      if (winding !== 0) inside[j * w + i] = 1;
    }
  }

  // Within a texel or two of an edge, the exact distance to it (so an eye thinner than a texel, a blink, still
  // counts); then swept out both ways from there, in texels, on a grid with a border of one that stays far.
  const W = w + 2, far = w + h, dist = new Float32Array(W * (h + 2)).fill(far), R2 = Math.SQRT2;
  for (let e = 0; e < edges.length; e += 4) {
    const ax = edges[e], ay = edges[e + 1], bx = edges[e + 2], by = edges[e + 3], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - 1.5)), i1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + 1.5));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - 1.5)), j1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + 1.5));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5, py = j + 0.5, s = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
        const ex = ax + s * dx - px, ey = ay + s * dy - py, d = Math.sqrt(ex * ex + ey * ey), t = (j + 1) * W + i + 1;
        if (d < dist[t]) dist[t] = d;
      }
    }
  }
  for (let y = 1; y <= h; y++) {
    for (let x = 1, i = y * W + 1; x <= w; x++, i++) {
      dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - W] + 1, dist[i - W - 1] + R2, dist[i - W + 1] + R2);
    }
  }
  for (let y = h; y >= 1; y--) {
    for (let x = w, i = y * W + w; x >= 1; x--, i--) {
      dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + W] + 1, dist[i + W + 1] + R2, dist[i + W - 1] + R2);
    }
  }
  // As bytes: 128 at the edge, 0 a full EYE_REACH inside, 255 as far outside.
  const data = new Uint8Array(n), scale = 1 / (2 * EYE_REACH * perUnit);
  for (let j = 0; j < h; j++) {
    for (let i = 0, t = j * w; i < w; i++, t++) {
      const d = dist[(j + 1) * W + i + 1] * scale, v = 0.5 + (inside[t] ? -d : d);
      data[t] = Math.round(255 * (v < 0 ? 0 : v > 1 ? 1 : v));
    }
  }
  const field: EyeField = { data, w, h, box: [x0, y0, x0 + w / perUnit, y0 + h / perUnit] };
  if (fields.size >= 32) fields.delete(fields.keys().next().value as string);
  fields.set(key, field);
  return field;
}
