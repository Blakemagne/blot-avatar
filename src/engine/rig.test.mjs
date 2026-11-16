// The avatar's rig: eyes lead, body follows; a blink; the idle drift; the same seed gives the same frames;
// starting in a pose and coming to rest in one.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BLINK_HEIGHT, BLINK_MS, BODIES, FACES, LOOK_PITCH, LOOK_YAW, Rig, deg, drawAvatar, eyeShapes, area } = await import('./index.ts');

test('a look moves the eyes first and the body after', () => {
  const rig = new Rig({ seed: 1, idle: false, blinks: false });
  assert.equal(rig.step(16), false, 'at rest nothing changes');
  rig.look(1, 0);
  let eyesMost = null, bodyHalf = null, eyesAtBodyHalf = 0, bodyAtEyesMost = 0;
  for (let ms = 1; ms <= 2000; ms++) {
    assert.equal(rig.step(1), true, `still moving at ${ms} ms`);
    const s = rig.state;
    if (eyesMost === null && s.eye.x >= 0.8) { eyesMost = ms; bodyAtEyesMost = s.pose.yaw / LOOK_YAW; }
    if (bodyHalf === null && s.pose.yaw >= LOOK_YAW / 2) { bodyHalf = ms; eyesAtBodyHalf = s.eye.x; }
    if (rig.still) break;
  }
  // The eyes have gone most of their way before the body has gone half of its way.
  assert.ok(eyesMost < bodyHalf, `eyes at 80% after ${eyesMost} ms, body at 50% after ${bodyHalf} ms`);
  assert.ok(eyesMost < 120, `the eyes are quick: ${eyesMost} ms`);
  assert.ok(bodyAtEyesMost < 0.25, `when the eyes are most of the way the body has turned ${bodyAtEyesMost} of its way`);
  assert.ok(eyesAtBodyHalf > 0.97, `when the body is half way the eyes are at ${eyesAtBodyHalf}`);
  assert.ok(bodyHalf > 150 && bodyHalf < 400, `the body takes its time, but not long: ${bodyHalf} ms`);
  // The body does not set off with the eyes. It follows where they have got to, so two frames in (33 ms),
  // with the eyes a third of the way across, it has not turned half a degree; by 66 ms, not two.
  const early = new Rig({ seed: 1, idle: false, blinks: false });
  early.look(1, 0);
  early.step(33);
  assert.ok(early.state.eye.x > 0.3 && early.state.pose.yaw < deg(0.5), `at 33 ms: eyes ${early.state.eye.x}, yaw ${early.state.pose.yaw}`);
  early.step(33);
  assert.ok(early.state.eye.x > 0.6 && early.state.pose.yaw > 0 && early.state.pose.yaw < deg(2), `at 66 ms: eyes ${early.state.eye.x}, yaw ${early.state.pose.yaw}`);
  // Both arrive, without overshooting, and then it is still.
  assert.ok(rig.still);
  assert.deepEqual(rig.state.eye, { x: 1, y: 0 });
  assert.ok(Math.abs(rig.state.pose.yaw - LOOK_YAW) < 1e-9 && rig.state.pose.pitch === 0);
  assert.equal(rig.step(16), false);
  // Up is up and right is right: positive yaw and pitch.
  rig.look(0.6, 0.6);
  for (let ms = 0; ms < 3000 && !rig.still; ms++) rig.step(1);
  assert.deepEqual(rig.state.eye, { x: 0.6, y: 0.6 });
  assert.ok(rig.state.pose.yaw > 0 && Math.abs(rig.state.pose.pitch - 0.6 * LOOK_PITCH) < 1e-9);
  // Stop looking: back to the front.
  rig.stop();
  for (let ms = 0; ms < 3000 && !rig.still; ms++) rig.step(1);
  assert.deepEqual(rig.state.pose, { yaw: 0, pitch: 0, roll: 0 });
  assert.deepEqual(rig.state.eye, { x: 0, y: 0 });
});

