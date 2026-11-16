// mount(): a live avatar on any page, no framework. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in page: frames that run when pumped, a reduced-motion setting, an on-screen observer the test
// reports to, and just enough DOM for one host element.
let frames = [], ids = 0;
globalThis.requestAnimationFrame = (fn) => { frames.push({ id: ++ids, fn }); return ids; };
globalThis.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
const setting = { matches: false, on: [], addEventListener(type, fn) { if (type === 'change') this.on.push(fn); } };
globalThis.matchMedia = () => setting;
const prefer = (reduced) => { setting.matches = reduced; for (const fn of setting.on) fn(); };
let report = null;
globalThis.IntersectionObserver = class { constructor(cb) { report = cb; } observe() {} unobserve() {} };
const see = (el, on) => report([{ target: el, isIntersecting: on }]);
const pump = (now) => { const due = frames; frames = []; for (const f of due) f.fn(now); };

class El {
  constructor(tag, ns) { this.tag = tag; this.ns = ns; this.style = {}; this.attrs = new Map(); this.children = []; this.parent = null; this.on = new Map(); this.ownerDocument = page; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  addEventListener(type, fn) { if (!this.on.has(type)) this.on.set(type, new Set()); this.on.get(type).add(fn); }
  removeEventListener(type, fn) { this.on.get(type)?.delete(fn); }
  fire(type, e = {}) { for (const fn of [...(this.on.get(type) ?? [])]) fn(e); }
  listeners() { let n = 0; for (const s of this.on.values()) n += s.size; return n; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 72, height: 72 }; }
}
const page = { hidden: false, on: {}, addEventListener(type, fn) { this.on[type] = fn; }, createElementNS: (ns, tag) => new El(tag, ns) };
globalThis.document = page;
page.documentElement = { addEventListener() {} };
globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {} };
globalThis.getComputedStyle = (el) => ({ position: el.style.position || 'static' });

const { mount } = await import('./mount.ts');
const { ticking } = await import('./ticker.ts');
const { VIEW_BOX, colours } = await import('./engine/index.ts');
const { OVERDRAW } = await import('./still.ts');

const paths = (host) => host.children[0].children;

test('one svg with three paths, drawn as the first picture, in a slot of size px', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'heart', size: 72 });
  assert.equal(host.children.length, 1);
  const [svg] = host.children;
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('viewBox'), VIEW_BOX);
  assert.equal(svg.getAttribute('width'), String(72 * OVERDRAW));
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.style.position, 'absolute');
  assert.deepEqual(paths(host).map((p) => p.tag), ['path', 'path', 'path']);
  assert.deepEqual(paths(host).map((p) => p.getAttribute('d')), [m.live.first.body, ...m.live.first.eyes]);
  const c = colours('#FD690F');
  assert.deepEqual(paths(host).map((p) => p.style.fill), [c.fill, c.eyeFill, c.eyeFill]);
  assert.deepEqual([host.style.width, host.style.height, host.style.position], ['72px', '72px', 'relative']);
  assert.equal(host.getAttribute('role'), null, 'not a button unless asked');
  m.destroy();
});

test('any CSS colour works, and explicit fills win', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 36, color: 'tomato' });
  assert.deepEqual(paths(host).map((p) => p.style.fill), ['tomato', '#FFFFFF', '#FFFFFF']);
  m.update({ fill: 'var(--ink)', eyeFill: 'var(--on-ink)' });
  assert.deepEqual(paths(host).map((p) => p.style.fill), ['var(--ink)', 'var(--on-ink)', 'var(--on-ink)']);
  m.destroy();
});

test('update() acts only on what changed, in React\'s order', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72 });
  const calls = [];
  for (const k of ['motion', 'follow', 'shape', 'face', 'doing']) {
    const was = m.live[k];
    m.live[k] = (...a) => { calls.push(k); return was(...a); };
  }
  m.update({ activity: 'thinking' });
  assert.deepEqual(calls, ['doing']);
  calls.length = 0;
  m.update({ activity: 'thinking' });
  assert.deepEqual(calls, [], 'the same value again is no change');
  m.update({ face: 'happy' });
  assert.deepEqual(calls, ['face']);
  calls.length = 0;
  m.update({ size: 36 });
  assert.deepEqual(calls, ['shape', 'doing']);
  assert.deepEqual([host.style.width, host.style.height], ['36px', '36px']);
  assert.equal(host.children[0].getAttribute('width'), String(36 * OVERDRAW));
  calls.length = 0;
  m.update({ follow: true, shape: 'star' });
  assert.deepEqual(calls, ['follow', 'shape', 'doing']);
  assert.ok(m.live.rig.state.morph, 'a new shape morphs');
  calls.length = 0;
  m.update({ color: '#000000' });
  assert.deepEqual(calls, [], 'a colour only repaints');
  assert.equal(paths(host)[0].style.fill, '#000000');
  m.destroy();
});

