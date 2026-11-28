// Flat output uses the same centreline and radius as the round material wire.
// Clip against the head before stroking so a hidden hinge cannot draw a chord.
import { hiddenFrom, type Prep, type SurfaceWire } from './body';
import { cameraInBody, D, project, type Mat3 } from './math';

export function wirePolys(wire: SurfaceWire, head: Prep, rot: Mat3, scale:number): Float64Array[] {
  const camera=cameraInBody(rot), n=wire.points.length;
  const screen=new Float64Array(n*2), visible:boolean[]=[], widths:number[]=[];
  for(let i=0;i<n;i++) {
    const [x,y,z]=wire.points[i];
    visible.push(!hiddenFrom(head,camera,x,y,z));
    project(rot,x,y,z,screen,2*i);
    const radius = wire.radius + ((wire.tipRadius ?? wire.radius)-wire.radius)*i/(n-1);
    widths.push(radius*D/(D-rot[6]*x-rot[7]*y-rot[8]*z));
  }
  const whole=wire.closed && visible.every(Boolean);
  const gap=wire.closed?visible.indexOf(false):-1;
  const start=gap<0?0:gap;
  const polygons:Float64Array[]=[];
  let outer:number[]=[],inner:number[]=[];
  for(let k=0;k<=n;k++) {
    const i=(start+k)%n;
    if(k===n || !visible[i]) {
      if(outer.length>=4) {
        const reversed:number[]=[];
        for(let j=inner.length-2;j>=0;j-=2) reversed.push(inner[j],inner[j+1]);
        if(whole) polygons.push(Float64Array.from(outer),Float64Array.from(reversed));
        else polygons.push(Float64Array.from([...outer,...reversed]));
      }
      outer=[]; inner=[];
      continue;
    }
    const a=wire.closed?(i+n-1)%n:Math.max(0,i-1), b=wire.closed?(i+1)%n:Math.min(n-1,i+1);
    const dx=screen[2*b]-screen[2*a],dy=screen[2*b+1]-screen[2*a+1];
    const r=widths[i]/(Math.hypot(dx,dy)||1),x=screen[i*2],y=screen[i*2+1];
    outer.push((x-dy*r)*scale,(y+dx*r)*scale);
    inner.push((x+dy*r)*scale,(y-dx*r)*scale);
  }
  return polygons;
}