test('a look never overshoots, whatever the frame time', () => {
  for (const dt of [1, 8, 16.7, 33, 50, 250]) {
    const rig = new Rig({ idle: false, blinks: false });
    rig.look(1, 0);
    let last = 0;
    for (let t = 0; t < 3000; t += dt) {
      rig.step(dt);
      assert.ok(rig.state.pose.yaw >= last && rig.state.pose.yaw <= LOOK_YAW + 1e-12, `dt ${dt}`);
      assert.ok(rig.state.eye.x <= 1 + 1e-12);
      last = rig.state.pose.yaw;
    }
    assert.ok(Math.abs(last - LOOK_YAW) < 1e-6, `dt ${dt}: arrived`);
  }
  // A look is never longer than 1, whichever way it points: a longer one is cut to 1 along its own direction.
  // (Each axis used to be held to 1 by itself, and this one came out as the corner, 1 and -1.)
  const rig = new Rig({ idle: false, blinks: false });
  rig.look(5, -9);
  for (let i = 0; i < 300; i++) rig.step(16);
  const { x, y } = rig.state.eye;
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9 && Math.abs(x / y - 5 / -9) < 1e-9, `a look of 5, -9 came out as ${x}, ${y}`);
  // So no look is ever a corner: both axes all the way at once.
  for (const [lx, ly] of [[1, 1], [1, 0.8], [-1, 1], [0.8, -1], [-1, -1]]) {
    const corner = new Rig({ idle: false, blinks: false });
    corner.look(lx, ly);
    for (let i = 0; i < 300; i++) corner.step(16);
    const e = corner.state.eye;
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - 1) < 1e-9 && Math.abs(e.x * ly - e.y * lx) < 1e-9, `a look of ${lx}, ${ly} came out as ${e.x}, ${e.y}`);
  }
  // One inside the circle is taken as it is, straight across at full length included.
  for (const [lx, ly] of [[1, 0], [-1, 0], [0, 1], [0.6, 0.5], [-0.3, -0.9]]) {
    const inside = new Rig({ idle: false, blinks: false });
    inside.look(lx, ly);
    for (let i = 0; i < 300; i++) inside.step(16);
    assert.deepEqual(inside.state.eye, { x: lx, y: ly });
  }
});

test('a blink lasts about 150 ms, drops the eyes to about a third, and comes at random every few seconds', () => {
  const rig = new Rig({ seed: 3, idle: false });
  const blinks = [];
  let start = null, low = 1;
  for (let ms = 1; ms <= 60_000; ms++) {
    rig.step(1);
    const lid = rig.state.lid;
    if (lid < 1) { start ??= ms; low = Math.min(low, lid); }
    else if (start !== null) { blinks.push({ at: start, ms: ms - start, low }); start = null; low = 1; }
  }
  assert.ok(blinks.length >= 8 && blinks.length <= 30, `${blinks.length} blinks in a minute`);
  for (const b of blinks) {
    assert.ok(b.ms >= 120 && b.ms <= 180, `a blink of ${b.ms} ms`);
    assert.ok(Math.abs(b.low - BLINK_HEIGHT) < 0.01, `eyes down to ${b.low}`);
  }
  assert.ok(BLINK_MS >= 120 && BLINK_MS <= 180 && BLINK_HEIGHT > 0.25 && BLINK_HEIGHT < 0.4);
  const gaps = blinks.slice(1).map((b, i) => b.at - blinks[i].at);
  assert.ok(Math.min(...gaps) >= 2000 && Math.max(...gaps) <= 7000, `gaps ${gaps}`);
  assert.ok(new Set(gaps.map((g) => Math.round(g / 100))).size > 4, 'the gaps vary');
  // The eyes are drawn shorter in a blink, and the same width.
  const quiet = new Rig({ idle: false, blinks: false });
  const open = eyeShapes(BODIES.wedge, quiet.state, 180)[0][0];
  quiet.blink();
  quiet.step(BLINK_MS / 2);
  const shut = eyeShapes(BODIES.wedge, quiet.state, 180)[0][0];
  const height = (p) => { let a = Infinity, b = -Infinity; for (let i = 1; i < p.length; i += 2) { a = Math.min(a, p[i]); b = Math.max(b, p[i]); } return b - a; };
  assert.ok(Math.abs(height(shut) / height(open) - BLINK_HEIGHT) < 0.02, `${height(shut)} of ${height(open)}`);
  assert.ok(Math.abs(area(shut)) < Math.abs(area(open)) * 0.5);
  // With blinks off it never blinks by itself.
  const never = new Rig({ seed: 3, idle: false, blinks: false });
  for (let i = 0; i < 2000; i++) { never.step(16); assert.equal(never.state.lid, 1); }
});

