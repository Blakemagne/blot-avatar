import { finishMesh, type CoatMesh } from './coat-surface';
import { wardrobeSurfaces } from './dot-wardrobe-data';

const cache = new Map<string, CoatMesh>();

function unpack(encoded: string, signed: boolean): number[] {
  const raw = atob(encoded);
  const values = new Array<number>(raw.length / 2);
  for (let i = 0; i < values.length; i++) {
    const word = raw.charCodeAt(2*i) | (raw.charCodeAt(2*i + 1) << 8);
    values[i] = signed && word >= 32768 ? word - 65536 : word;
  }
  return values;
}

/** Accessory surfaces can fold over themselves. Store the reconstructed triangles and
 * their independently measured smooth normals, including the inside wall of the crown. */
export function wardrobeMesh(id: string, radius: number): CoatMesh | undefined {
  const surface = wardrobeSurfaces[id];
  if (!surface) return;
  const saved = cache.get(id);
  if (saved) return saved;
  const vertices = unpack(surface[0], true);
  for (let i = 0; i < vertices.length; i++) vertices[i] *= (i % 6 < 3 ? radius : 1) / 10000;
  const mesh = finishMesh(vertices, unpack(surface[1], false), undefined, undefined, false);
  cache.set(id, mesh);
  return mesh;
}
