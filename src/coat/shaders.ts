import { dotLightProjection } from './dot-contact';
import { glossOptics } from './gloss-optics';
// Ported from open-bot-avatar (MIT): dom/fluffy/shaders.ts, by Dominik Scholz.
//
// The coat's shaders. One program draws three kinds of geometry, chosen by `pass`: the body's solid surface,
// shells of pile lifted off it, and single strands on top. All three sample the same pile, fixed to the body,
// so the coat holds together as the avatar turns.
//
// The pile is shaped in open-bot-avatar's own space (its viewBox units, COAT_UNIT body units each, with y down),
// so its numbers are used as they are. The vertex shader takes our mesh (body units, y up) there, and brings the
// result back to draw it with our rotation and perspective (math.ts): the coat lands on the SVG outline, eyes and
// antennas exactly. Its eyes are not drawn here. Ours are paths over the coat, and the coat only parts its pile
// round them, from a field of how far each pixel is from an eye (mask.ts).
//
// A loading figure's coat is a mesh made once (figures.ts: a tube, or balls) that the vertex shader moves into the
// frame's shape (FigureShape): the tube's cross-section set per ray between the flat drawing's hole and outline,
// or each ball moved and sized. The pile stays fixed to the mesh at rest, so it moves with the figure, and it
// lies down where a piece gets thin.

import { fibreDyeShader } from './dot-fibre-dye-shader';
import { dotSoftboxes } from './dot-light';
import { DYE_RAMP_RANGE } from '../engine/dye';
import { COAT_UNIT } from '../engine/coat';
import { VIEW, VIEW_UNIT } from '../engine/draw';
import { TUBE_M, TUBE_R } from '../engine/figures';
import { D } from '../engine/math';

/** The values of the `pass` uniform. */
export const PASS = { body: 0, shell: 1, strand: 2 } as const;
/** The values of the `figure` uniform: a body's coat, a figure's band (the ring's tube), or its balls. */
export const FIGURE = { none: 0, band: 1, balls: 2 } as const;
/** Room in the uniforms: rays of a band (morph.ts's rays() is at most 144), and balls. */
export const MAX_RAYS = 144, MAX_BALLS = 3;

/** A number as a GLSL float literal. */
const float = (n: number): string => (Number.isInteger(n) ? `${n}.` : `${n}`);

const passes = `const int BODY = ${PASS.body}, SHELL = ${PASS.shell}, STRAND = ${PASS.strand};`;

/**
 * A strand whose root faces away from the camera further than this (the cosine) is not drawn: half the roots are
 * on the back. Those just past the rim still are, since their tips come round it and fuzz the outline.
 */
const BACK = -0.3;

export const vertexShader = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 seed;
// The pose's rotation, and the same in open-bot-avatar's space (y down).
uniform mat3 rotation, view;
uniform vec3 poseScale, poseOffset;
uniform bool unlit, orthographic, ornament, portraitCoat, builderPile, substrateRGB;
uniform vec2 feltExtent;
uniform vec4 opticalFrame;
uniform mat3 ornamentAxes;
uniform bool eyePatch;
uniform highp sampler2D faceSurface;
uniform vec4 eyeRelief, faceBounds;
out float faceCoverage;
vec4 surfaceSample(ivec2 at, ivec2 last, float weight) {
  vec4 s = texelFetch(faceSurface,clamp(at,ivec2(0),last),0);
  return s.w > 0. ? s * weight : vec4(0.);
}
uniform vec3 ornamentOffset;
// The middle and half size of the body's box, and the camera, in body units.
uniform vec3 middle, extent, camera;
// The picture's square, drawing units (middle x, middle y, half its side), and how deep the coat goes, body units.
uniform vec4 square;
uniform float shell;
uniform float strandWidth; // 1 at full detail; wider where fewer strands are drawn
uniform int pass;
// In a change of shape: along each of warpN rays from the drawing's middle, how far the coat's own body reaches
// and how far the outline drawn does (r, g), drawing units (none: 0).
uniform highp sampler2D warpRays;
uniform int warpN;
// How far the edges of thin pieces the outline drawn cuts off are pressed onto it (CoatWarp.press).
uniform float warpPress;
// A figure's shape (FIGURE): the band's inner radii then its outer ones, \`rays\` of each, four to a vec4; or each
// ball at rest and now (x y z r). Body units, y up.
uniform int figure, rays, balls;
uniform vec4 band[${(2 * MAX_RAYS) / 4}];
uniform vec4 restBall[${MAX_BALLS}], nowBall[${MAX_BALLS}];
out vec3 N, pilePosition, groomPoint, opticalPlace, scenePlace, lean;
out float groomSide;
out float tip, variation, across, solid;
${passes}
const vec3 FLIP = vec3(1., -1., 1.);
const float UNIT = ${float(1 / COAT_UNIT)}, D = ${float(D)}, VIEW_UNIT = ${float(VIEW_UNIT)}, MID = ${float(VIEW / 2)};
const float TUBE_M = ${float(TUBE_M)}, TUBE_R = ${float(TUBE_R)}, TAU = 6.283185307179586;

