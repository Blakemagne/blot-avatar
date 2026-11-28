import { opticalBounds, opticalResponses, opticalSwatches } from './dot-optics';
import { createWardrobePower } from './wardrobe-power';
import { faceSurface } from './face-surface';
import { DOT_RADIUS } from '../engine/dot-depth';
import { dotRenderer } from '../engine/dot-renderer-registry';
import type { DotSolid } from '../engine/dot-features';
import { matteStudio, polishedStudio } from './ornament-light';
import { dotLighting, furLighting } from './dot-light';
// Ported from open-bot-avatar (MIT): dom/fluffy/renderer.ts, by Dominik Scholz.
//
// The coat's renderer: draws a body's coat of fur with WebGL2. Every avatar on the page shares one context (a
// browser allows only a handful), which draws one coat at a time into a corner of its own canvas, and the avatar
// copies its picture out at once (layer.ts). A coat is three kinds of draw over the same mesh: the body, a few
// shells of pile lifted off it, and the single strands (shaders.ts). Meshes go to the GPU once and stay while
// their avatars keep drawing, so a page of avatars only pays for drawing, and a small one draws less of each.

import { COAT_UNIT, coatDetail, rootsIn, type CoatMesh } from '../engine/coat';
import { VIEW_UNIT, type CoatWarp } from '../engine/draw';
import { DYE_RAMP_SIZE, dyeRamp, type Rgb } from '../engine/dye';
import type { FigureShape } from '../engine/figures';
import { D } from '../engine/math';
import { EYE_REACH, type EyeField } from './mask';
import { FIGURE, MAX_BALLS, MAX_RAYS, PASS, PILE_FINISH, fragmentShader, vertexShader } from './shaders';

/** The largest picture, device pixels a side. A bigger avatar's is drawn at this and stretched. */
export const MAX_PIXELS = 1024;
const MIN_PIXELS = 32;
/** This many meshes always stay on the GPU; any more only while they were drawn within IDLE_MS. */
const KEPT_MESHES = 8;
const IDLE_MS = 2000;
/** Room for the pile beyond the mesh, body units, in the depth range. */
const DEEPER = 0.2;
const PILE_OPACITY = [.85,.65,.47,.33,.18,.075,.018];

/** One coat to draw. */
export interface CoatFrame {
  glossy?: boolean;
  unlit?: boolean;
  power?: { amount: number; phase: number };
  depthScale?: number;
  character?: string;
  catalogId?: string;
  catalogGloss?: boolean;
  portraitDye?: number;
  dotBody?: string;
  orthographic?: boolean;
  solids?: readonly DotSolid[];
  /** The body's mesh: coatMesh(Drawing.coat.body). */
  mesh: CoatMesh;
  /** The pose's rotation, row by row (Drawing.coat.rotation). */
  rotation: ArrayLike<number>;
  playback?: import('../engine/dot-motion').DotPlayback;
  /** The square the picture covers, drawing units before the drawing's affine: `half` each way from (cx, cy). */
  cx: number;
  cy: number;
  half: number;
  /** Its side, device pixels. */
  pixels: number;
  /** Device pixels to a body unit: how much of the coat is worth drawing (coatDetail). */
  pxPerUnit: number;
  /** The body's colour, sRGB bytes. */
  colour: Rgb;
  /** The eyes, for the pile to part round them; null when none shows. */
  eyes: EyeField | null;
  /** In a change of shape, the coat stretched along rays onto the outline drawn (DrawnCoat.warp); unset on a body. */
  warp?: CoatWarp | null;
  /** A loading figure's shape this frame (Drawing.coat.shape): how its mesh is moved. None for a body. */
  shape?: FigureShape;
}

/** A drawn coat: the square `size` px a side at (x, y) in `canvas`, 2D canvas coordinates. Copy it at once: the next coat drawn takes its place. */
export interface CoatImage {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  size: number;
}

/** A mesh on the GPU, and what its shader needs to know of it. */
interface Geometry {
  surface: WebGLVertexArrayObject;
  strands: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indices: number;
  roots: number;
  middle: [number, number, number];
  extent: [number, number, number];
  deep: number;
  usedAt: number;
  face?: WebGLTexture;
}

/** Random root density in a repeating cube: a volume has no UV seams or poles. */
function rootVolume(side: number): Uint8Array {
  const roots = new Uint8Array(side ** 3);
  let seed = 73021;
  for (let i = 0; i < roots.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    roots[i] = seed >>> 24;
  }
  return roots;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()!;
  for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(kind)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compilation failed');
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'shader linking failed');
  return program;
}

type Renderer = (f: CoatFrame) => CoatImage | null;

