import type { CoatMesh } from '../engine/coat-surface';
import type { HeadwearSeat } from '../engine/wardrobe';
import { DOT_RADIUS } from '../engine/dot-depth';

// Felipe's headband centre and inclination in its portrait coordinates.
const band = [-.1594 * DOT_RADIUS, .4172 * DOT_RADIUS, -.0100 * DOT_RADIUS];
const bandRoll = Math.atan2(.29649,.95494);
const levelWidth = 1.227;
const mounts = new WeakMap<CoatMesh, readonly number[]>();

function axesAt(x: number, y: number, z: number, width: number, roll: number) {
  const scale = width / levelWidth;
  const c = Math.cos(roll-bandRoll)*scale, s = Math.sin(roll-bandRoll)*scale;
  return [c,s,0, -s,c,0, 0,0,scale,
    x-c*band[0]+s*band[1], y-s*band[0]-c*band[1], z-scale*band[2]];
}

export function seatedBeret(box: CoatMesh['box'], seat: HeadwearSeat) {
  return axesAt(box[0]+.01*seat.x*(box[3]-box[0]), box[1]+.01*seat.y*(box[4]-box[1]),
    box[2]+.01*seat.z*(box[5]-box[2]), .01*seat.width*(box[3]-box[0]), seat.roll*Math.PI/180);
}

/** Orient the three sections with the measured brim, then fit their combined
 * bounds to the space occupied by this wearer’s original cap. */
export function fittedBeret(template: CoatMesh, meshes: CoatMesh[]) {
  const cached = mounts.get(template);
  if (cached) return cached;
  const v = template.vertices, box = template.box;
  let sx=0, sy=0, xx=0, xy=0;
  const count = v.length/6;
  for (let i=0; i<v.length; i+=6) {
    sx+=v[i]; sy+=v[i+1]; xx+=v[i]*v[i]; xy+=v[i]*v[i+1];
  }
  const roll = Math.atan2(xy-sx*sy/count, Math.max(.00001,xx-sx*sx/count));
  const axes = axesAt(0,0,0,levelWidth,roll);
  // The capsule is much wider than it is deep. Respect its forehead clearance
  // on all three axes, while keeping each section in the same affine frame.
  const actual = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for (const mesh of meshes) {
    const v = mesh.vertices;
    for (let i=0; i<v.length; i+=6) for (let k=0; k<3; k++) {
      const p=axes[k]*v[i]+axes[3+k]*v[i+1]+axes[6+k]*v[i+2]+axes[9+k];
      actual[k]=Math.min(actual[k],p); actual[k+3]=Math.max(actual[k+3],p);
    }
  }
  for (let k=0; k<3; k++) {
    const ratio=(box[k+3]-box[k])/(actual[k+3]-actual[k]);
    for (let j=0; j<9; j+=3) axes[k+j]*=ratio;
    axes[k+9]=box[k]+ratio*(axes[k+9]-actual[k]);
  }
  mounts.set(template,axes);
  return axes;
}

/** Compose body-local fittings; both translations are in body units. */
export function onMount(outer: readonly number[], inner: readonly number[]) {
  return inner.map((_,i) => {
    const row=i%3, j=i-row;
    return outer[row]*inner[j]+outer[row+3]*inner[j+1]+outer[row+6]*inner[j+2]+(j===9 ? outer[row+9] : 0);
  });
}
