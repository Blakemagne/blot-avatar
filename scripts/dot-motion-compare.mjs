// Compare the public rig and material transforms against independent 60 Hz playback observations.
import { readFileSync } from 'node:fs';
import { DOT_MOTIONS, dotAvatar, drawAvatar } from '../src/index.ts';
import { Rig } from '../src/engine/rig.ts';
import { dotFeatures } from '../src/engine/dot-features.ts';
import { DOT_RADIUS } from '../src/engine/dot-depth.ts';

const checkpoints = JSON.parse(readFileSync(new URL('../golden/dots/motion-checkpoints.json', import.meta.url)));
const config = dotAvatar({ shape: 'dot-rounded-triangle', eyes: 'Oval' });
const rest = dotFeatures(config.body);
const probes = [[0,0,0], [.75,0,0], [0,.75,0], [0,0,.75]];
const quantile = (values, p) => [...values].sort((a,b) => a-b)[Math.floor((values.length-1)*p)];
const apply3 = (m, p) => [0,1,2].map(i => m[i]*p[0] + m[i+3]*p[1] + m[i+6]*p[2] + m[i+9]);
const apply4 = (m, p) => [0,1,2].map(i => m[i]*p[0] + m[i+4]*p[1] + m[i+8]*p[2] + m[i+12]);
const errors = [[], []];
let frames = 0;
for (const clip of DOT_MOTIONS) {
  const rig = new Rig({ body: config.body, idle: false, blinks: false, clips: config.clips });
  rig.play(clip.id);
  let elapsed = 0;
  for (const [seconds, nativeBody, left, right] of checkpoints[clip.id.slice(4)]) {
    const ms = 1000 * seconds;
    while (elapsed + 1000/60 < ms) { rig.step(1000/60); elapsed += 1000/60; }
    rig.step(ms - elapsed); elapsed = ms;
    const coat = drawAvatar(config.body,config.color,rig.state,296,{coat:true}).coat;
    const pose = coat.dotFace.playback, r = coat.rotation;
    const parts = dotFeatures(config.body, coat.dotFace);
    function body(p) {
      return [0,1,2].map(i => pose.offset[i]/DOT_RADIUS +
        p.reduce((sum, value, k) => sum + r[3*i+k]*pose.scale[k]*value, 0));
    }
    function error(expected, observed) {
      return Math.hypot(...expected.map((v,i) => v-observed[i])) * 140.6592;
    }
    for (const p of probes) errors[0].push(error(apply4(nativeBody,p),body(p)));
    for (const [i, native] of [left,right].entries()) {
      const centre = [i ? .209 : -.209,.18,.80];
      for (const delta of [[0,0,0],[.08,0,0],[0,.12,0]]) {
        const q = centre.map((v,k) => DOT_RADIUS*(v+delta[k]));
        const before = apply3(rest[i].axes,q).map(v => v/DOT_RADIUS);
        const after = apply3(parts[i].axes,q).map(v => v/DOT_RADIUS);
        errors[1].push(error(apply4(native,before),body(after)));
      }
    }
    frames++;
  }
}
console.log(`${DOT_MOTIONS.length} clips, ${frames} checkpoints, displacement in pixels at 512 px`);
for (const [i,label] of ['body','eyes'].entries()) {
  const e = errors[i];
  console.log(label, 'median', quantile(e,.5).toFixed(4), 'p95', quantile(e,.95).toFixed(4), 'maximum', Math.max(...e).toFixed(4));
  if (Math.max(...e) > .15) process.exitCode = 1;
}

const ready = new Rig({ body: config.body, idle: true, blinks: false });
ready.look(0,0);
ready.stop();
const readyObservations = JSON.parse(readFileSync(new URL('../golden/dots/ready-checkpoints.json', import.meta.url)));
const swayErrors = [];
let clock = 0;
for (const [t, expected] of readyObservations) {
  const time = 1000*t;
  while (clock + 1000/60 < time) { ready.step(1000/60); clock += 1000/60; }
  ready.step(time-clock); clock = time;
  const coat = drawAvatar(config.body,config.color,ready.state,296,{coat:true}).coat;
  const { offset, scale } = coat.dotFace.playback;
  for (const point of probes) {
    const native = apply4(expected,point);
    const observed = [0,1,2].map(i => offset[i]/DOT_RADIUS +
      point.reduce((sum,v,j) => sum + v*scale[j]*coat.rotation[3*i+j],0));
    swayErrors.push(Math.hypot(...native.map((v,i) => v-observed[i]))*140.6592);
  }
}
console.log('Ready idle, next cycle:',readyObservations.length,'checkpoints, median',quantile(swayErrors,.5).toFixed(4),'p95',quantile(swayErrors,.95).toFixed(4),'maximum',Math.max(...swayErrors).toFixed(4));
if (Math.max(...swayErrors) > 3) process.exitCode = 1;
