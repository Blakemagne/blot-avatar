// Run with node --import tsx. A copied definition exercises the public import path.
import assert from 'node:assert/strict';
import {
  BODIES, GALLERY, DOT_SHAPES, DOT_EYES, DOT_GLASSES, DOT_EXTRAS,
  avatarParts, dotExtras, drawAvatar, stillState,
} from '../src/index.ts';
import { dotFeatures } from '../src/engine/dot-features.ts';

const wearers = [
  ...Object.keys(BODIES), ...GALLERY.map(item => item.definition),
  ...DOT_SHAPES.map(shape => shape.id), { ...GALLERY[0].definition, id: 'test-import' },
];
let combinations = 0, poses = 0;
for (const [index, shape] of wearers.entries()) {
  const native = typeof shape === 'string' && DOT_SHAPES.some(dot => dot.id === shape);
  const eyes = shape === 'dot-rounded-head-with-two-ears' ? ['Oval'] : native ? DOT_EYES : [undefined, ...DOT_EYES];
  const extras = dotExtras(shape);
  for (const eye of eyes) for (const glasses of DOT_GLASSES) for (const extra of extras) {
    const { body } = avatarParts(shape, { eyes: eye, glasses, extra });
    assert.equal(body.dotStyle.extra, extra);
    assert.equal(body.dotStyle.glasses, glasses);
    assert.equal(body.dotStyle.eyes, eye ?? 'Oval');
    combinations++;
  }
  for (let sample = 0; sample < DOT_EXTRAS.length; sample++) {
    const { body } = avatarParts(shape, {
      eyes: eyes[sample % eyes.length], glasses: DOT_GLASSES[(index + sample) % DOT_GLASSES.length],
      extra: extras[sample % extras.length],
    });
    for (const yaw of [-.55, 0, .55]) {
      const lid = yaw < 0 ? .05 : 1;
      const view = drawAvatar(body, '#2288FF', {
        ...stillState(shape, 96), pose: { yaw, pitch: .1, roll: .05 }, eye: { x: yaw, y: .3 }, lid,
      }, 96);
      assert.ok(view.body && !/NaN|Infinity/.test(view.body));
      assert.ok((view.layers ?? []).every(layer => !/NaN|Infinity/.test(layer.d)));
      const solids = dotFeatures(body, { x: yaw, y: .3, left: lid, right: 1 });
      assert.ok(solids.every(solid => solid.axes.every(Number.isFinite)));
      poses++;
    }
  }
}
console.log(`${wearers.length} bodies, ${combinations} wardrobe selections, ${poses} poses`);
