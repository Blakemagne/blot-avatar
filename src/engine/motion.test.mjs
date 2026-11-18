// The avatar's little moves: three pokes, a change of shape, faces, what the Bot is doing, the loading figures,
// mirror, emphasis and pause. All through the pure rig, stepped by hand.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BLINK_HEIGHT, BLINK_MS, BODIES, FACES, LOOK_YAW, Rig, area, bounds, deg, drawAvatar, eyeOutline, eyeShapes, inside, random, rotation, silhouette } = await import('./index.ts');
const { ACTIVITIES, BLINK_AT, BREATH, BREATH_MS, CHANGE_MS, FACE_MS, FIGURE_AFTER, FIGURE_HOLD, FIGURE_MS, FIGURE_REST, HOP_HEIGHT, KICK_MS, LAND_AT, MORPH_MS, NOD, NOD_SQUASH, POKES, POKE_MS, POKE_QUEUE, POP, POP_MS, FLIP_MS,
  SPEAK_EYES, SPEAK_FLOOR, SPEAK_GAIN, SPEAK_LIFT, SPEAK_QUIET_MS, SPEAK_STRETCH, WAIT_ROCK, WAIT_ROCK_MS, WAIT_TURN, WORK_FOLLOW, WORK_MS, WORK_READ, WORK_SWEEP } = await import('./rig.ts');
const { ACTIVITY_FACES, FACE_ALIASES, FACE_NAMES, faceFor, sameFace } = await import('./faces.ts');
const { COMET, DOTS, FORMS, ORBIT, figureParts, figureRadius } = await import('./figures.ts');
const { crosses, polar, radial } = await import('./morph.ts');
const { DOT, bodyShapes } = await import('./draw.ts');

const { wedge, heart, tablet: capsule, star, cloud } = BODIES;
/** A rig that does nothing by itself: no drift, no random blinks. */
const quiet = (opts = {}) => new Rig({ seed: 1, idle: false, blinks: false, ...opts });
const snap = (rig) => JSON.stringify({ ...rig.state, body: rig.state.body?.id });
const run = (rig, ms, dt = 8, each) => { for (let t = dt; t <= ms + 1e-9; t += dt) { rig.step(dt); each?.(t); } };
/** Step until nothing moves; the time it took. */
const settle = (rig, most = 5000, dt = 4) => { let t = 0; while (!rig.still && t < most) { rig.step(dt); t += dt; } assert.ok(rig.still, `still moving after ${most} ms`); return t; };
const total = (polys) => polys.reduce((sum, p) => sum + Math.abs(area(p)), 0);
const xs = (polys) => polys.flatMap((p) => Array.from(p).filter((_, i) => i % 2 === 0));
const box = (polys) => { const [x0, y0, x1, y1] = bounds(polys); return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };
const REST = snap(quiet());

test('each poke eases in and out, takes a bounded time, and returns exactly to the pose it started from', () => {
  for (const kind of POKES) {
    for (const look of [null, [0.4, 0.3], [-0.7, -0.5]]) {
      const rig = quiet();
      if (look) { rig.look(...look); settle(rig); }
      const before = snap(rig);
      rig.poke(kind);
      const moved = [];
      let last = rig.state.pose, was = { ...last, lift: 0, stretch: 1 };
      let t = 0;
      while (!rig.still) {
        rig.step(4); t += 4;
        const s = rig.state;
        // The yaw of a spin steps back by half a turn as the far side comes round: that is not movement.
        let dy = Math.abs(s.pose.yaw - was.yaw); if (dy > Math.PI / 2) dy = Math.abs(dy - Math.PI);
        moved.push(dy + Math.abs(s.pose.pitch - was.pitch) + Math.abs(s.lift - was.lift) + Math.abs(s.stretch - was.stretch));
        was = { ...s.pose, lift: s.lift, stretch: s.stretch };
        assert.ok(t <= POKE_MS[kind] + 4, `${kind} is over by ${POKE_MS[kind]} ms`);
      }
      assert.ok(t >= POKE_MS[kind] - 4 && POKE_MS[kind] >= 350 && POKE_MS[kind] <= 700, `${kind} takes ${t} ms`);
      assert.equal(snap(rig), before, `${kind} from ${look}: back exactly where it was`);
      assert.equal(rig.step(16), false, 'and then it is still');
      // Ease in and ease out: the first and last 12 ms move far less than the fastest 12 ms.
      const fastest = Math.max(...moved), first = moved[0] + moved[1] + moved[2], final = moved.at(-1) + moved.at(-2) + moved.at(-3);
      assert.ok(first < fastest * 0.6 && final < fastest * 0.6, `${kind}: first ${first}, last ${final}, fastest step ${fastest}`);
      // Nothing jumps: no 4 ms step moves more than a few degrees (or a few hundredths of a unit).
      assert.ok(fastest < 0.09, `${kind}: fastest 4 ms step ${fastest}`);
    }
  }
});

/** What a poke does to the pose, sampled every 8 ms. */
function curve(rig) {
  const out = { yaw: [], pitch: [], lift: [], stretch: [] };
  let t = 0;
  while (!rig.still && t < 2000) { rig.step(8); t += 8; const s = rig.state; out.yaw.push(s.pose.yaw); out.pitch.push(s.pose.pitch); out.lift.push(s.lift); out.stretch.push(s.stretch); }
  return out;
}
/** Which poke a curve is. */
function kindOf(c) {
  if (Math.max(...c.lift) > 0.1) return 'hop';
  if (Math.max(...c.yaw.map(Math.abs)) > 1) return 'spin';
  if (Math.min(...c.pitch) < -0.1) return 'nod';
  return 'none';
}

test('the three pokes are three different reactions: a half-spin, a nod, a hop', () => {
  const of = (kind) => { const rig = quiet(); rig.poke(kind); return curve(rig); };
  const spin = of('spin'), nod = of('nod'), hop = of('hop');
  // The spin turns and nothing else. (Its yaw is reported in the half turn nearest the front.)
  assert.ok(Math.max(...spin.yaw.map(Math.abs)) > deg(80) && spin.pitch.every((p) => p === 0) && spin.lift.every((l) => l === 0) && spin.stretch.every((s) => s === 1));
  // It winds up the other way first, far enough to see (the turn is thrown), and runs a little past at the end.
  assert.ok(Math.min(...spin.yaw.slice(0, 12)) < deg(-4.5) && Math.min(...spin.yaw.slice(0, 12)) > deg(-8), `wind-up ${Math.min(...spin.yaw.slice(0, 12))}`);
  assert.ok(Math.max(...spin.yaw.slice(-16)) > deg(2) && Math.max(...spin.yaw.slice(-16)) < deg(8), `overshoot ${Math.max(...spin.yaw.slice(-16))}`);
  // The nod dips about 16 degrees and nothing else; it comes back a little past level.
  assert.ok(Math.abs(Math.min(...nod.pitch) + NOD) < deg(0.5) && Math.abs(NOD - deg(16)) < 1e-9, `nod to ${Math.min(...nod.pitch)}`);
  assert.ok(Math.max(...nod.pitch) > deg(1.5) && Math.max(...nod.pitch) < deg(4), `overshoot ${Math.max(...nod.pitch)}`);
  assert.ok(nod.yaw.every((y) => y === 0) && nod.lift.every((l) => l === 0));
  assert.ok(nod.pitch.indexOf(Math.min(...nod.pitch)) < nod.pitch.length * 0.4, 'down is the quick part');
  // The body gives a little as it dips, so the nod shows in the outline of a body that pitch alone hardly changes:
  // on the heart the top comes down at least five pixels at 180 px (pitch alone moved it about three).
  assert.ok(Math.abs(Math.min(...nod.stretch) - (1 - NOD_SQUASH)) < 0.002 && nod.stretch.at(-1) === 1 && NOD_SQUASH >= 0.04 && NOD_SQUASH <= 0.06);
  const nodding = quiet(); nodding.poke('nod');
  const rest = box(bodyShapes(heart, nodding.state, 180));
  let top = rest.y0;
  while (!nodding.still) { nodding.step(8); top = Math.max(top, box(bodyShapes(heart, nodding.state, 180)).y0); }
  assert.ok((top - rest.y0) * 90 > 5, `the heart's top dips ${(top - rest.y0) * 90} px`);
  // The hop leaves the ground, squashes and stretches, and does not turn.
  assert.ok(Math.abs(Math.max(...hop.lift) - HOP_HEIGHT) < 0.01 && hop.yaw.every((y) => y === 0) && hop.pitch.every((p) => p === 0));
  assert.deepEqual([kindOf(spin), kindOf(nod), kindOf(hop)], ['spin', 'nod', 'hop']);
});

test('a plain poke plays the next of the three, so every poke differs from the last', () => {
  const rig = quiet();
  const played = [];
  for (let i = 0; i < 7; i++) { rig.poke(); played.push(kindOf(curve(rig))); }
  assert.deepEqual(played, ['spin', 'nod', 'hop', 'spin', 'nod', 'hop', 'spin']);
  // After a poke asked for by name, a plain one is the one after it.
  rig.poke('nod'); curve(rig);
  rig.poke(); assert.equal(kindOf(curve(rig)), 'hop');
  rig.poke('hop'); curve(rig);
  rig.poke(); assert.equal(kindOf(curve(rig)), 'spin');
  // A name the rig does not know is a plain poke.
  rig.poke('wiggle'); assert.equal(kindOf(curve(rig)), 'nod');
  assert.equal(snap(rig), REST);
});

test('a poke during a poke waits its turn: neither pose is broken, and extra ones are dropped', () => {
  const solo = quiet(); solo.poke('hop'); const alone = curve(solo);
  const rig = quiet();
  rig.poke('hop');
  const both = { yaw: [], pitch: [], lift: [], stretch: [] };
  for (let t = 8; !rig.still && t < 4000; t += 8) {
    if (t === 160) { rig.poke('nod'); rig.poke('spin'); for (let i = 0; i < 5; i++) rig.poke('hop'); }
    rig.step(8);
    const s = rig.state; both.yaw.push(s.pose.yaw); both.pitch.push(s.pose.pitch); both.lift.push(s.lift); both.stretch.push(s.stretch);
  }
  // The hop that was playing is the hop it would have been.
  assert.deepEqual(both.lift.slice(0, alone.lift.length), alone.lift);
  assert.deepEqual(both.stretch.slice(0, alone.stretch.length), alone.stretch);
  assert.ok(both.pitch.slice(0, alone.lift.length - 1).every((p) => p === 0), 'no nod until the hop is over');
  // Then the nod, then the spin, each whole; the five extra hops were dropped.
  const n = alone.lift.length, after = { yaw: both.yaw.slice(n), pitch: both.pitch.slice(n), lift: both.lift.slice(n) };
  assert.ok(Math.abs(Math.min(...after.pitch) + NOD) < deg(0.5));
  assert.ok(Math.max(...after.yaw.map(Math.abs)) > deg(80));
  assert.ok(after.lift.every((l) => l === 0), 'no second hop');
  assert.equal(POKE_QUEUE, 2);
  assert.ok(both.lift.length * 8 <= POKE_MS.hop + POKE_MS.nod + POKE_MS.spin + 40);
  assert.equal(snap(rig), REST);
});

