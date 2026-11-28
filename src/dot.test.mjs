import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BODIES,
  GALLERY,
  avatarParts,
  DOT_COLOURS,
  DOT_EYES,
  DOT_EXTRA_COLOURS,
  DOT_EXTRAS,
  DOT_GLASSES,
  DOT_PICKER_SHAPES,
  DOT_SHAPES,
  bodyOf,
  dotAvatar,
  dotExtras,
  drawAvatar,
  stillState,
  validateAvatar,
  VIEW,
  VIEW_UNIT,
} from './index.ts';
import { flattenPath, insideRow, parsePath } from './engine/outline/path.ts';
import { dotFeatures } from './engine/dot-features.ts';
import { coatMesh } from './engine/coat.ts';
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

test('the shared wardrobe preserves each Blot outline and its original eyes, then fits replacement parts', () => {
  const imported = { ...GALLERY[0].definition, id: 'my-avatar' };
  for (const shape of [...Object.keys(BODIES), ...GALLERY.map(g => g.definition), imported]) {
    const original = bodyOf(shape);
    const draw = body => drawAvatar(body, '#FFFFFF', front, 96);
    const glasses = avatarParts(shape, { glasses: 'Monocle' }).body;
    assert.equal(glasses.wardrobeHost, original);
    assert.equal(glasses.eyes, original.eyes);
    assert.equal(avatarParts(shape, { glasses: 'Monocle' }).body, glasses);
    const plain = draw(original), fitted = draw(glasses);
    assert.equal(fitted.body, plain.body, original.id);
    assert.deepEqual(fitted.eyes, plain.eyes, original.id);
    assert.ok(fitted.layers.some(layer => layer.solid && layer.d), original.id);
    const dressed = avatarParts(shape, { eyes: 'Sparkle capsules', extra: 'Crown' }).body;
    const drawing = draw(dressed);
    assert.deepEqual(drawing.eyes, ['', '']);
    assert.ok(drawing.layers.some(layer => layer.id === 'crown-band' && layer.d));
    assert.ok(drawing.layers.some(layer => layer.id === 'right' && layer.d));
    assert.ok(dotFeatures(dressed).every(part => part.axes.every(Number.isFinite)), original.id);
  }
  const customBody = { ...bodyOf('star'), id: 'my-rig', look: .4 };
  const custom = avatarParts(customBody, { extra: 'Beanie' });
  assert.equal(custom.shape, 'my-rig');
  assert.equal(custom.body.wardrobeHost, customBody);
  assert.equal(custom.body.look, .4);
  assert.equal(coatMesh(avatarParts('star', { extra: 'Crown' }).body), coatMesh(bodyOf('star')));
  assert.deepEqual(drawAvatar(avatarParts('star', { glasses: 'Round sunglasses' }).body, '#FFF', front, 96).eyes, ['', '']);
  const native = avatarParts('dot-rounded-triangle', { extra: 'Crown' }).body;
  assert.equal(native.wardrobeHost, undefined);
  assert.equal(native, dotAvatar({ shape: 'dot-rounded-triangle', extra: 'Crown' }).body);
});

test('changing an outfit on a Blot body keeps its pointer rig and its in-flight pose', async () => {
  const { Rig } = await import('./engine/rig.ts');
  const original = bodyOf('star'), dressed = avatarParts('star', { glasses: 'Monocle' }).body;
  const before = new Rig({ body: original, seed: 5 }), after = new Rig({ body: original, seed: 5 });
  for (const rig of [before, after]) rig.look(.8, -.45);
  for (let frame=0; frame<180; frame++) {
    if (frame === 20) after.setBody(dressed);
    if (frame === 80) for (const rig of [before, after]) rig.stop();
    if (frame === 120) after.setBody(original);
    before.step(1000/60);
    after.step(1000/60);
    assert.deepEqual(before.state.eye, after.state.eye);
    assert.deepEqual(before.state.pose, after.state.pose);
    assert.equal(after.state.morph, before.state.morph);
  }
});

test('Frog picker portraits keep both raised eye sockets facing the viewer', () => {
  const frog = DOT_SHAPES.find(shape => shape.id === 'dot-rounded-head-with-two-ears');
  assert.equal(frog.name, 'Frog');
  for (const shape of [frog, frog.id]) {
    const state = stillState(shape, 56);
    assert.deepEqual(state.pose, { yaw: 0, pitch: 0, roll: 0 });
    const drawing = drawAvatar(avatarParts(shape).body, '#B6D80B', state, 56);
    for (const side of ['left', 'right']) {
      assert.ok(drawing.layers.some(layer => layer.id === side + '-socket' && layer.d));
      assert.ok(drawing.layers.some(layer => layer.id === side && layer.d));
    }
  }
});

test('the editable frog shares todd’s socket and pupil geometry and motion without his bow', async () => {
  const { DOT_CHARACTERS, DOT_CLIPS } = await import('./index.ts');
  const todd = dotAvatar(DOT_CHARACTERS.Todd).body;
  const frog = avatarParts('dot-rounded-head-with-two-ears').body;
  function compare(playback) {
    for (const [x,y] of [[0,0],[-.8,.9],[1,-1]]) {
      const motion = { x,y,left:1,right:1,playback };
      const expected = dotFeatures(todd,motion).filter(s => s.finish);
      const actual = dotFeatures(frog,motion);
      assert.equal(actual.length,expected.length);
      actual.forEach((part,i) => {
        assert.equal(part.mesh,expected[i].mesh);
        assert.deepEqual(part.axes,expected[i].axes);
      });
    }
  }
  compare();
  for (const clip of Object.values(DOT_CLIPS)) {
    for (const dir of [-1,1]) {
      const channels = {yaw:0,pitch:0,roll:0};
      clip.apply(channels,{u:.42,cue:{dir,amount:1}});
      compare(channels.dotPlayback);
    }
  }
});

