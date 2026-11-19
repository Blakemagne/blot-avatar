// Clips: the rig's little moves as data, and Rig.play. Run with: npm test
//
// The port from the rig's own code is held to the golden frames (golden/check.mjs). Here each clip is held to a
// frozen copy of the formula it was ported from, and play() and RigOptions.clips to what they promise.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BLINK_HEIGHT, BODIES, LOOK_YAW, Rig, deg, eyeShapes, random } = await import('./index.ts');
const { BLINK_MS, BOUNCE_MS, blinkCurve, CLIPS, CUES, DOTS_MS, HOP_DOWN, HOP_HEIGHT, HOP_STRETCH, HOP_UP, NOD, NOD_SQUASH, POKES, POKE_MS, POP, POP_MS, SHAKE_MS, TILT_MS, WAIT_NOD, WAIT_NOD_MS, advance, checkClips, spinCurve, start } = await import('./clips.ts');
const { smooth, track } = await import('./ease.ts');

/** Channels as the rig resets them each step. */
const reset = () => ({ yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0, x: 0, arc: 0, winkL: 0, winkR: 0, glow: 0, fx: [] });
/** The channels that are numbers (the effects are a list). */
const numeric = (o) => Object.keys(o).filter((k) => k !== 'fx');
/** The same numbers, bit for bit (Object.is: -0 is not 0). */
const same = (a, b, note) => {
  for (const k of numeric(a)) assert.ok(Object.is(a[k], b[k]), `${note}: ${k} ${a[k]} against ${b[k]}`);
  assert.equal(JSON.stringify(a.fx ?? []), JSON.stringify(b.fx ?? []), `${note}: the effects`);
};
/**
 * The same numbers to within rounding (1e-12; 0 and -0 alike). The moves are written in plain words now (moves.ts),
 * which works some of them out in another order than the formulas below: the last bit may differ, nothing more.
 */
const close = (a, b, note) => {
  for (const k of numeric(a)) assert.ok(Math.abs(a[k] - b[k]) <= 1e-12, `${note}: ${k} ${a[k]} against ${b[k]}`);
  assert.equal(JSON.stringify(a.fx ?? []), JSON.stringify(b.fx ?? []), `${note}: the effects`);
};
/** A clip that is playing, `at` ms in. */
const at = (clip, ms, cue) => { const p = start(clip, cue); p.at = ms; p.u = ms / clip.ms; return p; };
/** Every time a clip of `ms` is sampled: steps of dt from 0 up to the end. */
const times = (ms, dt = 7) => { const out = []; for (let t = dt; t / ms < 1; t += dt) out.push(t); return out; };

test('a clip plays until u reaches 1, and the frame that reaches it is not applied', () => {
  for (const ms of [150, 380, 420, 460, 560, 700, 720, 1100]) {
    for (const dt of [1, 16, 16.67, 33, 37]) {
      let calls = 0;
      const clip = { lane: 'cue', ms, apply: () => { calls++; } };
      let p = start(clip), t = 0;
      for (;;) {
        t += dt;
        const before = calls;
        p = advance(p, dt, reset(), { yaw: 0, room: 1 });
        // The end test is u >= 1, and it agrees with the clock's own: at >= ms.
        assert.equal(p === null, t >= ms, `${ms} ms in steps of ${dt}: at ${t}`);
        if (!p) { assert.equal(calls, before, 'the last frame is not applied'); break; }
        assert.equal(calls, before + 1);
        assert.ok(Object.is(p.at, t) && Object.is(p.u, t / ms) && p.u < 1);
      }
      assert.equal(advance(null, dt, reset(), { yaw: 0, room: 1 }), null);
    }
  }
  // Near the end, the share and the clock agree to the last bit.
  for (const ms of [150, 380, 420, 460, 560, 700, 720, 1100]) {
    for (let k = -40; k <= 40; k++) {
      const a = ms + k * Number.EPSILON * ms;
      assert.equal(a / ms >= 1, a >= ms, `${a} of ${ms}`);
    }
  }
  // A clip starts at its beginning, with the cue it was given over the defaults.
  const p = start(CLIPS.nod, { dir: -1 });
  assert.deepEqual({ at: p.at, u: p.u, cue: p.cue }, { at: 0, u: 0, cue: { dir: -1, amount: 1, from: 0 } });
  assert.equal(p.clip, CLIPS.nod);
});

