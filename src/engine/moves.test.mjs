// Moves in plain words (moves.ts): the shapes are the engine's own curves, the words keep the rules, a move that is
// not at rest at its ends is refused, and a move written this way plays in a rig. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('./moves.ts');
const { beats, body, cue, eyes, flight, head, hold, hump, peak, poke, pulse, sparks, toward, away, wave, byHand } = M;
const { track } = await import('./ease.ts');
const { PERSONALITY, give, high } = await import('./feel.ts');
const { checkClips, start, advance } = await import('./clips.ts');
const { Rig } = await import('./rig.ts');
const { deg } = await import('./math.ts');

const rest = () => ({ yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0, x: 0, arc: 0, winkL: 0, winkR: 0, glow: 0, fx: [] });
/** One frame of a move `u` of the way through, played with `cue`, seen with `view`. */
function frame(clip, u, cue = {}, view = {}, o = rest()) {
  const p = start(clip, cue);
  p.at = u * clip.ms; p.u = u;
  clip.apply(o, p, { yaw: 0, room: 1, ...view });
  return o;
}
const us = (n = 97) => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

test('beats are the engine\'s own track on the same keys, read from words', () => {
  const s = beats('1 by 30%, -0.16 by 70%, 0 by 100%');
  for (const u of us()) assert.ok(Object.is(s.fn({ u }, PERSONALITY), track([0, 0, 0.3, 1, 0.7, -0.16, 1, 0], u)), `at ${u}`);
  // 'hold till' keeps the last value; a beat at 0% may only say 0.
  const h = beats('0 by 12%, 1 by 30%, hold till 72%, 0 by 100%');
  for (const u of us()) assert.ok(Object.is(h.fn({ u }, PERSONALITY), track([0, 0, 0.12, 0, 0.3, 1, 0.72, 1, 1, 0], u)), `held at ${u}`);
  // hold({ by, till, goneBy }) is the same as its beats.
  const k = hold({ by: 14, till: 55, goneBy: 80 });
  for (const u of us()) assert.ok(Object.is(k.fn({ u }, PERSONALITY), track([0, 0, 0.14, 1, 0.55, 1, 0.8, 0], u)));
});

test('a fast beat is off at once and slows into it; a steady one keeps an even pace', () => {
  const fast = beats('1 by 50% fast, 0 by 100%'), steady = beats('1 by 50% steady, 0 by 100%'), gentle = beats('1 by 50%, 0 by 100%');
  const at = (s, u) => s.fn({ u }, PERSONALITY);
  assert.ok(at(fast, 0.1) > at(steady, 0.1) && at(steady, 0.1) > at(gentle, 0.1), 'fast leaves first, gentle last');
  assert.ok(Math.abs(at(steady, 0.25) - 0.5) < 1e-12, 'steady is halfway at halfway');
  assert.ok(Math.abs(at(fast, 0.5) - 1) < 1e-12 && at(fast, 0) === 0, 'it arrives on its beat, from 0');
});

test('beats refuse what is not a move: an end that is not rest, beats out of order, words it cannot read', () => {
  assert.throws(() => beats('1 by 30%'), /ends at rest/);
  assert.throws(() => beats('1 by 50%, 0 by 30%'), /comes after/);
  assert.throws(() => beats('1 by 30%, wobble about'), /cannot read 'wobble about'/);
  assert.throws(() => beats('1 by 130%, 0 by 140%'), /not a percent/);
  assert.throws(() => beats('0.5 by 0%, 0 by 100%'), /starts at rest/);
  assert.throws(() => beats(''), /no beats/);
});

test('a side follows the way the move was played, and a turn or a glance only as far as the room a look has left', () => {
  const m = cue(1000, [head.lean(toward, 10).along(hold({ by: 20, till: 80 })), head.turn(away, 10).along(hold({ by: 20, till: 80 })), eyes.glance(toward, 0.5).along(hold({ by: 20, till: 80 }))]);
  const r = frame(m, 0.5, { dir: 1 }), l = frame(m, 0.5, { dir: -1 }), none = frame(m, 0.5, { dir: 1 }, { room: 0 }), half = frame(m, 0.5, { dir: 1 }, { room: 0.5 });
  assert.ok(Math.abs(r.roll - deg(10)) < 1e-12 && Math.abs(l.roll + deg(10)) < 1e-12, 'leans toward the side it was played');
  assert.ok(r.yaw < 0 && l.yaw > 0, 'turns away from it');
  assert.ok(Object.is(none.yaw, -0) || none.yaw === 0, 'no room: no turn');
  assert.equal(none.eyeX, 0);
  assert.ok(Math.abs(half.yaw - r.yaw / 2) < 1e-12 && Math.abs(half.eyeX - r.eyeX / 2) < 1e-12, 'half the room, half the turn');
  // ignoringRoom: a move that goes round, not to a side.
  const round = cue(1000, [eyes.glance(toward, 0.5).along(hold({ by: 20, till: 80 })).ignoringRoom()]);
  assert.ok(frame(round, 0.5, {}, { room: 0 }).eyeX > 0.49);
});

