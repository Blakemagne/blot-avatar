import { finishMesh } from './coat-surface';
import { dotDepth } from './dot-depth';
import { coversEyes, wardrobeDepth } from './dot-parts';
import { eyeSurfaces } from './dot-eye-surfaces';
import { eyeSurfaceMesh } from './dot-eye-mesh';
import { catalogFittings } from './dot-catalog-fittings';
import { fittedMesh } from './dot-fitted-mesh';
import { gazeTransform, transformAxes } from './dot-gaze';
import { catalogParts } from './dot-catalog-parts';
import { eyewearFits, eyeMaterials, frameFits } from './dot-eyewear-fits';
import { faceFits } from './dot-face-fits';
import type { Body } from './body';
import type { CoatMesh } from './coat';
import type { Rgb } from './dye';
import { dotMesh, DOT_RADIUS, sectionMesh } from './dot-mesh';
import { featureSections, type FeatureSection } from './dot-feature-sections';

export interface DotFaceMotion {
  x: number;
  y: number;
  left: number;
  right: number;
  playback?: import('./dot-motion').DotPlayback;
}
export interface DotSolid {
  mesh: CoatMesh;
  axes: readonly number[];
  tint: Rgb;
  metal?: boolean;
  material?: number;
  insetSurface?: number;
  portraitSection?: number;
  catalogCrownLayer?: number;
  /** Dark or white curved eye and eyewear materials. */
  finish?: 'ink' | 'white' | 'portrait-ink' | 'portrait-glass';
}

interface Surface {
  mesh: CoatMesh;
  front(x: number, y: number): number | undefined;
}
const surfaces = new WeakMap<FeatureSection, Surface>();
const opticalSurfaces = new WeakMap<FeatureSection, string>();
for (const [name, entries] of Object.entries(eyeSurfaces)) {
  entries.forEach((entry, i) => opticalSurfaces.set(featureSections[name][i], entry));
}
function surfaceOf(section: FeatureSection, parts: readonly FeatureSection[]): Surface {
  const saved = surfaces.get(section);
  if (saved) return saved;
  const edges: number[] = [];
  for (const loop of section.outline) {
    for (let i = 0, j = loop.length - 2; i < loop.length; j = i, i += 2) {
      const x = loop[j]/2048, y = loop[j+1]/2048;
      const dx = loop[i]/2048 - x, dy = loop[i+1]/2048 - y;
      edges.push(x,y,dx,dy,1/(dx*dx+dy*dy || 1));
    }
  }
  function distance(x: number, y: number) {
    let d = Infinity, inside = false;
    for (let i = 0; i < edges.length; i += 5) {
      const u = x-edges[i], v = y-edges[i+1], dx = edges[i+2], dy = edges[i+3];
      if ((v < 0) !== (v < dy) && u < v*dx/dy) inside = !inside;
      const t = Math.max(0,Math.min(1,(u*dx+v*dy)*edges[i+4]));
      const ax = u-t*dx, ay = v-t*dy;
      d = Math.min(d,ax*ax+ay*ay);
    }
    return (inside ? 1 : -1)*Math.sqrt(d);
  }
  function sample(grid: readonly number[], x: number, y: number) {
    const n = section.grid;
    const u = Math.max(0,Math.min(n-1,(x/(17/16)+1)*(n-1)/2));
    const v = Math.max(0,Math.min(n-1,(y/(17/16)+1)*(n-1)/2));
    const i = Math.min(n-2,Math.floor(u)), j = Math.min(n-2,Math.floor(v)), at = j*n+i;
    const a = u-i, b = v-j;
    return ((1-b)*((1-a)*grid[at]+a*grid[at+1]) + b*((1-a)*grid[at+n]+a*grid[at+n+1])) / 4096;
  }
  const [cx, cy, cz, radius] = section.origin;
  // Printed pupils and highlights share a curved support. Reconstruct them against that
  // same surface so independently fitted depths cannot intersect or flicker when turned.
  const thin = section.role === 'eye' || section.role === 'catch';
  const support = thin && Math.max(...section.thickness) < 700
    ? parts.filter(p => p !== section && p.side === section.side && p.origin[3] > radius
      && (p.role === 'socket' || p.role === 'eye' || p.role === 'catch')
      && Math.hypot(p.origin[0]-cx,p.origin[1]-cy) < p.origin[3])
      .sort((a,b) => a.origin[3]-b.origin[3])[0]
    : undefined;
  const parent = support && surfaceOf(support, parts);
  const thickness = (x: number, y: number) => {
    const gain = sample(section.thickness, x, y);
    return distance(x,y)*gain*gain;
  };
  const centre = (x: number, y: number) => {
    const own = sample(section.centre, x, y);
    const z = parent?.front(cx + radius*x, cy + radius*y);
    return z === undefined ? own : Math.max(own, (z + .0018 - cz) / radius);
  };
  const measured = opticalSurfaces.get(section);
  const mesh = measured ? eyeSurfaceMesh(measured) : sectionMesh(section.origin, radius, section.role === 'glass' || section.role === 'extra' ? 72 : 44,
    thickness, centre);
  const surface = {
    mesh,
    front(x: number, y: number) {
      const u = (x-cx)/radius, v = (y-cy)/radius, q = thickness(u,v);
      return q < 0 ? undefined : cz + radius*(centre(u,v) + Math.sqrt(q));
    },
  };
  surfaces.set(section, surface);
  return surface;
}

