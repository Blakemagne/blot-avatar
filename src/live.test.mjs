// createLive: a live avatar's rig on the one shared frame loop. Nothing ticks before it is seen, at rest, or
// under reduced motion; one under 48 px is drawn at most 30 times a second. Run with: npm test -w @blot/avatar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A stand-in page, as in ticker.test.mjs: frames that run when pumped, a reduced-motion setting, and an
// on-screen observer the test reports to.
let frames = [], ids = 0;
globalThis.requestAnimationFrame = (fn) => { frames.push({ id: ++ids, fn }); return ids; };
globalThis.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
globalThis.document = { hidden: false, on: {}, addEventListener(type, fn) { this.on[type] = fn; } };
const setting = { matches: false, on: [], addEventListener(type, fn) { if (type === 'change') this.on.push(fn); } };
globalThis.matchMedia = () => setting;
const prefer = (reduced) => { setting.matches = reduced; for (const fn of setting.on) fn(); };
let report = null;
const observed = new Set();
globalThis.IntersectionObserver = class { constructor(cb) { report = cb; } observe(el) { observed.add(el); } unobserve(el) { observed.delete(el); } };
const see = (el, on) => report([{ target: el, isIntersecting: on }]);
/** Run the frames that are due, as the browser would. */
const pump = (now) => { const due = frames; frames = []; for (const f of due) f.fn(now); };
const element = () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }) });

const { createLive } = await import('./live.ts');
const { ticking } = await import('./ticker.ts');
const { FACES, Rig, drawAvatar } = await import('./engine/index.ts');
const { ACTIVITY_FACES } = await import('./engine/faces.ts');
const { bodyOf, stillState } = await import('./still.ts');

