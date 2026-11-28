import type { Body, Decal, SurfaceWire } from '../body';
import { percyPieces } from './percy-head';
import { percyFrames, percyFrameSolids } from './percy-glasses';
import { beardSolid, beardStrands } from './percy-stubble';
import { deg } from '../math';
import { percyHair, percyHairSolids } from './percy-hair';

function ink(id: string, x: number, y: number, contours: number[][]): Decal {
  return {id,at:[x-.105,y],paint:'ink',shape:'circle',w:1,h:1,contours};
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
const marks: Decal[] = [
  ink('raised brow',-.115,.35,[soft([-.153,.010,-.103,.035,-.028,.037,.055,.020,.145,-.008,.147,-.036,.118,-.038,.047,-.013,-.026,.008,-.099,.011,-.149,-.012])]),
  {...ink('brow crease',.077,.307,[soft([-.016,-.012,-.002,-.009,.016,.027,.021,.016,.012,-.009,-.002,-.023])]),paint:'stubble'},
  ink('level brow',.389,.282,[soft([-.123,-.009,-.079,.010,.016,.025,.095,.022,.126,.006,.123,-.013,.079,.000,-.013,.004,-.099,-.010,-.124,-.022])]),
  {...ink('chin fold',.125,-.555,[soft([-.187,.017,-.148,-.002,-.077,-.013,.019,-.012,.113,.004,.169,.028,.177,.052,.183,.027,.154,-.005,.093,-.023,.012,-.039,-.082,-.039,-.156,-.027,-.193,-.007])]),paint:'chin shade'},
  {...ink('nose',.143,-.032,[soft([-.024,.002,-.008,.014,.015,.016,.023,.002,.007,-.006,-.014,-.008])]),paint:'stubble'},
  ink('frown',.107,-.173,[soft([-.095,-.018,-.059,.014,.012,.026,.069,.014,.104,-.02,.087,-.037,.049,-.012,-.006,-.007,-.067,-.025])]),
];
export const percyPortrait = {yaw:deg(13),pitch:deg(2),roll:0};

const wearsFrames = (body: Body) => !body.dotStyle || body.dotStyle.glasses === 'None';

let wires: SurfaceWire[] | undefined;

export const percy: Body = {
  id:'percy',fullSpin:true,
  pieces:percyPieces,
  neutralAim:percyPortrait,
  surfaceDetails:{
    patches:percyHair, wires:()=>wires ??= [...percyFrames(),...beardStrands(percy)],
    solids:body=>[...percyHairSolids(),beardSolid(percy),...(wearsFrames(body) ? percyFrameSolids() : [])],
  },
  paint:{ink:'#332f3c',stubble:'#625b70',hair:'#322d3c','hair tie':'#714d61','crown hair':'#393342',
    'hair fibre':'#504959','hair sheen':'#635a6b','hair shadow':'#27232f',
    'tail fibre':'#474050','tail sheen':'#615868','chin shade':'#88809e'}, decals:marks,
  eyes:{frontOnly:true,open:.12,cx:.008,x:.221,y:.09,offsetY:[.03,-.03],w:.078,h:.052,slideX:.023,slideY:.012},look:.57,
};