test('headphones add only the arch and two pads to each editable wearer', () => {
  for (const shape of DOT_SHAPES) {
    const bare = dotFeatures(dotAvatar({ shape: shape.id }).body);
    const worn = dotFeatures(dotAvatar({ shape: shape.id, extra: 'Headphones' }).body);
    assert.deepEqual(worn.slice(0, bare.length), bare, shape.name);
    assert.equal(worn.length - bare.length, 3, shape.name);
  }
  const { body } = dotAvatar({ shape: 'dot-rounded-head-with-two-ears', extra: 'Headphones' });
  const [socket, pupil, rightSocket, rightPupil] = dotFeatures(body, { x: 0, y: 0, left: .35, right: 1 });
  assert.equal(socket.axes[4], .35);
  assert.equal(pupil.axes[4], .35);
  assert.equal(rightSocket.axes[4], 1);
  assert.equal(rightPupil.axes[4], 1);
});

test('glasses on a Blot face keep a continuous curved rim as its eyes move', async () => {
  const { FRAME_CURVE } = await import('./engine/dot-parts.ts');
  for (const glasses of DOT_GLASSES.slice(1)) {
    const meshes = [];
    for (const host of ['teardrop', GALLERY.find(g => g.definition.id === 'egg').definition]) {
      const { body } = avatarParts(host, { glasses });
      const rest = dotFeatures(body);
      assert.deepEqual(dotFeatures(body, { x: .8, y: -.6, left: .1, right: 1 }), rest);
      assert.ok(rest.length > 0);
      for (const { mesh } of rest) {
        const v = mesh.vertices;
        for (let i = 0; i < v.length; i += 6) {
          assert.ok(Math.abs(v[i+2] + FRAME_CURVE * v[i] ** 2) <= .018, glasses);
        }
      }
      meshes.push(rest.map(p => p.mesh));
      const view = drawAvatar(body, '#FFFFFF', { ...front, pose: { yaw: -.6, pitch: 0, roll: 0 } }, 180);
      if (glasses === 'Monocle' || glasses === 'Tall oval frames') {
        assert.ok(view.eyes.every(Boolean));
        assert.equal(view.layers.filter(layer => layer.overEyes).length, rest.length);
      } else assert.deepEqual(view.eyes, ['', '']);
    }
    assert.ok(meshes[0].every((mesh, index) => mesh === meshes[1][index]));
  }
});

test('headwear fits a flat-topped Blot outline and keeps rigid props proportional', async () => {
  const { bodyAttachment, fitHeadband, rigidAttachment } = await import('./coat/wardrobe-fit.ts');
  const { dotMesh } = await import('./engine/dot-mesh.ts');
  const host = bodyOf(GALLERY.find(g => g.definition.id === 'mug').definition);
  const mesh = coatMesh(host), source = dotMesh('dot-rounded-triangle').box;
  const fit = bodyAttachment(host, mesh, source);
  for (const extra of ['Beret', 'Tuft', 'Bow tie', 'Crown']) {
    const prop = dotMesh(extra);
    const mount = rigidAttachment(host, fit, source, prop, extra);
    assert.equal(mount[0], mount[4]);
    assert.equal(mount[0], mount[8]);
    if (extra !== 'Bow tie') assert.ok(mount[4]*prop.box[4] + mount[10] > mesh.box[4] + .12, extra);
  }
  const worn = dotFeatures(avatarParts(host, { extra: 'Headphones' }).body);
  const hoop = worn.find(part => !part.finish).mesh;
  const band = fitHeadband(host, hoop, fit);
  assert.notEqual(band, hoop);
  assert.ok(band.vertices.every(Number.isFinite));
  assert.equal(fitHeadband(host, hoop, fit), band);
});

test('rapid fitted shape changes and visits land with the full face and material on every frame', async () => {
  const { Rig } = await import('./engine/rig.ts');
  const classic = bodyOf('star'), egg = avatarParts('teardrop', { glasses: 'Tall oval frames' }).body;
  const frog = dotAvatar({ shape: 'dot-rounded-head-with-two-ears', extra: 'Headphones' }).body;
  const rig = new Rig({ body: classic, idle: false });
  rig.setBody(bodyOf('teardrop'));
  rig.step(60);
  assert.ok(rig.state.morph);
  function assembled(expected) {
    const d = drawAvatar(expected, '#FFFFFF', rig.state, 180, { coat: true });
    assert.equal(rig.state.morph, null);
    assert.equal(rig.state.dot, 0);
    assert.equal(d.coat.body, expected);
    assert.equal(d.coat.warp, undefined);
    assert.equal(d.coat.also, undefined);
    assert.ok(d.coat.dotFace);
    assert.ok(d.layers.some(p => p.solid && p.d));
  }
  for (const body of [egg, frog, egg, frog]) {
    rig.setBody(body);
    assembled(body);
    rig.step(16);
    assembled(body);
  }
  rig.visit(egg, 0);
  assembled(egg);
  for (let frame = 0; frame < 100; frame++) rig.step(16);
  assembled(frog);
  rig.setBody(classic);
  assert.equal(rig.state.morph, null);
  rig.setBody(bodyOf('blob'));
  assert.ok(rig.state.morph);
});

