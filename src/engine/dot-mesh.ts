import { radialMesh } from './dot-radial-mesh';
import { fixedMicrogeometry } from './dot-fixed-microgeometry';
import { fixedRims } from './dot-fixed-rims';
import { finishMesh, type CoatMesh } from './coat-surface';
import { catalogVolumes } from './dot-catalog-volumes';
import { portraitVolumes } from './dot-portrait-volumes';
import { wardrobeMesh } from './dot-wardrobe';
import { bulbMesh } from './dot-solid';
import { ornamentVolumes } from './dot-ornaments';
import { dotVolumes, type DotVolume } from './dot-volumes';

import { DOT_RADIUS, HALF, sample } from './dot-depth';
export { DOT_RADIUS } from './dot-depth';

const cache = new WeakMap<DotVolume, CoatMesh>();

/** Tessellate both sheets of the implicit volume; they share the vertices along their equator. */
export function dotMesh(id: string): CoatMesh | undefined {
  const radial = radialMesh(id);
  if (radial) return radial;
  if (id === 'Bulb') return bulbMesh(DOT_RADIUS);
  const solid = wardrobeMesh(id, DOT_RADIUS);
  if (solid) return solid;
  const field = portraitVolumes[id] ?? catalogVolumes[id] ?? dotVolumes[id] ?? ornamentVolumes[id];
  if (!field) return;
  const cached = cache.get(field);
  if (cached) return cached;
  const origin = field.origin ?? [0, 0, 0], radius = field.radius ?? 1;
  const rim = fixedRims[id];
  const bytes = rim ? Uint8Array.from(atob(rim), c => c.charCodeAt(0)) : undefined;
  const equator = bytes && new DataView(bytes.buffer);
  const { thicknessSquared, grid } = field;
  function q(x: number, y: number) {
    const value = sample(thicknessSquared, grid, x, y);
    if (!equator) return value;
    const a = (Math.atan2(y,x)/(2*Math.PI) + 1) * 1024;
    const i = Math.floor(a), t = a-i, j = (i & 1023)*4, k = ((i+1) & 1023)*4;
    const reach = ((1-t)*equator.getUint16(j,true) + t*equator.getUint16(k,true)) / 10000;
    const distance = reach - Math.hypot(x,y);
    if (distance >= .055) return value;
    const slope = ((1-t)*equator.getUint16(j+2,true) + t*equator.getUint16(k+2,true)) / 1000;
    const w = Math.max(0,Math.min(1,(distance-.012)/.043));
    const blend = w*w*(3-2*w);
    return slope*distance*(1-blend) + value*blend;
  }
  const m = (x: number, y: number) => field.centre ? sample(field.centre, field.grid, x, y) : 0;
  const mesh = sectionMesh(origin, radius, equator ? 128 : 96, q, m, !field.origin, fixedMicrogeometry[id]);
  cache.set(field, mesh);
  return mesh;
}

