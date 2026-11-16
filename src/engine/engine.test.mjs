// The Bot's avatar engine: a 3D body with eyes on its surface. Run with: npm test
//
// These hold the engine to what a person should see: the wedge is a pyramid that turns (its outline changes,
// not only its width), the near eye gets bigger and the far eye thins out and goes round the edge, no eye is
// ever drawn off the body, and from the front each body is the flat shape it replaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BODIES: EVERY, D, EYE_RIM, FACES, THIN_PX, area, barWidth, bounds, colours, deg, drawAvatar, eyeOutline, eyeShapes, inside, random, rotation, silhouette, surfaceAt } = await import('./index.ts');
// This file is about the engine and the three bodies it was built on. Every body, these three included, is held
// to what a person should see in bodies/bodies.test.mjs.
const BODIES = { wedge: EVERY.wedge, tablet: EVERY.tablet, heart: EVERY.heart };
const { blocked, prepare, surfaceTop } = await import('./body.ts');
const { blunt } = await import('./eyes.ts');
const { flat } = await import('./bodies/flat.mjs');

const still = (yaw = 0, pitch = 0, roll = 0, ex = 0, ey = 0) => ({ pose: { yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) }, eye: { x: ex, y: ey }, lid: 1, face: FACES.neutral });
const outline = (body, yaw = 0, pitch = 0, roll = 0) => silhouette(body, rotation({ yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) }), 72);
const size = (polys) => { const [x0, y0, x1, y1] = bounds(polys); return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };
const eyeArea = (polys) => polys.reduce((sum, p) => sum + Math.abs(area(p)), 0);
/** [left, right] eye areas for a pose, drawn large. */
const eyes = (body, ...pose) => eyeShapes(body, still(...pose), 180).map(eyeArea);

/** Distance from (x, y) to the edge of a flat polygon. */
function toEdge(poly, x, y) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const ax = poly[j], ay = poly[j + 1], bx = poly[i] - ax, by = poly[i + 1] - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * bx, y - ay - t * by));
  }
  return best;
}

const { wedge, tablet: capsule, heart } = BODIES;

test('there is a body for the wedge, the capsule (shape id "tablet") and the heart', () => {
  assert.deepEqual(Object.keys(BODIES).sort(), ['heart', 'tablet', 'wedge']);
  for (const [id, body] of Object.entries(BODIES)) assert.equal(body.id, id);
});

test('from the front, at pose zero, each body fills the box of the flat shape it replaces', () => {
  for (const [id, body] of Object.entries(BODIES)) {
    const old = flat(id), now = size(outline(body));
    // The flat drawings lean about 15 degrees; stood upright (eyes level), their box is the body's box.
    assert.ok(Math.abs(old.lean - deg(15.4)) < deg(1), `${id}: the flat drawing leans ${old.lean}`);
    assert.ok(Math.abs(now.w / old.upright.w - 1) < 0.03, `${id}: width ${now.w} against the flat shape's ${old.upright.w}`);
    assert.ok(Math.abs(now.h / old.upright.h - 1) < 0.03, `${id}: height ${now.h} against the flat shape's ${old.upright.h}`);
    // Centred on its own axis, so it turns in place.
    assert.ok(Math.abs(now.cx) < 0.01 && Math.abs(now.cy) < 0.02, `${id}: centred (${now.cx}, ${now.cy})`);
    // And leaned over the way the flat drawing leans, it fills the flat drawing's own box.
    const leaned = size(outline(body, 0, 0, (old.lean * 180) / Math.PI));
    assert.ok(Math.abs(leaned.w / old.leaning.w - 1) < 0.06, `${id}: leaning width ${leaned.w} against ${old.leaning.w}`);
    assert.ok(Math.abs(leaned.h / old.leaning.h - 1) < 0.06, `${id}: leaning height ${leaned.h} against ${old.leaning.h}`);
  }
});