test('the half-spin turns half a turn, ends facing front with both eyes whole, and never shows an eye on both sides', () => {
  for (const body of [wedge, heart, capsule]) {
    const rig = quiet();
    for (const dir of [1, -1]) {
      const rest = eyeShapes(body, rig.state, 180);
      assert.ok(rest[0].length === 1 && rest[1].length === 1);
      rig.poke('spin');
      let prev = 0, turned = 0, wraps = 0, gone = 0, least = 1;
      for (let t = 4; t <= POKE_MS.spin; t += 4) {
        rig.step(4);
        const yaw = rig.state.pose.yaw;
        let d = yaw - prev;
        if (Math.abs(d) > Math.PI / 2) { d -= Math.sign(d) * Math.PI; wraps++; }
        turned += d; prev = yaw;
        assert.ok(Math.abs(d) < deg(4.5), `${body.id}: a 4 ms step of ${(d * 180) / Math.PI} degrees`);
        const eyes = eyeShapes(body, rig.state, 180), x = xs([...eyes[0], ...eyes[1]]);
        least = Math.min(least, rig.state.eyeScale);
        // Turned well round, whatever is drawn of the eyes is on the side the face is turned to.
        if (Math.abs(yaw) > deg(50)) assert.ok(x.every((v) => v * yaw > 0), `${body.id} at ${(yaw * 180) / Math.PI}: an eye on the far side`);
        // Edge on, there are no eyes at all.
        if (Math.abs(yaw) > deg(67)) { assert.equal(x.length, 0, `${body.id} at ${(yaw * 180) / Math.PI}`); gone++; }
      }
      assert.equal(wraps, 1, 'the far side comes round once');
      assert.ok(Math.abs(turned - dir * Math.PI) < 1e-9, `${body.id}: turned ${(turned * 180) / Math.PI} degrees`);
      assert.ok(gone >= 3 && least === 0, 'the eyes are gone through the edge-on moment');
      assert.equal(snap(rig), REST);
      assert.deepEqual(eyeShapes(body, rig.state, 180), rest, `${body.id}: both eyes whole, facing front`);
    }
  }
});

test('a spin from a body already turned far to one side starts and ends without the eyes jumping in size', () => {
  for (const x of [1, -1, 0.9]) {
    const rig = quiet();
    rig.look(x, 0); settle(rig);
    const before = snap(rig);
    rig.poke('spin');
    const sizes = [];
    for (let t = 2; t <= POKE_MS.spin + 2; t += 2) { rig.step(2); sizes.push(rig.state.eyeScale); }
    assert.ok(sizes[0] > 0.995 && sizes.at(-2) > 0.995, `first ${sizes[0]}, last ${sizes.at(-2)}`);
    for (let i = 1; i < sizes.length; i++) assert.ok(Math.abs(sizes[i] - sizes[i - 1]) < 0.16, `a step of ${sizes[i] - sizes[i - 1]} at ${i * 2} ms`);
    assert.equal(Math.min(...sizes), 0);
    assert.equal(snap(rig), before);
  }
});

test('the hop squashes and stretches without losing its bulk, stands on its base, and keeps its eyes on', () => {
  for (const body of [wedge, heart]) {
    const rig = quiet();
    const rest = bodyShapes(body, rig.state, 180), at = box(rest), bulk = body === wedge ? total(rest) : 0;
    rig.poke('hop');
    const seen = { low: 1, high: 1, wide: 0, narrow: 9, top: 0 };
    const order = [];
    run(rig, POKE_MS.hop, 4, () => {
      const s = rig.state, polys = bodyShapes(body, s, 180), b = box(polys);
      // Wider when shorter, by the same factor: the area stays what it was. (One piece: the wedge.)
      if (bulk) assert.ok(Math.abs(total(polys) / bulk - 1) < 0.005, `area ${total(polys)} of ${bulk}`);
      assert.ok(Math.abs(b.w / at.w - 1 / s.stretch) < 1e-9 && Math.abs(b.h / at.h - s.stretch) < 1e-9);
      // It stands on its base: the bottom is on the ground, or off it by the lift.
      assert.ok(Math.abs(b.y1 - (at.y1 - s.lift)) < 1e-9, `bottom ${b.y1}, lift ${s.lift}`);
      seen.low = Math.min(seen.low, s.stretch); seen.high = Math.max(seen.high, s.stretch);
      seen.wide = Math.max(seen.wide, b.w / at.w); seen.narrow = Math.min(seen.narrow, b.w / at.w); seen.top = Math.max(seen.top, s.lift);
      const phase = s.lift > 0 ? 'air' : s.stretch < 0.97 ? 'squash' : null;
      if (phase && order.at(-1) !== phase) order.push(phase);
      // The eyes stay on the body.
      const eyes = eyeShapes(body, s, 180);
      assert.ok(eyes[0].length === 1 && eyes[1].length === 1);
      for (const eye of eyes) for (let i = 0; i < eye[0].length; i += 2) assert.ok(polys.some((p) => inside(p, eye[0][i], eye[0][i + 1])), 'an eye point off the body');
    });
    // Squash first, then up (stretched), then squash on landing.
    assert.deepEqual(order, ['squash', 'air', 'squash']);
    assert.ok(seen.low < 0.9 && seen.low > 0.8 && seen.high > 1.08 && seen.high < 1.2, `stretch ${seen.low} to ${seen.high}`);
    assert.ok(seen.wide > 1.1 && seen.narrow < 0.93);
    assert.ok(Math.abs(seen.top - HOP_HEIGHT) < 0.005);
    assert.equal(snap(rig), REST);
  }
  // The flight is a thrown ball's: equal times up and down, and fastest at the ground.
  const rig = quiet(); rig.poke('hop');
  const lift = curve(rig).lift, air = lift.filter((l) => l > 0), peak = air.indexOf(Math.max(...air));
  assert.ok(Math.abs(peak - air.length / 2) <= 1.5, `peak at ${peak} of ${air.length}`);
  assert.ok(air[0] > 0.02 && air[1] - air[0] > air[peak] - air[peak - 1], 'it leaves the ground at speed');
});

/** Is the point inside any of the polygons? */
const within = (polys, x, y) => polys.some((p) => inside(p, x, y));

test("seen from its middle, every body's outline is one closed curve: what the morph blends is the real silhouette", () => {
  for (const [id, body] of Object.entries(BODIES)) {
    for (const pose of [{ yaw: 0, pitch: 0, roll: 0 }, { yaw: deg(40), pitch: deg(-10), roll: deg(5) }]) {
      const pieces = silhouette(body, rotation(pose), 72), curve = [polar(radial(pieces, 144))];
      assert.equal(crosses(curve[0]), false);
      let on = 0, differ = 0;
      for (let i = 0; i < 70; i++) for (let j = 0; j < 70; j++) {
        const x = -1.4 + (2.8 * (i + 0.5)) / 70, y = -1.4 + (2.8 * (j + 0.5)) / 70;
        const a = within(pieces, x, y), b = within(curve, x, y);
        if (a) on++;
        if (a !== b) differ++;
      }
      assert.ok(differ / on < 0.012, `${id} at yaw ${(pose.yaw * 180) / Math.PI}: ${differ} of ${on} samples differ`);
    }
  }
});

test('a change of shape: the outline morphs as one shape, the eyes are dots at its middle, then a settle tilt, then a blink', () => {
  const pairs = [[wedge, heart], [heart, capsule], [capsule, wedge], [heart, star], [star, cloud], [BODIES.flower, BODIES.clover], [cloud, wedge]];
  for (const [from, to] of pairs) {
    const rig = quiet({ body: from });
    const before = drawAvatar(to, 'orange', rig.state, 180);
    assert.deepEqual(before, drawAvatar(from, 'orange', { ...rig.state, body: undefined }, 180), "the rig's body is the one drawn");
    rig.setBody(to);
    assert.equal(rig.state.body, to);
    const name = `${from.id} to ${to.id}`;
    let last = null, roll = [], lids = [], dots = [];
    for (let t = 5; t <= CHANGE_MS + 20; t += 5) {
      rig.step(5);
      const s = rig.state;
      roll.push(s.pose.roll); lids.push(s.lid); dots.push(s.dot);
      assert.ok(s.stretch > 0.92 && s.stretch < 1.03 && s.scale > 0.92 && s.scale <= 1, `${name}: a soft landing (${s.stretch}, ${s.scale})`);
      if (t < MORPH_MS) {
        // One outline, and it does not cross itself.
        const polys = bodyShapes(from, s, 180);
        assert.equal(polys.length, 1, `${name} at ${t} ms: one outline`);
        assert.equal(crosses(polys[0]), false, `${name} at ${t} ms crosses itself`);
        // No pop: from one frame to the next no point of the outline moves far.
        if (last) {
          let most = 0;
          for (let i = 0; i < last.length; i += 2) most = Math.max(most, Math.hypot(polys[0][i] - last[i], polys[0][i + 1] - last[i + 1]));
          assert.ok(most < 0.06, `${name} at ${t} ms: a point moved ${most}`);
        }
        last = polys[0];
        assert.ok(s.morph && s.morph.k > 0 && s.morph.k < 1);
      } else assert.equal(s.morph, null, `${name}: the morph is over by ${MORPH_MS} ms`);
      if (t === 200) {
        // The middle of it: both eyes are dots.
        assert.equal(s.dot, 1);
        const pill = from.eyes.w * from.eyes.h, disc = Math.PI * ((DOT * from.eyes.w) / 2) ** 2;
        for (const eye of eyeShapes(from, s, 180)) {
          assert.equal(eye.length, 1, `${name}: a dot for each eye`);
          const b = box(eye), a = Math.abs(area(eye[0]));
          assert.ok(b.w / b.h > 0.8 && b.w / b.h < 1.25, `${name}: a dot ${b.w} by ${b.h}`);
          assert.ok(a > disc * 0.7 && a < disc * 1.7 && a < pill * 0.36, `${name}: dot area ${a}`);
          assert.ok(within(bodyShapes(from, s, 180), (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), `${name}: the dot is on the body`);
        }
      }
    }
    // The morph starts on the old shape and ends on the new: its first and last frames barely differ from them.
    assert.ok(MORPH_MS >= 350 && MORPH_MS <= 450);
    // The eyes go to dots and come back before the landing is over.
    assert.ok(dots[0] > 0 && dots[0] < 0.1 && Math.max(...dots) === 1 && dots.at(-1) === 0 && dots[Math.round(450 / 5)] === 0);
    // The settle tilt: a few degrees of roll once the new body has landed, which springs back the other way and dies out.
    const at = (ms) => Math.round(ms / 5) - 1;
    assert.ok(roll.slice(0, at(LAND_AT)).every((r) => r === 0), 'no tilt before the landing');
    const tilt = roll.slice(at(LAND_AT), at(LAND_AT + 200)), peak = tilt.reduce((m, r) => (Math.abs(r) > Math.abs(m) ? r : m), 0);
    assert.ok(Math.abs(peak) > deg(2.5) && Math.abs(peak) < deg(6), `${name}: tilt of ${(peak * 180) / Math.PI} degrees`);
    // A soft settle: the tilt begins gently (a lean, not a knock). 20 ms after the landing it has not gone a
    // twentieth of the way, no 5 ms step is a tenth of it, and it is at its furthest some 100 ms after landing.
    assert.ok(Math.abs(roll[at(LAND_AT + 20)]) < Math.abs(peak) / 20, `${name}: 20 ms in, ${roll[at(LAND_AT + 20)] / peak} of the tilt`);
    for (let i = at(LAND_AT); i < at(LAND_AT + 200); i++) assert.ok(Math.abs(roll[i + 1] - roll[i]) < Math.abs(peak) / 10, `${name}: the tilt jumps`);
    const furthest = (tilt.indexOf(peak) + 1) * 5;
    assert.ok(furthest >= 90 && furthest <= 140 && KICK_MS >= 70 && KICK_MS <= 110, `${name}: furthest ${furthest} ms after landing`);
    const back = roll.slice(at(LAND_AT + 200), at(LAND_AT + 420));
    assert.ok(back.some((r) => r * peak < 0 && Math.abs(r) > deg(0.5)), 'it springs back past upright');
    assert.ok(Math.abs(roll.at(-1)) < deg(0.2), 'and has all but died away by the end of the blink');
    // Then the blink: not before, and a whole one.
    assert.ok(lids.slice(0, at(BLINK_AT)).every((l) => l === 1), 'no blink before the tilt');
    assert.ok(BLINK_AT > LAND_AT + 200 && BLINK_AT + BLINK_MS <= CHANGE_MS);
    const blink = lids.slice(at(BLINK_AT), at(BLINK_AT + BLINK_MS) + 1);
    assert.ok(Math.abs(Math.min(...blink) - BLINK_HEIGHT) < 0.02 && lids.at(-1) === 1, `${name}: blink down to ${Math.min(...blink)}`);
    // It ends exactly on the new body (the last of the tilt, too small to see, dies out within the second).
    assert.ok(settle(rig, 1000) < 700);
    assert.equal(snap(rig), snap(quiet({ body: to })));
    assert.deepEqual(drawAvatar(from, 'orange', rig.state, 180), drawAvatar(to, 'orange', quiet().state, 180), `${name}: ends exactly on the new body`);
  }
});

test('the first and last frames of a morph are the old and the new silhouette', () => {
  for (const [from, to] of [[wedge, heart], [heart, star], [star, cloud], [capsule, wedge]]) {
    const rig = quiet({ body: from });
    const old = bodyShapes(from, rig.state, 180);
    rig.setBody(to);
    rig.step(4);
    const first = bodyShapes(from, { ...rig.state, scale: 1, dot: 0 }, 180);
    run(rig, MORPH_MS - 12, 4);
    const final = bodyShapes(from, { ...rig.state, scale: 1, stretch: 1, pose: { yaw: 0, pitch: 0, roll: 0 } }, 180), next = bodyShapes(to, quiet().state, 180);
    for (const [a, b, what] of [[old, first, 'start'], [next, final, 'end']]) {
      let on = 0, differ = 0;
      for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) {
        const x = -1.3 + (2.6 * (i + 0.5)) / 60, y = -1.3 + (2.6 * (j + 0.5)) / 60;
        const p = within(a, x, y);
        if (p) on++;
        if (p !== within(b, x, y)) differ++;
      }
      assert.ok(differ / on < 0.015, `${from.id} to ${to.id}, ${what}: ${differ} of ${on} samples differ`);
    }
  }
});

