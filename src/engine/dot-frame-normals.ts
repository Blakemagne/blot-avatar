import type { CoatMesh } from './coat-surface';
import { DOT_RADIUS } from './dot-depth';
import { frameNormalFields } from './dot-frame-normal-data';

const cosine = Math.cos(8*Math.PI/180), sine = Math.sin(8*Math.PI/180);

/** Set the front normals in head coordinates so the studio reflection moves
 * across the lens or cup when the head turns away from its portrait pose. */
export function fitFrameNormals(mesh: CoatMesh, name: string, section: number): void {
  const field = frameNormalFields[name+'/'+section];
  if (!field) return;
  const [width,height,left,bottom,span,rise,encoded] = field;
  const samples = atob(encoded), v = mesh.vertices;
  for (let i=0;i<v.length;i+=6) {
    if (-sine*v[i+3]+cosine*v[i+5] <= .08) continue;
    const u = ((cosine*v[i]+sine*v[i+2])/DOT_RADIUS-left)*(width-1)/span;
    const w = (v[i+1]/DOT_RADIUS-bottom)*(height-1)/rise;
    if (u<0 || w<0 || u>width-1 || w>height-1) continue;
    const x=Math.min(width-2,Math.floor(u)), y=Math.min(height-2,Math.floor(w));
    const nx=u-x, ny=w-y, at=3*(y*width+x);
    const normal = [0,1,2].map(k => {
      const base=at+k, top=base+3*width;
      return ((1-ny)*((1-nx)*samples.charCodeAt(base)+nx*samples.charCodeAt(base+3))
        + ny*((1-nx)*samples.charCodeAt(top)+nx*samples.charCodeAt(top+3)))/127.5-1;
    });
    const [a,b,c]=normal, length=Math.hypot(a,b,c) || 1;
    v[i+3]=(cosine*a-sine*c)/length; v[i+4]=b/length; v[i+5]=(sine*a+cosine*c)/length;
  }
}
