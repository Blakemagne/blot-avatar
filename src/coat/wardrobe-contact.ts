import { frontDepth } from './face-surface';
import { finishMesh, type CoatMesh } from '../engine/coat-surface';
import type { Body } from '../engine/body';
import type { DotSolid } from '../engine/dot-features';

type Point = [number, number, number];
type Contact = { source: CoatMesh; mesh: CoatMesh };
const byWearer = new WeakMap<Body, Contact[]>();
const identity = [1,0,0, 0,1,0, 0,0,1, 0,0,0] as const;

function pointAt(solid: DotSolid, i: number): Point {
  const a = solid.axes, v = solid.mesh.vertices;
  return [0,1,2].map(k => a[k]*v[i] + a[3+k]*v[i+1] + a[6+k]*v[i+2] + a[9+k]) as Point;
}

/** Seat a small span between the back of the fitting and the nearest point on
 * the shell. Both ends terminate inside the adjoining surfaces. */
function contactMesh(shell: CoatMesh, start: Point, radius: number): CoatMesh | undefined {
  const v = shell.vertices;
  let best = Infinity, hit = 0;
  for (let i = 0; i < v.length; i += 6) {
    const dx = start[0]-v[i], dy = start[1]-v[i+1], dz = start[2]-v[i+2];
    const d = dx*dx + dy*dy + dz*dz;
    if (d < best) { best = d; hit = i; }
  }
  const length = Math.sqrt(best);
  if (length < radius * 1.3) return;
  const axis = start.map((x,k) => (x-v[hit+k])/length);
  if (axis.reduce((sum,x,k) => sum+x*v[hit+3+k],0) < .15) return;
  const [x,y,z] = axis;
  const u = Math.abs(z) < .85 ? [-y,x,0] : [0,-z,y];
  const norm = Math.hypot(...u);
  for (let k = 0; k < 3; k++) u[k] /= norm;
  const w = [y*u[2]-z*u[1], z*u[0]-x*u[2], x*u[1]-y*u[0]];
  const vertices: number[] = [], indices: number[] = [], sides = 16;
  for (const distance of [-length-radius*.8, radius*.4]) {
    for (let i = 0; i < sides; i++) {
      const angle = i*2*Math.PI/sides;
      const normal = u.map((n,k) => n*Math.cos(angle) + w[k]*Math.sin(angle));
      vertices.push(...start.map((c,k) => c+axis[k]*distance+radius*normal[k]), ...normal);
    }
  }
  for (let i = 0; i < sides; i++) {
    const j = (i+1) % sides;
    indices.push(i,j,i+sides, j,j+sides,i+sides);
  }
  return finishMesh(vertices,indices,undefined,undefined,false);
}

function mountContacts(shell: CoatMesh, gear: DotSolid[], bow: boolean): Contact[] {
  if (!gear.length) return [];
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const part of gear) {
    for (let i = 0; i < part.mesh.vertices.length; i += 6) {
      const [x,y] = pointAt(part,i);
      left = Math.min(left,x); right = Math.max(right,x);
      bottom = Math.min(bottom,y); top = Math.max(top,y);
    }
  }
  const width = right-left, cy = (bottom+top)/2;
  // Use the shortest seat underneath each lens or the centre of the bow.
  // A fitting already touching the shell needs no extra geometry.
  const contacts: Contact[] = [];
  for (const fraction of bow ? [.5] : [.25,.75]) {
    const x = left+fraction*width;
    let closest = Infinity, start: Point | undefined, source: CoatMesh | undefined;
    for (const part of gear) {
      for (let i = 0; i < part.mesh.vertices.length; i += 6) {
        const p = pointAt(part,i);
        if (Math.abs(p[0]-x) > width*(bow ? .26 : .244)) continue;
        const depth = frontDepth(shell,p[0],p[1]);
        if (depth === undefined) continue;
        const gap = p[2]-depth;
        if (gap <= .005) { closest = -Infinity; start = undefined; break; }
        const score = gap + .10*Math.hypot(p[0]-x,p[1]-cy);
        if (score < closest) { closest = score; start = p; source = part.mesh; }
      }
    }
    if (!start || !source) continue;
    const mesh = contactMesh(shell,start,width*(bow ? .034 : .011));
    if (mesh) contacts.push({source, mesh});
  }
  return contacts;
}

/** Open-backed frames and bows have a visible air gap in profile on some
 * wearers. Fit the temples and knot once, including left and right mounts. */
export function seatWardrobe(body: Body, shell: CoatMesh, solids: DotSolid[]): void {
  let contacts = byWearer.get(body);
  if (!contacts) {
    const frames = solids.filter(s => s.contact === 'frame');
    const bow = solids.filter(s => s.contact === 'bow');
    contacts = [...mountContacts(shell,frames,false), ...mountContacts(shell,bow,true)];
    byWearer.set(body,contacts);
  }
  for (const contact of contacts) {
    const original = solids.find(s => s.mesh === contact.source);
    if (original) solids.push({ ...original, mesh: contact.mesh, axes: identity });
  }
}
