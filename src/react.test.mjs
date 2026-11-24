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

/** Just enough SVG for a group the hook paints into. */
class G {
  constructor(tag = 'g') { this.tag = tag; this.style = {}; this.attrs = new Map(); this.children = []; this.parent = null; this.ownerDocument = { createElementNS: (_, t) => new G(t) }; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
}

test('ultra: the skin ref is painted while powered and the eyes go to ink from fxPaint; off, it is emptied and the eyes are given back; never powered, nothing is touched', async () => {
  const { ULTRA_INK } = await import('./ultra.ts');
  const fxPaint = { fill: '#FD690F', eyeFill: '#FFFFFF' };
  const mounted = (props) => {
    const r = renderer(useLiveAvatar), a = r.render(props);
    a.host.current = element();
    for (const p of a.paths) p.current = element();
    a.skin.current = new G();
    a.fx[0].current = new G(); a.fx[1].current = new G();
    r.commit();
    return { r, a };
  };
  const drawAfter = (a, ms) => { for (let t = 0; t < ms; t += 16) a.live.rig.step(16); a.live.motion(); };

  const plain = mounted({ shape: 'blob', size: 72, fxPaint });
  drawAfter(plain.a, 1500);
  assert.equal(plain.a.skin.current.children.length, 0);
  assert.deepEqual(plain.a.skin.current.attrs.size, 0);
  assert.deepEqual([plain.a.paths[1].current.style.fill, plain.a.paths[2].current.style.fill], [undefined, undefined], 'the eyes keep the markup\'s colour');
  plain.r.unmount();

  const props = { shape: 'blob', size: 72, fxPaint, ultra: true }, { r, a } = mounted(props);
  drawAfter(a, 1500);
  const skin = a.skin.current;
  assert.deepEqual(skin.children.map((c) => c.tag), ['defs', 'path', 'path', 'path', 'path']);
  assert.equal(skin.getAttribute('opacity'), '1');
  assert.deepEqual([a.paths[1].current.style.fill, a.paths[2].current.style.fill], [ULTRA_INK, ULTRA_INK]);
  assert.ok(a.fx[0].current.children.some((p) => /-halo\)$/.test(p.style.fill)), 'the halo, in the skin\'s own paint');
  // Turned off: the hook re-renders with it off, and after the fade the skin is empty and the eyes are the markup's.
  r.render({ ...props, ultra: false });
  r.commit();
  drawAfter(a, 700);
  assert.equal(skin.children.length, 0);
  assert.deepEqual([a.paths[1].current.style.fill, a.paths[2].current.style.fill], ['', '']);
  r.unmount();

  // Powered with no skin <g> (markup from before ultra): the body keeps its colour, so the eyes keep theirs.
  const bare = renderer(useLiveAvatar), b = bare.render({ ...props, fxPaint: { fill: '#111111', eyeFill: '#FFFFFF' } });
  b.host.current = element();
  for (const p of b.paths) p.current = element();
  bare.commit();
  drawAfter(b, 1500);
  assert.ok(b.live.rig.state.ultra, 'powered');
  assert.deepEqual([b.paths[1].current.style.fill, b.paths[2].current.style.fill], [undefined, undefined], 'no skin, no ink');
  bare.unmount();

  // fxPaint taken away while powered, then turned off: the ink still comes off the eyes.
  const gone = mounted(props);
  drawAfter(gone.a, 1500);
  assert.equal(gone.a.paths[1].current.style.fill, ULTRA_INK);
  gone.r.render({ ...props, fxPaint: undefined }); gone.r.commit();
  gone.r.render({ ...props, fxPaint: undefined, ultra: false }); gone.r.commit();
  drawAfter(gone.a, 1500);
  assert.equal(gone.a.skin.current.children.length, 0);
  assert.deepEqual([gone.a.paths[1].current.style.fill, gone.a.paths[2].current.style.fill], ['', '']);
  gone.r.unmount();
});