test('the clips are listed in an order that is pinned: the pokes play in it and the golden frames depend on it', () => {
  assert.deepEqual(Object.keys(CLIPS), ['spin', 'nod', 'hop', 'pop', 'blink', 'waitNod', 'dots', 'shake', 'bounce', 'tilt', 'delight', 'kick',
    'wink', 'wide', 'alert', 'recoil', 'lean', 'tug', 'settle', 'flare', 'float', 'look', 'exclaim', 'burst', 'comet', 'rings', 'rock']);
  assert.deepEqual(POKES, ['spin', 'nod', 'hop']);
  assert.deepEqual(CUES, ['shake', 'bounce', 'tilt', 'delight', 'wink', 'wide', 'alert', 'recoil', 'lean', 'tug', 'settle', 'flare', 'float', 'look', 'exclaim', 'burst', 'comet', 'rings', 'rock']);
  assert.deepEqual(Object.values(CLIPS).slice(0, 12).map((c) => c.lane), ['poke', 'poke', 'poke', 'pop', 'blink', 'wait', 'change', 'cue', 'cue', 'cue', 'cue', 'mood']);
  assert.deepEqual(Object.values(CLIPS).slice(0, 10).map((c) => c.ms), [POKE_MS.spin, POKE_MS.nod, POKE_MS.hop, POP_MS, BLINK_MS, WAIT_NOD_MS, DOTS_MS, SHAKE_MS, BOUNCE_MS, TILT_MS]);
  assert.deepEqual([POKE_MS.spin, POKE_MS.nod, POKE_MS.hop, POP_MS, BLINK_MS, WAIT_NOD_MS, DOTS_MS, SHAKE_MS, BOUNCE_MS, TILT_MS], [560, 420, 560, 380, 150, 460, 420, 700, 720, 1100]);
});

test('checkClips takes extra pokes and cues, and refuses anything else', () => {
  const apply = () => {};
  checkClips({});
  checkClips({ wave: { lane: 'poke', ms: 300, apply }, teeter: { lane: 'cue', ms: 0.5, apply } });
  for (const name of Object.keys(CLIPS)) assert.throws(() => checkClips({ [name]: { lane: 'cue', ms: 300, apply } }), /has one of that name/, name);
  for (const lane of ['pop', 'blink', 'wait', 'change', 'mood', 'nope', undefined]) assert.throws(() => checkClips({ x: { lane, ms: 300, apply } }), /lane/, String(lane));
  for (const ms of [0, -1, NaN, Infinity, -Infinity, '300', undefined]) assert.throws(() => checkClips({ x: { lane: 'cue', ms, apply } }), /ms/, String(ms));
  for (const fn of [undefined, null, 'apply', {}]) assert.throws(() => checkClips({ x: { lane: 'poke', ms: 300, apply: fn } }), /apply/);
  assert.throws(() => checkClips({ x: null }), /lane/);
});

// Frozen copies of the formulas as they were in rig.ts before the port, written against the old locals.
const OLD = {
  spin(u, dir, yaw, eyeScale) {
    const e = spinCurve(u);
    const yawOff = Math.PI * dir * (dir * (yaw + Math.PI * dir * e) > Math.PI / 2 ? e - 1 : e);
    eyeScale *= 1 - (1 - smooth((Math.abs(Math.cos(yaw + yawOff)) - 0.4) / 0.35)) * smooth(Math.min(u, 1 - u) / 0.12);
    return { yaw: yawOff, eyeScale };
  },
  nod(u) {
    const dip = track([0, 0, 0.3, 1, 0.7, -0.16, 1, 0], u);
    return { pitch: -NOD * dip, stretch: 1 - NOD_SQUASH * dip, eyeY: -0.45 * track([0, 0, 0.16, 1, 0.55, 0, 1, 0], u) };
  },
  hop(u) {
    let lift = 0;
    const stretch = track(HOP_STRETCH, u);
    if (u > HOP_UP && u < HOP_DOWN) { const q = (u - HOP_UP) / (HOP_DOWN - HOP_UP); lift = HOP_HEIGHT * 4 * q * (1 - q); }
    return { stretch, lift, eyeY: track([0, 0, 0.14, -0.3, 0.36, 0.5, 0.6, 0, 0.8, -0.35, 1, 0], u) };
  },
  pop(at, amount, from, scale) {
    return scale * (1 + POP * amount * track([0, 0, 0.3, 1, 0.62, -0.18, 1, 0], at / POP_MS) + from * (1 - smooth(at / 90)));
  },
  // (Not the old formula: on 18 November 2026 the blink was made to shut quicker than it opens, and further.)
  blink(at, open) {
    return (1 - (1 - BLINK_HEIGHT) * blinkCurve(at / BLINK_MS)) * open;
  },
  waitNod(at, pitch) { return pitch - WAIT_NOD * track([0, 0, 0.34, 1, 0.74, -0.12, 1, 0], at / WAIT_NOD_MS); },
  dots(at, from, dot) { return Math.max(dot, at < 150 ? from + (1 - from) * smooth(at / 150) : at < 250 ? 1 : 1 - smooth((at - 250) / 170)); },
};