test('at pose zero the eyes are centred, level and upright, exactly as the body says', () => {
  for (const [id, body] of Object.entries(BODIES)) {
    const [left, right] = eyeShapes(body, still(), 180);
    assert.equal(left.length, 1, `${id}: the left eye is whole`);
    assert.equal(right.length, 1, `${id}: the right eye is whole`);
    const l = size(left), r = size(right);
    assert.ok(Math.abs(l.cx + r.cx) < 1e-6, `${id}: centred`);
    assert.ok(Math.abs(l.cy - r.cy) < 1e-6, `${id}: level`);
    // Screen y points down; the body's eye line is in y-up face coordinates.
    assert.ok(Math.abs(l.cy + body.eyes.y) < 0.004 && Math.abs(r.cx - body.eyes.x) < 0.004, `${id}: where the body says`);
    for (const e of [l, r]) {
      assert.ok(Math.abs(e.w - body.eyes.w) < 0.004, `${id}: eye width ${e.w}`);
      assert.ok(Math.abs(e.h - body.eyes.h) < 0.004, `${id}: eye height ${e.h}`);
    }
    // Upright and unsheared: a mirror image of itself left to right and top to bottom.
    for (const [poly, c] of [[left[0], l], [right[0], r]]) {
      for (let i = 0; i < poly.length; i += 2) {
        assert.ok(toEdge(poly, 2 * c.cx - poly[i], poly[i + 1]) < 0.003 && toEdge(poly, poly[i], 2 * c.cy - poly[i + 1]) < 0.003, `${id}: an eye is not upright`);
      }
    }
  }
});

test("the wedge's base is a straight edge between two round corners, from the front and while it nods", () => {
  // The middle of the front bulges out into a soft ridge. If that bulge reached the base it would hang below
  // the front corners as a chin (drawn bigger, being nearer), and further below as the body looks down.
  for (let pitch = -30; pitch <= 30; pitch += 5) {
    const poly = outline(wedge, 0, pitch)[0];
    // The lowest point of each bottom corner (screen y points down), and the line through them.
    let left = null, right = null;
    for (let i = 0; i < poly.length; i += 2) {
      const pt = [poly[i], poly[i + 1]];
      if (pt[0] < -0.3 && (!left || pt[1] > left[1])) left = pt;
      if (pt[0] > 0.3 && (!right || pt[1] > right[1])) right = pt;
    }
    assert.ok(Math.abs(left[1] - right[1]) < 1e-9 && Math.abs(left[0] + right[0]) < 0.05, `pitch ${pitch}: the corners are level`);
    assert.ok(right[0] - left[0] > 0.9, `pitch ${pitch}: the base is ${right[0] - left[0]} long`);
    let below = 0;
    for (let i = 0; i < poly.length; i += 2) if (Math.abs(poly[i]) < right[0]) below = Math.max(below, poly[i + 1] - left[1]);
    assert.ok(below < 0.002, `pitch ${pitch}: the base sags ${below} below its corners`);
  }
});

test("the wedge's outline changes shape as it turns, not only its width", () => {
  const front = outline(wedge)[0];
  const f = size([front]);
  for (const yaw of [20, 35, 50]) {
    const turned = outline(wedge, yaw)[0], t = size([turned]);
    // Lay the turned outline over the front one, stretched to the same width: a flat triangle that only got
    // narrower would land on it exactly. A pyramid whose base corner swings round does not.
    let off = 0;
    for (let i = 0; i < turned.length; i += 2) {
      off = Math.max(off, toEdge(front, f.cx + ((turned[i] - t.cx) * f.w) / t.w, turned[i + 1]));
    }
    assert.ok(off > 0.04, `yaw ${yaw}: the outline differs from the front view by ${off}`);
    // A flat cut-out can only get narrower as it turns. A pyramid gets WIDER: its base corner comes round.
    assert.ok(t.w > f.w * 1.04, `yaw ${yaw}: ${t.w} wide, ${f.w} from the front`);
    // It is not left-right symmetric any more either: the near base corner is drawn bigger and lower.
    let skew = 0;
    for (let i = 0; i < turned.length; i += 2) skew = Math.max(skew, toEdge(turned, 2 * t.cx - turned[i], turned[i + 1]));
    assert.ok(skew > 0.02, `yaw ${yaw}: lopsided by ${skew}`);
  }
  // Turning the other way is the mirror image.
  const a = size(outline(wedge, 35)), b = size(outline(wedge, -35));
  assert.ok(Math.abs(a.w - b.w) < 1e-9 && Math.abs(a.cx + b.cx) < 1e-9);
});

