import type { Body, Decal, Hit } from '../body';
import { percyPieces } from './percy-head';
import { surfaceAt } from '../field';
import { D, deg } from '../math';
import { finishMesh } from '../coat-surface';
import type { DotSolid } from '../dot-features';
import { percyHair, percyHairSolids } from './percy-hair';

// The glasses are hollow so the rig can look and blink behind them.
function oval(rx: number, ry: number, tilt: number, clockwise = false) {
  const points: number[] = [];
  for (let i=0;i<48;i++) {
    const a=(clockwise ? -1 : 1)*2*Math.PI*i/48;
    const x=rx*Math.cos(a), y=ry*Math.sin(a);
    points.push(x*Math.cos(tilt)-y*Math.sin(tilt), x*Math.sin(tilt)+y*Math.cos(tilt));
  }
  return points;
}
function ink(id: string, x: number, y: number, contours: number[][], eyewear=false): Decal {
  return {id,at:[x,y],paint:'ink',shape:'circle',w:1,h:1,contours,eyewear};
}
// Round the corners of hand-drawn marks without changing the eye or lens outlines.
function soft(points: number[]) {
  const curve: number[] = [];
  for (let i=0; i<points.length; i+=2) {
    const j=(i+2)%points.length;
    for (const f of [.2,.8]) curve.push(points[i]*(1-f)+points[j]*f,points[i+1]*(1-f)+points[j+1]*f);
  }
  return curve;
}
const temples = [
  [[-.77,.165],[-.60,.154],[-.39,.153],[-.256,.14]],
  [[.513,.037],[.62,.024],[.69,-.002],[.76,-.045]],
];
function arm(centres: number[][]) {
  return [...centres.flatMap(([x,y])=>[x,y+.009]), ...centres.slice().reverse().flatMap(([x,y])=>[x,y-.009])];
}
// Drape the wire on the same sight lines as its vector drawing. The depth
// buffer then hides each arm where it runs under the hair at the temple.
let wires: DotSolid[] | undefined;
function percyTemples(): readonly DotSolid[] {
  if (wires) return wires;
  wires = temples.map(centres => {
    const verts: number[] = [], indices: number[] = [];
    const hit: Hit = {z:0,nx:0,ny:0,nz:1};
    for (let i=0; i<=36; i++) {
      const segment=Math.min(2,Math.floor(i/12)), t=i/12-segment;
      const [ax,ay]=centres[segment], [bx,by]=centres[segment+1];
      const x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
      let z=.1, found=false;
      for (let n=0; n<5; n++) {
        found=surfaceAt(percy,x*(1-z/D),y*(1-z/D),hit);
        if (!found) break;
        z=hit.z;
      }
      if (!found) continue;
      const index=verts.length/6;
      const depth=z+.007, k=1-depth/D;
      for (const offset of [-.009,.009]) verts.push(x*k,(y+offset)*k,depth,hit.nx,hit.ny,hit.nz);
      if (index) indices.push(index-2,index,index-1,index,index+1,index-1);
    }
    return {mesh:finishMesh(verts,indices,undefined,undefined,false),axes:[1,0,0,0,1,0,0,0,1,0,0,0],
      tint:[51,47,60],paintKey:'ink',finish:'wire'};
  });
  return wires;
}
const marks: Decal[] = [
  ink('raised brow',-.115,.35,[soft([-.153,.010,-.103,.035,-.028,.037,.055,.020,.145,-.008,.147,-.036,.118,-.038,.047,-.013,-.026,.008,-.099,.011,-.149,-.012])]),
  {...ink('brow crease',.077,.307,[soft([-.016,-.012,-.002,-.009,.016,.027,.021,.016,.012,-.009,-.002,-.023])]),paint:'stubble'},
  ink('level brow',.389,.282,[soft([-.123,-.009,-.079,.010,.016,.025,.095,.022,.126,.006,.123,-.013,.079,.000,-.013,.004,-.099,-.010,-.124,-.022])]),
  {...ink('left temple',0,0,[arm(temples[0])],true),solid:true},
  {...ink('right temple',0,0,[arm(temples[1])],true),solid:true},
  ink('bridge',.139,.107,[soft([-.074,-.012,-.041,.017,-.008,.031,.028,.026,.059,.004,.054,-.018,.026,.005,-.005,.011,-.037,-.003,-.066,-.029])],true),
  ...[[-.095,.115,.181,.102,-.18],[.350,.055,.169,.09,-.10]].map(([x,y,rx,ry,angle],i)=>
    ink(i?'right rim':'left rim',x,y,[oval(rx,ry,angle),oval(rx-.014,ry-.014,angle,true)],true)),
  {...ink('chin fold',.125,-.555,[soft([-.187,.017,-.148,-.002,-.077,-.013,.019,-.012,.113,.004,.169,.028,.177,.052,.183,.027,.154,-.005,.093,-.023,.012,-.039,-.082,-.039,-.156,-.027,-.193,-.007])]),paint:'chin shade'},
  {...ink('nose',.143,-.032,[soft([-.024,.002,-.008,.014,.015,.016,.023,.002,.007,-.006,-.014,-.008])]),paint:'stubble'},
  ink('frown',.107,-.173,[soft([-.095,-.018,-.059,.014,.012,.026,.069,.014,.104,-.02,.087,-.037,.049,-.012,-.006,-.007,-.067,-.025])]),
];
for (const [i,[x,y]] of [
  [-.49,-.369],[-.462,-.406],[-.42,-.478],[-.384,-.459],[-.35,-.53],[-.21,-.58],
  [-.116,-.658],[-.068,-.642],[.087,-.54],[.12,-.528],[.19,-.638],[.246,-.657],[.38,-.613],[.47,-.548],
  [.287,-.667],[.213,-.68],[-.292,-.61],[-.351,-.587],[.538,-.529],[-.423,-.514],
  [.538,-.427],[.553,-.39],[-.038,-.205],[.014,-.136],[.067,-.117],[.168,-.108],[.235,-.151],
].entries()) {
  marks.push({...ink('stubble-'+i,x,y,[oval(.005+i%3*.0017,.009+i%4*.0015,i*.81)]),paint:'stubble'});
}
export const percyPortrait = {yaw:deg(6),pitch:deg(2.5),roll:0};

export const percy: Body = {
  id:'percy',
  pieces:percyPieces,
  neutralAim:percyPortrait,
  surfaceDetails:{
    patches:percyHair,
    solids:body=>body.dotStyle && body.dotStyle.glasses!=='None' ? percyHairSolids() : [...percyHairSolids(),...percyTemples()],
  },
  paint:{ink:'#332f3c',stubble:'#625b70',hair:'#322d3c','hair tie':'#714d61','crown hair':'#393342',
    'hair fibre':'#504959','hair sheen':'#635a6b','hair shadow':'#27232f',
    'tail fibre':'#474050','tail sheen':'#615868','chin shade':'#88809e'}, decals:marks,
  eyes:{frontOnly:true,open:.12,cx:.12,x:.221,y:.09,offsetY:[.03,-.03],w:.078,h:.052,slideX:.023,slideY:.012},look:.57,
};
