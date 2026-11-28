// Open strips laid across a parted scalp and a tapered ponytail. All coordinates
// are body-local, so the grain follows the locks through a turn or a roll.
import type { SurfacePatch } from '../body';
import { percyPieces } from './percy-head';
import { finishMesh } from '../coat-surface';
import type { DotSolid } from '../dot-features';

type Point = readonly [number, number, number];
const { PI, sin, cos, exp } = Math;
type Surface = (u: number, v: number) => Point;

const dot = (a: Point,b: Point) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Point,b: Point): Point => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (p: Point): Point => {
  const len = Math.hypot(...p) || 1;
  return [p[0]/len,p[1]/len,p[2]/len];
};
const minus = (a: Point,b: Point): Point => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const part = unit([.06,.94,.34]);
const gather = unit([-.77,-.095,-.64]);
const axis = unit(minus(part,gather));
const basisX = unit(cross(axis,[0,1,0])), basisY = cross(axis,basisX);

// Each lock lies in a plane passing through the part and the gathering point.
// The angle of that plane supplies a seam-free coordinate for the strand dye.
function lockAngle(direction: Point) {
  const p=minus(direction,gather);
  return Math.atan2(dot(p,basisY),dot(p,basisX));
}
function scalpComb(point: Point): Point {
  const direction=unit(point);
  return unit(cross(cross(axis,minus(direction,gather)),direction));
}

// Cache the distance to the actual head along a latitude-longitude grid.
// This puts the roots on the broad cheeks as well as the narrower forehead.
const longitude = 96, latitude = 48;
let radii: Float32Array | undefined;
function headRadius(a: number, lat: number) {
  if (!radii) {
    radii = new Float32Array(longitude*(latitude+1));
    // The convex head is bounded by its tangent planes. Intersect radial
    // rays with those planes once, including the differently shaped back.
    const planes: number[] = [];
    for (let j=0;j<=24;j++) for (let i=0;i<48;i++) {
      const a=i*2*PI/48, b=PI*(j/24-.5);
      const x=cos(b)*sin(a), y=sin(b), z=cos(b)*cos(a);
      const support=Math.max(...percyPieces[0].map(([cx,cy,cz,r])=>cx*x+cy*y+cz*z+r));
      planes.push(x/support,y/support,z/support);
    }
    for (let j=0;j<=latitude;j++) for (let i=0;i<longitude;i++) {
      const angle = i*2*PI/longitude, b = PI*(j/latitude-.5);
      const x=cos(b)*sin(angle), y=sin(b), z=cos(b)*cos(angle);
      let inverseRadius=0;
      for (let k=0;k<planes.length;k+=3) {
        inverseRadius=Math.max(inverseRadius,x*planes[k]+y*planes[k+1]+z*planes[k+2]);
      }
      radii[j*longitude+i]=1/inverseRadius;
    }
  }
  const u = ((a/(2*PI)%1+1)%1)*longitude, i=Math.floor(u), k=(i+1)%longitude;
  const v = Math.max(0, Math.min(latitude,(lat/PI+.5)*latitude)), j=Math.min(latitude-1,Math.floor(v));
  const blend = (row: number)=>radii![row*longitude+i]*(1-u+i)+radii![row*longitude+k]*(u-i);
  return blend(j)*(1-v+j)+blend(j+1)*(v-j);
}

function hairline(a: number) {
  const angle = Math.atan2(sin(a), cos(a));
  const part = exp(-((angle - .08) ** 2) / .067);
  const temple = exp(-((Math.abs(angle) - 1.38) ** 2) / .029);
  const forelock = exp(-((angle+.47)**2)/.0025);
  return .19*Math.max(0,sin(a))**2 - .20 + .94*cos(a) + .16*Math.max(0,cos(a))**2 + .20*part - .15*temple + .10*sin(a) + .042*sin(4*a) - .065*forelock + .068*exp(-((angle+.53)**2)/.030);
}

function scalp(a: number, height: number): Point {
  const angle=Math.atan2(sin(a),cos(a)), edge=hairline(a);
  const lat = edge + (PI / 2 - edge) * height;
  const volume = .014 + .052*sin(PI*height/2) + .025*cos(lat)*exp(-((angle+.46)**2)/.38)*sin(PI*height);
  const x = cos(lat)*sin(a);
  const crest = .046*exp(-((x+.23)**2)/.011) - .015*exp(-((x+.075)**2)/.004);
  const direction: Point=[x,sin(lat),cos(lat)*cos(a)];
  const proximity = Math.max(0,1-dot(direction,gather));
  const funnel = .153*exp(-proximity/.033);
  const groove = .003*cos(14*lockAngle(direction))*sin(PI*height)*Math.min(1,proximity/.012);
  const radius = headRadius(a,lat)+volume+crest*height**2+funnel+groove;
  return [radius*cos(lat)*sin(a),radius*sin(lat),radius*cos(lat)*cos(a)];
}