test('a pokeable avatar is a button with a label; Enter and Space poke it, a held key does not', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72, pokeable: true, label: 'Ada' });
  assert.deepEqual(['role', 'tabindex', 'aria-label'].map((a) => host.getAttribute(a)), ['button', '0', 'Poke Ada']);
  let poked = 0;
  m.live.rig.poke = () => { poked++; };
  host.fire('click');
  let prevented = 0;
  const key = (k, repeat = false) => host.fire('keydown', { key: k, repeat, preventDefault: () => { prevented++; } });
  key('Enter'); key(' '); key('Enter', true); key('a');
  assert.equal(poked, 3);
  assert.equal(prevented, 3);
  m.update({ label: undefined });
  assert.equal(host.getAttribute('aria-label'), 'Poke the avatar');

  // Under reduced motion a poke would do nothing, so it is not a button.
  prefer(true);
  try {
    assert.deepEqual(['role', 'tabindex', 'aria-label'].map((a) => host.getAttribute(a)), [null, null, null]);
    host.fire('click');
    assert.equal(poked, 3);
  } finally { prefer(false); }
  assert.equal(host.getAttribute('role'), 'button', 'and it is one again once motion is allowed');
  m.destroy();
});

test('destroy() stops it ticking and leaves the host as it was found', () => {
  const host = new El('div');
  host.style.width = '10px';
  const m = mount(host, { shape: 'blob', size: 72, activity: 'thinking', pokeable: true });
  see(host, true);
  assert.deepEqual(ticking(), { count: 1, running: true });
  pump(1000); pump(1016);
  m.destroy();
  assert.deepEqual(ticking(), { count: 0, running: false });
  assert.equal(frames.length, 0);
  assert.deepEqual(host.children, []);
  assert.deepEqual([host.style.width, host.style.height, host.style.position], ['10px', undefined, undefined]);
  assert.equal(host.attrs.size, 0);
  assert.equal(host.listeners(), 0);
  // Gone, it does nothing more.
  m.update({ activity: 'working' });
  m.poke();
  assert.equal(m.play('nod'), false);
  see(host, true);
  assert.deepEqual(ticking(), { count: 0, running: false });
  m.destroy();
});

test('a host that is already placed keeps its position', () => {
  const host = new El('div');
  host.style.position = 'absolute';
  const m = mount(host, { shape: 'blob', size: 24 });
  assert.equal(host.style.position, 'absolute');
  m.destroy();
  assert.equal(host.style.position, 'absolute');
});

test('a pokeable avatar gives the host back its own role, tabindex and label', () => {
  const host = new El('div');
  host.setAttribute('role', 'img'); host.setAttribute('aria-label', 'Ada');
  const m = mount(host, { shape: 'blob', size: 72, pokeable: true, label: 'Ada' });
  assert.equal(host.getAttribute('role'), 'button');
  assert.equal(host.getAttribute('tabindex'), '0');
  m.update({ pokeable: false });
  assert.deepEqual([host.getAttribute('role'), host.getAttribute('tabindex'), host.getAttribute('aria-label')], ['img', null, 'Ada']);
  m.update({ pokeable: true });
  m.destroy();
  assert.deepEqual([host.getAttribute('role'), host.getAttribute('tabindex'), host.getAttribute('aria-label')], ['img', null, 'Ada']);
});

test('one avatar per host: a second mount throws until the first is destroyed', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 24 });
  assert.throws(() => mount(host, { shape: 'heart', size: 24 }), /already has an avatar/);
  m.destroy();
  const again = mount(host, { shape: 'heart', size: 24 });
  again.destroy();
});