test('each clip, run alone, gives what the rig used to work out for it, to within rounding', () => {
  for (const dir of [1, -1]) {
    for (const yaw of [0, 0.3, -0.84, 1.2, -1.5]) {
      for (const t of times(POKE_MS.spin, 5)) {
        const o = { ...reset(), eyeScale: 0.7 };
        CLIPS.spin.apply(o, at(CLIPS.spin, t, { dir }), { yaw, room: 0.4 });
        close(o, { ...reset(), ...OLD.spin(t / POKE_MS.spin, dir, yaw, 0.7) }, `spin ${dir} from ${yaw} at ${t}`);
      }
    }
  }
  for (const t of times(POKE_MS.nod, 3)) { const o = reset(); CLIPS.nod.apply(o, at(CLIPS.nod, t), { yaw: 0.5, room: 1 }); close(o, { ...reset(), ...OLD.nod(t / POKE_MS.nod) }, `nod at ${t}`); }
  for (const t of times(POKE_MS.hop, 3)) { const o = reset(); CLIPS.hop.apply(o, at(CLIPS.hop, t), { yaw: 0, room: 1 }); close(o, { ...reset(), ...OLD.hop(t / POKE_MS.hop) }, `hop at ${t}`); }
  for (const amount of [0.5, 1, 2]) {
    for (const from of [0, 0.12, -0.03]) {
      for (const t of times(POP_MS, 3)) {
        const o = { ...reset(), scale: 0.9431 };
        CLIPS.pop.apply(o, at(CLIPS.pop, t, { amount, from }), { yaw: 0, room: 1 });
        close(o, { ...reset(), scale: OLD.pop(t, amount, from, 0.9431) }, `pop ${amount} from ${from} at ${t}`);
      }
    }
  }
  for (const open of [1, 1.137]) {
    for (const t of times(BLINK_MS, 1)) { const o = { ...reset(), open }; CLIPS.blink.apply(o, at(CLIPS.blink, t), { yaw: 0, room: 1 }); close(o, { ...reset(), open: OLD.blink(t, open) }, `blink at ${t}`); }
  }
  for (const t of times(WAIT_NOD_MS, 3)) { const o = { ...reset(), pitch: -0.02 }; CLIPS.waitNod.apply(o, at(CLIPS.waitNod, t), { yaw: 0, room: 1 }); close(o, { ...reset(), pitch: OLD.waitNod(t, -0.02) }, `wait nod at ${t}`); }
  for (const from of [0, 0.4, 1]) {
    for (const dot of [0, 0.6]) {
      for (const t of times(DOTS_MS, 3)) { const o = { ...reset(), dot }; CLIPS.dots.apply(o, at(CLIPS.dots, t, { from }), { yaw: 0, room: 1 }); close(o, { ...reset(), dot: OLD.dots(t, from, dot) }, `dots from ${from} at ${t}`); }
    }
  }
});

/** Step a rig and keep every frame: the state, what step said, and still/resting. */
function film(rig, ms, dt = 16, script = () => {}) {
  const frames = [];
  for (let t = 0; t <= ms; t += dt) {
    script(rig, t);
    const changed = rig.step(dt);
    frames.push(JSON.stringify({ changed, still: rig.still, resting: rig.resting, s: { ...rig.state, body: undefined } }));
  }
  return frames;
}
const once = (t, when, f) => { if (t === when) f(); };

test('play() is poke(), blink() and emphasis() by another name, and refuses what is not its to play', () => {
  const opts = { seed: 5, body: BODIES.wedge };
  const plain = film(new Rig(opts), 3000);
  for (const name of ['nope', 'waitNod', 'dots', 'constructor', '__proto__', 'toString', '']) {
    const rig = new Rig(opts);
    let said;
    const frames = film(rig, 3000, 16, (r, t) => once(t, 160, () => { said = r.play(name); }));
    assert.equal(said, false, name);
    assert.deepEqual(frames, plain, `${name} changed nothing`);
  }
  // A nod, four times over: one plays, two wait, the fourth is dropped; the same with play().
  const nods = (how) => film(new Rig(opts), 3000, 16, (r, t) => once(t, 160, () => { for (let i = 0; i < 4; i++) assert.equal(how(r), true); }));
  const poked = nods((r) => (r.poke('nod'), true));
  assert.deepEqual(nods((r) => r.play('nod')), poked);
  assert.notDeepEqual(poked, plain);
  for (const kind of POKES) {
    assert.deepEqual(film(new Rig(opts), 2000, 16, (r, t) => once(t, 100, () => r.play(kind))), film(new Rig(opts), 2000, 16, (r, t) => once(t, 100, () => r.poke(kind))), kind);
  }
  // A pop as emphasis() plays it, the amount clamped the same way; a pop over a pop starts where that one is.
  for (const amount of [2, 0.5, 9, 0, -1, NaN]) {
    assert.deepEqual(film(new Rig(opts), 1200, 16, (r, t) => { once(t, 160, () => r.play('pop', { amount })); once(t, 320, () => r.play('pop', { amount })); }),
      film(new Rig(opts), 1200, 16, (r, t) => { once(t, 160, () => r.emphasis(amount)); once(t, 320, () => r.emphasis(amount)); }), `pop ${amount}`);
  }
  assert.deepEqual(film(new Rig(opts), 1200, 16, (r, t) => once(t, 160, () => r.play('pop'))), film(new Rig(opts), 1200, 16, (r, t) => once(t, 160, () => r.emphasis())));
  assert.deepEqual(film(new Rig(opts), 1200, 16, (r, t) => once(t, 160, () => r.play('blink'))), film(new Rig(opts), 1200, 16, (r, t) => once(t, 160, () => r.blink())));
});

