// useLiveAvatar with a fluffy material, run through a stand-in for React's renderer (refs, effects in order, an
// external store), on a stand-in page with no WebGL2. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';

let frames = [], ids = 0;
globalThis.requestAnimationFrame = (fn) => { frames.push({ id: ++ids, fn }); return ids; };
globalThis.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.IntersectionObserver = class { observe() {} unobserve() {} };
globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {} };
/** Every WebGL2 context asked for: none can be had here, as on a page without it. */
const asked = [];
const canvas = () => ({ style: {}, width: 0, height: 0, addEventListener() {}, removeEventListener() {}, getContext(kind) { asked.push(kind); return null; } });
globalThis.document = { hidden: false, addEventListener() {}, createElement: (tag) => { assert.equal(tag, 'canvas'); return canvas(); } };

const { useLiveAvatar } = await import('./react.ts');

/** Call `hook` as React would render it: refs kept between renders, effects run after, in order, when their deps change. */
function renderer(hook) {
  const slots = [], dispatcher = {
    useRef: (v) => (slots[at] ??= { current: v }, slots[at++]),
    useSyncExternalStore: (_, get) => (at++, get()),
    useEffect(fn, deps) {
      const k = at++, s = slots[k];
      if (s && deps && deps.every((d, j) => Object.is(d, s.deps[j]))) return;
      effects.push(() => { s?.cleanup?.(); const c = fn(); slots[k] = { deps, cleanup: typeof c === 'function' ? c : undefined }; });
    },
  };
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let at = 0, effects = [];
  return {
    render(p) {
      at = 0; effects = [];
      const was = internals.current;
      internals.current = dispatcher;
      try { return hook(p); } finally { internals.current = was; }
    },
    commit() { for (const run of effects) run(); },
    unmount() { for (const s of slots) s?.cleanup?.(); },
  };
}
const element = () => ({ style: {}, setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }) });
const tick = () => new Promise((done) => setTimeout(done, 5));

test('fluffy without a <canvas ref={coat}> is flat and sets up no WebGL2; with one, the coat is tried', async () => {
  const without = renderer(useLiveAvatar), props = { shape: 'blob', size: 72, material: 'fluffy' };
  const a = without.render(props);
  a.host.current = element();
  for (const p of a.paths) p.current = element();
  without.commit();
  for (let i = 0; i < 3; i++) { await tick(); without.render(props); without.commit(); }
  assert.deepEqual(asked, [], 'no canvas: no context asked for, and nothing queued for one');
  without.unmount();

  const withCanvas = renderer(useLiveAvatar), b = withCanvas.render(props);
  b.host.current = element();
  for (const p of b.paths) p.current = element();
  b.coat.current = canvas();
  withCanvas.commit();
  assert.deepEqual([b.coat.current.style.position, b.coat.current.style.display], ['absolute', 'none']);
  await tick();
  assert.deepEqual(asked, ['webgl2'], 'with a canvas the coat asks for WebGL2 (and, with none here, stays flat)');
  assert.equal(b.coat.current.style.display, 'none');
  withCanvas.unmount();
});

test('the documented React markup hides the coat\'s canvas from the first paint', () => {
  for (const file of ['../README.md', '../site/main.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const canvases = src.match(/<canvas ref=\{coat\}[^>]*\/>/g) ?? [];
    assert.ok(canvases.length > 0, `${file}: a coat canvas`);
    for (const c of canvases) assert.match(c, /display: 'none'/, `${file}: ${c}`);
  }
  assert.match(readFileSync(new URL('./react.ts', import.meta.url), 'utf8'), /style=\{\{ position: 'absolute', display: 'none' \}\}/);
});