/** Null without WebGL2. Throws if the shaders do not compile. */
function createRenderer(restored: () => void): Renderer | null {
  const canvas = document.createElement('canvas');
  // Square, and only ever grown (see below).
  canvas.width = canvas.height = MIN_PIXELS;
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  // A lost context draws nothing until the browser gives it back; the avatars are flat meanwhile.
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', restored);

  const program = link(gl, vertexShader, fragmentShader);
  gl.useProgram(program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    poseScale: uniform('poseScale'), poseOffset: uniform('poseOffset'), rotation: uniform('rotation'), view: uniform('view'), middle: uniform('middle'), extent: uniform('extent'), camera: uniform('camera'),
    matteBodyLayer: uniform('matteBodyLayer'), feltScale: uniform('feltScale'), feltGain: uniform('feltGain[0]'), feltExtent: uniform('feltExtent'), directLight: uniform('directLight[0]'), shadowWeights: uniform('shadowWeights[0]'),
    fibreDye: uniform('fibreDye[0]'), substrateRGB: uniform('substrateRGB'), substrateScale: uniform('substrateScale[0]'), builderPile: uniform('builderPile'), shellOpacity: uniform('shellOpacity'), contactExtent: uniform('contactExtent'), contactColor: uniform('contactColor[0]'), furLightLayer: uniform('furLightLayer'), tintLayer: uniform('tintLayer'), opticalLayer: uniform('opticalLayer'), fittedGloss: uniform('fittedGloss'), opticalFrame: uniform('opticalFrame'),
    glossCoefficients: uniform('glossCoefficients[0]'), pigmentControls: uniform('pigmentControls'), glossPigment: uniform('glossPigment'), finish: uniform('finish'), ornament: uniform('ornament'), axes: uniform('ornamentAxes'), offset: uniform('ornamentOffset'), metal: uniform('metal'),
    portraitCoat: uniform('portraitCoat'), glossy: uniform('glossy'), dyedMatte: uniform('dyedMatte'), unlit: uniform('unlit'), authoredTint: uniform('authoredTint'), eyePatch: uniform('eyePatch'), eyeRelief: uniform('eyeRelief'), faceBounds: uniform('faceBounds'), measuredLight: uniform('measuredLight'), studio: uniform('studio[0]'), orthographic: uniform('orthographic'),
    square: uniform('square'), shell: uniform('shell'), strandWidth: uniform('strandWidth'), pass: uniform('pass'), color: uniform('color'),
    eyeMap: uniform('eyeMap'), eyeRange: uniform('eyeRange'), warpN: uniform('warpN'), warpPress: uniform('warpPress'),
    figure: uniform('figure'), rays: uniform('rays'), balls: uniform('balls'), band: uniform('band'), restBall: uniform('restBall'), nowBall: uniform('nowBall'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  // (The eye field's rows are any number of bytes long.)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  // Texture units: 0 the pile, 1 the dye ramp, 2 the eye field.
  const texture = (unit: number, sampler: string, target: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, gl.createTexture());
    gl.uniform1i(uniform(sampler), unit);
  };
  const clampLinear = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  texture(0, 'brushedPile', gl.TEXTURE_3D);
  const side = 64;
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, side, side, side, 0, gl.RED, gl.UNSIGNED_BYTE, rootVolume(side));
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_3D);
  // The fibre program uses unit 15's 2d binding. Its array on unit 14 must
  // stay bound when a furry triangle and a portrait share the renderer.
  texture(15, 'ornamentDensity', gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.R8,1,1,1,0,gl.RED,gl.UNSIGNED_BYTE,null);
  let pileReady = false;
  texture(7, 'faceSurface', gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
  texture(1, 'dyeRamp', gl.TEXTURE_2D);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, DYE_RAMP_SIZE, 1);
  clampLinear();
  // 3 the warp: two floats a ray (the body's own reach, the outline's), read exactly (texelFetch) and blended in the shader.
  texture(3, 'warpRays', gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([1, 1]));
  gl.uniform1i(u.warpN, 0);
  // Last, so its unit stays active: the eyes change the most. Far from any eye until there are some.
  texture(2, 'eyeField', gl.TEXTURE_2D);
  clampLinear();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));

  // --- Meshes -------------------------------------------------------------------------------------------

  for (const [unit, sampler, studio] of [[4, 'matteStudio', matteStudio], [5, 'polishedStudio', polishedStudio]] as const) {
    texture(unit, sampler, gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, studio.width, studio.height, 0, gl.RG, gl.UNSIGNED_BYTE, studio.data);
  }
  const loadedTints = [new Set<number>(), new Set<number>(), new Set<number>()];
  for (const [unit, sampler] of [[8, 'matteTintStudio'], [9, 'metalTintStudio'], [12, 'furTintStudio']] as const) {
    texture(unit, sampler, gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA16F, 1, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
  }
  const tintLayer = (rgb: Rgb, kind: 0 | 1 | 2, assets: NonNullable<typeof dotRenderer>, catalogLayer?: number) => {
    const i = catalogLayer ?? assets.extraSwatches.indexOf((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
    const known = loadedTints[kind];
    if (i < 0 || known.has(i)) return i;
    const { width, height, layers } = kind === 2 ? assets.furRadiance : kind === 1 ? assets.extraRadiance.polished : assets.extraRadiance.matte;
    gl.activeTexture(gl.TEXTURE0 + [8,9,12][kind]);
    if (!known.size) gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA16F, width, height+7,
      layers.length, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const raw = atob(layers[i]);
    const data = Uint16Array.from({ length: raw.length/2 }, (_, k) => raw.charCodeAt(2*k) | (raw.charCodeAt(2*k+1)<<8));
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, width, height+7, 1, gl.RGBA, gl.HALF_FLOAT, data);
    gl.activeTexture(gl.TEXTURE2);
    known.add(i);
    return i;
  };
  const opticalLayers = new Map<string, number>();
  texture(6, 'opticalDensity', gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);

  const opticalLayer = (name: string, field: string, assets: NonNullable<typeof dotRenderer>) => {
    const known = opticalLayers.get(name);
    if (known !== undefined) return known;
    const layer = 2 * opticalLayers.size, size = assets.feltSize;
    gl.activeTexture(gl.TEXTURE6);
    if (layer === 0) gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, size, size,
      2 * (Object.keys(assets.feltReliefs).length + Object.keys(assets.builderReliefs).length + Object.keys(assets.fibreSubstrates).length), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const optical = assets.feltField(field,size, !!assets.feltReliefs[name]);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,layer,size,size,2,gl.RGBA,gl.UNSIGNED_BYTE,optical);
    gl.activeTexture(gl.TEXTURE2);
    opticalLayers.set(name, layer);
    return layer;
  };
  gl.activeTexture(gl.TEXTURE2);

  // A complete neutral texture also supports contexts that have only drawn ordinary blot avatars.
  texture(11, 'contactField', gl.TEXTURE_2D);
  clampLinear();
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([255]));
  gl.activeTexture(gl.TEXTURE2);
  texture(13, 'portraitShadow', gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1,1,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.activeTexture(gl.TEXTURE2);
  let wardrobePower: ReturnType<typeof createWardrobePower> | undefined;
  let contact: ReturnType<NonNullable<typeof dotRenderer>['createDotContact']> | undefined;
  let fibres: ReturnType<NonNullable<typeof dotRenderer>['createDotFibres']> | undefined;
  const geometries = new Map<CoatMesh, Geometry>();
  let sweepPending = false;

  const upload = (mesh: CoatMesh): Geometry => {
    const buffer = (target: number, data: Float32Array | Uint32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    const attributes = (stride: number, sizes: number[], perInstance: boolean) => {
      let offset = 0;
      sizes.forEach((size, location) => {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
        if (perInstance) gl.vertexAttribDivisor(location, 1);
        offset += 4 * size;
      });
    };
    // The body and its shells: position and normal per vertex.
    const surface = gl.createVertexArray()!;
    gl.bindVertexArray(surface);
    const vertices = buffer(gl.ARRAY_BUFFER, mesh.vertices);
    attributes(24, [3, 3], false);
    const grain = mesh.grain && buffer(gl.ARRAY_BUFFER, mesh.grain);
    if (grain) {
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2,2,gl.FLOAT,false,0,0);
    }
    const indices = buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    // The strands: one instance per root (position, normal, two random numbers); the shader shapes its eight
    // vertices from gl_VertexID.
    const strands = gl.createVertexArray()!;
    gl.bindVertexArray(strands);
    const roots = buffer(gl.ARRAY_BUFFER, mesh.roots);
    attributes(32, [3, 3, 2], true);
    const tangents = mesh.tangents?.length ? buffer(gl.ARRAY_BUFFER,mesh.tangents) : undefined;
    if (tangents) {
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3,3,gl.FLOAT,false,0,0);
      gl.vertexAttribDivisor(3,1);
    }
    gl.bindVertexArray(null);
    const [x0, y0, z0, x1, y1, z1] = mesh.box;
    return {
      surface, strands, buffers: [vertices,indices,roots,...(grain ? [grain] : []),...(tangents ? [tangents] : [])], indices: mesh.indices.length, roots: mesh.roots.length / 8,
      middle: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      extent: [Math.max(1e-3, (x1 - x0) / 2), Math.max(1e-3, (y1 - y0) / 2), Math.max(1e-3, (z1 - z0) / 2)],
      deep: mesh.radius + DEEPER, usedAt: 0,
    };
  };

  /** Free the meshes that have not been drawn for a while, beyond the few most recent. */
  const sweep = () => {
    const now = performance.now();
    for (const [mesh, geometry] of geometries) {
      if (geometries.size <= KEPT_MESHES) return;
      if (now - geometry.usedAt < IDLE_MS) continue;
      if (geometry.face) gl.deleteTexture(geometry.face);
      gl.deleteVertexArray(geometry.surface);
      gl.deleteVertexArray(geometry.strands);
      for (const b of geometry.buffers) gl.deleteBuffer(b);
      geometries.delete(mesh);
    }
    // Stills draw once: without another frame, nothing else would come back for theirs.
    if (!sweepPending) {
      sweepPending = true;
      setTimeout(() => {
        sweepPending = false;
        sweep();
      }, IDLE_MS);
    }
  };

  const geometryOf = (mesh: CoatMesh): Geometry => {
    let geometry = geometries.get(mesh);
    if (geometry) geometries.delete(mesh);
    else geometry = upload(mesh);
    // Most recently drawn last.
    geometries.set(mesh, geometry);
    geometry.usedAt = performance.now();
    if (geometries.size > KEPT_MESHES) sweep();
    return geometry;
  };

  // --- What is in the textures ----------------------------------------------------------------------------

  /** The colour in the dye ramp (0xRRGGBB), and the eye field's texels in its texture. */
  let dye = -1;
  let field: Uint8Array | null = null;
  const rotation = new Float32Array(9), view = new Float32Array(9);
  /** A figure's shape as its uniforms take it (at most 312 floats a frame). */
  const band = new Float32Array(2 * MAX_RAYS), rest = new Float32Array(4 * MAX_BALLS), now = new Float32Array(4 * MAX_BALLS);
  /** A byte of the eye field from 0 to 1 spans this many of open-bot-avatar's units. */
  const eyeRange = (2 * EYE_REACH) / (VIEW_UNIT * COAT_UNIT);

  return (f) => {
    if (gl.isContextLost()) return null;
    const geometry = geometryOf(f.mesh);
    const pixels = Math.max(1, Math.min(MAX_PIXELS, Math.round(f.pixels)));
    // Avatars of different sizes take turns in the canvas: it only grows, since resizing it allocates its
    // buffers anew. Each picture sits in the corner WebGL counts from, the lower left.
    if (canvas.width < pixels) canvas.width = canvas.height = pixels;

    const [r, g, b] = f.colour.map((v) => Math.max(0, Math.min(255, Math.round(v))));
    const key = (r << 16) | (g << 8) | b;
    if (key !== dye) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DYE_RAMP_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, dyeRamp([r, g, b]));
      gl.activeTexture(gl.TEXTURE2);
      dye = key;
    }
    const assets = f.dotBody ? dotRenderer : undefined;
    const originalDye = f.portraitDye === undefined || key === f.portraitDye;
    const character = originalDye ? f.character : undefined;
    const builder = assets && f.dotBody && !character && !f.glossy && assets.builderGain[key] ? assets.builderReliefs[f.dotBody] : undefined;
    const portrait = character && !f.glossy ? assets?.feltReliefs[character] : undefined;
    const fibreDye = builder && f.dotBody === 'dot-rounded-triangle' ? assets?.fibreDyes[key] : undefined;
    const substrate = fibreDye && assets ? assets.fibreSubstrates.channel0 : undefined;
    const relief = substrate ?? portrait ?? builder;
    const name = substrate ? f.dotBody + '/fibres' : character ?? f.dotBody;
    gl.uniform1i(u.builderPile,builder ? 1 : 0);
    gl.uniform1i(u.opticalLayer,relief && name && assets ? opticalLayer(name,relief.field,assets) : -1);
    gl.uniform1i(u.substrateRGB, substrate ? 1 : 0);
    if (fibreDye && assets) {
      gl.uniform3fv(u.fibreDye,fibreDye[0]);
      const channels = assets.fibreSubstrates;
      opticalLayer(name+'/g',channels.channel1.field,assets);
      opticalLayer(name+'/b',channels.channel2.field,assets);
      gl.uniform4fv(u.substrateScale, [...channels.channel0.scale,...channels.channel1.scale,...channels.channel2.scale]);
    }
    const felt = portrait && character && assets ? assets.feltLayers[character] : undefined;
    gl.uniform1i(u.furLightLayer, assets && relief ? tintLayer(substrate ? [0,177,255] : f.colour,2,assets,felt) : -1);
    if (relief && assets && !substrate) {
      gl.uniform4fv(u.feltScale,relief.scale);
      gl.uniform3fv(u.feltGain,portrait?.gain ?? assets.builderGain[key]);
    }
    if (portrait && character && assets) {
      const [centre, width] = assets.feltExtent[character];
      gl.uniform2f(u.feltExtent,centre*DOT_RADIUS/140.6592,width*DOT_RADIUS/140.6592);
    }
    const matte = f.catalogId && f.glossy && !f.catalogGloss;
    const matteBody = matte && originalDye;
    const matteDye = matte ? assets?.matteDyes[key] : undefined;
    const bodyMaterial = matteDye && assets?.matteBodyLayers[matteDye.material];
    gl.uniform1i(u.matteBodyLayer, assets && bodyMaterial !== undefined ? tintLayer(f.colour,0,assets,bodyMaterial) : -1);
    const swatch = !matteBody && f.dotBody && f.glossy ? opticalSwatches[key] : undefined;
    const calibration = f.dotBody && opticalBounds[f.dotBody];
    gl.uniform1i(u.fittedGloss, swatch && calibration ? 1 : 0);
    if (swatch && calibration) {
      const [field, tint, scale, chroma, pr, pg, pb] = swatch;
      const [cx,cy,cz,d] = calibration;
      gl.uniform4f(u.opticalFrame,cx*d,cy*d,cz*d,d/DOT_RADIUS);
      gl.uniform3fv(u.glossCoefficients,opticalResponses[field]);
      gl.uniform3f(u.pigmentControls,tint,scale,chroma);
      gl.uniform3f(u.glossPigment,pr,pg,pb);
    }
    gl.uniform1i(u.ornament, 0);
    gl.uniform1i(u.eyePatch, 0);
    gl.uniform1i(u.metal, 0);
    gl.uniform1i(u.orthographic, f.orthographic ? 1 : 0);
    gl.uniform1i(u.portraitCoat, character && !f.glossy ? 1 : 0);
    const light = matteBody && f.catalogId && assets ? assets.catalogLight[assets.catalogRigs[f.catalogId].body] : character && !f.glossy ? assets?.portraitLight[character] : f.glossy ? dotLighting[key] : f.orthographic ? furLighting[key] : undefined;
    gl.uniform1i(u.measuredLight, light ? 1 : 0);
    if (light) gl.uniform3fv(u.studio, light);
    gl.uniform1i(u.dyedMatte, matte && !originalDye && !matteDye ? 1 : 0);
    gl.uniform1i(u.unlit, f.unlit ? 1 : 0);
    gl.uniform1i(u.glossy, f.glossy ? 1 : 0);
    gl.uniform3f(u.color, r / 255, g / 255, b / 255);

    const eyes = f.eyes;
    if (eyes) {
      if (eyes.data !== field) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, eyes.w, eyes.h, 0, gl.RED, gl.UNSIGNED_BYTE, eyes.data);
        field = eyes.data;
      }
      // A pixel's drawing units, then the field's texture coordinates (its rows run down, the pixels' up).
      const [x0, y0, x1, y1] = eyes.box, step = (2 * f.half) / pixels;
      gl.uniform4f(u.eyeMap, step / (x1 - x0), -step / (y1 - y0), (f.cx - f.half - x0) / (x1 - x0), (f.cy + f.half - y0) / (y1 - y0));
      gl.uniform1f(u.eyeRange, eyeRange);
    } else gl.uniform1f(u.eyeRange, 0);

    if (f.warp && f.warp.own.length) {
      const { own, reach } = f.warp, n = own.length, rays = new Float32Array(2 * n);
      for (let i = 0; i < n; i++) { rays[2 * i] = own[i]; rays[2 * i + 1] = reach[i]; }
      gl.activeTexture(gl.TEXTURE3);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, n, 1, 0, gl.RG, gl.FLOAT, rays);
      gl.activeTexture(gl.TEXTURE2);
      gl.uniform1i(u.warpN, n);
      gl.uniform1f(u.warpPress, f.warp.press);
    } else gl.uniform1i(u.warpN, 0);

    const s = f.playback?.scale, origin = f.playback?.offset;
    gl.uniform3f(u.poseScale, s?.[0] ?? 1, s?.[1] ?? 1, (s?.[2] ?? 1) * (f.depthScale ?? 1));
    gl.uniform3f(u.poseOffset, origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
    const R = f.rotation;
    // Column by column, as GLSL reads a mat3. `view` is the same turn with y down, open-bot-avatar's way.
    rotation.set([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    view.set([R[0], -R[3], R[6], -R[1], R[4], -R[7], R[2], -R[5], R[8]]);
    gl.uniformMatrix3fv(u.rotation, false, rotation);
    gl.uniformMatrix3fv(u.view, false, view);
    gl.uniform3f(u.camera, R[6] * D, R[7] * D, R[8] * D);
    gl.uniform3fv(u.middle, geometry.middle);
    gl.uniform3fv(u.extent, geometry.extent);
    const stretch = Math.max(1, s?.[0] ?? 1, s?.[1] ?? 1, (s?.[2] ?? 1) * (f.depthScale ?? 1));
    const deep = (f.solids?.length ? Math.max(3, geometry.deep) : geometry.deep) * stretch + Math.abs(origin?.[2] ?? 0);
    gl.uniform4f(u.square, f.cx, f.cy, f.half, deep);
    const shape = f.shape;
    if (!shape) gl.uniform1i(u.figure, FIGURE.none);
    else if (shape.kind === 'band') {
      // Inner radii from 0, outer ones from `rays`, packed with no gap: what the shader's edge() reads.
      const n = Math.min(shape.rays, MAX_RAYS);
      band.fill(0);
      band.set(shape.band.subarray(0, n), 0);
      band.set(shape.band.subarray(shape.rays, shape.rays + n), n);
      gl.uniform1i(u.figure, FIGURE.band);
      gl.uniform1i(u.rays, n);
      gl.uniform4fv(u.band, band);
    } else {
      // (Unused balls are 1 big, so nothing divides by 0.)
      const k = Math.min(shape.from.length, shape.to.length, 4 * MAX_BALLS);
      rest.fill(1); rest.set(shape.from.subarray(0, k));
      now.fill(1); now.set(shape.to.subarray(0, k));
      gl.uniform1i(u.figure, FIGURE.balls);
      gl.uniform1i(u.balls, k / 4);
      gl.uniform4fv(u.restBall, rest);
      gl.uniform4fv(u.nowBall, now);
    }

    const matteContact = matte && !f.unlit && !shape && !f.warp
      ? matteDye?.contact ?? assets?.customMatteContact : undefined;
    const contactColour = builder ? assets?.contactColor[key] : matteContact;
    if (felt !== undefined && assets && character) {
      contact ??= assets.createDotContact(gl,link);
      contact(f,pixels,rotation,geometryOf,true);
      gl.useProgram(program);
      const shadow = assets.feltShadow[character];
      gl.uniform3fv(u.directLight,shadow.direct);
      gl.uniform4fv(u.shadowWeights,shadow.visibility);
    }
    if (contactColour && assets) {
      contact ??= assets.createDotContact(gl, link);
      contact(f,pixels,rotation,geometryOf);
      gl.useProgram(program);
      gl.uniform3fv(u.contactColor,contactColour);
    }
    gl.uniform1f(u.contactExtent,contactColour ? 2*Math.ceil(pixels/2) : 0);
    gl.viewport(0, 0, pixels, pixels);
    gl.scissor(0, 0, pixels, pixels);
    const hasSkinInk = f.solids?.some(p => p.skinInk);
    if (hasSkinInk) {
      gl.stencilMask(0xff);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS,1,0xff);
      gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (hasSkinInk ? gl.STENCIL_BUFFER_BIT : 0));
    // (A picture held to MAX_PIXELS is drawn at the detail it has, not the one asked for.)
    const { shells, strandPasses, strandWidth } = coatDetail((f.pxPerUnit * pixels) / Math.max(1, f.pixels));
    const drawPile = (geometry: Geometry) => {
      gl.uniform1i(u.pass, PASS.shell);
      for (let layer = 1; layer <= shells; layer++) {
        gl.uniform1f(u.shell, layer / shells);
        gl.drawElements(gl.TRIANGLES, geometry.indices, gl.UNSIGNED_INT, 0);
      }
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(geometry.strands);
      gl.uniform1i(u.pass, PASS.strand);
      gl.uniform1f(u.strandWidth, strandWidth);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 8, rootsIn(geometry.roots, strandPasses));
    };
    gl.bindVertexArray(geometry.surface);
    // The mesh is closed and wound outward, so faces turned away are left out; the strands are ribbons
    // turned to the camera, and are not.
    gl.enable(gl.CULL_FACE);
    gl.uniform1i(u.pass, PASS.body);
    gl.drawElements(gl.TRIANGLES, geometry.indices, gl.UNSIGNED_INT, 0);
    if (hasSkinInk) {
      gl.disable(gl.STENCIL_TEST);
      gl.stencilMask(0);
      gl.stencilFunc(gl.EQUAL,1,0xff);
      gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);
    }
    if (fibreDye && assets) {
      fibres ??= assets.createDotFibres(gl,link);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      fibres(rotation, [s?.[0] ?? 1,s?.[1] ?? 1,(s?.[2] ?? 1)*(f.depthScale ?? 1)], origin ?? [0,0,0],
        [f.cx,f.cy,f.half,deep],
        pixels*VIEW_UNIT*DOT_RADIUS*3.64*Math.max(1,f.depthScale ?? 1)/(2*f.half), fibreDye[1],contactColour || undefined,pixels);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
      gl.useProgram(program);
    } else if (relief) {
      // The solid pile sits on the unexpanded body. Translucent shells approximate the measured
      // alpha profile of the short cards at its edge without changing the opaque depth surface.
      const opacity = portrait ? [.896,.802,.646,.425,.196,.054,.008] : [.80,.73,.30,.13,.053,.032,.009];
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1i(u.pass,PASS.shell);
      for (let i=0; i<opacity.length; i++) {
        gl.uniform1f(u.shell,(i+1)/opacity.length);
        gl.uniform1f(u.shellOpacity,opacity[i]);
        gl.drawElements(gl.TRIANGLES,geometry.indices,gl.UNSIGNED_INT,0);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    } else if (!f.glossy) {
      drawPile(geometry);
    }
    const hasFacePatches = f.solids?.some(p => p.faceLayer !== undefined);
    const hasEyewear = f.solids?.some(p => p.eyewear);
    if (!f.glossy && !relief && (hasFacePatches || hasEyewear)) {
      // Shells and strands write depth. Restore the skin as the occluder for
      // fitted eyes and glasses so pile tips cannot show through the lenses.
      gl.colorMask(false,false,false,false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(geometry.surface);
      gl.uniform1i(u.pass,PASS.body);
      gl.drawElements(gl.TRIANGLES,geometry.indices,gl.UNSIGNED_INT,0);
      gl.colorMask(true,true,true,true);
    }
    const fittingDepth = f.character && assets?.fittingDepth[f.character];
    if (f.character && assets && fittingDepth && f.solids?.length && (portrait || R[8]<.5)) {
      // The opaque base of the fur lies below the visible skin. Keep buried
      // eyes and rims behind that skin when a pose exposes the cheek in profile.
      const [centre,width] = assets.feltExtent[f.character];
      const quarter = Math.max(0,Math.min(1,(.94-R[8])/.35));
      const profile = Math.max(0,Math.min(1,(.08-R[8])/.28));
      const level = fittingDepth[0] + (fittingDepth[1]-fittingDepth[0])*quarter*quarter*(3-2*quarter)
        + (fittingDepth[2]-fittingDepth[1])*profile*profile*(3-2*profile);
      gl.bindVertexArray(geometry.surface);
      gl.enable(gl.CULL_FACE);
      gl.uniform1i(u.portraitCoat,1);
      gl.colorMask(false,false,false,false);
      const grazing = Math.max(0,Math.min(1,(.5-R[8])/.4));
      const exposure = portrait ? 1 : grazing*grazing*(3-2*grazing);
      gl.uniform2f(u.feltExtent,exposure*(centre+width*level)*DOT_RADIUS/140.6592,0);
      gl.uniform1i(u.pass,PASS.body);
      gl.drawElements(gl.TRIANGLES,geometry.indices,gl.UNSIGNED_INT,0);
      gl.colorMask(true,true,true,true);
      gl.uniform1i(u.portraitCoat,character && !f.glossy ? 1 : 0);
    }
    if (f.power?.amount) {
      wardrobePower ??= createWardrobePower(gl,link);
      wardrobePower(pixels,f.cx,f.cy,f.half,f.power.amount,f.power.phase);
      gl.useProgram(program);
    }
    if (hasFacePatches) {
      gl.activeTexture(gl.TEXTURE7);
      if (!geometry.face) {
        const side = 160;
        geometry.face = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D,geometry.face);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,side,side,0,gl.RGBA,gl.FLOAT,faceSurface(f.mesh,side));
      } else gl.bindTexture(gl.TEXTURE_2D,geometry.face);
      gl.activeTexture(gl.TEXTURE2);
      const [x0,y0,,x1,y1] = f.mesh.box;
      gl.uniform4f(u.faceBounds,x0,y0,1/(x1-x0),1/(y1-y0));
    }
    for (const { mesh, tint, axes, metal, beret, finish, material, insetSurface, portraitSection, pileTint, catalogCrownLayer, faceLayer, skinInk } of f.solids ?? []) {
      if (skinInk) gl.enable(gl.STENCIL_TEST);
      const part = geometryOf(mesh);
      gl.uniform1i(u.eyePatch,faceLayer !== undefined ? 1 : 0);
      if (faceLayer !== undefined) {
        const thickness = Math.max(.0001,mesh.box[5]-mesh.box[2]);
        const relief = .006 * Math.abs(axes[0]);
        gl.uniform4f(u.eyeRelief,.006 + faceLayer*relief*1.2,mesh.box[2],1/thickness,relief);
      }
      const portraitIndex = f.character && portraitSection !== undefined ? assets?.portraitParts[f.character]?.[portraitSection] : undefined;
      const portableFelt = beret && material === undefined && portraitIndex === undefined;
      const fitting = portableFelt ? assets?.portraitMaterials[1] : portraitIndex === undefined ? undefined : assets?.portraitMaterials[portraitIndex];
      const soft = fitting?.pile && !f.unlit;
      if (soft && assets && !pileReady) {
        const { width, height, density } = assets.ornamentPile;
        gl.activeTexture(gl.TEXTURE15);
        gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.R8,width,height,2,0,gl.RED,gl.UNSIGNED_BYTE,
          Uint8Array.from(atob(density), char => char.charCodeAt(0)));
        gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.activeTexture(gl.TEXTURE2);
        pileReady = true;
      }
      if (fitting) gl.uniform3fv(u.studio, soft && fitting.pileLight ? fitting.pileLight : fitting.light);
      else if (assets && material !== undefined) gl.uniform3fv(u.studio, assets.catalogLight[material]);
      const matteLayer = material !== undefined ? assets?.mattePartLayers[material] : undefined;
      const portraitLayer = !f.unlit && f.character && portraitSection !== undefined
        ? assets?.portraitPartLayers[f.character]?.[portraitSection] : undefined;
      const layer = assets && insetSurface !== undefined ? assets.insetLayer + insetSurface : portraitLayer ?? catalogCrownLayer ?? matteLayer;
      const polished = !!metal || catalogCrownLayer !== undefined;
      const measuredTint = assets && (pileTint || portableFelt || layer !== undefined || (!fitting && material === undefined && !finish));
      gl.uniform1i(u.authoredTint, layer !== undefined || pileTint ? 1 : 0);
      gl.uniform1i(u.finish, layer !== undefined ? 0 : portableFelt ? 9 : fitting?.localReflection ? 8 : fitting?.pile ? (f.character === 'Josh' ? PILE_FINISH.tuft : PILE_FINISH.bulb) : fitting || material !== undefined ? 5 :
        finish === 'wire' ? 11 : finish === 'hair' ? PILE_FINISH.hair : finish === 'white' ? 2 : finish === 'portrait-ink' ? 3 : finish === 'portrait-glass' ? 4 : finish === 'ink' ? 1 : 0);
      gl.uniform1i(u.tintLayer, measuredTint ? tintLayer(tint,polished ? 1 : 0,assets,layer) : -1);
      const pileOffset = f.character === 'Thelma' ? .0035 : 0;
      if (soft) {
        gl.uniform1f(u.shell,pileOffset-.014);
        gl.uniform1f(u.shellOpacity,1);
      }
      gl.bindVertexArray(part.surface);
      gl.enable(gl.CULL_FACE);
      gl.uniform1i(u.pass, PASS.body);
      gl.uniform1i(u.ornament, 1);
      gl.uniform1i(u.metal, polished ? 1 : 0);
      gl.uniformMatrix3fv(u.axes, false, Float32Array.from(axes.slice(0, 9)));
      gl.uniform3f(u.offset, axes[9], axes[10], axes[11]);
      gl.uniform3f(u.color, tint[0] / 255, tint[1] / 255, tint[2] / 255);
      gl.drawElements(gl.TRIANGLES, part.indices, gl.UNSIGNED_INT, 0);
      if (finish === 'hair' && !f.unlit && part.roots) drawPile(part);
      if (soft) {
        // Draw an opaque core first. Overlapping lobes then occlude one another
        // before the translucent pile softens their silhouette.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (let i = 0; i < PILE_OPACITY.length; i++) {
          gl.uniform1f(u.shell,pileOffset-.010+i*.004);
          gl.uniform1f(u.shellOpacity,PILE_OPACITY[i]);
          gl.drawElements(gl.TRIANGLES,part.indices,gl.UNSIGNED_INT,0);
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      if (skinInk) gl.disable(gl.STENCIL_TEST);
    }
    gl.bindVertexArray(null);
    return { canvas, x: 0, y: canvas.height - pixels, size: pixels };
  };
}

