// Golden frames: drive the rig through every behaviour, frame by frame, and write every drawn path.
//   node --import tsx frames.mjs <engine index module (file path)> <out.json> [<state-out>]
// The same script runs against the engine before and after a change; the two files must be identical.
// The paths are rounded to 0.01 by toPath, so a tiny drift in a number seldom shows in them. The optional
// state file is the bitwise check: per frame, every number the rig's change test reads (Rig.mark), at full
// precision (String(n)), plus still, resting and what step() returned. It reads only Rig.state.
// golden/check.mjs runs this and compares both hashes with golden/frames.sha256.
import { closeSync, openSync, writeFileSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [modPath, out, stateOut] = process.argv.slice(2);
const E = await import(pathToFileURL(modPath).href);
const { Rig, BODIES, drawAvatar } = E;

const bodies = ['blob', 'wedge', 'heart', 'tablet', 'cloud', 'pebble' in BODIES ? 'pebble' : 'star'].filter((b) => BODIES[b]);
const record = {};
let frames = 0;

// The face's numbers in the rig's own order (FACE_KEYS in faces.ts), and the forms in FORMS order.
const FACE_KEYS = ['width', 'height', 'round', 'tilt', 'lift', 'arc', 'uneven', 'skew', 'brow', 'slant', 'wink'];
const FORMS = ['orbit', 'radar', 'progress', 'ring', 'dots'];
const bodyList = Object.values(BODIES);
const stateFd = stateOut ? openSync(stateOut, 'w') : null;
let stateBuf = [];
const flush = () => { if (stateFd !== null && stateBuf.length) { writeSync(stateFd, stateBuf.join('')); stateBuf = []; } };
const n = (v) => (v === undefined ? 'u' : v === null ? 'n' : String(v));
/** One frame of the rig's state at full precision: what Rig.mark reads (the body by identity, not the rig's private count). */
function stateRow(rig, changed) {
  const s = rig.state, g = s.figure, f = s.face;
  const b = s.body ? bodyList.indexOf(s.body) : -2;
  const nums = [s.pose.yaw, s.pose.pitch, s.pose.roll, s.eye.x, s.eye.y, s.lid, s.dot, s.eyeScale, s.stretch, s.lift, s.scale, s.flip,
    s.morph ? s.morph.k : -1, b, g ? g.k : -1, g ? g.turn : 0, g ? g.progress : 0, g ? FORMS.indexOf(g.form) : -1, ...FACE_KEYS.map((k) => f[k]),
    s.shift, s.arc, s.lids?.[0], s.lids?.[1], s.glow, ...(s.fx ?? []).flatMap((x) => [x.kind, x.u, x.t, x.dir, x.amount])];
  return `${changed ? 1 : 0}|${rig.still ? 1 : 0}|${rig.resting ? 1 : 0}|${nums.map(n).join(',')}\n`;
}

function run(name, body, opts, script, ms, dt = 16, size = 96) {
  const rig = new Rig({ body: BODIES[body], ...opts });
  const rows = [];
  if (stateFd !== null) stateBuf.push(`# ${name}:${body}\n`);
  for (let t = 0; t <= ms; t += dt) {
    script(rig, t);
    const changed = rig.step(dt);
    const d = drawAvatar(rig.state.body ?? BODIES[body], 'gray', rig.state, size);
    rows.push(`${changed ? 1 : 0}|${rig.still ? 1 : 0}|${rig.resting ? 1 : 0}|${d.body}|${d.eyes[0]}|${d.eyes[1]}|${(d.effects ?? []).map((e) => `${e.layer}:${e.role}:${e.opacity}:${e.d}`).join(';')}|${d.glow ?? ''}`);
    if (stateFd !== null) stateBuf.push(stateRow(rig, changed));
    frames++;
  }
  flush();
  record[`${name}:${body}`] = rows;
}

const at = (t, ms, f) => (t === ms ? f() : undefined);

for (const b of bodies) {
  run('idle', b, { seed: 3 }, () => {}, 14000, 16);
  run('idle-small', b, { seed: 9 }, () => {}, 6000, 33, 22);
  run('look', b, { seed: 5 }, (r, t) => {
    at(t, 160, () => r.look(1, 0)); at(t, 1200, () => r.look(-0.7, 0.7)); at(t, 2400, () => r.look(3, 4));
    at(t, 3600, () => r.look(Infinity, 1)); at(t, 4400, () => r.stop()); at(t, 5200, () => r.look(0.2, -1));
  }, 9000);
  for (const k of ['spin', 'nod', 'hop']) run(`poke-${k}`, b, { seed: 2 }, (r, t) => { at(t, 160, () => r.poke(k)); }, 1400);
  run('poke-queue', b, { seed: 2 }, (r, t) => { at(t, 160, () => { r.poke(); r.poke(); r.poke(); r.poke(); }); at(t, 800, () => r.look(0.8, 0)); at(t, 900, () => r.poke()); }, 4000);
  run('spin-turned', b, { seed: 2 }, (r, t) => { at(t, 0, () => r.look(1, 0)); at(t, 900, () => r.poke('spin')); at(t, 1300, () => r.poke('spin')); }, 3200);
  const other = b === 'wedge' ? 'heart' : 'wedge';
  run('morph', b, { seed: 4 }, (r, t) => { at(t, 160, () => r.setBody(BODIES[other])); at(t, 1600, () => r.setBody(BODIES[b])); at(t, 1800, () => r.setBody(BODIES.cloud)); }, 4000);
  run('morph-first', b, { seed: 4 }, (r, t) => { at(t, 0, () => r.setBody(BODIES[other])); }, 400);
  for (const a of ['thinking', 'working', 'waiting', 'speaking']) {
    run(`act-${a}`, b, { seed: 6 }, (r, t) => { at(t, 160, () => r.setActivity(a)); at(t, 7000, () => r.setActivity('idle')); }, 9000);
  }
  for (const f of ['ring', 'orbit', 'radar', 'progress', 'dots']) {
    run(`form-${f}`, b, { seed: 6 }, (r, t) => { at(t, 160, () => r.setActivity('working', f)); if (f === 'progress' && t % 500 === 0) r.setProgress(t / 8000); at(t, 7200, () => r.setActivity('thinking', f === 'ring' ? 'orbit' : null)); at(t, 9000, () => r.setActivity('idle')); }, 10000);
  }
  run('speak-level', b, { seed: 8 }, (r, t) => { at(t, 160, () => r.setActivity('speaking')); if (t > 160 && t < 3000) r.setLevel(Math.abs(Math.sin(t / 90)) * (t % 700 < 400 ? 1 : 0.01)); at(t, 3000, () => r.setLevel(0)); at(t, 5200, () => r.setActivity('idle')); }, 6500);
  run('faces', b, { seed: 1 }, (r, t) => { at(t, 160, () => r.setFace('happy')); at(t, 700, () => r.setFace('nope')); at(t, 900, () => r.setFace('sleepy')); at(t, 1500, () => r.setActivity('thinking')); at(t, 2500, () => r.setActivity('idle')); }, 3500);
  run('rest', b, { seed: 7, pose: { yaw: 0.3, pitch: -0.1, roll: 0.05 }, rest: true }, (r, t) => {
    at(t, 400, () => r.setActivity('working')); at(t, 3000, () => r.setActivity('idle')); at(t, 5000, () => r.poke('hop')); at(t, 7000, () => r.rest(null)); at(t, 9000, () => r.rest({ yaw: -0.2, pitch: 0, roll: 0 }));
  }, 13000);
  run('misc', b, { seed: 11 }, (r, t) => {
    at(t, 100, () => r.mirror(true)); at(t, 300, () => r.look(0.6, 0.2)); at(t, 700, () => r.emphasis()); at(t, 800, () => r.emphasis(2));
    at(t, 1200, () => r.mirror(false)); at(t, 1500, () => r.blink()); at(t, 1600, () => r.pause(true)); at(t, 2000, () => r.pause(false));
  }, 3500);
  run('no-idle', b, { seed: 1, idle: false, blinks: false }, (r, t) => { at(t, 200, () => r.look(0.5, 0)); at(t, 1500, () => r.poke('nod')); }, 3000);
  run('odd-dt', b, { seed: 12 }, (r, t) => { at(t, 37, () => r.look(1, 1)); at(t, 37 * 20, () => r.poke('hop')); }, 3000, 37);
  // Added on 18 November 2026: how faces are worn, the new moves, sleep, the mark, a visit, and personality.
  run('manners', b, { seed: 13 }, (r, t) => {
    ['surprised', 'sad', 'scared', 'sleepy', 'excited', 'shy', 'confused', 'neutral'].forEach((f, i) => at(t, 160 + i * 1400, () => r.setFace(f)));
  }, 11500);
  run('cues-new', b, { seed: 14 }, (r, t) => {
    ['delight', 'wink', 'wide', 'alert', 'recoil', 'lean', 'tug', 'settle', 'flare', 'look', 'exclaim', 'burst', 'comet', 'rings', 'rock'].forEach((c, i) => at(t, 160 + i * 1200, () => r.play(c, { dir: i % 2 ? -1 : 1, amount: i % 3 ? 1 : 1.5 })));
  }, 18500);
  run('float-cue', b, { seed: 14 }, (r, t) => { at(t, 160, () => r.play('float')); }, 5200);
  run('sleep', b, { seed: 15 }, (r, t) => { at(t, 160, () => r.setActivity('sleeping')); at(t, 6000, () => r.setActivity('idle')); }, 8500);
  run('mark', b, { seed: 16 }, (r, t) => { at(t, 160, () => r.setMark(true)); at(t, 400, () => r.look(0.5, 0.2)); at(t, 2000, () => r.stop()); at(t, 5200, () => r.setMark(false)); }, 7000);
  run('visit', b, { seed: 17 }, (r, t) => { at(t, 160, () => r.visit(BODIES[b === 'heart' ? 'wedge' : 'heart'], 700)); }, 3200);
  run('personality', b, { seed: 18, personality: { weight: 0.1, squash: 0.9, wobble: 1, flare: 0.8, float: 0.6 } }, (r, t) => { at(t, 300, () => r.poke('hop')); at(t, 1300, () => r.play('bounce')); at(t, 2600, () => r.play('recoil')); }, 4200);
}
writeFileSync(out, JSON.stringify(record));
if (stateFd !== null) closeSync(stateFd);
console.log(`${Object.keys(record).length} runs, ${frames} frames -> ${out}`);