test('a change of shape during a change of shape starts from the in-between, without a pop', () => {
  const rig = quiet({ body: wedge });
  let last = null;
  const steps = { 5: heart, 180: star, 300: capsule, 380: cloud, 420: wedge, 470: heart };
  let eyes = null;
  for (let t = 5; t <= 470 + CHANGE_MS + 10; t += 5) {
    if (steps[t]) rig.setBody(steps[t]);
    rig.step(5);
    const polys = bodyShapes(wedge, rig.state, 180);
    // The eyes do not jump either: neither where they are nor how big.
    const now = eyeShapes(wedge, rig.state, 180).map((e) => ({ ...box(e), area: total(e) }));
    if (eyes) now.forEach((e, i) => {
      assert.ok(Math.abs(e.x0 + e.x1 - eyes[i].x0 - eyes[i].x1) / 2 < 0.03 && Math.abs(e.y0 + e.y1 - eyes[i].y0 - eyes[i].y1) / 2 < 0.03, `at ${t} ms an eye jumped`);
      assert.ok(Math.abs(e.area - eyes[i].area) < 0.02, `at ${t} ms an eye changed size by ${e.area - eyes[i].area}`);
    });
    eyes = now;
    if (rig.state.morph) {
      assert.equal(polys.length, 1);
      assert.equal(crosses(polys[0]), false);
      if (last && last.length === polys[0].length) {
        let most = 0;
        for (let i = 0; i < last.length; i += 2) most = Math.max(most, Math.hypot(polys[0][i] - last[i], polys[0][i + 1] - last[i + 1]));
        assert.ok(most < 0.07, `at ${t} ms a point moved ${most}`);
      }
      last = polys[0];
    }
  }
  settle(rig, 1500);
  assert.equal(snap(rig), snap(quiet({ body: heart })));
  // Without a body to start from, the first one is simply taken; the same body again changes nothing.
  const bare = quiet();
  bare.setBody(star);
  assert.equal(bare.state.body, star);
  assert.equal(bare.state.morph, null);
  bare.setBody(star);
  assert.equal(bare.step(16), false);
});

const LIST = ['neutral', 'attentive', 'surprised', 'excited', 'happy', 'laughing', 'angry', 'sad', 'scared', 'suspicious', 'confused', 'curious', 'proud', 'shy', 'bored', 'sleepy', 'inspecting', 'squinted', 'calm', 'oval'];
/** A face as the eyes draw it, facing front: the face alone, without the way it is worn (its manner moves the head). */
const worn = (name) => { const rig = quiet(); rig.setFace(name); settle(rig); return { ...rig.state, pose: { yaw: 0, pitch: 0, roll: 0 }, lift: 0 }; };

test('every face name is a face of its own (or a declared alias), and an unknown name is the neutral face', () => {
  assert.deepEqual([...FACE_NAMES].sort(), [...LIST].sort());
  const drawn = new Map();
  for (const name of LIST) {
    const face = faceFor(name);
    assert.equal(face, FACES[name]);
    assert.deepEqual(worn(name).face, face, `${name}: the rig wears it`);
    const alias = FACE_ALIASES[name];
    if (alias) { assert.ok(sameFace(face, FACES[alias]), `${name} is ${alias}`); continue; }
    if (name !== 'neutral') assert.ok(!sameFace(face, FACES.neutral), `${name} differs from neutral`);
    // And it is drawn differently from every other face: no two eye outlines within a hair of each other.
    const pair = [-1, 1].flatMap((side) => Array.from(eyeOutline(face, side, 0.24, 0.44, 1, 40)));
    for (const [other, o] of drawn) {
      const most = Math.max(...pair.map((v, i) => Math.abs(v - o[i])));
      assert.ok(most > 0.02, `${name} and ${other} are drawn alike (${most})`);
    }
    drawn.set(name, pair);
  }
  for (const name of ['', 'grumpy', 'toString', 'constructor', '__proto__']) assert.equal(faceFor(name), FACES.neutral);
  const rig = quiet(); rig.setFace('happy'); settle(rig); rig.setFace('no such face'); settle(rig);
  assert.equal(snap(rig), REST);
  // The activity faces are faces too, each its own.
  for (const face of Object.values(ACTIVITY_FACES)) assert.ok(!sameFace(face, FACES.neutral));
});

test('every face is drawn with both eyes on the wedge, the heart and the capsule, large and small, and survives the turn', () => {
  for (const name of LIST) {
    const state = worn(name);
    for (const body of [wedge, heart, capsule]) {
      for (const size of [120, 36]) {
        const eyes = eyeShapes(body, state, size), outline = bodyShapes(body, state, size);
        assert.ok(eyes[0].length === 1 && eyes[1].length === 1, `${name} on ${body.id} at ${size}`);
        // Every eye is on the body, and tall enough to show: at least a pixel and a bit.
        for (const [eye] of eyes) {
          for (let i = 0; i < eye.length; i += 2) assert.ok(within(outline, eye[i], eye[i + 1]), `${name} on ${body.id}: off the body`);
          assert.ok(box([eye]).h * (size / 2) >= 1.1, `${name} on ${body.id} at ${size}: ${box([eye]).h * (size / 2)} px tall`);
        }
        // The two eyes do not run into each other.
        assert.ok(box(eyes[0]).x1 < box(eyes[1]).x0, `${name} on ${body.id} at ${size}: the eyes touch`);
      }
      // Turned 30 degrees and looking up a little: both eyes are still there, the near one bigger.
      const turned = eyeShapes(body, { ...state, pose: { yaw: deg(30), pitch: deg(6), roll: 0 } }, 120);
      assert.ok(turned[0].length >= 1 && turned[1].length >= 1, `${name} on ${body.id}, turned`);
    }
  }
  // Inspecting has uneven eye sizes; sleepy is flat low lines.
  const size = (name, body = wedge) => eyeShapes(body, worn(name), 120).map((e) => ({ ...box(e), area: total(e) }));
  const [small, big] = size('inspecting');
  assert.ok(big.area > small.area * 1.6 && big.h > small.h * 1.3, `inspecting: ${small.area} and ${big.area}`);
  const neutral = size('neutral')[0];
  for (const eye of size('sleepy')) {
    assert.ok(eye.h < eye.w * 0.3 && eye.h < neutral.h * 0.25, `sleepy: ${eye.w} by ${eye.h}`);
    assert.ok((eye.y0 + eye.y1) / 2 > (neutral.y0 + neutral.y1) / 2 + 0.1, 'sleepy eyes sit low');
  }
  // Happy eyes are arches: the middle of each is higher than its ends. Calm ones are bowls.
  const bend = (name) => { const [eye] = eyeShapes(capsule, worn(name), 120)[0], b = box([eye]); let mid = 0, ends = 0, m = 0, e = 0; for (let i = 0; i < eye.length; i += 2) { const u = (eye[i] - b.x0) / b.w; if (u > 0.4 && u < 0.6) { mid += eye[i + 1]; m++; } else if (u < 0.12 || u > 0.88) { ends += eye[i + 1]; e++; } } return ends / e - mid / m; };
  assert.ok(bend('happy') > 0.04 && bend('calm') < -0.03, `bend: happy ${bend('happy')}, calm ${bend('calm')}`);
});

/** One eye of a face as drawn: its box in px at `size`, and how far its ends lean (the mean x of its top fifth less that of its bottom fifth, in px). */
function eyeLook(name, body, size, which) {
  const [eye] = eyeShapes(body, worn(name), size)[which], b = box([eye]), px = size / 2;
  let top = 0, t = 0, low = 0, l = 0, mid = 0, m = 0;
  for (let i = 0; i < eye.length; i += 2) {
    const v = (eye[i + 1] - b.y0) / b.h;
    if (v < 0.2) { top += eye[i]; t++; } else if (v > 0.8) { low += eye[i]; l++; } else if (v > 0.4 && v < 0.6) { mid += eye[i]; m++; }
  }
  return { w: b.w * px, h: b.h * px, cx: ((b.x0 + b.x1) / 2) * px, cy: ((b.y0 + b.y1) / 2) * px, lean: (top / t - low / l) * px, nose: (mid / m - (top / t + low / l) / 2) * px };
}

