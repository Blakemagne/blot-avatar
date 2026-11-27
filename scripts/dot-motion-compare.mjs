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

const { DOT_CATALOG, DOT_CHARACTERS, DOT_CLIPS } = await import('../src/index.ts');
const { socketMotion } = await import('../src/engine/dot-motion.ts');
const sockets = JSON.parse(readFileSync(new URL('../golden/dots/socket-motion-checkpoints.json',import.meta.url)));
const insertError = [];
let insertFrames = 0;
function targetAt(slug, ms) {
  const clip = DOT_CLIPS['dot-'+slug], channels = { yaw:0, pitch:0, roll:0 };
  clip.apply(channels,{ u:ms/clip.ms, cue:{ amount:1, dir:1 } });
  return channels.dotPlayback;
}
function displacement(a,b) { return Math.hypot(...a.map((x,i) => x-b[i])) * 140.6592; }
for (const [wearer, motions] of Object.entries(sockets)) {
  const centres = wearer === 'frog' ? [
    [-.460938,.476562,.542596],[-.428125,.476562,.561685],[.460938,.476562,.543099],[.428125,.476562,.562142],
  ] : [
    [-.459375,.489062,.511467],[-.460938,.489062,.586746],[.459375,.489062,.511467],[.460938,.489062,.586746],
  ];
  for (const [slug, frames] of Object.entries(motions)) for (const [ms, points] of frames) {
    const parts = socketMotion(wearer,targetAt(slug,ms).activity);
    let offset = 0;
    for (const [i, m] of parts.entries()) for (const tip of [[0,0,0],[.04,.04,.03]]) {
      const p = centres[i].map((x,k) => x+tip[k]);
      insertError.push(displacement(apply3(m,p),points.slice(offset,offset+3)));
      offset += 3;
    }
    insertFrames++;
  }
}
console.log('raised sockets and pupils:',insertFrames,'checkpoints, maximum',Math.max(...insertError).toFixed(3),'px');
if (Math.max(...insertError) > .18) process.exitCode = 1;

const insertRefs = JSON.parse(readFileSync(new URL('../golden/dots/insert-motion-checkpoints.json',import.meta.url)));
const presets = { alfred: DOT_CHARACTERS.Alfred, blue_spectacles: DOT_CATALOG.find(p => p.id === 'blue_spectacles').appearance,
  coral_monocle: DOT_CHARACTERS.Iris, lime_headphones: DOT_CHARACTERS.Iggy };
const styles = { crescent_inset:'Crescent inset',double_highlights:'Round highlights',highlight_capsules:'Highlight capsules',
  dots:'Dots',sleepy_lids:'Sleepy lids' };
function measureInserts(observations, appearance) {
  const errors = [];
  for (const [wearer, motions] of Object.entries(observations)) {
    const {body} = dotAvatar(appearance(wearer));
    const rest = dotFeatures(body);
    for (const [slug, frames] of Object.entries(motions)) for (const [tick,...native] of frames) {
      const playback = targetAt(slug,1000*tick/60);
      // The native optical transform describes open surfaces. Closed eye designs
      // also change their contour, which the live wink images check separately.
      if (playback.eyes.some(m => m[4] < .99)) continue;
      const parts = dotFeatures(body,{x:0,y:0,left:1,right:1,playback});
      for (const [i,m] of native.entries()) {
        const box = rest[i].mesh.box;
        const centre = [0,1,2].map(k => (box[k]+box[k+3])/2);
        const actual = apply3(parts[i].axes,centre).map(x => x/DOT_RADIUS);
        const neutral = apply3(rest[i].axes,centre).map(x => x/DOT_RADIUS);
        errors.push(displacement(actual,apply3(m,neutral)));
      }
    }
  }
  return errors;
}
const catalogRefs = {}, wearerRefs = {};
for (const [wearer, motions] of Object.entries(insertRefs)) {
  (['sunny','clover','matisse'].includes(wearer) ? catalogRefs : wearerRefs)[wearer] = motions;
}
const fittedErrors = measureInserts(wearerRefs, wearer => {
  const [shape,eyes] = wearer.split('__');
  return presets[wearer] ?? {shape:'dot-'+shape.replaceAll('_','-'),eyes:styles[eyes]};
});
function checkPositions(label, errors, limit95, limitMax) {
  const p95 = quantile(errors,.95), max = Math.max(...errors);
  console.log(label,errors.length,'positions, p95',p95.toFixed(3),'maximum',max.toFixed(3),'px');
  if (!errors.length || p95 > limit95 || max > limitMax) process.exitCode = 1;
}
checkPositions('open eyes on portraits and builder bodies:',fittedErrors,.18,.65);
const catalogErrors = measureInserts(catalogRefs, id => DOT_CATALOG.find(row => row.id === id).appearance);
checkPositions('catalog eye inserts:',catalogErrors,.30,.40);

const ovalRefs = JSON.parse(readFileSync(new URL('../golden/dots/oval-motion-checkpoints.json',import.meta.url)));
const ovalErrors = measureInserts(ovalRefs, shape => ({shape,eyes:'Oval'}));
checkPositions('moving oval eyes on ten shells:',ovalErrors,1.05,2.25);
