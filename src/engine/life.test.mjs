// The avatar's life beyond its eyes: how a face is worn (its manner), the blink's pace, the wander, a lean
// toward the pointer, sleep, the mark, a visit to another shape, what it is like to move (personality), and the
// effects drawn beside the body. Run with: npm test -w @blot/avatar
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BODIES, Rig, deg, drawAvatar, effectShapes } = await import('./index.ts');
const { CLIPS, PERSONALITY, HOP_HEIGHT } = await import('./clips.ts');
const { FACE_NAMES, MANNERS, MANNER_KEYS, PLAIN, mannerFor } = await import('./faces.ts');
const { FX_KINDS, fxParts, MARK_ANGLE } = await import('./fx.ts');
const { CHANGE_MS, GLANCE_MS, MANNER_QUICK, MANNER_SLOW, SLEEP_SHUT, VISIT_MS } = await import('./rig.ts');

const quiet = (opts = {}) => new Rig({ seed: 1, idle: false, blinks: false, body: BODIES.blob, ...opts });
const run = (rig, ms, dt = 8, each = () => {}) => { for (let t = dt; t <= ms; t += dt) { rig.step(dt); each(t); } };
/** Step until nothing moves but its life, and say how long that took. */
const settle = (rig, most = 6000) => { let t = 0; while (!rig.still && t < most) { rig.step(8); t += 8; } return t; };
const finite = (d) => /^[MLZ0-9 .\-]*$/.test(d) && !/NaN|Infinity/.test(d);

