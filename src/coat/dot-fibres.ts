import { VIEW, VIEW_UNIT } from '../engine/draw';
import { DOT_RADIUS } from '../engine/dot-depth';
import { fibreDyeShader } from './dot-fibre-dye-shader';
import { fibreProfiles, fibreViews } from './dot-fibre-views';
import { tuftCoverage } from './dot-tuft-coverage';
import { triangleFibres } from './dot-fibre-data';

// Each translucent tuft is reconstructed from its centre and optical covariance across views.
// Projecting the 3D covariance lets a narrow tuft become broader as the wearer turns.
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 centre;
layout(location=1) in vec3 diagonal;
layout(location=2) in vec3 crossTerms;
uniform mat3 rotation;
uniform vec3 scale, offset;
uniform vec4 frame;
uniform highp sampler2DArray profiles;
uniform int viewIndex[6];
uniform vec3 viewX[6], viewY[6], weights[2];
${fibreDyeShader}
out vec2 local;
out vec4 radiance;
void main() {
  mat3 turn = rotation * mat3(scale.x,0.,0., 0.,scale.y,0., 0.,0.,scale.z);
  mat3 covariance = mat3(diagonal.x,crossTerms.x,crossTerms.y,
    crossTerms.x,diagonal.y,crossTerms.z, crossTerms.y,crossTerms.z,diagonal.z);
  mat3 ellipse = turn * covariance * transpose(turn);
  vec3 projected = turn * centre;
  vec2 residual = vec2(0.);
  mat2 correction = mat2(0.);
  vec3 light = vec3(0.);
  float seen = 0., peak = 0.;
  int group = gl_InstanceID < 5759 ? 0 : 1;
  for (int j=0; j<3; j++) {
    int i = group*3+j;
    ivec3 at = ivec3(3*(gl_InstanceID%128), gl_InstanceID/128, viewIndex[i]);
    vec4 first = texelFetch(profiles,at,0)*255.;
    vec4 second = texelFetch(profiles,at+ivec3(1,0,0),0)*255.;
    if (second.y < .5) continue;
    float w = weights[group][j];
    vec3 x = viewX[i], y = viewY[i];
    mat2 projection = mat2((turn*x).xy,(turn*y).xy);
    residual += w * projection * (first.xy-128.)/14.;
    mat2 observed = mat2(first.z,first.w-128.,first.w-128.,second.x)/12.;
    mat2 expected = mat2(dot(x,covariance*x),dot(x,covariance*y),dot(y,covariance*x),dot(y,covariance*y));
    correction += w*projection*(observed-expected)*transpose(projection);
    light += w*vec3(second.zw/255.,texelFetch(profiles,at+ivec3(2,0,0),0).x);
    peak += w*second.y/255.;
    seen += w;
  }
  float norm = max(.00001,seen);
  projected.xy += residual/norm;
  ellipse[0].xy += correction[0]/norm;
  ellipse[1].xy += correction[1]/norm;
  // Thickened bodies carry longer tufts as well as a denser covering.
  ellipse *= max(1.,scale.z);
  float mean = .5*(ellipse[0][0]+ellipse[1][1]);
  float radius = length(vec2(.5*(ellipse[0][0]-ellipse[1][1]),ellipse[0][1]));
  float angle = .5*atan(2.*ellipse[0][1],ellipse[0][0]-ellipse[1][1]+1e-8);
  vec2 axis = vec2(cos(angle),sin(angle)), across = vec2(-axis.y,axis.x);
  vec2 corner = vec2((gl_VertexID & 1) == 0 ? -1. : 1., gl_VertexID < 2 ? -1. : 1.);
  local = 3.5 * corner;
  projected.xy += axis*sqrt(max(.035,mean+radius))*local.x + across*sqrt(max(.035,mean-radius))*local.y;
  vec3 q = projected * ${DOT_RADIUS*3.64/512} + offset;
  vec2 clip = vec2(${(VIEW/2).toFixed(2)}-frame.x, frame.y-${(VIEW/2).toFixed(2)}) + ${VIEW_UNIT}. * q.xy;
  gl_Position = vec4(clip / frame.z,-(q.z+.009)/frame.w,1.);
  radiance = vec4(dyedFibre(light/norm),peak);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 local;
in vec4 radiance;
out vec4 pixel;
uniform sampler2D contact, tuftProfile;
uniform float contactExtent;
uniform vec3 contactColour[4];
void main() {
  vec2 uv = (.5+abs(local.yx)*(23./3.5))/24.;
  float alpha = radiance.a * texture(tuftProfile,uv).r;
  if (alpha < .001) discard;
  vec3 colour = radiance.rgb;
  if (contactExtent > 0.) {
    float shade = 1. - texture(contact,gl_FragCoord.xy/contactExtent).r;
    colour -= shade*(contactColour[0]+shade*contactColour[1]+(colour-.5)*(contactColour[2]+shade*contactColour[3]));
  }
  pixel = vec4(clamp(colour,0.,1.)*alpha,alpha);
}`;

// Below 80 registered pixels the renderer uses a second density curve.
export function dotFibreCount(size: number): number {
  const low = [[0,0],[32,63],[48,134],[64,232],[80,297]];
  for (let i=1; i<low.length; i++) {
    const [hi,highCount] = low[i], [lo,lowCount] = low[i-1];
    if (size < hi) return Math.max(0,Math.round(lowCount + (highCount-lowCount)*(size-lo)/(hi-lo)));
  }
  return Math.min(8192,Math.round(160 + .02136*size*size));
}

export function createDotFibres(gl: WebGL2RenderingContext,
  link: (gl: WebGL2RenderingContext, vert: string, frag: string) => WebGLProgram) {
  const program = link(gl,vertex,fragment);
  const uniforms = ['rotation','scale','offset','frame','fibreDye[0]','contactExtent','contactColour[0]'].map(name => gl.getUniformLocation(program,name));
  const views = fibreViews.map(v => ({
    x: v.slice(0,3), y: v.slice(3,6),
    z: [v[1]*v[5]-v[2]*v[4], v[2]*v[3]-v[0]*v[5], v[0]*v[4]-v[1]*v[3]],
  }));
  const uViews = ['viewIndex[0]', 'viewX[0]', 'viewY[0]', 'weights[0]'].map(name => gl.getUniformLocation(program,name));
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bytes = Uint8Array.from(atob(triangleFibres), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const data = new Float32Array(bytes.length/2);
  const stride = 9;
  for (let i = 0; i < data.length; i++) {
    const channel = i % stride;
    const divisor = channel < 3 ? 128 : 1024;
    data[i] = view.getInt16(2*i,true)/divisor;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  for (let location = 0; location < 3; location++) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,3,gl.FLOAT,false,stride*4,location*12);
    gl.vertexAttribDivisor(location,1);
  }
  const roots = data.length/stride;
  const height = Math.ceil(roots/128), width = 3*128, plane = width*height*4;
  const atlas = new Uint8Array(plane*views.length);
  const observations = atob(fibreProfiles);
  let at = 0;
  for (let v = 0; v < views.length; v++) {
    const mask = at; at += Math.ceil(roots/8);
    for (let id=0; id<roots; id++) {
      if (!(observations.charCodeAt(mask+(id>>3)) & (1<<(id&7)))) continue;
      const start = v*plane + id*12;
      for (let ch=0; ch<9; ch++) atlas[start+ch] = observations.charCodeAt(at++);
    }
  }
  gl.activeTexture(gl.TEXTURE14);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,width,height,views.length,0,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
  // Mean optical coverage measured along the long and short axes of 1,012 tufts.
  const profile = Uint8Array.from(atob(tuftCoverage),c => c.charCodeAt(0));
  gl.activeTexture(gl.TEXTURE15);
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,24,24,0,gl.RED,gl.UNSIGNED_BYTE,profile);
  gl.activeTexture(gl.TEXTURE2);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program,'tuftProfile'),15);
  gl.uniform1i(gl.getUniformLocation(program,'profiles'),14);
  gl.uniform1i(gl.getUniformLocation(program,'contact'),11);
  return (rotation: Float32Array, scale: readonly number[], offset: readonly number[], frame: readonly number[], size: number, dye: Float32Array, contact: Float32Array | undefined, pixels: number) => {
    // The first roots recur at every resolution. Smaller views use a lower density.
    const count = dotFibreCount(size);
    gl.useProgram(program);
    const eye = [rotation[2]/scale[0],rotation[5]/scale[1],rotation[8]/scale[2]];
    const length = Math.hypot(...eye);
    const ranked = views.map(({z},i) => ({ i, d: Math.max(.00001,1-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2])/length) }))
      .sort((a,b) => a.d-b.d);
    const nearest = [...ranked.slice(0,3), ...ranked.filter(v => v.i < 11).slice(0,3)];
    const weights = nearest.map(({d}) => 1/(d*d));
    const sums = [weights[0]+weights[1]+weights[2],weights[3]+weights[4]+weights[5]];
    gl.uniform1iv(uViews[0],nearest.map(({i})=>i));
    gl.uniform3fv(uViews[1],nearest.flatMap(({i})=>views[i].x));
    gl.uniform3fv(uViews[2],nearest.flatMap(({i})=>views[i].y));
    gl.uniform3fv(uViews[3],weights.map((w,i)=>w/sums[Math.floor(i/3)]));
    gl.uniform3fv(uniforms[4],dye);
    gl.uniform1f(uniforms[5],contact ? 2*Math.ceil(pixels/2) : 0);
    if (contact) gl.uniform3fv(uniforms[6],contact);
    gl.uniformMatrix3fv(uniforms[0],false,rotation);
    gl.uniform3f(uniforms[1],scale[0],scale[1],scale[2]);
    gl.uniform3f(uniforms[2],offset[0],offset[1],offset[2]);
    gl.uniform4f(uniforms[3],frame[0],frame[1],frame[2],frame[3]);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,Math.max(0,Math.min(roots,count)));
  };
}
