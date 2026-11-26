import { finishMesh, type CoatMesh } from './coat-surface';
import { DOT_RADIUS } from './dot-depth';
import type { CatalogFitting } from './dot-catalog-fittings';

const cache = new WeakMap<CatalogFitting, CoatMesh>();
const powers = [
  [0,0,0],[1,0,0],[0,1,0],[0,0,1],
  [2,0,0],[1,1,0],[1,0,1],[0,2,0],[0,1,1],[0,0,2],
  [3,0,0],[2,1,0],[2,0,1],[1,2,0],[1,1,1],[1,0,2],[0,3,0],[0,2,1],[0,1,2],[0,0,3],
];

export function fittedMesh(template: CoatMesh, fit: CatalogFitting): CoatMesh {
  const known = cache.get(fit);
  if (known) return known;
  const vertices: number[] = [], data = template.vertices, c = fit.coefficients;
  const polynomial = Math.min(powers.length, c.length/3);
  function point(px: number, py: number, pz: number) {
    const x = (px/DOT_RADIUS-fit.mid[0])/fit.half[0];
    const y = (py/DOT_RADIUS-fit.mid[1])/fit.half[1];
    const z = (pz/DOT_RADIUS-fit.mid[2])/fit.half[2];
    const xx = [1,x,x*x,x*x*x], yy = [1,y,y*y,y*y*y], zz = [1,z,z*z,z*z*z];
    let ox=0, oy=0, oz=0, at=0;
    for (let i=0; i<polynomial; i++) {
      const [a,b,d] = powers[i], w = xx[a]*yy[b]*zz[d];
      ox += c[at++]*w; oy += c[at++]*w; oz += c[at++]*w;
    }
    if (at < c.length) {
      for (let a=-1; a<=1; a++) for (let b=-1; b<=1; b++) for (let d=-1; d<=1; d++) {
        const w = Math.exp(-2.3*((x-a)**2+(y-b)**2+(z-d)**2));
        ox += c[at++]*w; oy += c[at++]*w; oz += c[at++]*w;
      }
    }
    return [ox*DOT_RADIUS,oy*DOT_RADIUS,oz*DOT_RADIUS];
  }
  for (let i=0; i<data.length; i+=6) {
    const x=data[i],y=data[i+1],z=data[i+2],nx=data[i+3],ny=data[i+4],nz=data[i+5];
    // Transport both tangents through the fitted surface. Their cross product preserves bevel normals.
    const h=.00008, a=Math.abs(nz)<.8 ? [ny,-nx,0] : [0,nz,-ny];
    const b=[ny*a[2]-nz*a[1],nz*a[0]-nx*a[2],nx*a[1]-ny*a[0]];
    const p=point(x,y,z), pa=point(x+h*a[0],y+h*a[1],z+h*a[2]), pb=point(x+h*b[0],y+h*b[1],z+h*b[2]);
    const u=pa.map((v,j)=>v-p[j]), v=pb.map((w,j)=>w-p[j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n) || 1;
    vertices.push(...p,n[0]/length,n[1]/length,n[2]/length);
  }
  const mesh=finishMesh(vertices,Array.from(template.indices),undefined,undefined,false);
  cache.set(fit,mesh);
  return mesh;
}