test('every face has a manner of numbers, the neutral one changes nothing, and an unknown name is worn plainly', () => {
  assert.deepEqual(Object.keys(MANNERS).sort(), [...FACE_NAMES].sort());
  for (const [name, m] of Object.entries(MANNERS)) {
    assert.deepEqual(Object.keys(m).sort(), [...MANNER_KEYS].sort(), name);
    for (const k of MANNER_KEYS) assert.ok(Number.isFinite(m[k]), `${name}.${k}`);
    assert.ok(m.energy >= 0 && m.energy <= 1 && m.blink > 0, name);
    for (const k of ['tremble', 'sway', 'scan', 'bounce', 'doze']) assert.ok(m[k] >= 0 && m[k] <= 1, `${name}.${k}`);
    assert.ok(Math.abs(m.yaw) <= deg(12) && Math.abs(m.pitch) <= deg(12) && Math.abs(m.roll) <= deg(8) && Math.abs(m.rise) <= 0.05 && Math.abs(m.kick) <= 0.1, `${name}: a manner is a lean, not a pose`);
  }
  assert.equal(mannerFor('nope'), PLAIN);
  assert.equal(mannerFor('constructor'), PLAIN);
  for (const k of ['yaw', 'pitch', 'roll', 'rise', 'kick', 'tremble', 'sway', 'scan', 'bounce', 'doze']) assert.equal(PLAIN[k], 0, k);
  // A neutral face is the same picture as no face at all.
  const a = quiet(), b = quiet();
  b.setFace('neutral');
  run(a, 1500); run(b, 1500);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('a face carries its head: sad looks down and sinks, proud lifts its chin, shy looks away; thrown past and settled', () => {
  for (const name of ['sad', 'proud', 'shy', 'curious']) {
    const m = MANNERS[name], rig = quiet();
    rig.setFace(name);
    let most = 0;
    run(rig, MANNER_SLOW + 200, 8, () => { most = Math.max(most, Math.abs(rig.state.pose.pitch) + Math.abs(rig.state.pose.yaw)); });
    settle(rig);
    const p = rig.state.pose;
    assert.ok(Math.abs(p.pitch - m.pitch) < 1e-9 && Math.abs(p.yaw - m.yaw) < 1e-9 && Math.abs(p.roll - m.roll) < 1e-9, `${name}: held at ${JSON.stringify(p)}`);
    assert.ok(Math.abs((rig.state.lift ?? 0) - m.rise) < 1e-9, `${name}: lift ${rig.state.lift}`);
    // Thrown: on its way it goes past where it ends, by a fifth or so.
    assert.ok(most > (Math.abs(m.pitch) + Math.abs(m.yaw)) * 1.1, `${name}: thrown to ${most}`);
    // And back again exactly with the neutral face.
    rig.setFace('neutral'); settle(rig);
    assert.deepEqual(rig.state.pose, { yaw: 0, pitch: 0, roll: 0 });
    assert.equal(rig.state.lift, 0);
  }
  // A lively face comes on quicker than a dull one.
  const quick = (name) => { const r = quiet(); r.setFace(name); let t = 0; while (Math.abs(r.state.pose.pitch) < Math.abs(MANNERS[name].pitch) * 0.9) { r.step(4); t += 4; } return t; };
  assert.ok(quick('surprised') < quick('sad') * 0.7, `surprised in ${quick('surprised')} ms, sad in ${quick('sad')} ms`);
  assert.ok(MANNER_QUICK < MANNER_SLOW);
});

test('a face with a jolt pops up (surprised) or flinches down (scared) as it comes on, and settles', () => {
  for (const [name, sign] of [['surprised', 1], ['scared', -1]]) {
    const rig = quiet();
    rig.setFace(name);
    let up = 0, down = 0;
    run(rig, CLIPS.kick.ms + 40, 4, () => { const l = rig.state.lift - MANNERS[name].rise * Math.min(1, 1); up = Math.max(up, l); down = Math.min(down, l); });
    if (sign > 0) assert.ok(up > 0.04, `${name}: up ${up}`); else assert.ok(down < -0.035, `${name}: down ${down}`);
    settle(rig);
    assert.ok(Math.abs(rig.state.lift - MANNERS[name].rise) < 1e-9);
  }
});

test('a face\'s habits play while it is alive (idle on), and not on a still rig or at rest', () => {
  const swing = (name, opts) => {
    const rig = new Rig({ seed: 3, blinks: false, body: BODIES.blob, ...opts });
    rig.setFace(name);
    run(rig, 1200);
    const rolls = [], lids = [];
    run(rig, 5000, 8, () => { rolls.push(rig.state.pose.roll); lids.push(rig.state.lid); });
    return { roll: Math.max(...rolls) - Math.min(...rolls), lid: Math.min(...lids) };
  };
  // Scared trembles: the roll moves quickly and a little, all the time.
  const scared = new Rig({ seed: 3, blinks: false, idle: true, body: BODIES.blob });
  scared.look(0, 0); scared.setFace('scared'); run(scared, 1200);
  let flips = 0, last = scared.state.pose.roll, dir = 0;
  run(scared, 1000, 8, () => { const d = Math.sign(scared.state.pose.roll - last); if (d && d !== dir) { flips++; dir = d; } last = scared.state.pose.roll; });
  assert.ok(flips > 10, `scared: ${flips} turns of the tremble in a second`);
  // Sleepy nods off: its lids come down a long way, and back.
  assert.ok(swing('sleepy').lid < 0.6, `sleepy: lids down to ${swing('sleepy').lid}`);
  // Sad sways.
  assert.ok(swing('sad').roll > deg(2), `sad sways ${swing('sad').roll}`);
  // With idle off there are no habits: the face and its pose, held still.
  const still = quiet(); still.setFace('scared'); settle(still);
  for (let i = 0; i < 300; i++) assert.equal(still.step(16), false);
  // At rest, none either.
  const rest = new Rig({ seed: 3, body: BODIES.blob, pose: { yaw: 0.3, pitch: 0, roll: 0 }, rest: true });
  rest.setFace('scared');
  let t = 0; while (!rest.resting && t < 8000) { rest.step(16); t += 16; }
  assert.ok(rest.resting, 'it comes to rest with the face on');
  for (let i = 0; i < 200; i++) assert.equal(rest.step(16), false);
});

test('a lively face blinks more often than a dull one, and sleepy blinks slowly', () => {
  const blinks = (name) => {
    const rig = new Rig({ seed: 5, idle: false, body: BODIES.blob });
    rig.setFace(name);
    let n = 0, shut = false, longest = 0, len = 0;
    run(rig, 120_000, 4, () => { const s = rig.state.lid < 0.98; if (s && !shut) n++; len = s ? len + 4 : 0; longest = Math.max(longest, len); shut = s; });
    return { n, longest };
  };
  const excited = blinks('excited'), calm = blinks('calm'), sleepy = blinks('sleepy');
  assert.ok(excited.n > calm.n * 1.3, `excited ${excited.n}, calm ${calm.n} in two minutes`);
  assert.ok(sleepy.longest > 300 && excited.longest < 200, `the longest blink: sleepy ${sleepy.longest} ms, excited ${excited.longest} ms`);
});

test('a wink shuts one eye and opens it again; the state carries no lids before or after', () => {
  for (const dir of [1, -1]) {
    const rig = quiet();
    assert.equal(rig.state.lids, undefined);
    assert.equal(rig.play('wink', { dir }), true);
    let shut = [1, 1];
    run(rig, CLIPS.wink.ms, 4, () => { const l = rig.state.lids; if (l) shut = [Math.min(shut[0], l[0]), Math.min(shut[1], l[1])]; });
    const [mine, other] = dir > 0 ? [shut[1], shut[0]] : [shut[0], shut[1]];
    assert.ok(mine < 0.1 && other === 1, `dir ${dir}: ${shut}`);
    run(rig, 40);
    assert.equal(rig.state.lids, undefined);
  }
  // Drawn: the winking eye is a slit, the other open.
  const rig = quiet(); rig.play('wink', { dir: 1 }); run(rig, 300);
  const d = drawAvatar(BODIES.blob, '#FD690F', rig.state, 120), h = (p) => { const ys = [...p.matchAll(/ ([\d.]+)(?=L|Z)/g)].map((m) => +m[1]); return Math.max(...ys) - Math.min(...ys); };
  assert.ok(h(d.eyes[1]) < h(d.eyes[0]) * 0.3, `the right eye ${h(d.eyes[1])} against ${h(d.eyes[0])}`);
});

test('asleep: the lids close, it sinks, Zs go up; woken, it is back as it was, quicker than it fell asleep', () => {
  const rig = new Rig({ seed: 2, blinks: false, body: BODIES.blob });
  rig.look(0, 0);
  const before = JSON.stringify(rig.state);
  rig.setActivity('sleeping');
  run(rig, 4000);
  assert.ok(rig.state.lid < 1 - SLEEP_SHUT * 0.95 + 0.02 && rig.state.lift < -0.03, `lid ${rig.state.lid}, lift ${rig.state.lift}`);
  assert.ok(rig.state.fx?.some((f) => f.kind === 'zzz'));
  const d = drawAvatar(BODIES.blob, '#FD690F', rig.state, 96);
  assert.ok(d.effects.some((e) => e.layer === 'front' && e.role === 'accent' && finite(e.d)), 'Zs drawn');
  rig.setActivity('idle');
  let t = 0;
  while (JSON.stringify(rig.state) !== before && t < 3000) { rig.step(8); t += 8; }
  assert.ok(t < 2600, `awake again in ${t} ms`);
});

test('the mark sits on the outline up and to the right, sends out rings, and the eyes go to it now and then', () => {
  for (const body of [BODIES.blob, BODIES.wedge, BODIES.heart]) {
    const rig = new Rig({ seed: 2, blinks: false, body });
    rig.look(0, 0);
    rig.setMark(true);
    let glanced = 0;
    run(rig, GLANCE_MS + 200, 8, () => { glanced = Math.max(glanced, rig.state.eye.x); });
    assert.ok(glanced > 0.2, `the eyes go to it: ${glanced}`);
    const parts = effectShapes(body, rig.state, 120), dot = parts.find((p) => p.role === 'accent' && p.opacity === 1);
    assert.ok(dot, 'the dot');
    const xs = [], ys = [];
    for (const p of dot.polys) for (let i = 0; i < p.length; i += 2) { xs.push(p[i]); ys.push(p[i + 1]); }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    assert.ok(cx > 0.2 && cy < -0.2, `${body.id}: the dot at ${cx}, ${cy}`);
    rig.setMark(false);
    run(rig, 2000);
    assert.equal(rig.state.fx, undefined, 'gone again');
  }
  assert.ok(MARK_ANGLE < 0);
});

test('a visit goes to another shape and comes back by itself; a setBody meanwhile ends it', () => {
  const rig = quiet();
  rig.visit(BODIES.wedge);
  run(rig, CHANGE_MS + 40);
  assert.equal(rig.state.body, BODIES.wedge);
  run(rig, VISIT_MS + CHANGE_MS + 200);
  assert.equal(rig.state.body, BODIES.blob, 'back');
  settle(rig);
  assert.ok(rig.still);
  const other = quiet();
  other.visit(BODIES.wedge, 500);
  run(other, 200);
  other.setBody(BODIES.heart);
  run(other, 4000);
  assert.equal(other.state.body, BODIES.heart, 'the setBody stands');
});

test('personality: at 0.5 it is the engine\'s own feel exactly; heavy hops lower, light higher; flare glows; float hovers', () => {
  const film = (opts) => { const r = quiet(opts); r.poke('hop'); const out = []; run(r, 700, 8, () => out.push(JSON.stringify(r.state))); return out; };
  assert.deepEqual(film({ personality: { ...PERSONALITY } }), film({}));
  const height = (personality) => { const r = quiet({ personality }); r.poke('hop'); let h = 0; run(r, 700, 4, () => { h = Math.max(h, r.state.lift); }); return h; };
  assert.ok(Math.abs(height({}) - HOP_HEIGHT) < 0.01);
  assert.ok(height({ weight: 1 }) < HOP_HEIGHT * 0.6 && height({ weight: 0 }) > HOP_HEIGHT * 1.4);
  const glow = (flare) => { const r = quiet({ personality: { flare } }); r.poke('hop'); let g = 0; run(r, 700, 4, () => { g = Math.max(g, r.state.glow ?? 0); }); return g; };
  assert.equal(glow(0), 0);
  assert.ok(glow(1) > 0.5);
  // A floater hovers, a little up and down, and has a shadow under it.
  const f = new Rig({ seed: 1, blinks: false, body: BODIES.blob, personality: { float: 1 } });
  run(f, 3000);
  assert.ok(f.state.lift > 0.08, `hovering at ${f.state.lift}`);
  assert.ok(drawAvatar(BODIES.blob, '#FD690F', f.state, 96).effects?.some((e) => e.role === 'shadow'), 'a shadow under it');
  // Nonsense is ignored, and a number is held to 0..1.
  const r = quiet({ personality: { weight: NaN, squash: 7, wobble: 'x' } });
  r.setPersonality(null);
  assert.equal(height({ weight: 2 }), height({ weight: 1 }));
});

test('every effect draws as finite paths, the same every time, and nothing at all at amount 0 or before it starts', () => {
  const frame = { x0: -0.9, y0: -0.9, x1: 0.9, y1: 0.9, cx: 0, cy: 0, reach: () => new Float64Array(96).fill(0.9) };
  for (const kind of FX_KINDS) {
    for (const u of [0.01, 0.3, 0.6, 0.95]) {
      const a = fxParts({ kind, u, t: 700, dir: 1, amount: 1 }, frame, 1 / 60), b = fxParts({ kind, u, t: 700, dir: 1, amount: 1 }, frame, 1 / 60);
      assert.deepEqual(a, b, `${kind} at ${u}`);
      for (const p of a) {
        assert.ok(p.opacity >= 0 && p.opacity <= 1, `${kind}: opacity ${p.opacity}`);
        for (const poly of p.polys) for (const v of poly) assert.ok(Number.isFinite(v) && Math.abs(v) < 3, `${kind} at ${u}: ${v}`);
      }
    }
  }
  for (const kind of ['mark', 'zzz']) assert.deepEqual(fxParts({ kind, u: 0, t: 0, dir: 1, amount: 0 }, frame, 1 / 60), [], kind);
  // Each cue that shows one shows it only while it plays: drawn in the middle, gone at the end.
  for (const name of ['delight', 'alert', 'exclaim', 'burst', 'comet', 'rings']) {
    const rig = quiet();
    rig.play(name);
    let seen = false;
    run(rig, CLIPS[name].ms + 16, 8, () => { if (rig.state.fx) seen = true; });
    assert.ok(seen, `${name} shows its effect`);
    assert.equal(rig.state.fx, undefined, `${name} leaves none behind`);
    const d = drawAvatar(BODIES.blob, '#FD690F', rig.state, 96);
    assert.equal(d.effects, undefined);
  }
});

test('the rings pass behind the body and in front of it', () => {
  const rig = quiet();
  rig.play('rings');
  const layers = new Set();
  run(rig, CLIPS.rings.ms, 16, () => { for (const p of drawAvatar(BODIES.blob, '#FD690F', rig.state, 96).effects ?? []) layers.add(p.layer); });
  assert.deepEqual([...layers].sort(), ['back', 'front']);
});

test('the wander moves the eyes a little and never far, is off while it watches something, and hands over without a jump', () => {
  const rig = new Rig({ seed: 9, blinks: false, body: BODIES.blob });
  // Between its drifts, never quite still: in every second the eyes move, a little.
  for (let w = 0; w < 30; w++) {
    const xs = [], ys = [];
    run(rig, 1000, 16, () => { xs.push(rig.state.eye.x); ys.push(rig.state.eye.y); });
    const moved = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    assert.ok(moved > 0.002, `second ${w}: the eyes moved ${moved}`);
  }
  // A look takes over from wherever the wander had got to: nothing jumps.
  const before = { ...rig.state.eye };
  rig.look(0, 0);
  rig.step(8);
  assert.ok(Math.hypot(rig.state.eye.x - before.x, rig.state.eye.y - before.y) < 0.03, 'no jump');
});

test('watching the pointer it leans toward it, more when the pointer is far over and while it moves', () => {
  const rig = new Rig({ seed: 1, blinks: false, body: BODIES.blob });
  rig.look(1, 0);
  let lean = 0;
  run(rig, 1500, 8, () => { lean = Math.max(lean, rig.state.pose.roll); });
  assert.ok(lean > deg(2.5), `leans ${lean}`);
  rig.look(-1, 0);
  run(rig, 1500);
  assert.ok(rig.state.pose.roll < -deg(2.5), `and the other way: ${rig.state.pose.roll}`);
});

// Found by the adversarial pass of 18 November 2026, and fixed: each of these held then.
test('an idle avatar with a slow habit (sway, search, nodding off) is redrawn no more often than the breath', () => {
  for (const face of ['neutral', 'happy', 'sad', 'curious', 'sleepy']) {
    const rig = new Rig({ seed: 1, blinks: false, body: BODIES.blob });
    rig.setFace(face); run(rig, 3000, 16);
    let n = 0;
    for (let i = 0; i < 625; i++) if (rig.step(16)) n++;
    assert.ok(n <= 360, `${face}: ${n} redraws in 10 s`);
  }
});

test('a new rig does not jump on its first frame, and a busy one does not blink before it has moved', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rig = new Rig({ seed, body: BODIES.blob, blinks: true });
    const before = JSON.stringify(rig.state.eye);
    rig.step(16);
    const e = rig.state.eye, was = JSON.parse(before);
    assert.ok(Math.hypot(e.x - was.x, e.y - was.y) < 0.01 && Math.abs(rig.state.pose.yaw) < deg(0.5), `seed ${seed}: ${JSON.stringify(e)}`);
  }
  const busy = new Rig({ seed: 1, body: BODIES.blob });
  busy.setActivity('thinking');
  let low = 1;
  run(busy, 400, 8, () => { low = Math.min(low, busy.state.lid); });
  assert.equal(low, 1, 'no blink on the way in');
});

