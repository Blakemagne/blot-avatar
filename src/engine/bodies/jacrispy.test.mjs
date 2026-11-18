// Jacrispy: the body with antennas, two sizes of eye and stickers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  BODIES, FACES, JACRISPY_CLIPS, JACRISPY_MOODS, JACRISPY_MOOD_NAMES, Rig, STICKER_SLOTS, antennaPieces, bounds, deg, drawAvatar, jacrispy, layerShapes,
} = await import('../index.ts');
const { CUES, checkClips, start, advance } = await import('../clips.ts');

const still = (yaw = 0) => ({ pose: { yaw: deg(yaw), pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral });
const settle = (rig, ms = 2500) => { for (let t = 0; t < ms; t += 16) rig.step(16); };

test('only a body with antennas or decals has layers, so every other body draws as it did', () => {
  for (const [id, body] of Object.entries(BODIES)) {
    const d = drawAvatar(body, 'orange', still(20), 96);
    if (id === 'jacrispy') assert.ok(d.layers && d.layers.length > 0, 'jacrispy has layers');
    else assert.equal(d.layers, undefined, `${id} has no layers`);
  }
});

test('jacrispy draws two antennas, a rim behind each lens and its stickers, in painting order', () => {
  const d = drawAvatar(BODIES.jacrispy, '#F4F2EC', still(), 120);
  const ids = d.layers.map((l) => l.id);
  for (const id of ['antenna-left', 'antenna-right', 'rim-left', 'rim-right', 'sticker-chest', 'sticker-hipRight']) assert.ok(ids.includes(id), `has ${id}`);
  // Behind first, then in front.
  const firstFront = d.layers.findIndex((l) => l.front);
  assert.ok(d.layers.slice(firstFront).every((l) => l.front), 'the layers behind come first');
  for (const l of d.layers) assert.match(l.d, /^M/, `${l.id} is a path`);
  assert.equal(d.layers.find((l) => l.id === 'antenna-left').fill, BODIES.jacrispy.paint.antenna);
});

test('the lenses are two sizes: the viewer\'s left one is the bigger', () => {
  const d = drawAvatar(BODIES.jacrispy, '#F4F2EC', still(), 200);
  const box = (path) => { const n = path.match(/-?[\d.]+/g).map(Number); const xs = n.filter((_, i) => i % 2 === 0); return Math.max(...xs) - Math.min(...xs); };
  assert.ok(box(d.eyes[0]) > box(d.eyes[1]) * 1.04, `${box(d.eyes[0])} against ${box(d.eyes[1])}`);
});

test('stickers go in their slots, and only those asked for', () => {
  assert.equal(jacrispy({ stickers: [], rims: false }).decals.length, 0);
  const one = jacrispy({ stickers: [{ slot: 'belly', shape: 'bolt', colour: '#123456' }], rims: false });
  assert.equal(one.decals.length, 1);
  assert.deepEqual(one.decals[0].at, STICKER_SLOTS.belly.at);
  assert.equal(one.paint['sticker-belly'], '#123456');
  // Seen from the front, a sticker is drawn where its slot is.
  const [layer] = layerShapes(one, still(), 200).filter((l) => l.id === 'sticker-belly');
  const [x0, y0, x1, y1] = bounds(layer.polys);
  assert.ok(Math.abs((x0 + x1) / 2 - STICKER_SLOTS.belly.at[0]) < 0.03 && Math.abs(-(y0 + y1) / 2 - STICKER_SLOTS.belly.at[1]) < 0.05, `at ${(x0 + x1) / 2}, ${-(y0 + y1) / 2}`);
});

test('the antennas swing out to a held pose, and back', () => {
  const rig = new Rig({ seed: 1, idle: false, blinks: false, body: BODIES.jacrispy });
  settle(rig);
  const tipX = () => {
    const [, right] = antennaPieces(BODIES.jacrispy.antennas, rig.state.antennas, 1);
    return right[1][1][0];
  };
  const rest = tipX();
  rig.setAntennas(deg(30), deg(30));
  settle(rig);
  assert.ok(Math.abs(rig.state.antennas[1] - deg(30)) < 1e-3, `held at ${rig.state.antennas[1]}`);
  assert.ok(tipX() > rest + 0.1, `the right tip goes out: ${rest} to ${tipX()}`);
  rig.setAntennas(0, 0);
  settle(rig);
  assert.ok(Math.abs(tipX() - rest) < 1e-3);
  assert.ok(rig.still, 'and it comes to rest');
});

test('a body without antennas has none in its state', () => {
  const rig = new Rig({ seed: 1, body: BODIES.wedge });
  rig.setAntennas(deg(20), deg(20));
  settle(rig, 500);
  assert.equal(rig.state.antennas, undefined);
});

test('the antenna moves are clips the rig takes, and each ends where it began', () => {
  checkClips(JACRISPY_CLIPS);
  for (const [name, clip] of Object.entries(JACRISPY_CLIPS)) {
    const o = { yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0 };
    let p = start(clip), moved = 0;
    const view = { yaw: 0, room: 1 };
    while (p) {
      Object.assign(o, { lift: 0, stretch: 1, antL: 0, antR: 0 });
      p = advance(p, 16, o, view);
      moved = Math.max(moved, Math.abs(o.antL) + Math.abs(o.antR));
    }
    assert.ok(moved > deg(5), `${name} moves the antennas`);
    const last = { ...o, antL: 0, antR: 0, lift: 0, stretch: 1 };
    clip.apply(last, { clip, at: clip.ms, u: 1, cue: { dir: 1, amount: 1, from: 0 } }, view);
    assert.ok(Math.abs(last.antL) < 1e-6 && Math.abs(last.antR) < 1e-6 && Math.abs(last.lift) < 1e-6 && Math.abs(last.stretch - 1) < 1e-6, `${name} ends where it began`);
  }
});

test('every mood is a face the engine has, an antenna pose and a move that exists', () => {
  assert.deepEqual(JACRISPY_MOOD_NAMES, ['happy', 'curious', 'laughing', 'loving', 'thoughtful', 'surprised', 'sad', 'calm']);
  for (const [name, m] of Object.entries(JACRISPY_MOODS)) {
    assert.ok(Object.hasOwn(FACES, m.face), `${name}: face ${m.face}`);
    assert.equal(m.antennas.length, 2);
    if (m.cue) assert.ok(CUES.includes(m.cue) || Object.hasOwn(JACRISPY_CLIPS, m.cue), `${name}: move ${m.cue}`);
  }
  // And each one plays on a rig without a hitch.
  const rig = new Rig({ seed: 2, body: BODIES.jacrispy, clips: JACRISPY_CLIPS });
  for (const m of Object.values(JACRISPY_MOODS)) {
    rig.setFace(m.face); rig.setAntennas(deg(m.antennas[0]), deg(m.antennas[1]));
    if (m.cue) assert.ok(rig.play(m.cue));
    settle(rig, 1200);
    assert.doesNotMatch(JSON.stringify(drawAvatar(BODIES.jacrispy, '#fff', rig.state, 96)), /NaN/);
  }
});

test('the antennas stay in the picture, held up as far as a pose holds them', () => {
  const rig = new Rig({ seed: 1, idle: false, blinks: false, body: BODIES.jacrispy });
  rig.setAntennas(deg(-12), deg(-12));
  settle(rig);
  for (const l of layerShapes(BODIES.jacrispy, rig.state, 200).filter((x) => x.id.startsWith('antenna'))) {
    const [, y0] = bounds(l.polys);
    // The view box reaches 1.53 body units up from the middle.
    assert.ok(-y0 < 1.5, `${l.id} reaches ${-y0}`);
  }
});
