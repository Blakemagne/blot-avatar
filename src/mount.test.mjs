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
  insertBefore(c, ref) { c.remove(); c.parent = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
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
const { RIM, ULTRA_INK } = await import('./ultra.ts');

/** The body path and the two eye paths (between the effects' two groups). */
const paths = (host) => host.children[0].children.filter((c) => c.tag === 'path');

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
  assert.deepEqual(host.children[0].children.map((p) => p.tag), ['g', 'path', 'path', 'path', 'g']);
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
  m.update({ progress: 0.5 });
  assert.deepEqual(calls, ['doing'], 'a new progress is told to the rig');
  calls.length = 0;
  m.update({ progress: 0.5 });
  assert.deepEqual(calls, []);
  m.update({ color: '#000000' });
  assert.deepEqual(calls, [], 'a colour only repaints');
  assert.equal(paths(host)[0].style.fill, '#000000');
  m.destroy();
});

test('a pokeable avatar is a button with a label; Enter and Space poke it, a held key does not', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72, pokeable: true, label: 'Ada' });
  assert.deepEqual(['role', 'tabindex', 'aria-label'].map((a) => host.getAttribute(a)), ['button', '0', 'poke Ada']);
  let poked = 0;
  m.live.rig.poke = () => { poked++; };
  host.fire('click');
  let prevented = 0;
  const key = (k, repeat = false) => host.fire('keydown', { key: k, repeat, preventDefault: () => { prevented++; } });
  key('Enter'); key(' '); key('Enter', true); key('a');
  assert.equal(poked, 3);
  assert.equal(prevented, 3);
  m.update({ label: undefined });
  assert.equal(host.getAttribute('aria-label'), 'poke the avatar');

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

test('effects are painted into a group behind the body and one in front, reusing their paths, in the role colours', async () => {
  const { paintEffects, glowFilter } = await import('./paint.ts');
  const back = new El('g'), front = new El('g');
  const paint = { fill: '#FD690F', eyeFill: '#FFFFFF', accent: '#7C5CFF' };
  const d = { body: '', eyes: ['', ''], effects: [
    { layer: 'back', role: 'shadow', opacity: 0.2, d: 'M0 0L1 0L1 1Z' },
    { layer: 'front', role: 'accent', opacity: 1, d: 'M0 0L2 0L2 2Z' },
    { layer: 'front', role: 'body', opacity: 0.5, d: 'M0 0L3 0L3 3Z' },
  ] };
  paintEffects(back, front, d, paint);
  assert.deepEqual(back.children.map((p) => [p.getAttribute('d'), p.style.fill, p.style.opacity]), [['M0 0L1 0L1 1Z', '#000', '0.2']]);
  assert.deepEqual(front.children.map((p) => [p.style.fill, p.style.opacity]), [['#7C5CFF', '1'], ['#FD690F', '0.5']]);
  const kept = front.children[0];
  paintEffects(back, front, { ...d, effects: [d.effects[1]] }, { ...paint, accent: undefined });
  assert.equal(back.children.length, 0);
  assert.equal(front.children.length, 1);
  assert.equal(front.children[0], kept, 'the same path, rewritten');
  assert.equal(kept.style.fill, '#FD690F', 'no accent: the body\'s colour');
  paintEffects(back, front, { body: '', eyes: ['', ''] }, paint);
  assert.equal(front.children.length, 0);
  assert.equal(glowFilter({ glow: 0 }, 72, paint), '');
  assert.match(glowFilter({ glow: 0.5 }, 72, paint), /^drop-shadow\(0 0 [\d.]+px #7C5CFF\)$/);
});

test('a mounted avatar with a mark draws it in front of the body, and the mark goes when it is turned off', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72, mark: true, accent: '#7C5CFF' });
  see(host, true);
  for (let t = 1000; t < 2600; t += 16) pump(t);
  const front = host.children[0].children.at(-1);
  assert.ok(front.children.length >= 1 && front.children.every((p) => p.style.fill === '#7C5CFF'), `${front.children.length} parts`);
  m.update({ mark: false });
  for (let t = 2600; t < 5000; t += 16) pump(t);
  assert.equal(front.children.length, 0);
  m.destroy();
});

/** An element as plain data: its tag, attributes, style and children, to compare two avatars' whole trees. */
const tree = (el) => ({ tag: el.tag, attrs: Object.fromEntries(el.attrs), style: { ...el.style }, children: el.children.map(tree) });

test('fluffy where no coat can be drawn (here: no WebGL2, as on a server) is exactly the flat avatar, frame by frame', () => {
  const flat = new El('div'), fluffy = new El('div');
  const a = mount(flat, { shape: 'heart', size: 72, activity: 'thinking' });
  const b = mount(fluffy, { shape: 'heart', size: 72, activity: 'thinking', material: 'fluffy' });
  assert.deepEqual(tree(fluffy), tree(flat));
  see(flat, true); see(fluffy, true);
  for (let t = 1000; t < 1500; t += 16) {
    pump(t);
    assert.deepEqual(tree(fluffy), tree(flat), `at ${t} ms`);
  }
  a.destroy(); b.destroy();
});

