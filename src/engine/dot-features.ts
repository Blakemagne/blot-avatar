import { frontDepth } from '../coat/face-surface';
import { fittedRim } from './dot-rim-fit';
import { fitFrameNormals } from './dot-frame-normals';
import { bowNormals } from './dot-bow-normals';
import { socketMotion } from './dot-motion';
import { portraitMount } from './dot-portrait-fit';
import { coversEyes, FRAME_CURVE, frameMount, type DotStyle } from './dot-parts';
import { lidSurfaces } from './dot-lid-surfaces';
import { eyeSurfaces } from './dot-eye-surfaces';
import { spectacleMesh } from './dot-portrait-eye';
import { eyeSurfaceMesh } from './dot-eye-mesh';
import { builderFittings } from './dot-builder-fittings';
import { catalogFittings } from './dot-catalog-fittings';
import { fittedMesh } from './dot-fitted-mesh';
import { gazeTransform, hasGazeRig, seatMovingOval, transformAxes } from './dot-gaze';
import { catalogOvals } from './dot-catalog-ovals';
import { catalogParts } from './dot-catalog-parts';
import { eyewearFits, eyeMaterials, frameFits } from './dot-eyewear-fits';
import { faceFits } from './dot-face-fits';
import type { Body } from './body';
import type { CoatMesh } from './coat-surface';
import type { Rgb } from './dye';
import { dotMesh, DOT_RADIUS, sectionMesh } from './dot-mesh';
import { featureSections, type FeatureSection } from './dot-feature-sections';

