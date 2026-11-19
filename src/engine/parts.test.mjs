// The parts a body can add to the shapes: antennas behind it, decals on its surface, fixed eyes and eyes of two
// sizes. Tried on a test body (the blob with them added), so the engine covers them whatever bodies ship with it.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BODIES, FACES, Rig, bounds, deg, drawAvatar, eyeShapes, layerShapes } = await import('./index.ts');

const blob = BODIES.blob;
const TEST = {
  ...blob,
  id: 'test',
  eyes: { ...blob.eyes, sizes: [1.2, 0.9], open: 0, fixed: true },
  antennas: { pivot: [0.4, 0.6, 0], base: 0.3, whip: 0.6, radii: [0.04, 0.03, 0.02], rest: deg(10), follow: 0.35, paint: 'antenna' },
  decals: [
    { id: 'bar', at: [0, 0], w: 0.1, h: 0.06, shape: 'rounded', paint: 'bar', eye: 'both', span: true },
    { id: 'rim-left', at: [0, 0], w: 0.3, h: 0.3, shape: 'circle', paint: 'rim', eye: 'left' },
    { id: 'dot', at: [0, 0], w: 0.05, h: 0.05, shape: 'circle', paint: 'dot', eye: 'both' },
  ],
  paint: { antenna: '#111111', bar: '#222222', rim: '#333333', dot: '#444444' },
};

const still = (yaw = 0, face = FACES.neutral, lid = 1, ex = 0) => ({ pose: { yaw: deg(yaw), pitch: 0, roll: 0 }, eye: { x: ex, y: 0 }, lid, face });

test('a body with antennas and decals draws them as layers, the antennas behind and the decals in their order', () => {
  const d = drawAvatar(TEST, '#ffffff', still(), 120);
  const ids = d.layers.map((l) => l.id);
  assert.deepEqual(ids.filter((id) => !id.startsWith('antenna')), ['bar', 'rim-left', 'dot']);
  for (const side of ['left', 'right']) assert.equal(d.layers.find((l) => l.id === `antenna-${side}`).front, false, `${side} antenna behind`);
  for (const l of d.layers) assert.match(l.d, /^M/, `${l.id} is a path`);
  assert.equal(d.layers.find((l) => l.id === 'dot').fill, '#444444');
  // A body without them has no layers.
  assert.equal(drawAvatar(blob, '#ffffff', still(), 120).layers, undefined);
});

test('a decal on both eyes sits between them, and a spanning one reaches into each eye', () => {
  const shapes = layerShapes(TEST, still(), 200), box = (id) => bounds(shapes.find((l) => l.id === id).polys);
  const [bx0, , bx1] = box('bar'), [dx0, , dx1] = box('dot'), [lx0, , lx1] = box('rim-left');
  assert.ok(Math.abs((dx0 + dx1) / 2) < 0.02, `dot in the middle, ${dx0} to ${dx1}`);
  // A span reaches a little way into each eye from its inner edge, and no further than its far edge.
  const [l, r] = eyeShapes(TEST, still(), 200).map((p) => bounds(p));
  assert.ok(bx0 < l[2] && bx0 > l[0] && bx1 > r[0] && bx1 < r[2], `bar ${bx0} to ${bx1} reaches into the eyes ${l} and ${r}`);
  assert.ok(lx1 < 0.05, 'the left rim is on the left');
});

test('fixed eyes keep their shape whatever the face, lid or look', () => {
  const base = drawAvatar(TEST, '#ffffff', still(), 120);
  for (const [face, lid, ex] of [[FACES.happy, 1, 0], [FACES.neutral, 0.1, 0], [FACES.neutral, 1, 0.8]]) {
    const d = drawAvatar(TEST, '#ffffff', still(0, face, lid, ex), 120);
    assert.equal(d.leftEye, base.leftEye);
    assert.equal(d.rightEye, base.rightEye);
  }
});

test('setAntennas holds them where told, and a body without antennas ignores it', () => {
  const rig = new Rig({ body: TEST, seed: 3, idle: false });
  rig.setAntennas(deg(30), deg(-30), 300);
  for (let t = 0; t < 3000; t += 16) rig.step(16);
  const [l, r] = rig.state.antennas;
  assert.ok(Math.abs(l - deg(30)) < deg(8) && Math.abs(r + deg(30)) < deg(8), `held at ${l}, ${r}`);
  const plain = new Rig({ body: blob, seed: 3 });
  plain.setAntennas(deg(30), deg(-30));
  plain.step(16);
  assert.equal(plain.state.antennas, undefined);
});

test('a rig whose body loses its antennas mid-swing or mid-glide still comes to rest', () => {
  const P = { yaw: 0, pitch: 0, roll: 0 };
  // Swung, then changed to a body without antennas two frames in.
  const swung = new Rig({ body: TEST, seed: 3, idle: false, blinks: false });
  swung.setAntennas(deg(35), deg(35));
  swung.step(16); swung.step(16);
  swung.setBody(blob);
  swung.rest(P);
  for (let t = 0; t < 20000; t += 16) swung.step(16);
  assert.ok(swung.resting, 'rests after losing its antennas mid-swing');
  // A slow move told to a body that never had antennas.
  const plain = new Rig({ body: blob, seed: 3, idle: false, blinks: false });
  plain.setAntennas(deg(30), deg(30), 300);
  plain.rest(P);
  for (let t = 0; t < 20000; t += 16) plain.step(16);
  assert.ok(plain.resting, 'rests after a glide told to a body without antennas');
});