/** Attach and run the steps React's effects run on mount, in their order. Returns what was drawn, and the way to stop. */
function mounted(props) {
  const live = createLive(props), el = element(), drawn = [];
  const detach = live.attach(el, (d) => drawn.push(d));
  live.motion(); live.follow(props.follow); live.shape(); live.face(props.face); live.doing();
  return { live, el, drawn, detach };
}
const FRONT = { pose: { yaw: 0, pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };
/** Facing front, wearing what it is doing: under reduced motion nothing moves, but the face still says what is going on. */
const THINKING = { ...FRONT, face: ACTIVITY_FACES.thinking };

test('nothing subscribes until the avatar is seen, and it stops when it goes off screen', () => {
  const a = mounted({ shape: 'blob', size: 72, activity: 'thinking' });
  assert.ok(observed.has(a.el));
  assert.deepEqual(ticking(), { count: 0, running: false });
  see(a.el, true);
  assert.deepEqual(ticking(), { count: 1, running: true });
  see(a.el, false);
  assert.deepEqual(ticking(), { count: 0, running: false });
  a.detach();
  assert.ok(!observed.has(a.el));
});

test('two avatars share one frame loop: one pending animation frame between them', () => {
  const a = mounted({ shape: 'blob', size: 72, activity: 'thinking' }), b = mounted({ shape: 'heart', size: 36, activity: 'working', seed: 7 });
  see(a.el, true); see(b.el, true);
  assert.deepEqual(ticking(), { count: 2, running: true });
  assert.equal(frames.length, 1);
  pump(1000); pump(1040);
  assert.equal(frames.length, 1);
  a.detach(); b.detach();
  assert.deepEqual(ticking(), { count: 0, running: false });
  assert.equal(frames.length, 0);
});

test('under 48 px a 16 ms frame is skipped without moving the clock, so the next step is the whole 33 ms', () => {
  const small = mounted({ shape: 'blob', size: 36, activity: 'thinking' });
  see(small.el, true);
  const before = small.drawn.length;
  pump(1000); // the first frame only starts the clock
  pump(1016);
  assert.equal(small.drawn.length, before, 'a 16 ms frame does not step a small avatar');
  pump(1033);
  assert.equal(small.drawn.length, before + 1);
  // The same rig, stepped once by 33 ms (from 1000, not from 1016), draws the same picture.
  const twin = new Rig({ seed: 1, body: bodyOf('blob') });
  twin.setActivity('thinking', null); twin.rest(null);
  twin.stop(); twin.setLevel(0); twin.step(33);
  assert.deepEqual(small.drawn.at(-1), drawAvatar(bodyOf('blob'), 'gray', twin.state, 36));
  small.detach();

  // From 48 px up every frame steps.
  const large = mounted({ shape: 'blob', size: 72, activity: 'thinking' });
  see(large.el, true);
  const had = large.drawn.length;
  pump(2000); pump(2016);
  assert.equal(large.drawn.length, had + 1);
  large.detach();
  assert.deepEqual(ticking(), { count: 0, running: false });
});

test('an avatar that rests stops ticking when it comes to rest, and a poke wakes it', () => {
  const props = { shape: 'heart', size: 36, rests: true };
  const a = mounted(props);
  see(a.el, true);
  assert.ok(a.live.rig.resting, 'a resting avatar starts at rest');
  assert.deepEqual(ticking(), { count: 0, running: false }, 'and does not tick');
  a.live.want({ ...props, activity: 'thinking' }); a.live.doing();
  assert.deepEqual(ticking(), { count: 1, running: true });
  let now = 3000;
  for (let i = 0; i < 60; i++) pump(now += 33);
  a.live.want(props); a.live.doing();
  for (let i = 0; i < 3000 && ticking().count; i++) pump(now += 33);
  assert.ok(a.live.rig.resting);
  assert.deepEqual(ticking(), { count: 0, running: false });
  assert.equal(frames.length, 0);
  assert.deepEqual(a.drawn.at(-1), drawAvatar(bodyOf('heart'), 'gray', a.live.rig.state, 36));

  a.live.poke();
  assert.deepEqual(ticking(), { count: 1, running: true });
  for (let i = 0; i < 3000 && ticking().count; i++) pump(now += 33);
  assert.deepEqual(ticking(), { count: 0, running: false }, 'and it comes to rest again');
  a.detach();
});

test('under reduced motion it draws the calm pose, never subscribes, and a poke or a clip does nothing', () => {
  prefer(true);
  try {
    const resting = mounted({ shape: 'wedge', size: 72, rests: true });
    const front = mounted({ shape: 'wedge', size: 72, activity: 'thinking' });
    see(resting.el, true); see(front.el, true);
    assert.deepEqual(ticking(), { count: 0, running: false });
    assert.deepEqual(resting.drawn.at(-1), drawAvatar(bodyOf('wedge'), 'gray', stillState('wedge', 72), 72), 'the still\'s pose');
    assert.deepEqual(front.drawn.at(-1), drawAvatar(bodyOf('wedge'), 'gray', THINKING, 72), 'facing front, with the face of what it is doing');
    let poked = 0;
    front.live.rig.poke = () => { poked++; };
    front.live.poke();
    assert.equal(poked, 0);
    assert.equal(front.live.play('nod'), false);
    assert.deepEqual(ticking(), { count: 0, running: false });
    resting.detach(); front.detach();
  } finally { prefer(false); }
});

test('motion() after reduced motion is toggled redraws: the calm picture, then the rig again, ticking', () => {
  const a = mounted({ shape: 'star', size: 72, activity: 'thinking' });
  see(a.el, true);
  pump(5000); pump(5016); pump(5032);
  assert.equal(ticking().count, 1);
  prefer(true);
  assert.equal(ticking().running, false, 'the loop stops at once');
  const n = a.drawn.length;
  a.live.motion();
  assert.equal(a.drawn.length, n + 1);
  assert.deepEqual(a.drawn.at(-1), drawAvatar(bodyOf('star'), 'gray', THINKING, 72));
  assert.equal(ticking().count, 0, 'and it unsubscribes');
  prefer(false);
  a.live.motion();
  assert.equal(a.drawn.length, n + 2);
  assert.deepEqual(a.drawn.at(-1), drawAvatar(bodyOf('star'), 'gray', a.live.rig.state, 72));
  assert.deepEqual(ticking(), { count: 1, running: true });
  a.detach();
  assert.deepEqual(ticking(), { count: 0, running: false });
});

test('shape() before attach does nothing; attached it morphs; under reduced motion it builds a new rig', () => {
  const live = createLive({ shape: 'blob', size: 72 });
  const rig = live.rig;
  live.want({ shape: 'heart', size: 72 });
  live.shape();
  assert.equal(live.rig.state.body, bodyOf('blob'));
  assert.ok(!live.rig.state.morph, 'not morphing');

  const drawn = [];
  const detach = live.attach(element(), (d) => drawn.push(d));
  live.shape();
  assert.equal(live.rig, rig, 'the same rig');
  assert.equal(live.rig.state.body, bodyOf('heart'));
  assert.ok(live.rig.state.morph, 'morphing from the blob');

  prefer(true);
  try {
    live.want({ shape: 'star', size: 72 });
    live.shape();
    assert.notEqual(live.rig, rig, 'a new rig');
    assert.equal(live.rig.state.body, bodyOf('star'));
    assert.ok(!live.rig.state.morph, 'no morph');
    assert.deepEqual(drawn.at(-1), drawAvatar(bodyOf('star'), 'gray', FRONT, 72));
  } finally { prefer(false); }
  detach();
});

test('on mount the face is worn before the activity, so the activity\'s own face wins', () => {
  const a = mounted({ shape: 'blob', size: 72, face: 'happy', activity: 'thinking' });
  const faceFirst = new Rig({ seed: 1, body: bodyOf('blob') }), activityFirst = new Rig({ seed: 1, body: bodyOf('blob') });
  faceFirst.setFace('happy'); faceFirst.setActivity('thinking', null); faceFirst.rest(null);
  activityFirst.setActivity('thinking', null); activityFirst.rest(null); activityFirst.setFace('happy');
  for (let i = 0; i < 3; i++) { a.live.rig.step(100); faceFirst.step(100); activityFirst.step(100); }
  assert.deepEqual(a.live.rig.state, faceFirst.state);
  assert.notDeepEqual(faceFirst.state.face, activityFirst.state.face, 'the order matters');
  a.detach();
});

test('the controller, the hook, mount() and the coat use the shared frame loop only', () => {
  for (const file of ['live.ts', 'react.ts', 'mount.ts', 'coat/layer.ts', 'coat/renderer.ts', 'coat/mask.ts']) {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /requestAnimationFrame/, file);
  }
});