test('left alone it drifts into a subtle three-quarter view and back, and a look puts the drift on hold', () => {
  const rig = new Rig({ seed: 5, blinks: false });
  let yaw = 0, pitch = 0, roll = 0, away = 0, front = 0, turns = 0, was = true;
  for (let ms = 0; ms < 120_000; ms += 4) {
    rig.step(4);
    const p = rig.state.pose;
    yaw = Math.max(yaw, Math.abs(p.yaw)); pitch = Math.max(pitch, Math.abs(p.pitch)); roll = Math.max(roll, Math.abs(p.roll));
    const atFront = Math.abs(p.yaw) < deg(1);
    if (atFront) front++; else away++;
    if (was && !atFront) turns++;
    was = atFront;
  }
  assert.ok(yaw > deg(12) && yaw <= deg(22.01), `yaw up to ${(yaw * 180) / Math.PI}`);
  assert.ok(pitch > deg(3) && pitch <= deg(10.01), `pitch up to ${(pitch * 180) / Math.PI}`);
  assert.ok(roll > deg(1.5) && roll <= deg(4.51), `roll up to ${(roll * 180) / Math.PI}`);
  assert.ok(turns >= 8 && turns <= 30, `${turns} drifts in two minutes`);
  assert.ok(front > away * 0.5, 'it spends a good share of the time facing front');
  // While something is being looked at there is no drift.
  const held = new Rig({ seed: 5, blinks: false });
  held.look(0, 0);
  for (let i = 0; i < 5000; i++) { held.step(16); assert.equal(held.state.pose.yaw, 0); }
  // With idle off it stays put.
  const off = new Rig({ seed: 5, idle: false, blinks: false });
  for (let i = 0; i < 5000; i++) assert.equal(off.step(16), false);
});