let renderer: Renderer | null | undefined;
/** What to do when a lost context comes back: paint again the coats that went flat. */
const restores = new Set<() => void>();

/** The renderer, made the first time it is asked for: null where there is no WebGL2, or its shaders failed. */
function made(): Renderer | null {
  if (renderer === undefined) {
    renderer = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        // After a lost context comes back everything on the GPU is gone: start over with the next coat.
        renderer = createRenderer(() => {
          renderer = undefined;
          for (const again of [...restores]) again();
        });
      } catch (error) {
        console.warn('@blot/avatar: the fluffy coat cannot be drawn here, so it is flat', error);
      }
    }
  }
  return renderer;
}

/** Might a coat be drawn on this page? Cheap, and makes nothing: false once it is known that none can, or with no document at all. */
export const mightCoat = (): boolean => renderer !== null && typeof document !== 'undefined' && typeof document.createElement === 'function';

/** Can a coat be drawn on this page? False without WebGL2 (a server, a test, an old browser): the avatar is flat. */
export const coatable = (): boolean => made() !== null;

/** Call `again` when a lost context comes back, until the returned function is called. */
export function onRestored(again: () => void): () => void {
  restores.add(again);
  return () => { restores.delete(again); };
}

/** Draw a coat. Null where none can be drawn (no WebGL2, or its context is lost): draw the body flat instead. */
export function renderCoat(f: CoatFrame): CoatImage | null {
  return made()?.(f) ?? null;
}