test('faces that were drawn alike are told apart at a glance, at 36 px too', () => {
  // Each pair below was one face under two names at 36 px. What tells them apart now is a difference of kind
  // (which way a shape points, a slit against an open eye, a lean), and each is at least a pixel and a half at 36 px.
  for (const body of [wedge, heart, capsule]) {
    for (const size of [120, 36]) {
      const at = `on ${body.id} at ${size}`, px = size / 36;
      const look = (name, which = 0) => eyeLook(name, body, size, which);
      // Happy is two arches, wider than tall. Laughing is the arches turned on their sides, "> <": each taller
      // than wide, with its point toward the nose and its two ends toward the outside.
      const happy = look('happy'), laughL = look('laughing', 0), laughR = look('laughing', 1);
      assert.ok(happy.w > happy.h * 1.2 && Math.abs(happy.nose) < 0.3 * px, `happy ${at}: ${happy.w} by ${happy.h}`);
      assert.ok(laughL.h > laughL.w * 0.95 && laughR.h > laughR.w * 0.95, `laughing ${at}: ${laughL.w} by ${laughL.h}`);
      assert.ok(laughL.nose > 1.8 * px && laughR.nose < -1.8 * px, `laughing ${at}: points ${laughL.nose} and ${laughR.nose}`);
      // Curious is two open eyes, one bigger. Inspecting is a slit and a wide-open eye. Confused is two eyes
      // leaning the same way.
      const cur = [look('curious', 0), look('curious', 1)], ins = [look('inspecting', 0), look('inspecting', 1)], con = [look('confused', 0), look('confused', 1)];
      assert.ok(cur[0].h > cur[0].w * 1.3 && cur[1].h > cur[1].w * 1.3 && cur[1].h > cur[0].h * 1.25, `curious ${at}`);
      assert.ok(ins[0].h < ins[0].w * 0.75 && ins[1].h > ins[1].w * 1.3 && ins[1].h > ins[0].h * 3, `inspecting ${at}: ${ins[0].w} by ${ins[0].h} and ${ins[1].w} by ${ins[1].h}`);
      assert.ok(cur[0].h - ins[0].h > 3 * px, `curious and inspecting ${at}: the narrowed eye is ${cur[0].h - ins[0].h} px shorter`);
      assert.ok(con[0].lean < -0.9 * px && con[1].lean < -0.6 * px && Math.abs(cur[0].lean) < 0.3 * px && Math.abs(cur[1].lean) < 0.3 * px, `confused ${at}: leans ${con[0].lean} and ${con[1].lean}`);
      // Attentive is plainly taller than neutral: a pixel and a half at 36 px, not one.
      assert.ok(look('attentive').h - look('neutral').h > 1.5 * px, `attentive ${at}: ${look('attentive').h - look('neutral').h} px taller`);
      // Proud is held high and lifts its outer ends; bored hangs low, droops, and is wider.
      const proud = look('proud'), bored = look('bored');
      assert.ok(bored.cy - proud.cy > 3 * px && bored.w > proud.w * 1.1 && proud.lean < -0.8 * px && bored.lean > 0.8 * px, `proud and bored ${at}: ${bored.cy - proud.cy} px apart, leaning ${proud.lean} and ${bored.lean}`);
      // Scared is tall and wide open with the tops leaning in together; shy is small and low.
      const scared = [look('scared', 0), look('scared', 1)];
      assert.ok(scared[0].lean > 0.8 * px && scared[1].lean < -0.8 * px && scared[0].h > look('neutral').h, `scared ${at}: leans ${scared[0].lean} and ${scared[1].lean}`);
    }
  }
});

test('one face eases into another over about 150 ms: it does not snap', () => {
  assert.equal(FACE_MS, 150);
  const rig = quiet();
  rig.setFace('surprised');
  assert.deepEqual(rig.state.face, FACES.neutral, 'nothing changes until it is stepped');
  const widths = [];
  // (The step goes on saying the picture changed after that: the face's manner, the head's own pose, is still coming on.)
  for (let t = 5; t <= 200; t += 5) { const changed = rig.step(5); if (t <= FACE_MS) assert.equal(changed, true); widths.push(rig.state.face.width); }
  const from = FACES.neutral.width, to = FACES.surprised.width;
  for (let i = 1; i < 30; i++) assert.ok(widths[i] >= widths[i - 1] && widths[i] <= to);
  assert.ok(widths[0] > from && widths[0] < from + (to - from) * 0.05, `first 5 ms: ${widths[0]}`);
  assert.ok(Math.abs(widths[14] - (from + to) / 2) < 0.02, `half way at 75 ms: ${widths[14]}`);
  assert.ok(widths[28] < to && widths[29] === to, 'it arrives at 150 ms, exactly');
  assert.deepEqual(rig.state.face, FACES.surprised);
  // A new face part way through starts from where the eyes are, not from the face that was asked for.
  rig.setFace('sleepy'); run(rig, 60, 5);
  const part = { ...rig.state.face };
  rig.setFace('angry'); rig.step(5);
  assert.ok(Math.abs(rig.state.face.height - part.height) < 0.03 && Math.abs(rig.state.face.width - part.width) < 0.03);
  settle(rig);
  assert.deepEqual(rig.state.face, FACES.angry);
  assert.notEqual(rig.state.face, FACES.angry, 'the rig never hands out (or changes) the shared face');
  assert.deepEqual(FACES.neutral, { width: 1, height: 1, round: 1, tilt: 0, lift: 0, arc: 0, uneven: 0, skew: 0, brow: 0, slant: 0, wink: 0 });
});

test('thinking: the eyes drift up and to one side and back, slowly, under a thoughtful face', () => {
  const rig = quiet();
  rig.setActivity('thinking');
  let up = 0, aside = 0, fastest = 0, last = { x: 0, y: 0 }, turned = 0, sides = new Set(), backs = 0, was = false;
  run(rig, 16000, 8, () => {
    const e = rig.state.eye;
    up = Math.max(up, e.y); aside = Math.max(aside, Math.abs(e.x));
    fastest = Math.max(fastest, Math.hypot(e.x - last.x, e.y - last.y) / 0.008);
    last = { ...e };
    turned = Math.max(turned, Math.abs(rig.state.pose.yaw));
    if (Math.abs(e.x) > 0.3) sides.add(Math.sign(e.x));
    const away = e.y > 0.5;
    if (was && !away) backs++;
    was = away;
    assert.ok(e.y > -0.01, 'never down');
  });
  assert.ok(up > 0.6 && up < 0.75 && aside > 0.35 && aside < 0.5, `up ${up}, aside ${aside}`);
  assert.ok(backs >= 3 && backs <= 5, `${backs} looks away and back in 16 s`);
  // Slow: a look crosses the face in about 100 ms (over 10 a second); this never moves a fifth as fast.
  assert.ok(fastest < 2.2, `fastest ${fastest} per second`);
  assert.ok(turned > deg(12) && turned < deg(22), `the body follows, to ${(turned * 180) / Math.PI} degrees`);
  assert.deepEqual(rig.state.face, ACTIVITY_FACES.thinking);
});

test('working: a focused face, eyes down, reading line after line, with a beat as each new line starts', () => {
  const rig = quiet();
  rig.setActivity('working');
  // (Start watching part way along a line.)
  run(rig, WORK_MS * 1.4, 6);
  let x0 = 0, x1 = 0, y0 = 0, y1 = -1, yaw = 0, right = 0, left = 0, fastRight = 0, fastLeft = 0, last = rig.state.eye.x, lines = 0, going = 1, beats = 0, low = false, shortest = 1;
  const LINES = 6;
  run(rig, LINES * WORK_MS, 6, () => {
    const s = rig.state, e = s.eye, dx = e.x - last;
    last = e.x;
    x0 = Math.min(x0, e.x); x1 = Math.max(x1, e.x); y0 = Math.min(y0, e.y); y1 = Math.max(y1, e.y);
    yaw = Math.max(yaw, Math.abs(s.pose.yaw));
    if (dx > 0) { right++; fastRight = Math.max(fastRight, dx); } else if (dx < 0) { left++; fastLeft = Math.max(fastLeft, -dx); }
    // A line is read left to right; the way back is one quick move.
    if (going > 0 && dx < -1e-4) { going = -1; lines++; } else if (going < 0 && dx > 1e-4) going = 1;
    // The beat: the body is knocked a little shorter once a line, and comes back.
    shortest = Math.min(shortest, s.stretch);
    if (s.stretch < 0.975 && !low) { low = true; beats++; } else if (s.stretch > 0.995) low = false;
    assert.ok(s.lift === 0 && s.pose.roll === 0);
  });
  // (The eyes follow where they are sent on a spring, so they turn a little short of the ends.)
  assert.ok(x1 > WORK_SWEEP * 0.85 && x1 <= WORK_SWEEP && Math.abs(x0 + x1) < 0.04 && WORK_SWEEP >= 0.35 && WORK_SWEEP <= 0.5, `a line runs from ${x0} to ${x1}`);
  assert.ok(y1 < -0.2 && y0 > -0.4, `eyes down: ${y0} to ${y1}`);
  assert.equal(lines, LINES, 'one line every WORK_MS');
  assert.ok(right > left * 2.2 && fastLeft > fastRight * 2.5 && WORK_READ > 0.7 && WORK_READ < 0.85, `reading: ${right} steps across at ${fastRight} at most, ${left} back at ${fastLeft}`);
  // The body goes with the eyes, far enough that the sweep shows on a small avatar, and never to a profile.
  assert.ok(yaw > deg(9) && yaw < deg(16) && WORK_FOLLOW <= 1, `the body turns ${(yaw * 180) / Math.PI} degrees each way`);
  assert.equal(beats, LINES, 'one beat a line');
  assert.ok(shortest > 0.94 && shortest < 0.97, `the beat: ${shortest}`);
  assert.deepEqual(rig.state.face, ACTIVITY_FACES.working);
});

