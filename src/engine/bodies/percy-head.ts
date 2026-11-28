import type { Piece } from '../body';

// A continuous cheek and jaw under the chin fold. The occiput rounds out
// behind the temples, where the tied hair hugs the back of the skull.
export const percyPieces: readonly Piece[] = [[
  [-.147,.22,-.01,.50], [.135,.218,0,.508], [0,.13,-.125,.515],
  [-.35,-.152,0,.40], [.311,-.13,0,.415], [.012,-.20,-.09,.492],
  [-.32,-.35,.025,.337], [.335,-.389,.035,.35], [.21,-.504,.035,.293],
  [0,-.035,.065,.533], [.003,-.027,.49,.134], [-.125,-.453,.14,.278], [.138,-.475,.149,.290],
]];

const {PI,sin,cos}=Math;
// Cache the distance to the actual head along a latitude-longitude grid.
// This puts the roots on the broad cheeks as well as the narrower forehead.
const longitude = 96, latitude = 48;
let radii: Float32Array | undefined;
export function headRadius(a: number, lat: number) {
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
