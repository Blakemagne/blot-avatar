// The one frame loop every live avatar shares: it runs only while something is subscribed, the tab is showing
// and the person has not asked for reduced motion. Run with: npm test -w web
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in page: animation frames that run when pumped, a tab that can be hidden, a reduced-motion setting.
let frames = [], ids = 0;
globalThis.requestAnimationFrame = (fn) => { frames.push({ id: ++ids, fn }); return ids; };
globalThis.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
const page = { hidden: false, on: {}, addEventListener(type, fn) { this.on[type] = fn; } };
globalThis.document = page;
const setting = { matches: false, asked: [], on: [], addEventListener(type, fn) { if (type === 'change') this.on.push(fn); } };
globalThis.matchMedia = (query) => { setting.asked.push(query); return setting; };
const prefer = (reduced) => { setting.matches = reduced; for (const fn of setting.on) fn(); };
const hide = (hidden) => { page.hidden = hidden; page.on.visibilitychange(); };
/** Run the frames that are due, as the browser would. */
const pump = (now) => { const due = frames; frames = []; for (const f of due) f.fn(now); };

const { onFrame, onMotion, reducedMotion, ticking } = await import('./ticker.ts');

test('the loop runs while something is subscribed, and stops with the last one', () => {
  assert.deepEqual(ticking(), { count: 0, running: false });
  const seen = [];
  const stop = onFrame((now) => seen.push(now));
  assert.deepEqual(ticking(), { count: 1, running: true });
  pump(16); pump(32);
  assert.deepEqual(seen, [16, 32]);
  assert.equal(frames.length, 1, 'one frame asked for at a time');
  stop();
  assert.deepEqual(ticking(), { count: 0, running: false });
  assert.equal(frames.length, 0);
});

test('reduced motion turned on while the app is open stops every avatar, and turned off they carry on', () => {
  const a = [], b = [];
  const stopA = onFrame((now) => a.push(now)), stopB = onFrame((now) => b.push(now));
  const changes = [];
  const unheard = onMotion(() => changes.push(reducedMotion()));
  pump(16);
  assert.deepEqual([a, b], [[16], [16]]);
  assert.equal(reducedMotion(), false);

  prefer(true);
  assert.equal(reducedMotion(), true);
  assert.deepEqual(ticking(), { count: 2, running: false }, 'both are still subscribed, and the loop is stopped');
  assert.equal(frames.length, 0, 'the frame that was due is cancelled');
  pump(32);
  assert.deepEqual([a, b], [[16], [16]], 'nothing ticks');
  assert.deepEqual(changes, [true], 'and each avatar is told, so it can show its still picture');
  // One that subscribes now (an avatar mounted afterwards) does not start the loop either.
  const c = [];
  const stopC = onFrame((now) => c.push(now));
  assert.deepEqual(ticking(), { count: 3, running: false });
  assert.equal(frames.length, 0);
  // Nor does the tab coming back from the background.
  hide(true); hide(false);
  assert.equal(ticking().running, false);

  prefer(false);
  assert.deepEqual(ticking(), { count: 3, running: true });
  pump(48);
  assert.deepEqual([a, b, c], [[16, 48], [16, 48], [48]]);
  assert.deepEqual(changes, [true, false]);
  // Once it stops listening it is not told again.
  unheard();
  prefer(true); prefer(false);
  assert.deepEqual(changes, [true, false]);
  stopA(); stopB(); stopC();
  assert.deepEqual(ticking(), { count: 0, running: false });
  // The setting is asked for once, by its proper name.
  assert.deepEqual(setting.asked, ['(prefers-reduced-motion: reduce)']);
  assert.equal(setting.on.length, 1);
});

test('a hidden tab does not tick, and picks up again when it is shown', () => {
  const seen = [];
  const stop = onFrame((now) => seen.push(now));
  hide(true);
  assert.equal(ticking().running, false);
  pump(16);
  assert.deepEqual(seen, []);
  hide(false);
  assert.equal(ticking().running, true);
  pump(32);
  assert.deepEqual(seen, [32]);
  stop();
});

test('soon() runs one job a task, first come first served, and a job dropped before its turn never runs', async () => {
  const { soon } = await import('./ticker.ts');
  const ran = [], task = () => new Promise((done) => setTimeout(done, 0));
  soon(() => ran.push(1));
  const drop = soon(() => ran.push(2));
  soon(() => ran.push(3));
  drop();
  await task();
  assert.deepEqual(ran, [1]);
  await task();
  assert.deepEqual(ran, [1, 3]);
  await task();
  assert.deepEqual(ran, [1, 3]);
});
