// Jacrispy: his head, his face (two sizes of framed lens, the bar and its camera, two antennas behind the head),
// that face on every other body, and his moods. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  BODIES, FACES, JACRISPY_CLIPS, JACRISPY_MOODS, JACRISPY_MOOD_NAMES, Rig, antennaPieces, bounds, deg, drawAvatar, jacrispy, jacrispyFace, layerShapes,
} = await import('../index.ts');
const { CUES, checkClips, start, advance } = await import('../clips.ts');

const still = (yaw = 0) => ({ pose: { yaw: deg(yaw), pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral });
const settle = (rig, ms = 2500) => { for (let t = 0; t < ms; t += 16) rig.step(16); };
const width = (path) => { const n = path.match(/-?[\d.]+/g).map(Number); const xs = n.filter((_, i) => i % 2 === 0); return Math.max(...xs) - Math.min(...xs); };

test('only a body with antennas or decals has layers, so every other body draws as it did', () => {
  for (const [id, body] of Object.entries(BODIES)) {
    const d = drawAvatar(body, 'orange', still(20), 96);
    if (id === 'jacrispy') assert.ok(d.layers && d.layers.length > 0, 'jacrispy has layers');
    else assert.equal(d.layers, undefined, `${id} has no layers`);
  }
});

test('jacrispy draws two antennas behind his head, a frame round each lens, the bar and its camera, in painting order', () => {
  const d = drawAvatar(BODIES.jacrispy, '#F4F2EC', still(), 120);
  const ids = d.layers.map((l) => l.id);
  for (const id of ['antenna-left', 'antenna-right', 'bridge', 'rim-left', 'rim-right', 'camera', 'camera-glass']) assert.ok(ids.includes(id), `has ${id}`);
  const firstFront = d.layers.findIndex((l) => l.front);
  assert.ok(d.layers.slice(firstFront).every((l) => l.front), 'the layers behind come first');
  assert.ok(ids.indexOf('bridge') < ids.indexOf('camera') && ids.indexOf('camera') < ids.indexOf('camera-glass'), 'the camera sits on the bar, its glass in it');
  // The frames and the glass are told apart by colour.
  const fill = (id) => d.layers.find((l) => l.id === id).fill;
  assert.notEqual(fill('rim-left'), BODIES.jacrispy.paint.glass);
  assert.notEqual(fill('camera'), fill('camera-glass'));
  for (const l of d.layers) assert.match(l.d, /^M/, `${l.id} is a path`);
  assert.equal(d.layers.find((l) => l.id === 'antenna-left').fill, BODIES.jacrispy.paint.antenna);
});

test('the lenses are two sizes: the viewer\'s left one is the bigger, as on the robot (41 and 32 mm)', () => {
  const d = drawAvatar(BODIES.jacrispy, '#F4F2EC', still(), 200);
  const ratio = width(d.eyes[0]) / width(d.eyes[1]);
  assert.ok(ratio > 1.2 && ratio < 1.5, `${ratio}`);
});

test('the bar reaches from inside one lens to inside the other, at their height, and no further', () => {
  const [bridge] = layerShapes(BODIES.jacrispy, still(), 200).filter((l) => l.id === 'bridge');
  const [x0, y0, x1, y1] = bounds(bridge.polys);
  const e = BODIES.jacrispy.eyes;
  const [big, small] = e.sizes;
  assert.ok(x0 > -e.x - 0.02 && x0 < -e.x + (e.w * big) / 2, `starts at ${x0}`);
  assert.ok(x1 < e.x + 0.02 && x1 > e.x - (e.w * small) / 2, `ends at ${x1}`);
  assert.ok(Math.abs(-(y0 + y1) / 2 - e.y) < 0.05, `at ${-(y0 + y1) / 2}`);
  assert.ok(y1 - y0 < 0.1, 'and it is a thin bar');
});

test('his face goes on every other body: antennas on top and in the picture, the bar between its eyes', () => {
  for (const [id, base] of Object.entries(BODIES)) {
    if (id === 'jacrispy') continue;
    const b = jacrispyFace(base);
    assert.equal(b.id, `${id}+jacrispy`);
    assert.ok(b.antennas, `${id} has antennas`);
    for (const yaw of [0, 35, -60]) {
      const d = drawAvatar(b, 'orange', still(yaw), 120);
      assert.doesNotMatch(JSON.stringify(d), /NaN/, `${id} at ${yaw}`);
      const ids = d.layers.map((l) => l.id);
      for (const want of ['antenna-left', 'antenna-right', 'bridge']) assert.ok(ids.includes(want), `${id} at ${yaw} has ${want}`);
    }
    for (const l of layerShapes(b, still(), 200).filter((x) => x.id.startsWith('antenna'))) {
      const [, y0] = bounds(l.polys);
      assert.ok(-y0 < 1.5 && -y0 > b.eyes.y + 0.2, `${id}: ${l.id} reaches ${-y0}`);
    }
  }
});

test('without antennas, rims or the bar, the face leaves them out', () => {
  const b = jacrispy({ antennas: false, rims: false, bridge: false });
  assert.equal(b.antennas, undefined);
  assert.equal(b.decals.length, 0);
  assert.equal(jacrispyFace(BODIES.blob, { antennas: false }).antennas, undefined);
});

test('the antennas swing out to a held pose, and back, at once or over a time', () => {
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
  rig.setAntennas(0, 0, 1000);
  settle(rig, 400);
  const part = rig.state.antennas[1];
  assert.ok(part > deg(2) && part < deg(28), `part of the way after 400 ms: ${part}`);
  assert.ok(!rig.still, 'still moving');
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

test('his moves are clips the rig takes: each moves him, and each ends where it began', () => {
  checkClips(JACRISPY_CLIPS);
  for (const [name, clip] of Object.entries(JACRISPY_CLIPS)) {
    const zero = { yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0, lift: 0, stretch: 1, scale: 1, open: 1, eyeScale: 1, dot: 0, antL: 0, antR: 0 };
    const o = { ...zero };
    let p = start(clip), moved = 0;
    const view = { yaw: 0, room: 1 };
    while (p) {
      Object.assign(o, zero);
      p = advance(p, 16, o, view);
      moved = Math.max(moved, Math.abs(o.antL) + Math.abs(o.antR) + Math.abs(o.yaw) + Math.abs(o.pitch) + Math.abs(o.roll) + Math.abs(o.lift) * 4);
    }
    assert.ok(moved > deg(5), `${name} moves him`);
    const last = { ...zero };
    clip.apply(last, { clip, at: clip.ms, u: 1, cue: { dir: 1, amount: 1, from: 0 } }, view);
    for (const k of Object.keys(zero)) assert.ok(Math.abs(last[k] - zero[k]) < 1e-6, `${name} ends where it began (${k} ${last[k]})`);
  }
});

test('his lenses are cameras: no face, blink or look changes them', () => {
  for (const body of [BODIES.jacrispy, jacrispyFace(BODIES.blob)]) {
    const plain = drawAvatar(body, '#fff', still(20), 120);
    for (const face of ['happy', 'sad', 'surprised', 'laughing']) {
      const s = { ...still(20), face: FACES[face], lid: 0.1, eye: { x: 1, y: -1 } };
      const d = drawAvatar(body, '#fff', s, 120);
      assert.deepEqual(d.eyes, plain.eyes, `${body.id} ${face}`);
      assert.deepEqual(d.layers, plain.layers, `${body.id} ${face}: frames and bar`);
    }
  }
});

test('every mood is an antenna pose, a move that exists and the recording it follows', () => {
  assert.deepEqual(JACRISPY_MOOD_NAMES, ['happy', 'curious', 'laughing', 'loving', 'thoughtful', 'surprised', 'sad', 'calm']);
  for (const [name, m] of Object.entries(JACRISPY_MOODS)) {
    assert.equal(m.antennas.length, 2);
    assert.ok(CUES.includes(m.cue) || Object.hasOwn(JACRISPY_CLIPS, m.cue), `${name}: move ${m.cue}`);
    assert.match(m.recording, /^[a-z]+\d$/, `${name}: recording`);
  }
  // And each one plays on a rig without a hitch, on him and with his face on another body.
  for (const body of [BODIES.jacrispy, jacrispyFace(BODIES.heart)]) {
    const rig = new Rig({ seed: 2, body, clips: JACRISPY_CLIPS });
    for (const m of Object.values(JACRISPY_MOODS)) {
      rig.setAntennas(deg(m.antennas[0]), deg(m.antennas[1]), m.ms ?? 0);
      assert.ok(rig.play(m.cue));
      settle(rig, 1200);
      assert.doesNotMatch(JSON.stringify(drawAvatar(body, '#fff', rig.state, 96)), /NaN/);
    }
  }
});

test('the antennas stay behind the head from every side', () => {
  for (const body of [BODIES.jacrispy, jacrispyFace(BODIES.tablet), jacrispyFace(BODIES.blob)]) {
    for (const yaw of [-90, -60, -30, 0, 30, 60, 90]) {
      for (const l of drawAvatar(body, '#fff', still(yaw), 120).layers.filter((x) => x.id.startsWith('antenna'))) assert.equal(l.front, false, `${body.id} at ${yaw}: ${l.id}`);
    }
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
