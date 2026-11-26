import { finishMesh, type CoatMesh } from './coat-surface';
import { DOT_RADIUS } from './dot-depth';

/** Decode a measured section. Near and far sheets share their XY sample positions. */
export function eyeSurfaceMesh(field: string): CoatMesh {
  const bytes = atob(field);
  let cursor = 0;
  function word() {
    let n = 0, shift = 0, byte: number;
    do {
      byte = bytes.charCodeAt(cursor++);
      n |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return n;
  }
  function delta() {
    const n = word();
    return (n >>> 1) ^ -(n & 1);
  }
  const count = word(), indices = new Uint32Array(word()), vertices = new Float32Array(12*count);
  for (let channel = 0; channel < 10; channel++) {
    const far = channel >= 6, component = far ? channel - 4 : channel;
    let value = 0;
    for (let i = 0; i < count; i++) {
      value += delta();
      const at = (i + (far ? count : 0))*6 + component;
      vertices[at] = value * (component < 3 ? DOT_RADIUS : 1) / 20000;
      if (channel < 2) vertices[at + 6*count] = vertices[at];
    }
  }
  let first = 0;
  for (let i = 0; i < indices.length; i += 3) {
    first += delta();
    indices[i] = first;
    indices[i+1] = first + delta();
    indices[i+2] = first + delta();
  }
  if (cursor !== bytes.length) throw new Error('Invalid optical eye section');
  return finishMesh(vertices, indices, undefined, undefined, false);
}
