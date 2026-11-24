// Ultracode, a star's power: Rig.setUltra, the pickup, the power's timing, and its halo and twinkles.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BODIES, Rig, drawAvatar, effectShapes, eyeShapes, inside } = await import('./index.ts');
const { CLIPS, CUES, PICKUP_MS } = await import('./clips.ts');
const { TWINKLE_ANGLES, TWINKLE_MS, fxParts } = await import('./fx.ts');
const { ULTRA_CYCLE, ULTRA_IN, ULTRA_OUT, ULTRA_WAIT } = await import('./rig.ts');

const quiet = (opts = {}) => new Rig({ seed: 1, idle: false, blinks: false, body: BODIES.blob, ...opts });
const run = (rig, ms, dt = 8, each = () => {}) => { for (let t = dt; t <= ms; t += dt) { rig.step(dt); each(t); } };
const power = (rig) => rig.state.ultra?.amount ?? 0;
const finite = (d) => /^[MLZ0-9 .\-]*$/.test(d) && !/NaN|Infinity/.test(d);
/** Whether two polygons touch: a corner of either inside the other. */
const touch = (a, b) => {
  for (let j = 0; j < a.length; j += 2) if (inside(b, a[j], a[j + 1])) return true;
  for (let j = 0; j < b.length; j += 2) if (inside(a, b[j], b[j + 1])) return true;
  return false;
};

test('the power waits for the star, is all there by 700 ms, and is gone 550 ms after it is turned off; nothing shows before or after', () => {
  const rig = quiet();
  run(rig, 500);
  assert.equal(rig.state.ultra, undefined, 'nothing before');
  rig.setUltra(true);
  let first = null, full = null, last = 0;
  run(rig, 1000, 4, (t) => {
    const k = power(rig);
    assert.ok(k >= last && k <= 1, `it only rises: ${k} at ${t} ms`);
    if (k > 0 && first === null) first = t;
    if (k === 1 && full === null) full = t;
    last = k;
  });
  assert.ok(first > ULTRA_WAIT && first <= ULTRA_WAIT + 8, `it comes on after the wait: ${first} ms`);
  assert.ok(full <= ULTRA_WAIT + ULTRA_IN + 4 && full <= 700, `all there by ${full} ms`);
  assert.ok(rig.state.ultra.phase >= 0 && rig.state.ultra.phase < 1);
  // The bands go round once in ULTRA_CYCLE: the phase climbs and comes back to where it was.
  const a = rig.state.ultra.phase;
  run(rig, ULTRA_CYCLE / 4, 1);
  const b = rig.state.ultra.phase;
  assert.ok(Math.abs(((b - a + 1) % 1) - 0.25) < 0.01, `a quarter of the way round: ${a} to ${b}`);
  rig.setUltra(false);
  let gone = null;
  last = 1;
  run(rig, 1000, 4, (t) => {
    const k = power(rig);
    assert.ok(k <= last, `it only falls: ${k} at ${t} ms`);
    if (k === 0 && gone === null) gone = t;
    last = k;
  });
  assert.ok(gone !== null && gone < ULTRA_OUT + 4, `gone in ${gone} ms`);
  assert.equal(rig.state.ultra, undefined, 'nothing after');
  assert.equal(rig.state.fx, undefined, 'no effect left behind');
  // The same steps give the same frames.
  const film = () => { const r = quiet(); const out = []; r.setUltra(true); run(r, 1500, 16, () => out.push(JSON.stringify(r.state))); r.setUltra(false); run(r, 700, 16, () => out.push(JSON.stringify(r.state))); return out; };
  assert.deepEqual(film(), film());
});