/** Triangulate the front and back of a measured section, sharing the zero-thickness edge. */
export function sectionMesh(origin: readonly number[], radius: number, steps: number,
  q: (x: number, y: number) => number, m: (x: number, y: number) => number, hair = false, fine?: string): CoatMesh {
  const stride = steps + 1, delta = 1 / 512;
  const verts: number[] = [], indices: number[] = [];
  const values = new Float64Array(stride * stride);
  const front = new Int32Array(values.length).fill(-1);
  const back = new Int32Array(values.length).fill(-1);
  const edges = new Map<number, number>();
  const coord = (i: number) => HALF * (2 * i / steps - 1);

  function vertex(x: number, y: number, height: number) {
    const nx = -(q(x + delta, y) - q(x - delta, y) + 2 * height * (m(x + delta, y) - m(x - delta, y))) / (2 * delta);
    const ny = -(q(x, y + delta) - q(x, y - delta) + 2 * height * (m(x, y + delta) - m(x, y - delta))) / (2 * delta);
    const nz = 2 * height, length = Math.hypot(nx, ny, nz) || 1;
    const at = verts.length / 6;
    verts.push((origin[0] + x * radius) * DOT_RADIUS, (origin[1] + y * radius) * DOT_RADIUS,
      (origin[2] + (m(x, y) + height) * radius) * DOT_RADIUS, nx / length, ny / length, nz / length);
    return at;
  }
  for (let j = 0; j < stride; j++) for (let i = 0; i < stride; i++) {
    values[j * stride + i] = q(coord(i), coord(j));
  }
  // A body has one continuous shell. Cubic extrapolation near the measurement boundary
  // can otherwise introduce disconnected zero crossings beyond the actual silhouette.
  if (hair) {
    const center = Math.floor(stride / 2) * (stride + 1);
    const pending = [center], seen = new Uint8Array(values.length);
    seen[center] = 1;
    for (let i = 0; i < pending.length; i++) {
      const k = pending[i];
      for (const other of [k - stride, k + stride, k - 1, k + 1]) {
        if (other < 0 || other >= values.length || Math.abs(k % stride - other % stride) > 1) continue;
        if (!seen[other] && values[other] > 0) { seen[other] = 1; pending.push(other); }
      }
    }
    for (let k = 0; k < values.length; k++) if (!seen[k] && values[k] > 0) values[k] = -values[k];
  }
  for (let j = 0; j < stride; j++) for (let i = 0; i < stride; i++) {
    const k = j * stride + i, x = coord(i), y = coord(j);
    if (values[k] <= 0) continue;
    const height = Math.sqrt(values[k]);
    front[k] = vertex(x, y, height);
    back[k] = vertex(x, y, -height);
  }
  function boundary(a: number, b: number) {
    const key = Math.min(a, b) * values.length + Math.max(a, b);
    const saved = edges.get(key);
    if (saved !== undefined) return saved;
    const t = values[a] / (values[a] - values[b]);
    const x = coord((a % stride) * (1 - t) + (b % stride) * t);
    const y = coord(Math.floor(a / stride) * (1 - t) + Math.floor(b / stride) * t);
    const at = vertex(x, y, 0);
    edges.set(key, at);
    return at;
  }
  function face(a: number, b: number, c: number) {
    if (front[a] < 0 && front[b] < 0 && front[c] < 0) return;
    if (front[a] >= 0 && front[b] >= 0 && front[c] >= 0) {
      indices.push(front[a], front[b], front[c], back[c], back[b], back[a]);
      return;
    }
    const near: number[] = [], far: number[] = [];
    for (const [u, v] of [[a,b], [b,c], [c,a]]) {
      if (front[u] >= 0) { near.push(front[u]); far.push(back[u]); }
      if ((front[u] >= 0) !== (front[v] >= 0)) {
        const edge = boundary(u, v);
        near.push(edge); far.push(edge);
      }
    }
    for (let i = 2; i < near.length; i++) indices.push(near[0], near[i-1], near[i], far[i], far[i-1], far[0]);
  }
  for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) {
    const a = j * stride + i, c = a + stride + 1;
    face(a, a + 1, c); face(a, c, a + stride);
  }
  if (fine) {
    const bytes = atob(fine);
    let offset = 0;
    const next = () => {
      const v = bytes.charCodeAt(offset++);
      if (v !== 128) return v > 127 ? v - 256 : v;
      const word = bytes.charCodeAt(offset++) | (bytes.charCodeAt(offset++) << 8);
      return word > 32767 ? word - 65536 : word;
    };
    for (let i = 0; i < verts.length; i += 6) {
      verts[i+2] += next() * DOT_RADIUS / 40000;
      for (let j = 3; j < 6; j++) verts[i+j] += next() / 30000;
    }
    if (offset !== bytes.length) throw new Error('Dot surface calibration has a different vertex count');
  }
  return finishMesh(verts, indices, undefined, undefined, hair);
}
