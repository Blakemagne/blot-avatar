import { prepare, surfaceTop, type Body, type Prep } from '../engine/body';
import { finishMesh, type CoatMesh } from '../engine/coat-surface';
import type { HeadwearSeat } from '../engine/wardrobe';
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

const scalpSeats = new WeakMap<Body,HeadwearSeat>();

/** Support an unmarked beret on the local scalp and follow its tangent.
 * Authored seats take precedence on heads with handles, horns or several lobes. */
export function scalpSeat(body: Body, box: CoatMesh['box']): HeadwearSeat {
  const cached = scalpSeats.get(body);
  if (cached) return cached;
  const top = topOf(body), hit = { z:0, nx:0, ny:0, nz:1 };
  const width = box[3]-box[0], height = box[4]-box[1];
  const face = body.eyes.cx ?? 0, half = Math.min(face-box[0],box[3]-face);
  const cx = face - .19*half, cz = (box[2]+box[5])/2;
  const sample = (x: number) => surfaceTop(top,x,cz,hit) ? hit.z : undefined;
  const y = sample(cx) ?? box[4], dx = .19*half;
  const roll = Math.atan2((sample(cx+dx) ?? y)-(sample(cx-dx) ?? y), 2*dx);
  const seat = { x: 100*(cx-box[0])/width, y:100*(y-box[1]-.095*half)/height, z:50,
    width: 137*half/width, roll: Math.max(-35, Math.min(35,roll*180/Math.PI)) };
  scalpSeats.set(body,seat);
  return seat;
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
  if (bow) {
    // Seat the knot on the chin, including recessed chins between two lobes.
    const skin = prepare(body.outline ?? body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
    const knotY = scale * (prop.box[1] + prop.box[4]) / 2;
    const height = scale * (prop.box[4] - prop.box[1]);
    for (let step = 0; step <= 8; step++) {
      const lift = step * height / 8;
      if (!surfaceTop(skin, axes[9], axes[10] + knotY + lift, hit)) continue;
      axes[10] += lift;
      axes[11] = hit.z - scale * prop.box[2] - .025 * scale;
      break;
    }
    // The wings span a wider patch of cheek than the knot. Keep the front
    // of each wing visible even on a clover or forked chin.
    let clearance = 0;
    for (let i = 0; i < prop.vertices.length; i += 6) {
      const v = prop.vertices;
      if (v[i+5] < .45) continue;
      if (surfaceTop(skin, axes[9]+scale*v[i], axes[10]+scale*v[i+1], hit)) {
        clearance = Math.max(clearance, hit.z + .018*scale - axes[11] - scale*v[i+2]);
      }
    }
    axes[11] += clearance;
  } else {
    const top = topOf(body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
    // A cap belongs on the scalp between two ears or horns. The ear tips
    // can be far higher than the forehead and should emerge behind the brim.
    const cx = body.eyes.cx ?? 0, cz = fit[11];
    const cap = ['Beanie','Beret','Hat','Crown'].includes(extra);
    let scalp = Infinity;
    if (cap && surfaceTop(top,cx,cz,hit)) {
      const forehead = hit.z;
      const wing = scale * (source[3]-source[0]) * .30;
      const raised = (x: number) => surfaceTop(top,x,cz,hit) && hit.z > forehead+.22*scale;
      if (raised(cx-wing) && raised(cx+wing)) {
        scalp = forehead+.15*scale;
        axes[11] += .24*scale;
      }
    }
    const gaps: number[] = [], verts = prop.vertices;
    const height = prop.box[4] - prop.box[1], lowest = prop.box[1] + .4 * height;
    const stride = 6 * Math.max(1, Math.floor(verts.length / (6 * 768)));
    for (let i = 0; i < verts.length; i += stride) {
      if (verts[i+1] > lowest) continue;
      const x = axes[9] + scale * verts[i], z = axes[11] + scale * verts[i+2];
      if (surfaceTop(top, x, z, hit) && hit.z <= scalp) gaps.push(hit.z - (axes[10] + scale * verts[i+1]));
    }
    if (gaps.length) {
      // Most of the rim rests on the head. Allow a little overlap for fur and tilted brims.
      gaps.sort((a,b) => a-b);
      const contact = extra === 'Beret' || extra === 'Beanie' ? .78 : .85;
      const shift = gaps[Math.floor(contact * (gaps.length - 1))] - .06 * scale * height;
      // A peaked head can pass through the open middle of a crown before it touches the rim.
      axes[10] += extra === 'Crown' && !Number.isFinite(scalp) ? Math.max(0, shift) : shift;
    }
    if (extra === 'Beanie' || extra === 'Beret' || extra === 'Hat') {
      // A pointed head can clear the brim but pierce the roof of a closed cap.
      let lift = 0;
      for (let i = 0; i < verts.length; i += stride) {
        if (verts[i+4] < .55 || verts[i+1] < lowest) continue;
        if (!surfaceTop(top, axes[9] + scale*verts[i], axes[11] + scale*verts[i+2], hit) || hit.z > scalp) continue;
        lift = Math.max(lift, hit.z + .018*scale - axes[10] - scale*verts[i+1]);
      }
      axes[10] += lift;
    }
  }
  cache.set(prop, axes);
  return axes;
}

const phoneMounts = new WeakMap<Body, readonly number[]>();

/** A handle rising beside one ear can pass behind the arch. Find a plane just
 * ahead of that handle so the band follows the head and both pads stay attached. */
export function headphoneMount(body: Body, mesh: CoatMesh, band: CoatMesh, pads: readonly CoatMesh[], fit: readonly number[]) {
  const saved = phoneMounts.get(body);
  if (saved) return saved;
  const cx = body.eyes.cx ?? 0;
  const half = Math.min(cx-mesh.box[0],mesh.box[3]-cx);
  const skin = topOf(body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
  const height = (x: number) => surfaceTop(skin,x,fit[11],hit) ? hit.z : NaN;
  const centre = height(cx), left = height(cx-.85*half), right = height(cx+.85*half);
  let axes = fit;
  if (Math.max(left,right) > centre+.5*half && Math.min(left,right) < centre-.2*half) {
    const side = right > left ? 1 : -1;
    let depth = fit[11];
    const v = mesh.vertices;
    for (let i=0; i<v.length; i+=6) {
      if (side*(v[i]-cx) > .35*half && v[i+1] > centre+.14*half) depth = Math.max(depth,v[i+2]);
    }
    const forward = [...fit];
    forward[11] = depth;
    // Keep the ear pads at their fitted height and seat the arch on the scalp
    // at its new depth. The narrow handle can emerge above the arch.
    let scalp = -Infinity;
    for (const x of [cx-.24*half,cx,cx+.24*half]) {
      if (surfaceTop(skin,x,depth,hit)) scalp = Math.max(scalp,hit.z);
    }
    const root = fit[10]+fit[4]*band.box[1];
    if (scalp > root) {
      forward[4] = (scalp+.085*fit[0]-root)/(band.box[4]-band.box[1]);
      forward[10] = root-forward[4]*band.box[1];
    }
    axes = forward;
  }
  // A flared base or pointed outline can be much wider than the head at ear height.
  const pair = [...pads].sort((a,b) => a.box[0]-b.box[0]);
  if (pair.length === 2) {
    const centres = pair.map(pad => (pad.box[0]+pad.box[3])/2);
    const positions = pair.map((pad,i) => {
      const side = i ? 1 : -1;
      const profile = prepare({ pieces: (body.outline ?? body).pieces.map(piece =>
        piece.map(([x,y,z,r]) => [y,z,side*x,r])) });
      const y = axes[10] + (axes[4]-fit[0])*(pad.box[1]+pad.box[4])/2;
      const z = fit[11] + (axes[8]-fit[0])*(pad.box[2]+pad.box[5])/2;
      let gap = Infinity;
      for (let j=0; j<pad.vertices.length; j+=6) {
        const v = pad.vertices;
        if (surfaceTop(profile,y+fit[0]*v[j+1],z+fit[0]*v[j+2],hit)) {
          gap = Math.min(gap,side*(fit[9]+fit[0]*v[j])-hit.z);
        }
      }
      const centre = fit[9]+fit[0]*centres[i];
      return Number.isFinite(gap) && (gap>0 || axes!==fit) ? centre-side*(gap+.015*half) : centre;
    });
    if (positions[1]>positions[0]) {
      const width = (positions[1]-positions[0])/(centres[1]-centres[0]);
      axes = [width,...axes.slice(1,9),positions[0]-width*centres[0],axes[10],axes[11]];
    }
  }
  phoneMounts.set(body,axes);
  return axes;
}

const bands = new WeakMap<Body, CoatMesh>();

/** Widen the shoulders of the circular band until it clears the head between the ear pads. */
export function fitHeadband(body: Body, mesh: CoatMesh, axes: readonly number[], padDepth = axes[11]) {
  const saved = bands.get(body);
  if (saved) return saved;
  const [x0, y0, , x1, y1] = mesh.box;
  const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = y1 - y0;
  const top = topOf(body), hit = { z: 0, nx: 0, ny: 0, nz: 1 };
  const bend = (padDepth-axes[11])/axes[8];
  const along = (y: number) => Math.min(1,Math.max(0,(y-y0)/ry));
  const dz = (t: number) => bend*(1-t*t*(3-2*t));
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
  for (; !bend && exponent < 10; exponent++) {
    let clear = true;
    for (let i = 0; i < vertices.length; i += stride) {
      if (vertices[i+1] < y0 + .1*ry) continue;
      const [x,y] = map(vertices[i], vertices[i+1], exponent);
      if (surfaceTop(top, axes[9] + axes[0]*x, axes[11] + axes[8]*(vertices[i+2]+dz(along(vertices[i+1]))), hit)
        && hit.z + .02 * axes[0] > axes[10] + axes[4]*y) { clear = false; break; }
    }
    if (clear) break;
  }
  // Handles and ears can stand above the centre. Lift the arch while
  // leaving both lower ends attached to the pads.
  let rise = 0;
  for (let i = 0; i < vertices.length; i += stride) {
    const [x,y] = map(vertices[i], vertices[i+1], exponent);
    const t = (y-y0)/ry;
    if (t < .3) continue;
    if (surfaceTop(top, axes[9]+axes[0]*x, axes[11]+axes[8]*(vertices[i+2]+dz(along(vertices[i+1]))), hit)) {
      rise = Math.max(rise, (hit.z + .024*axes[0] - axes[10] - axes[4]*y) / (axes[4]*t));
    }
  }
  // A handle beside a low shoulder should raise that shoulder without
  // extrapolating the entire arch above the highest point on the wearer.
  const ceiling = Math.max(...(body.outline ?? body).pieces.flat().map(([,y,,r]) => y+r)) + .06*axes[0];
  const apexRise = bend ? .15*ry : Math.max(0, (ceiling - axes[10])/axes[4] - y1);
  function lift(x: number, y: number) {
    const [px,py] = map(x,y,exponent);
    return [px,py + Math.min(rise, apexRise)*(py-y0)/ry];
  }
  let band = mesh;
  if (exponent > 2 || rise > 0 || bend) {
    const fitted = vertices.slice(), h = .0001;
    for (let i = 0; i < vertices.length; i += 6) {
      const [x,y] = lift(vertices[i], vertices[i+1]);
      const [xx,yx] = lift(vertices[i]+h, vertices[i+1]);
      const [xy,yy] = lift(vertices[i], vertices[i+1]+h);
      const det = (xx-x)*(yy-y) - (xy-x)*(yx-y);
      const t = along(vertices[i+1]), nz = vertices[i+5];
      const normalY = vertices[i+4] + nz*bend*6*t*(1-t)/ry;
      const nx = h*((yy-y)*vertices[i+3] - (yx-y)*normalY)/det;
      const ny = h*((xx-x)*normalY - (xy-x)*vertices[i+3])/det;
      const length = Math.hypot(nx,ny,nz);
      fitted.set([x,y,vertices[i+2]+dz(t),nx/length,ny/length,nz/length], i);
    }
    band = finishMesh(fitted, mesh.indices, undefined, undefined, false);
  }
  bands.set(body, band);
  return band;
}
