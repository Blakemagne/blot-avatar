import { portraitMount } from './dot-portrait-fit';
import { coversEyes, FRAME_CURVE, frameMount, type DotStyle } from './dot-parts';
import { eyeSurfaces } from './dot-eye-surfaces';
import { spectacleMesh } from './dot-portrait-eye';
import { eyeSurfaceMesh } from './dot-eye-mesh';
import { builderFittings } from './dot-builder-fittings';
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
  /** Layer above the host shell in an eye insert (base, pupil, catchlight). */
  faceLayer?: number;
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
/** Signed distance to the measured outer contour and its holes, in section radii. */
function contourDistance(section: FeatureSection) {
  const edges: number[] = [];
  for (const loop of section.outline) {
    for (let i = 0, j = loop.length - 2; i < loop.length; j = i, i += 2) {
      const x = loop[j]/2048, y = loop[j+1]/2048;
      const dx = loop[i]/2048 - x, dy = loop[i+1]/2048 - y;
      edges.push(x,y,dx,dy,1/(dx*dx+dy*dy || 1));
    }
  }
  return (x: number, y: number) => {
    let d = Infinity, inside = false;
    for (let i = 0; i < edges.length; i += 5) {
      const u = x-edges[i], v = y-edges[i+1], dx = edges[i+2], dy = edges[i+3];
      if ((v < 0) !== (v < dy) && u < v*dx/dy) inside = !inside;
      const t = Math.max(0,Math.min(1,(u*dx+v*dy)*edges[i+4]));
      const ax = u-t*dx, ay = v-t*dy;
      d = Math.min(d,ax*ax+ay*ay);
    }
    return (inside ? 1 : -1)*Math.sqrt(d);
  };
}

const rigidFrames = new WeakMap<FeatureSection, CoatMesh>();

/** A closed rim or lens with a rounded bevel. Its curve is independent of the wearer's cheeks. */
function frameMesh(section: FeatureSection): CoatMesh {
  const cached = rigidFrames.get(section);
  if (cached) return cached;
  const [cx, cy, , radius] = section.origin;
  const distance = contourDistance(section), bevel = .018 / radius;
  const mesh = sectionMesh([cx, cy, 0], radius, 100, (x, y) => {
    const d = Math.min(distance(x, y), bevel);
    return d * (2 * bevel - d);
  }, x => -FRAME_CURVE * DOT_RADIUS * (cx + radius * x) ** 2 / radius);
  rigidFrames.set(section, mesh);
  return mesh;
}

// The black beret dome is an oblique ellipsoid in both portraits. Its
// measured silhouette fixes the quadratic section and its depth fixes the
// centre plane. A smooth surface carries the highlight across the whole hat.
const beretDomes = new Map<FeatureSection, readonly number[]>([
  [featureSections.Felipe[3], [.76231,-.00617,.00534,-.96115,1.60110,-3.29987,-.00003,.00261,.04794]],
  [featureSections['Felipe flower'][3], [.76846,-.00339,.00509,-.96672,1.59477,-3.32483,.00002,.02584,.08534]],
]);