test('the same seed and the same steps give the same frames', () => {
  const film = (seed) => {
    const rig = new Rig({ seed });
    const frames = [];
    for (let i = 0; i < 900; i++) {
      if (i === 200) rig.look(0.8, -0.3);
      if (i === 420) rig.stop();
      rig.step(i % 7 === 0 ? 33.4 : 16.7);
      if (i % 3 === 0) frames.push(JSON.stringify(drawAvatar(BODIES.wedge, 'orange', rig.state, 180)));
    }
    return frames;
  };
  const a = film(42), b = film(42), c = film(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(new Set(a).size > 100, 'and the frames do move');
});

// A live avatar takes over from a still one, and hands back to it: the rig starts in the still's pose, and
// comes to rest in it.
const PORTRAIT = { yaw: deg(-20), pitch: deg(3), roll: deg(9) };
const picture = (state) => JSON.stringify(drawAvatar(BODIES.wedge, 'orange', state, 36));
const STILL = { pose: PORTRAIT, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };

test('a rig can start in a pose: the first picture is the still, and it eases from there with no jump', () => {
  const rig = new Rig({ seed: 3, pose: PORTRAIT, idle: false, blinks: false });
  assert.deepEqual(rig.state.pose, PORTRAIT);
  assert.equal(picture(rig.state), picture(STILL), 'before a step it is the still picture');
  assert.equal(rig.resting, false, 'but it is not at rest: it was not told to rest');
  // Left alone it turns to the front: gently (under a third of a degree in the first frame), steadily, and all the way.
  let last = { ...rig.state.pose };
  rig.step(16);
  assert.ok(Math.abs(rig.state.pose.yaw - PORTRAIT.yaw) < deg(0.3) && Math.abs(rig.state.pose.roll - PORTRAIT.roll) < deg(0.3), 'no jump in the first frame');
  for (let ms = 16; ms < 3000; ms += 4) {
    last = { ...rig.state.pose };
    rig.step(4);
    assert.ok(rig.state.pose.yaw >= last.yaw - 1e-12 && rig.state.pose.roll <= last.roll + 1e-12, `it only ever heads for the front (at ${ms} ms)`);
    assert.ok(Math.abs(rig.state.pose.yaw - last.yaw) < deg(0.5), `and never more than half a degree in 4 ms (at ${ms} ms)`);
  }
  assert.deepEqual(rig.state.pose, { yaw: 0, pitch: 0, roll: 0 });
  // The pose it was given is not kept: changing the caller's object changes nothing.
  const mine = { ...PORTRAIT }, other = new Rig({ pose: mine });
  mine.yaw = 1;
  assert.deepEqual(other.state.pose, PORTRAIT);
  // From a pose, a look still leads with the eyes: they are most of their way when the body has gone a fifth of its own.
  const look = new Rig({ seed: 3, pose: PORTRAIT, idle: false, blinks: false });
  look.look(1, 0);
  let eyesAt = null, bodyThen = 0;
  for (let ms = 1; ms <= 3000; ms++) {
    look.step(1);
    if (eyesAt === null && look.state.eye.x >= 0.8) { eyesAt = ms; bodyThen = (look.state.pose.yaw - PORTRAIT.yaw) / (LOOK_YAW - PORTRAIT.yaw); }
  }
  assert.ok(eyesAt < 120 && bodyThen < 0.2, `eyes at 80% after ${eyesAt} ms, with the body ${bodyThen} of its way round`);
  assert.ok(Math.abs(look.state.pose.yaw - LOOK_YAW) < 1e-6);
});

test('told to rest in a pose, it comes to rest there as the still picture, and then no step changes it', () => {
  // Everything on: the breath, the blinks, the drift. At rest none of them runs.
  const rig = new Rig({ seed: 5 });
  rig.setActivity('working');
  for (let t = 0; t < 2600; t += 16) rig.step(16);
  assert.notEqual(picture(rig.state), picture(STILL));
  rig.setActivity('idle');
  rig.rest(PORTRAIT);
  assert.equal(rig.resting, false, 'not at once: it eases there');
  let took = 0, far = 0, before = { ...rig.state.pose };
  while (!rig.resting && took < 5000) {
    rig.step(4); took += 4;
    far = Math.max(far, Math.abs(rig.state.pose.yaw - before.yaw), Math.abs(rig.state.pose.roll - before.roll));
    before = { ...rig.state.pose };
  }
  assert.ok(rig.resting && took > 300 && took < 2500, `at rest after ${took} ms`);
  assert.ok(far < deg(0.6), `eased, never jumped: at most ${far} rad in 4 ms`);
  assert.deepEqual(rig.state.pose, PORTRAIT);
  assert.deepEqual(rig.state.eye, { x: 0, y: 0 });
  assert.equal(rig.state.lid, 1);
  assert.equal(rig.state.stretch, 1, 'no breath at rest');
  assert.equal(picture(rig.state), picture(STILL), 'the picture at rest is the still, exactly');
  // A minute of steps: nothing. No breath, no blink, no drift.
  for (let i = 0; i < 3750; i++) assert.equal(rig.step(16), false);
  assert.equal(rig.resting, true);
});

test('a rig can start at rest, wakes for an activity from where it stood, and settles back exactly', () => {
  const rig = new Rig({ seed: 9, body: BODIES.wedge, pose: PORTRAIT, rest: true });
  assert.equal(rig.resting, true);
  assert.equal(picture(rig.state), picture(STILL));
  for (let i = 0; i < 1000; i++) assert.equal(rig.step(16), false);
  // Its Bot starts thinking: it is awake, and sets off from the still's pose (no jump in the first frame).
  rig.setActivity('thinking');
  assert.equal(rig.resting, false);
  assert.equal(rig.step(16), true);
  assert.ok(Math.abs(rig.state.pose.yaw - PORTRAIT.yaw) < deg(0.4) && Math.abs(rig.state.pose.roll - PORTRAIT.roll) < deg(0.4));
  for (let t = 0; t < 3000; t += 16) rig.step(16);
  assert.ok(Math.abs(rig.state.pose.roll - PORTRAIT.roll) > deg(4) && picture(rig.state) !== picture(STILL), 'while it thinks it has left the rest pose');
  assert.notEqual(rig.state.stretch, 1, 'and it breathes');
  // The turn ends: back to rest, with no call but the activity.
  rig.setActivity('idle');
  let took = 0;
  while (!rig.resting && took < 5000) { rig.step(4); took += 4; }
  assert.ok(rig.resting && took < 2500, `at rest again after ${took} ms`);
  assert.equal(picture(rig.state), picture(STILL));
  // A poke at rest plays and comes back to rest; so does a change of shape, which rests in the new shape's pose.
  rig.poke('hop');
  assert.equal(rig.resting, false);
  for (took = 0; !rig.resting && took < 5000; took += 4) rig.step(4);
  assert.ok(rig.resting);
  assert.equal(picture(rig.state), picture(STILL));
  const heart = { yaw: deg(-24), pitch: deg(8), roll: deg(7) };
  rig.setBody(BODIES.heart);
  rig.rest(heart);
  assert.equal(rig.resting, false);
  for (took = 0; !rig.resting && took < 5000; took += 4) rig.step(4);
  assert.ok(rig.resting);
  assert.deepEqual(rig.state.pose, heart);
  assert.equal(JSON.stringify(drawAvatar(BODIES.wedge, 'orange', rig.state, 36)), JSON.stringify(drawAvatar(BODIES.heart, 'orange', { ...STILL, pose: heart }, 36)));
  // Told to rest somewhere else, it is not at rest until it has got there.
  rig.rest(PORTRAIT);
  assert.equal(rig.resting, false);
  for (took = 0; !rig.resting && took < 5000; took += 4) rig.step(4);
  assert.deepEqual(rig.state.pose, PORTRAIT);
  // Woken for good, it turns to the front, breathes and drifts again.
  rig.rest(null);
  assert.equal(rig.resting, false);
  let breathed = false, drifted = false;
  for (let t = 0; t < 20000; t += 16) { rig.step(16); breathed ||= rig.state.stretch > 1.005; drifted ||= Math.abs(rig.state.pose.yaw) > deg(8) && t > 3000; }
  assert.ok(breathed && drifted, 'awake again');
  // A rig that was never told to rest is never resting, however still it is.
  const plain = new Rig({ idle: false, blinks: false });
  for (let i = 0; i < 100; i++) plain.step(16);
  assert.equal(plain.still, true);
  assert.equal(plain.resting, false);
});

test('a look comes to rest once what is left cannot be seen, exactly on its target', () => {
  const rig = new Rig({ seed: 1, idle: false, blinks: false });
  rig.look(0.8, 0.5);
  let ms = 0, before = 0;
  while (!rig.still && ms < 5000) { before = rig.state.pose.yaw; rig.step(16); ms += 16; }
  // The body's spring is within a thousandth of a radian after about 1.2 s; it used to run on to 1.9 s.
  assert.ok(ms > 900 && ms < 1400, `at rest after ${ms} ms`);
  // The last step is a move nobody can see (a fifth of a pixel at the rim of a 200 px avatar), onto the target itself.
  assert.ok(0.8 * LOOK_YAW - before < 2e-3, `the last step turned it ${0.8 * LOOK_YAW - before} rad`);
  assert.equal(rig.state.pose.yaw, 0.8 * LOOK_YAW);
  assert.equal(rig.state.pose.pitch, LOOK_PITCH / 2);
  assert.deepEqual(rig.state.eye, { x: 0.8, y: 0.5 });
  assert.equal(rig.step(16), false);
});

test('an idle avatar is redrawn at the breath’s rate between its drifts and blinks, not for seconds after each', () => {
  // Stepped as the app steps a 72 px avatar (60 a second) for two minutes, three seeds.
  let redraws = 0, tails = 0;
  for (const seed of [1, 2, 3]) {
    const rig = new Rig({ seed });
    let run = 0;
    for (let t = 0; t < 120_000; t += 1000 / 60) {
      if (rig.step(1000 / 60)) { redraws++; run++; } else { if (run > 80) tails++; run = 0; }
    }
  }
  const rate = redraws / 3 / 120;
  // The breath alone is 16.7 a second; the drifts and blinks (real movement) bring it to about 31. It was 38.
  assert.ok(rate > 20 && rate < 33, `${rate} redraws a second`);
  // No unbroken run of redraws is longer than a drift takes to arrive (about 1.2 s; the tails ran to 1.9 s).
  assert.equal(tails, 0, `${tails} runs of more than 80 redraws in a row`);
});

test('a dt that is negative or not finite is no step, and a look that is not a number is no look', () => {
  const fresh = () => {
    const rig = new Rig({ seed: 4, body: BODIES.wedge });
    rig.look(0.6, 0.2); rig.poke('hop'); rig.setBody(BODIES.heart); rig.setActivity('speaking');
    for (let i = 0; i < 5; i++) rig.step(16);
    return rig;
  };
  const numbers = (rig) => { const s = rig.state; return [s.pose.yaw, s.pose.pitch, s.pose.roll, s.eye.x, s.eye.y, s.lid, s.stretch, s.lift, s.scale, s.dot]; };
  for (const bad of [-16, -5000, NaN, Infinity, -Infinity]) {
    const rig = fresh(), was = JSON.stringify(rig.state.pose) + drawAvatar(BODIES.wedge, 'orange', rig.state, 96).body;
    for (let i = 0; i < 5; i++) assert.equal(rig.step(bad), false, `step(${bad}) reports no change`);
    assert.equal(JSON.stringify(rig.state.pose) + drawAvatar(BODIES.wedge, 'orange', rig.state, 96).body, was, `step(${bad}) changes nothing`);
    // And it carries on as if the bad steps had never been: the same frames as a rig that never had them.
    const twin = fresh();
    for (let i = 0; i < 600; i++) { rig.step(16); twin.step(16); }
    assert.deepEqual(numbers(rig), numbers(twin));
    assert.ok(numbers(rig).every(Number.isFinite));
    assert.doesNotMatch(drawAvatar(BODIES.wedge, 'orange', rig.state, 96).body, /NaN/);
  }
  // A look that is not a number is ignored: the look it had stands, later looks work, and it can still come to rest.
  const rig = new Rig({ seed: 1, idle: false, blinks: false });
  rig.look(NaN, 0); rig.look(0, NaN);
  assert.equal(rig.step(16), false);
  rig.look(1, 0);
  for (let i = 0; i < 200; i++) rig.step(16);
  assert.equal(rig.state.pose.yaw, LOOK_YAW);
  rig.look(NaN, NaN);
  for (let i = 0; i < 10; i++) rig.step(16);
  assert.equal(rig.state.pose.yaw, LOOK_YAW, 'the look it had stands');
  rig.rest({ yaw: 0, pitch: 0, roll: 0 });
  for (let i = 0; i < 400 && !rig.resting; i++) rig.step(16);
  assert.ok(rig.resting);
  // An infinite look is still a full look.
  const far = new Rig({ seed: 1, idle: false, blinks: false });
  far.look(Infinity, -Infinity);
  for (let i = 0; i < 200; i++) far.step(16);
  assert.ok(Math.abs(far.state.eye.x - Math.SQRT1_2) < 1e-9 && Math.abs(far.state.eye.y + Math.SQRT1_2) < 1e-9, JSON.stringify(far.state.eye));
  far.look(Infinity, 0.2);
  for (let i = 0; i < 200; i++) far.step(16);
  assert.ok(far.state.eye.x > 0.97 && far.state.eye.y > 0.1, JSON.stringify(far.state.eye));
});

test('a body may turn less than all the way for a look; a spin still goes round, and a new body turns its own way', () => {
  const ball = { ...BODIES.blob, look: 0.8 };
  assert.equal(BODIES.wedge.look, undefined);
  const rig = new Rig({ seed: 1, idle: false, blinks: false, body: ball });
  rig.look(0.6, 0.5);
  for (let i = 0; i < 300; i++) rig.step(16);
  // The eyes and the body both stop at that share of the look, across; up and down is not held back.
  assert.deepEqual(rig.state.eye, { x: 0.6 * 0.8, y: 0.5 });
  assert.equal(rig.state.pose.yaw, 0.6 * 0.8 * LOOK_YAW);
  assert.equal(rig.state.pose.pitch, LOOK_PITCH / 2);
  rig.look(-1, 0);
  for (let i = 0; i < 300; i++) rig.step(16);
  assert.equal(rig.state.pose.yaw, -0.8 * LOOK_YAW);
  // A spin is not a look: it passes edge on.
  rig.poke('spin');
  let most = 0;
  for (let i = 0; i < 600; i++) { rig.step(1); most = Math.max(most, Math.abs(rig.state.pose.yaw)); }
  assert.ok(most > deg(85), `the spin reached ${(most * 180) / Math.PI} degrees`);
  // Changed into a body that turns all the way, it turns the rest of the way for the same look; and back.
  rig.setBody(BODIES.wedge);
  for (let i = 0; i < 300; i++) rig.step(16);
  assert.equal(rig.state.pose.yaw, -LOOK_YAW);
  rig.setBody(ball);
  for (let i = 0; i < 300; i++) rig.step(16);
  assert.equal(rig.state.pose.yaw, -0.8 * LOOK_YAW);
  // A rig with no body of its own turns all the way.
  const bare = new Rig({ seed: 1, idle: false, blinks: false });
  bare.look(1, 0);
  for (let i = 0; i < 300; i++) bare.step(16);
  assert.equal(bare.state.pose.yaw, LOOK_YAW);
});