test('a rig built again under reduced motion keeps its face and what it is doing, and another name for the same body is no change', () => {
  const a = mounted({ shape: 'blob', size: 72, face: 'happy', activity: 'working' });
  prefer(true);
  try {
    a.live.want({ shape: 'heart', size: 72, face: 'happy', activity: 'working' });
    a.live.shape();
    const rebuilt = a.live.rig;
    // What the old rig was told, the new one is told too: when motion comes back it is working, happy underneath.
    const twin = new Rig({ seed: 1, body: bodyOf('heart') });
    twin.setFace('happy'); twin.setActivity('working', null); twin.rest(null);
    for (let i = 0; i < 5; i++) { rebuilt.step(100); twin.step(100); }
    assert.deepEqual(rebuilt.state, twin.state);
    // 'egg' is the teardrop's other name: the same body at the same size is no change, so no new rig either.
    a.live.want({ shape: 'teardrop', size: 72, face: 'happy', activity: 'working' });
    a.live.shape();
    const tear = a.live.rig;
    a.live.want({ shape: 'egg', size: 72, face: 'happy', activity: 'working' });
    assert.equal(bodyOf('egg'), bodyOf('teardrop'));
    a.live.shape();
    assert.equal(a.live.rig, tear, 'the same rig');
  } finally { prefer(false); }
  a.detach();
});

test('under reduced motion the still says what is going on: asleep with its eyes shut, and a mark if it has one', () => {
  prefer(true);
  try {
    const a = mounted({ shape: 'blob', size: 72, activity: 'sleeping', mark: true });
    see(a.el, true);
    const want = drawAvatar(bodyOf('blob'), 'gray', { ...FRONT, face: ACTIVITY_FACES.sleeping, lid: 0.1, fx: [{ kind: 'mark', u: 0, t: 0, dir: 1, amount: 1 }] }, 72);
    assert.deepEqual(a.drawn.at(-1), want);
    assert.ok(want.effects.length >= 1);
    assert.deepEqual(ticking(), { count: 0, running: false });
    a.detach();
  } finally { prefer(false); }
});

test('under reduced motion a new face, activity or mark redraws the still picture at once', () => {
  prefer(true);
  try {
    const a = mounted({ shape: 'blob', size: 72 });
    see(a.el, true);
    const n = a.drawn.length;
    a.live.want({ shape: 'blob', size: 72, mark: true, activity: 'thinking' });
    a.live.doing();
    assert.equal(a.drawn.length, n + 1);
    assert.ok(a.drawn.at(-1).effects?.length >= 1, 'the mark');
    a.live.want({ shape: 'blob', size: 72, face: 'happy' });
    a.live.face('happy');
    assert.deepEqual(a.drawn.at(-1), drawAvatar(bodyOf('blob'), 'gray', { ...FRONT, face: FACES.happy }, 72));
    a.detach();
  } finally { prefer(false); }
});