export interface DotFaceMotion {
  /** Minimum height of closed ink in body units at the displayed size. */
  minStroke?: number;
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
  beret?: boolean;
  contact?: 'bow' | 'frame' | 'monocle';
  eyewear?: boolean;
  material?: number;
  insetSurface?: number;
  portraitSection?: number;
  /** Layer above the host shell in an eye insert (base, pupil, catchlight). */
  faceLayer?: number;
  /** Printed facial ink is only visible over the wearer's projected shell. */
  skinInk?: boolean;
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
for (const [name, entries] of Object.entries({ ...eyeSurfaces, ...lidSurfaces })) {
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

// Fitted ellipsoids for the beret domes and headphone cushions. Each quadratic
// describes squared half-thickness, followed by the three mid-plane coefficients.
const ellipsoids = new Map<FeatureSection, readonly number[]>([
  // Outer cups and inner cushions fitted to the headphone cross-sections.
  [featureSections.Iggy[2], [.44378,.00141,-.00145,-1.56924,.08615,-.46052,.00005,-.00008,0]],
  [featureSections.Iggy[3], [.83653,.06544,-.00044,-6.1108,-.01221,-.85558,.00004,-.00062,-.00006]],
  [featureSections.Iggy[4], [.44355,-.00105,-.00175,-1.56803,-.08827,-.46007,-.00001,-.00006,-.00005]],
  [featureSections.Iggy[5], [.83711,-.06897,-.00121,-6.13359,-.00308,-.85554,-.00012,-.00084,-.00006]],
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
  const oval = section.catalogSection === undefined ? undefined : catalogOvals[section.catalogSection];
  const thickness = (x: number, y: number) => {
    if (oval) {
      // These depth measurements describe the bevel inside the eye's outline.
      if (distance(x,y) < -.025) return -.002;
      let start = 0, squaredThickness = 0;
      for (let degree = 0; degree <= 6; degree++) {
        let term = 0, yPower = 1;
        for (let i = degree; i >= 0; i--) {
          term = term*x + oval[start+i]*yPower;
          yPower *= y;
        }
        start += degree + 1;
        squaredThickness += term;
      }
      return squaredThickness;
    }
    const gain = sample(section.thickness, x, y);
    return distance(x,y)*gain*gain;
  };
  const centre = (x: number, y: number) => {
    if (oval) return oval[28]+oval[29]*y+oval[30]*x;
    const own = sample(section.centre, x, y);
    const z = parent?.front(cx + radius*x, cy + radius*y);
    return z === undefined ? own : Math.max(own, (z + .0018 - cz) / radius);
  };
  const measured = opticalSurfaces.get(section);
  const quad = ellipsoids.get(section);
  const mesh = quad ? sectionMesh(section.origin, radius, 128,
    (x,y) => quad[0]+quad[1]*x+quad[2]*y+quad[3]*x*x+quad[4]*x*y+quad[5]*y*y,
    (x,y) => quad[6]+quad[7]*x+quad[8]*y)
    : measured ? eyeSurfaceMesh(measured) : sectionMesh(section.origin, radius, oval ? 72 : section.role === 'glass' || section.role === 'extra' ? 72 : 44,
    thickness, centre);
  const portrait = ['Alfred', 'Felipe', 'Iggy', 'Thelma'].find(name => parts === featureSections[name]);
  if (portrait && !measured) fitFrameNormals(mesh, portrait, parts.indexOf(section));
  if (section.role === 'extra') {
    const wearer = parts === featureSections.Todd ? 'Todd' : parts === featureSections.Alfred ? 'Alfred' : undefined;
    if (wearer) {
      const coeff = bowNormals[wearer][section.side < 0 ? 0 : 1], v = mesh.vertices;
      for (let i = 0; i < v.length; i += 6) {
        if (v[i+5] <= 0) continue;
        const x = (v[i]/DOT_RADIUS-cx)/radius, y = (v[i+1]/DOT_RADIUS-cy)/radius;
        const n = [0,0,0];
        let k = 0;
        for (let degree = 0; degree <= 5; degree++) for (let j = 0; j <= degree; j++) {
          const term = x**(degree-j) * y**j;
          for (let d = 0; d < 3; d++) n[d] += coeff[k++] * term;
        }
        const length = Math.hypot(...n) || 1;
        for (let d = 0; d < 3; d++) v[i+3+d] = n[d]/length;
      }
    }
  }
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

/** The band, dome and button share the portrait's original local coordinates. */
let cap: CoatMesh[] | undefined;
export function beretSections(): CoatMesh[] {
  const parts = featureSections.Felipe;
  return cap ??= parts.filter(part => part.role === 'extra').map(part => surfaceOf(part, parts).mesh);
}

const INK: Rgb = [32,32,32], WHITE: Rgb = [254,254,254];
const IDENTITY = [1,1,0,0,1,0,0,0] as const;
const STILL: DotFaceMotion = { x:0, y:0, left:1, right:1 };
// The editable frog wears Todd's two socket/pupil pairs independently of his outfit.
const raisedEyes = featureSections.Todd.filter(s => s.role === 'socket' || s.role === 'eye');
/** The front surface also occludes the far eye across a nose or a raised
 * socket. Cache its rasterized depth through the same mesh used by WebGL. */
export function faceDepthAt(body: Body) {
  const style = body.dotStyle!;
  const surface = dotMesh(style.character ?? (style.catalogId ? 'catalog-'+body.id : body.id));
  return surface && ((x: number,y: number) => frontDepth(surface,x,y));
}

/** Project the same moving ink and highlight centres onto the SVG contours. */
export function vectorEyeGaze(body: Body, side: number, look: readonly number[]): number[][] | undefined {
  const style = body.dotStyle!;
  const fixed = !style.replaceEyes && (style.catalogId ? catalogParts(style.catalogId) : style.character && featureSections[style.character]);
  const frog = !body.wardrobeHost && body.id === 'dot-rounded-head-with-two-ears';
  if (!style.socketRig && style.eyes === 'Oval' && (!fixed || style.character === 'Felipe flower' || style.character === 'Blossie')) return;
  const key = fixed ? style.catalogId ? 'catalog/'+style.catalogId : 'portrait/'+style.character
    : style.socketRig ? 'portrait/Todd' : (body.wardrobeHost ? 'dot-rounded-triangle' : body.id)+'/'+(frog ? 'Raised sockets' : style.eyes);
  if (!hasGazeRig(key)) return;
  const pieces = fixed || (style.socketRig ? raisedEyes : featureSections[frog ? 'Raised sockets' : style.eyes]);
  const offsets: number[][] = [];
  for (const [i,s] of pieces.entries()) {
    if (s.side !== side || (s.role !== 'socket' && s.role !== 'eye' && s.role !== 'catch')) continue;
    const m = gazeTransform(key,i,[1,0,0,0,1,0,0,0,1,0,0,0],look[0],look[1]);
    const [x,y,z] = s.origin;
    const scale = body.wardrobeHost ? body.eyes.x/(DOT_RADIUS*Math.abs(x)) : 1;
    offsets.push(m ? [0,1,2].map(k => scale*(DOT_RADIUS*(m[k]*x+m[k+3]*y+m[k+6]*z-[x,y,z][k])+m[k+9])) : [0,0,0]);
  }
  return offsets;
}

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
  const eyes = coversEyes(style) || style.originalEyes ? [] : style.socketRig ? raisedEyes : featureSections[frog ? 'Raised sockets' : style.eyes];
  const phones = style.extra === 'Headphones' ? featureSections[body.wardrobeHost ? 'Headphones/circle' : 'Headphones/' + body.id.slice(4)] ?? [] : [];
  const pieces = fixed ?? [...eyes,...glasses,...phones];
  const fits = fixed || body.wardrobeHost ? undefined : faceFits[body.id];
  const gazeKey = style.catalogId ? 'catalog/' + style.catalogId : style.character ? 'portrait/' + style.character
    : (body.wardrobeHost ? 'blot' : body.id) + '/' + (frog ? 'Raised sockets' : style.eyes);
  const eyeGazeKey = style.socketRig && !fixed ? 'portrait/Todd' : gazeKey;
  const mountedKey = gazeKey + '/' + style.glasses;
  const relativeEyes = !fixed && eyewearFits[mountedKey];
  const mountedFrames = !fixed && frameFits[mountedKey];
  const materials = !fixed && eyeMaterials[gazeKey];
  const eyeX = motion.x * body.eyes.slideX, eyeY = motion.y * body.eyes.slideY;
  // Motion tracks were sampled on the oval donor. Conjugate each bone around
  // the wearer's resting eye so a wink on a high brow closes at that brow.
  const ovalShell = motion.playback && !fixed && !body.wardrobeHost && !frog && style.eyes === 'Oval'
    && body.id !== 'dot-rounded-triangle' ? dotMesh(body.id) : undefined;
  const playbackEyes = ovalShell && motion.playback?.naturalEyes || motion.playback?.eyes;
  const bones = playbackEyes?.map((bone, index) => {
    const side = index === 0 ? -1 : 1;
    const donor = featureSections.Oval[index].origin;
    const socket = pieces.find(section => section.side === side && section.role === 'socket');
    const anchor = socket ?? pieces.find(section => section.side === side && section.role === 'eye');
    if (!anchor) return bone;
    const host = body.wardrobeHost;
    const fit = !frog && fits?.[style.eyes]?.[index] || IDENTITY;
    const relative = relativeEyes && relativeEyes[pieces.indexOf(anchor)];
    const x = host ? ((host.eyes.cx ?? 0) + side*host.eyes.x)/DOT_RADIUS
      : fit[0]*anchor.origin[0] + fit[5] + (relative ? relative[0] : 0);
    const y = host ? host.eyes.y/DOT_RADIUS
      : fit[1]*anchor.origin[1] + fit[6] + (relative ? relative[1] : 0);
    const dx = x-donor[0], dy = y-donor[1];
    const fitted = bone.slice();
    fitted[9] += dx - bone[0]*dx - bone[3]*dy;
    fitted[10] += dy - bone[1]*dx - bone[4]*dy;
    fitted[11] -= bone[2]*dx + bone[5]*dy;
    if (ovalShell && fit[0] !== 1) {
      // Smaller eyes travel proportionally less across the rabbit and hexagon.
      const travel = fit[0]-1;
      fitted[9] += travel*((bone[0]-1)*donor[0]+bone[3]*donor[1]+bone[9]);
      fitted[10] += travel*(bone[1]*donor[0]+(bone[4]-1)*donor[1]+bone[10]);
    }
    if (ovalShell) seatMovingOval(fitted,x,y,(u,v) => {
      const depth = frontDepth(ovalShell,u*DOT_RADIUS,v*DOT_RADIUS);
      return depth === undefined ? undefined : depth/DOT_RADIUS;
    });
    return fitted;
  });
  const activity = motion.playback?.activity;
  const sockets = frog && (!fixed || style.character === 'Todd') && activity
    ? socketMotion(style.socketRig ?? (fixed ? 'todd' : 'frog'), activity) : undefined;
  // Oval eye solids also perform expressive deformations independent of gaze.
  // The other measured rigs move the individual ink, socket and highlight layers.
  const focusKey = body.wardrobeHost ? 'dot-rounded-triangle/' + style.eyes : eyeGazeKey;
  const useFocus = activity && !sockets && hasGazeRig(focusKey)
    && (style.eyes !== 'Oval' || style.socketRig || fixed && style.character !== 'Felipe flower' && style.character !== 'Blossie');
  const restingLids = style.character === 'Alfred' && !style.replaceEyes;
  const result: DotSolid[] = [];
  for (const [index, s] of pieces.entries()) {
    if (include && !include(s)) continue;
    const isEye = s.role === 'eye' || s.role === 'catch';
    const fit = s.role === 'glass' ? fits?.[style.glasses]?.[0]
      : isEye && !frog ? fits?.[style.eyes]?.[s.side < 0 ? 0 : 1] : undefined;
    const [sx,sy,zx,zy,sz,dx,dy,dz] = fit ?? IDENTITY;
    const donorBone = !s.brow && (isEye || s.role === 'socket') && bones?.[s.side < 0 ? 0 : 1];
    const socketBone = (isEye || s.role === 'socket') && sockets?.[index];
    const bone = socketBone || (!useFocus && donorBone);
    const blinking = isEye && !s.brow || frog && s.role === 'socket';
    const blink = s.side < 0 ? motion.left : motion.right;
    const playbackLid = (socketBone || useFocus) && donorBone ? Math.min(1, donorBone[4]) : 1;
    const lid = blinking && !restingLids ? Math.max(.055, blink * playbackLid) : 1;
    // A closed lid hides the socket and its reflections. Compressing white
    // inserts to the minimum thickness leaves a bright stripe through the blink.
    const closed = lid * (bone ? bone[4] : 1) < .12;
    if (closed && (s.role === 'catch' || frog && s.role === 'socket')) continue;
    const pivot = s.role === 'catch' ? pieces.find(part => part.role === 'eye' && part.side === s.side) : s;
    // The sleepy pupil closes under the brow. Each side has its own blink.
    const brow = style.eyes === 'Sleepy lids' && isEye && pieces.find(p => p.brow && p.side === s.side);
    const lidPivot = (brow || pivot || s).origin[1]*DOT_RADIUS;
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
    // When the white support disappears the closed stroke sits on the skin.
    // At profile angles leaving it at pupil depth exposes a detached sliver.
    let faceLayer: number | undefined = closed && isEye ? 0 : undefined;
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
    const lookX = useFocus ? activity.gaze[0] : 0, lookY = useFocus ? activity.gaze[1] : 0;
    const usePointer = !activity || activity.slug === 'ready';
    let gaze: number[] | undefined;
    if (isEye || s.role === 'socket') {
      if (socketBone && activity?.slug !== 'ready') gaze = axes;
      else if (host && useFocus) {
        // Express the motion in the donor insert's coordinates first. Its
        // calibrated highlight can move independently of the ink on a Blot face.
        const local = gazeTransform(focusKey,index,[1,0,0, 0,1,0, 0,0,1, 0,0,0],
          lookX + (usePointer ? eyeX/.0391 : 0), lookY + (usePointer ? eyeY/.0512 : 0));
        if (local) gaze = transformAxes([...axes.slice(0,9), ...axes.slice(9).map(v => v/DOT_RADIUS)], local);
      } else if (!host) {
        gaze = gazeTransform(eyeGazeKey,index,axes,lookX + (usePointer ? eyeX/.0391 : 0),lookY + (usePointer ? eyeY/.0512 : 0));
      }
    }
    if (!gaze && isEye && usePointer) {
      axes[9] += eyeX;
      axes[10] += eyeY;
    }
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
    if (frame && (style.glasses === 'Tall oval frames' || style.glasses === 'Monocle')) mesh = fittedRim(mesh,frame,style.glasses,s.side);
    let insetSurface: number | undefined;
    if (!fixed && index < eyes.length) {
      if (frog && s.role === 'socket') insetSurface = 0;
      else if (!frog && style.eyes === 'Crescent inset') insetSurface = index % 3;
    }
    const dyedExtra = style.tintExtra && s.role === 'extra';
    const placed = bone ? transformAxes(bone, gaze ?? axes) : gaze ?? axes;
    if (motion.minStroke && isEye && !s.brow && !s.light && lid < .5) {
      // A fully shut pupil can be narrower than one display pixel on a small
      // avatar. Thicken the stroke around its centre without moving the eye.
      const bottom = mesh.box[1], top = mesh.box[4];
      const target = Math.min(.48 * Math.abs(placed[0]), motion.minStroke / (top - bottom));
      if (placed[4] >= 0 && placed[4] < target) {
        placed[10] -= (target - placed[4]) * (top + bottom) / 2;
        placed[4] = target;
      }
    }
    result.push({
      mesh, beret: s.role === 'extra' && style.extra === 'Beret', faceLayer, skinInk: !frog && !host && isEye && style.eyes !== 'Oval' && style.character !== 'Josh' && !!activity && activity.slug !== 'ready',
      eyewear: s.role === 'glass',
      contact: s.role === 'extra' && style.extra === 'Bow tie' ? 'bow' :
        rigidFrame && style.glasses === 'Monocle' ? 'monocle' :
        s.role === 'glass' && (style.glasses === 'Tall oval frames' || style.glasses === 'Separate trapezoid lenses') ? 'frame' : undefined,
      tint: s.role === 'extra' ? extraTint : s.light ? WHITE : INK,
      axes: placed,
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