// Keep the depth of each optical surface relative to the triangle it was measured on.
// The same offset field seats a pupil, its highlights and the surrounding frame together.
const wardrobeFits = new WeakMap<Body, WeakMap<CoatMesh, CoatMesh>>();
const EYE_X = .209375 * DOT_RADIUS, EYE_Y = .178125 * DOT_RADIUS;

function fitToHost(host: Body, mesh: CoatMesh): CoatMesh {
  let cache = wardrobeFits.get(host);
  if (!cache) { cache = new WeakMap(); wardrobeFits.set(host, cache); }
  const saved = cache.get(mesh);
  if (saved) return saved;

  const scale = host.eyes.x / EYE_X, cx = host.eyes.cx ?? 0;
  const face = wardrobeDepth(host, cx, host.eyes.y) ?? .6;
  const [x0, y0, , x1, y1] = mesh.box;
  const cells = 32, stride = cells + 1;
  const dx = (x1 - x0) / cells || 1, dy = (y1 - y0) / cells || 1;
  const offsets = new Float32Array(stride * stride);
  for (let row = 0; row < stride; row++) {
    for (let col = 0; col < stride; col++) {
      const x = x0 + col * dx, y = y0 + row * dy;
      const z = wardrobeDepth(host, cx + scale * x, host.eyes.y + scale * (y - EYE_Y));
      const reference = dotDepth('dot-rounded-triangle', x, y) ?? .4;
      // Temples and chains that extend past the cheek keep their depth at the rim.
      const cheek = Math.max(z ?? face - .22, face - .22);
      offsets[row * stride + col] = (cheek + .018) / scale - reference;
    }
  }

  // The bilinear depth field supplies both the displacement and its slope.
  // Transforming the normal by that slope keeps the highlights on the fitted surface.
  const vertices = mesh.vertices.slice();
  for (let k = 0; k < vertices.length; k += 6) {
    const u = Math.max(0, (vertices[k] - x0) / dx), v = Math.max(0, (vertices[k + 1] - y0) / dy);
    const col = Math.min(cells - 1, Math.floor(u)), row = Math.min(cells - 1, Math.floor(v));
    const at = row * stride + col, a = u - col, b = v - row;
    const z00 = offsets[at], z10 = offsets[at + 1], z01 = offsets[at + stride], z11 = offsets[at + stride + 1];
    vertices[k + 2] += (1 - b) * ((1 - a) * z00 + a * z10) + b * ((1 - a) * z01 + a * z11);
    const nz = vertices[k + 5];
    const nx = vertices[k + 3] - nz * ((1 - b) * (z10 - z00) + b * (z11 - z01)) / dx;
    const ny = vertices[k + 4] - nz * ((1 - a) * (z01 - z00) + a * (z11 - z10)) / dy;
    const length = Math.hypot(nx, ny, nz) || 1;
    vertices[k + 3] = nx / length;
    vertices[k + 4] = ny / length;
    vertices[k + 5] = nz / length;
  }
  const fitted = finishMesh(vertices, mesh.indices, undefined, undefined, false);
  cache.set(mesh, fitted);
  return fitted;
}