test('turned on again as it fades, it rises from where it is, with no pickup; turned off in the pickup, the pickup plays out', () => {
  const rig = quiet();
  rig.setUltra(true);
  run(rig, 1000);
  rig.setUltra(false);
  run(rig, 200);
  const k = power(rig);
  assert.ok(k > 0.2 && k < 0.95, `part way out: ${k}`);
  rig.setUltra(true);
  rig.step(8);
  const after = power(rig);
  assert.ok(after >= k && after - k < 0.02, `from where it was: ${k} to ${after}`);
  let star = false, squash = 1;
  run(rig, ULTRA_IN, 8, () => { star ||= !!rig.state.fx?.some((f) => f.kind === 'star'); squash = Math.min(squash, rig.state.stretch); });
  assert.equal(power(rig), 1, 'all there again');
  assert.equal(star, false, 'no star');
  assert.ok(squash > 0.999, `no squash: ${squash}`);
  // Off during the wait: nothing comes on, and the pickup ends at rest.
  const early = quiet();
  early.setUltra(true);
  run(early, 100);
  early.setUltra(false);
  run(early, PICKUP_MS);
  assert.equal(early.state.ultra, undefined);
  assert.equal(early.state.fx, undefined);
  assert.equal(early.state.stretch, 1);
  assert.ok(early.still);
  // On again while that pickup's star still falls (300 ms in): it plays on, and the power eases in from nothing,
  // not all at once.
  const again = quiet();
  again.setUltra(true);
  run(again, 100);
  again.setUltra(false);
  run(again, 200);
  again.setUltra(true);
  let jump = 0, last = 0, stars = 0;
  run(again, ULTRA_IN + 100, 8, () => {
    jump = Math.max(jump, power(again) - last); last = power(again);
    stars = Math.max(stars, again.state.fx?.filter((f) => f.kind === 'star').length ?? 0);
  });
  assert.ok(jump < 0.05, `no jump: at most ${jump} a frame`);
  assert.equal(power(again), 1);
  assert.equal(stars, 1, 'the same star, not a second one');
});

test('on again once that pickup\'s star has fallen, a new pickup plays; turned off before a frame was played, no pickup is left to play', () => {
  const pickup = (rig) => {
    let stars = 0, least = 1, first = null;
    run(rig, PICKUP_MS + 100, 4, (t) => {
      if (rig.state.fx?.some((f) => f.kind === 'star')) stars++;
      least = Math.min(least, rig.state.stretch);
      if (power(rig) > 0 && first === null) first = t;
    });
    return { stars, least, first };
  };
  // On, off at 100 ms, on again at 600 ms: the first pickup is past its star (at 69% of its 700 ms) and its squash.
  const late = quiet();
  late.setUltra(true);
  run(late, 100);
  late.setUltra(false);
  run(late, 500);
  late.setUltra(true);
  const p = pickup(late);
  assert.ok(p.stars > 100, `a star drops in: ${p.stars} frames`);
  assert.ok(Math.abs(p.least - 0.9) < 0.005, `and the body squashes: ${p.least}`);
  assert.ok(p.first > ULTRA_WAIT, `the power waits for it: from ${p.first} ms`);
  assert.equal(power(late), 1);
  // On and off with no frame between (off screen, or under reduced motion), then stepped: nothing at all plays.
  const stale = quiet();
  stale.setUltra(true);
  stale.setUltra(false);
  const q = pickup(stale);
  assert.deepEqual([q.stars, q.least, q.first], [0, 1, null]);
  assert.equal(stale.state.fx, undefined);
  assert.ok(stale.still);
});

