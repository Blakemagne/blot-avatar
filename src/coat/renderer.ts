// Ported from open-bot-avatar (MIT): dom/fluffy/renderer.ts, by Dominik Scholz.
//
// The coat's renderer: draws a body's coat of fur with WebGL2. Every avatar on the page shares one context (a
// browser allows only a handful), which draws one coat at a time into a corner of its own canvas, and the avatar
// copies its picture out at once (layer.ts). A coat is three kinds of draw over the same mesh: the body, a few
// shells of pile lifted off it, and the single strands (shaders.ts). Meshes go to the GPU once and stay while
// their avatars keep drawing, so a page of avatars only pays for drawing, and a small one draws less of each.

import { COAT_UNIT, coatDetail, rootsIn, type CoatMesh } from '../engine/coat';
import { VIEW_UNIT } from '../engine/draw';
import { DYE_RAMP_SIZE, dyeRamp, type Rgb } from '../engine/dye';
import { D } from '../engine/math';
import { EYE_REACH, type EyeField } from './mask';
import { PASS, fragmentShader, vertexShader } from './shaders';

/** The largest picture, device pixels a side. A bigger avatar's is drawn at this and stretched. */
export const MAX_PIXELS = 1024;
const MIN_PIXELS = 32;
/** This many meshes always stay on the GPU; any more only while they were drawn within IDLE_MS. */
const KEPT_MESHES = 8;
const IDLE_MS = 2000;
/** Room for the pile beyond the mesh, body units, in the depth range. */
const DEEPER = 0.2;

/** One coat to draw. */
export interface CoatFrame {
  /** The body's mesh: coatMesh(Drawing.coat.body). */
  mesh: CoatMesh;
  /** The pose's rotation, row by row (Drawing.coat.rotation). */
  rotation: ArrayLike<number>;
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
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  // A lost context draws nothing until the browser gives it back; the avatars are flat meanwhile.
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', restored);

  const program = link(gl, vertexShader, fragmentShader);
  gl.useProgram(program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    rotation: uniform('rotation'), view: uniform('view'), middle: uniform('middle'), extent: uniform('extent'), camera: uniform('camera'),
    square: uniform('square'), shell: uniform('shell'), strandWidth: uniform('strandWidth'), pass: uniform('pass'), color: uniform('color'),
    eyeMap: uniform('eyeMap'), eyeRange: uniform('eyeRange'),
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
  texture(1, 'dyeRamp', gl.TEXTURE_2D);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, DYE_RAMP_SIZE, 1);
  clampLinear();
  // Last, so its unit stays active: the eyes change the most. Far from any eye until there are some.
  texture(2, 'eyeField', gl.TEXTURE_2D);
  clampLinear();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));

  // --- Meshes -------------------------------------------------------------------------------------------

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
    const indices = buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    // The strands: one instance per root (position, normal, two random numbers); the shader shapes its eight
    // vertices from gl_VertexID.
    const strands = gl.createVertexArray()!;
    gl.bindVertexArray(strands);
    const roots = buffer(gl.ARRAY_BUFFER, mesh.roots);
    attributes(32, [3, 3, 2], true);
    gl.bindVertexArray(null);
    const [x0, y0, z0, x1, y1, z1] = mesh.box;
    return {
      surface, strands, buffers: [vertices, indices, roots], indices: mesh.indices.length, roots: mesh.roots.length / 8,
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

    const R = f.rotation;
    // Column by column, as GLSL reads a mat3. `view` is the same turn with y down, open-bot-avatar's way.
    rotation.set([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    view.set([R[0], -R[3], R[6], -R[1], R[4], -R[7], R[2], -R[5], R[8]]);
    gl.uniformMatrix3fv(u.rotation, false, rotation);
    gl.uniformMatrix3fv(u.view, false, view);
    gl.uniform3f(u.camera, R[6] * D, R[7] * D, R[8] * D);
    gl.uniform3fv(u.middle, geometry.middle);
    gl.uniform3fv(u.extent, geometry.extent);
    gl.uniform4f(u.square, f.cx, f.cy, f.half, geometry.deep);

    gl.viewport(0, 0, pixels, pixels);
    gl.scissor(0, 0, pixels, pixels);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // (A picture held to MAX_PIXELS is drawn at the detail it has, not the one asked for.)
    const { shells, strandPasses, strandWidth } = coatDetail((f.pxPerUnit * pixels) / Math.max(1, f.pixels));
    gl.bindVertexArray(geometry.surface);
    // The mesh is closed and wound outward, so faces turned away are left out; the strands are ribbons
    // turned to the camera, and are not.
    gl.enable(gl.CULL_FACE);
    gl.uniform1i(u.pass, PASS.body);
    gl.drawElements(gl.TRIANGLES, geometry.indices, gl.UNSIGNED_INT, 0);
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