function surfaceOf(section: FeatureSection, parts: readonly FeatureSection[]): Surface {
  const saved = surfaces.get(section);
  if (saved) return saved;
  const distance = contourDistance(section);
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
  const dome = beretDomes.get(section);
  const mesh = dome ? sectionMesh(section.origin, radius, 128,
    (x,y) => dome[0]+dome[1]*x+dome[2]*y+dome[3]*x*x+dome[4]*x*y+dome[5]*y*y,
    (x,y) => dome[6]+dome[7]*x+dome[8]*y)
    : measured ? eyeSurfaceMesh(measured) : sectionMesh(section.origin, radius, section.role === 'glass' || section.role === 'extra' ? 72 : 44,
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

const INK: Rgb = [32,32,32], WHITE: Rgb = [254,254,254];
const IDENTITY = [1,1,0,0,1,0,0,0] as const;
const STILL: DotFaceMotion = { x:0, y:0, left:1, right:1 };
/** Assemble the measured eye inserts and frames on the active wearer, including the independent eyelid pivots. */
export function dotFeatures(body: Body, motion: DotFaceMotion = STILL, extraTint: Rgb = INK): DotSolid[] {
  const style = body.dotStyle;
  if (!style) return [];
  if (!style.replaceEyes && !style.replaceGlasses && !style.replaceExtra) {
    return assemble(body, style, motion, extraTint);
  }
  const fixed = style.character ? featureSections[style.character] : catalogParts(style.catalogId!)!;
  // Some opaque portrait lenses have no eye solid behind them. Expose the
  // recipe's editable eyes when the new glasses reveal that part of the face.
  const replaceEyes = style.replaceEyes || (style.replaceGlasses && !coversEyes(style) && !fixed.some(s => s.role === 'eye'));
  const replaced = (s: FeatureSection) => s.role === 'extra' ? !!style.replaceExtra :
    s.role === 'glass' ? !!style.replaceGlasses : !!replaceEyes;
  const worn = assemble(body, style, motion, extraTint, s => !replaced(s) &&
    (s.role === 'extra' || s.role === 'glass' || !style.replaceGlasses || !coversEyes(style)));
  const editable = { ...style, character: undefined, catalogId: undefined };
  const mount = portraitMount(body);
  const added = assemble(body, editable, motion, extraTint, replaced);
  for (const part of added) {
    part.axes = transformAxes(part.finish ? mount.face : mount.shell, part.axes);
  }
  return [...worn, ...added];
}

function assemble(body: Body, style: Readonly<DotStyle>, motion: DotFaceMotion, extraTint: Rgb,
  include?: (part: FeatureSection) => boolean): DotSolid[] {
  const fixed = style.catalogId ? catalogParts(style.catalogId) : style.character ? featureSections[style.character] : undefined;
  const frog = !body.wardrobeHost && body.id === 'dot-rounded-head-with-two-ears';
  const glasses = featureSections[style.glasses] ?? [];
  const eyes = coversEyes(style) || style.originalEyes ? [] : featureSections[frog ? 'Raised sockets' : style.eyes];
  const phones = style.extra === 'Headphones' ? featureSections[body.wardrobeHost ? 'Headphones/circle' : 'Headphones/' + body.id.slice(4)] ?? [] : [];
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
    if (include && !include(s)) continue;
    const isEye = s.role === 'eye' || s.role === 'catch';
    const fit = s.role === 'glass' ? fits?.[style.glasses]?.[0]
      : isEye && !frog ? fits?.[style.eyes]?.[s.side < 0 ? 0 : 1] : undefined;
    const [sx,sy,zx,zy,sz,dx,dy,dz] = fit ?? IDENTITY;
    const blinking = isEye || frog && s.role === 'socket';
    const lid = blinking ? Math.max(.055, s.side < 0 ? motion.left : motion.right) : 1;
    // A closed lid hides the socket and its reflections. Compressing white
    // inserts to the minimum thickness leaves a bright stripe through the blink.
    if (lid < .12 && (s.role === 'catch' || frog && s.role === 'socket')) continue;
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
    if (frog && (!fixed || style.character === 'Todd') && s.role === 'eye') {
      // Keep the printed pupil ahead of the quantized socket as gaze and blink vary.
      axes[11] += .0018;
    }
    const host = !fixed && s.role !== 'extra' ? body.wardrobeHost : undefined;
    const rigidFrame = !!host && s.role === 'glass';
    let faceLayer: number | undefined;
    if (rigidFrame) {
      const frame = frameMount(host!);
      axes = axes.map(v => v*frame.scale);
      axes[9] += host!.eyes.cx ?? 0;
      axes[10] += host!.eyes.y - frame.scale*.178125*DOT_RADIUS;
      axes[11] += frame.depth;
    } else if (host && isEye) {
      // Each style is measured on a different donor. Centre the entire eye,
      // including its inserts, on the host's socket before moving or blinking it.
      const stack = eyes.filter(part => part.side === s.side).sort((a,b) => b.origin[3]-a.origin[3]);
      const base = stack[0].origin, scale = host.eyes.x / (Math.abs(base[0])*DOT_RADIUS);
      faceLayer = stack.indexOf(s);
      axes = [scale,0,0, 0,scale*lid,0, 0,0,scale,
        (host.eyes.cx ?? 0) + s.side*host.eyes.x - scale*base[0]*DOT_RADIUS,
        host.eyes.y - scale*lid*base[1]*DOT_RADIUS, 0];
    }
    const gaze = !host && (isEye || s.role === 'socket') ? gazeTransform(gazeKey, index, axes, eyeX/.0391, eyeY/.0512) : undefined;
    if (!gaze && isEye) {
      axes[9] += eyeX;
      axes[10] += eyeY;
    }
    const bone = (isEye || s.role === 'socket') && motion.playback?.eyes[s.side < 0 ? 0 : 1];
    const fitting = s.catalogSection === undefined ? undefined : catalogFittings[s.catalogSection];
    let template: CoatMesh | undefined;
    if (fitting?.piece !== undefined) {
      const phones = featureSections['Headphones/rounded-triangle'];
      template = surfaceOf(phones[fitting.piece],phones).mesh;
    } else if (fitting) {
      template = dotMesh(fitting.mesh);
      if (template && fitting.builderFit) template = fittedMesh(template, builderFittings[fitting.builderFit]);
    }
    const spectacle = style.character === 'Josh' && spectacleMesh(s);
    let mesh: CoatMesh;
    if (spectacle) mesh = spectacle;
    else if (template && fitting) mesh = fittedMesh(template, fitting);
    else if (style.character === 'Josh' && s.role === 'extra') {
      // Fit the smooth three-lobed tuft to the portrait's measured envelope.
      // Its coarse optical section has internal depth seams across the forehead.
      mesh = dotMesh('Tuft')!;
      axes = [.929475,-.791,-.003192, .791775,.899,.004704, -.005164,-.0054,1.08528,
        -.402,-.232,.00504];
    }
    else if (style.character === 'Thelma' && s.role === 'extra') mesh = dotMesh('Thelma bulb')!;
    else if (rigidFrame) mesh = frameMesh(s);
    else mesh = surfaceOf(s, pieces).mesh;
    let insetSurface: number | undefined;
    if (!fixed && index < eyes.length) {
      if (frog && s.role === 'socket') insetSurface = 0;
      else if (!frog && style.eyes === 'Crescent inset') insetSurface = index % 3;
    }
    const dyedExtra = style.tintExtra && s.role === 'extra';
    result.push({
      mesh, faceLayer, tint: s.role === 'extra' ? extraTint : s.light ? WHITE : INK,
      axes: bone ? transformAxes(bone, gaze ?? axes) : gaze ?? axes,
      metal: dyedExtra && style.extra === 'Crown',
      material: dyedExtra ? undefined : (index < eyes.length && materials ? materials[index] : undefined) ?? s.material,
      insetSurface,
      catalogCrownLayer: !dyedExtra && fitting?.mesh === 'Crown' ? (s.material === 10 ? 13 : 12) : undefined,
      portraitSection: !dyedExtra && style.character ? index : undefined,
      finish: s.role === 'extra' ? undefined : s.light ? 'white' : !fixed ? 'ink' : s.role === 'glass' ? 'portrait-glass' : 'portrait-ink',
    });
  }
  return result;
}