test('the pickup squashes the body from its feet and drops one star in, from up and to the right', () => {
  const rig = quiet();
  rig.setUltra(true);
  let least = 1, at = 0, stars = 0, starFrom = null, starTo = 0;
  const xs = [], ys = [];
  run(rig, PICKUP_MS + 100, 4, (t) => {
    if (rig.state.stretch < least) { least = rig.state.stretch; at = t; }
    const here = rig.state.fx?.filter((f) => f.kind === 'star') ?? [];
    stars = Math.max(stars, here.length);
    if (here.length) {
      starFrom ??= t; starTo = t;
      const p = effectShapes(BODIES.blob, rig.state, 120).find((e) => e.role === 'light' && e.layer === 'front' && !rig.state.ultra);
      if (p) { const poly = p.polys[0]; let x = 0, y = 0; for (let i = 0; i < poly.length; i += 2) { x += poly[i]; y += poly[i + 1]; } xs.push(x / (poly.length / 2)); ys.push(y / (poly.length / 2)); }
    }
  });
  assert.ok(Math.abs(least - 0.9) < 0.005 && at > 120 && at < 180, `squashed to ${least} at ${at} ms`);
  assert.equal(rig.state.stretch, 1, 'and back');
  assert.equal(stars, 1, 'one star at a time');
  assert.ok(starFrom <= 8 && starTo > 440 && starTo < 0.7 * PICKUP_MS, `the star from ${starFrom} to ${starTo} ms`);
  assert.ok(xs.length > 10, 'the star is drawn');
  assert.ok(xs[0] > 0.4 && ys[0] < -1, `it starts up and to the right: ${xs[0]}, ${ys[0]}`);
  assert.ok(xs.at(-1) < xs[0] && ys.at(-1) > ys[0], 'and falls in toward the head');
  // Squashed from the feet: the bottom of the body stays where it was.
  const low = (r) => Math.max(...[...drawAvatar(BODIES.blob, '#000', r.state, 96).body.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => +m[1]));
  const a = quiet(), b = quiet();
  b.setUltra(true);
  a.step(150); b.step(150);
  assert.ok(Math.abs(low(a) - low(b)) < 0.02, `the feet stay put: ${low(a)} and ${low(b)}`);
  // The pickup is the rig's own: it is not a cue, and play() does not play it.
  assert.equal(CLIPS.pickup.lane, 'power');
  assert.ok(!CUES.includes('pickup'));
  assert.equal(quiet().play('pickup'), false);
});

test('a powered avatar is never still, floats with a shadow under it, and comes to rest once it is turned off', () => {
  const pose = { yaw: 0.3, pitch: -0.1, roll: 0.05 };
  const rig = new Rig({ seed: 7, body: BODIES.blob, pose, rest: true });
  assert.ok(rig.resting);
  rig.setUltra(true);
  run(rig, 6000, 16, () => { assert.equal(rig.still, false); assert.equal(rig.resting, false); });
  rig.setUltra(false);
  let took = 0;
  while (!rig.resting && took < 5000) { rig.step(16); took += 16; }
  assert.ok(rig.resting, `at rest again after ${took} ms`);
  assert.equal(rig.state.ultra, undefined);
  // Awake, it floats: up off the ground, bobbing, a shadow under it, and down again once off.
  const f = new Rig({ seed: 1, blinks: false, body: BODIES.blob });
  f.setUltra(true);
  run(f, 3000);
  assert.ok(f.state.lift > 0.08, `floating at ${f.state.lift}`);
  assert.ok(drawAvatar(BODIES.blob, '#FD690F', f.state, 96).effects?.some((e) => e.role === 'shadow'), 'a shadow under it');
  f.setUltra(false);
  run(f, 4000);
  assert.ok(f.state.lift < 0.002, `down again: ${f.state.lift}`);
  // A body that floats anyway floats no higher.
  const g = new Rig({ seed: 1, blinks: false, body: BODIES.blob, personality: { float: 1 } }), h = new Rig({ seed: 1, blinks: false, body: BODIES.blob, personality: { float: 1 } });
  h.setUltra(true);
  run(g, 3000); run(h, 3000);
  assert.ok(Math.abs(g.state.lift - h.state.lift) < 1e-9);
});

test('a drawing carries the power only while it shows; a rig never powered has none of it', () => {
  const plain = quiet(), rig = quiet();
  run(plain, 1000); run(rig, 1000);
  assert.ok(!('ultra' in plain.state));
  assert.equal(drawAvatar(BODIES.blob, '#000', plain.state, 96).ultra, undefined);
  rig.setUltra(true);
  run(rig, 800);
  const d = drawAvatar(BODIES.blob, '#000', rig.state, 96);
  assert.deepEqual(d.ultra, { amount: 1, phase: rig.state.ultra.phase });
  assert.notEqual(d.ultra, rig.state.ultra, 'a copy');
  assert.ok(d.effects.some((e) => e.role === 'halo' && e.layer === 'back'), 'a halo behind');
  for (const e of d.effects) assert.ok(finite(e.d), e.role);
  rig.setUltra(false);
  run(rig, 600);
  assert.equal(drawAvatar(BODIES.blob, '#000', rig.state, 96).ultra, undefined);
});