/** A cue that leans the body over and back, reporting what it is given. */
const seen = [];
const lean = { lane: 'cue', ms: 400, apply(o, p, v) { seen.push({ dir: p.cue.dir, amount: p.cue.amount, room: v.room }); o.roll += p.cue.dir * p.cue.amount * 0.2 * Math.sin(Math.PI * p.u); } };
/** A poke that rocks the body. */
const wave = { lane: 'poke', ms: 300, apply(o, p) { o.roll += 0.1 * Math.sin(2 * Math.PI * p.u); } };

test('RigOptions.clips adds pokes and cues, and refuses a clip of a name the rig has', () => {
  for (const name of Object.keys(CLIPS)) assert.throws(() => new Rig({ clips: { [name]: lean } }), /has one of that name/, name);
  assert.throws(() => new Rig({ clips: { tap: { ...wave, lane: 'blink' } } }), /lane/);

  // A cue plays where nothing else moves: the roll is the cue's, with its direction and amount.
  seen.length = 0;
  const rig = new Rig({ seed: 1, idle: false, blinks: false, clips: { teeter: lean } });
  assert.ok(rig.still);
  assert.equal(rig.play('teeter', { dir: -1, amount: 0.5 }), true);
  assert.equal(rig.still, false, 'a cue playing is not still');
  let t = 0, most = 0;
  while (t < 1000) { rig.step(16); t += 16; most = Math.min(most, rig.state.pose.roll); if (rig.still) break; }
  assert.ok(t >= 400 && t <= 416, `over in ${t} ms`);
  assert.ok(Math.abs(most + 0.1) < 0.002, `leaned to ${most}`);
  assert.equal(rig.state.pose.roll, 0);
  assert.ok(seen.length > 20 && seen.every((s) => s.dir === -1 && s.amount === 0.5 && s.room === 1));
  // Direction is a sign; the amount is clamped to 0..2, and one that is not a number is 1.
  for (const [cue, want] of [[{ dir: 3, amount: 5 }, { dir: 1, amount: 2 }], [{ dir: -0.1, amount: -3 }, { dir: -1, amount: 0 }], [{ amount: NaN }, { dir: 1, amount: 1 }], [undefined, { dir: 1, amount: 1 }]]) {
    seen.length = 0;
    const r = new Rig({ seed: 1, idle: false, blinks: false, clips: { teeter: lean } });
    r.play('teeter', cue);
    r.step(16);
    assert.deepEqual({ dir: seen[0].dir, amount: seen[0].amount }, want, JSON.stringify(cue));
  }
  // Played again while it plays, it plays on, as if it had not been (started over it would jump to its start).
  const again = new Rig({ seed: 1, idle: false, blinks: false, clips: { teeter: lean } });
  const played1 = new Rig({ seed: 1, idle: false, blinks: false, clips: { teeter: lean } });
  again.play('teeter'); played1.play('teeter');
  for (let i = 0; i < 20; i++) { again.step(16); played1.step(16); }
  assert.equal(again.play('teeter', { dir: -1, amount: 2 }), true);
  while (!played1.still) { again.step(16); played1.step(16); assert.deepEqual(again.state, played1.state); }
  assert.ok(again.still);
  // A cue is not a poke: poke('teeter') plays the next poke, as poke() would.
  assert.deepEqual(film(new Rig({ seed: 2, clips: { teeter: lean } }), 1500, 16, (r, s) => once(s, 160, () => r.poke('teeter'))), film(new Rig({ seed: 2, clips: { teeter: lean } }), 1500, 16, (r, s) => once(s, 160, () => r.poke())));

  // Once a cue is over, the rig is exactly the rig that never played it: a cue draws no random numbers and
  // moves no spring.
  const twin = (play) => film(new Rig({ seed: 9, body: BODIES.heart, clips: { teeter: lean } }), 6000, 16, (r, s) => { r.look(s > 2000 ? 0.4 : 0, 0); if (play) { once(s, 320, () => r.play('teeter', { dir: -1 })); once(s, 480, () => r.play('teeter')); } });
  const played = twin(true), not = twin(false);
  assert.notDeepEqual(played.slice(20, 50), not.slice(20, 50), 'the cue shows');
  assert.deepEqual(played.slice(64), not.slice(64), 'and leaves nothing behind');

  // With no extra clips the rig is the one it always was.
  assert.deepEqual(film(new Rig({ seed: 3, clips: {} }), 4000), film(new Rig({ seed: 3 }), 4000));

  // An extra poke joins the round of pokes, after the rig's own, and play() plays it.
  const pokes = new Rig({ seed: 1, idle: false, blinks: false, clips: { wave } });
  pokes.poke('hop');
  while (!pokes.still) pokes.step(16);
  pokes.poke();
  pokes.step(75);
  assert.ok(Math.abs(pokes.state.pose.roll - 0.1) < 1e-9 && pokes.state.pose.yaw === 0 && pokes.state.pose.pitch === 0, 'the poke after hop is the wave');
  while (!pokes.still) pokes.step(16);
  pokes.poke();
  pokes.step(100);
  assert.ok(pokes.state.pose.yaw !== 0, 'and after the wave, the spin');
  const byName = new Rig({ seed: 1, idle: false, blinks: false, clips: { wave } });
  assert.equal(byName.play('wave'), true);
  byName.step(75);
  assert.ok(Math.abs(byName.state.pose.roll - 0.1) < 1e-9);
});