test('lookWithin: each edge of the area is a full look that way, a small avatar takes its share, and no look is longer than 1', async () => {
  const { lookWithin, LARGE, SMALL_LOOK } = await import('./live.ts');
  const reach = { left: 100, right: 300, up: 50, down: 200 };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // At the edge it is a full look, however far that edge is.
  assert.ok(near(lookWithin(LARGE, 300, 0, reach).x, 1) && near(lookWithin(LARGE, -100, 0, reach).x, -1));
  assert.ok(near(lookWithin(LARGE, 0, 50, reach).y, 1) && near(lookWithin(LARGE, 0, -200, reach).y, -1));
  // Halfway to an edge is further than half a look (eased), and a small one turns only its share.
  const half = lookWithin(LARGE, 150, 0, reach).x;
  assert.ok(half > 0.5 && half < 1, `halfway: ${half}`);
  assert.ok(near(lookWithin(LARGE - 1, 300, 0, reach).x, SMALL_LOOK));
  // On its middle it looks ahead; in a corner the look keeps its direction and is 1 long at most.
  assert.deepEqual(lookWithin(LARGE, 0, 0, reach), { x: 0, y: 0 });
  const corner = lookWithin(LARGE, 300, 50, reach);
  assert.ok(Math.hypot(corner.x, corner.y) <= 1 + 1e-9 && near(corner.x, corner.y), `corner: ${corner.x}, ${corner.y}`);
  // An edge on its own middle is not a division by nothing.
  const flat = lookWithin(LARGE, 5, 0, { left: 0, right: 0, up: 0, down: 0 });
  assert.ok(Number.isFinite(flat.x) && flat.x > 0);
});

test('with followIn it follows the pointer only while the pointer is inside that element', async () => {
  const { pointer } = await import('./ticker.ts');
  globalThis.window = { addEventListener() {}, innerWidth: 1600, innerHeight: 900 };
  globalThis.document.documentElement = { addEventListener() {} };
  // The avatar's box is 0..72 (middle 36, 36); the card round it is 0..200 by 0..150.
  const card = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150 }) };
  const { live, el, detach } = mounted({ shape: 'blob', size: 72, follow: true, followIn: card, seed: 1 });
  see(el, true);
  const move = (x, y) => { pointer.x = x; pointer.y = y; pointer.on = true; pointer.moves++; };
  let now = 1000;
  const run = (ms) => { for (const end = now + ms; now < end; now += 16) pump(now); };
  // Inside the card, to its right: it looks right.
  move(190, 36);
  run(1500);
  const inside = live.rig.state.eye.x;
  assert.ok(inside > 0.3, `inside the card it looks toward the pointer: ${inside}`);
  // Out of the card, far to the right on the page: it looks ahead again, not at the pointer.
  move(1500, 36);
  run(2500);
  const outside = live.rig.state.eye.x;
  assert.ok(Math.abs(outside) < 0.15, `outside the card it looks ahead: ${outside}`);
  detach();
});

test('followReach and followMost: a shorter reach turns sooner, most caps the turn, and unset is the old look', async () => {
  const { lookFor, LARGE, SMALL_LOOK } = await import('./live.ts');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // Unset, nothing changes: a small one takes SMALL_LOOK at most, half the window off.
  assert.deepEqual(lookFor(30, 300, 0, 1600, {}), lookFor(30, 300, 0, 1600));
  assert.ok(near(lookFor(30, 2000, 0, 1600).x, SMALL_LOOK));
  // A short reach: 160 px off is all of `most`, and halfway is well past half of it.
  assert.ok(near(lookFor(30, 160, 0, 1600, { reach: 160, most: 0.9 }).x, 0.9));
  const half = lookFor(30, 80, 0, 1600, { reach: 160, most: 0.9 }).x;
  assert.ok(half > 0.45 && half < 0.9, `halfway: ${half}`);
  assert.ok(half > lookFor(30, 80, 0, 1600).x * 3, 'keener than the plain small look');
  // Most is kept to 0..1, and a reach of nothing is not a division by zero.
  assert.ok(near(lookFor(LARGE, 5000, 0, 1600, { most: 7 }).x, 1));
  assert.ok(near(lookFor(LARGE, 5000, 0, 1600, { most: -1 }).x, 0));
  assert.ok(Number.isFinite(lookFor(30, 10, 10, 1600, { reach: 0 }).x));
  // The direction is kept: no look is longer than `most`.
  const d = lookFor(30, 400, 300, 1600, { reach: 160, most: 0.9 });
  assert.ok(Math.hypot(d.x, d.y) <= 0.9 + 1e-9);
});

