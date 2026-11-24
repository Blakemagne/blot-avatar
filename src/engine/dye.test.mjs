// A coat's dye ramp: every colour keeps its hue and the same steps of lightness through the shading, and yellows
// are marked for the shader's own fibre colour. Open-bot-avatar's assertions for its ramp (MIT), held here to
// the port. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DYE_RAMP_RANGE, DYE_RAMP_SIZE, dyeRamp, toOklch } = await import('./dye.ts');
const { BOT_COLOURS } = await import('../palette.ts');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** The ramp at an exposure, sampled between texel centres as the GPU's linear filter does. */
function sample(rgb, exposure) {
  const row = dyeRamp(rgb);
  const x = Math.max(0, Math.min(DYE_RAMP_SIZE - 1, (exposure * DYE_RAMP_SIZE) / DYE_RAMP_RANGE - 0.5));
  const i = Math.floor(x), j = Math.ceil(x), t = x - i;
  return [0, 1, 2].map((k) => row[4 * i + k] + (row[4 * j + k] - row[4 * i + k]) * t);
}
const close = (a, b, digits) => assert.ok(Math.abs(a - b) < 10 ** -digits / 2, `${a} is not ${b} to ${digits} places`);

test('a ramp is 96 RGBA texels, the same array for the same colour', () => {
  const row = dyeRamp(hex('#8b5cf6'));
  assert.ok(row instanceof Uint8Array);
  assert.equal(row.length, DYE_RAMP_SIZE * 4);
  assert.equal(dyeRamp(hex('#8b5cf6')), row);
});

test('yellows are marked for the fibre colour all along the row, other hues not, and their neighbours in between', () => {
  const weights = (h) => [...dyeRamp(hex(h))].filter((_, i) => i % 4 === 3);
  for (const h of ['#ffcf36', '#f8a01c', '#ffff00']) assert.ok(weights(h).every((w) => w === 255), h);
  for (const h of ['#8b5cf6', '#1fbf68', '#b0df36', '#ffffff', '#303000']) assert.ok(weights(h).every((w) => w === 0), h);
  for (const h of ['#edfd4a', '#fff2b4', '#808000']) assert.ok(weights(h).every((w) => w > 0 && w < 255), h);
});

test('equal steps of the cube root of exposure are equal steps of OKLCH lightness through the midtones', () => {
  for (const h of ['#8b5cf6', '#1fbf68', '#1f7cf2']) {
    const [root, pile, surface] = [0.8 ** 3, 0.9 ** 3, 1].map((e) => toOklch(sample(hex(h), e))[0]);
    close(pile - root, 0.082, 2);
    close(surface - pile, 0.082, 2);
  }
});

test('tips grow lighter above the dye\'s own exposure and keep its hue', () => {
  for (const h of ['#8b5cf6', '#1fbf68', '#1f7cf2']) {
    const [surfaceL, , hue] = toOklch(sample(hex(h), 1));
    const [tipL] = toOklch(sample(hex(h), 1.18));
    const [rimL, , rimHue] = toOklch(sample(hex(h), 1.5));
    assert.ok(tipL - surfaceL > 0.035, h);
    assert.ok(rimL - tipL > 0.025, h);
    assert.ok(Math.abs(rimHue - hue) < 2, h);
  }
});

test('shaded fibres keep the dye\'s hue and its chroma for their lightness; a full yellow\'s brightest stays yellow', () => {
  for (const h of ['#ffcf36', '#8b5cf6', '#1fbf68']) {
    const [L, C, hue] = toOklch(hex(h));
    const [shadedL, shadedC, shadedHue] = toOklch(sample(hex(h), 0.65));
    assert.ok(shadedL < L, h);
    close(shadedC / shadedL, C / L, 2);
    assert.ok(Math.abs(shadedHue - hue) < 2, h);
  }
  const [r, g, b] = sample([255, 255, 0], DYE_RAMP_RANGE);
  assert.ok(Math.min(r, g) - b > 180);
});

test('greys keep their detail at both ends of the picker, and stay grey', () => {
  for (const v of [0, 128, 255]) {
    const root = sample([v, v, v], 0.72), tip = sample([v, v, v], 1.18);
    assert.equal(root[0], root[2]);
    assert.equal(tip[0], tip[1]);
    assert.ok(toOklch(tip)[0] - toOklch(root)[0] > 0.075, String(v));
  }
});

test('blot\'s own colours each make a ramp that only gets lighter', () => {
  for (const [h] of BOT_COLOURS) {
    const row = dyeRamp(hex(h));
    let last = -1;
    for (let i = 0; i < DYE_RAMP_SIZE; i++) {
      const L = toOklch([row[i * 4], row[i * 4 + 1], row[i * 4 + 2]])[0];
      assert.ok(L >= last - 0.005, `${h} at ${i}`);
      last = L;
    }
  }
});
