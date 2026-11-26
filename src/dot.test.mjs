import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DOT_COLOURS,
  DOT_EYES,
  DOT_EXTRA_COLOURS,
  DOT_EXTRAS,
  DOT_GLASSES,
  DOT_PICKER_SHAPES,
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
  assert.equal(DOT_PICKER_SHAPES.length, reference.length);
  for (const [i, shape] of DOT_PICKER_SHAPES.entries()) {
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

test('builder recipes and fixed portraits select the correct body, eyes and attachments', async () => {
  const { DOT_CHARACTERS, dotExtras } = await import('./index.ts');
  const { coatMesh } = await import('./engine/coat.ts');
  const portrait = dotAvatar(DOT_CHARACTERS.Iris);
  const custom = dotAvatar({ ...DOT_CHARACTERS.Iris, colour: '#00B1FF' });
  assert.equal(portrait.body.dotStyle.character, 'Iris');
  assert.equal(custom.body.dotStyle.character, undefined);
  assert.notEqual(coatMesh(portrait.body), coatMesh(custom.body));
  const view = drawAvatar(portrait.body, portrait.color, front, 296, { coat: true });
  assert.ok(Math.abs(view.coat.rotation[2] - Math.sin(8*Math.PI/180)) < 1e-8);
  for (const shape of ['dot-circle-with-two-ears', 'dot-rounded-head-with-two-ears']) {
    assert.deepEqual(dotExtras(shape), ['None', 'Headphones', 'Bow tie']);
    assert.equal(dotAvatar({ shape, extra: 'Crown' }).body.dotStyle.extra, 'None');
  }
  assert.equal(dotAvatar({ shape: 'dot-rounded-head-with-two-ears', eyes: 'Dots' }).body.dotStyle.eyes, 'Oval');
  assert.equal(DOT_SHAPES.length, 12);
  const flower = dotAvatar({ shape: 'dot-six-lobed-flower' });
  assert.equal(validateAvatar(flower.shape).ok, true);
  assert.ok(coatMesh(flower.body).vertices.length > 1000);
});

test('Dot cursor response follows the measured step and returns to its neutral pose', async () => {
  const { Rig } = await import('./engine/rig.ts');
  const { body } = dotAvatar({ shape: 'dot-rounded-triangle' });
  const rig = new Rig({ body, idle: false, blinks: false });
  rig.look(1, 1);
  const yaw = [];
  for (let i = 1; i <= 120; i++) {
    rig.step(1000/60);
    if ([2,4,6,9,12].includes(i)) yaw.push(rig.state.pose.yaw);
  }
  const observed = [.0092,.0237,.0355,.0463,.0514];
  yaw.forEach((v,i) => assert.ok(Math.abs(v-observed[i]) < .002, String([i,v])));
  assert.ok(Math.abs(rig.state.eye.x*body.eyes.slideX - .0391) < .0002);
  assert.ok(Math.abs(rig.state.eye.y*body.eyes.slideY - .0512) < .0002);
  assert.ok(Math.abs(rig.state.pose.pitch - .035) < .0002);
  rig.stop();
  let previous = rig.state.pose.yaw;
  for (let i = 0; i < 120; i++) {
    rig.step(1000/60);
    assert.ok(rig.state.pose.yaw <= previous + 1e-8);
    previous = rig.state.pose.yaw;
  }
  assert.ok(Math.abs(previous) < 1e-4);
});

test('all observed idle and thinking motions can play through the public Dot recipe', async () => {
  const { Rig } = await import('./engine/rig.ts');
  const { DOT_MOTIONS } = await import('./index.ts');
  const config = dotAvatar({ shape: 'dot-circle' });
  assert.equal(DOT_MOTIONS.filter(m => m.category === 'idle').length, 41);
  assert.equal(DOT_MOTIONS.filter(m => m.category === 'thinking').length, 13);
  for (const { id, durationMs } of DOT_MOTIONS) {
    const rig = new Rig({ body: config.body, clips: config.clips, idle: false, blinks: false });
    assert.equal(rig.play(id), true, id);
    for (let elapsed = 0; elapsed < durationMs; elapsed += 1000/30) {
      rig.step(1000/30);
      assert.ok(Object.values(rig.state.pose).every(Number.isFinite), id);
    }
  }
});

test('catalog entries keep independent rigs, palette responses and editable recipes', async () => {
  const { DOT_CATALOG } = await import('./index.ts');
  const { coatMesh } = await import('./engine/coat.ts');
  const { dotFeatures } = await import('./engine/dot-features.ts');
  assert.equal(new Set(DOT_CATALOG.map(item => item.id)).size, 108);
  assert.equal(DOT_CATALOG.filter(item => item.surface === 'Matte').length, 100);
  for (const entry of DOT_CATALOG) {
    const style = dotAvatar(entry.appearance).body.dotStyle;
    if (entry.surface === 'Matte') assert.equal(style.catalogId, entry.id);
    else assert.ok(style.character);
  }
  const tavi = DOT_CATALOG.find(item => item.id === 'matisse');
  const avatar = dotAvatar(tavi.appearance), changed = dotAvatar({ ...tavi.appearance, glasses: 'None' });
  assert.equal(changed.body.dotStyle.catalogId, undefined);
  assert.notEqual(coatMesh(avatar.body), coatMesh(changed.body));
  const parts = dotFeatures(avatar.body);
  assert.equal(parts.length, 4);
  assert.equal(new Set(parts.map(part => part.material)).size, 3);
  assert.ok(parts.every(p => p.mesh.indices.length > 0));
  const other = DOT_CATALOG.find(item => item.surface === 'Matte' && item.id !== tavi.id && item.appearance.shape === tavi.appearance.shape);
  assert.equal(coatMesh(avatar.body), coatMesh(dotAvatar(other.appearance).body));
});

test('eye inserts follow the measured held-out cursor directions independently', async () => {
  const { gazeTransform } = await import('./engine/dot-gaze.ts');
  const { gazeParts } = await import('./engine/dot-gaze-data.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  const rows = JSON.parse(readFileSync(new URL('../golden/dots/gaze-checkpoints.json', import.meta.url)));
  assert.equal(Object.keys(gazeParts).length, 185);
  const errors = [];
  for (const [key, section, x, y, rest, target] of rows) {
    const axes = [1,0,0, 0,1,0, 0,0,1, ...rest.map(v => v * DOT_RADIUS)];
    assert.deepEqual(gazeTransform(key, section, axes, 0, 0), axes, key);
    const moved = gazeTransform(key, section, axes, x, y);
    const error = Math.hypot(...target.map((v,i) => moved[9+i] / DOT_RADIUS - v)) * 140.6592;
    if (key.endsWith('/Highlight capsules')) {
      if (section < 2) assert.deepEqual(moved, axes);
      else assert.ok(Math.hypot(...moved.slice(9).map((v,i) => v - axes[9+i])) > .005);
    }
    errors.push(error);
    assert.ok(error < (key === 'catalog/clover' ? 4.3 : 1.6), key + ' ' + section + ' ' + error);
  }
  errors.sort((a,b) => a-b);
  assert.ok(errors[Math.floor(errors.length/2)] < .25);
});

test('depth changes the editable body and its mounted face while fixed fur portraits keep their thickness', async () => {
  const { DOT_CHARACTERS, DOT_CATALOG } = await import('./index.ts');
  const recipe = { shape: 'dot-rounded-triangle', eyes: 'Sleepy lids', extra: 'Crown' };
  const get = depth => dotAvatar({ ...recipe, depth }).body;
  assert.equal(get(.5), get(undefined));
  assert.equal(get(NaN), get(.5));
  assert.equal(get(-.25), get(0));
  assert.equal(get(1.2), get(1));
  assert.equal(get(0).dotStyle.depthScale, .6);
  assert.equal(get(1).dotStyle.depthScale, 1.4);
  const state = stillState('blob', 7);
  state.pose.yaw = .7;
  const draw = depth => drawAvatar(get(depth), '#00B1FF', state, 296, { coat: true });
  const flat = draw(0), deep = draw(1);
  assert.notEqual(flat.body, deep.body);
  assert.notDeepEqual(flat.layers, deep.layers);
  assert.deepEqual(flat.coat.rotation, deep.coat.rotation);
  assert.equal(dotAvatar({ ...DOT_CHARACTERS.Iris, depth: 0 }).body, dotAvatar(DOT_CHARACTERS.Iris).body);
  const matte = DOT_CATALOG.find(entry => entry.id === 'matisse').appearance;
  assert.equal(dotAvatar({ ...matte, depth: 0 }).body.dotStyle.catalogId, 'matisse');
  assert.equal(dotAvatar({ ...matte, depth: 0 }).body.dotStyle.depthScale, .6);
});

test('curated selection matches observed version 14 studio choices across the unsigned 64-bit range', async () => {
  const { curatedDot, DOT_CURATED_VERSION } = await import('./index.ts');
  assert.equal(DOT_CURATED_VERSION, 14);
  for (const [seed, id] of [[0n,'lime_headphones'], [1n,'gus'], [2n,'watt'], [42n,'rio'],
    [1n << 32n,'coral_monocle'], [1n << 63n,'hugo'], [0x1234fedcba987654n,'puck'], [0xffffffffffffffffn,'puck']]) {
    assert.equal(curatedDot(seed).id, id);
  }
  assert.throws(() => curatedDot(42), TypeError);
  assert.throws(() => curatedDot(-1n), RangeError);
  assert.throws(() => curatedDot(1n << 64n), RangeError);
});

test('live stage frames each catalog and wearer, including the forehead and floor under different accessories', async () => {
  const { dotStageLayout, DOT_CATALOG, dotExtras } = await import('./index.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  const recipe = { shape: 'dot-rounded-triangle', extra: 'Crown', eyes: 'Sleepy lids' };
  const crown = dotStageLayout(recipe, 512);
  assert.equal(crown.size, 512*.453865/DOT_RADIUS);
  assert.equal(crown.y, 256*.114339);
  assert.equal(crown.groundTransform(), '');
  assert.equal(crown.groundTransform({ scale: [.94,1.08,.94], offset: [.25*DOT_RADIUS,0,0] }),
    `translateX(${.25*256*.453865}px) scale(0.94)`);
  const lenses = dotStageLayout({ ...recipe, glasses: 'Separate trapezoid lenses' },512);
  assert.equal(lenses.size, 512*.424356/DOT_RADIUS);
  assert.equal(lenses.y,256*.106905);
  for (const entry of DOT_CATALOG) assert.ok(dotStageLayout(entry.appearance,256).size > 0);
  for (const body of DOT_SHAPES) for (const extra of dotExtras(body.id)) for (const glasses of DOT_GLASSES) {
    assert.ok(Number.isFinite(dotStageLayout({ shape: body.id, extra, glasses },128).size));
  }
  assert.throws(() => dotStageLayout(recipe, 0), RangeError);
});

test('eyewear seats visible eyes and frames on each wearer', async () => {
  const { dotFeatures } = await import('./engine/dot-features.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  const parts = (shape, eyes, glasses) => dotFeatures(dotAvatar({ shape, eyes, glasses }).body);
  const triangle = 'dot-rounded-triangle';
  const bare = parts(triangle, 'Sparkle capsules', 'None');
  const monocle = parts(triangle, 'Sparkle capsules', 'Monocle');
  assert.ok(Math.abs(monocle[0].axes[9] - bare[0].axes[9] + .12*DOT_RADIUS) < .0001);
  assert.ok(Math.abs(monocle[3].axes[9] - bare[3].axes[9] - .12*DOT_RADIUS) < .0001);
  assert.notDeepEqual(monocle.at(-1).axes, parts(triangle, 'Oval', 'Monocle').at(-1).axes);
  assert.equal(parts('dot-blossie', 'Oval', 'None')[0].material, 0);
  assert.equal(parts(triangle, 'Oval', 'None')[0].material, 4);
});

test('mounted beanies follow the band and brim fit for the selected glasses', async () => {
  const { builderFittings } = await import('./engine/dot-builder-fittings.ts');
  const { fittedMesh } = await import('./engine/dot-fitted-mesh.ts');
  const { dotMesh } = await import('./engine/dot-mesh.ts');
  const template = dotMesh('Beanie');
  const bare = fittedMesh(template, builderFittings['dot-blossie/Beanie']);
  const fit = builderFittings['dot-blossie/Beanie/Round sunglasses'];
  const worn = fittedMesh(template, fit);
  assert.equal(worn, fittedMesh(template, fit));
  assert.equal(worn.indices.length, bare.indices.length);
  let displacement = 0;
  for (let i=0; i<worn.vertices.length; i+=6) {
    displacement = Math.max(displacement, Math.hypot(
      worn.vertices[i] - bare.vertices[i], worn.vertices[i+1] - bare.vertices[i+1], worn.vertices[i+2] - bare.vertices[i+2]));
  }
  assert.ok(displacement > .40);
});
