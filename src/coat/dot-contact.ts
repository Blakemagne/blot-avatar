import { VIEW, VIEW_UNIT } from '../engine/draw';
import { DOT_RADIUS } from '../engine/dot-depth';
import type { CoatMesh } from '../engine/coat-surface';
import type { CoatFrame } from './renderer';

type Surface = { surface: WebGLVertexArrayObject; indices: number };
type Link = (gl: WebGL2RenderingContext, vertex: string, fragment: string) => WebGLProgram;

// Registered orthographic projection of the studio key light, in units of one Dot radius.
export const dotLightProjection = `const mat4 lightProjection = mat4(
  .357288748,.121267810,.085709915,0., 0.,.343592137,-.114279896,0.,
  .214373216,-.202113032,-.142849863,0., 0.,0.,-.01010096,1.);`;

const depthVertex = `#version 300 es
layout(location=0) in vec3 position;
uniform mat3 rotation, axes;
uniform bool fromLight;
uniform vec3 scale, origin, offset, square;
${dotLightProjection}
void main() {
  vec3 world = rotation * (scale * (axes * position + offset)) + origin;
  if (fromLight) {
    gl_Position = lightProjection * vec4(world / ${DOT_RADIUS},1.);
    return;
  }
  gl_Position = vec4((${VIEW_UNIT}. * world.x + ${VIEW/2} - square.x) / square.z,
    (${VIEW_UNIT}. * world.y + square.y - ${VIEW/2}) / square.z, -world.z / 3., 1.);
}`;
const depthFragment = `#version 300 es
precision highp float;
void main() {}`;
const screenVertex = `#version 300 es
void main() {
  vec2 uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(2. * uv - 1., 0., 1.);
}`;
// Screen-space ambient occlusion on the actual fitted surface. Each ring integrates the solid angle
// occupied by nearby depth samples above the tangent plane, with a finite interaction distance.
const occlusionFragment = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D depths;
uniform float pxPerRadius;
out vec4 result;
float z(ivec2 p) {
  float depth = texelFetch(depths, clamp(p,ivec2(0),textureSize(depths,0)-1),0).r;
  return (3.-6.*depth) / ${DOT_RADIUS};
}
float slope(float plus, float minus) { return abs(plus) < abs(minus) ? plus : minus; }
const float radii[6] = float[](.012,.026,.044,.067,.098,.14);
const vec3 straight[6] = vec3[](vec3(0),vec3(0,0,.003),vec3(0,0,.234),vec3(0,0,.342),vec3(0,0,.643),vec3(0,0,.489));
const vec3 squared[6] = vec3[](vec3(.288,.467,.132),vec3(0,.393,.727),vec3(0,0,.287),vec3(0,0,.786),vec3(0,0,.521),vec3(0));
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy*2.);
  float center = z(p);
  if (center < -3.) { result = vec4(1.); return; }
  float gx = slope(z(p+ivec2(1,0))-center, center-z(p-ivec2(1,0)));
  float gy = slope(z(p+ivec2(0,1))-center, center-z(p-ivec2(0,1)));
  vec3 normal = normalize(vec3(-gx*pxPerRadius,-gy*pxPerRadius,1.));
  float total = 0.;
  for (int ring=0; ring<6; ring++) for (int i=0; i<12; i++) {
    float angle = float(i)*.523598775598;
    ivec2 stepPx = ivec2(round(radii[ring]*pxPerRadius*vec2(cos(angle),sin(angle))));
    vec3 ray = vec3(vec2(stepPx)/pxPerRadius,z(p+stepPx)-center);
    float d2 = dot(ray,ray);
    float above = max(0.,dot(normal,ray)*inversesqrt(max(d2,.00000001))-.05);
    vec3 weight = max(vec3(0),1.-d2/vec3(.007225,.0256,.055225));
    total += above*dot(weight*weight,straight[ring]+above*squared[ring]);
  }
  result = vec4(vec3(clamp(1.-total/12.,0.,1.)),1.);
}`;

const identity = new Float32Array([1,0,0,0,1,0,0,0,1]);

export function createDotContact(gl: WebGL2RenderingContext, link: Link) {
  const depth = link(gl, depthVertex, depthFragment), shade = link(gl, screenVertex, occlusionFragment);
  const uniform = (name: string) => gl.getUniformLocation(depth,name);
  const u = { rotation: uniform('rotation'), axes: uniform('axes'), offset: uniform('offset'),
    scale: uniform('scale'), origin: uniform('origin'), square: uniform('square'), fromLight: uniform('fromLight') };
  const pxPerRadius = gl.getUniformLocation(shade,'pxPerRadius');
  const depthFrame = gl.createFramebuffer(), aoFrame = gl.createFramebuffer();
  const depthTex = gl.createTexture(), aoTex = gl.createTexture(), fullscreen = gl.createVertexArray();
  let width = 0;
  let shadowFrame: WebGLFramebuffer | undefined;
  function allocateShadow() {
    const frame = gl.createFramebuffer()!;
    gl.activeTexture(gl.TEXTURE13);
    const map = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,map);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1024,1024,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,map,0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    return frame;
  }
  function allocate(pixels: number) {
    const half = Math.ceil(pixels/2);
    for (const [unit, texture, filter] of [[10,depthTex,gl.NEAREST],[11,aoTex,gl.LINEAR]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (unit === 10) gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,pixels,pixels,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,half,half,0,gl.RED,gl.UNSIGNED_BYTE,null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,depthFrame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,aoFrame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,aoTex,0);
    width = pixels;
  }
  gl.useProgram(shade); gl.uniform1i(gl.getUniformLocation(shade,'depths'),10);
  return (f: CoatFrame, pixels: number, rotation: Float32Array, surfaceOf: (mesh: CoatMesh) => Surface, fromLight = false) => {
    if (fromLight) shadowFrame ??= allocateShadow();
    else if (width !== pixels) allocate(pixels);
    const size = fromLight ? 1024 : pixels;
    gl.bindFramebuffer(gl.FRAMEBUFFER,fromLight ? shadowFrame! : depthFrame);
    gl.viewport(0,0,size,size); gl.scissor(0,0,size,size);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depth);
    gl.uniform1i(u.fromLight,fromLight ? 1 : 0);
    gl.uniformMatrix3fv(u.rotation,false,rotation);
    const s = f.playback?.scale, o = f.playback?.offset;
    gl.uniform3f(u.scale,s?.[0] ?? 1,s?.[1] ?? 1,s?.[2] ?? 1);
    gl.uniform3f(u.origin,o?.[0] ?? 0,o?.[1] ?? 0,o?.[2] ?? 0);
    gl.uniform3f(u.square,f.cx,f.cy,f.half);
    function draw(mesh: CoatMesh, axes?: readonly number[]) {
      const part = surfaceOf(mesh);
      gl.uniformMatrix3fv(u.axes,false,axes ? Float32Array.from(axes.slice(0,9)) : identity);
      gl.uniform3f(u.offset,axes?.[9] ?? 0,axes?.[10] ?? 0,axes?.[11] ?? 0);
      gl.bindVertexArray(part.surface);
      gl.drawElements(gl.TRIANGLES,part.indices,gl.UNSIGNED_INT,0);
    }
    draw(f.mesh);
    for (const solid of f.solids ?? []) draw(solid.mesh,solid.axes);
    if (fromLight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.activeTexture(gl.TEXTURE2);
      return;
    }
    const half = Math.ceil(pixels/2);
    gl.bindFramebuffer(gl.FRAMEBUFFER,aoFrame); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(shade); gl.viewport(0,0,half,half); gl.scissor(0,0,half,half);
    gl.uniform1f(pxPerRadius, VIEW_UNIT*DOT_RADIUS*pixels/(2*f.half));
    gl.bindVertexArray(fullscreen); gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.enable(gl.DEPTH_TEST); gl.activeTexture(gl.TEXTURE2);
  };
}