const INK: Rgb = [32,32,32], WHITE: Rgb = [254,254,254];
const IDENTITY = [1,1,0,0,1,0,0,0] as const;
const STILL: DotFaceMotion = { x:0, y:0, left:1, right:1 };
/** Assemble the measured eye inserts and frames on the active wearer, including the independent eyelid pivots. */
export function dotFeatures(body: Body, motion: DotFaceMotion = STILL, extraTint: Rgb = INK): DotSolid[] {
  const style = body.dotStyle;
  if (!style) return [];
  const fixed = style.catalogId ? catalogParts(style.catalogId) : style.character ? featureSections[style.character] : undefined;
  const frog = !body.wardrobeHost && body.id === 'dot-rounded-head-with-two-ears';
  const glasses = featureSections[style.glasses] ?? [];
  const eyes = coversEyes(style) || style.originalEyes ? [] : featureSections[frog ? 'Raised sockets' : style.eyes];
  const phones = style.extra === 'Headphones' ? featureSections[body.wardrobeHost ? 'Headphones/rounded-triangle' : 'Headphones/' + body.id.slice(4)] ?? [] : [];
  const pieces = fixed ?? [...eyes,...glasses,...phones];
  const fits = fixed || body.wardrobeHost ? undefined : faceFits[body.id];
  const gazeKey = style.catalogId ? 'catalog/' + style.catalogId : style.character ? 'portrait/' + style.character
    : (body.wardrobeHost ? 'blot' : body.id) + '/' + (frog ? 'Raised sockets' : style.eyes);
  const mountedKey = gazeKey + '/' + style.glasses;
  const relativeEyes = !fixed && eyewearFits[mountedKey];
  const mountedFrames = !fixed && frameFits[mountedKey];
  const materials = !fixed && eyeMaterials[gazeKey];
  const eyeX = motion.x * body.eyes.slideX, eyeY = motion.y * body.eyes.slideY;
  const result: DotSolid[] = [];
  for (const [index, s] of pieces.entries()) {
    const isEye = s.role === 'eye' || s.role === 'catch';
    const fit = s.role === 'glass' ? fits?.[style.glasses]?.[0]
      : isEye && !frog ? fits?.[style.eyes]?.[s.side < 0 ? 0 : 1] : undefined;
    const [sx,sy,zx,zy,sz,dx,dy,dz] = fit ?? IDENTITY;
    const lid = isEye ? Math.max(.055, s.side < 0 ? motion.left : motion.right) : 1;
    const pivot = s.role === 'catch' ? pieces.find(part => part.role === 'eye' && part.side === s.side) : s;
    const lidPivot = (pivot ?? s).origin[1]*DOT_RADIUS;
    let axes = [sx,0,zx, 0,sy*lid,zy, 0,0,sz,
      dx*DOT_RADIUS, dy*DOT_RADIUS+lidPivot*sy*(1-lid), dz*DOT_RADIUS];
    const relative = relativeEyes && relativeEyes[index];
    if (relative && index < eyes.length) {
      const [x,y,zx,zy,zz,z] = relative;
      axes = transformAxes([1,0,zx, 0,1,zy, 0,0,1+zz, x,y,z], axes);
    }
    const frame = s.role === 'glass' && mountedFrames && mountedFrames[index-eyes.length];
    if (frame) axes = [...frame.slice(0,9), ...frame.slice(9).map(offset => offset * DOT_RADIUS)];
    const host = !fixed && s.role !== 'extra' ? body.wardrobeHost : undefined;
    if (host) {
      const scale = host.eyes.x / EYE_X;
      axes = axes.map(v => v*scale);
      axes[9] += host.eyes.cx ?? 0;
      axes[10] += host.eyes.y - scale*EYE_Y;
    }
    const gaze = isEye || s.role === 'socket' ? gazeTransform(gazeKey, index, axes, eyeX/.0391, eyeY/.0512) : undefined;
    if (!gaze && isEye) {
      axes[9] += eyeX;
      axes[10] += eyeY;
      if (host && (eyeX || eyeY)) {
        const x = (host.eyes.cx ?? 0) + host.eyes.x * s.side, y = host.eyes.y;
        const atRest = wardrobeDepth(host, x, y), moved = wardrobeDepth(host, x + eyeX, y + eyeY);
        if (moved !== undefined && atRest !== undefined) axes[11] += moved - atRest;
      }
    }
    const bone = (isEye || s.role === 'socket') && motion.playback?.eyes[s.side < 0 ? 0 : 1];
    const fitting = s.catalogSection === undefined ? undefined : catalogFittings[s.catalogSection];
    let template: CoatMesh | undefined;
    if (fitting?.piece !== undefined) {
      const phones = featureSections['Headphones/rounded-triangle'];
      template = surfaceOf(phones[fitting.piece],phones).mesh;
    } else if (fitting) template = dotMesh(fitting.mesh);
    const mesh = template && fitting ? fittedMesh(template,fitting) : style.character === 'Thelma' && s.role === 'extra' ? dotMesh('Thelma bulb')! : surfaceOf(s, pieces).mesh;
    result.push({
      mesh: host ? fitToHost(host,mesh) : mesh, tint: s.role === 'extra' ? extraTint : s.light ? WHITE : INK,
      axes: bone ? transformAxes(bone, gaze ?? axes) : gaze ?? axes,
      material: (index < eyes.length && materials ? materials[index] : undefined) ?? s.material,
      insetSurface: !fixed && !frog && style.eyes === 'Crescent inset' && eyes.includes(s) ? eyes.indexOf(s) % 3 : undefined,
      catalogCrownLayer: fitting?.mesh === 'Crown' ? (s.material === 10 ? 13 : 12) : undefined,
      portraitSection: style.character ? index : undefined,
      finish: s.role === 'extra' ? undefined : s.light ? 'white' : !fixed ? 'ink' : s.role === 'glass' ? 'portrait-glass' : 'portrait-ink',
    });
  }
  return result;
}
