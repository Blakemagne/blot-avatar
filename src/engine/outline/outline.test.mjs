// Avatars from definitions: an outline and its eyes made into a body. Run with: npm test
//
// Every avatar in GALLERY is checked: it is a valid definition, its body is the outline seen from the front, its
// eyes rest where the definition puts them on one smooth surface, and held in any look, with any face, it shows
// both of them. Bad definitions are refused with reasons.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ACTIVITY_FACES } = await import('../faces.ts');
const E = await import('../../index.ts');
const { BOX_SCALE, FACES, GALLERY, Rig, deg, eyeShapes, flattenPath, outlineBody, parsePath, surfaceAt, validateAvatar, bounds } = E;
const { isInside } = await import('./path.ts');

const each = (run) => { for (const g of GALLERY) run(g.definition.id, outlineBody(g.definition), g.definition); };
const still = (yaw = 0, pitch = 0) => ({ pose: { yaw: deg(yaw), pitch: deg(pitch), roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral });
const size = (polys) => { const [x0, y0, x1, y1] = bounds(polys); return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };

/** Is (x, y) (box units) inside the front view of a piece: the hull of its spheres' discs? */
function inPiece(piece, x, y) {
  for (let a = 0; a < 64; a++) {
    const ux = Math.cos((a * Math.PI) / 32), uy = Math.sin((a * Math.PI) / 32);
    let reach = -Infinity;
    for (const [sx, sy, , r] of piece) reach = Math.max(reach, (50 + sx * BOX_SCALE) * ux + (50 - sy * BOX_SCALE) * uy + r * BOX_SCALE);
    if (x * ux + y * uy > reach + 1e-9) return false;
  }
  return true;
}

test('every gallery avatar is a valid definition with a colour of blot\'s, and no id is used twice', () => {
  const ids = new Set();
  for (const g of GALLERY) {
    const r = validateAvatar(g.definition);
    assert.ok(r.ok, `${g.definition.id}: ${r.ok ? '' : r.errors.join('; ')}`);
    assert.deepEqual(r.value, g.definition, `${g.definition.id} is already in its normal form`);
    assert.ok(E.BOT_COLOURS.some(([, name]) => name === g.colour), `${g.definition.id}: ${g.colour}`);
    assert.ok(!ids.has(g.definition.id), g.definition.id);
    ids.add(g.definition.id);
  }
  assert.equal(GALLERY.length, 23);
});

test('a bad definition is refused, each fault with a sentence that says what to change', () => {
  const good = GALLERY[0].definition;
  const bad = (change, want) => {
    const r = validateAvatar({ ...structuredClone(good), ...change });
    assert.equal(r.ok, false, JSON.stringify(change));
    assert.ok(r.errors.some((e) => e.includes(want)), `${JSON.stringify(change)}: ${r.errors.join('; ')}`);
  };
  bad({ colour: 'red' }, 'unknown field "colour"');
  bad({ version: 2 }, 'version must be 1');
  bad({ id: 'Not A Slug' }, 'lowercase slug');
  bad({ body: { path: 'M10 10 L<script>' } }, 'unsupported character');
  bad({ body: { path: 'M0 0H100V100H0Z' } }, 'safe area');
  bad({ body: { path: 'M30 30H40V40H30Z' } }, 'too small');
  bad({ eyes: { x: 50, y: 10, spacing: 16, scale: 1 } }, 'eyes must sit inside the body');
  bad({ eyes: { x: 50, y: 50, spacing: 16, scale: 3 } }, 'out of range');
  assert.equal(validateAvatar('{}').ok, false);
  assert.equal(validateAvatar(null).ok, false);
});

test('from the front each body is its outline: it covers at least 96.5% of it and spills past it by under 1.5%', () => {
  each((id, body, def) => {
    const polys = flattenPath(parsePath(def.body.path)), pieces = body.outline.pieces;
    let both = 0, outline = 0, spill = 0;
    for (let y = 0.25; y < 100; y += 0.5) {
      for (let x = 0.25; x < 100; x += 0.5) {
        const o = isInside(polys, x, y), b = pieces.some((p) => inPiece(p, x, y));
        if (o && b) both++; else if (o) outline++; else if (b) spill++;
      }
    }
    const all = both + outline;
    assert.ok(both / all >= 0.965, `${id}: covers ${(both / all).toFixed(4)}`);
    assert.ok(spill / all < 0.015, `${id}: spills ${(spill / all).toFixed(4)}`);
  });
});

test('a hole in the outline stays open: the mug\'s handle, the palette\'s thumb hole', () => {
  for (const [id, x, y] of [['mug', 74, 53], ['palette', 26, 44]]) {
    const def = GALLERY.find((g) => g.definition.id === id).definition, polys = flattenPath(parsePath(def.body.path));
    assert.ok(!isInside(polys, x, y), `${id}: (${x}, ${y}) is in the hole`);
    assert.ok(!outlineBody(def).outline.pieces.some((p) => inPiece(p, x, y)), `${id}: the hole is filled in`);
  }
});

test('a body is a few pieces of a few spheres, every one in the middle plane, and the eyes ride the first', () => {
  each((id, body) => {
    const pieces = body.outline.pieces;
    assert.ok(pieces.length >= 1 && pieces.length <= 16, `${id}: ${pieces.length} pieces`);
    for (const p of pieces) assert.ok(p.length >= 1 && p.length <= 28, `${id}: a piece of ${p.length} spheres`);
    for (const p of pieces) for (const s of p) assert.ok(s[2] === 0 && s[3] > 0, `${id}: a sphere off the middle plane`);
    assert.deepEqual(body.pieces, [pieces[0]], `${id}: the eyes ride the face's piece`);
    assert.ok(body.look >= 0.3 && body.look <= 0.8, `${id}: look ${body.look}`);
  });
});

test('the same definition gives the same body, and a copy of it is the same body too', () => {
  const def = GALLERY.find((g) => g.definition.id === 'cat').definition;
  assert.equal(outlineBody(def), outlineBody(structuredClone(def)));
  assert.equal(E.bodyOf(def), outlineBody(def));
});

test('at pose zero the eyes are whole and level, where the definition puts them', () => {
  each((id, body, def) => {
    const [left, right] = eyeShapes(body, still(), 180);
    assert.ok(left.length === 1 && right.length === 1, `${id}: both eyes whole`);
    const l = size(left), r = size(right);
    assert.ok(Math.abs(l.cy - r.cy) < 1e-6, `${id}: level`);
    // Screen units are body units here, y down; the definition is box units, y down.
    const mid = (l.cx + r.cx) / 2;
    assert.ok(Math.abs(mid * BOX_SCALE + 50 - def.eyes.x) < 0.6, `${id}: the eyes' middle is at x ${mid * BOX_SCALE + 50}, not ${def.eyes.x}`);
    assert.ok(Math.abs(l.cy * BOX_SCALE + 50 - def.eyes.y) < 0.6, `${id}: the eyes are at y ${l.cy * BOX_SCALE + 50}, not ${def.eyes.y}`);
    assert.ok(Math.abs((r.cx - l.cx) * BOX_SCALE - def.eyes.spacing) < 0.6, `${id}: spacing`);
    assert.ok(r.cx - r.w / 2 > l.cx + l.w / 2, `${id}: the eyes touch`);
  });
});

test('the eyes rest on one smooth surface wherever a look slides them: no seam runs under them', () => {
  const a = { z: 0, nx: 0, ny: 0, nz: 0 }, b = { z: 0, nx: 0, ny: 0, nz: 0 }, STEP = 0.02;
  each((id, body) => {
    const e = body.eyes;
    let sharpest = 0;
    for (const [sx, sy] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [0, -1]]) {
      for (const side of [-1, 1]) {
        const cu = (e.cx ?? 0) + side * e.x + sx * e.slideX, cv = e.y + sy * e.slideY;
        for (let u = cu - e.w / 2; u <= cu + e.w / 2 + 1e-9; u += STEP) {
          for (let v = cv - e.h / 2; v <= cv + e.h / 2 + 1e-9; v += STEP) {
            const r = e.w / 2, dv = Math.max(0, Math.abs(v - cv) - (e.h / 2 - r));
            if ((u - cu) ** 2 + dv ** 2 > r * r) continue;
            assert.ok(surfaceAt(body, u, v, a), `${id}: looking ${sx}, ${sy}, the eye is off the body at ${u}, ${v}`);
            for (const [du, dv2] of [[STEP, 0], [0, STEP]]) {
              if (!surfaceAt(body, u + du, v + dv2, b)) continue;
              sharpest = Math.max(sharpest, (Math.acos(Math.min(1, a.nx * b.nx + a.ny * b.ny + a.nz * b.nz)) * 180) / Math.PI);
            }
          }
        }
      }
    }
    assert.ok(sharpest < 12, `${id}: the surface under an eye bends ${sharpest} degrees in one step: a seam`);
  });
});

