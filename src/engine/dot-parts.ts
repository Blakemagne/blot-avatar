import { prepare, surfaceTop, type Body, type Piece, type Sphere } from './body';
import { dotDepth, DOT_RADIUS } from './dot-depth';
import { eyeProfiles, frameProfiles } from './dot-profiles';
import { bounds, project, type Mat3 } from './math';
import { eyePolys } from './eyes';
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
import { DOT_GLASSES, DOT_EXTRAS, mountShift } from './wardrobe';
export { DOT_GLASSES, DOT_EXTRAS } from './wardrobe';
export interface DotStyle {
  /** Local Z multiplier for an editable body and its mounted parts. */
  depthScale?: number;
  /** Retain the host’s own expressive eyes with an accessory. */
  originalEyes?: boolean;
  eyes: (typeof DOT_EYES)[number];
  glasses: (typeof DOT_GLASSES)[number];
  extra: (typeof DOT_EXTRAS)[number];
  extraColour: string;
  extraMount?: string;
  /** A named matte catalog rig, retained while its appearance matches the recipe. */
  catalogId?: string;
  /** Light the catalog shell as an editable glossy surface while retaining its fittings. */
  catalogGloss?: boolean;
  /** Apply the selected dye to the accessory on an authored portrait. */
  tintExtra?: boolean;
  /** Base dye used to calibrate the authored shell's lighting. */
  portraitDye?: number;
  replaceEyes?: boolean;
  replaceGlasses?: boolean;
  replaceExtra?: boolean;
  /** Authored starter portrait. Custom builds leave this unset. */
  character?: 'Blossie' | 'Alfred' | 'Jojo' | 'Iris' | 'Todd' | 'Iggy' | 'Felipe' | 'Thelma' | 'Felipe flower' | 'Josh';
}

/** Opaque lenses cover the entire eye insert. */
export function coversEyes(style: DotStyle): boolean {
  return style.glasses.endsWith('sunglasses') || style.glasses === 'Separate trapezoid lenses';
}

interface Part {
  id: string;
  part: string;
  fill: string;
  front: boolean;
  solid?: boolean;
  overEyes?: boolean;
  polys: Float64Array[];
}
const INK = '#272727';
const LIGHT = '#FFFFFF';
const DESIGN_RADIUS = 148;

// The eye centres in the neutral camera. Width and height of the design scale together.
export const sockets: Readonly<Record<string, readonly [number, number, number]>> = {
  'dot-blossie': [28.5, 228, 1],
  'dot-six-lobed-flower': [28.5, 230.5, 1],
  'dot-circle': [29, 228, 1],
  'dot-rounded-triangle': [29.5, 231, 1],
  'dot-capsule': [28.5, 237, 1],
  'dot-heart': [29, 230, 1],
  'dot-four-lobed-butterfly': [29, 234, 1],
  'dot-hexagon': [27.5, 233.5, .94],
  'dot-rounded-diamond': [29, 229, 1],
  'dot-twelve-scalloped-rosette': [29, 228, 1],
  'dot-circle-with-two-ears': [21.5, 289.5, .75],
  'dot-rounded-head-with-two-ears': [65, 189, 1],
};

/** Depth of the Blot face that normally carries the eyes, in body coordinates. */
export function wardrobeDepth(body: Body, x: number, y: number) {
  const hit = {z:0,nx:0,ny:0,nz:1};
  return surfaceTop(prepare(body),x,y,hit) ? hit.z : undefined;
}

const frameMounts = new WeakMap<Body, { scale: number; depth: number }>();

/** A rigid frame curves around the bridge. Fit it once to the wearer's width and brow. */
export function frameMount(host: Body) {
  const saved = frameMounts.get(host);
  if (saved) return saved;
  const cx = host.eyes.cx ?? 0, { x, y } = host.eyes;
  const scale = x / (.28 * DOT_RADIUS);
  // Sample the lens footprint. A deep cheek or raised brow can sit ahead of
  // the bridge, especially on gallery bodies made from several overlapping pieces.
  let bridge = wardrobeDepth(host, cx, y) ?? 0;
  for (let i = -8; i <= 8; i++) for (let j = -3; j <= 3; j++) {
    const offset = i * .105 * scale * DOT_RADIUS;
    const z = wardrobeDepth(host, cx + offset, y + j * .12 * scale * DOT_RADIUS);
    if (z !== undefined) bridge = Math.max(bridge, z + FRAME_CURVE * offset ** 2 / scale);
  }
  const mount = { scale, depth: bridge + .075 };
  frameMounts.set(host, mount);
  return mount;
}

export const FRAME_CURVE = .38 / DOT_RADIUS;