test('a fluffy avatar\'s destroy() stops it and leaves the host as it was found', () => {
  const host = new El('div');
  host.style.width = '10px';
  const m = mount(host, { shape: 'blob', size: 72, material: 'fluffy', activity: 'thinking', pokeable: true });
  see(host, true);
  pump(1000); pump(1016);
  m.destroy();
  assert.deepEqual(ticking(), { count: 0, running: false });
  assert.deepEqual(host.children, []);
  assert.deepEqual([host.style.width, host.style.height, host.style.position], ['10px', undefined, undefined]);
  assert.equal(host.attrs.size, 0);
  assert.equal(host.listeners(), 0);
});

test('the material switches on a mounted avatar, back and forth, and it is drawn again at once', () => {
  const flat = new El('div'), host = new El('div');
  const a = mount(flat, { shape: 'blob', size: 72 });
  const m = mount(host, { shape: 'blob', size: 72 });
  let drawn = 0;
  const was = m.live.motion;
  m.live.motion = () => { drawn++; return was(); };
  m.update({ material: 'fluffy' });
  assert.equal(drawn, 1);
  assert.deepEqual(tree(host), tree(flat), 'no coat can be drawn here, so it is flat');
  m.update({ material: 'fluffy' });
  assert.equal(drawn, 1, 'the same material again is no change');
  m.update({ material: 'flat' });
  m.update({ material: 'fluffy' });
  m.update({ material: 'flat' });
  assert.equal(drawn, 4);
  assert.deepEqual(tree(host), tree(flat));
  a.destroy(); m.destroy();
  assert.deepEqual(host.children, []);
});

/** A tree with each skin's id written the same way, to compare two avatars' skins. */
const sameIds = (t) => JSON.parse(JSON.stringify(t).replace(/blot-ultra-\d+/g, 'ULTRA'));

test('ultracode: an avatar never powered keeps the DOM it always had, and ultra: false is no change', () => {
  const plain = new El('div'), off = new El('div');
  const a = mount(plain, { shape: 'heart', size: 72, mark: true, accent: '#7C5CFF' });
  const b = mount(off, { shape: 'heart', size: 72, mark: true, accent: '#7C5CFF', ultra: false });
  see(plain, true); see(off, true);
  for (let t = 1000; t < 2500; t += 16) {
    if (t === 1800) b.update({ ultra: false });
    pump(t);
    assert.deepEqual(tree(off), tree(plain), `at ${t} ms`);
  }
  assert.deepEqual(off.children[0].children.map((c) => c.tag), ['g', 'path', 'path', 'path', 'g'], 'no skin group');
  a.destroy(); b.destroy();
});

test('ultracode: powering adds one skin group right after the body path, painted on every frame, and the eyes go to ink; off, it fades and the group is emptied', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72 });
  see(host, true);
  const svg = host.children[0], [back, body, left, right, front] = svg.children;
  let t = 1000;
  const run = (ms, each = () => {}) => { for (const end = t + ms; t < end; t += 16) { pump(t); each(); } };
  run(200);
  m.update({ ultra: true });
  run(150);
  assert.deepEqual(svg.children.map((c) => c.tag), ['g', 'path', 'path', 'path', 'g'], 'nothing yet while the star drops in');
  assert.ok(front.children.some((p) => p.style.fill === '#FFFFFF'), 'the star, in white');
  run(1500);
  assert.deepEqual(svg.children.map((c) => c.tag), ['g', 'path', 'g', 'path', 'path', 'g'], 'one skin group, right after the body path');
  const skin = svg.children[2], [defs, , rainbow, sheen] = skin.children, bands = defs.children[0], id = bands.getAttribute('id');
  assert.deepEqual(skin.children.map((c) => c.tag), ['defs', 'path', 'path', 'path', 'path']);
  assert.equal(skin.getAttribute('opacity'), '1');
  assert.equal(rainbow.getAttribute('fill'), `url(#${id})`);
  assert.deepEqual([rainbow.getAttribute('stroke'), rainbow.getAttribute('paint-order')], [RIM, 'stroke'], 'the rim, under the fill');
  assert.deepEqual([left.style.fill, right.style.fill], [ULTRA_INK, ULTRA_INK]);
  // Every frame the skin follows the body and the bands slide; a halo shows behind it, and twinkles in its rainbow
  // in front.
  let slid = 0, twinkled = 0, was = bands.getAttribute('gradientTransform');
  const halo = `url(#${id.replace(/rainbow$/, 'halo')})`;
  run(1700, () => {
    assert.equal(rainbow.getAttribute('d'), body.getAttribute('d'));
    assert.equal(sheen.getAttribute('d'), body.getAttribute('d'));
    if (bands.getAttribute('gradientTransform') !== was) slid++;
    was = bands.getAttribute('gradientTransform');
    assert.ok(back.children.some((p) => p.style.fill === halo), 'the halo');
    if (front.children.some((p) => p.style.fill === `url(#${id})`)) twinkled++;
  });
  assert.ok(slid > 100, `the bands slide: ${slid} frames`);
  assert.ok(twinkled > 10, `twinkles: ${twinkled} frames`);
  // Off: it fades, the group stays and is emptied, and the eyes are their own colour again.
  m.update({ ultra: false });
  run(300);
  const k = Number(skin.getAttribute('opacity'));
  assert.ok(k > 0 && k < 1, `fading: ${k}`);
  run(700);
  assert.equal(svg.children[2], skin, 'the group stays where it was');
  assert.equal(skin.children.length, 0, 'emptied');
  assert.equal(skin.getAttribute('opacity'), null);
  const c = colours('#FD690F');
  assert.deepEqual([left.style.fill, right.style.fill], [c.eyeFill, c.eyeFill]);
  assert.ok(![...back.children, ...front.children].some((p) => /url/.test(p.style.fill)), 'no halo, no twinkle');
  m.destroy();
  assert.deepEqual(host.children, []);
});