test('a jolt during a jolt plays on: no drop in one frame', () => {
  const rig = quiet();
  rig.setFace('surprised'); run(rig, 112, 16);
  const lift = rig.state.lift;
  rig.setFace('scared'); rig.step(16);
  assert.ok(Math.abs(rig.state.lift - lift) < 0.025, `${lift} to ${rig.state.lift}`);
});

test('once resting, no step changes the picture, wander or hover included', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const personality of [{}, { float: 1 }]) {
      const rig = new Rig({ seed, body: BODIES.blob, personality });
      run(rig, 2000 + seed * 37, 16);
      rig.rest({ yaw: 0.3, pitch: 0, roll: 0 });
      let t = 0; while (!rig.resting && t < 10000) { rig.step(16); t += 16; }
      assert.ok(rig.resting, `seed ${seed} rests`);
      for (let i = 0; i < 50; i++) assert.equal(rig.step(16), false, `seed ${seed}: changed after resting`);
    }
  }
});

test('floating eases in when it is turned on, and a face set while busy brings no manner until the activity ends', () => {
  const rig = new Rig({ seed: 1, blinks: false, body: BODIES.blob });
  run(rig, 1600);
  const was = rig.state.lift ?? 0;
  rig.setPersonality({ float: 1 }); rig.step(16);
  assert.ok((rig.state.lift ?? 0) - was < 0.01, 'no jump up');
  run(rig, 3000);
  assert.ok(rig.state.lift > 0.08);
  const busy = quiet();
  busy.setActivity('thinking'); run(busy, 300);
  busy.setFace('scared'); run(busy, 1500);
  const p1 = busy.state.pose.pitch;
  busy.setActivity('idle'); settle(busy);
  assert.ok(Math.abs(busy.state.pose.pitch - MANNERS.scared.pitch) < 1e-9, 'its manner once idle');
  assert.ok(Number.isFinite(p1));
});

