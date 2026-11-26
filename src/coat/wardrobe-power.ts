import { RAINBOW_LINE, ULTRA_PALETTE } from '../ultra';

type Link = (gl: WebGL2RenderingContext, vertex: string, fragment: string) => WebGLProgram;

/** Apply the moving rainbow to the rendered shell and its pile, preserving
 * alpha and the depth buffer for the eyes and accessories drawn after it. */
export function createWardrobePower(gl: WebGL2RenderingContext, link: Link) {
  const program = link(gl, `#version 300 es
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2));
      gl_Position = vec4(p*2.-1.,0.,1.);
    }`, `#version 300 es
    precision highp float;
    uniform sampler2D shell;
    uniform vec4 framing;
    uniform vec2 power;
    const int bands = ${ULTRA_PALETTE.length};
    uniform vec3 palette[bands];
    uniform vec4 line;
    out vec4 result;
    void main() {
      vec4 base = texelFetch(shell,ivec2(gl_FragCoord.xy),0);
      if (base.a < .001) { result = base; return; }
      vec2 pos = framing.xy + (2.*gl_FragCoord.xy/framing.w-1.)*vec2(framing.z,-framing.z);
      vec2 direction = line.zw-line.xy;
      float t = float(bands)*fract(dot(pos-line.xy,direction)/dot(direction,direction)+power.y);
      int band = int(t);
      vec3 hue = mix(palette[band],palette[(band+1)%bands],fract(t));
      vec3 rgb = base.rgb/base.a;
      // Preserve the local contrast of the rendered coat in the moving band.
      float light = dot(rgb,vec3(.30,.59,.11));
      vec3 tinted = hue * (.49 + .82*light);
      tinted += .22 * smoothstep(.76,1.,light);
      result = vec4(mix(rgb,clamp(tinted,0.,1.),power.x)*base.a,base.a);
    }`);
  const location = (name: string) => gl.getUniformLocation(program,name);
  const framing = location('framing'), power = location('power');
  gl.useProgram(program);
  gl.uniform1i(location('shell'),0);
  gl.uniform4fv(location('line'),RAINBOW_LINE);
  gl.uniform3fv(location('palette[0]'),ULTRA_PALETTE.flatMap(hex =>
    [1,3,5].map(start => parseInt(hex.slice(start,start+2),16)/255)));
  const copy = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,copy);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  let capacity = 0;
  return (pixels: number, cx: number, cy: number, half: number, amount: number, phase: number) => {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,copy);
    if (pixels > capacity) {
      capacity = pixels;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,pixels,pixels,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,pixels,pixels);
    gl.uniform4f(framing,cx,cy,half,pixels);
    gl.uniform2f(power,amount,phase);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE2);
  };
}