test('held in any look, with the face of anything a Bot does, every gallery body shows two eyes at 64 and 72 px', () => {
  const faces = { neutral: FACES.neutral, ...ACTIVITY_FACES };
  const looks = [];
  for (let a = 0; a < 360; a += 30) looks.push([Math.cos(deg(a)), Math.sin(deg(a))]);
  each((id, body) => {
    for (const [x, y] of looks) {
      const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
      rig.look(x, y);
      for (let t = 0; t < 2500; t += 16) rig.step(16);
      for (const [name, face] of Object.entries(faces)) for (const px of [64, 72]) {
        const [left, right] = eyeShapes(body, { ...rig.state, face }, px);
        assert.ok(left.length && right.length, `${id} looking ${x.toFixed(2)}, ${y.toFixed(2)} with the ${name} face at ${px} px: an eye is gone`);
      }
    }
  });
});

test('from the front the eyes can be read at 16 px', () => {
  each((id, body) => {
    const [left, right] = eyeShapes(body, still(), 16);
    assert.ok(left.length === 1 && right.length === 1, `${id}: both eyes are whole at 16 px`);
    for (const e of [size(left), size(right)]) assert.ok(e.w * 8 >= 1.9 && e.h * 8 >= 3.5, `${id}: an eye is ${e.w * 8} by ${e.h * 8} px`);
  });
});

test('a gallery avatar draws through mount and still: a definition is a shape', async () => {
  const def = GALLERY.find((g) => g.definition.id === 'ghost').definition;
  const st = E.stillState(def, 96);
  const d = E.drawAvatar(E.bodyOf(def), '#1E86FC', st, 96);
  assert.ok(d.body.length > 100 && d.eyes[0] && d.eyes[1]);
  assert.equal(E.galleryColour(E.galleryAvatar('ghost')), '#000000');
  assert.equal(E.galleryAvatar('nope'), undefined);
});