test('every part of the power is finite, none at amount 0, and inside the bound effects are held to, floating, on a round body and wide ones', () => {
  const frame = { x0: -0.9, y0: -0.9, x1: 0.9, y1: 0.9, cx: 0, cy: 0, reach: () => new Float64Array(96).fill(0.9) };
  assert.deepEqual(fxParts({ kind: 'ultra', u: 0, t: 700, dir: 1, amount: 0 }, frame, 1 / 60), []);
  // Over a whole life every twinkle flashes once, and each takes its turn.
  const lit = new Set();
  for (let t = 0; t < TWINKLE_MS; t += 10) {
    const parts = fxParts({ kind: 'ultra', u: 0, t, dir: 1, amount: 1 }, frame, 1 / 60);
    assert.equal(parts[0].role, 'halo');
    for (const p of parts) for (const poly of p.polys) for (const v of poly) assert.ok(Number.isFinite(v));
    const big = parts.filter((p) => p.role === 'rainbow' && p.opacity > 0.95);
    assert.ok(big.length <= 1, `one flash at a time at ${t} ms`);
    for (const p of big) { const q = p.polys[0]; let x = 0, y = 0; for (let i = 0; i < q.length; i += 2) { x += q[i]; y += q[i + 1]; } lit.add(Math.round(Math.atan2(y, x) * 10)); }
  }
  assert.equal(lit.size, TWINKLE_ANGLES.length, `every twinkle flashes: ${[...lit]}`);
  // On a tiny avatar the twinkles are too small to draw, and the halo stays.
  const tiny = fxParts({ kind: 'ultra', u: 0, t: 833, dir: 1, amount: 1 }, frame, 2 / 16);
  assert.deepEqual(tiny.map((p) => p.role), ['halo']);
  const HALF = 55.2 / 2 / 18;
  for (const body of [BODIES.blob, BODIES.wedge, BODIES.square]) {
    const rig = new Rig({ seed: 3, body });
    rig.setUltra(true);
    let far = 0, lifted = 0;
    run(rig, 6000, 16, () => {
      lifted = Math.max(lifted, rig.state.lift);
      for (const p of effectShapes(body, rig.state, 96)) {
        assert.ok(p.opacity >= 0 && p.opacity <= 1);
        for (const poly of p.polys) for (const v of poly) { assert.ok(Number.isFinite(v)); far = Math.max(far, Math.abs(v)); }
      }
      for (const d of [drawAvatar(body, '#000', rig.state, 96), drawAvatar(body, '#000', rig.state, 22)]) for (const e of d.effects ?? []) assert.ok(finite(e.d));
    });
    assert.ok(lifted > 0.1, `${body.id} floats: ${lifted}`);
    assert.ok(far < HALF + 0.15, `${body.id} reaches ${far}`);
  }
});

test('no twinkle and no star covers an eye, whichever way it looks', () => {
  const looks = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]];
  for (const body of [BODIES.blob, BODIES.wedge, BODIES.square, BODIES.tablet, BODIES.cloud]) {
    for (const [x, y] of looks) {
      const rig = new Rig({ seed: 2, body, blinks: false });
      rig.setUltra(true);
      rig.look(x, y);
      let twinkles = 0;
      // (Long enough for every twinkle's whole life, and the star.)
      run(rig, TWINKLE_MS + 300, 20, (t) => {
        const eyes = eyeShapes(body, rig.state, 96).flat();
        for (const p of effectShapes(body, rig.state, 96)) {
          if (p.layer !== 'front' || p.role === 'accent') continue;
          if (p.role === 'rainbow') twinkles++;
          for (const e of eyes) assert.ok(!touch(p.polys[0], e), `${body.id} looking ${x}, ${y}: a ${p.role} part over an eye at ${t} ms`);
        }
      });
      assert.ok(twinkles > 20, `${body.id}: twinkles drawn (${twinkles})`);
    }
  }
});
