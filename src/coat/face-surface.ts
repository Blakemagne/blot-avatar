import type { CoatMesh } from '../engine/coat-surface';

/** Front depth and normal of the actual rendered shell. A transparent texel
 * represents a hole or a point outside the outline. Reused for every eye pose. */
export function faceSurface(mesh: CoatMesh, side: number): Float32Array {
  const pixels = new Float32Array(side * side * 4);
  const v = mesh.vertices, idx = mesh.indices;
  const [x0,y0,,x1,y1] = mesh.box;
  const sx = (side-1)/(x1-x0), sy = (side-1)/(y1-y0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]*6, b = idx[i+1]*6, c = idx[i+2]*6;
    const ax = (v[a]-x0)*sx, ay = (v[a+1]-y0)*sy;
    const bx = (v[b]-x0)*sx, by = (v[b+1]-y0)*sy;
    const cx = (v[c]-x0)*sx, cy = (v[c+1]-y0)*sy;
    const area = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);
    if (area <= 1e-8) continue;
    const left = Math.max(0,Math.ceil(Math.min(ax,bx,cx))), right = Math.min(side-1,Math.floor(Math.max(ax,bx,cx)));
    const bottom = Math.max(0,Math.ceil(Math.min(ay,by,cy))), top = Math.min(side-1,Math.floor(Math.max(ay,by,cy)));
    for (let y = bottom; y <= top; y++) for (let x = left; x <= right; x++) {
      const u = ((x-ax)*(cy-ay) - (y-ay)*(cx-ax))/area;
      const w = ((bx-ax)*(y-ay) - (by-ay)*(x-ax))/area, t = 1-u-w;
      if (u < 0 || w < 0 || t < 0) continue;
      const at = (y*side+x)*4, z = t*v[a+2]+u*v[b+2]+w*v[c+2];
      if (pixels[at+3] > 0 && z <= pixels[at]) continue;
      pixels[at] = z;
      pixels[at+1] = t*v[a+3]+u*v[b+3]+w*v[c+3];
      pixels[at+2] = t*v[a+4]+u*v[b+4]+w*v[c+4];
      pixels[at+3] = Math.max(.001,t*v[a+5]+u*v[b+5]+w*v[c+5]);
    }
  }
  return pixels;
}

const frontGrids = new WeakMap<CoatMesh, Float32Array>();
const FRONT_GRID = 160;

/** Interpolate the front sheet at a fitting point, renormalizing valid samples on the rim. */
export function frontDepth(mesh: CoatMesh, x: number, y: number): number | undefined {
  const [x0,y0,,x1,y1] = mesh.box;
  if (x < x0 || x > x1 || y < y0 || y > y1) return;
  let grid = frontGrids.get(mesh);
  if (!grid) frontGrids.set(mesh,grid = faceSurface(mesh,FRONT_GRID));
  const u = (x-x0)/(x1-x0)*(FRONT_GRID-1), v = (y-y0)/(y1-y0)*(FRONT_GRID-1);
  const ix = Math.min(FRONT_GRID-2,Math.floor(u)), iy = Math.min(FRONT_GRID-2,Math.floor(v));
  let weight = 0, sum = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const at = 4*((iy+j)*FRONT_GRID+ix+i);
    if (grid[at+3] <= 0) continue;
    const k = (i ? u-ix : 1-u+ix)*(j ? v-iy : 1-v+iy);
    sum += k*grid[at]; weight += k;
  }
  return weight ? sum/weight : undefined;
}
