import { finishMesh, type CoatMesh } from './coat-surface';

let bulb: CoatMesh | undefined;

/** The builder's bulb is an ellipsoid whose two axial extrema determine its attachment. */
export function bulbMesh(radius: number): CoatMesh {
  if (bulb) return bulb;
  const vertices: number[] = [], indices: number[] = [];
  const rings = 28, slices = 64, rx = .2791, ry = .27929, cy = 1.15523;
  for (let j = 0; j <= rings; j++) {
    const latitude = Math.PI * (j/rings - .5);
    for (let i = 0; i < slices; i++) {
      const angle = 2*Math.PI*i/slices;
      const x = Math.cos(latitude)*Math.cos(angle), y = Math.sin(latitude), z = Math.cos(latitude)*Math.sin(angle);
      const length = Math.hypot(x/rx, y/ry, z/rx);
      vertices.push(radius*rx*x, radius*(cy+ry*y), radius*rx*z, x/(rx*length), y/(ry*length), z/(rx*length));
      if (j < rings) {
        const a = j*slices+i, b = j*slices+(i+1)%slices;
        indices.push(a,a+slices,b, b,a+slices,b+slices);
      }
    }
  }
  bulb = finishMesh(vertices, indices, undefined, undefined, false);
  return bulb;
}