test('a resting rig that plays a cue wakes for it and comes back to the same picture', () => {
  const pose = { yaw: 0.3, pitch: -0.1, roll: 0.05 };
  const rig = new Rig({ seed: 7, body: BODIES.blob, pose, rest: true, clips: { teeter: lean } });
  for (let i = 0; i < 200 && !rig.resting; i++) rig.step(16);
  assert.ok(rig.resting);
  const before = JSON.stringify(rig.state);
  assert.equal(rig.play('teeter'), true);
  assert.equal(rig.resting, false);
  assert.equal(rig.step(16), true);
  for (let i = 0; i < 100 && !rig.resting; i++) rig.step(16);
  assert.ok(rig.resting);
  assert.equal(JSON.stringify(rig.state), before);
  assert.equal(rig.step(16), false);
});

// The cues: shake ("no"), bounce ("done!") and tilt ("hm?"). Their own rules, then what the rig does with them.

/** The channels that add, and the ones that scale. */
const ADDS = ['yaw', 'pitch', 'roll', 'eyeX', 'eyeY', 'lift', 'x', 'arc', 'winkL', 'winkR', 'glow'], SCALES = ['stretch', 'scale', 'open', 'eyeScale'];
/** Every cue each way, at every amount it may be played at. */
const CUED = CUES.flatMap((name) => [1, -1].flatMap((dir) => [0, 0.4, 1, 2].map((amount) => ({ name, dir, amount }))));
const VIEWS = [{ yaw: 0, room: 1 }, { yaw: 0.6, room: 0.35 }, { yaw: -0.84, room: 0 }];

test('each cue starts and ends at nothing: identity at u = 0 and within 1e-9 of it at the end', () => {
  for (const { name, dir, amount } of CUED) {
    const clip = CLIPS[name];
    for (const v of VIEWS) {
      const first = reset();
      clip.apply(first, at(clip, 0, { dir, amount }), v);
      same(first, reset(), `${name} ${dir} ${amount} at 0`);
      const last = reset();
      const p = start(clip, { dir, amount });
      p.u = 1 - 1e-9; p.at = p.u * clip.ms;
      clip.apply(last, p, v);
      for (const k of numeric(last)) assert.ok(Math.abs(last[k] - reset()[k]) < 1e-9, `${name} ${dir} ${amount} at the end: ${k} ${last[k]}`);
      // And once it is over nothing of it plays: advance gives null at u = 1 without applying.
      const after = reset();
      const q = start(clip, { dir, amount });
      q.at = clip.ms - 1;
      assert.equal(advance(q, 1, after, v), null);
      same(after, reset(), `${name} past the end`);
    }
    // Played at amount 0 it is nothing at all.
    if (amount === 0) for (const t of times(clip.ms, 11)) { const o = reset(); clip.apply(o, at(clip, t, { dir, amount }), VIEWS[0]); same(o, reset(), `${name} at amount 0, ${t} ms`); }
  }
});