test('ultracode: update({ ultra }) acts at once, and the same value again is no change', () => {
  const host = new El('div');
  const m = mount(host, { shape: 'blob', size: 72 });
  const calls = [], was = m.live.doing;
  m.live.doing = () => { calls.push('doing'); return was(); };
  m.update({ ultra: true });
  assert.deepEqual(calls, ['doing']);
  m.update({ ultra: true });
  assert.deepEqual(calls, ['doing'], 'the same again is no change');
  see(host, true);
  for (let t = 1000; t < 2000; t += 16) pump(t);
  assert.equal(m.live.rig.state.ultra?.amount, 1, 'powered');
  m.update({ ultra: false });
  assert.deepEqual(calls, ['doing', 'doing']);
  for (let t = 2000; t < 2700; t += 16) pump(t);
  assert.equal(m.live.rig.state.ultra, undefined, 'and off');
  m.destroy();
});

test('ultracode: under reduced motion the still is powered and nothing ticks; turning it off or on redraws it', () => {
  prefer(true);
  try {
    const host = new El('div');
    const m = mount(host, { shape: 'blob', size: 96, ultra: true });
    see(host, true);
    assert.deepEqual(ticking(), { count: 0, running: false });
    const svg = host.children[0], skin = svg.children[2], [back, , , left, , front] = svg.children;
    assert.deepEqual(svg.children.map((c) => c.tag), ['g', 'path', 'g', 'path', 'path', 'g']);
    assert.equal(skin.getAttribute('opacity'), '1');
    assert.equal(skin.children[0].children[0].getAttribute('gradientTransform'), 'translate(-13.2 6)', 'the bands where the study froze them');
    assert.equal(left.style.fill, ULTRA_INK);
    assert.deepEqual(back.children.map((p) => /-halo\)$/.test(p.style.fill)), [true], 'a halo');
    assert.deepEqual(front.children.map((p) => p.style.fill), [skin.children[1].getAttribute('fill'), '#FFFFFF'], 'one twinkle, and its white core');
    m.update({ ultra: false });
    assert.equal(skin.children.length, 0);
    assert.equal(left.style.fill, '#FFFFFF');
    assert.equal(front.children.length, 0);
    m.update({ ultra: true });
    assert.equal(skin.children.length, 5);
    assert.equal(left.style.fill, ULTRA_INK);
    assert.deepEqual(ticking(), { count: 0, running: false });
    m.destroy();
  } finally { prefer(false); }
});

test('ultracode: fluffy where no coat can be drawn gets the flat skin, rim and all, frame by frame', () => {
  const flat = new El('div'), fluffy = new El('div');
  const a = mount(flat, { shape: 'heart', size: 72, ultra: true });
  const b = mount(fluffy, { shape: 'heart', size: 72, ultra: true, material: 'fluffy' });
  see(flat, true); see(fluffy, true);
  for (let t = 1000; t < 2500; t += 16) {
    pump(t);
    assert.deepEqual(sameIds(tree(fluffy)), sameIds(tree(flat)), `at ${t} ms`);
  }
  const rainbow = fluffy.children[0].children[2].children[2];
  assert.equal(rainbow.getAttribute('stroke'), RIM, 'the rim');
  assert.ok(!rainbow.style.mixBlendMode, 'not blended');
  a.destroy(); b.destroy();
});

test('ultracode\'s effects: twinkles in the rainbow (the accent without one), cores and the star in white, a halo only with a paint for it', async () => {
  const { roleColour } = await import('./paint.ts');
  const paint = { fill: '#FD690F', eyeFill: '#FFFFFF', accent: '#7C5CFF' };
  assert.equal(roleColour('rainbow', paint), '#7C5CFF');
  assert.equal(roleColour('rainbow', { fill: '#FD690F', eyeFill: '#FFFFFF' }), '#FD690F');
  assert.equal(roleColour('rainbow', { ...paint, rainbow: 'url(#r)' }), 'url(#r)');
  assert.equal(roleColour('light', paint), '#FFFFFF');
  assert.equal(roleColour('halo', paint), 'none');
  assert.equal(roleColour('halo', { ...paint, halo: 'url(#h)' }), 'url(#h)');
  assert.equal(roleColour('shadow', paint), '#000');
});
