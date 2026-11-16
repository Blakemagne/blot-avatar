// createLive: a live avatar's rig on the one shared frame loop. Nothing ticks before it is seen, at rest, or
// under reduced motion; one under 48 px is drawn at most 30 times a second. Run with: npm test
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
const { bodyOf, stillState } = await import('./still.ts');

/** Attach and run the steps React's effects run on mount, in their order. Returns what was drawn, and the way to stop. */
function mounted(props) {
  const live = createLive(props), el = element(), drawn = [];
  const detach = live.attach(el, (d) => drawn.push(d));
  live.motion(); live.follow(props.follow); live.shape(); live.face(props.face); live.doing();
  return { live, el, drawn, detach };
}
const FRONT = { pose: { yaw: 0, pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };

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
    assert.deepEqual(front.drawn.at(-1), drawAvatar(bodyOf('wedge'), 'gray', FRONT, 72), 'facing front');
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
  assert.deepEqual(a.drawn.at(-1), drawAvatar(bodyOf('star'), 'gray', FRONT, 72));
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

test('the controller, the hook and mount() use the shared frame loop only', () => {
  for (const file of ['live.ts', 'react.ts', 'mount.ts']) {
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
