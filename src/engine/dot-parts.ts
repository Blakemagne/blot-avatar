import type { Body, Piece, Sphere } from './body';
import { eyePolys } from './eyes';
import { bounds, type Mat3 } from './math';
import { silhouette } from './silhouette';
import type { RigState } from './rig';

export const DOT_EYES = [
  'Swept lids',
  'Oval',
  'Sparkle capsules',
  'Highlight capsules',
  'Dots',
  'Round highlights',
  'Crescent inset',
  'Sleepy lids',
] as const;
export const DOT_GLASSES = [
  'None',
  'Monocle',
  'Tall oval frames',
  'Separate trapezoid lenses',
  'Classic sunglasses',
  'Round sunglasses',
] as const;
export const DOT_EXTRAS = [
  'None',
  'Headphones',
  'Bow tie',
  'Beanie',
  'Hat',
  'Beret',
  'Bulb',
  'Tuft',
  'Crown',
] as const;
export interface DotStyle {
  eyes: (typeof DOT_EYES)[number];
  glasses: (typeof DOT_GLASSES)[number];
  extra: (typeof DOT_EXTRAS)[number];
  extraColour: string;
}

interface Part {
  id: string;
  part: string;
  fill: string;
  front: boolean;
  polys: Float64Array[];
}
type Point = readonly [number, number];

function oval(w: number, h: number, x = 0, y = 0): Point[] {
  return Array.from({ length: 32 }, (_, i) => {
    const a = (i * Math.PI) / 16;
    return [x + w * Math.cos(a), y + h * Math.sin(a)];
  });
}

const INK = '#202024',
  LIGHT = '#FFFFFF';
const SPARK: Point[] = [
  [0, 0.085],
  [-0.023, 0.03],
  [-0.067, 0],
  [-0.023, -0.027],
  [0, -0.079],
  [0.024, -0.027],
  [0.067, 0],
  [0.024, 0.03],
];
const TRAPEZOID: Point[] = [
  [-0.19, 0.115],
  [-0.2, 0.085],
  [-0.17, -0.11],
  [-0.14, -0.14],
  [0.12, -0.14],
  [0.16, -0.105],
  [0.2, 0.085],
  [0.19, 0.12],
];