test('a squash goes as far as the body gives and a jump as high as it is light; ignoringFeel is the same on every body', () => {
  const m = cue(1000, [body.squash(10).along(hold({ by: 20, till: 80 })), body.jump(0.2).along(flight(20, 80))]);
  const plain = cue(1000, [body.squash(10).along(hold({ by: 20, till: 80 })).ignoringFeel(), body.rise(0.2).along(flight(20, 80))]);
  for (const feel of [PERSONALITY, { ...PERSONALITY, squash: 1, weight: 0 }, { ...PERSONALITY, squash: 0, weight: 1 }]) {
    const o = frame(m, 0.5, {}, { feel }), q = frame(plain, 0.5, {}, { feel });
    assert.ok(Math.abs(o.stretch - (1 - 0.1 * give(feel))) < 1e-12, `squash on ${JSON.stringify(feel)}`);
    assert.ok(Math.abs(o.lift - 0.2 * high(feel)) < 1e-12, `jump on ${JSON.stringify(feel)}`);
    assert.ok(Math.abs(q.stretch - 0.9) < 1e-12 && Math.abs(q.lift - 0.2) < 1e-12, 'the same on every body');
  }
});

test('amount scales every line, amountUpTo caps it, and ignoringAmount keeps one line as it is', () => {
  const lines = () => [head.lean(toward, 10).along(hold({ by: 20, till: 80 })), body.glow(0.5).along(hold({ by: 20, till: 80 })).ignoringAmount()];
  const m = cue(1000, lines()), capped = cue(1000, { amountUpTo: 1 }, lines());
  assert.ok(Math.abs(frame(m, 0.5, { amount: 2 }).roll - deg(20)) < 1e-12);
  assert.ok(Math.abs(frame(capped, 0.5, { amount: 2 }).roll - deg(10)) < 1e-12);
  assert.equal(frame(m, 0.5, { amount: 0 }).roll, 0);
  assert.equal(frame(m, 0.5, { amount: 0 }).glow, 0.5);
});

test('every line on one channel is one write: a move on top of anything is exactly that and the move alone', () => {
  const m = cue(1000, [
    eyes.narrow(35).along(beats('1 by 20%, 0 by 50%')), eyes.widen(12).along(beats('1 by 30%, 0 by 90%')),
    body.rise(0.1).along(hold({ by: 20, till: 60 })), body.jump(0.05).along(flight(10, 70)),
  ]);
  for (const u of us(41)) {
    const alone = frame(m, u);
    const before = { ...rest(), open: 0.83, lift: 0.37 };
    const over = frame(m, u, {}, {}, { ...before, fx: [] });
    assert.ok(Object.is(over.open, before.open * alone.open), `open at ${u}`);
    assert.ok(Object.is(over.lift, before.lift + alone.lift), `lift at ${u}`);
  }
});

test('effects show only while the move plays, only when it is played at all, and a sided one follows the side', () => {
  const m = cue(1000, [sparks().during(20, 80), pulse().during(10, 100).doneBy(50)]);
  assert.equal(frame(m, 0.1).fx.filter((f) => f.kind === 'spray').length, 0, 'not before its time');
  const mid = frame(m, 0.5, { dir: -1, amount: 1.5 }).fx;
  const spray = mid.find((f) => f.kind === 'spray'), pulsed = mid.find((f) => f.kind === 'pulse');
  assert.ok(spray && Math.abs(spray.u - 0.5) < 1e-12 && spray.dir === -1 && spray.amount === 1, 'halfway through its time, toward the side, at most 1');
  assert.ok(pulsed && pulsed.u === 1 && pulsed.dir === 1, 'done by 50% and held there; a pulse has no side');
  assert.equal(frame(m, 0.5, { amount: 0 }).fx.length, 0, 'played at 0: nothing shows');
  // A fresh effect every frame (a state kept from an earlier frame does not change under its holder).
  assert.notEqual(frame(m, 0.5).fx[0], frame(m, 0.5).fx[0]);
});