/** How far an eye leans, in degrees: the slope of the line midway between its top and bottom edges. Positive drops to the right. */
function lean(poly) {
  const [x0, , x1] = bounds([poly]), mids = [];
  for (let c = 1; c < 10; c++) {
    const x = x0 + ((x1 - x0) * c) / 10, ys = [];
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      if ((poly[j] - x) * (poly[i] - x) < 0) ys.push(poly[j + 1] + ((x - poly[j]) / (poly[i] - poly[j])) * (poly[i + 1] - poly[j + 1]));
    }
    mids.push([x, (Math.min(...ys) + Math.max(...ys)) / 2]);
  }
  const mx = mids.reduce((s, m) => s + m[0], 0) / mids.length, my = mids.reduce((s, m) => s + m[1], 0) / mids.length;
  const slope = mids.reduce((s, m) => s + (m[0] - mx) * (m[1] - my), 0) / mids.reduce((s, m) => s + (m[0] - mx) ** 2, 0);
  return (Math.atan(slope) * 180) / Math.PI;
}

test("looking up, the wedge's eyes stay level pills: they squash, they do not turn sad", () => {
  // The two flanks the eyes sit on turn away from each other, so when the body looks up each eye tips, inner
  // end up. Tipped far, on a face that is squashing as it leans back, a pill becomes a slanted lozenge and the
  // face reads as worried. The flanks' slope sets how far, and here it is kept low.
  for (let pitch = 2; pitch <= 30; pitch += 2) {
    const [left, right] = eyeShapes(wedge, still(0, pitch), 180);
    assert.ok(left.length === 1 && right.length === 1, `pitch ${pitch}: both eyes whole`);
    const l = lean(left[0]), r = lean(right[0]);
    assert.ok(Math.abs(l + r) < 1e-6, `pitch ${pitch}: mirror images (${l}, ${r})`);
    // A look takes the body up 14 degrees; a nod on top of that takes it to 30.
    assert.ok(r >= 0 && r < (pitch <= 20 ? 8 : 11), `pitch ${pitch}: the eyes lean ${r} degrees`);
    // Squashed, not sheared away: still as wide as from the front.
    assert.ok(Math.abs(size(right).w - wedge.eyes.w) < 0.004, `pitch ${pitch}: eye width ${size(right).w}`);
  }
  // The whole of each eye is on one flat flank, so all of it squashes alike. (Its lower end used to hang over
  // the flank's edge onto the ridge, which leans back less: the bottom of the eye stayed tall while the top
  // went flat.) An eye point is drawn at (u, v), so it is on the surface a little nearer the middle.
  const e = wedge.eyes, at = { z: 0, nx: 0, ny: 0, nz: 0 }, mid = { z: 0, nx: 0, ny: 0, nz: 0 };
  const lift = (u, v, out) => { for (let i = 0, k = 1; i < 4; i++) { assert.ok(surfaceAt(wedge, u * k, v * k, out)); k = 1 - out.z / D; } };
  lift(e.x, e.y, mid);
  const pill = eyeOutline(FACES.neutral, 1, e.w, e.h, 1, 40);
  for (let i = 0; i < 80; i += 2) {
    lift(e.x + pill[i], e.y + pill[i + 1], at);
    assert.ok(Math.hypot(at.nx - mid.nx, at.ny - mid.ny, at.nz - mid.nz) < 0.01, `the eye's edge at ${pill[i]}, ${pill[i + 1]} is off the flank`);
  }
  // How far the flank falls back for every unit outward. More, and the far eye goes round the edge sooner as
  // the body turns, but the eyes tip further as it looks up; less, and the other way about.
  assert.ok(Math.abs(mid.nx / mid.nz - 0.3) < 0.02, `the flank's slope is ${mid.nx / mid.nz}`);
  // The capsule's and the heart's eyes sit on surfaces that barely turn outward: they stay level too.
  for (const body of [capsule, heart]) {
    for (const pitch of [10, 20, 30]) assert.ok(Math.abs(lean(eyeShapes(body, still(0, pitch), 180)[1][0])) < 8, `${body.id} at pitch ${pitch}`);
  }
});