test('waiting: an expectant face of its own, a slow rock from side to side with the eyes going first, and a nod now and then', () => {
  const rig = new Rig({ seed: 6, idle: false, blinks: false });
  rig.setActivity('waiting');
  run(rig, 1200);
  const nods = [], rolls = [], yaws = [], eyes = [];
  let down = false, deepest = 0;
  run(rig, 30000, 8, (t) => {
    const s = rig.state;
    assert.ok(s.eye.y === 0 && s.lift === 0, 'the eyes stay level and it stays on the ground');
    rolls.push(s.pose.roll); yaws.push(s.pose.yaw); eyes.push(s.eye.x);
    if (s.pose.pitch < deg(-1) && !down) { down = true; nods.push(t); }
    if (s.pose.pitch >= 0) down = false;
    deepest = Math.min(deepest, s.pose.pitch);
  });
  // It rocks: a few degrees each way, evenly, once every WAIT_ROCK_MS, turning a little toward the side it leans to.
  assert.ok(Math.abs(Math.max(...rolls) - WAIT_ROCK) < deg(0.05) && Math.abs(Math.min(...rolls) + WAIT_ROCK) < deg(0.05) && WAIT_ROCK >= deg(3.5) && WAIT_ROCK <= deg(5), `rocks ${Math.min(...rolls)} to ${Math.max(...rolls)}`);
  assert.ok(Math.abs(Math.max(...yaws) - WAIT_TURN) < deg(0.05) && Math.abs(Math.min(...yaws) + WAIT_TURN) < deg(0.05) && WAIT_TURN <= deg(8));
  const rises = (list) => list.flatMap((v, i) => (i > 0 && list[i - 1] <= 0 && v > 0 ? [i * 8] : []));
  const rocks = rises(rolls);
  assert.ok(Math.abs(rocks.length - 30000 / WAIT_ROCK_MS) <= 1 && WAIT_ROCK_MS >= 2200 && WAIT_ROCK_MS <= 3400, `${rocks.length} rocks in 30 s`);
  for (let i = 1; i < rocks.length; i++) assert.ok(Math.abs(rocks[i] - rocks[i - 1] - WAIT_ROCK_MS) <= 16, 'a steady rock');
  // Eyes, then the turn, then the lean. The eyes set off a fifth of a second or so before the body turns that
  // way, and the body turns a quarter of a rock before it leans that way. (Leaning to the viewer's left is a
  // positive roll; turning and looking left are a negative yaw and a negative x.)
  const glances = rises(eyes.map((x) => -x)), turns = rises(yaws.map((y) => -y));
  for (const at of turns.slice(1)) { const before = Math.max(...glances.filter((g) => g <= at)); assert.ok(at - before > 150 && at - before < 320, `the eyes go ${at - before} ms before the turn`); }
  for (const at of rocks.slice(1)) { const before = Math.max(...turns.filter((g) => g <= at)); assert.ok(Math.abs(at - before - WAIT_ROCK_MS / 4) <= 16, `the turn comes ${at - before} ms before the lean`); }
  // It is never a still picture: over any 200 ms something has moved.
  for (let i = 25; i < rolls.length; i++) {
    const moved = Math.abs(rolls[i] - rolls[i - 25]) / deg(1) + Math.abs(yaws[i] - yaws[i - 25]) / deg(1) + Math.abs(eyes[i] - eyes[i - 25]) * 10;
    assert.ok(moved > 0.4, `at ${i * 8} ms nothing has moved for 200 ms (${moved})`);
  }
  // And the nod, as before: small, now and then, at uneven gaps.
  assert.ok(nods.length >= 5 && nods.length <= 12, `${nods.length} nods in 30 s`);
  assert.ok(deepest < deg(-6) && deepest > deg(-8), `a small nod: ${(deepest * 180) / Math.PI} degrees`);
  const gaps = nods.slice(1).map((t, i) => t - nods[i]);
  assert.ok(Math.min(...gaps) > 2500 && Math.max(...gaps) < 6000 && new Set(gaps.map((g) => Math.round(g / 200))).size > 2, `gaps ${gaps}`);
  // A face of its own: not the neutral face a little taller (which is what it was), nor any face with a name.
  assert.deepEqual(rig.state.face, ACTIVITY_FACES.waiting);
  for (const name of LIST) assert.ok(!sameFace(ACTIVITY_FACES.waiting, FACES[name]), `waiting wears ${name}`);
  const [mine] = eyeShapes(wedge, { ...quiet().state, face: rig.state.face }, 22)[0], [plain] = eyeShapes(wedge, quiet().state, 22)[0];
  assert.ok((box([mine]).w - box([plain]).w) * 11 > 0.8 && (box([plain]).y0 - box([mine]).y0) * 11 > 0.8, `at 22 px its eyes are ${(box([mine]).w - box([plain]).w) * 11} px wider and ${(box([plain]).y0 - box([mine]).y0) * 11} px higher than the neutral face`);
  // It still follows a look: the rock goes on around where it looks.
  rig.look(0.5, 0);
  run(rig, 1500);
  let sum = 0, n = 0;
  run(rig, WAIT_ROCK_MS, 8, () => { sum += rig.state.pose.yaw; n++; });
  assert.ok(Math.abs(sum / n - 0.5 * LOOK_YAW) < deg(0.2), `looking: ${(sum / n) * 180 / Math.PI}`);
});

test('speaking: it bobs with each syllable, to the voice when a level comes and to a rhythm of its own when none does', () => {
  // No level at all (which is how the app runs it today): it talks anyway, a few syllables a second.
  const rig = quiet();
  rig.setActivity('speaking');
  const lifts = [];
  let peaks = 0, up = false, most = 0;
  run(rig, 8000, 8, () => {
    const s = rig.state;
    lifts.push(s.lift);
    most = Math.max(most, s.lift);
    if (s.lift > 0.012 && !up) { up = true; peaks++; } else if (s.lift < 0.006) up = false;
    // Up, taller and wider-eyed together, all by the same amount.
    const a = s.lift / SPEAK_LIFT;
    assert.ok(Math.abs(s.stretch - (1 + SPEAK_STRETCH * a)) < 1e-9 && Math.abs(s.lid - (1 + SPEAK_EYES * a)) < 1e-9 && s.pose.yaw === 0 && s.pose.pitch === 0);
  });
  assert.ok(peaks >= 24 && peaks <= 40, `${peaks} syllables in 8 s`);
  assert.ok(most > SPEAK_LIFT * SPEAK_FLOOR * 0.9 && most <= SPEAK_LIFT * SPEAK_FLOOR + 1e-9 && SPEAK_FLOOR >= 0.5, `its own syllables reach ${most}`);
  // It never goes dead: after it has got going, no half second passes without a bob.
  for (let i = 100; i + 62 < lifts.length; i++) {
    const span = lifts.slice(i, i + 62);
    assert.ok(Math.max(...span) - Math.min(...span) > 0.012, `dead for half a second at ${i * 8} ms`);
  }
  assert.ok(Math.min(...lifts.slice(100)) < 0.002, 'and between syllables it comes back down');

  // A voice: its own rhythm stops and the level drives it. Smoothly, without overshoot, and all the way at full level.
  rig.setLevel(0.03); run(rig, 1000);
  const quietly = rig.state.lift;
  assert.ok(Math.abs(quietly - SPEAK_LIFT * 0.03 ** SPEAK_GAIN) < 1e-4, `a murmur holds it at ${quietly}: no syllables of its own under a voice`);
  rig.setLevel(1);
  const rise = [];
  run(rig, 400, 8, () => rise.push(rig.state.lift));
  assert.ok(rise[0] > quietly && rise[0] < quietly + 0.01 && rise.every((l, i) => i === 0 || l >= rise[i - 1]), 'it rises smoothly, without overshoot');
  assert.ok(rise[9] > SPEAK_LIFT * 0.75 && Math.abs(rise.at(-1) - SPEAK_LIFT) < 0.001, `full level: ${rise.at(-1)}`);
  assert.ok(Math.abs(rig.state.stretch - 1 - SPEAK_STRETCH) < 0.001 && Math.abs(rig.state.lid - 1 - SPEAK_EYES) < 0.002);
  // A quiet voice moves it more than its share: a fifth of the level is well over a third of the bob.
  rig.setLevel(0.2); run(rig, 500);
  assert.ok(Math.abs(rig.state.lift - SPEAK_LIFT * 0.2 ** SPEAK_GAIN) < 1e-4 && rig.state.lift > SPEAK_LIFT * 0.36 && SPEAK_GAIN < 0.75);
  // Out of range or not a number: clamped.
  rig.setLevel(7); run(rig, 500); assert.ok(Math.abs(rig.state.lift - SPEAK_LIFT) < 0.001);
  rig.setLevel(NaN); run(rig, 300); assert.ok(rig.state.lift < 0.001, 'a gap between words is a rest, not chatter');
  rig.setLevel(-3); run(rig, 100); assert.ok(rig.state.lift < 0.001);
  // But a long silence is not left dead: after SPEAK_QUIET_MS its own rhythm is back.
  let again = 0;
  run(rig, SPEAK_QUIET_MS + 900, 8, () => { again = Math.max(again, rig.state.lift); });
  assert.ok(again > SPEAK_LIFT * SPEAK_FLOOR * 0.5 && SPEAK_QUIET_MS >= 400 && SPEAK_QUIET_MS <= 1200, `after a silence: ${again}`);
  // When it stops in the middle of a word it comes down and stays down: no last syllable of its own on the way out.
  rig.setLevel(1); run(rig, 1500);
  rig.setActivity('idle');
  let was = rig.state.lift;
  run(rig, 700, 8, () => { assert.ok(rig.state.lift <= was + 1e-6, 'a bob after it stopped speaking'); was = rig.state.lift; });
  assert.ok(was < 1e-4);
  // The level only moves it while it is speaking, and when it stops it is back exactly.
  rig.setLevel(1); rig.step(8);
  assert.ok(settle(rig) < 2500);
  assert.equal(rig.state.lift, 0);
  assert.equal(rig.state.lid, 1);
  assert.equal(snap(rig), REST);
});

test('left idle it breathes: a little taller and back, slowly, redrawn sixteen times a second and not sixty', () => {
  const rig = new Rig({ seed: 2, blinks: false });
  rig.look(0, 0);
  const tall = [];
  let changed = 0;
  for (let t = 4; t <= BREATH_MS; t += 4) { if (rig.step(4)) changed++; tall.push(rig.state.stretch); }
  assert.ok(Math.abs(Math.max(...tall) - (1 + BREATH)) < 1e-4 && Math.abs(tall.indexOf(Math.max(...tall)) * 4 - BREATH_MS / 2) < 80, `in to ${Math.max(...tall)}`);
  assert.ok(tall.every((s) => s >= 1) && tall.at(-1) < 1.00005 && BREATH >= 0.01 && BREATH <= 0.02 && BREATH_MS >= 3000 && BREATH_MS <= 6000, 'and out again');
  // Too slow to see a step in: under a twentieth of a pixel at 120 px.
  for (let i = 1; i < tall.length; i++) assert.ok(Math.abs(tall[i] - tall[i - 1]) * 120 < 0.1);
  assert.ok(changed > 40 && changed <= BREATH_MS / 60 + 1, `${changed} redraws in one breath of ${BREATH_MS} ms`);
  // Nothing else moves, and it stands on its base: the body is taller, its foot where it was.
  assert.deepEqual(rig.state.pose, { yaw: 0, pitch: 0, roll: 0 });
  const calm = new Rig({ seed: 2, blinks: false }); calm.look(0, 0);
  run(calm, BREATH_MS / 2, 4);
  const full = box(bodyShapes(wedge, calm.state, 240)), rest = box(bodyShapes(wedge, quiet().state, 240));
  assert.ok(Math.abs(full.y1 - rest.y1) < 1e-9 && (rest.y0 - full.y0) * 120 > 2.5 && (rest.y0 - full.y0) * 120 < 4.5, `a breath lifts the top ${(rest.y0 - full.y0) * 120} px at 240 px`);
  // With idle off there is no breath: a rig left alone is still (the picker's stills, and the tests, rely on it).
  const off = quiet();
  for (let i = 0; i < 500; i++) assert.equal(off.step(16), false);
});