test('a fluffy avatar is drawn with its coat and a flat one without, the rest the same; the first picture is flat', () => {
  const a = mounted({ shape: 'blob', size: 72, material: 'fluffy' });
  const { coat, ...rest } = a.drawn.at(-1);
  assert.ok(coat && coat.opacity === 1, 'what a coat needs, in the drawing');
  assert.deepEqual(rest, drawAvatar(bodyOf('blob'), 'gray', a.live.rig.state, 72));
  assert.equal(a.live.first.coat, undefined);
  a.live.want({ shape: 'blob', size: 72 });
  a.live.motion();
  assert.equal(a.drawn.at(-1).coat, undefined, 'flat again at once');
  a.detach();
});

test('a resting avatar that is powered stays awake and ticks; turned off, it comes to rest again', () => {
  const props = { shape: 'heart', size: 72, rests: true };
  const a = mounted(props);
  see(a.el, true);
  assert.ok(a.live.rig.resting);
  assert.deepEqual(ticking(), { count: 0, running: false });
  a.live.want({ ...props, ultra: true }); a.live.doing();
  assert.deepEqual(ticking(), { count: 1, running: true }, 'awake');
  let now = 1000;
  for (let i = 0; i < 300; i++) {
    pump(now += 16);
    assert.equal(ticking().count, 1, `still awake at ${now} ms`);
  }
  assert.equal(a.drawn.at(-1).ultra?.amount, 1, 'powered');
  assert.ok(a.drawn.at(-1).effects.some((e) => e.role === 'halo'));
  a.live.want(props); a.live.doing();
  for (let i = 0; i < 3000 && ticking().count; i++) pump(now += 33);
  assert.ok(a.live.rig.resting, 'at rest again');
  assert.equal(a.drawn.at(-1).ultra, undefined);
  assert.deepEqual(ticking(), { count: 0, running: false });
  a.detach();
});

test('under reduced motion a powered avatar\'s still is powered: the bands where the study froze them, one twinkle lit, no star, no float', async () => {
  const { CALM_ULTRA } = await import('./live.ts');
  prefer(true);
  try {
    const a = mounted({ shape: 'blob', size: 96, ultra: true, mark: true });
    see(a.el, true);
    const fx = [{ kind: 'mark', u: 0, t: 0, dir: 1, amount: 1 }, { kind: 'ultra', u: 0, t: CALM_ULTRA.t, dir: 1, amount: 1 }];
    const want = drawAvatar(bodyOf('blob'), 'gray', { ...FRONT, ultra: { amount: 1, phase: CALM_ULTRA.phase }, fx }, 96);
    assert.deepEqual(a.drawn.at(-1), want);
    assert.deepEqual(want.ultra, { amount: 1, phase: 0.3 });
    // The halo, and one twinkle: its rainbow and its white core (and the mark's dot and its ring).
    assert.deepEqual(want.effects.map((e) => e.role).sort(), ['accent', 'accent', 'halo', 'light', 'rainbow']);
    assert.ok(!want.effects.some((e) => e.role === 'shadow'), 'no float, so no shadow');
    assert.deepEqual(ticking(), { count: 0, running: false });
    a.detach();
  } finally { prefer(false); }
});

test('progress: the progress figure fills to the amount given, and a new amount moves it on without starting over', () => {
  const props = { shape: 'blob', size: 72, activity: 'working', form: 'progress', progress: 0.4 };
  const a = mounted(props);
  see(a.el, true);
  let now = 50000;
  const run = (ms) => { for (const end = now + ms; now < end;) pump(now += 40); };
  run(1600);
  const at = a.live.rig.state.figure;
  assert.equal(at?.form, 'progress');
  assert.equal(at.k, 1, 'the figure is up');
  assert.ok(Math.abs(at.progress - 0.4) < 0.01, `filled to 0.4, not ${at.progress}`);
  const before = a.drawn.at(-1).body;
  a.live.want({ ...props, progress: 0.9 });
  a.live.doing();
  run(40);
  assert.equal(a.live.rig.state.figure.k, 1, 'a new amount does not take the figure down');
  run(1200);
  assert.ok(Math.abs(a.live.rig.state.figure.progress - 0.9) < 0.01, 'filled on to 0.9');
  assert.notEqual(a.drawn.at(-1).body, before, 'and it is drawn fuller');
  // Unset is 0: the empty track again.
  a.live.want({ ...props, progress: undefined });
  a.live.doing();
  run(1200);
  assert.equal(a.live.rig.state.figure.progress, 0);
  a.detach();
});