test('turned about 35 degrees, the near eye is drawn bigger than the far eye', () => {
  // Positive yaw turns the face to the viewer's right: the left eye is the near one.
  const [near, far] = eyes(wedge, 35);
  const [front] = eyes(wedge, 0);
  assert.ok(near > far * 1.5, `near ${near}, far ${far}`);
  // Its flank turns to face the viewer first: through the first 30 degrees the near eye is bigger than it
  // was from the front, most of all at about 15.
  for (const yaw of [10, 20, 30]) assert.ok(eyes(wedge, yaw)[0] > front * 1.01, `at ${yaw} the near eye is ${eyes(wedge, yaw)[0]}, from the front ${front}`);
  assert.ok(eyes(wedge, 15)[0] > front * 1.05);
  const [farLeft, nearRight] = eyes(wedge, -35);
  assert.ok(Math.abs(farLeft / far - 1) < 0.01 && Math.abs(nearRight / near - 1) < 0.01, 'and the other way round, mirrored');
  // The heart and the capsule too, less strongly: each turns like itself.
  for (const body of [heart, capsule]) {
    const [n, f] = eyes(body, 35);
    assert.ok(n > f, `${body.id}: near ${n}, far ${f}`);
  }
});

test("the far eye thins steadily as the body turns, and is gone once it is round the edge", () => {
  for (const body of [wedge, heart, capsule]) {
    const first = eyes(body, 0)[1];
    let last = first, gone = null;
    // Up to side on: past that the face is drawn on the side that has come round.
    for (let yaw = 2.5; yaw < 90; yaw += 2.5) {
      const now = eyes(body, yaw)[1];
      if (gone !== null) { assert.equal(now, 0, `${body.id}: the far eye came back at ${yaw}`); continue; }
      assert.ok(now < last, `${body.id}: at ${yaw} the far eye is ${now}, was ${last}`);
      // It slides round: no step takes more than a slice of it. It never pops off.
      assert.ok(last - now < first * 0.2, `${body.id}: at ${yaw} the far eye jumped from ${last} to ${now}`);
      if (now === 0) gone = yaw;
      last = now;
    }
    assert.ok(gone !== null, `${body.id}: the far eye is gone before the body is side on`);
  }
  // On the wedge it is down to a third by 45 degrees, a slit by 55 and gone by 60, while the near eye is
  // still wide open.
  const front = eyes(wedge, 0)[1];
  assert.ok(eyes(wedge, 45)[1] < front * 0.36);
  assert.ok(eyes(wedge, 55)[1] < front * 0.2);
  assert.equal(eyes(wedge, 60)[1], 0);
  assert.ok(eyes(wedge, 60)[0] > front * 0.6);
});