test('a cue only adds to the channels or scales them: on top of anything it is the same as on nothing, composed', () => {
  const rnd = random(11);
  for (const { name, dir, amount } of CUED) {
    const clip = CLIPS[name];
    for (const v of VIEWS) {
      for (const t of times(clip.ms, 13)) {
        const alone = reset();
        clip.apply(alone, at(clip, t, { dir, amount }), v);
        const before = reset();
        for (const k of ADDS) before[k] = rnd() * 2 - 1;
        for (const k of SCALES) before[k] = 0.5 + rnd();
        before.dot = rnd();
        const over = { ...before, fx: [] };
        clip.apply(over, at(clip, t, { dir, amount }), v);
        const want = { ...before, fx: alone.fx };
        for (const k of ADDS) want[k] = before[k] + alone[k];
        for (const k of SCALES) want[k] = before[k] * alone[k];
        same(over, want, `${name} ${dir} ${amount} at ${t}`);
      }
    }
  }
});

test('a cue turns the body only in the room a look has left, and moves smoothly from frame to frame', () => {
  for (const name of CUES) {
    const clip = CLIPS[name];
    let turned = 0;
    for (const t of times(clip.ms, 3)) {
      for (const dir of [1, -1]) {
        const none = reset(), all = reset(), half = reset();
        clip.apply(none, at(clip, t, { dir, amount: 2 }), { yaw: 0.84, room: 0 });
        clip.apply(all, at(clip, t, { dir, amount: 2 }), { yaw: 0.84, room: 1 });
        clip.apply(half, at(clip, t, { dir, amount: 2 }), { yaw: 0.84, room: 0.5 });
        assert.ok(Object.is(none.yaw, 0), `${name} at ${t} with no room turned ${none.yaw}`);
        assert.ok(Math.abs(half.yaw - all.yaw / 2) < 1e-12, `${name} at ${t}: half the room, half the turn`);
        turned = Math.max(turned, Math.abs(all.yaw));
      }
    }
    // Only the shake, the recoil, the lean and the look turn.
    if (name === 'shake') assert.ok(turned > deg(20), `the shake at amount 2 turns ${(turned * 180) / Math.PI} degrees`);
    else if (['recoil', 'lean', 'look'].includes(name)) assert.ok(turned > deg(5), `${name} turns ${(turned * 180) / Math.PI} degrees`);
    else assert.equal(turned, 0, name);
    // A millisecond at a time nothing jumps, at the strongest amount: no channel moves more than 0.02 (radians,
    // look units, body units or a share) between two frames. The quickest is the eyes setting off in a shake.
    let prev = reset();
    for (let t = 1; t < clip.ms; t++) {
      const o = reset();
      clip.apply(o, at(clip, t, { dir: 1, amount: 2 }), { yaw: 0, room: 1 });
      for (const k of numeric(o)) assert.ok(Math.abs(o[k] - prev[k]) < 0.02, `${name} at ${t} ms: ${k} jumped from ${prev[k]} to ${o[k]}`);
      prev = o;
    }
  }
});

test('each cue reads: a shake swings both ways and dies away, a bounce hops twice, a tilt leans and holds', () => {
  const film1 = (name, dir = 1) => times(CLIPS[name].ms, 1).map((t) => { const o = reset(); CLIPS[name].apply(o, at(CLIPS[name], t, { dir }), { yaw: 0, room: 1 }); return o; });
  // Shake: the first swing goes the way it was played, and each half-swing after it is smaller and the other way.
  for (const dir of [1, -1]) {
    const yaw = film1('shake', dir).map((o) => o.yaw);
    const peaks = [];
    for (let i = 1; i < yaw.length - 1; i++) if (Math.abs(yaw[i]) > Math.abs(yaw[i - 1]) && Math.abs(yaw[i]) >= Math.abs(yaw[i + 1]) && Math.abs(yaw[i]) > deg(0.5)) peaks.push(yaw[i]);
    assert.equal(peaks.length, 4, `four half-swings: ${peaks.map((y) => (y * 180) / Math.PI)}`);
    assert.ok(peaks[0] * dir > deg(12), `the first is ${(peaks[0] * 180) / Math.PI} degrees`);
    for (let i = 1; i < 4; i++) assert.ok(peaks[i] * peaks[i - 1] < 0 && Math.abs(peaks[i]) < Math.abs(peaks[i - 1]), 'each the other way, and smaller');
    assert.ok(Math.abs(peaks[2]) > deg(4), 'the third still shows');
  }
  // Bounce: off the ground twice, the second lower; squashed before the first.
  const b = film1('bounce');
  const hops = [];
  for (let i = 1; i < b.length; i++) if (b[i].lift > 0 && b[i - 1].lift === 0) hops.push(i);
  assert.equal(hops.length, 2);
  const high = (from, to) => Math.max(...b.slice(from, to).map((o) => o.lift));
  assert.ok(high(hops[0], hops[1]) > 0.25 && high(hops[1], b.length) < high(hops[0], hops[1]) * 0.6, `${high(hops[0], hops[1])} then ${high(hops[1], b.length)}`);
  assert.ok(Math.min(...b.slice(0, hops[0]).map((o) => o.stretch)) < 0.93, 'it gathers itself first');
  assert.ok(b.every((o) => o.lift >= 0 && o.open <= 1 && o.open > 0.75), 'never below the ground; the eyes narrow a little, smiling, and never shut');
  // Tilt: it leans the way it was played, holds there for a third of a second or more, and the eyes go up.
  for (const dir of [1, -1]) {
    const tl = film1('tilt', dir);
    const held = tl.filter((o) => Math.abs(o.roll - dir * deg(10)) < deg(0.25)).length;
    assert.ok(held >= 330, `held for ${held} ms`);
    assert.ok(tl.every((o) => o.roll * dir >= 0 && Math.abs(o.roll) < deg(12)), 'it leans one way only, a touch past and back');
    assert.ok(Math.max(...tl.map((o) => o.eyeY)) > 0.17 && tl.every((o) => o.eyeX * dir >= 0));
  }
});