test('every Dot contour fits its measured native-aspect silhouette before and after inflation', () => {
  assert.equal(DOT_PICKER_SHAPES.length, reference.length);
  for (const [i, shape] of DOT_PICKER_SHAPES.entries()) {
    assert.equal(shape.name, reference[i][0] === 'Rounded head with two ears' ? 'Frog' : reference[i][0]);
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

test('the rounded-triangle pile changes density with rendered size', async () => {
  const { dotFibreCount } = await import('./coat/dot-fibres.ts');
  const { triangleFibres } = await import('./coat/dot-fibre-data.ts');
  const { fibreProfiles, fibreViews } = await import('./coat/dot-fibre-views.ts');
  const roots = Buffer.from(triangleFibres,'base64').length / (9*2);
  assert.equal(roots,8192);
  for (const [size,count] of [[32,63],[64,232],[96,357],[128,510],[256,1560],[384,3310],[512,5759],[768,8192]]) {
    assert.ok(Math.abs(dotFibreCount(size)-count) <= 1, String(size));
  }
  assert.equal(dotFibreCount(1024),roots);
  // Each view stores a visibility mask followed by nine optical values per visible tuft.
  const profiles = Buffer.from(fibreProfiles,'base64');
  let cursor = 0;
  for (const axes of fibreViews) {
    assert.equal(axes.length,6);
    let visible = 0;
    for (const byte of profiles.subarray(cursor,cursor+roots/8)) {
      for (let mask=byte; mask; mask &= mask-1) visible++;
    }
    cursor += roots/8 + visible*9;
  }
  assert.equal(cursor,profiles.length);
});

test('editing a dressed body preserves its host, inherited parts and explicit removals', () => {
  const shapes = [...Object.keys(BODIES), ...DOT_SHAPES.map(s => s.id),
    ...GALLERY.map(g => g.definition), { ...GALLERY[0].definition, id: 'imported-controller' }];
  for (const shape of shapes) {
    const extra = dotExtras(shape).includes('Headphones') ? 'Headphones' : 'Bow tie';
    const first = avatarParts(shape, { glasses: 'Tall oval frames', extra, extraColour: '#FFCC38' });
    assert.equal(avatarParts(first.body).body, first.body);
    for (const eyes of DOT_EYES) {
      const next = avatarParts(first.body, { eyes }).body;
      assert.equal(next.wardrobeHost, first.body.wardrobeHost);
      assert.equal(next.dotStyle.glasses, 'Tall oval frames');
      assert.equal(next.dotStyle.extra, extra);
      assert.equal(next.dotStyle.extraColour, '#FFCC38');
      assert.equal(next.dotStyle.eyes, next.id === 'dot-rounded-head-with-two-ears' ? 'Oval' : eyes);
      assert.equal(avatarParts(next, { extra: 'None' }).body.dotStyle.extra, 'None');
    }
  }
});

test('the closed lid hides multilayer catchlights without changing the eyewear', () => {
  for (const eyes of ['Sparkle capsules', 'Crescent inset', 'Round highlights']) {
    const { body } = avatarParts('dot-hexagon', { eyes, glasses: 'Tall oval frames' });
    const open = dotFeatures(body);
    const shut = dotFeatures(body, { x: 0, y: 0, left: 0, right: 0 });
    assert.ok(open.some(s => s.finish === 'white'));
    assert.ok(shut.every(s => s.finish !== 'white'));
    assert.deepEqual(shut.slice(-2), open.slice(-2));
  }
});

test('a mirrored or ordinary wink closes at the wearer’s own socket', async () => {
  const { DOT_CLIPS, DOT_CHARACTERS } = await import('./index.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  for (const recipe of [{ shape: 'dot-rounded-head-with-two-ears' }, DOT_CHARACTERS.Todd]) {
    const body = dotAvatar(recipe).body;
    const rest = dotFeatures(body);
    for (const dir of [-1, 1]) {
      const channels = { yaw: 0, pitch: 0, roll: 0 };
      DOT_CLIPS['dot-wink'].apply(channels, { u: .35, cue: { amount: 1, dir } });
      const playback = channels.dotPlayback;
      const parts = dotFeatures(body, { x: 0, y: 0, left: 1, right: 1, playback });
      const stroke = parts.find(part => part.faceLayer === 0);
      const index = dir === 1 ? 0 : 2;
      assert.equal(stroke.mesh, rest[index+1].mesh);
      const box = rest[index].mesh.box;
      const x = (box[0]+box[3])/2, y = (box[1]+box[4])/2;
      const a = stroke.axes;
      assert.ok(Math.abs(a[1]*x+a[4]*y+a[10]-y) < .012*DOT_RADIUS);
      assert.equal(parts.filter(part => part.finish === 'white').length, 1);
      const svg = drawAvatar(body, '#ffffff', { ...front, dotPlayback: playback }, 180);
      assert.equal(svg.layers.filter(layer => layer.id.endsWith('-socket')).length, 1);
    }
  }
});

test('a tinted preset extra retains the portrait mesh, eye fittings and stage rig', async () => {
  const { DOT_CATALOG } = await import('./index.ts');
  for (const name of ['Josh', 'Thelma', 'Tavi']) {
    const recipe = DOT_CATALOG.find(item => item.name === name).appearance;
    const original = dotAvatar(recipe).body;
    const dyed = dotAvatar({ ...recipe, extraColour: '#FA70AB', tintExtra: true, catalogGloss: true }).body;
    assert.equal(coatMesh(dyed), coatMesh(original));
    assert.equal(dyed.dotStyle.character, original.dotStyle.character);
    assert.equal(dyed.dotStyle.catalogId, original.dotStyle.catalogId);
    const before = dotFeatures(original), after = dotFeatures(dyed, undefined, [250,112,171]);
    assert.deepEqual(after.map(p => p.mesh), before.map(p => p.mesh));
    assert.deepEqual(after.map(p => p.axes), before.map(p => p.axes));
    assert.ok(after.some(p => !p.finish && p.tint[0] === 250 && p.material === undefined));
    const pile = after.filter(p => p.pileTint);
    assert.equal(pile.length, name === 'Tavi' ? 0 : 1);
    for (const ornament of pile) assert.equal(ornament.portraitSection, before.find(p => p.mesh === ornament.mesh).portraitSection);
  }
});

test('replacing one portrait component keeps the shell and untouched fittings', async () => {
  const { DOT_CATALOG, DOT_CHARACTERS } = await import('./index.ts');
  for (const recipe of [...Object.values(DOT_CHARACTERS), ...DOT_CATALOG.map(row => row.appearance)]) {
    const base = dotAvatar(recipe).body;
    const before = dotFeatures(base);
    for (const parts of [
      { eyes: 'Sparkle capsules' },
      { glasses: recipe.glasses === 'Monocle' ? 'None' : 'Monocle' },
      { extra: recipe.extra === 'Headphones' ? 'Bow tie' : 'Headphones' },
    ]) {
      const edited = dotAvatar({ ...recipe, parts }).body;
      assert.equal(avatarParts(base, parts).body, edited);
      assert.equal(coatMesh(edited), coatMesh(base));
      const after = dotFeatures(edited);
      assert.ok(after.every(p => p.axes.every(Number.isFinite)));
      if (parts.extra) {
        const face = before.filter(p => p.finish);
        for (const piece of face) assert.ok(after.some(p => p.mesh === piece.mesh && p.finish === piece.finish));
      } else {
        for (const prop of before.filter(p => !p.finish)) assert.ok(after.some(p => p.mesh === prop.mesh));
      }
    }
  }
});

test('josh has a continuous pale lens underneath each moving crescent', async () => {
  const { DOT_CATALOG } = await import('./index.ts');
  const { DOT_RADIUS } = await import('./engine/dot-mesh.ts');
  const { body } = dotAvatar(DOT_CATALOG.find(row => row.name === 'Josh').appearance);
  const parts = dotFeatures(body);
  for (const [lens, pupil] of [[parts[0], parts[1]], [parts[2], parts[3]]]) {
    const v = lens.mesh.vertices, p = pupil.mesh.vertices;
    const cx = (lens.mesh.box[0]+lens.mesh.box[3])/2;
    const cy = (lens.mesh.box[1]+lens.mesh.box[4])/2;
    let centralSurface = false;
    for (let i = 0; i < v.length; i += 6) {
      if (Math.hypot(v[i]-cx,v[i+1]-cy) < .005 && v[i+5] > .9) centralSurface = true;
    }
    assert.ok(centralSurface, 'the body would show through a hole beneath the pupil');
    for (let i = 0; i < p.length; i += 6) {
      if (p[i+5] < .1) continue;
      const radius = Math.hypot(p[i]-cx,p[i+1]-cy) / (.1919*DOT_RADIUS);
      const support = DOT_RADIUS * (.576+.05*Math.sqrt(Math.max(0,1-radius**2)));
      assert.ok(p[i+2] >= support && p[i+2] < support+.004);
    }
  }
});

test('wardrobe definitions filter both wearable categories and place the complete extra on either side', async () => {
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const input = { ...DOT_SHAPES.find(d => d.id === 'dot-heart'), id: 'two-lobes',
    wardrobe: { glasses: ['Monocle'], extras: ['Hat'], mounts: [
      { id: 'left', x: 25, extras: ['Hat'] }, { id: 'right', x: 75, extras: ['Hat'] },
    ] } };
  const result = validateAvatar(input);
  assert.ok(result.ok);
  assert.deepEqual(result.value.wardrobe, input.wardrobe);
  assert.deepEqual(dotExtras(result.value), ['None','Hat']);
  assert.equal(validateAvatar({ ...input, wardrobe: { ...input.wardrobe, mounts: [{ id:'right', x:120, extras:['Crown'] }] } }).ok, false);
  assert.equal(validateAvatar({ ...input, wardrobe: { glasses:['anything'] } }).ok, false);
  const denied = avatarParts(result.value, { glasses:'Round sunglasses', extra:'Crown' }).body;
  assert.equal(denied.dotStyle.extra, 'None');
  assert.equal(denied.dotStyle.glasses, 'None');
  const left = avatarParts(result.value, { glasses:'Monocle', extra:'Hat', extraMount:'left' }).body;
  const right = avatarParts(left, { extraMount:'right' }).body;
  const free = avatarParts({ ...input, wardrobe:undefined }, { extra:'Crown' }).body;
  assert.equal(free.dotStyle.extra, 'Crown');
  const mesh = coatMesh(left);
  const parts = b => wardrobeSolids(b, mesh);
  const a = parts(left), b = parts(right);
  for (let i=0; i<a.length; i++) {
    const shift = b[i].axes[9] - a[i].axes[9];
    assert.ok(Math.abs(shift - (a[i].finish ? 0 : (mesh.box[3]-mesh.box[0])/2)) < 1e-6);
  }
  assert.equal(avatarParts(right,{extra:'None'}).body.dotStyle.extraMount, undefined);
  assert.equal(avatarParts(right,{extraMount:'original'}).body.dotStyle.extraMount, undefined);
});

test('dot cue strength zero rests both eyes and body, and direction mirrors a full-strength clip', async () => {
  const { DOT_CLIPS } = await import('./index.ts');
  const { start } = await import('./engine/clips.ts');
  for (const clip of Object.values(DOT_CLIPS)) {
    function sample(amount, dir) {
      const playing = start(clip,{amount,dir});
      playing.u = .37;
      const out = {yaw:0,pitch:0,roll:0};
      clip.apply(out,playing);
      return out;
    }
    const off = sample(0,1), normal = sample(1,1), mirrored = sample(1,-1), strong = sample(2,1);
    assert.deepEqual(off.dotPlayback.scale,[1,1,1]);
    assert.ok(off.dotPlayback.offset.every(x => x === 0));
    assert.deepEqual(off.dotPlayback.eyes[0],[1,0,0,0,1,0,0,0,1,0,0,0]);
    assert.ok(mirrored.yaw === -normal.yaw && mirrored.roll === -normal.roll && mirrored.pitch === normal.pitch);
    assert.ok(strong.dotPlayback.scale.every(v => Number.isFinite(v) && v > 0));
  }
});

test('orbit and radar carry two visible eyes on their own disc as the wearer turns', async () => {
  const { eyeShapes } = await import('./engine/draw.ts');
  const { figureRadius } = await import('./engine/figures.ts');
  const { DOT_CHARACTERS } = await import('./index.ts');
  const wearers = [...DOT_SHAPES.map(s => dotAvatar({shape:s.id}).body),
    ...Object.values(DOT_CHARACTERS).map(p => dotAvatar(p).body),
    ...Object.keys(BODIES).map(id => avatarParts(id,{eyes:'Sleepy lids'}).body)];
  for (const body of wearers) for (const form of ['orbit','radar']) for (const yaw of [-1.5,0,1.5]) {
    const state = { ...front, dot:1, eyeScale:1, eye:{x:Math.sign(yaw),y:-1}, pose:{yaw,pitch:.55,roll:-.4},
      figure:{form,k:1,turn:.73,progress:.5} };
    const [left,right] = eyeShapes(body,state,120);
    const dots = form === 'orbit' ? [left[0],right[0]] : left.slice(0,2);
    assert.equal(dots.filter(Boolean).length,2,body.id);
    const radius = figureRadius(form);
    for (const dot of dots) for (let i=0;i<dot.length;i+=2) assert.ok(Math.hypot(dot[i],dot[i+1]) < radius*.85);
    const frame = drawAvatar(body,'#8040ae',state,120);
    assert.equal(frame.eyeFill,'#202024');
  }
});

test('selecting another authored motion hands over the visible pose and eye track', async () => {
  const { DOT_CLIPS } = await import('./index.ts');
  const { Rig } = await import('./engine/rig.ts');
  const { socketMotion } = await import('./engine/dot-motion.ts');
  const rig = new Rig({ clips:DOT_CLIPS, idle:false, blinks:false });
  rig.play('dot-barrel-roll');
  rig.step(DOT_CLIPS['dot-barrel-roll'].ms*.45);
  const before = [...Object.values(rig.state.pose), ...rig.state.dotPlayback.offset];
  const eyes = socketMotion('frog',rig.state.dotPlayback.activity);
  rig.play('dot-curious-tilt');
  rig.step(0);
  assert.deepEqual([...Object.values(rig.state.pose), ...rig.state.dotPlayback.offset],before);
  assert.deepEqual(socketMotion('frog',rig.state.dotPlayback.activity),eyes);
  rig.step(200);
  const control = new Rig({ clips:DOT_CLIPS, idle:false, blinks:false });
  control.play('dot-curious-tilt');
  control.step(200);
  assert.deepEqual(rig.state.pose,control.state.pose);
  assert.deepEqual(rig.state.dotPlayback,control.state.dotPlayback);
});

test('the svg activity moves iris’s glints while both dark supports stay in place', async () => {
  const { DOT_CHARACTERS } = await import('./index.ts');
  const { dotFace } = await import('./engine/dot-parts.ts');
  const { body } = dotAvatar(DOT_CHARACTERS.Iris);
  const face = gaze => dotFace(body,body.dotStyle,{
    ...front,lid:1,eye:{x:0,y:0},dotPlayback:{activity:{slug:'curious-tilt',gaze}},
  },[1,0,0,0,1,0,0,0,1],192);
  const neutral = face([0,0]), looking = face([.9,.3]);
  for (const side of ['left','right']) {
    const paths = (parts,id) => parts.find(p => p.id === id).polys;
    assert.deepEqual(paths(looking,side),paths(neutral,side));
    assert.notDeepEqual(paths(looking,side+'-glint'),paths(neutral,side+'-glint'));
  }
});

test('each fitted catalog extra retains the observed position and size of its own preset', async () => {
  const { DOT_CATALOG } = await import('./index.ts');
  const { catalogParts } = await import('./engine/dot-catalog-parts.ts');
  const { dotFeatures } = await import('./engine/dot-features.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  let checked = 0;
  for (const {id,appearance} of DOT_CATALOG) {
    const measured = catalogParts(id);
    if (!measured) continue;
    const parts = dotFeatures(dotAvatar(appearance).body);
    for (const [i,section] of measured.entries()) {
      if (section.role !== 'extra') continue;
      const {mesh,axes} = parts[i], v = mesh.vertices;
      let left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
      for (let j=0;j<v.length;j+=6) {
        const x = (axes[0]*v[j]+axes[3]*v[j+1]+axes[6]*v[j+2]+axes[9])/DOT_RADIUS;
        const y = (axes[1]*v[j]+axes[4]*v[j+1]+axes[7]*v[j+2]+axes[10])/DOT_RADIUS;
        left=Math.min(left,x); right=Math.max(right,x);
        bottom=Math.min(bottom,y); top=Math.max(top,y);
      }
      const [x,y,,radius] = section.origin;
      assert.ok(Math.hypot((left+right)/2-x,(bottom+top)/2-y)<.015,id+' extra position');
      assert.ok(Math.abs(Math.max(right-left,top-bottom)/(2*radius)-1)<.03,id+' extra size');
      checked++;
    }
  }
  assert.ok(checked>=77);
});

test('preset accessories keep their fitted bounds in the SVG from the front, side and top', async () => {
  const { DOT_CATALOG, DOT_CHARACTERS } = await import('./index.ts');
  const { dotExtra } = await import('./engine/dot-parts.ts');
  const { bounds } = await import('./engine/math.ts');
  const { headwearBounds } = await import('./coat/wardrobe-solids.ts');
  const views = [
    { rotation: [1,0,0, 0,1,0, 0,0,1], axes: [0,1] },
    { rotation: [0,0,1, 0,1,0, -1,0,0], axes: [2,1] },
    { rotation: [1,0,0, 0,0,1, 0,-1,0], axes: [0,2] },
  ];
  const recipes = [...Object.values(DOT_CHARACTERS), ...DOT_CATALOG.map(p => p.appearance)];
  for (const recipe of recipes) {
    if (!recipe.extra || recipe.extra === 'None') continue;
    const base = dotAvatar(recipe).body;
    const mounts = base.wardrobe?.mounts?.filter(m => m.extras.includes(recipe.extra)).map(m => m.id) ?? [];
    for (const extraMount of [undefined,...mounts]) {
      const body = dotAvatar({ ...recipe, extraMount }).body, box = headwearBounds(body);
      for (const { rotation, axes: [u,v] } of views) {
        const parts = dotExtra(body,body.dotStyle,rotation,48);
        const actual = bounds(parts.flatMap(p => p.polys));
        const expected = [box[u],-box[v+3],box[u+3],-box[v]];
        assert.ok(actual.every((x,i) => Math.abs(x-expected[i]) < .001),
          [recipe.catalogId ?? recipe.character,extraMount,u,v,actual,expected].join(' '));
      }
    }
  }
});

test('the paintbrush seats the portrait beret on the bristles or the handle in body coordinates', async () => {
  const { coatMesh } = await import('./engine/coat.ts');
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const { beretSections } = await import('./engine/dot-features.ts');
  const { DOT_RADIUS } = await import('./engine/dot-depth.ts');
  const brush = GALLERY.find(row => row.definition.id === 'paint-brush').definition;
  const imported = validateAvatar(JSON.parse(JSON.stringify({ ...brush,id:'brush-import' })));
  assert.equal(imported.ok,true);
  assert.deepEqual(imported.value.wardrobe,brush.wardrobe);
  for (const shape of [brush,imported.value]) for (const mount of [undefined,'handle-tip']) {
    const { body } = avatarParts(shape,{ extra:'Beret',extraMount:mount });
    const shell = coatMesh(body);
    const gear = wardrobeSolids(body,shell).filter(part => !part.finish);
    assert.deepEqual(gear.map(part => part.mesh),beretSections());
    const seat = mount ? { ...brush.wardrobe.mounts[0].seat,x:88 } : brush.wardrobe.seats.Beret;
    const [band] = gear;
    // The actual band centre must land on the declared point after fitting,
    // independent of the eye position and even after changing outfits.
    const centre = [-.1594,.4172,-.0100].map(x => x*DOT_RADIUS);
    for (let k=0; k<3; k++) {
      const a=band.axes, actual = a[k]*centre[0]+a[k+3]*centre[1]+a[k+6]*centre[2]+a[k+9];
      const expected=shell.box[k]+[seat.x,seat.y,seat.z][k]*(shell.box[k+3]-shell.box[k])/100;
      assert.ok(Math.abs(actual-expected)<1e-6);
    }
    const restored=avatarParts(avatarParts(body,{extra:'Hat'}).body,{extra:'Beret',extraMount:mount}).body;
    assert.deepEqual(wardrobeSolids(restored,coatMesh(restored)).filter(p=>!p.finish).map(p=>p.axes),gear.map(p=>p.axes));
  }
  const bad = seat => validateAvatar({ ...brush,wardrobe:{ seats:{ Beret:seat } } }).ok;
  for (const seat of [{},{ ...brush.wardrobe.seats.Beret,y:101 },{ ...brush.wardrobe.seats.Beret,label:3 },{ ...brush.wardrobe.seats.Beret,width:0 }]) assert.equal(bad(seat),false);
});

test('the exported crown follows the slope of each paintbrush seat', async () => {
  const { dotExtra } = await import('./engine/dot-parts.ts');
  const brush = GALLERY.find(row => row.definition.id === 'paint-brush').definition;
  const front = new Float64Array([1,0,0,0,1,0,0,0,1]);
  for (const extraMount of [undefined,'handle-tip']) {
    const { body } = avatarParts(brush,{extra:'Crown',extraMount});
    const [band] = dotExtra(body,body.dotStyle,front,48).find(part => part.id === 'crown-band').polys;
    let left=0,right=0;
    for (let i=2; i<band.length; i+=2) {
      if (band[i]<band[left]) left=i;
      if (band[i]>band[right]) right=i;
    }
    const rise = (band[left+1]-band[right+1])/(band[right]-band[left]);
    assert.ok(extraMount ? rise < -.25 : rise > .25,'the brim must follow the selected seat');
  }
});

test('changing the dye on an original catalog beret preserves its geometry and placement', async () => {
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const { coatMesh } = await import('./engine/coat.ts');
  const { DOT_CATALOG } = await import('./index.ts');
  for (const {appearance} of DOT_CATALOG.filter(p => p.appearance.extra==='Beret')) {
    const original=dotAvatar(appearance).body;
    const tinted=avatarParts(original,{extraColour:'#FA70AB'}).body;
    const gear=body => wardrobeSolids(body,coatMesh(body)).filter(p=>!p.finish);
    const before=gear(original), after=gear(tinted);
    assert.equal(after.length,before.length,appearance.catalogId ?? appearance.character);
    for (let i=0; i<before.length; i++) {
      assert.equal(after[i].mesh,before[i].mesh);
      assert.deepEqual(after[i].axes,before[i].axes);
    }
  }
});

test('editable berets use the portrait surfaces and stay inside their measured mount when eyewear changes', async () => {
  const { coatMesh } = await import('./engine/coat.ts');
  const { wardrobeSolids,headwearBounds } = await import('./coat/wardrobe-solids.ts');
  const { beretSections } = await import('./engine/dot-features.ts');
  for (const shape of DOT_SHAPES.filter(shape=>dotExtras(shape).includes('Beret'))) {
    for (const glasses of DOT_GLASSES) {
      const options={ extra:'Beret',glasses };
      const {body} = avatarParts(shape.id,options);
      const gear = wardrobeSolids(body,coatMesh(body)).filter(s=>!s.finish);
      assert.deepEqual(gear.map(s=>s.mesh),beretSections(),shape.id);
      const expected = headwearBounds(dotAvatar({shape:shape.id,...options}).body);
      assert.ok(headwearBounds(body).every((n,i)=>Math.abs(n-expected[i])<.0001),shape.id+' '+glasses);
    }
  }
});

test('transferred eyes remain visible across the profile until the front cheek hides them', async () => {
  const { dotFace } = await import('./engine/dot-parts.ts');
  const { rotation,area } = await import('./engine/math.ts');
  for (const shape of ['blob','teardrop','wedge','clover']) {
    const {body}=avatarParts(shape,{ eyes:'Crescent inset' });
    const ink = yaw => dotFace(body,body.dotStyle,{eye:{x:0,y:0},lid:1},
      rotation({ yaw,pitch:0,roll:0 }),192).filter(p=>p.id==='left'||p.id==='right')
      .flatMap(p=>p.polys).reduce((sum,p)=>sum+Math.abs(area(p)),0);
    for (const sign of [-1,1]) {
      const before=ink(sign*(Math.PI/2-.001)), after=ink(sign*(Math.PI/2+.001));
      assert.ok(after>0 && Math.abs(after-before)<.001,shape+' profile');
    }
    assert.equal(ink(Math.PI),0,shape+' back');
  }
});

test('the near frog socket occludes the far pupil in a turned SVG', async () => {
  const { dotFace } = await import('./engine/dot-parts.ts');
  const { rotation } = await import('./engine/math.ts');
  const {body}=avatarParts('dot-rounded-head-with-two-ears');
  const visible = yaw => dotFace(body,body.dotStyle,{eye:{x:0,y:0},lid:1},
    rotation({yaw,pitch:.04,roll:0}),192).map(p=>p.id);
  assert.ok(visible(0).includes('right') && visible(0).includes('left'));
  assert.ok(!visible(1.7).includes('right'));
  assert.ok(!visible(-1.7).includes('left'));
});

test('every rigid eyewear style sits against the rendered cheek of the blob and paintbrush', async () => {
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const { frontDepth } = await import('./coat/face-surface.ts');
  for (const shape of ['blob', GALLERY.find(p=>p.definition.id==='paint-brush').definition]) {
    for (const glasses of DOT_GLASSES.slice(1)) {
      const {body}=avatarParts(shape,{glasses,eyes:'Crescent inset'}), shell=coatMesh(body);
      const frames = wardrobeSolids(body,shell).filter(p=>p.eyewear && p.mesh.vertices.length>192);
      let gap=Infinity;
      for (const {mesh,axes:a} of frames) {
        const v=mesh.vertices;
        for (let i=0; i<v.length; i+=6) {
          const [x,y,z]=[0,1,2].map(k=>a[k]*v[i]+a[k+3]*v[i+1]+a[k+6]*v[i+2]+a[k+9]);
          const skin=frontDepth(shell,x,y);
          if (skin!==undefined) gap=Math.min(gap,z-skin);
        }
      }
      assert.ok(Math.abs(gap-.008)<.0001,body.id+' '+glasses+' '+gap);
    }
  }
});
test('both headphone cushions touch the surface across built-in and gallery bodies', async () => {
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const { prepare, surfaceTop } = await import('./engine/body.ts');
  for (const shape of [...Object.keys(BODIES),...GALLERY.map(row => row.definition)]) {
    const id = typeof shape === 'string' ? shape : shape.id;
    const { body } = avatarParts(shape, { extra: 'Headphones' });
    if (typeof shape !== 'string' && shape.wardrobe?.extras && !shape.wardrobe.extras.includes('Headphones')) {
      assert.equal(body.dotStyle.extra,'None');
      continue;
    }
    const shell = body.wardrobeHost.outline ?? body.wardrobeHost;
    const skin = prepare(shell), hit = { z:0, nx:0, ny:0, nz:1 };
    const [, ...pads] = wardrobeSolids(body,coatMesh(body)).filter(part => !part.finish);
    assert.equal(pads.length,2);
    for (const { mesh, axes } of pads) {
      let contact = false;
      for (let i = 0; i < mesh.vertices.length; i += 6) {
        const x = axes[9] + axes[0]*mesh.vertices[i];
        const y = axes[10] + axes[4]*mesh.vertices[i+1];
        const z = axes[11] + axes[8]*mesh.vertices[i+2];
        if (surfaceTop(skin,x,y,hit) && Math.abs(z) < hit.z) { contact = true; break; }
      }
      assert.ok(contact,id+' cushion misses the head');
    }
  }
});

test('sleepy brows keep their open shape during sleep, blinks and one-sided winks', async () => {
  const { DOT_CATALOG } = await import('./index.ts');
  const { dotFace } = await import('./engine/dot-parts.ts');
  const sunny = dotAvatar(DOT_CATALOG.find(row => row.id === 'sunny').appearance).body;
  for (const wearer of ['dot-rounded-triangle','blob',GALLERY.find(row => row.definition.id === 'paint-brush').definition,sunny]) {
    const { body } = avatarParts(wearer,{eyes:'Sleepy lids'});
    const rest = dotFeatures(body), [leftEye,leftBrow,rightEye,rightBrow] = rest.filter(s => s.finish).slice(-4);
    const find = (parts,part) => parts.find(s => s.mesh === part.mesh).axes;
    for (const [left,right] of [[.5,1],[1,.05],[0,0]]) {
      const parts = dotFeatures(body,{x:0,y:0,left,right});
      assert.deepEqual(find(parts,leftBrow),leftBrow.axes);
      assert.deepEqual(find(parts,rightBrow),rightBrow.axes);
      assert.equal(find(parts,leftEye)[4] < leftEye.axes[4],left<1);
      assert.equal(find(parts,rightEye)[4] < rightEye.axes[4],right<1);
    }
    const rotation = [1,0,0,0,1,0,0,0,1];
    const eye = lid => dotFace(body,body.dotStyle,{...front,lid},rotation,160).find(p=>p.id==='left').polys[0];
    const open = eye(1), closed = eye(0);
    assert.equal(closed.length,open.length);
    assert.notDeepEqual(closed,open);
    const top = p => Math.min(...p.filter((_,i)=>i%2));
    assert.equal(top(closed),top(open));
  }
});

test('small closed eyes retain ink thickness at their own centre while the other eye stays open', () => {
  for (const wearer of ['blob','dot-rounded-triangle',GALLERY.find(row => row.definition.id === 'paint-brush').definition]) {
    const { body } = avatarParts(wearer,{eyes:'Dots'});
    const motion = {x:0,y:0,left:0,right:1};
    const [left,right] = dotFeatures(body,motion);
    const height = part => part.axes[4] * (part.mesh.box[4]-part.mesh.box[1]);
    const centre = part => part.axes[10] + part.axes[4]*(part.mesh.box[4]+part.mesh.box[1])/2;
    for (const size of [40,80,144,512]) {
      const minStroke = 2*1.2/size;
      const [shut,open] = dotFeatures(body,{...motion,minStroke});
      assert.deepEqual(open.axes,right.axes);
      assert.ok(Math.abs(centre(left)-centre(shut))<1e-9);
      assert.ok(height(shut)>=Math.min(minStroke,.48*Math.abs(shut.axes[0])*(shut.mesh.box[4]-shut.mesh.box[1]))-1e-9);
      assert.ok(height(shut)<height(open));
    }
  }
});

test('iggy opens the swept eye independently on each side of the measured crease', async () => {
  const { DOT_CHARACTERS, DOT_CLIPS } = await import('./index.ts');
  const body = dotAvatar(DOT_CHARACTERS.Iggy).body;
  const crease = dotFeatures(body);
  const height = ({mesh}) => mesh.box[4]-mesh.box[1];
  for (const dir of [-1,1]) {
    const channels = { yaw:0, pitch:0, roll:0 };
    DOT_CLIPS['dot-wink'].apply(channels,{u:.35,cue:{amount:1,dir}});
    const pose = dotFeatures(body,{x:0,y:0,left:1,right:1,playback:channels.dotPlayback});
    const closed = dir===1 ? 0 : 1;
    assert.ok(height(pose[1-closed])>2*height(crease[1-closed]));
    assert.ok(height(pose[closed])<1.2*height(crease[closed]));
    assert.equal(pose[closed].axes[4],1);
    assert.deepEqual(pose.slice(2),crease.slice(2));
  }
});

test('the opaque frames clear the sides of the tapered paint brush and rocket', async () => {
  const { wardrobeSolids } = await import('./coat/wardrobe-solids.ts');
  const { frontDepth } = await import('./coat/face-surface.ts');
  for (const id of ['paint-brush','rocket']) {
    const shape = GALLERY.find(item => item.definition.id === id).definition;
    for (const glasses of ['Round sunglasses','Classic sunglasses','Separate trapezoid lenses']) {
      const {body} = avatarParts(shape,{glasses});
      const shell = coatMesh(body);
      let outside=0, total=0;
      for (const part of wardrobeSolids(body,shell).filter(s => s.eyewear)) {
        const v=part.mesh.vertices, a=part.axes;
        for (let i=0; i<v.length; i+=24) {
          const x=a[0]*v[i]+a[3]*v[i+1]+a[6]*v[i+2]+a[9];
          const y=a[1]*v[i]+a[4]*v[i+1]+a[7]*v[i+2]+a[10];
          if (frontDepth(shell,x,y)===undefined) outside++;
          total++;
        }
      }
      assert.ok(total>0 && outside/total<.005,id+' '+glasses);
    }
  }
});

test('percy keeps his ponytail and brows when he blinks or changes frames', () => {
  const original = bodyOf('percy');
  assert.equal(original.id,'percy');
  const render = (body,lid) => drawAvatar(body,'#DBD8EB',{...front,lid},180);
  const open = render(original,1);
  const shut = render(original,0);
  for (const id of ['hair','hair tie','left rim','right rim','raised brow','frown']) {
    const path = open.layers.find(layer=>layer.id===id)?.d;
    assert.ok(path,id);
    assert.equal(shut.layers.find(layer=>layer.id===id)?.d,path);
  }
  assert.notDeepEqual(open.eyes,shut.eyes);
  const dressed = render(avatarParts('percy',{glasses:'Monocle'}).body,1);
  assert.ok(dressed.layers.some(layer=>layer.id==='hair'));
  assert.ok(!dressed.layers.some(layer=>layer.id==='left rim'));
});

test('percy keeps both eyes inside the rims as his head turns, clear of the hairline', async () => {
  const { inside, bounds } = await import('./engine/math.ts');
  const { layerShapes, eyeShapes } = await import('./engine/draw.ts');
  const body = bodyOf('percy');
  const state = yaw => ({...front,pose:{yaw,pitch:0,roll:0}});
  for (const yaw of [-.68,0,.68]) {
    const layers = layerShapes(body,state(yaw),220);
    const eyes = eyeShapes(body,state(yaw),220);
    const hair = layers.find(layer=>layer.id==='crown hair').polys;
    for (const [i,id] of ['left rim','right rim'].entries()) {
      const [x0,y0,x1,y1] = bounds(eyes[i]);
      const x=(x0+x1)/2, y=(y0+y1)/2;
      assert.ok(layers.find(layer=>layer.id===id).polys.some(poly=>inside(poly,x,y)),id+' at '+yaw);
      assert.ok(!hair.some(poly=>inside(poly,x,y)),'fringe at '+yaw);
    }
  }
  assert.deepEqual(eyeShapes(body,state(Math.PI),220),[[],[]]);
  const rear = layerShapes(body,state(Math.PI),220);
  assert.ok(rear.find(l=>l.id==='crown hair').polys.some(poly=>inside(poly,.11,-.26)));
  assert.ok(rear.find(l=>l.id==='hair tie').front);
  assert.ok(!layerShapes(body,state(0),220).find(l=>l.id==='hair tie').front);
});

test('percy grows real fur on both masses of hair and retains it when changing glasses', () => {
  const body = bodyOf('percy');
  const meshes = wearer => wearer.surfaceDetails.solids(wearer);
  const parts = meshes(body);
  const fur = parts.filter(p=>p.finish==='hair' && p.mesh.roots.length);
  assert.equal(fur.length,3);
  assert.ok(fur.filter(p=>p.mesh.roots.length/8>500).length>=2);
  assert.ok(fur.some(p=>p.mesh.box[1]<-1.2));
  assert.ok(parts.some(p=>p.paintKey==='hair tie'));
  const glasses = meshes(avatarParts('percy',{glasses:'Monocle'}).body);
  assert.ok(glasses.every(p=>p.paintKey!=='ink'));
  assert.deepEqual(glasses.filter(p=>p.mesh.roots.length),fur);
  assert.equal(parts.filter(p=>p.paintKey==='ink').length,2);
});

test('percy gathers his rear fibres towards the elastic and seats it across the ponytail', () => {
  const body=bodyOf('percy'), parts=body.surfaceDetails.solids(body);
  const [scalp,tail]=parts.filter(p=>p.mesh.roots.length/8>500).map(p=>p.mesh);
  const elastic=parts.find(p=>p.paintKey==='hair tie').mesh;
  const centre=[0,1,2].map(i=>(elastic.box[i]+elastic.box[i+3])/2);
  let tucked=0, rear=0;
  for (let i=0; i<scalp.roots.length; i+=8) {
    const [x,y,z]=scalp.roots.subarray(i,i+3);
    if (z>-.20 || Math.hypot(centre[0]-x,centre[1]-y,centre[2]-z)<.22) continue;
    const dir=scalp.tangents.subarray(3*i/8,3*i/8+3);
    if (dir[0]*(centre[0]-x)+dir[1]*(centre[1]-y)+dir[2]*(centre[2]-z)>0) tucked++;
    rear++;
  }
  assert.ok(rear>300 && tucked/rear>.97);
  // The shell turns outward at the nape, so a horizontal band would cross a
  // spreading lock. The elastic encloses the neck of the swept tube all around.
  for (let i=0;i<elastic.vertices.length;i+=6*13) {
    const [x,y,z]=elastic.vertices.subarray(i,i+3);
    let nearest=Infinity;
    for (let k=0;k<tail.vertices.length;k+=6) {
      nearest=Math.min(nearest,Math.hypot(tail.vertices[k]-x,tail.vertices[k+1]-y,tail.vertices[k+2]-z));
    }
    assert.ok(nearest>.004 && nearest<.03,'elastic clearance '+nearest);
  }
});
