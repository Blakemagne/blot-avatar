// Ultracode's finish, painted: the skin as markup and as DOM, the eyes' ink and the coat's dye. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RAINBOW_LINE, RIM, RIM_PX, RIM_WIDTH, ULTRA_INK, ULTRA_LAVENDER, ULTRA_PALETTE, PILE_TINT, dyeAt, eyeInk, furShown, paintSkin, rimWidth, skinMarkup, skinPaint } = await import('./ultra.ts');
const { BODIES, Rig, drawAvatar } = await import('./engine/index.ts');

// Just enough DOM for a group: elements with attributes, a style, children, and a way out.
class El {
  constructor(tag) { this.tag = tag; this.style = {}; this.attrs = new Map(); this.children = []; this.parent = null; this.ownerDocument = doc; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
}
const doc = { createElementNS: (_, tag) => new El(tag) };

/** An element as plain data: its tag, its attributes (a blend mode as the style skinMarkup writes), its children. */
const dom = (el) => ({
  tag: el.tag,
  attrs: { ...Object.fromEntries(el.attrs), ...(el.style.mixBlendMode ? { style: `mix-blend-mode:${el.style.mixBlendMode};` } : {}) },
  kids: el.children.map(dom),
});
/** Markup as the same plain data (it is only ever this simple: no text, no quotes inside a value). */
function parse(s) {
  const root = { kids: [] }, open = [root];
  for (const [, close, tag, rest, alone] of s.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    if (close) { open.pop(); continue; }
    const n = { tag, attrs: Object.fromEntries([...rest.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])), kids: [] };
    open.at(-1).kids.push(n);
    if (!alone) open.push(n);
  }
  return root.kids[0];
}

/** Frames of a rig powered at 100 ms and turned off at 1500 ms: each drawing at 96 px. */
function film() {
  const rig = new Rig({ seed: 2, body: BODIES.heart }), out = [];
  for (let t = 16; t <= 2400; t += 16) {
    if (t === 112) rig.setUltra(true);
    if (t === 1504) rig.setUltra(false);
    rig.step(16);
    out.push(drawAvatar(BODIES.heart, '#FD690F', rig.state, 96));
  }
  return out;
}

test('the skin as markup and as DOM are the same skin, flat and over fur, frame after frame', () => {
  const g = new El('g'), frames = film();
  let powered = 0;
  frames.forEach((d, i) => {
    // Over fur for a stretch in the middle, as a coat comes, fades for a change of shape, and goes.
    const fur = i > 60 && i < 70 ? 1 : i >= 70 && i < 90 ? (i - 70) / 20 : 0;
    paintSkin(g, d, 96, fur, 'u1');
    const markup = skinMarkup(d, 'u1', 96, fur);
    if (!d.ultra) {
      assert.equal(markup, '');
      assert.equal(g.children.length, 0, `frame ${i}: empty with no power`);
      assert.equal(g.getAttribute('opacity'), null);
      return;
    }
    powered++;
    assert.deepEqual({ ...dom(g), tag: 'g' }, parse(markup), `frame ${i}`);
  });
  assert.ok(powered > 60 && powered < frames.length - 30, `powered in ${powered} of ${frames.length} frames`);
});

test('flat, the skin fades as one over the body with the rim under the rainbow; over fur there is no rim, the rainbow blends out over the pile, and each path fades by itself', () => {
  const d = { body: 'M1 1L9 1L9 9Z', eyes: ['', ''], ultra: { amount: 0.4, phase: 0 } };
  const flat = parse(skinMarkup(d, 'a', 96)), [defs, blend, rainbow, sheen] = flat.kids;
  assert.equal(flat.attrs.opacity, '0.4');
  assert.deepEqual(defs.kids.map((k) => [k.tag, k.attrs.id]), [['linearGradient', 'a-rainbow'], ['radialGradient', 'a-sheen'], ['radialGradient', 'a-halo']]);
  assert.equal(blend.attrs.d, undefined, 'no fur, no blend');
  // (The rim fades by the power once more, inside a group already faded by it.)
  assert.deepEqual(rainbow.attrs, { fill: 'url(#a-rainbow)', 'stroke-linejoin': 'round', 'paint-order': 'stroke', d: d.body, stroke: RIM, 'stroke-width': String(Math.round(rimWidth(96) * 1000) / 1000), 'stroke-opacity': '0.4' });
  assert.deepEqual(sheen.attrs, { fill: 'url(#a-sheen)', d: d.body });
  const fur = parse(skinMarkup(d, 'a', 96, 1)), [, b, r, s] = fur.kids;
  assert.equal(fur.attrs.opacity, undefined, 'a group that is not opaque would keep the blend from the coat');
  assert.deepEqual([b.attrs.d, b.attrs.opacity, b.attrs.style, b.attrs.stroke, Number(b.attrs['stroke-width'])], [d.body, '0.4', 'mix-blend-mode:color;', 'url(#a-rainbow)', Math.round(PILE_TINT * 1000) / 1000]);
  assert.equal(r.attrs.d, undefined, 'all fur: no glass');
  assert.equal(s.attrs.opacity, '0.24');
  assert.equal(skinMarkup({ ...d, ultra: undefined }, 'a', 96), '');
});