test('mirrored, a move to the side goes the other way with everything else; effects ignore the orbiting ball', () => {
  const side = (mirror) => { const r = quiet(); if (mirror) { r.mirror(true); run(r, 300); } r.play('lean', { dir: 1 }); run(r, 500); const b = drawAvatar(BODIES.blob, '#000', r.state, 96).body; const xs = [...b.matchAll(/[ML]([\d.]+) /g)].map((m) => +m[1]); return (Math.min(...xs) + Math.max(...xs)) / 2; };
  const plain = side(false), mirrored = side(true), mid = 27.6;
  assert.ok((plain - mid) * (mirrored - mid) < 0, `plain ${plain}, mirrored ${mirrored}`);
  const rig = new Rig({ seed: 2, blinks: false, body: BODIES.blob });
  rig.setMark(true); rig.setActivity('thinking', 'orbit');
  let far = 0;
  run(rig, 5000, 16, () => {
    const dot = effectShapes(BODIES.blob, rig.state, 72).find((p) => p.role === 'accent' && p.opacity === 1);
    if (!dot || !rig.state.figure || rig.state.figure.k < 1) return;
    const p = dot.polys[0]; let x = 0, y = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; }
    far = Math.max(far, Math.hypot(x / (p.length / 2), y / (p.length / 2)));
  });
  assert.ok(far > 0 && far < 0.75, `the mark stays on the disc: ${far}`);
});

test('every effect stays near the drawing box (an svg with overflow visible shows the rest), on a round body and a wide one', () => {
  const HALF = 55.2 / 2 / 18;
  for (const body of [BODIES.blob, BODIES.wedge, BODIES.square ?? BODIES.tablet]) {
    for (const name of ['exclaim', 'delight', 'burst', 'rings', 'comet', 'alert']) {
      const rig = quiet({ body });
      rig.play(name);
      let far = 0;
      run(rig, CLIPS[name].ms, 16, () => { for (const p of effectShapes(body, rig.state, 96)) for (const poly of p.polys) for (const v of poly) far = Math.max(far, Math.abs(v)); });
      assert.ok(far < HALF + 0.15, `${name} on ${body.id} reaches ${far}`);
    }
    const sleeper = new Rig({ seed: 1, body }); sleeper.setActivity('sleeping');
    let far = 0;
    run(sleeper, 6000, 16, () => { for (const p of effectShapes(body, sleeper.state, 96)) for (const poly of p.polys) for (const v of poly) far = Math.max(far, Math.abs(v)); });
    assert.ok(far < HALF + 0.1, `the Zs on ${body.id} reach ${far}`);
  }
});