float ray(int i) { return band[i >> 2][i & 3]; }
/** The band's edge (inner at 0, outer at \`rays\`) at ray \`s\`, between the two rays either side. */
float edge(float s, int at) {
  int i = int(floor(s)) % rays;
  return mix(ray(at + i), ray(at + (i + 1) % rays), fract(s));
}

void main() {
  vec3 P = position, Nm = normal, rest = (position - middle) / extent;
  faceCoverage = 1.;
  if (ornament) {
    P = ornamentAxes * P + ornamentOffset;
    Nm = normalize(transpose(inverse(ornamentAxes)) * Nm);
    if (eyePatch) {
      ivec2 last = textureSize(faceSurface,0) - 1;
      vec2 uv = (P.xy-faceBounds.xy)*faceBounds.zw, grid = uv*vec2(last), f = fract(grid);
      ivec2 at = ivec2(floor(grid));
      vec4 skin = surfaceSample(at,last,(1.-f.x)*(1.-f.y))
                + surfaceSample(at+ivec2(1,0),last,f.x*(1.-f.y))
                + surfaceSample(at+ivec2(0,1),last,(1.-f.x)*f.y)
                + surfaceSample(at+ivec2(1),last,f.x*f.y);
      faceCoverage = skin.w;
      if (any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) faceCoverage = 0.;
      vec3 outward = normalize(skin.yzw + vec3(0.,0.,.00001));
      P.z = skin.x + eyeRelief.x + clamp((position.z-eyeRelief.y)*eyeRelief.z,0.,1.)*eyeRelief.w;
      vec3 sight = orthographic ? transpose(rotation)*vec3(0.,0.,1.) : camera-transpose(rotation)*poseOffset-P*poseScale;
      faceCoverage = min(faceCoverage,dot(outward,normalize(sight/poseScale)) + .06);
      Nm = normalize(vec3(.10*Nm.xy,0.) + (Nm.z >= 0. ? outward : -outward));
    }
  }
  // How much pile stands up (a piece that has gone thin lies flat), and whether there is any piece here at all.
  float pile = 1.;
  solid = 1.;
  if (figure == ${FIGURE.band}) {
    // The tube, its cross-section re-placed between the band's edges at the ray this point is seen along (screen
    // angles run clockwise, ours anticlockwise): its middle halfway between them, as wide as they are apart, and
    // no deeper than the tube is.
    vec3 q = rotation * P;
    float s = fract(-atan(q.y, q.x) / TAU) * float(rays);
    float inner = edge(s, 0), outer = edge(s, rays);
    float hw = max(0., .5 * (outer - inner)), hz = min(hw, TUBE_R);
    vec2 u = normalize(P.xy);
    P = vec3(u * (.5 * (inner + outer) + (dot(P.xy, u) - TUBE_M) * hw / TUBE_R), P.z * hz / TUBE_R);
    vec2 outward = u * dot(Nm.xy, u);
    Nm = normalize(vec3(outward * TUBE_R / max(hw, 1e-4) + Nm.xy - outward, Nm.z * TUBE_R / max(hz, 1e-4)));
    pile = smoothstep(0., .6 * TUBE_R, hw);
    rest = vec3(rest.xy, P.z / TUBE_R);
    solid = hw;
  } else if (figure == ${FIGURE.balls}) {
    // Each ball moved and sized: the one this point is on at rest.
    int k = 0;
    float best = 1e9;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= balls) break;
      float d = length(P - restBall[i].xyz) - restBall[i].w;
      if (d < best) { best = d; k = i; }
    }
    float scale = nowBall[k].w / restBall[k].w;
    P = nowBall[k].xyz + (P - restBall[k].xyz) * scale;
    rest = Nm;
    pile = clamp(scale, 0., 1.);
  }
  if (orthographic) pile *= portraitCoat ? .10 : .20;
  // Into open-bot-avatar's space: its units, y down.
  vec3 n = normalize(FLIP * Nm), p = FLIP * P * UNIT;
  vec3 rounded = FLIP * rest;
  // Broadly bend the lighting normals across flat faces.
  vec3 shadingNormal = orthographic ? n : normalize(n + .78 * rounded);
  // (The pile is fixed to the mesh at rest, so it goes where a figure's piece goes.)
  scenePlace = (rotation * (P * poseScale) + poseOffset) / ${(.54945*512/296).toFixed(9)};
  groomPoint = position;
  if ((portraitCoat || builderPile) && !ornament) {
    // Project the observed optical surface back onto its rest-space density field.
    vec3 look = normalize(transpose(rotation)*vec3(0.,0.,1.)/poseScale);
    float incidence = max(.22,dot(look,Nm));
    vec3 parallax = look/incidence-Nm;
    float opticalGap = substrateRGB ? 0. : portraitCoat ? .022 : .007-(pass == SHELL ? .0185*shell : 0.);
    groomPoint += opticalGap*${(.54945*512/296).toFixed(9)}*parallax*smoothstep(.08,.38,dot(look,Nm));
  }
  groomSide = Nm.z;
  opticalPlace = rotation * ((position * opticalFrame.w - opticalFrame.xyz) * poseScale) + poseOffset * opticalFrame.w;
  pilePosition = FLIP * position * UNIT;
  // Sweep across the visible surface. A downwards bias keeps the front from parting at a point.
  // Project without normalizing, so foreshortened locks get shorter continuously at a grazing angle.
  float wave = .21 * sin(dot(p, vec3(.11, .045, .08))) + .14 * sin(.13 * p.y - .07 * p.z);
  float angle = .22 + .94 * (view * shadingNormal).x + wave;
  vec3 sweep = transpose(view) * vec3(sin(angle), cos(angle), .18);
  lean = sweep - n * dot(n, sweep);

  tip = 0.;
  variation = .5;
  across = 0.;
  if (portraitCoat && !ornament && pass != STRAND) {
    float facing = max(0.,(view * n).z);
    float level = pass == BODY ? -3.0 : 6.*shell-3.;
    p += n*(feltExtent.x+level*feltExtent.y)*(1.-smoothstep(.14,.48,facing))*UNIT;
  } else if (builderPile && pass == SHELL) {
    p += n * (shell * .0185 * ${(.54945*512/296).toFixed(9)} * UNIT);
  } else if (pass == SHELL) {
    p += n * shell * 1.10 * pile;
    p += lean * (1.05 * shell * pile);
  }
  if (pass == STRAND) {
    if (pile < .05 || dot(Nm, normalize(camera - P)) < ${float(BACK)}) {
      // Outside the clip volume at every vertex: the whole strand is dropped.
      gl_Position = vec4(0., 0., 2., 1.);
      return;
    }
    // Four cross-sections make a bent, tapered strand. Roots are fixed to the body.
    tip = float(gl_VertexID / 2) / 3.;
    across = float(gl_VertexID % 2) * 2. - 1.;
    vec3 tangent = normalize(cross(n, abs(n.y) < .93 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
    vec3 bitangent = cross(n, tangent);
    float flow = 2.3 * sin(.24 * p.x + .13 * p.z + sin(.22 * p.y)) + 1.3 * sin(.32 * p.y - .15 * p.x);
    float turn = flow + (seed.x - .5) * 2.6;
    vec3 comb = lean + .24 * (tangent * cos(turn) + bitangent * sin(turn));
    vec3 bend = cross(n, comb);
    float len = mix(1.6, 3.8, seed.y) * pile;
    vec3 direction = n * (.30 + .18 * tip) + comb * (.93 - .12 * tip) + bend * (seed.x - .5) * .45 * tip;
    pilePosition += comb * (.7 * len * tip);
    p += n * .52 * pile;
    float width = (.073 + .11 * seed.y) * strandWidth * sqrt(pile);
    p += .065 * n + len * tip * direction;
    vec3 screenDir = view * (direction + .06 * comb);
    vec2 widthDir = normalize(vec2(-screenDir.y, screenDir.x) + vec2(.0001, 0));
    p += transpose(view) * vec3(widthDir * across * width * (1. - .94 * tip), 0);
    shadingNormal = normalize(shadingNormal + .19 * comb);
    variation = seed.x;
  }

  N = view * (shadingNormal / poseScale);
  // Back to body units and into our camera: X = MID + VIEW_UNIT s x', Y = MID - VIEW_UNIT s y' with s = D / w, as
  // math.ts draws the outline, and the square of the picture as clip space. w carries the perspective, so
  // everything between the corners is drawn in it too.
  vec3 q = rotation * (FLIP * p / UNIT * poseScale) + poseOffset;
  float w = D - q.z, deep = square.w;
  if (warpN > 0) {
    // Stretched onto the outline drawn along rays from the middle, as the outline itself was blended (morph.ts: rays
    // clockwise from the right, y down), read between the two rays either side (draw.ts, stretched): the surface
    // point under it is moved, and the pile on it goes with it, as it stands, so no hair is drawn out. Only x and y
    // move, so the depth and the perspective are the point's own.
    vec3 root = rotation * P;
    float rho = D * length(root.xy) / (D - root.z);
    if (rho > 1e-6) {
      float turn = atan(-root.y, root.x) * ${float(1 / (2 * Math.PI))};
      float at = fract(turn) * float(warpN), t = at - floor(at);
      int i = int(at) % warpN;
      vec2 r0 = texelFetch(warpRays, ivec2(i, 0), 0).rg, r1 = texelFetch(warpRays, ivec2((i + 1) % warpN, 0), 0).rg;
      vec2 r = mix(r0, r1, t);
      float to;
      if (rho <= r.x) to = rho * r.y / r.x;
      else {
        float b = max(r0.x, r1.x), far = r0.x >= r1.x ? r0.y : r1.y;
        float top = r.y + (1. - warpPress) * max(0., min(far - r.y, b - r.x));
        to = rho <= b ? r.y + (top - r.y) * (rho - r.x) / (b - r.x) : top + rho - b;
      }
      q.xy += (to - rho) * normalize(root.xy) * w / D;
    }
  }
  if (orthographic) {
    gl_Position = vec4((VIEW_UNIT * q.x + MID - square.x) / square.z,
                       (VIEW_UNIT * q.y + square.y - MID) / square.z, -q.z / deep, 1.);
    // Keep the unlit silhouette on the same multisample locations when the
    // driver specializes the body shader after drawing coloured fittings.
    if (unlit) gl_Position.xy = round(gl_Position.xy*32768.)/32768.;
    return;
  }
  gl_Position = vec4(
    (VIEW_UNIT * D * q.x + (MID - square.x) * w) / square.z,
    (VIEW_UNIT * D * q.y + (square.y - MID) * w) / square.z,
    (D * w - (D * D - deep * deep)) / deep,
    w);
}`;

export const fragmentShader = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D dyeRamp;
uniform highp sampler3D brushedPile;
uniform sampler2D eyeField;
uniform vec3 color;
${glossOptics}
uniform bool fittedGloss;
uniform int opticalLayer;
uniform highp sampler2DArray opticalDensity;


uniform highp sampler2D contactField;
uniform highp sampler2DShadow portraitShadow;
uniform vec3 directLight[9], feltGain[9];
uniform vec4 feltScale, substrateScale[3];
${fibreDyeShader}
uniform bool substrateRGB;
uniform mat3 rotation;
uniform vec4 shadowWeights[2];
${dotLightProjection}
uniform float contactExtent;
uniform vec3 contactColor[4];
uniform bool authoredTint, unlit, dyedMatte, glossy, measuredLight, ornament, metal, portraitCoat, builderPile;
uniform float shellOpacity;
uniform sampler2D matteStudio, polishedStudio;
uniform int finish, tintLayer, furLightLayer, matteBodyLayer;
uniform highp sampler2DArray matteTintStudio, metalTintStudio, furTintStudio;
uniform vec3 studio[12];
uniform int pass;
uniform float shell;
// The eye field's texture coordinates from the pixel's (gl_FragCoord.xy * xy + zw), and how many of
// open-bot-avatar's units a byte of the field spans end to end (0: no eyes).
uniform vec4 eyeMap;
uniform float eyeRange;
in vec3 N, pilePosition, groomPoint, opticalPlace, scenePlace, lean;
in float groomSide, faceCoverage;
in float tip, variation, across, solid;
out vec4 result;
${passes}
// Beyond this the eyes change nothing, open-bot-avatar units.
const float FAR = 3.8;

// Sample the same roots at every view: only the direction of the short filter changes. The solid coat, the
// shells and the strands all use this one field.
float brushedHeight() {
  vec3 uvw = pilePosition / 15.;
  vec3 stepUV = lean * .019;
  float locks = 4. * texture(brushedPile, uvw).r;
  for (int i = 1; i <= 3; i++) {
    vec3 delta = float(i) * stepUV;
    locks += (4. - float(i)) * (texture(brushedPile, uvw + delta).r + texture(brushedPile, uvw - delta).r);
  }
  float tuft = texture(brushedPile, uvw * .42).r;
  return clamp(.5 + 1.65 * (locks / 16. - .5) + .16 * (tuft - .5), 0., 1.);
}

// How far this pixel is from the nearest eye's edge (less than 0 inside one), and the way out of the eye,
// x right and y down.
float eyeDistance(out vec2 outward) {
  outward = vec2(0.);
  if (eyeRange <= 0.) return FAR;
  vec2 uv = gl_FragCoord.xy * eyeMap.xy + eyeMap.zw;
  if (uv.x <= 0. || uv.y <= 0. || uv.x >= 1. || uv.y >= 1.) return FAR;
  float d = (texture(eyeField, uv).r - .5) * eyeRange;
  if (d < FAR) {
    vec2 texel = 1. / vec2(textureSize(eyeField, 0));
    vec2 g = vec2(texture(eyeField, uv + vec2(texel.x, 0)).r - texture(eyeField, uv - vec2(texel.x, 0)).r,
                  texture(eyeField, uv + vec2(0, texel.y)).r - texture(eyeField, uv - vec2(0, texel.y)).r);
    outward = g / max(length(g), .001);
  }
  return d;
}

vec3 studioLight(vec3 n) {
  vec3 diffuse = studio[0] + n.x * studio[1] + n.y * studio[2] + n.z * studio[3]
    + n.x*n.x * studio[4] + n.x*n.y * studio[5] + n.y*n.y * studio[6]
    + n.x*n.z * studio[7] + n.y*n.z * studio[8];
  ${dotSoftboxes.map(([x,y,p], i) => `diffuse += studio[${9+i}] * pow(max(0., dot(n, normalize(vec3(${x}, ${y.toFixed(7)}, 1.)))), ${p});`).join('\n  ')}
  return clamp(diffuse, 0., 1.);
}

vec3 portraitLightLoss(vec3 at, vec3 normal) {
  vec3 lightPosition = .5 + .5*(lightProjection*vec4(at,1.)).xyz;
  vec3 worldNormal = normal*vec3(1.,-1.,1.);
  float cosine = dot(worldNormal,normalize(vec3(-.6,.8,1.)));
  vec2 tangent = vec2(dot(worldNormal,normalize(vec3(.35729,0.,.21437))),
    dot(worldNormal,normalize(vec3(.12127,.34359,-.20211))));
  vec2 slope = .48485*tangent/max(.12,cosine);
  vec2 occlusion = vec2(0.);
  for (int i=0; i<24; i++) {
    float phase = float(i)*2.39996323;
    vec2 disk = sqrt((float(i)+.5)/24.)*vec2(cos(phase),sin(phase));
    // The wide footprint follows the receiver's tangent plane. The narrower one measures
    // the visibility around the short pile above it, including shadows from the fittings.
    vec2 wide = .040*disk, narrow = .013*disk;
    occlusion += 1.-vec2(texture(portraitShadow,lightPosition+vec3(wide,dot(slope,wide)-.001)),
      texture(portraitShadow,lightPosition+vec3(narrow,-.0009)));
  }
  occlusion /= 24.;
  float g = 1.-max(0.,cosine);
  float amount = dot(shadowWeights[0],vec4(occlusion,occlusion*g)) +
    dot(shadowWeights[1],vec4(1.,g,g*g,g*g*g));
  vec3 n = normal;
  vec3 direct = directLight[0]+n.x*directLight[1]+n.y*directLight[2]+n.z*directLight[3]
    +n.x*n.x*directLight[4]+n.x*n.y*directLight[5]+n.y*n.y*directLight[6]
    +n.x*n.z*directLight[7]+n.y*n.z*directLight[8];
  return clamp(amount,0.,1.)*max(vec3(0.),direct);
}

vec3 tintedSample(vec2 uv, int layer, int kind) {
  vec3 p = vec3(uv,float(layer));
  if (kind == 2) return texture(furTintStudio,p).rgb;
  return kind == 1 ? texture(metalTintStudio,p).rgb : texture(matteTintStudio,p).rgb;
}
vec2 normalUV(vec3 n) {
  return .5 + vec2(atan(n.x,max(.0001,n.z)),asin(clamp(n.y,-1.,1.))) / 3.14159265;
}
vec3 tintedRadiance(vec2 uv, int layer, int kind) {
  vec2 size = vec2(kind == 2 ? textureSize(furTintStudio,0).xy : kind == 1
    ? textureSize(metalTintStudio,0).xy : textureSize(matteTintStudio,0).xy);
  float rows = size.y - 7.;
  vec3 base = tintedSample((.5 + uv*vec2(size.x-1.,rows-1.))/size,layer,kind);
  vec2 posUV = .5 + vec2(8.,6.)*uv + vec2(0.,rows);
  base += scenePlace.x * tintedSample(posUV/size,layer,kind);
  base += scenePlace.y * tintedSample((posUV+vec2(9.,0.))/size,layer,kind);
  base += scenePlace.z * tintedSample((posUV+vec2(18.,0.))/size,layer,kind);
  return clamp(base,0.,1.);
}

void main() {
  if (faceCoverage < .10) discard;
  if (unlit) {
    vec3 dye = color;
    if (ornament && finish >= 5) dye = studioLight(vec3(0.,0.,1.));
    if (ornament && finish == 8) dye = studio[7];
    if (ornament && authoredTint) dye = tintedRadiance(vec2(.5), tintLayer, metal ? 1 : 0);
    result = vec4(dye, 1.);
    return;
  }
  vec3 n = normalize(N);
  if (ornament) {
    if (finish == 8) {
      // A nearby softbox reflects at different angles in the two curved lenses.
      vec3 normal = n*vec3(1.,-1.,1.);
      vec3 lamp = normalize(studio[4]-scenePlace);
      vec3 halfVector = normalize(lamp+vec3(0.,0.,1.));
      float reflection = pow(max(0.,dot(normal,halfVector)),studio[6].x);
      vec3 base = studio[0]+normal.x*studio[1]+normal.y*studio[2]+normal.z*studio[3];
      result = vec4(clamp(base+reflection*studio[5],0.,1.),1.);
      return;
    }
    if (finish == 7) {
      // The short pile on the three-lobed portrait tuft stipples the surface
      // evenly. A directional comb across it reads as ridges on the lobes.
      vec3 base = studioLight(n);
      float grain = texture(brushedPile, pilePosition / 16.).r - .5;
      base = .90 * base + vec3(.021,.060,.105);
      result = vec4(clamp(base + grain * .21 * (.22 + .78 * base), 0., 1.), 1.);
      return;
    }
    if (finish == 6) {
      vec3 base = studioLight(n);
      float grain = .33 * (brushedHeight() - .5);
      result = vec4(clamp(base + grain * (.22 + .78 * base), 0., 1.), 1.);
      return;
    }
    if (finish == 5) { result = vec4(studioLight(n), 1.); return; }
    if (finish != 0) {
      float lambert = clamp(dot(n,normalize(vec3(-.48,-.65,.78))),0.,1.);
      float spec = pow(max(0.,dot(n,normalize(vec3(-.43,-.43,.80)))), 12.);
      float value = finish == 2 ? .90 + .10 * lambert
                  : finish == 3 ? .052 + .070 * lambert + .065 * spec
                  : finish == 4 ? .070 + .088 * lambert + .065 * spec
                  : .102 + .053 * lambert + .007 * spec;
      result = vec4(vec3(value),1.);
      return;
    }
    vec2 uv = normalUV(n);
    if (tintLayer >= 0) {
      result = vec4(tintedRadiance(uv,tintLayer,metal ? 1 : 0),1.);
      return;
    }
    vec2 dims = vec2(metal ? textureSize(polishedStudio, 0) : textureSize(matteStudio, 0));
    uv = (.5 + uv * (dims - 1.)) / dims;
    vec2 light = metal ? texture(polishedStudio, uv).rg : texture(matteStudio, uv).rg;
    result = vec4(clamp(color * light.r * (255. / 200.) + light.g - 16. / 255., 0., 1.), 1.);
    return;
  }
  if (glossy) {
    if (dyedMatte) {
      float wrap = .5 + .5 * dot(n, normalize(vec3(-.52,-.78,.65)));
      result = vec4(color * (.74 + .26 * wrap), 1.);
      return;
    }
    if (matteBodyLayer >= 0) { result = vec4(tintedRadiance(normalUV(n),matteBodyLayer,0),1.); return; }
    if (fittedGloss) { result = vec4(measuredGloss(n*vec3(1.,-1.,1.), opticalPlace), 1.); return; }
    if (measuredLight) { result = vec4(studioLight(n), 1.); return; }
    float highlight = pow(max(0., dot(n, normalize(vec3(-.53, -.48, .70)))), 25.);
    float diffuse = .78 + .22 * n.z - .07 * n.x - .09 * n.y;
    vec3 ambient = color * diffuse;
    result = vec4(mix(ambient, vec3(1.), .68 * highlight), 1.);
    return;
  }
  vec3 light = normalize(vec3(-.52, -.83, .62));
  float diffuse = dot(n, light);
  float wrap = clamp((diffuse + .65) / 1.65, 0., 1.);
  float facingLight = clamp(.66 + .34 * diffuse, 0., 1.);
  float diffuseLevel = .87 + .13 * wrap;
  float sheen = .014 * wrap * wrap;
  float rimExposure = 1.;

  // Where a figure's band has closed to nothing, its flattened tube leaves no sliver.
  if (solid < .004) discard;
  // Pile gives way to the eyes, which are drawn over the coat.
  vec2 outward;
  float d = eyeDistance(outward);
  if (pass == SHELL && d < .1) discard;
  if (pass == STRAND && d < .10 - .08 * variation) discard;

  float height = brushedHeight();
  if (measuredLight) {
    if (portraitCoat && pass == SHELL && n.z > .50) discard;
    if (!builderPile && !portraitCoat && pass == SHELL && height < .20 + .62 * shell) discard;
    float grain = (portraitCoat ? .43 : .20) * (height - .5)
      + (pass == STRAND ? (portraitCoat ? .23 : .085) * (variation - .5) : 0.);
    float socket = 1. - .18 * (1. - smoothstep(.05, 1.35, d));
    vec3 base = furLightLayer >= 0 ? tintedRadiance(normalUV(n),furLightLayer,2) : studioLight(n);
    vec3 variationRGB = grain * (.23 + .77 * base);
    if (opticalLayer >= 0) {
      vec2 uv = .5 + groomPoint.xy / ((builderPile ? 2.125 : 2.18) * ${(.54945*512/296).toFixed(9)});
      vec3 key = normalize(vec3(-.6,.8,1.)), incoming = transpose(rotation)*key;
      if (substrateRGB) {
        for (int i=0; i<3; i++) {
          int layer = opticalLayer+2*i;
          vec4 f = (texture(opticalDensity,vec3(uv,float(layer)))*255.-128.)*substrateScale[i]/127.;
          vec4 b = (texture(opticalDensity,vec3(uv,float(layer+1)))*255.-128.)*substrateScale[i]/127.;
          variationRGB[i] = mix(dot(b,vec4(1.,incoming-key*vec3(1.,1.,-1.))),dot(f,vec4(1.,incoming-key)),smoothstep(-.12,.12,groomSide));
        }
      } else {
        vec4 front = texture(opticalDensity,vec3(uv,float(opticalLayer)));
        vec4 back = texture(opticalDensity,vec3(uv,float(opticalLayer+1)));
        front = (front*255.-128.)*feltScale/127.;
        back = (back*255.-128.)*feltScale/127.;
        float relief = mix(dot(back,vec4(1.,incoming-key*vec3(1.,1.,-1.))),
          dot(front,vec4(1.,incoming-key)),smoothstep(-.12,.12,groomSide));
        vec3 gain = feltGain[0]+n.x*feltGain[1]+n.y*feltGain[2]+n.z*feltGain[3]
          +n.x*n.x*feltGain[4]+n.x*n.y*feltGain[5]+n.y*n.y*feltGain[6]
          +n.x*n.z*feltGain[7]+n.y*n.z*feltGain[8];
        variationRGB = relief*clamp(gain,vec3(0.),vec3(3.))+.025*variationRGB;
      }
    }
    vec3 colour = (substrateRGB ? dyedFibre(base+variationRGB) : base+variationRGB) * socket;
    if (portraitCoat && opticalLayer >= 0 && furLightLayer >= 0) {
      colour -= portraitLightLoss(scenePlace,n);
    }
    if (contactExtent > 0.) {
      float shade = 1. - texture(contactField, gl_FragCoord.xy/contactExtent).r;
      colour -= shade * (contactColor[0] + shade*contactColor[1]
        + (colour-.5)*(contactColor[2]+shade*contactColor[3]));
    }
    float alpha = 1.;
    if ((builderPile || portraitCoat) && pass == SHELL) {
      // The optical covering thins continuously outside the solid surface.
      float tuft = clamp(1. + .18*(height-.5), .75, 1.25);
      alpha = clamp(shellOpacity*tuft,0.,1.);
    }
    result = vec4(alpha*clamp(colour, 0., 1.), alpha);
    return;
  }
  // Density variation survives rim lighting even when the strongest dye channel is saturated.
  float pileFill = .925 + .075 * smoothstep(.22, .81, height);
  if (pass == STRAND) {
    float edge = min(1., abs(across));
    float glint = smoothstep(.08, .82, tip) * (1. - .32 * edge * edge);
    diffuseLevel *= .935 + .11 * variation + .035 * clamp(tip, 0., 1.);
    sheen += (.012 + .20 * glint) * (.44 + .56 * variation) * facingLight;
  } else {
    float layer = pass == SHELL ? shell : 0.;
    // A shell keeps only the locks that reach its height.
    if (pass == SHELL && height < .21 + .59 * layer) discard;
    // The solid backing is dyed as brightly as the roots. Relief is mostly from the softly lit crests of
    // neighbouring locks.
    diffuseLevel *= .895 + .16 * height + .035 * layer;
    sheen += (.012 + .13 * smoothstep(.41, .86, height) + .022 * layer) * facingLight;
    rimExposure = .80 + .34 * layer;
  }

  // A soft light behind the right shoulder grazes the pile. Weighting by view angle confines it to the
  // silhouette as the avatar turns.
  float grazing = 1. - smoothstep(.09, .83, abs(n.z));
  float backlit = smoothstep(-.20, .79, dot(n.xy, vec2(.66, -.75)));

  // Where the pile meets an eye: a crease, and a darker ring at the very edge, so the eye sits in the coat.
  float upper = 0., crease = 0., contact = 0.;
  if (d < FAR) {
    upper = dot(outward, normalize(vec2(.96, -.28)));
    crease = (1. - smoothstep(-.12, 1.65 + 1.30 * upper + .6 * (height - .5), d)) * .24;
    contact = (1. - smoothstep(-.04, .38, d)) * .35;
  }
  float occlusion = crease * (.76 + .18 * upper);
  float fiberLight = (sheen + .46 * grazing * backlit * rimExposure) * (1. - crease);
  diffuseLevel = diffuseLevel * (1. - .48 * occlusion) * (1. - (.36 + .04 * upper) * contact);

  // Light falling on the body reveals its curvature. Light caught by raised fibres can carry on above the
  // nominal exposure of the dye.
  float backing = diffuseLevel * pileFill;
  float exposure = backing * backing * (.72 + .39 * wrap) + 1.45 * fiberLight * pileFill;
  vec4 ramp = texture(dyeRamp, vec2(exposure / ${float(DYE_RAMP_RANGE)}, .5));
  vec3 base = ramp.rgb;
  if (ramp.a > 0.) {
    // On yellow, the dyed roots and the light scattered by the tips can have the same lightness and still
    // differ in colour.
    float value = max(color.r, max(color.g, color.b));
    vec3 dye = color / max(value, .001);
    float weakest = min(dye.r, min(dye.g, dye.b));
    vec3 scatter = (1. - dye) * (.09 + .91 * (dye - weakest)) * clamp(1.85 * fiberLight, 0., 1.);
    float brightness = clamp(value * diffuseLevel + (.35 + .65 * value) * fiberLight, 0., 1.);
    base = mix(base, (dye + scatter) * brightness * pileFill, ramp.a);
  }
  result = vec4(base, 1.);
}`;