test('while a coat fades, the blend and the glass cross-fade as the coat and the flat body do', () => {
  const d = { body: 'M1 1L9 1L9 9Z', eyes: ['', ''], ultra: { amount: 1, phase: 0 } };
  let last = null;
  for (let i = 0; i <= 20; i++) {
    const f = i / 20, [, b, r, s] = parse(skinMarkup(d, 'a', 96, f)).kids;
    const blend = b.attrs.d ? Number(b.attrs.opacity) : 0, glass = r.attrs.d ? Number(r.attrs.opacity ?? 1) : 0;
    assert.ok(Math.abs(blend + glass - 1) < 0.002, `${f}: ${blend} blended, ${glass} glass`);
    assert.ok(Math.abs(blend - f) < 0.002, `${f}: the blend is the fur's share`);
    if (last) {
      assert.ok(Math.abs(blend - last.blend) <= 0.051 && Math.abs(glass - last.glass) <= 0.051, `${f}: no jump`);
      assert.ok(Math.abs(Number(s.attrs.opacity ?? 1) - last.sheen) <= 0.03, `${f}: the sheen fades too`);
    }
    last = { blend, glass, sheen: Number(s.attrs.opacity ?? 1) };
  }
});

test('the bands are the palette once round, back to where they started, sliding back along the rainbow\'s line as the phase goes round', () => {
  const at = (phase) => parse(skinMarkup({ body: 'M0 0Z', eyes: ['', ''], ultra: { amount: 1, phase } }, 'b', 96)).kids[0].kids[0];
  const line = at(0);
  assert.deepEqual(['x1', 'y1', 'x2', 'y2'].map((k) => Number(line.attrs[k])), RAINBOW_LINE);
  assert.deepEqual([line.attrs.gradientUnits, line.attrs.spreadMethod], ['userSpaceOnUse', 'repeat']);
  assert.deepEqual(line.kids.map((s) => s.attrs['stop-color']), [...ULTRA_PALETTE, ULTRA_PALETTE[0]]);
  assert.deepEqual(line.kids.map((s) => Number(s.attrs.offset)), ULTRA_PALETTE.concat('').map((_, i) => Math.round((i / ULTRA_PALETTE.length) * 1000) / 1000));
  assert.equal(line.attrs.gradientTransform, 'translate(0 0)');
  // Half way round, the line has moved back half its own length (from upper right toward lower left).
  const [x1, y1, x2, y2] = RAINBOW_LINE;
  assert.equal(at(0.5).attrs.gradientTransform, `translate(${(x1 - x2) / 2} ${(y1 - y2) / 2})`);
});

test('the effects\' paints are the skin\'s own rainbow and halo, by its id', () => {
  const g = new El('g');
  paintSkin(g, { body: 'M0 0Z', eyes: ['', ''], ultra: { amount: 1, phase: 0 } }, 96, false, 'c7');
  const ids = g.children[0].children.map((k) => k.getAttribute('id'));
  assert.deepEqual(skinPaint('c7'), { rainbow: `url(#${ids[0]})`, halo: `url(#${ids[2]})` });
});

test('the eyes: their own colour at no power, exactly as given; ink at full power; mixed between, by the browser for a colour that is not hex', () => {
  for (const own of ['#FFFFFF', 'var(--eye)', 'white']) assert.equal(eyeInk(own, 0), own);
  assert.equal(eyeInk('#FFFFFF', Number.NaN), '#FFFFFF');
  assert.equal(eyeInk('#FFFFFF', 1), ULTRA_INK);
  assert.equal(eyeInk('#ffffff', 0.5), '#8c8892');
  assert.equal(eyeInk('#fff', 0.5), '#8c8892');
  assert.equal(eyeInk('var(--eye)', 0.25), `color-mix(in srgb, var(--eye), ${ULTRA_INK} 25%)`);
});

test('a coat\'s dye: its own at no power (the same bytes), lavender at full power, whole bytes between', () => {
  const own = [253, 105, 15];
  assert.equal(dyeAt(own, 0), own);
  const lav = [1, 3, 5].map((i) => parseInt(ULTRA_LAVENDER.slice(i, i + 2), 16));
  assert.deepEqual(dyeAt(own, 1), lav);
  assert.deepEqual(dyeAt(own, 2), lav);
  const half = dyeAt([0, 0, 0], 0.5);
  assert.deepEqual(half, lav.map((v) => Math.round(v / 2)));
  assert.ok(half.every(Number.isInteger));
});

test('the rim is RIM_WIDTH drawing units on a large avatar and never thinner than RIM_PX px on a small one', () => {
  assert.equal(rimWidth(240), RIM_WIDTH);
  assert.equal(rimWidth(96), (RIM_PX * 36) / 96);
  for (const size of [16, 22, 36, 48, 64, 96, 240]) assert.ok((rimWidth(size) * size) / 36 >= RIM_PX - 1e-9, `${size} px`);
});

test('how much fur shows: none unless a coat shows, all of it at full opacity, none from half, and the share between as the flat body is filled over it', () => {
  const at = (opacity) => ({ body: 'M0 0Z', eyes: ['', ''], coat: opacity === undefined ? undefined : { opacity } });
  assert.equal(furShown(true, at(1)), 1);
  for (const o of [0, 0.25, 0.5]) assert.equal(furShown(true, at(o)), 0, `a coat at ${o}`);
  assert.ok(Math.abs(furShown(true, at(0.75)) - 0.5) < 1e-9);
  assert.equal(furShown(false, at(1)), 0, 'no coat showing (no WebGL2, or not painted yet)');
  assert.equal(furShown(true, at(undefined)), 0, 'a drawing without a coat');
});
