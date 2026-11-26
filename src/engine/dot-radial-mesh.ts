import { finishMesh, type CoatMesh } from './coat-surface';
import { DOT_RADIUS } from './dot-depth';
import { radialFields, radialResolution } from './dot-radial-fields';

function makeCharts(size: number) {
  const stride = size + 1;
  const directions: number[] = [], indices: number[] = [], samples: number[] = [];
  const borders = new Map<string, number>();
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const base = samples.length;
    for (let row = 0; row <= size; row++) for (let col = 0; col <= size; col++) {
      const u = 2*col-size, v = 2*row-size, w = size*sign;
      const [x,y,z] = axis === 0 ? [u,v,w] : axis === 1 ? [w,v,-u] : [u,w,-v];
      const border = col === 0 || row === 0 || col === size || row === size;
      const key = border ? [x,y,z].join(',') : '';
      let vertex = border ? borders.get(key) : undefined;
      if (vertex === undefined) {
        vertex = directions.length/3;
        const length = Math.hypot(x,y,z);
        directions.push(x/length,y/length,z/length);
        if (border) borders.set(key, vertex);
      }
      samples.push(vertex);
      if (row === 0 || col === 0) continue;
      const d = base + row*stride+col;
      const a = samples[d-stride-1], b = samples[d-stride], c = samples[d-1];
      if (sign > 0) indices.push(a,b,vertex,a,vertex,c);
      else indices.push(vertex,b,a,c,vertex,a);
    }
  }
  return { rays: Float32Array.from(directions), indices: Uint32Array.from(indices), samples: Uint32Array.from(samples) };
}

let charts: ReturnType<typeof makeCharts> | undefined;
const meshes = new Map<string, CoatMesh>();

/** Intersect directions from the body centre with the measured surface, sharing the six chart borders. */
export function radialMesh(id: string): CoatMesh | undefined {
  const field = radialFields[id];
  if (field === undefined) return;
  const cached = meshes.get(id);
  if (cached) return cached;
  const { rays, samples, indices } = charts ??= makeCharts(radialResolution);
  const vertices = new Float32Array(2*rays.length);
  const bytes = atob(field), stride = radialResolution+1;
  let cursor = 0;
  function delta() {
    let word = 0, shift = 0, byte: number;
    do {
      byte = bytes.charCodeAt(cursor++);
      word |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return (word >>> 1) ^ -(word & 1);
  }
  const previous = new Int32Array(stride*3), current = new Int32Array(stride*3);
  let sample = 0;
  for (let side = 0; side < 6; side++) for (let row = 0; row < stride; row++) {
    for (let col = 0; col < stride; col++) {
      const at = 3*col, vertex = samples[sample++];
      for (let k=at; k<at+3; k++) {
        const upper = row ? previous[k] : 0, left = col ? current[k-3] : 0;
        const diagonal = row && col ? previous[k-3] : 0;
        current[k] = upper + left - diagonal + delta();
      }
      const radius = current[at]*DOT_RADIUS/100000;
      const u = current[at+1]/65535, v = current[at+2]/65535;
      const z = 1-Math.abs(u)-Math.abs(v);
      const x = z >= 0 ? u : (u < 0 ? -1 : 1)*(1-Math.abs(v));
      const y = z >= 0 ? v : (v < 0 ? -1 : 1)*(1-Math.abs(u));
      const length = Math.hypot(x,y,z), pos = 6*vertex;
      for (let k=0; k<3; k++) vertices[pos+k] = radius*rays[3*vertex+k];
      vertices[pos+3] = x/length; vertices[pos+4] = y/length; vertices[pos+5] = z/length;
    }
    previous.set(current);
  }
  if (cursor !== bytes.length) throw new Error('Dot radial field has a different resolution');
  const mesh = finishMesh(vertices,indices);
  meshes.set(id, mesh);
  return mesh;
}