test('every point of every eye is drawn inside the outline of the body', () => {
  let points = 0;
  for (const body of Object.values(BODIES)) {
    for (let yaw = -100; yaw <= 100; yaw += 12.5) {
      for (const pitch of [-25, -10, 0, 10, 25]) {
        for (const [ex, ey, roll] of [[0, 0, 0], [1, 0.6, 8], [-1, -1, -5]]) {
          for (const px of [180, 24]) {
            const state = still(yaw, pitch, roll, ex, ey);
            const rim = px >= 96 ? 72 : 28;
            const body2d = silhouette(body, rotation(state.pose), rim);
            for (const eye of eyeShapes(body, state, px)) {
              for (const poly of eye) {
                for (let i = 0; i < poly.length; i += 2) {
                  points++;
                  const x = poly[i], y = poly[i + 1];
                  // And not on its edge either: a rim of body shows between any eye and the outline, so a dark
                  // eye on a pale body never bites a notch out of the silhouette.
                  const ok = body2d.some((p) => inside(p, x, y) && toEdge(p, x, y) > EYE_RIM - 1e-6);
                  assert.ok(ok, `${body.id} yaw ${yaw} pitch ${pitch} look ${ex},${ey} at ${px}px: an eye point at ${x}, ${y} is off the body, or on its rim`);
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(points > 50_000, `${points} points checked`);
});

test('an eye is a slit and then nothing: it is never drawn as a hairline', () => {
  // A slit thinner than a pixel and a half, hugging the outline, reads as a scratch on the body.
  let pieces = 0, thinnest = Infinity, gone = 0;
  for (const body of Object.values(BODIES)) {
    for (let yaw = -90; yaw <= 90; yaw += 1.5) {
      for (const pitch of [-25, -12, 0, 12, 20, 25]) {
        for (const eye of eyeShapes(body, still(yaw, pitch), 180)) {
          if (!eye.length) gone++;
          for (const poly of eye) {
            pieces++;
            // 1 body unit is half the drawn size: 90 px.
            const px = barWidth(poly) * 90;
            thinnest = Math.min(thinnest, px);
            assert.ok(px >= THIN_PX, `${body.id} yaw ${yaw} pitch ${pitch}: a piece of an eye ${px} px wide`);
          }
        }
        // On a tiny avatar an eye is only three or four px wide: there it goes at about one px.
        for (const eye of eyeShapes(body, still(yaw, pitch), 24)) {
          for (const poly of eye) assert.ok(barWidth(poly) * 12 >= 1, `${body.id} yaw ${yaw} pitch ${pitch} at 24 px: ${barWidth(poly) * 12} px wide`);
        }
      }
    }
  }
  assert.ok(pieces > 3000 && gone > 300, `${pieces} pieces drawn, ${gone} eyes gone`);
  // It does get down to a slit before it goes: not dropped while it is still wide.
  assert.ok(thinnest < THIN_PX * 1.3, `the thinnest eye drawn was ${thinnest} px`);
  // The poses the art director caught: the wedge's far eye turned and looking up (a slit a few px wide at
  // -40/20, gone by -50/25), the capsule's and the heart's at 75.
  const [slit] = eyeShapes(wedge, still(-40, 20), 180)[0];
  assert.ok(barWidth(slit) * 90 > 3, `the wedge's far eye at -40/20 is ${barWidth(slit) * 90} px wide`);
  assert.deepEqual(eyeShapes(wedge, still(-50, 25), 180)[0], []);
  assert.deepEqual(eyeShapes(capsule, still(75), 180)[1], []);
  assert.deepEqual(eyeShapes(heart, still(75), 180)[1], []);
});

test('the width of a bar is measured from its area and perimeter, however it bends', () => {
  const bar = (w, l, bend = 0) => {
    // A round-ended bar w wide and l long overall, optionally bent into an arc of radius 1 / bend.
    const pts = [], r = w / 2, half = l / 2 - r;
    for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 40; pts.push([half + r * Math.cos(a), r * Math.sin(a)]); }
    for (let i = 0; i <= 40; i++) { const a = Math.PI / 2 + (Math.PI * i) / 40; pts.push([-half + r * Math.cos(a), r * Math.sin(a)]); }
    const dense = [];
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; for (let k = 0; k < 20; k++) dense.push([p[0] + ((q[0] - p[0]) * k) / 20, p[1] + ((q[1] - p[1]) * k) / 20]); });
    return dense.flatMap(([x, y]) => (bend ? [(1 / bend + y) * Math.sin(x * bend), (1 / bend + y) * Math.cos(x * bend)] : [x, y]));
  };
  assert.ok(Math.abs(barWidth(bar(0.24, 0.44)) - 0.24) < 0.001);
  assert.ok(Math.abs(barWidth(bar(0.02, 0.5)) - 0.02) < 0.0002);
  assert.ok(Math.abs(barWidth(bar(0.3, 0.3)) - 0.3) < 0.01, 'a disc is as wide as it is');
  // A hairline curving along the edge of a ball is still a hairline.
  assert.ok(Math.abs(barWidth(bar(0.012, 0.6, 1.4)) - 0.012) < 0.0005, `${barWidth(bar(0.012, 0.6, 1.4))}`);
});

test('a piece of an eye cut at a shallow angle loses its spike', () => {
  // A spike: from its tip at point 0, two sides that open by 0.1 for every 1 of length, then a square end.
  const spike = [0, 0];
  for (let i = 1; i <= 20; i++) spike.push(i * 0.02, i * 0.001);
  for (let i = 20; i >= 1; i--) spike.push(i * 0.02, -i * 0.001);
  const cut = blunt(spike, 20, 0.02);
  // What is left starts where the sides are 0.02 apart: the first 0.2 of its length is gone.
  const xs = []; for (let i = 0; i < cut.length; i += 2) xs.push(cut[i]);
  assert.ok(Math.abs(Math.min(...xs) - 0.2) < 0.021, `the spike now starts at ${Math.min(...xs)}`);
  assert.equal(Math.max(...xs), 0.4);
  // Narrower than that all the way, it is a slit and not a spike: left as it is (and not drawn once it is too thin).
  assert.deepEqual(blunt(spike, 20, 0.05), spike);
  // A square corner drawn with steps longer than that is left alone.
  const square = [0, 0, 0.1, 0, 0.2, 0, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2, 0, 0.2, 0, 0.1];
  assert.deepEqual(blunt(square, 4, 0.02), square);
  // On the heart, turned and looking down, the far eye is cut along the body's edge at a slant. Its lower end
  // used to run on as a spike to the outline.
  const [far] = eyeShapes(heart, still(50, -25), 180)[1];
  let low = 0;
  for (let i = 1; i < far.length; i += 2) low = Math.max(low, far[i]);
  let across = 0;
  for (let i = 0; i < far.length; i += 2) if (low - far[i + 1] < 0.02) for (let j = 0; j < far.length; j += 2) if (low - far[j + 1] < 0.02) across = Math.max(across, Math.abs(far[i] - far[j]));
  assert.ok(across * 90 > 2, `the far eye's lower end is ${across * 90} px across`);
});

test('the face is on whichever side is turned to the viewer: half a turn round looks like the front', () => {
  for (const body of Object.values(BODIES)) {
    const front = eyes(body, 0), behind = eyes(body, 180);
    assert.ok(Math.abs(front[0] - behind[0]) < 1e-6 && Math.abs(front[1] - behind[1]) < 1e-6, `${body.id}: ${front} against ${behind}`);
    const a = size(outline(body)), b = size(outline(body, 180));
    assert.ok(Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6);
  }
});

test('the surface of a hull of spheres is exact: it matches a brute-force search', () => {
  // The height of a convex body at (x, y) is the least of (h(n) - n.x x - n.y y) / n.z over every direction n
  // that points up, where h is the support function. Search a fine fan of directions and compare.
  const support = (piece, nx, ny, nz) => Math.max(...piece.map(([x, y, z, r]) => x * nx + y * ny + z * nz + r));
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  for (const body of [wedge, capsule]) {
    const piece = body.pieces[0], prep = prepare(body);
    for (const [x, y] of [[0, 0], [0.23, -0.08], [-0.3, 0.2], [0.5, -0.4], [0.1, 0.5], [-0.6, -0.5], [0.05, -0.55]]) {
      assert.ok(surfaceTop(prep, x, y, hit), `${body.id}: (${x}, ${y}) is on the body`);
      let brute = Infinity, bx = 0, by = 0;
      for (let pass = 0, span = 4, cx = 0, cy = 0; pass < 4; pass++, span /= 12, cx = bx, cy = by) {
        for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
          const a = cx + (i / 40) * span, b = cy + (j / 40) * span, l = Math.hypot(a, b, 1);
          const z = (support(piece, a / l, b / l, 1 / l) * l - a * x - b * y);
          if (z < brute) { brute = z; bx = a; by = b; }
        }
      }
      assert.ok(Math.abs(hit.z - brute) < 2e-3, `${body.id} at (${x}, ${y}): ${hit.z} against ${brute}`);
      const l = Math.hypot(bx, by, 1);
      assert.ok(Math.hypot(hit.nx - bx / l, hit.ny - by / l, hit.nz - 1 / l) < 0.05, `${body.id} at (${x}, ${y}): the normal`);
      assert.ok(Math.abs(Math.hypot(hit.nx, hit.ny, hit.nz) - 1) < 1e-9);
      // The cached height field reads back the same surface.
      const read = { z: 0, nx: 0, ny: 0, nz: 0 };
      assert.ok(surfaceAt(body, x, y, read));
      assert.ok(Math.abs(read.z - hit.z) < 1e-3, `${body.id} at (${x}, ${y}): the field reads ${read.z}`);
    }
    assert.equal(surfaceTop(prep, 1.3, 0, hit), false);
    assert.equal(surfaceAt(body, 0, 1.2, hit), false);
  }
});

test('a sight line that runs into the body is blocked: it matches a brute-force search', () => {
  // The hull of spheres is every ball whose centre and radius are the same weighted average of theirs.
  const shapes = [
    [[-0.5, 0.1, 0, 0.45], [0.4, -0.2, 0.1, 0.2]],
    [[-0.45, 0.33, 0, 0.52], [0, -0.57, 0, 0.27], [0, -0.02, 0, 0.6]],
  ];
  const rnd = random(9);
  let hits = 0, misses = 0;
  for (const piece of shapes) {
    const prep = prepare({ id: 'test', pieces: [piece], eyes: wedge.eyes });
    const balls = [];
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= (piece.length > 2 ? 60 - i : 0); j++) {
      const w = piece.length > 2 ? [i / 60, j / 60, 1 - (i + j) / 60] : [i / 60, 1 - i / 60];
      balls.push([0, 1, 2, 3].map((k) => piece.reduce((sum, sphere, s) => sum + sphere[k] * w[s], 0)));
    }
    for (let n = 0; n < 400; n++) {
      // From a point well outside, toward a point near the body.
      const a = rnd() * 2 * Math.PI, b = Math.acos(2 * rnd() - 1);
      const o = [3 * Math.sin(b) * Math.cos(a), 3 * Math.sin(b) * Math.sin(a), 3 * Math.cos(b)];
      const to = [rnd() * 2.4 - 1.2, rnd() * 2.4 - 1.2, rnd() * 1.6 - 0.8];
      const l = Math.hypot(to[0] - o[0], to[1] - o[1], to[2] - o[2]), d = to.map((v, k) => (v - o[k]) / l);
      let gap = Infinity;
      for (const [x, y, z, r] of balls) {
        const m = [x - o[0], y - o[1], z - o[2]], t = Math.max(0, m[0] * d[0] + m[1] * d[1] + m[2] * d[2]);
        gap = Math.min(gap, Math.hypot(m[0] - t * d[0], m[1] - t * d[1], m[2] - t * d[2]) - r);
      }
      // Leave out the grazing rays, where the search's own grid decides.
      if (Math.abs(gap) < 0.01) continue;
      assert.equal(blocked(prep, ...o, ...d), gap < 0, `ray ${n}: gap ${gap}`);
      if (gap < 0) hits++; else misses++;
    }
  }
  assert.ok(hits > 100 && misses > 100, `${hits} hits, ${misses} misses`);
});

test('an eye is hidden when another part of the body is in front of it', () => {
  // Two balls side by side, and the same right-hand ball alone. The right eye sits on the right ball's inner slope.
  const spec = { x: 0.2, y: 0, w: 0.16, h: 0.3, slideX: 0, slideY: 0 };
  const pair = { id: 'pair', pieces: [[[-0.5, 0, 0, 0.5]], [[0.5, 0, 0, 0.5]]], eyes: spec };
  const alone = { id: 'alone', pieces: [[[0.5, 0, 0, 0.5]]], eyes: spec };
  // From the front nothing is in the way: the eye is the same on both.
  assert.ok(Math.abs(eyes(pair, 0)[1] - eyes(alone, 0)[1]) < 1e-9 && eyes(alone, 0)[1] > 0.03);
  // Turned far to the right the left ball comes round in front of it. Alone, the eye would still show.
  assert.ok(eyes(alone, 85)[1] > 0.02, `alone: ${eyes(alone, 85)[1]}`);
  assert.equal(eyes(pair, 85)[1], 0);
  // On the way there it is covered bit by bit, never more of it showing than on the ball alone.
  let last = Infinity, partly = 0;
  for (let yaw = 60; yaw <= 85; yaw += 2.5) {
    const both = eyes(pair, yaw)[1], one = eyes(alone, yaw)[1];
    assert.ok(both <= one + 1e-9 && both <= last + 1e-9, `yaw ${yaw}: ${both} of ${one}`);
    if (both > 0 && both < one * 0.95) partly++;
    last = both;
  }
  assert.ok(partly >= 2, `partly hidden at ${partly} angles`);
});

test('a drawing is path strings in the 55.2 box, with eyes that show on the body colour', () => {
  const d = drawAvatar(wedge, '#FD690F', still(), 180);
  assert.equal(d.viewBox, '0 0 55.2 55.2');
  assert.equal(d.fill, '#FD690F');
  assert.equal(d.eyeFill, '#FFFFFF');
  assert.match(d.body, /^M[\d. ]+(L[\d. ]+)+Z$/);
  for (const eye of d.eyes) assert.match(eye, /^M[\d. ]+(L[\d. ]+)+Z$/);
  // The body's unit box is the middle 36 of the 55.2: the wedge is about 2.1 units wide.
  const xs = [...d.body.matchAll(/[ML]([\d.]+) /g)].map((m) => +m[1]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 2.1 * 18) < 0.5);
  // An eye that has gone round the edge is an empty path, not a stray point.
  assert.equal(drawAvatar(wedge, 'orange', still(70), 180).eyes[1], '');
  // Two pieces, two subpaths: the heart.
  assert.equal(drawAvatar(heart, 'red', still(), 180).body.split('Z').length - 1, 2);
  // Dark eyes on a white body; white on a dark or coloured one. Any other CSS colour is the fill as it is, with
  // white eyes (named colours belong to whoever uses the package).
  assert.deepEqual(colours('#FFFFFF'), { fill: '#FFFFFF', eyeFill: '#1C1C1C' });
  assert.deepEqual(colours('#000000'), { fill: '#000000', eyeFill: '#FFFFFF' });
  assert.deepEqual(colours('tomato'), { fill: 'tomato', eyeFill: '#FFFFFF' });
  assert.deepEqual(colours('var(--ink)'), { fill: 'var(--ink)', eyeFill: '#FFFFFF' });
  // Small sizes draw with fewer points, and slightly bigger eyes.
  const small = drawAvatar(wedge, 'orange', still(), 16);
  assert.ok(small.body.length < d.body.length / 2);
  assert.ok(eyeArea(eyeShapes(wedge, still(), 16)[0]) > eyeArea(eyeShapes(wedge, still(), 180)[0]) * 1.4);
});