/** Every frame of a rig, numbers exactly (-0 is not 0): the state, what step said, still and resting. */
function exact(rig, ms, script) {
  const frames = [];
  for (let t = 0; t <= ms; t += 16) {
    script(rig, t);
    const changed = rig.step(16);
    frames.push(JSON.stringify({ changed, still: rig.still, resting: rig.resting, s: { ...rig.state, body: rig.state.body?.id } }, (_, v) => (Object.is(v, -0) ? '-0' : v)));
  }
  return frames;
}

test('once its cues are over, a rig is exactly the rig that never played them, overlapping cues included', () => {
  const plays = {
    shake: [[320, 'shake', { dir: -1 }]],
    bounce: [[320, 'bounce', { amount: 2 }]],
    tilt: [[320, 'tilt', { dir: -1, amount: 0.7 }]],
    // All three at once, and the shake started again while it plays.
    all: [[320, 'tilt'], [352, 'shake', { dir: -1 }], [400, 'bounce'], [496, 'shake']],
  };
  for (const [what, list] of Object.entries(plays)) {
    for (const body of [BODIES.heart, BODIES.blob]) {
      const twin = (play) => exact(new Rig({ seed: 9, body }), 6000, (r, t) => {
        r.look(t > 1000 && t < 2400 ? 0.5 : 0, t > 2600 ? -0.3 : 0);
        if (t === 2200) r.setActivity('waiting');
        if (t === 3600) r.setActivity('speaking');
        if (t === 4400) r.setActivity('idle');
        if (play) for (const [when, name, cue] of list) if (t === when) assert.equal(r.play(name, cue), true);
      });
      const played = twin(true), not = twin(false);
      const end = Math.max(...list.map(([when, name]) => when + CLIPS[name].ms)) / 16 + 2;
      assert.notDeepEqual(played.slice(20, 40), not.slice(20, 40), `${what} on the ${body.id} shows`);
      assert.deepEqual(played.slice(end), not.slice(end), `${what} on the ${body.id} leaves nothing behind`);
    }
  }
});

test('a resting rig that plays any cue wakes for it and comes back to the same picture', () => {
  for (const name of CUES) {
    for (const dir of [1, -1]) {
      const rig = new Rig({ seed: 7, body: BODIES.blob, pose: { yaw: 0.3, pitch: -0.1, roll: 0.05 }, rest: true });
      for (let i = 0; i < 200 && !rig.resting; i++) rig.step(16);
      assert.ok(rig.resting);
      const before = JSON.stringify(rig.state);
      assert.equal(rig.play(name, { dir }), true);
      assert.equal(rig.resting, false, `${name}: not resting while it plays`);
      assert.equal(rig.step(16), true, `${name}: the first frame shows`);
      let t = 16;
      for (; t < 6000 && !rig.resting; t += 16) rig.step(16);
      assert.ok(rig.resting && t <= CLIPS[name].ms + 16, `${name} rests again after ${t} ms`);
      assert.equal(JSON.stringify(rig.state), before, name);
      assert.equal(rig.step(16), false);
    }
  }
});

