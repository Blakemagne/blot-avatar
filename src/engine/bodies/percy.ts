import type { Body, Decal } from '../body';

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
// Each strip hugs the scalp independently when the far temple goes out of view.
const fringe = [
  [-.69,.15,.18],[-.66,.17,.28],[-.61,.24,.36],[-.54,.33,.45],
  [-.48,.36,.50],[-.42,.34,.54],[-.34,.45,.59],[-.25,.51,.62],
  [-.13,.56,.65],[0,.54,.66],[.10,.55,.66],[.21,.57,.64],
  [.32,.56,.60],[.44,.53,.54],
];
const strips = fringe.slice(1).map(([x,lo,hi],i) => {
  const [prev,leftLow,leftHigh] = fringe[i];
  return [prev,leftLow,x,lo,x,hi,prev,leftHigh];
});
const marks: Decal[] = [
  ink('swept fringe',0,0,strips),
  ink('raised brow',-.19,.32,[soft([-.13,0,-.065,.048,.045,.05,.13,.015,.12,-.012,.025,.008,-.065,.008,-.126,-.022])]),
  ink('level brow',.29,.29,[soft([-.105,-.012,-.055,.019,.057,.024,.115,.002,.106,-.019,.02,-.006,-.095,-.029])]),
  ink('left temple',-.44,.09,[soft([-.25,.064,.05,.017,.05,-.016,-.24,.022])],true),
  ink('right temple',.49,.09,[soft([-.01,.021,.215,-.014,.228,-.052,0,-.016])],true),
  ink('bridge',.045,.11,[soft([-.083,.004,-.052,.051,0,.071,.06,.047,.088,.003,.064,-.014,.032,.018,-.008,.027,-.056,.008,-.07,-.013])],true),
  ...[-1,1].map(side=>ink(side<0?'left rim':'right rim',.045+side*.258,.10,[oval(.210,.153,-.055),oval(.182,.124,-.055,true)],true)),
  ink('frown',.08,-.205,[soft([-.095,-.018,-.059,.014,.012,.026,.069,.014,.104,-.02,.087,-.037,.049,-.012,-.006,-.007,-.067,-.025])]),
];
for (const [i,[x,y]] of [[-.32,-.32],[-.265,-.355],[-.19,-.366],[.24,-.357],[.30,-.324]].entries()) {
  marks.push(ink('stubble-'+i,x,y,[oval(.012,.018,i*.61)]));
}
export const percy: Body = {
  id:'percy',
  pieces:[[[-.13,.025,0,.63],[.14,.025,0,.63],[-.21,-.13,0,.54],[.18,-.13,0,.55],[.01,-.20,0,.51]]],
  backDetails:[{paint:'hair',pieces:[
    [[-.29,.29,-.14,.38],[.02,.31,-.15,.40],[.27,.25,-.15,.32],[-.49,.10,-.15,.28]],
    [[-.56,-.04,-.23,.16],[-.70,-.16,-.24,.17]],
    [[-.72,-.19,-.25,.16],[-.78,-.32,-.22,.17],[-.77,-.46,-.20,.155]],
    [[-.77,-.43,-.20,.15],[-.72,-.59,-.22,.115],[-.76,-.73,-.22,.06],[-.82,-.78,-.22,.034]],
  ]},{paint:'hair tie',pieces:[[[-.728,-.12,-.19,.073],[-.62,-.18,-.18,.072]]] }],
  paint:{ink:'#343042',hair:'#474052','hair tie':'#AD7393'}, decals:marks,
  eyes:{frontOnly:true,cx:.045,x:.258,y:.10,w:.115,h:.17,slideX:.043,slideY:.026},look:.57,
};