test('when an activity ends the avatar is back at its idle face and pose, exactly', () => {
  for (const kind of ACTIVITIES) {
    for (const form of [undefined, ...FORMS]) {
      for (const after of [900, 2600]) {
        const rig = quiet();
        rig.setFace('happy'); settle(rig);
        const idle = snap(rig);
        rig.setActivity(kind, form);
        rig.setLevel(0.8); rig.setProgress(0.6);
        run(rig, after);
        if (kind !== 'idle') assert.notEqual(snap(rig), idle, `${kind} does something`);
        rig.setActivity('idle');
        rig.step(8);
        const took = settle(rig, 4000);
        assert.ok(took < 2500, `${kind} ${form}: back in ${took} ms`);
        assert.equal(snap(rig), idle, `${kind} ${form} after ${after} ms`);
        assert.equal(rig.step(16), false);
      }
    }
  }
  // Setting the same activity again is nothing: it does not start over.
  const a = quiet(), b = quiet();
  a.setActivity('thinking'); b.setActivity('thinking');
  for (let i = 0; i < 400; i++) { a.step(8); b.step(8); if (i % 20 === 0) b.setActivity('thinking'); }
  assert.equal(snap(a), snap(b));
  // An activity the rig does not know is idle.
  a.setActivity('dancing'); settle(a);
  assert.equal(snap(a), REST);
  // A look given while it thinks is kept, and taken up when it stops.
  const c = quiet(); c.setActivity('thinking'); c.look(-1, 0); run(c, 1000); c.setActivity('idle'); settle(c);
  assert.ok(Math.abs(c.state.pose.yaw + LOOK_YAW) < 1e-6);
});

test('in every activity the motion stays small enough for a 22 px avatar', () => {
  for (const kind of ACTIVITIES) {
    const rig = new Rig({ seed: 11 });
    rig.setActivity(kind);
    let fastest = 0, last = null;
    // (A voice that jumps about as wildly as a level can, but the same one every run.)
    const wild = random(77);
    run(rig, 12000, 33, () => {
      if (kind === 'speaking') rig.setLevel(wild());
      const s = rig.state;
      assert.ok(Math.abs(s.pose.yaw) <= deg(22.5) && Math.abs(s.pose.pitch) <= deg(12) && Math.abs(s.pose.roll) <= deg(5), `${kind}: ${JSON.stringify(s.pose)}`);
      // (Up to a tenth taller: a full syllable on top of a breath. It was 6%, which is under a pixel and a half at 22 px.)
      assert.ok(s.lift <= 0.09 && s.stretch >= 0.93 && s.stretch <= 1.1 && s.scale === 1, `${kind}: up ${s.lift}, tall ${s.stretch}`);
      // Both eyes stay drawn (a blink aside, they keep their size).
      const eyes = eyeShapes(wedge, s, 22);
      assert.ok(eyes[0].length === 1 && eyes[1].length === 1, `${kind}: an eye lost at 22 px`);
      // From one 33 ms frame to the next the body's outline moves under a pixel and a half.
      const b = box(bodyShapes(wedge, s, 22));
      if (last) fastest = Math.max(fastest, Math.abs(b.x0 - last.x0), Math.abs(b.x1 - last.x1), Math.abs(b.y0 - last.y0), Math.abs(b.y1 - last.y1));
      last = b;
    });
    assert.ok(fastest * 11 < 1.5, `${kind}: ${fastest * 11} px in one frame`);
  }
});

/** What shows of a state on a 22 px avatar, in px: where the eyes are, how tall one is, and the body's left, right and top. */
function shown(body, s) {
  const eyes = eyeShapes(body, s, 22), b = box(bodyShapes(body, s, 22)), e = box([...eyes[0], ...eyes[1]]), one = box(eyes[0]);
  return [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, one.h, b.x0, b.x1, b.y0].map((v) => v * 11);
}
/** How far the thing that moves most travels over some frames, in px. */
const travel = (frames) => Math.max(...frames[0].map((_, k) => Math.max(...frames.map((f) => f[k])) - Math.min(...frames.map((f) => f[k]))));

test('working, waiting and speaking each move enough to see on a 22 px avatar, and none is ever a still picture', () => {
  for (const body of [wedge, heart]) {
    const reach = {};
    for (const kind of ['idle', 'working', 'waiting', 'speaking']) {
      // No blinks, no breath and no idle drift here: what moves is the activity's own motion.
      const rig = new Rig({ seed: 9, idle: false, blinks: false });
      rig.setActivity(kind);
      run(rig, 1500);
      const frames = [];
      run(rig, 9000, 30, () => frames.push(shown(body, rig.state)));
      reach[kind] = travel(frames);
      if (kind === 'idle') continue;
      // Something travels a pixel and a half or more: the eyes across the face, or the top of the body.
      assert.ok(reach[kind] > 1.5, `${kind} on the ${body.id}: nothing moves more than ${reach[kind]} px`);
      // And it never stops: in any 420 ms something has moved a fifth of a pixel. (Waiting used to hold one
      // picture for over a second, and speaking went dead for most of one.)
      for (let i = 14; i < frames.length; i++) {
        const moved = travel(frames.slice(i - 14, i + 1));
        assert.ok(moved > 0.2, `${kind} on the ${body.id}: still for 420 ms at ${i * 30} ms (${moved} px)`);
      }
    }
    assert.equal(reach.idle, 0, 'and with nothing to do, and its idle motion off, it is still');
  }
});

test('with a form the body turns into a loading figure and back, by the same morph, with the eyes as dots or hidden', () => {
  for (const form of FORMS) {
    for (const body of [wedge, heart]) {
      const rig = quiet({ body });
      const kind = form === 'progress' ? 'working' : 'thinking';
      rig.setActivity(kind, form);
      rig.setProgress(0.5);
      run(rig, FIGURE_AFTER - 8);
      assert.equal(rig.state.figure, null, 'not yet');
      let last = null;
      const rest = box(bodyShapes(body, rig.state, 120));
      run(rig, FIGURE_MS + 16, 4, (t) => {
        const s = rig.state, polys = bodyShapes(body, s, 120);
        if (!s.figure) return;
        for (const p of polys) assert.equal(crosses(p), false, `${form} at ${t}: crosses itself`);
        // It starts from the body as it was: the first frame of the figure fills the same box.
        if (!last) { const b = box([polys[0]]); assert.ok(Math.abs(b.w - rest.w) < 0.03 && Math.abs(b.h - rest.h) < 0.03, `${form}: starts from the body`); }
        // No pop: the outline moves a little each frame.
        if (last) {
          let most = 0;
          for (let i = 0; i < last.length; i += 2) most = Math.max(most, Math.hypot(polys[0][i] - last[i], polys[0][i + 1] - last[i + 1]));
          // (The spinner's comet is turning as it forms, and its round head passes a ray in two frames: that is motion, not a pop.)
          // (The dots draw the body in furthest, to a small middle dot, so their outline moves furthest in a frame.)
          assert.ok(most < (form === 'ring' ? 0.09 : form === 'dots' ? 0.08 : 0.05), `${form} at ${t}: a point moved ${most}`);
        }
        last = polys[0];
      });
      const s = rig.state;
      assert.ok(s.figure && s.figure.form === form && s.figure.k === 1, `${form} is up`);
      const polys = bodyShapes(body, s, 120), disc = box([polys[0]]), eyes = eyeShapes(body, s, 120), R = figureRadius(form);
      // The body is now a disc. (The spinner's is drawn in to the shape of its comet: see below.)
      if (form !== 'ring') assert.ok(Math.abs(disc.w / 2 - R) < 0.01 && Math.abs(disc.h / 2 - R) < 0.01 && Math.abs(Math.abs(area(polys[0])) - Math.PI * R * R) < 0.02, `${form}: a disc of ${R}`);
      if (form === 'ring') {
        // A comet: a hole wound the other way, a thick round head, a tail that thins to nothing, and then a
        // gap. In the gap the outline and the hole are the same line, so nothing at all is drawn there: no
        // track. That is what tells the spinner from a progress ring in one frame.
        assert.equal(polys.length, 2);
        assert.ok(area(polys[0]) * area(polys[1]) < 0 && s.eyeScale === 0 && eyes[0].length === 0 && eyes[1].length === 0);
        const n = polys[0].length / 2, thick = [];
        for (let i = 0; i < n; i++) { const j = (n - i) % n; thick.push(Math.hypot(polys[0][i * 2], polys[0][i * 2 + 1]) - Math.hypot(polys[1][j * 2], polys[1][j * 2 + 1])); }
        assert.ok(thick.every((t) => t >= 0) && Math.abs(Math.max(...thick) - 0.3) < 0.01 && Math.hypot(disc.w, disc.h) / 2 < R * Math.SQRT2 + 1e-9, `${form}: thickest ${Math.max(...thick)}`);
        const open = thick.filter((t) => t === 0).length / n;
        assert.ok(open > 0.25 && open < 1 - COMET && COMET > 0.55 && COMET < 0.75, `${form}: ${open} of the round is open`);
        // One comet: going round from its head, thickness only ever falls until the gap.
        const head = thick.indexOf(Math.max(...thick));
        let run = 0;
        for (let k = 1; k < n; k++) { if (thick[(head - k + n) % n] > thick[(head - k + 1 + n) % n] + 1e-9) break; run++; }
        assert.ok(run >= n * 0.9, `${form}: the tail thins steadily (${run} of ${n} rays)`);
        const ink = Math.abs(area(polys[0])) - Math.abs(area(polys[1]));
        assert.ok(ink > 0.4 && ink < 0.6, `${form}: ${ink} of comet`);
      } else if (form === 'progress') {
        // A hole, wound the other way so it is cut out; no eyes.
        assert.equal(polys.length, 2);
        assert.ok(area(polys[0]) * area(polys[1]) < 0 && Math.abs(area(polys[1])) > 1.2 && box([polys[1]]).w < disc.w);
        assert.ok(s.eyeScale === 0 && eyes[0].length === 0 && eyes[1].length === 0);
      } else if (form === 'orbit') {
        // A small ball circling it, and the eyes still there as dots.
        assert.equal(polys.length, 2);
        const ball = box([polys[1]]), cx = (ball.x0 + ball.x1) / 2, cy = (ball.y0 + ball.y1) / 2;
        assert.ok(area(polys[0]) * area(polys[1]) > 0 && Math.abs(ball.w / 2 - ORBIT.r) < 0.01 && Math.abs(Math.hypot(cx, cy) - ORBIT.at) < 0.01);
        assert.ok(s.dot === 1 && eyes[0].length === 1 && eyes[1].length === 1);
        for (const [eye] of eyes) for (let i = 0; i < eye.length; i += 2) assert.ok(Math.hypot(eye[i], eye[i + 1]) < R, 'a dot off the ball');
      } else if (form === 'dots') {
        // Three dots in a row: the body as the middle one (with its pulse), one each side, level with it. No eyes.
        assert.equal(polys.length, 4);
        const sides = [box([polys[2]]), box([polys[3]])];
        for (const b of sides) assert.ok(Math.abs((b.y0 + b.y1) / 2) < 1e-9 && b.w / 2 > DOTS.r * 0.99 && b.w / 2 < DOTS.r * (1 + DOTS.peak) + 0.01, `${form}: a side dot ${b.w} across`);
        assert.ok(Math.abs((sides[0].x0 + sides[0].x1) / 2 + DOTS.at) < 1e-9 && Math.abs((sides[1].x0 + sides[1].x1) / 2 - DOTS.at) < 1e-9);
        assert.ok(s.eyeScale === 0 && eyes[0].length === 0 && eyes[1].length === 0);
      } else {
        // Radar: the sweep and its ring are marks in the eye colour, inside the disc. The face stays: two
        // dots on the scope, in the same path and wound against the sweep, so a dot the sweep is passing
        // over shows through it in the body's colour.
        assert.equal(polys.length, 1);
        assert.ok(s.dot === 1 && s.eyeScale === 1 && eyes[0].length === 5 && eyes[1].length === 0);
        for (const mark of eyes[0]) for (let i = 0; i < mark.length; i += 2) assert.ok(Math.hypot(mark[i], mark[i + 1]) < R - 0.1);
        const sweep = eyes[0][4];
        for (const dot of eyes[0].slice(0, 2)) {
          const b = box([dot]);
          assert.ok(b.w / b.h > 0.8 && b.w / b.h < 1.25 && b.w < 0.25 && area(dot) * area(sweep) < 0, `${form}: a dot ${b.w} by ${b.h}`);
        }
        assert.ok(box([eyes[0][0]]).x1 < box([eyes[0][1]]).x0, 'the left dot and the right dot');
      }
      // It turns (a progress ring fills instead).
      const turn = s.figure.turn;
      run(rig, 200);
      if (form === 'progress') assert.equal(rig.state.figure.turn, 0); else assert.ok(rig.state.figure.turn !== turn);
      // It comes back: by itself after the hold (a progress ring stays), or at once when the form is dropped.
      run(rig, FIGURE_HOLD - FIGURE_MS - 216 - 8 + FIGURE_MS + 30);
      if (form === 'progress') {
        assert.equal(rig.state.figure.k, 1, 'the progress ring stays');
        rig.setActivity(kind);
        run(rig, FIGURE_MS + 30);
      }
      assert.equal(rig.state.figure, null, `${form}: back as a body`);
      assert.ok(rig.state.lid < 1, 'and it blinks');
      assert.deepEqual(bodyShapes(body, rig.state, 120).length, body.pieces.length);
      if (form !== 'progress') {
        // And up again after a rest with its face showing.
        run(rig, FIGURE_REST - FIGURE_MS - 60);
        assert.equal(rig.state.figure, null);
        run(rig, FIGURE_MS + 80);
        assert.equal(rig.state.figure?.k, 1, `${form}: up again`);
      }
    }
  }
  // Only thinking and working take a form.
  for (const kind of ['idle', 'waiting', 'speaking']) {
    const rig = quiet(); rig.setActivity(kind, 'ring'); run(rig, 2000);
    assert.equal(rig.state.figure, null, kind);
  }
});

