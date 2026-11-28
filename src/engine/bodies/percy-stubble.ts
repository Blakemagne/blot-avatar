import type { Body, SurfaceWire } from '../body';
import { surfaceAt } from '../field';
import { D } from '../math';
import type { DotSolid } from '../dot-features';
import { wireSolid } from './percy-wires';

// Sparse groups follow the jaw and upper lip in the authored front view.
const follicles = [
  [-.49,-.369],[-.462,-.406],[-.42,-.478],[-.384,-.459],[-.35,-.53],[-.21,-.58],
  [-.116,-.658],[-.068,-.642],[.087,-.54],[.12,-.528],[.19,-.638],[.246,-.657],[.38,-.613],[.47,-.548],
  [.287,-.667],[.213,-.68],[-.292,-.61],[-.351,-.587],[.538,-.529],[-.423,-.514],
  [.538,-.427],[.553,-.39],[-.038,-.205],[.014,-.136],[.067,-.117],[.168,-.108],[.235,-.151],
];
let strands: SurfaceWire[] | undefined;
let mesh: DotSolid | undefined;

export function beardStrands(head: Body): readonly SurfaceWire[] {
  if (strands) return strands;
  const hairs: SurfaceWire[] = [];
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  for (const [group, [u, v]] of follicles.entries()) {
    for (let hair = 0; hair < 2 + group % 2; hair++) {
      const seed = group * 2.39996 + hair * 1.91;
      const x = u - .105 + .013 * hair * Math.cos(seed);
      const y = v + .011 * hair * Math.sin(seed);
      // Lift the authored front-view point along its perspective ray onto the skin.
      let k = 1 - .5 / D;
      for (let i = 0; i < 4; i++) {
        if (!surfaceAt(head, x * k, y * k, hit)) throw new RangeError('percy stubble outside the jaw');
        k = 1 - hit.z / D;
      }
      const length = .019 + .010 * (1 + Math.sin(seed));
      const points: [number, number, number][] = [];
      for (const t of [0, .5, 1]) {
        const rise = .0025 + length * t * (.64 - .10 * t);
        points.push([
          x * k + rise * hit.nx + t * length * (.28 * x + .31 * Math.sin(seed)),
          y * k + rise * hit.ny - t * length * (.78 + .17 * t),
          hit.z + rise * hit.nz,
        ]);
      }
      hairs.push({
        id: 'stubble-' + group, eyewear: false, paint: 'stubble', points,
        radius: .0038 + .0012 * Math.cos(seed), tipRadius: .0005,
      });
    }
  }
  strands = hairs;
  return strands;
}

export function beardSolid(head: Body): DotSolid {
  return mesh ??= wireSolid(beardStrands(head),[98,91,112],'stubble');
}
