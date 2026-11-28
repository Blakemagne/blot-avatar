import { headRadius } from './percy-head';
import type { SurfaceWire } from '../body';
import { wireSolid } from './percy-wires';
import type { DotSolid } from '../dot-features';

type Point = readonly [number,number,number];
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

let solids: DotSolid[] | undefined;
export const percyFrameSolids = () => solids ??= percyFrames().map(wire=>wireSolid([wire],[51,47,60],'ink'));