/** Eye details lie on the same surface as blot's eyes. Frames stay anchored when the pupils shift or blink. */
export function dotFace(
  body: Body,
  style: DotStyle,
  state: RigState,
  rotation: Mat3,
  size: number,
  fence: Float64Array[],
): Part[] {
  const out: Part[] = [],
    e = body.eyes;
  const frog = body.id === 'dot-rounded-head-with-two-ears';
  const surface = frog ? frogSurface(body) : body;
  const scale = body.id === 'dot-circle-with-two-ears' ? 0.76 : 1;
  const trim = { outline: fence, rim: 0.005, thin: 0 };
  function patch(
    id: string,
    x: number,
    y: number,
    points: readonly Point[],
    fill: string,
    sy = 1,
    holes: Point[][] = [],
  ) {
    const project = (p: readonly Point[]) =>
      eyePolys(
        surface,
        rotation,
        x,
        y,
        Float64Array.from(p.flatMap(([u, v]) => [u * scale, v * sy * scale])),
        trim,
      );
    const polys = project(points);
    if (!polys.length) return;
    for (const hole of holes) polys.push(...project(hole));
    out.push({ id, part: id, fill, front: true, polys });
  }
  const glass = style.glasses;
  const glassesY = e.y;
  for (const side of [-1, 1] as const) {
    const name = side < 0 ? 'left' : 'right';
    const x = side * e.x + e.slideX * state.eye.x,
      y = e.y + e.slideY * state.eye.y;
    const lid = Math.max(0, state.lid * (state.lids?.[side < 0 ? 0 : 1] ?? 1));
    const design = style.eyes;
    const h =
      design === 'Dots' ? 0.062 : design === 'Oval' ? 0.14 : design.endsWith('capsules') ? 0.17 : 0.113;
    const w =
      design === 'Dots' ? 0.061 : design === 'Oval' ? 0.093 : design.endsWith('capsules') ? 0.107 : 0.111;
    if (frog) {
      patch(name + '-socket', side * e.x, e.y, oval(0.174, 0.184), LIGHT);
      patch(name, x, y, oval(0.108, 0.144), INK, Math.max(0.12, lid));
    } else if (lid < 0.17) {
      patch(name, x, y, oval(w, Math.max(0.013, 0.75 / size)), INK);
    } else if (design === 'Sleepy lids' || design === 'Swept lids') {
      patch(name + '-pupil', x, y, oval(0.074, 0.103), INK, lid);
      const swept = design === 'Swept lids';
      patch(
        name + '-lid',
        x,
        y + 0.044 * lid,
        oval(0.172, 0.042).map(([u, v]) => [u, v + (swept ? side * u * 0.26 : 0)]),
        INK,
        lid,
      );
    } else {
      patch(name, x, y, oval(w, h), INK, lid);
      if (design === 'Sparkle capsules') patch(name + '-spark', x, y + 0.015 * lid, SPARK, LIGHT, lid);
      if (design === 'Round highlights' || design === 'Highlight capsules')
        patch(name + '-glint', x - 0.029, y + h * 0.37 * lid, oval(0.037, 0.041), LIGHT, lid);
      if (design === 'Crescent inset') {
        const crescent: Point[] = [
          [0.052, 0.069],
          [0.012, 0.082],
          [-0.035, 0.062],
          [-0.063, 0.028],
          [-0.065, -0.018],
          [-0.045, -0.052],
          [-0.009, -0.071],
          [0.027, -0.067],
          [0.054, -0.048],
          [0.019, -0.052],
          [-0.011, -0.034],
          [-0.021, -0.003],
          [-0.012, 0.031],
          [0.012, 0.055],
        ];
        patch(name + '-crescent', x, y, crescent, LIGHT, lid);
      }
    }
  }
  if (glass === 'None') return out;
  if (glass === 'Round sunglasses' || glass === 'Classic sunglasses')
    patch('bridge', 0, glassesY + 0.018, oval(e.x * 1.22, 0.025), INK);
  for (const side of [-1, 1] as const) {
    if (glass === 'Monocle' && side < 0) continue;
    const x = side * e.x * 1.22;
    if (glass === 'Monocle' || glass === 'Tall oval frames') {
      const h = glass === 'Monocle' ? 0.22 : 0.3;
      patch('rim' + side, x, glassesY, oval(0.209, h), INK, 1, [oval(0.182, h - 0.027).reverse()]);
      if (glass === 'Monocle')
        patch(
          'chain',
          x,
          glassesY,
          [
            [0.185, -0.07],
            [0.2, -0.16],
            [0.26, -0.19],
            [0.34, -0.19],
            [0.34, -0.21],
            [0.25, -0.21],
            [0.18, -0.18],
            [0.17, -0.09],
          ],
          INK,
        );
    } else {
      const lens =
        glass === 'Round sunglasses'
          ? oval(0.215, 0.212)
          : TRAPEZOID.map(([u, v]): Point => [u * 1.18, v * 1.18]);
      patch('lens' + side, x, glassesY, lens, INK);
      if (glass === 'Classic sunglasses') patch('brow' + side, x, glassesY + 0.096, oval(0.251, 0.036), INK);
    }
  }
  return out;
}

/** Solid pieces in body coordinates. Use the frontal bounds so headwear stays seated as the body rotates. */
export function dotExtra(body: Body, style: DotStyle, rotation: Mat3, rim: number): Part[] {
  if (style.extra === 'None') return [];
  let parts = ornaments.get(body);
  if (!parts) {
    parts = makeOrnament(body, style);
    ornaments.set(body, parts);
  }
  return parts.map(({ id, front, fill, solid }) => ({
    id,
    part: id,
    fill,
    front,
    polys: silhouette(solid, rotation, rim),
  }));
}

interface Ornament {
  id: string;
  front: boolean;
  fill: string;
  solid: { pieces: Piece[] };
}
const ornaments = new WeakMap<Body, Ornament[]>();

