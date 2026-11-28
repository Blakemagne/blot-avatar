import type { SurfaceWire } from '../body';
import { finishMesh } from '../coat-surface';
import type { DotSolid } from '../dot-features';

type Point = readonly [number,number,number];
const cross = (a:Point,b:Point): Point => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function unit(x:number,y:number,z:number): Point {
  const n=Math.hypot(x,y,z);
  return [x/n,y/n,z/n];
}
function appendTube({points,closed,radius,tipRadius}:SurfaceWire,vertices:number[],indices:number[]) {
  const offset=vertices.length/6;
  const n=points.length,sides=8;
  for(let i=0;i<n;i++) {
    const prev=points[closed?(i+n-1)%n:Math.max(0,i-1)], next=points[closed?(i+1)%n:Math.min(n-1,i+1)];
    const t=unit(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2]);
    const axis: Point = closed || (tipRadius !== undefined && Math.abs(t[1]) > .99) ? [0,0,1] : [0,1,0];
    const normal=unit(...cross(t,axis)), binormal=cross(t,normal);
    const r=radius+((tipRadius ?? radius)-radius)*i/(n-1);
    for(let j=0;j<sides;j++) {
      const angle=j*2*Math.PI/sides,c=Math.cos(angle),s=Math.sin(angle);
      const nx=c*normal[0]+s*binormal[0],ny=c*normal[1]+s*binormal[1],nz=c*normal[2]+s*binormal[2];
      vertices.push(points[i][0]+r*nx,points[i][1]+r*ny,points[i][2]+r*nz,nx,ny,nz);
      if(!closed && i===n-1) continue;
      const k=i*sides+j, l=i*sides+(j+1)%sides, m=(i+1)%n*sides;
      indices.push(offset+k,offset+l,offset+m+j,offset+l,offset+m+(j+1)%sides,offset+m+j);
    }
  }
}

export function wireSolid(wires:readonly SurfaceWire[],tint:DotSolid['tint'],paintKey:string): DotSolid {
  const vertices:number[]=[],indices:number[]=[];
  for (const wire of wires) appendTube(wire,vertices,indices);
  return {mesh:finishMesh(vertices,indices,undefined,undefined,false),axes:[1,0,0,0,1,0,0,0,1,0,0,0],tint,finish:'wire',paintKey};
}
