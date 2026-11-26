import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DOT_COLOURS,
  DOT_EYES,
  DOT_EXTRA_COLOURS,
  DOT_EXTRAS,
  DOT_GLASSES,
  DOT_SHAPES,
  bodyOf,
  dotAvatar,
  drawAvatar,
  stillState,
  validateAvatar,
  VIEW,
  VIEW_UNIT,
} from './index.ts';
import { flattenPath, insideRow, parsePath } from './engine/outline/path.ts';
import { BOX_SCALE } from './engine/outline/inflate.ts';

const reference = JSON.parse(readFileSync(new URL('../golden/dots/front-rows.json', import.meta.url)));
const front = stillState('blob', 16);

// A reference row holds alternating inclusive starts and exclusive ends of occupied horizontal spans.
function overlap(path, ref, centre, extent) {
  const [, width, height, rows] = ref;
  const flat = rows.flat(),
    x0 = Math.min(...flat),
    x1 = Math.max(...flat);
  const y0 = rows.findIndex((row) => row.length),
    y1 = rows.findLastIndex((row) => row.length) + 1;
  const scale = extent / Math.max(x1 - x0, y1 - y0);
  const xs = Array.from({ length: width }, (_, x) => centre + (x + 0.5 - (x0 + x1) / 2) * scale);
  const polys = flattenPath(parsePath(path)),
    rendered = new Uint8Array(width);
  let intersection = 0,
    union = 0;
  for (let y = 0; y < height; y++) {
    insideRow(polys, centre + (y + 0.5 - (y0 + y1) / 2) * scale, xs, rendered);
    let edge = 0;
    for (let x = 0; x < width; x++) {
      if (rows[y][edge] === x) edge++;
      const original = edge % 2;
      intersection += original & rendered[x];
      union += original | rendered[x];
    }
  }
  return intersection / union;
}

test('every Dot contour fits its measured native-aspect silhouette before and after inflation', () => {
  assert.equal(DOT_SHAPES.length, reference.length);
  for (const [i, shape] of DOT_SHAPES.entries()) {
    assert.equal(shape.name, reference[i][0]);
    assert.equal(bodyOf(shape.id), bodyOf(shape));
    assert.equal(validateAvatar(shape).ok, true);
    const d = drawAvatar(bodyOf(shape), '#fff', front, 200);
    assert.ok(overlap(shape.body.path, reference[i], 50, 80) >= 0.995, shape.name);
    assert.ok(overlap(d.body, reference[i], VIEW / 2, (80 * VIEW_UNIT) / BOX_SCALE) >= 0.973, shape.name);
  }
});

test('eye styles, glasses and extras produce distinct drawings, including a blink in glasses', () => {
  function layers(props, lid = 1) {
    const { body } = dotAvatar({ shape: 'dot-rounded-triangle', ...props });
    return drawAvatar(body, '#FFFFFF', { ...front, lid }, 96).layers;
  }
  for (const [key, options] of [
    ['eyes', DOT_EYES],
    ['glasses', DOT_GLASSES],
    ['extra', DOT_EXTRAS],
  ]) {
    const signatures = options.map((value) =>
      layers({ [key]: value })
        .map((p) => p.d)
        .join('/'),
    );
    assert.equal(new Set(signatures).size, options.length, key);
    assert.ok(signatures.every((s) => s && !/NaN|Infinity/.test(s)));
  }
  const open = layers({ eyes: 'Sparkle capsules', glasses: 'Tall oval frames' }),
    closed = layers({ eyes: 'Sparkle capsules', glasses: 'Tall oval frames' }, 0);
  assert.ok(open.some((p) => p.id === 'left-spark'));
  assert.ok(!closed.some((p) => p.id === 'left-spark'));
  assert.equal(open.find((p) => p.id === 'rim1').d, closed.find((p) => p.id === 'rim1').d);
});

test('body tint and texture edits preserve geometry and accessory tint', () => {
  const options = { shape: 'dot-heart', extra: 'Beret', extraColour: '#8C4A2B' };
  const first = dotAvatar(options),
    second = dotAvatar({ ...options, colour: '#FFFFFF', texture: 'Fur' });
  assert.equal(first.body, second.body);
  assert.equal(second.material, 'fluffy');
  assert.equal(first.material, 'glossy');
  assert.equal(DOT_COLOURS.length, 10);
  assert.equal(DOT_EXTRA_COLOURS.length, 12);
  const d = drawAvatar(second.body, second.color, front, 128, { coat: true });
  assert.ok(d.coat.eyes);
  assert.equal(d.layers.find((p) => p.id === 'beret').fill, '#8C4A2B');
});