function makeOrnament(body: Body, style: DotStyle): Ornament[] {
  const b = bounds(silhouette(body, FRONT, 48)),
    top = -b[1],
    base = -b[3],
    half = (b[2] - b[0]) / 2;
  const groups: Ornament[] = [];
  const ball = (x: number, y: number, r: number, z = 0): Sphere => [x, y, z, r];
  function part(id: string, pieces: Piece[], front = true, fill = style.extraColour) {
    groups.push({ id, fill, front, solid: { pieces } });
  }
  const band = (width: number, y: number, r: number, z = 0.05): Piece => [
    ball(-width, y, r, z),
    ball(width, y, r, z),
  ];
  switch (style.extra) {
    case 'Crown': {
      const seat = top - 0.12;
      part('crown-band', [band(0.3, seat, 0.085, 0.16)]);
      part(
        'crown-points',
        [-1, 0, 1].map((i) => [
          ball(i * 0.22, seat + 0.04, 0.107, 0.12),
          ball(i * 0.35, seat + (i ? 0.31 : 0.43), 0.026, 0.13),
        ]),
      );
      part('crown-base', [band(0.27, seat + 0.09, 0.067, 0.1), band(0.285, seat + 0.055, 0.073, 0.14)]);
      part(
        'crown-facet',
        [
          [
            ball(-0.23, seat + 0.105, 0.072, 0.18),
            ball(-0.345, seat + 0.31, 0.02, 0.16),
            ball(-0.3, seat + 0.035, 0.055, 0.18),
          ],
        ],
        true,
        `color-mix(in srgb, ${style.extraColour} 68%, black)`,
      );
      part(
        'crown-rim',
        [band(0.3, seat + 0.013, 0.035, 0.22)],
        true,
        `color-mix(in srgb, ${style.extraColour} 78%, white)`,
      );
      part(
        'crown-beads',
        [-1, 0, 1].map((i) => [ball(i * 0.35, seat + (i ? 0.32 : 0.44), 0.045, 0.13)]),
      );
      break;
    }
    case 'Hat':
      part('hat', [band(0.25, top + 0.02, 0.062), [ball(0, top + 0.105, 0.19), ball(0, top + 0.22, 0.155)]]);
      break;
    case 'Beret':
      part('beret', [
        [ball(-0.38, top - 0.12, 0.18), ball(0.23, top + 0.08, 0.2), ball(-0.04, top + 0.09, 0.21)],
        [ball(0.06, top + 0.3, 0.043)],
      ]);
      break;
    case 'Beanie':
      part('beanie', [
        [ball(-0.17, top + 0.025, 0.15), ball(0.17, top + 0.025, 0.15), ball(0, top + 0.135, 0.18)],
        band(0.25, top - 0.015, 0.084),
      ]);
      break;
    case 'Bulb':
      part('bulb', [[ball(0, top + 0.22, 0.16)], [ball(0, top, 0.032), ball(0, top + 0.12, 0.045)]]);
      break;
    case 'Tuft':
      part(
        'tuft',
        [-1, 0, 1].map((i) => [
          ball(-0.3, top - 0.105, 0.076),
          ball(-0.3 + i * 0.085, top + 0.095 - Math.abs(i) * 0.055, 0.063),
        ]),
      );
      break;
    case 'Bow tie':
      part(
        'bow',
        [-1, 1].map((i) => [
          ball(0, base + 0.1, 0.043, 0.18),
          ball(i * 0.38, base + 0.2, 0.066, 0.18),
          ball(i * 0.38, base + 0.014, 0.066, 0.18),
        ]),
      );
      part('knot', [[ball(0, base + 0.1, 0.064, 0.24)]]);
      break;
    case 'Headphones': {
      const ears = body.id === 'dot-circle-with-two-ears';
      const peak = ears ? top - 0.28 : top + 0.09;
      const y = ears ? -0.2 : 0;
      const arc = Array.from({ length: 17 }, (_, i) =>
        ball(Math.cos((i * Math.PI) / 16) * half, y + (peak - y) * Math.sin((i * Math.PI) / 16), 0.03),
      );
      part(
        'headband',
        arc.slice(1).map((s, i) => [arc[i], s]),
        ears,
      );
      part(
        'earpads',
        [-1, 1].map((i) => [ball(i * half, y - 0.08, 0.11), ball(i * (half - 0.035), y + 0.11, 0.11)]),
      );
      break;
    }
  }
  return groups;
}
const FRONT = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const frogSurfaces = new WeakMap<Body, Body>();
function frogSurface(body: Body): Body {
  let surface = frogSurfaces.get(body);
  if (!surface) {
    // The raised sockets sit on the ear lobes, outside the central face piece.
    surface = { ...body, pieces: body.outline?.pieces ?? body.pieces };
    frogSurfaces.set(body, surface);
  }
  return surface;
}