test('a loading figure holds its shape: no breath and no working beat while the body is a ring', () => {
  // (A rig with its idle motion on, so it breathes.)
  const rig = new Rig({ seed: 3, blinks: false, body: wedge });
  rig.look(0, 0);
  run(rig, 1000);
  assert.ok(rig.state.stretch > 1.001, 'it is breathing');
  rig.setActivity('working', 'progress');
  run(rig, FIGURE_AFTER + FIGURE_MS + 100);
  assert.equal(rig.state.figure?.k, 1);
  run(rig, 3 * WORK_MS, 8, () => assert.equal(rig.state.stretch, 1, 'a ring that is not round'));
  const ring = box(bodyShapes(wedge, rig.state, 120));
  assert.ok(Math.abs(ring.w - ring.h) < 1e-9);
  // Back as a body it reads on, with its beat, and breathes.
  rig.setActivity('working');
  let low = 1, high = 1;
  run(rig, FIGURE_MS + 2 * WORK_MS, 8, () => { low = Math.min(low, rig.state.stretch); high = Math.max(high, rig.state.stretch); });
  assert.ok(low < 0.975 && high > 1.005, `back as a body: ${low} to ${high}`);
});

test('the progress ring fills to the progress it is given, clockwise from the top', () => {
  const filled = (p) => {
    const rig = quiet({ body: capsule });
    rig.setActivity('working', 'progress'); rig.setProgress(p);
    run(rig, 2500);
    assert.ok(Math.abs(rig.state.figure.progress - Math.max(0, Math.min(1, p))) < 1e-9);
    const [disc, hole] = bodyShapes(capsule, rig.state, 180);
    // Thickness of the ring along each of twelve directions, clockwise from the top.
    const thick = [];
    for (let h = 0; h < 12; h++) {
      const a = -Math.PI / 2 + ((h + 0.5) * 2 * Math.PI) / 12;
      let r = 0; while (inside(hole, r * Math.cos(a), r * Math.sin(a)) && r < 1) r += 0.005;
      thick.push(figureRadius('progress') - r);
    }
    return { ink: Math.abs(area(disc)) - Math.abs(area(hole)), thick };
  };
  const steps = [0, 0.25, 0.5, 0.75, 1].map(filled);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].ink > steps[i - 1].ink + 0.2, `more ring at ${i * 25}%`);
  assert.ok(steps[0].thick.every((t) => t > 0.05 && t < 0.12), 'at 0 it is a thin track');
  assert.ok(steps[4].thick.every((t) => t > 0.27), 'at 1 it is thick all round');
  const half = steps[2].thick;
  assert.ok(half.slice(0, 5).every((t) => t > 0.27) && half.slice(7).every((t) => t < 0.12), `half: ${half.map((t) => t.toFixed(2))}`);
  assert.equal(filled(9).ink, steps[4].ink);
  // It grows smoothly when the progress jumps.
  const rig = quiet(); rig.setActivity('working', 'progress'); run(rig, 1500); rig.setProgress(1);
  const seen = []; run(rig, 400, 8, () => seen.push(rig.state.figure.progress));
  assert.ok(seen[0] < 0.01 && seen.every((p, i) => i === 0 || p >= seen[i - 1]) && seen.at(-1) > 0.9 && seen.at(-1) <= 1);
});

test('pause freezes everything where it is, and it resumes without a jump', () => {
  const film = (pauseAt) => {
    const rig = new Rig({ seed: 21, body: wedge });
    const frames = [];
    let active = 0;
    for (let i = 0; i < 700; i++) {
      if (active === 40) rig.poke('hop');
      if (active === 90) rig.setBody(heart);
      if (active === 150) rig.setActivity('thinking', 'orbit');
      if (active === 330) { rig.setActivity('idle'); rig.setFace('laughing'); rig.look(0.6, 0.2); }
      if (pauseAt.includes(i)) {
        rig.pause(true);
        const held = snap(rig);
        for (let k = 0; k < 50; k++) { assert.equal(rig.step(16), false, 'paused: nothing changes'); assert.equal(snap(rig), held); }
        rig.pause(false);
      }
      rig.step(16);
      active++;
      frames.push(snap(rig));
    }
    return frames;
  };
  // Paused in a hop, in a morph, as a figure, mid-ease: the frames after are the frames it would have had.
  assert.deepEqual(film([45, 60, 96, 110, 200, 336]), film([]));
  const rig = quiet(); rig.pause(); rig.poke('nod');
  assert.equal(rig.step(100), false);
  rig.pause(false);
  assert.equal(rig.step(16), true);
});

test('mirror flips left and right, still looks where it was told to, and flips back exactly', () => {
  const rig = quiet({ body: cloud });
  const plain = bodyShapes(cloud, rig.state, 180), was = box(plain);
  let lopsided = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const x = (i + 0.5) / 40 * 1.2, y = -1.2 + (j + 0.5) / 40 * 2.4; if (within(plain, x, y) !== within(plain, -x, y)) lopsided++; }
  assert.ok(lopsided > 10, 'the cloud is not its own mirror image');
  rig.mirror(true);
  const flips = [];
  let t = 0;
  while (!rig.still) { rig.step(4); t += 4; flips.push(rig.state.flip); }
  assert.ok(t >= FLIP_MS && t <= FLIP_MS + 4 && FLIP_MS <= 300, `the flip takes ${t} ms`);
  assert.ok(flips.every((f, i) => i === 0 || f <= flips[i - 1]) && flips.at(-1) === -1, 'it eases over, it does not snap');
  const flipped = bodyShapes(cloud, rig.state, 180), now = box(flipped);
  assert.ok(Math.abs(now.x0 + was.x1) < 1e-9 && Math.abs(now.x1 + was.x0) < 1e-9 && Math.abs(now.y0 - was.y0) < 1e-12);
  for (let i = 0; i < plain.length; i++) for (let k = 0; k < plain[i].length; k += 2) assert.ok(Math.abs(flipped[i][k] + plain[i][k]) < 1e-12);
  // Told to look right, it looks right as drawn, mirrored or not.
  const lookRight = (mirrored) => {
    const r = quiet({ body: wedge }); if (mirrored) r.mirror(true); r.look(1, 0); settle(r);
    const eyes = eyeShapes(wedge, r.state, 180), b = box(bodyShapes(wedge, r.state, 180));
    return { eyes: xs([...eyes[0], ...eyes[1]]).reduce((a, v) => a + v, 0), lean: b.x0 + b.x1, left: eyes[0].length ? box(eyes[0]).x0 : null, right: eyes[1].length ? box(eyes[1]).x0 : null };
  };
  const a = lookRight(false), b = lookRight(true);
  assert.ok(a.eyes > 0 && b.eyes > 0, 'the eyes are on the right either way');
  assert.ok(Math.abs(a.eyes - b.eyes) < 0.02 * a.eyes && Math.abs(a.lean - b.lean) < 1e-3, `a symmetric body looks the same mirrored: ${JSON.stringify([a, b])}`);
  // The viewer's left eye is still the first of the two.
  const m = quiet({ body: heart }); m.mirror(true); settle(m);
  const eyes = eyeShapes(heart, m.state, 180);
  assert.ok(box(eyes[0]).x1 < 0 && box(eyes[1]).x0 > 0);
  // A mirrored face is mirrored too: the bigger eye changes sides.
  m.setFace('inspecting'); settle(m);
  const [l, r] = eyeShapes(heart, m.state, 180).map(total);
  assert.ok(l > r * 1.5);
  rig.mirror(false); settle(rig);
  assert.equal(snap(rig), snap(quiet({ body: cloud })));
  rig.mirror(false);
  assert.equal(rig.step(16), false);
});