let nape: Point | undefined;
const tieAt = .091, tieHalf = .018;

function centreline(t: number): Point {
  if (!nape) {
    const a=Math.atan2(gather[0],gather[2]), edge=hairline(a);
    nape=scalp(a,(Math.asin(gather[1])-edge)/(PI/2-edge));
  }
  const reach=.245*(1-exp(-t/.090))-.144;
  // Below the elastic the weight falls almost vertically. The lower
  // bundle bends back towards the jaw before the free tip hooks out.
  const wave=sin(2*PI*t);
  const bend=(.061+.027*wave)*wave*sin(PI*Math.max(0,Math.min(1,t)));
  return [nape[0]+gather[0]*reach-bend+.05*t*t-.16*t**3-.088*t**6,
    nape[1]+gather[1]*reach-1.34*t*t/(t+.16),
    nape[2]+gather[2]*reach+.13*t+.045*t*t];
}
const tailComb = (t: number) => unit(minus(centreline(t+.0001),centreline(t-.0001)));

function tail(a: number, t: number, offset=0): Point {
  const centre=centreline(t), tangent=tailComb(t);
  const u=unit(cross([0,0,1],tangent)), v=cross(tangent,u);
  // A shallow waist seats the elastic. Loose hair blooms below it.
  const waist=.029*exp(-((t-tieAt)**2)/.002);
  const radius=(.089+.099*sin(PI*t)+.041*exp(-((t/.077)**2))-waist)*(1-t**3.7)+offset;
  const side=radius*cos(a), depth=.94*radius*sin(a);
  return [centre[0]+side*u[0]+depth*v[0],centre[1]+side*u[1]+depth*v[1],centre[2]+side*u[2]+depth*v[2]];
}

// One small lock curls away from the gathered point below the jaw.
function looseEnd(a: number, t: number): Point {
  const u = .70+.235*t;
  const [x,y,z] = tail(Math.PI,u);
  const width = .025*(1-t*t);
  return [x+.015-.028*sin(PI*t)-.035*t*t+width*cos(a), y, z+.036+width*sin(a)];
}

function tie(a: number, v: number): Point {
  return tail(a,tieAt+tieHalf*(2*v-1),.009+.009*sin(PI*v));
}

let hair: SurfacePatch[] | undefined;
export function percyHair(): readonly SurfacePatch[] {
  if (hair) return hair;
  const patches: SurfacePatch[] = [];
  // The rest of the renderer uses paths. Each strip has two edges and can
  // be clipped to the visible runs of quads without any interior seams.
  function strip(paint: string, n: number, sample: Surface, behind = false) {
    const points = new Float64Array(6*(n+1));
    for (let i=0; i<=n; i++) {
      points.set(sample(i/n,0), i*6);
      points.set(sample(i/n,1), i*6+3);
    }
    patches.push({paint,points,...(behind ? {seatNormal:gather} : {})});
  }
  for (let row=0; row<12; row++) {
    strip('crown hair',72,(u,v)=>scalp(2*PI*u,(row+v)/12));
  }
  // Turn the cut edge under to meet the skin, particularly at the temples.
  strip('crown hair',72,(u,v)=>hem(2*PI*u,v));
  // The vector renderer traces the same family of circular arcs on the scalp.
  const mid: Point=[(part[0]+gather[0])/2,(part[1]+gather[1])/2,(part[2]+gather[2])/2];
  const half=Math.hypot(...minus(part,gather))/2;
  function strand(angle: number,t: number) {
    const c=cos(angle),s=sin(angle);
    const side: Point=[basisX[0]*c+basisY[0]*s,basisX[1]*c+basisY[1]*s,basisX[2]*c+basisY[2]*s];
    const b=dot(mid,side), start=Math.atan2(b,half), theta=start+(PI-2*start)*t;
    const radius=Math.hypot(half,b), length=radius*cos(theta), offset=radius*sin(theta)-b;
    const p=unit([mid[0]+axis[0]*length+side[0]*offset,mid[1]+axis[1]*length+side[1]*offset,mid[2]+axis[2]*length+side[2]*offset]);
    const a=Math.atan2(p[0],p[2]), edge=hairline(a);
    return {a,h:(Math.asin(Math.max(-1,Math.min(1,p[1])))-edge)/(PI/2-edge)};
  }
  for (let i=0;i<98;i++) {
    const angle=i*2*PI/98;
    const ink=i%7===0 ? 'hair sheen' : i%3===0 ? 'hair shadow' : 'hair fibre';
    let start=-1;
    for (let j=0;j<=42;j++) {
      const visible=j<42 && strand(angle,(j+.5)/42).h>0;
      if (visible && start<0) start=j;
      if (visible || start<0) continue;
      const from=start, count=j-start;
      strip(ink,count,(u,v)=>{
        const t=(from+u*count)/42;
        const {a,h}=strand(angle+(v-.5)*.020*sin(PI*u),t);
        return scalp(a,Math.max(0,h));
      });
      start=-1;
    }
  }
  // Tail axis points down. Increasing azimuth then increasing length gives
  // an outward winding, the same as increasing azimuth and height on the cap.
  for (let row=0; row<18; row++) {
    strip('hair',36,(u,v)=>tail(2*PI*u,tieAt+(1-tieAt)*(row+v)/18),true);
    strip('hair',20,(u,v)=>looseEnd(2*PI*u,(row+v)/18),true);
  }
  for (let i=0; i<34; i++) {
    strip(i%4===0 ? 'tail sheen' : 'tail fibre',22,(u,v)=>{
      const t = tieAt + (.985-tieAt)*u;
      const a = 2*PI*i/34 + .62*sin(PI*t) - (v-.5)*.09*sin(PI*u);
      return tail(a,t);
    },true);
  }
  strip('hair tie',36,(u,v)=>tie(2*PI*u,v),true);
  return hair = patches;
}