/** Eye inserts follow the wearer's surface. The glasses stand forward of the eyes on a curved, rigid frame. */
export function dotFace(
  body: Body, style: DotStyle, state: RigState, rotation: Mat3, size: number,
): Part[] {
  const parts: Part[] = [];
  const frog = !body.wardrobeHost && body.id === 'dot-rounded-head-with-two-ears';
  if (rotation[8] < -.55) return parts;
  const native = !body.wardrobeHost && sockets[body.id];
  const [spacing, centreY, scale] = native || [body.eyes.x*DESIGN_RADIUS,256-body.eyes.y*DESIGN_RADIUS,body.eyes.x/.2];
  const cx = native ? 0 : body.eyes.cx ?? 0;
  const depth = (x:number,y:number) => native ? dotDepth(body.id,x,y) : wardrobeDepth(body,x,y);
  const eyeY = (256 - centreY) / DESIGN_RADIUS;
  const glasses = frameProfiles[style.glasses];
  const circle = (rx: number, ry: number) => Array.from({ length: 64 }, (_, i) => [
    rx * Math.cos(i * Math.PI / 32), ry * Math.sin(i * Math.PI / 32),
  ]).flat();
  function facePoint(x: number, y: number, z: number, out: Float64Array, i: number) {
    if (body.wardrobeHost) project(rotation, x, y, z, out, i);
    else {
      out[i] = rotation[0]*x + rotation[1]*y + rotation[2]*z;
      out[i+1] = -(rotation[3]*x + rotation[4]*y + rotation[5]*z);
    }
  }
  for (const side of [-1, 1] as const) {
    if (style.originalEyes || coversEyes(style)) continue;
    const index = side < 0 ? 0 : 1;
    const name = side < 0 ? 'left' : 'right';
    const lid = Math.max(0, state.lid * (state.lids?.[index] ?? 1));
    const x = cx + side * (spacing + (native && glasses && !frog ? 5.5 * scale : 0)) / DESIGN_RADIUS;
    const gazeX = body.eyes.slideX * state.eye.x, gazeY = body.eyes.slideY * state.eye.y;
    function insert(id: string, fill: string, loops: readonly (readonly number[])[], open: number, fixed = false) {
      const polys: Float64Array[] = [];
      // The resting frog pupils sit slightly toward the bridge of the nose.
      const centre = frog && !fixed ? x - side * 4.5 / DESIGN_RADIUS : x;
      for (const loop of loops) {
        if (body.wardrobeHost) {
          if (rotation[8] > 0) {
            const offsets = loop.map((value,i) => value * scale / DESIGN_RADIUS * (i % 2 ? -open : 1));
            polys.push(...eyePolys(body.wardrobeHost,rotation,centre+gazeX,eyeY+gazeY,offsets));
          }
          continue;
        }
        const poly = new Float64Array(loop.length);
        let facing = 0;
        for (let i = 0; i < loop.length; i += 2) {
          const u = centre + (fixed ? 0 : gazeX) + loop[i] * scale / DESIGN_RADIUS;
          const v = eyeY + (fixed ? 0 : gazeY) - loop[i+1] * open * scale / DESIGN_RADIUS;
          const z = (depth(u,v) ?? depth(x,eyeY) ?? .55) + .025;
          facePoint(u, v, z, poly, i);
          if (rotation[8] >= .7) facing++;
          else {
            const dx = ((depth(u+.004,v) ?? z) - (depth(u-.004,v) ?? z)) / .008;
            const dy = ((depth(u,v+.004) ?? z) - (depth(u,v-.004) ?? z)) / .008;
            if (rotation[8]-dx*rotation[6]-dy*rotation[7] > 0) facing++;
          }
        }
        if (facing * 2 >= loop.length / 2) polys.push(poly);
      }
      if (polys.length) parts.push({ id, part: id, front: true, solid: true, fill, polys });
    }
    if (frog) {
      insert(name + '-socket', LIGHT, [circle(23.5, 24)], Math.max(.06, lid), true);
      insert(name, '#181a17', [circle(19.5, 20)], Math.max(.06, lid));
    } else if (lid < .10) {
      insert(name, INK, [circle(14, Math.max(1.5, 120 / size))], 1);
    } else {
      for (const layer of eyeProfiles[style.eyes][index]) {
        insert(layer.id === 'eye' ? name : name + '-' + layer.id,
          layer.white ? LIGHT : style.eyes === 'Crescent inset' ? '#191a18' : INK, layer.loops, lid);
      }
    }
  }
  if (glasses && rotation[8] > 0) {
    const mount = body.wardrobeHost && frameMount(body.wardrobeHost);
    const frameScale = mount?.scale ?? scale;
    const bridge = mount?.depth ?? (depth(cx,eyeY) ?? .76) + .12;
    for (const frame of glasses) {
      const polys = frame.loops.map(loop => {
        const result = new Float64Array(loop.length);
        for (let i = 0; i < loop.length; i += 2) {
          const u = cx + loop[i] / DESIGN_RADIUS * frameScale, v = eyeY - loop[i + 1] / DESIGN_RADIUS * frameScale;
          // The temples wrap back toward the cheeks while the bridge clears the brow.
          const z = bridge - (mount ? FRAME_CURVE / frameScale : .42) * (u - cx) ** 2;
          facePoint(u, v, z, result, i);
        }
        return result;
      });
      parts.push({ id: frame.id, part: frame.id, front: true, solid: true, overEyes: style.originalEyes && !coversEyes(style), fill: '#232323', polys });
    }
  }
  return parts;
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
    solid: true,
    fill,
    front,
    polys: silhouette(solid, rotation, rim, style.depthScale),
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
  const cx = body.wardrobeHost?.eyes.cx ?? 0;
  const b = bounds(silhouette(body, FRONT, 48)),
    top = -b[1],
    base = -b[3],
    half = body.wardrobeHost ? Math.min(cx - b[0], b[2] - cx) : (b[2] - b[0]) / 2;
  const groups: Ornament[] = [];
  const ball = (x: number, y: number, r: number, z = 0): Sphere => [cx + x, y, z, r];
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
      const y = ears ? -0.2 : body.wardrobeHost?.eyes.y ?? 0;
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
  const mount = body.wardrobe?.mounts?.find(m => m.id === style.extraMount && m.extras.includes(style.extra));
  if (mount) {
    const balls = groups.flatMap(group => group.solid.pieces.flat());
    const low = Math.min(...balls.map(([x,,,r]) => x-r)), high = Math.max(...balls.map(([x,,,r]) => x+r));
    const dx = mountShift(mount.x, b[0], b[2], low, high);
    for (const group of groups) group.solid.pieces = group.solid.pieces.map(piece => piece.map(([x,y,z,r]) => [x+dx,y,z,r]));
  }
  return groups;
}
const FRONT = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