test('emphasis is a short pop: a quick scale-up, a settle, and exactly back', () => {
  const pop = (amount) => {
    const rig = quiet({ body: wedge });
    if (amount === undefined) rig.emphasis(); else rig.emphasis(amount);
    const scales = [];
    let t = 0;
    while (!rig.still && t < 2000) { rig.step(4); t += 4; scales.push(rig.state.scale); }
    assert.equal(snap(rig), snap(quiet({ body: wedge })));
    return { scales, t };
  };
  const one = pop();
  const peak = Math.max(...one.scales), at = one.scales.indexOf(peak) * 4;
  assert.ok(one.t <= POP_MS + 4 && POP_MS <= 450, `over in ${one.t} ms`);
  assert.ok(Math.abs(peak - (1 + POP)) < 0.002 && at > 60 && at < 160, `up to ${peak} at ${at} ms`);
  assert.ok(Math.min(...one.scales) < 0.985 && Math.min(...one.scales) > 0.95, 'it settles from a little under');
  assert.ok(one.scales[0] < 1.01, 'it eases in');
  // The drawing really is bigger, about its middle.
  const rig = quiet(); rig.emphasis(); run(rig, at, 4);
  const big = box(bodyShapes(wedge, rig.state, 180)), rest = box(bodyShapes(wedge, quiet().state, 180));
  assert.ok(Math.abs(big.w / rest.w - peak) < 0.005 && Math.abs(big.h / rest.h - peak) < 0.005);
  // The amount scales it; nothing or less is no pop; a huge one is capped.
  assert.ok(Math.abs(Math.max(...pop(0.5).scales) - (1 + POP / 2)) < 0.002);
  assert.equal(pop(0).scales.length, 0);
  assert.equal(pop(-1).scales.length, 0);
  assert.ok(Math.max(...pop(50).scales) <= 1 + 2 * POP + 1e-9);
});

test('the same seed and the same calls give the same frames, whatever is going on', () => {
  const film = (seed) => {
    const rig = new Rig({ seed, body: wedge });
    const frames = [];
    for (let i = 0; i < 1500; i++) {
      if (i === 60) rig.poke();
      if (i === 100) rig.poke();
      if (i === 140) rig.poke();
      if (i === 200) rig.setBody(heart);
      if (i === 260) rig.setFace('curious');
      if (i === 300) rig.setActivity('thinking', 'radar');
      if (i === 700) rig.setActivity('waiting');
      if (i === 1000) { rig.setActivity('speaking'); rig.setLevel(0.7); }
      if (i === 1100) { rig.mirror(true); rig.emphasis(); }
      if (i === 1200) { rig.setActivity('idle'); rig.look(-0.4, 0.5); }
      rig.step(i % 5 === 0 ? 33.4 : 16.7);
      if (i % 4 === 0) frames.push(JSON.stringify(drawAvatar(wedge, 'orange', rig.state, 120)));
    }
    return frames;
  };
  const a = film(5), b = film(5), c = film(6);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(new Set(a).size > 200, `and the frames do move (${new Set(a).size} different ones of ${a.length})`);
  // Every frame is three paths of plain numbers.
  for (const f of a) { const d = JSON.parse(f); assert.match(d.body, /^(M[-\d. ]+(L[-\d. ]+)+Z)+$/); for (const e of d.eyes) assert.match(e, /^(M[-\d. ]+(L[-\d. ]+)+Z)*$/); }
});

test('a rig at rest does not change the picture: nothing here makes a still avatar tick', () => {
  const rig = quiet({ body: heart });
  rig.poke(); rig.setBody(star); rig.setFace('proud'); rig.emphasis(); rig.mirror(true); rig.setActivity('working', 'ring');
  run(rig, 1200);
  rig.setActivity('idle'); rig.mirror(false);
  settle(rig);
  for (let i = 0; i < 2000; i++) assert.equal(rig.step(16), false);
  // The same picture as a rig that was only ever given the face (its manner included: proud holds its head up).
  const proud = quiet({ body: star }); proud.setFace('proud'); settle(proud);
  assert.deepEqual(drawAvatar(heart, 'orange', rig.state, 120), drawAvatar(star, 'orange', proud.state, 120));
});

test('a second change of shape early in the first keeps the eyes on the body they are on', () => {
  // A 96 px preview, looking fully aside, and two picks in quick succession.
  const SIZE = 96, PX = 2 / SIZE;
  /** How far outside the drawn outline the worst eye point is, in px. */
  const outside = (rig) => {
    const outline = bodyShapes(heart, rig.state, SIZE);
    let worst = 0;
    for (const eye of eyeShapes(heart, rig.state, SIZE)) for (const p of eye) for (let i = 0; i < p.length; i += 2) {
      if (outline.some((o) => inside(o, p[i], p[i + 1]))) continue;
      let near = Infinity;
      for (const o of outline) for (let a = 0; a < o.length; a += 2) {
        const b = (a + 2) % o.length, ex = o[b] - o[a], ey = o[b + 1] - o[a + 1];
        const t = Math.max(0, Math.min(1, ((p[i] - o[a]) * ex + (p[i + 1] - o[a + 1]) * ey) / (ex * ex + ey * ey || 1)));
        near = Math.min(near, Math.hypot(p[i] - o[a] - t * ex, p[i + 1] - o[a + 1] - t * ey));
      }
      worst = Math.max(worst, near / PX);
    }
    return worst;
  };
  const looking = () => { const rig = quiet({ body: heart }); rig.look(1, -1); settle(rig); return rig; };
  // One change, for comparison: the eyes never leave the outline.
  const once = looking();
  once.setBody(wedge);
  let worst = 0;
  run(once, CHANGE_MS, 16, () => { worst = Math.max(worst, outside(once)); });
  assert.ok(worst < 0.5, `one change: an eye point ${worst} px outside`);
  // A second change 48 ms into the first (before half way), and one 128 ms in.
  for (const gap of [48, 128]) {
    const rig = looking();
    rig.setBody(wedge);
    run(rig, gap, 16);
    assert.ok(rig.state.morph.k < 0.5);
    rig.setBody(heart);
    // The eyes were on the heart and still are: the morph it starts from wears the heart.
    assert.equal(rig.state.morph.from.wears, heart);
    worst = 0;
    run(rig, CHANGE_MS, 16, (t) => { const o = outside(rig); assert.ok(o < 0.5, `${gap} ms gap, ${t} ms after the second change: an eye point ${o} px outside`); });
  }
  // Past half way the eyes had moved to the new body, and the morph says so.
  const late = looking();
  late.setBody(wedge);
  run(late, 240, 16);
  assert.ok(late.state.morph.k > 0.5);
  late.setBody(heart);
  assert.equal(late.state.morph.from.wears, wedge);
});

test('on a 22 px avatar the progress ring is a ring you can see: a track two pixels wide, and the done part plainly thicker', () => {
  for (const [size, track, done] of [[22, 2, 3.7], [36, 2, 5.3], [120, 4.7, 17.9]]) {
    const px = 2 / size, R = figureRadius('progress');
    const [hole] = figureParts({ form: 'progress', k: 1, turn: 0, progress: 0.4 }, 64, px).body;
    // How thick the ring is at each of the hole's points, in drawn pixels.
    const thick = Array.from({ length: hole.length / 2 }, (_, i) => (R - Math.hypot(hole[i * 2], hole[i * 2 + 1])) / px);
    const least = Math.min(...thick), most = Math.max(...thick);
    assert.ok(least >= track - 0.05 && least <= track + 0.3, `at ${size} px the track is ${least} px wide`);
    assert.ok(most >= done - 0.1 && most >= 1.85 * least, `at ${size} px the done part is ${most} px against a track of ${least}`);
    // And it is still a ring: the hole is most of it.
    assert.ok(most * px < R * 0.45, `at ${size} px the ring is ${most * px} of ${R} thick`);
  }
});

test('waiting at a full look, the rock leans but does not turn the body further: a ball keeps both eyes in every frame', () => {
  // Straight across, and up and across: the waiting face lifts the eyes, and with the look up and across as
  // far as each axis went by itself (1, 1 and 1, 0.8: the corner) a blob or a teardrop lost its far eye in
  // half the frames. A look is no longer than 1 now, so those are full looks along the diagonal.
  for (const body of [BODIES.blob, BODIES.teardrop, BODIES.pebble]) {
    for (const [x, y] of [[1, 0], [-1, 0], [1, 1], [1, 0.8], [-1, 1], [-1, 0.8], [0.8, 1], [1, -1], [-1, -1], [0.9, 0.4359], [-0.9, 0.4359]]) {
      const rig = quiet({ body });
      rig.setActivity('waiting');
      rig.look(x, y);
      run(rig, 3000, 16);
      const most = (body.look ?? 1) * LOOK_YAW;
      let frames = 0, rolled = 0;
      run(rig, 9000, 16, () => {
        frames++;
        assert.ok(Math.abs(rig.state.pose.yaw) <= most + deg(0.5), `${body.id}: turned ${(rig.state.pose.yaw * 180) / Math.PI} degrees`);
        rolled = Math.max(rolled, Math.abs(rig.state.pose.roll));
        for (const px of [64, 72]) {
          const [left, right] = eyeShapes(body, rig.state, px);
          assert.ok(left.length && right.length, `${body.id} at ${px} px looking ${x}, ${y}: an eye is gone in frame ${frames}`);
        }
      });
      // It still rocks.
      assert.ok(rolled > WAIT_ROCK * 0.9, `${body.id} leans ${(rolled * 180) / Math.PI} degrees`);
    }
  }
  // With nothing to look at, the turn is all there.
  const rig = quiet();
  rig.setActivity('waiting');
  let turned = 0;
  run(rig, 9000, 16, () => { turned = Math.max(turned, Math.abs(rig.state.pose.yaw)); });
  assert.ok(turned > WAIT_TURN * 0.9, `it turns ${(turned * 180) / Math.PI} degrees`);
});

test('whatever the Bot is doing, a ball keeps both eyes in every frame of any look, blinks included', () => {
  // Each activity has a face of its own (and speaking opens the eyes with the voice); a blink is a frame too.
  // The looks are given as a pointer far off gives them, the old corners among them.
  for (const body of [BODIES.blob, BODIES.teardrop, BODIES.pebble]) {
    for (const act of ACTIVITIES) {
      // (Thinking and working move the eyes themselves: the look waits.)
      for (const [x, y] of act === 'thinking' || act === 'working' ? [[1, 1]] : [[1, 0], [1, 1], [-1, 1], [1, 0.8], [-1, -1], [0, 1]]) {
        const rig = new Rig({ seed: 3, idle: false, body });
        rig.setActivity(act);
        rig.look(x, y);
        let frames = 0, blinked = false;
        run(rig, 7000, 16, (t) => {
          frames++;
          if (act === 'speaking') rig.setLevel(Math.abs(Math.sin(t / 130)));
          if (rig.state.lid < 0.6) blinked = true;
          if (t < 1500) return;
          for (const px of [64, 72]) {
            const [left, right] = eyeShapes(body, rig.state, px);
            assert.ok(left.length && right.length, `${body.id}, ${act}, at ${px} px looking ${x}, ${y}: an eye is gone in frame ${frames}`);
          }
        });
        assert.ok(blinked, `${body.id}, ${act}: it blinked`);
      }
    }
  }
});