function hem(a: number, v: number): Point {
  const [x,y,z] = scalp(a,0);
  const r = .961+.039*v;
  return [x*r,y*r,z*r];
}

// The material renderer uses the same surface as the flat silhouette. Its
// strand coordinate stays fixed in the mesh, including at the rear seam.
function groomedMesh(surface: Surface, fibre: (a: number, t: number, pos: Point)=>number, rows: number,
  comb?: (point: Point)=>Point, skipBand=false) {
  const cols = 96, verts: number[] = [], indices: number[] = [], grain: number[] = [];
  for (let row=0; row<=rows; row++) for (let col=0; col<=cols; col++) {
    const a = 2*PI*col/cols, t = row/rows;
    const pos = surface(a,t), u = Math.max(.0001,Math.min(.9999,t));
    const l = surface(a-.0001,u), r = surface(a+.0001,u);
    const b = surface(a,u-.0001), h = surface(a,u+.0001);
    const dx=r[0]-l[0], dy=r[1]-l[1], dz=r[2]-l[2];
    const ex=h[0]-b[0], ey=h[1]-b[1], ez=h[2]-b[2];
    const nx=dy*ez-dz*ey, ny=dz*ex-dx*ez, nz=dx*ey-dy*ex;
    const len=Math.hypot(nx,ny,nz) || 1;
    verts.push(...pos,nx/len,ny/len,nz/len);
    const phase=fibre(a,t,pos);
    grain.push(cos(phase),sin(phase));
    if (col<cols && row<rows) {
      const i=row*(cols+1)+col;
      indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1);
    }
  }
  const skip = skipBand ? (i: number)=>Math.abs(Math.floor(i/(cols*6))/rows-tieAt)<tieHalf+.026 : undefined;
  const mesh=finishMesh(verts,indices,skip,undefined,!!comb);
  const tangents=new Float32Array(mesh.roots.length/8*3);
  if (comb) for (let i=0;i<mesh.roots.length;i+=8) {
    tangents.set(comb([mesh.roots[i],mesh.roots[i+1],mesh.roots[i+2]]),3*i/8);
  }
  return {...mesh,grain:Float32Array.from(grain),tangents};
}

let solids: DotSolid[] | undefined;
export function percyHairSolids(): readonly DotSolid[] {
  if (solids) return solids;
  const axes = [1,0,0,0,1,0,0,0,1,0,0,0];
  const flow = (_a: number,_t: number,p: Point) => lockAngle(unit(p));
  const cap: DotSolid = {mesh:groomedMesh(scalp,flow,42,scalpComb),axes,tint:[49,45,55],paintKey:'hair',finish:'hair'};
  const edge = {...cap,mesh:groomedMesh(hem,flow,1)};
  // Find the closest point on the guide once per rooted fibre. Its tangent
  // keeps the strands along the ponytail as the gathered section turns down.
  const guide=Array.from({length:65},(_,i)=>({p:centreline(i/64),t:tailComb(i/64)}));
  const combTail = (p: Point) => {
    let best=Infinity, nearest=0;
    for (let i=0;i<guide.length;i++) {
      const q=guide[i].p, dx=p[0]-q[0],dy=p[1]-q[1],dz=p[2]-q[2];
      const d=dx*dx+dy*dy+dz*dz;
      if (d<best) {best=d;nearest=i;}
    }
    return guide[nearest].t;
  };
  const pony = {...cap,mesh:groomedMesh(tail,(a,t)=>a-.52*sin(PI*t),56,combTail,true)};
  const band: DotSolid = {mesh:groomedMesh(tie,()=>0,8),axes,tint:[113,77,97],paintKey:'hair tie',finish:'wire'};
  const lock = {...pony,mesh:groomedMesh(looseEnd,a=>a,16,combTail)};
  return solids = [cap,edge,pony,lock,band];
}
