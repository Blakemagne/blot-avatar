import type { Body } from '../engine/body';
import { coatMesh, type CoatMesh } from '../engine/coat';
import { wardrobeSolids } from './wardrobe-solids';

const support = new WeakMap<CoatMesh, Set<number>>();
const profiles = new WeakMap<Body, Float64Array[]>();

function tip(v: Float32Array, x: number, y: number, z: number) {
  let best=-Infinity, index=0;
  for (let i=0; i<v.length; i+=6) {
    const reach = x*v[i]+y*v[i+1]+z*v[i+2];
    if (reach > best) { best=reach; index=i; }
  }
  return index;
}

/** The three convex pieces only need their outer support points in the SVG. */
export function beretProfile(body: Body) {
  const cached=profiles.get(body);
  if (cached) return cached;
  const parts=wardrobeSolids(body,coatMesh(body)).filter(s => !s.finish).map(({mesh,axes}) => {
    const v=mesh.vertices;
    let indices=support.get(mesh);
    if (!indices) {
      indices=new Set<number>();
      for (let j=0; j<192; j++) {
        const y=1-2*(j+.5)/192, r=Math.sqrt(1-y*y), a=j*Math.PI*(3-Math.sqrt(5));
        indices.add(tip(v,r*Math.cos(a),y,r*Math.sin(a)));
      }
      support.set(mesh,indices);
    }
    const points=new Set(indices);
    for (let k=0; k<3; k++) for (const dir of [-1,1]) {
      points.add(tip(v,dir*axes[k],dir*axes[k+3],dir*axes[k+6]));
    }
    const xyz=[];
    for (const i of points) for (let k=0; k<3; k++) xyz.push(
      axes[k]*v[i]+axes[k+3]*v[i+1]+axes[k+6]*v[i+2]+axes[k+9]);
    return Float64Array.from(xyz);
  });
  profiles.set(body,parts);
  return parts;
}
