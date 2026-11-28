import { headRadius } from './percy-head';
import type { SurfaceWire } from '../body';
import { finishMesh } from '../coat-surface';
import type { DotSolid } from '../dot-features';

type Point = readonly [number,number,number];
const cross = (a:Point,b:Point): Point => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function unit(x:number,y:number,z:number): Point {
  const n=Math.hypot(x,y,z);
  return [x/n,y/n,z/n];
}
function bridge(a:Point,b:Point,c:Point,d:Point): SurfaceWire {
  const points: Point[]=[];
  for(let i=0;i<=24;i++) {
    const t=i/24,s=1-t;
    const at=(k:number)=>s**3*a[k]+3*s*s*t*b[k]+3*s*t*t*c[k]+t**3*d[k];
    points.push([at(0),at(1),at(2)]);
  }
  return {id:'bridge',radius:.0085,points};
}

// Each lens has its own plane and a slight wrap at the hinge. The bridge
// and temples start on those very rims, so nothing separates edge-on.
function rim(side:number,a:number): Point {
  const u=.154*Math.cos(a), v=.085*Math.sin(a);
  const x=.197*side+u+.12*v;
  return [x,.081-.024*side+v-.12*u,.585-side*.29*u-.11*v];
}
function temple(side:number,hinge:Point): Point[] {
  const from=Math.atan2(hinge[0],hinge[2]), to=side*1.86;
  const start=Math.hypot(...hinge);
  const clearance=start-headRadius(from,Math.asin(hinge[1]/start));
  const points:Point[]=[];
  for(let i=0;i<=40;i++) {
    const t=i/40,angle=from+(to-from)*t;
    const y=hinge[1]+(.048-hinge[1])*t*t;
    // Let the stand-off at the hinge fade along the arm. Its tip passes
    // under the hair, just outside the skull on either side.
    const offset=.007+(clearance-.007)*(1-t)**4;
    let r=start;
    for(let j=0;j<4;j++) r=headRadius(angle,Math.asin(y/r))+offset;
    const width=Math.sqrt(r*r-y*y);
    points.push(i ? [width*Math.sin(angle),y,width*Math.cos(angle)] : hinge);
  }
  return points;
}

let wires:SurfaceWire[] | undefined;
export function percyFrames(): readonly SurfaceWire[] {
  if(wires) return wires;
  wires=[];
  for(const side of [-1,1]) {
    const name=side<0?'left':'right', hinge=rim(side,side<0?Math.PI:0);
    wires.push({id:name+' rim',radius:.008,closed:true,points:Array.from({length:64},(_,i)=>rim(side,i*Math.PI/32))});
    wires.push({id:name+' temple',radius:.008,points:temple(side,hinge)});
  }
  const a=rim(-1,0), b=rim(1,Math.PI);
  wires.push(bridge(a,[a[0]+.029,a[1]+.046,.623],[b[0]-.025,b[1]+.052,.624],b));
  return wires;
}

function tube({points,closed,radius}:SurfaceWire): DotSolid {
  const vertices:number[]=[],indices:number[]=[];
  const n=points.length,sides=8;
  for(let i=0;i<n;i++) {
    const prev=points[closed?(i+n-1)%n:Math.max(0,i-1)], next=points[closed?(i+1)%n:Math.min(n-1,i+1)];
    const t=unit(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2]);
    const normal=unit(...cross(t,closed?[0,0,1]:[0,1,0])), binormal=cross(t,normal);
    for(let j=0;j<sides;j++) {
      const angle=j*2*Math.PI/sides,c=Math.cos(angle),s=Math.sin(angle);
      const nx=c*normal[0]+s*binormal[0],ny=c*normal[1]+s*binormal[1],nz=c*normal[2]+s*binormal[2];
      vertices.push(points[i][0]+radius*nx,points[i][1]+radius*ny,points[i][2]+radius*nz,nx,ny,nz);
      if(!closed && i===n-1) continue;
      const k=i*sides+j, l=i*sides+(j+1)%sides, m=(i+1)%n*sides;
      indices.push(k,l,m+j,l,m+(j+1)%sides,m+j);
    }
  }
  return {mesh:finishMesh(vertices,indices,undefined,undefined,false),axes:[1,0,0,0,1,0,0,0,1,0,0,0],tint:[51,47,60],finish:'wire',paintKey:'ink'};
}
let solids: DotSolid[] | undefined;
export const percyFrameSolids = () => solids ??= percyFrames().map(tube);