test('a ball held at a full look keeps both eyes through a shake, a bounce and a tilt, either way and at full strength', () => {
  // As the waiting rock does: at a full look there is no room left, so the shake does not turn the body
  // further, and the far eye stays on this side of the rim.
  for (const body of [BODIES.blob, BODIES.teardrop, BODIES.pebble]) {
    for (const x of [1, -1]) {
      for (const name of CUES) {
        for (const dir of [1, -1]) {
          for (const amount of [1, 2]) {
            const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
            rig.look(x, 0);
            for (let i = 0; i < 200; i++) rig.step(16);
            const most = (body.look ?? 1) * LOOK_YAW, held = rig.state.pose.yaw;
            assert.equal(rig.play(name, { dir, amount }), true);
            let frames = 0, moved = 0;
            while (!rig.still) {
              rig.step(16);
              frames++;
              const s = rig.state;
              moved = Math.max(moved, Math.abs(s.pose.roll), s.lift, Math.abs(s.eye.y));
              assert.ok(Math.abs(s.pose.yaw) <= most + deg(0.5) && Object.is(s.pose.yaw, held), `${body.id} ${name}: turned ${(s.pose.yaw * 180) / Math.PI} degrees`);
              for (const px of [64, 72]) {
                const [left, right] = eyeShapes(body, s, px);
                assert.ok(left.length && right.length, `${body.id} looking ${x}, ${name} ${dir} x${amount}, at ${px} px: an eye is gone in frame ${frames}`);
              }
            }
            assert.ok(moved > 0.01 && frames * 16 >= CLIPS[name].ms, `${body.id} ${name}: it played (${moved})`);
          }
        }
      }
    }
  }
});

test('a cue played again while it plays plays on: nothing jumps back to its start', () => {
  // Frame to frame at 16 ms the twice-played rig moves no more than one that was played once, and they stay the same.
  for (const name of CUES) {
    for (const share of [0.15, 0.3, 0.5, 0.8]) {
      const once = new Rig({ seed: 3, idle: false, blinks: false, body: BODIES.wedge });
      const twice = new Rig({ seed: 3, idle: false, blinks: false, body: BODIES.wedge });
      once.play(name); twice.play(name);
      for (let t = 16; t < CLIPS[name].ms * share; t += 16) { once.step(16); twice.step(16); }
      assert.equal(twice.play(name, { dir: -1, amount: 2 }), true);
      while (!once.still) { once.step(16); twice.step(16); assert.deepEqual(twice.state, once.state, `${name} played again at ${share}`); }
      assert.ok(twice.still, `${name}: over when the first one is`);
    }
  }
});

test('a shake does not turn the body through the middle of a spin, so no eye shows edge on, and nothing jumps', () => {
  // The spin hides the eyes by its own yaw; a turn added after it would show an eye edge on. The shake's turn
  // goes as the spin sets off and comes back as it ends, a little at a time.
  const xs = (polys) => polys.flatMap((p) => Array.from({ length: p.length / 2 }, (_, i) => p[2 * i]));
  for (const body of [BODIES.wedge, BODIES.heart]) {
    for (const from of [-300, -100, 0, 60, 120, 200, 300, 450]) {
      for (const dir of [1, -1]) {
        const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
        const spin = new Rig({ seed: 1, idle: false, blinks: false, body });
        let prev = 0, t = Math.min(0, from);
        for (; t < POKE_MS.spin || !rig.still; t += 4) {
          if (t === from) rig.play('shake', { dir });
          if (t === 0) { rig.poke('spin'); spin.poke('spin'); }
          rig.step(4); if (t >= 0) spin.step(4);
          const yaw = rig.state.pose.yaw, u = (t + 4) / POKE_MS.spin;
          let d = yaw - prev;
          if (Math.abs(d) > Math.PI / 2) d -= Math.sign(d) * Math.PI;
          prev = yaw;
          assert.ok(Math.abs(d) < deg(4.5), `${body.id} shake at ${from}, ${t} ms: a 4 ms step of ${(d * 180) / Math.PI} degrees`);
          // Through the middle of the spin the yaw is the spin's own (the shake still leans it a little).
          if (u >= 0.12 && u <= 0.88) assert.ok(Object.is(yaw, spin.state.pose.yaw), `${body.id} shake at ${from}, ${t} ms: yaw ${yaw} against ${spin.state.pose.yaw}`);
          if (Math.abs(yaw) > deg(67)) {
            const [l, r] = eyeShapes(body, rig.state, 180);
            assert.equal(xs([...l, ...r]).length, 0, `${body.id} shake at ${from}, ${t} ms: an eye edge on`);
          }
        }
      }
    }
  }
});

test('extra clips come after the rig\'s own, in their own order, whatever their names', () => {
  const lean = { lane: 'cue', ms: 200, apply(o) { o.roll += 0.01; } };
  const wave = { lane: 'poke', ms: 200, apply(o) { o.roll += 0.01; } };
  const rig = new Rig({ seed: 1, idle: false, blinks: false, clips: { b: wave, 2: wave, 1: lean, a: lean } });
  // A plain poke() goes round the rig's own pokes first, then the extras.
  const played = [];
  for (let i = 0; i < 5; i++) { rig.poke(); played.push(rig.poking.clip === wave ? 'extra' : Object.keys(CLIPS).find((k) => CLIPS[k] === rig.poking.clip)); while (!rig.still) rig.step(16); }
  assert.deepEqual(played, ['spin', 'nod', 'hop', 'extra', 'extra']);
  assert.deepEqual(rig.cueNames, [...CUES, '1', 'a']);
});