test('a line that is not at rest at the start or the end of its move is refused, naming it, unless it says why', () => {
  assert.throws(() => cue(1000, [head.lean(toward, 5).along(peak(0, 20))]), /head\.lean\(toward, 5\): it is not at rest at the start of the move \(roll/);
  assert.throws(() => cue(1000, [body.flares(1).along(peak(95, 20))]), /body\.flares\(1\): it is not at rest at the end/);
  assert.throws(() => cue(1000, [byHand((o) => { o.lift += 0.1; }, 'a lift by hand')]), /a lift by hand: it is not at rest/);
  assert.doesNotThrow(() => cue(1000, [body.flares(1).along(peak(5, 20)).notAtRest('known: a first-frame glow')]));
});

test('a line is written whole: a shape after every verb, and .and only on the same channel', () => {
  assert.throws(() => cue(1000, [head.lean(toward, 5)]), /it has no shape/);
  assert.throws(() => body.squash(5).along(hold({ by: 20, till: 80 })).and.swell(5), /\.and joins parts on one channel/);
  assert.throws(() => cue(0, []), /a time over 0 ms/);
  assert.throws(() => peak(120, 10), /not a percent/);
});

test('a move written in words plays in a rig as any clip does, and comes back to rest', () => {
  const bow = cue(1800, { amountUpTo: 1 }, [
    head.dip(24).along(beats('1 by 35%, hold till 65%, -0.1 by 85%, 0 by 100%')),
    body.squash(4).along(beats('1 by 35%, hold till 65%, 0 by 100%')),
    eyes.down(0.35).along(hold({ by: 25, till: 70 })),
    eyes.smile(0.8).along(hold({ by: 40, till: 65 })),
  ]);
  const boop = poke(400, [body.squash(10).along(peak(30, 25)), eyes.up(0.2).along(wave(1).dwindling())]);
  assert.doesNotThrow(() => checkClips({ bow, boop }));
  const rig = new Rig({ seed: 2, idle: false, blinks: false, clips: { bow, boop } });
  for (let t = 0; t < 400; t += 16) rig.step(16);
  assert.ok(rig.play('bow'), 'it plays by name');
  let deepest = 0;
  for (let t = 0; t < 900; t += 16) { rig.step(16); deepest = Math.min(deepest, rig.state.pose.pitch); }
  assert.ok(deepest < -deg(15), `it bows: ${(deepest * 180) / Math.PI} degrees`);
  for (let t = 0; t < 3000; t += 16) rig.step(16);
  assert.ok(Math.abs(rig.state.pose.pitch) < 1e-3 && (rig.state.arc ?? 0) === 0, 'and comes back');
  // Played straight through the clip's own steps, it ends at rest.
  let p = start(bow, { dir: 1, amount: 1 }), o = rest();
  while (p) { o = rest(); p = advance(p, 7, o, { yaw: 0, room: 1 }); }
  for (const k of ['pitch', 'eyeY', 'arc']) assert.ok(Math.abs(o[k]) < 0.01, `${k} near rest at the end: ${o[k]}`);
});

test('a part after .and keeps its own verb\'s feel: a rise after a jump is the same on every body, a flare after a glow only on one that flares', () => {
  const heavy = { ...PERSONALITY, weight: 1 }, dull = { ...PERSONALITY, flare: 0 };
  const lift = cue(1000, [body.jump(0).along(hump()).and.rise(0.1).along(hump())]);
  assert.ok(Math.abs(frame(lift, 0.5, {}, { feel: heavy }).lift - 0.1) < 1e-12, 'the rise is not cut by weight');
  const glowing = cue(1000, [body.glow(0).along(hump()).and.flares(1).along(hump())]);
  assert.equal(frame(glowing, 0.5, {}, { feel: dull }).glow, 0, 'no flare on a body that does not flare');
  assert.ok(Math.abs(frame(glowing, 0.5, {}, { feel: { ...PERSONALITY, flare: 0.5 } }).glow - 0.5) < 1e-12);
});

test('the edges of what the words take: no fade is no fade, a peak or a snap needs some width, and options are checked', () => {
  const none = [hump().fadeIn(0), hump().fadeOut(100), M.surge(0, { dies: 4 }).fadeOut(90)];
  for (const s of none) for (const u of [0, 0.25, 0.5, 1]) assert.ok(Number.isFinite(s.fn({ u, ms: 1000 }, PERSONALITY)), `finite at ${u}`);
  assert.doesNotThrow(() => cue(1000, [head.dip(10).along(hump().fadeIn(0).fadeOut(100))]));
  assert.throws(() => peak(50, 0), /some width/);
  assert.throws(() => M.snapBack(0), /some of the move/);
  assert.throws(() => cue(1000, [pulse().during(25, 100).doneBy(20)]), /done after it starts/);
  assert.throws(() => cue(1000, { amountUpTo: -1 }, [head.dip(10).along(hump())]), /amountUpTo is an amount over 0/);
  assert.throws(() => cue(1000, { amountUpTo: NaN }, [head.dip(10).along(hump())]), /amountUpTo/);
  // The shapes that only die away are refused without a fade at the end.
  assert.throws(() => cue(1000, [head.lean(toward, 5).along(M.wobble(3.3, { dies: 2 }))]), /not at rest at the end/);
});
