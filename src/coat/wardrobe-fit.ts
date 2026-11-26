import { prepare, surfaceTop, type Body, type Prep } from '../engine/body';
import { finishMesh, type CoatMesh } from '../engine/coat-surface';
import type { DotStyle } from '../engine/dot-parts';

const attachments = new WeakMap<Body, readonly number[]>();

/** Fit accessories around the face. Handles and off-centre limbs can extend beyond it. */
export function bodyAttachment(body: Body, mesh: CoatMesh, source: CoatMesh['box']) {
  const saved = attachments.get(body);
  if (saved) return saved;
  const box = mesh.box, cx = body.eyes.cx ?? 0;
  const half = Math.min(cx - box[0], box[3] - cx);
  const band = Math.max(.18, body.eyes.x * 1.4);
  let top = -Infinity, bottom = Infinity;
  for (let k = 0; k < mesh.vertices.length; k += 6) {
    if (Math.abs(mesh.vertices[k] - cx) > band) continue;
    top = Math.max(top, mesh.vertices[k + 1]);
    bottom = Math.min(bottom, mesh.vertices[k + 1]);
  }
  const target = [cx - half, Number.isFinite(bottom) ? bottom : box[1], box[2],
    cx + half, Number.isFinite(top) ? top : box[4], box[5]];
  const scale = [0, 1, 2].map(i => (target[i+3] - target[i]) / (source[i+3] - source[i]));
  const move = scale.map((s, i) => target[i] - s * source[i]);
  const axes = [scale[0],0,0, 0,scale[1],0, 0,0,scale[2], ...move];
  attachments.set(body, axes);
  return axes;
}

const topSurfaces = new WeakMap<Body, Prep>();
const seats = new WeakMap<Body, WeakMap<CoatMesh, readonly number[]>>();

/** Look down on the actual head. A lip or shoulder can meet a hat well away from the face centre. */
function topOf(body: Body) {
  let top = topSurfaces.get(body);
  if (!top) {
    top = prepare({ pieces: (body.outline ?? body).pieces.map(piece => piece.map(([x,y,z,r]) => [x,z,y,r])) });
    topSurfaces.set(body, top);
  }
  return top;
}

/** Keep a prop rigid and seat its lower edge on the local surface of the wearer. */
export function rigidAttachment(body: Body, fit: readonly number[], source: CoatMesh['box'], prop: CoatMesh, extra: DotStyle['extra']) {
  let cache = seats.get(body);
  if (!cache) { cache = new WeakMap(); seats.set(body, cache); }
  const saved = cache.get(prop);
  if (saved) return saved;
  const bow = extra === 'Bow tie';
  const scale = fit[0], seatY = bow ? source[1] : source[4];
  const seatZ = bow ? source[5] : (source[2] + source[5]) / 2;
  const axes = [scale,0,0, 0,scale,0, 0,0,scale,
    fit[9], fit[10] + (fit[4] - scale) * seatY, fit[11] + (fit[8] - scale) * seatZ];
  if (!bow) {
    const top = topOf(body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
    const gaps: number[] = [], verts = prop.vertices;
    const height = prop.box[4] - prop.box[1], lowest = prop.box[1] + .4 * height;
    const stride = 6 * Math.max(1, Math.floor(verts.length / (6 * 768)));
    for (let i = 0; i < verts.length; i += stride) {
      if (verts[i+1] > lowest) continue;
      const x = axes[9] + scale * verts[i], z = axes[11] + scale * verts[i+2];
      if (surfaceTop(top, x, z, hit)) gaps.push(hit.z - (axes[10] + scale * verts[i+1]));
    }
    if (gaps.length) {
      // Most of the rim rests on the head. Allow a little overlap for fur and tilted brims.
      gaps.sort((a,b) => a-b);
      const softCap = extra === 'Beret' || extra === 'Beanie';
      const contact = softCap ? .45 : .85;
      const shift = gaps[Math.floor(contact * (gaps.length - 1))] - .06 * scale * height;
      // A peaked head can pass through the open middle of a crown before it touches the rim.
      axes[10] += extra === 'Crown' ? Math.max(0, shift) : shift;
    }
  }
  cache.set(prop, axes);
  return axes;
}

const bands = new WeakMap<Body, CoatMesh>();

/** Widen the shoulders of the circular band until it clears the head between the ear pads. */
export function fitHeadband(body: Body, mesh: CoatMesh, axes: readonly number[]) {
  const saved = bands.get(body);
  if (saved) return saved;
  const [x0, y0, , x1, y1] = mesh.box;
  const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = y1 - y0;
  const top = topOf(body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
  const vertices = mesh.vertices;
  // A family of rounded rectangles. The ends and the apex remain fixed for every exponent.
  function map(x: number, y: number, exponent: number) {
    const u = (x - cx) / rx, v = (y - y0) / ry;
    const reach = (Math.abs(u) ** exponent + Math.abs(v) ** exponent) ** (1 / exponent);
    const gain = reach > 0 ? Math.hypot(u,v) / reach : 1;
    return [cx + gain * (x - cx), y0 + gain * (y - y0)];
  }
  const stride = 6 * Math.max(1, Math.floor(vertices.length / (6 * 240)));
  let exponent = 2;
  for (; exponent < 10; exponent++) {
    let clear = true;
    for (let i = 0; i < vertices.length; i += stride) {
      if (vertices[i+1] < y0 + .1*ry) continue;
      const [x,y] = map(vertices[i], vertices[i+1], exponent);
      if (surfaceTop(top, axes[9] + axes[0]*x, axes[11] + axes[8]*vertices[i+2], hit)
        && hit.z + .02 * axes[0] > axes[10] + axes[4]*y) { clear = false; break; }
    }
    if (clear) break;
  }
  let band = mesh;
  if (exponent > 2) {
    const fitted = vertices.slice(), h = .0001;
    for (let i = 0; i < vertices.length; i += 6) {
      const [x,y] = map(vertices[i], vertices[i+1], exponent);
      const [xx,yx] = map(vertices[i]+h, vertices[i+1], exponent);
      const [xy,yy] = map(vertices[i], vertices[i+1]+h, exponent);
      const det = (xx-x)*(yy-y) - (xy-x)*(yx-y);
      const nx = h*((yy-y)*vertices[i+3] - (yx-y)*vertices[i+4])/det;
      const ny = h*((xx-x)*vertices[i+4] - (xy-x)*vertices[i+3])/det;
      const nz = vertices[i+5], length = Math.hypot(nx,ny,nz);
      fitted.set([x,y,vertices[i+2],nx/length,ny/length,nz/length], i);
    }
    band = finishMesh(fitted, mesh.indices, undefined, undefined, false);
  }
  bands.set(body, band);
  return band;
}
