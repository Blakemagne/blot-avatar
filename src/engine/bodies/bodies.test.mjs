// Every body of the Bot's avatar. Run with: npm test
//
// engine.test.mjs holds the engine to what a person should see on the three bodies it was built on. This file
// holds every body to the same: from the front it is the flat shape it replaces (if it replaced one), its eyes rest centred and
// level on a smooth part of the surface that faces forward, the near eye is the bigger one when it turns, the
// far eye goes round the edge and is gone by side on, no eye is ever drawn off the body, and in no pose a look
// can hold is the far eye a line with body showing beyond it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BODIES, EYE_RIM, FACES, LOOK_PITCH, LOOK_YAW, Rig, THIN_PX, area, barWidth, bounds, deg, eyeShapes, inside, rotation, silhouette, surfaceAt } = await import('../index.ts');
const { NEAR_WIDE, bodyShapes } = await import('../draw.ts');
const { muzzle, sprout } = await import('./parts.ts');
const { FLAT, flat } = await import('./flat.mjs');

/** The cloud is lopsided, as the flat cloud is. Every other body is its own mirror image left to right. */
const LOPSIDED = ['cloud'];
/** Jacrispy is a head on a body, not one blot: its face is up in its head. */
const HEADED = ['jacrispy'];

const still = (yaw = 0, pitch = 0, roll = 0, ex = 0, ey = 0) => ({ pose: { yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) }, eye: { x: ex, y: ey }, lid: 1, face: FACES.neutral });
const outline = (body, yaw = 0, pitch = 0, roll = 0) => silhouette(body, rotation({ yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) }), 72);
const size = (polys) => { const [x0, y0, x1, y1] = bounds(polys); return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };
const eyeArea = (polys) => polys.reduce((sum, p) => sum + Math.abs(area(p)), 0);
/** [left, right] eye areas for a pose, drawn large. */
const eyes = (body, ...pose) => eyeShapes(body, still(...pose), 180).map(eyeArea).map((a, i) => a / own(body)[i] ** 2);
/** How big a body draws each eye, against its eyes' w and h: 1 and 1 but for a body whose two eyes differ (jacrispy's lenses). */
const own = (body) => body.eyes.sizes ?? [1, 1];
const each = (run) => { for (const [id, body] of Object.entries(BODIES)) run(id, body); };

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
/** How far the drawn body reaches at height y: to the right (way 1, its largest x there) or to the left (way -1, minus its smallest). */
function reach(polys, y, way) {
  let best = -Infinity;
  for (const p of polys) {
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const ya = p[j + 1], yb = p[i + 1];
      if ((ya > y) !== (yb > y)) best = Math.max(best, way * (p[j] + ((p[i] - p[j]) * (y - ya)) / (yb - ya)));
    }
  }
  return best;
}
/** Is (x, y) on the drawn body, on or inside the outline of one of its pieces? */
const onBody = (polys, x, y, slack = 0) => polys.some((p) => inside(p, x, y) || toEdge(p, x, y) < slack);

test('every body is its own mirror image front to back, so its face can be on either side', () => {
  each((id, body) => {
    const key = (s) => s.map((v) => v.toFixed(9)).join(',');
    const all = new Set(body.pieces.map((piece) => piece.map(key).sort().join(';')));
    for (const piece of body.pieces) {
      const mirrored = piece.map(([x, y, z, r]) => key([x, y, z === 0 ? 0 : -z, r])).sort().join(';');
      assert.ok(all.has(mirrored), `${id}: a piece has no mirror image behind`);
    }
    const front = eyes(body, 0), behind = eyes(body, 180);
    assert.ok(Math.abs(front[0] - behind[0]) < 1e-6 && Math.abs(front[1] - behind[1]) < 1e-6, `${id}: half a turn round, the eyes are ${behind}, not ${front}`);
  });
});

test('from the front, at pose zero, each body fills the box of the flat shape it replaces', () => {
  const flats = Object.keys(BODIES).filter((id) => FLAT[id]);
  for (const id of flats) {
    const old = flat(id), now = size(outline(BODIES[id]));
    // The flat drawings lean (about 15 degrees; the blob 25); stood upright (eyes level), their box is the body's.
    assert.ok(Math.abs(now.w / old.upright.w - 1) < 0.03, `${id}: width ${now.w} against the flat shape's ${old.upright.w}`);
    assert.ok(Math.abs(now.h / old.upright.h - 1) < 0.03, `${id}: height ${now.h} against the flat shape's ${old.upright.h}`);
    // Centred on its own axis, so it turns in place.
    assert.ok(Math.abs(now.cx) < 0.01 && Math.abs(now.cy) < 0.02, `${id}: centred (${now.cx}, ${now.cy})`);
    // And leaned over the way the flat drawing leans, it fills the flat drawing's own box. (Looser: most of
    // the flat drawings are skewed as well as leaned, and the bodies are not.)
    const leaned = size(outline(BODIES[id], 0, 0, (old.lean * 180) / Math.PI));
    assert.ok(Math.abs(leaned.w / old.leaning.w - 1) < 0.08, `${id}: leaning width ${leaned.w} against ${old.leaning.w}`);
    assert.ok(Math.abs(leaned.h / old.leaning.h - 1) < 0.08, `${id}: leaning height ${leaned.h} against ${old.leaning.h}`);
  }
});

test('at pose zero each body but the cloud is its own mirror image left to right', () => {
  each((id, body) => {
    if (LOPSIDED.includes(id)) return;
    const polys = outline(body);
    for (const p of polys) {
      for (let i = 0; i < p.length; i += 2) {
        const off = Math.min(...polys.map((q) => toEdge(q, -p[i], p[i + 1])));
        // A point of one piece's outline, mirrored, is on the outline or inside another piece.
        assert.ok(off < 0.004 || polys.some((q) => inside(q, -p[i], p[i + 1])), `${id}: the outline is lopsided by ${off} at ${p[i]}, ${p[i + 1]}`);
      }
    }
    const box = size(polys);
    assert.ok(Math.abs(box.cx) < 1e-6, `${id}: off centre by ${box.cx}`);
    // And upright in the middle of its box, so it turns in place; this holds the bodies that have no flat drawing too.
    // A body with a head sits low, to leave room in the picture for its antennas, and tilts about its head, as the
    // robot's own head does: so the middle of the picture is inside its head instead.
    if (HEADED.includes(id)) assert.ok(box.cy > 0 && box.cy - box.h / 2 < -0.5, `${id}: the middle is not in its head`);
    else assert.ok(Math.abs(box.cy) < 0.02, `${id}: off centre by ${box.cy} up or down`);
    // Turning left is the mirror image of turning right.
    const a = size(outline(body, 35, 10)), b = size(outline(body, -35, 10));
    assert.ok(Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.cx + b.cx) < 1e-6 && Math.abs(a.h - b.h) < 1e-6, `${id}: turned`);
    const [nearL, farR] = eyes(body, 35), [farL, nearR] = eyes(body, -35);
    // (Two eyes of different sizes cover different stretches of the round head, the big one more of its curve,
    // so turned towards, theirs match only to 10 per cent; turned away, they still match closely.)
    const tol = body.eyes.sizes ? 0.1 : 1e-3;
    assert.ok(Math.abs(nearL - nearR) < tol * nearL && Math.abs(farL - farR) < tol * nearL + 1e-9, `${id}: eyes ${[nearL, farR]} against ${[nearR, farL]}`);
  });
  // The cloud is the lopsided one, and still stands in the middle of its box.
  const cloud = outline(BODIES.cloud);
  assert.ok(Math.abs(size(cloud).cx) < 0.01);
  let off = 0;
  for (const p of cloud) for (let i = 0; i < p.length; i += 2) if (!onBody(cloud, -p[i], p[i + 1])) off = Math.max(off, Math.min(...cloud.map((q) => toEdge(q, -p[i], p[i + 1]))));
  assert.ok(off > 0.05, `the cloud is lopsided by ${off}`);
});

test('at pose zero the eyes are whole, centred, level and upright, exactly where the body says', () => {
  each((id, body) => {
    const [left, right] = eyeShapes(body, still(), 180);
    assert.equal(left.length, 1, `${id}: the left eye is whole`);
    assert.equal(right.length, 1, `${id}: the right eye is whole`);
    const l = size(left), r = size(right);
    assert.ok(Math.abs(l.cx + r.cx) < 1e-6, `${id}: centred`);
    assert.ok(Math.abs(l.cy - r.cy) < 1e-6, `${id}: level`);
    // Screen y points down; the body's eye line is in y-up face coordinates.
    assert.ok(Math.abs(l.cy + body.eyes.y) < 0.004 && Math.abs(r.cx - body.eyes.x) < 0.004, `${id}: where the body says`);
    for (const [e, k] of [[l, own(body)[0]], [r, own(body)[1]]]) {
      assert.ok(Math.abs(e.w - body.eyes.w * k) < 0.004, `${id}: eye width ${e.w}`);
      assert.ok(Math.abs(e.h - body.eyes.h * k) < 0.004, `${id}: eye height ${e.h}`);
    }
    // Upright and unsheared: a mirror image of itself left to right and top to bottom.
    for (const [poly, c] of [[left[0], l], [right[0], r]]) {
      for (let i = 0; i < poly.length; i += 2) {
        assert.ok(toEdge(poly, 2 * c.cx - poly[i], poly[i + 1]) < 0.003 && toEdge(poly, poly[i], 2 * c.cy - poly[i + 1]) < 0.003, `${id}: an eye is not upright`);
      }
    }
    // The two eyes are apart, and neither is far from the middle of the body.
    assert.ok(body.eyes.x - body.eyes.w / 2 > 0.06, `${id}: the eyes touch`);
    // (A body with a head, jacrispy, has its eyes in the middle of the head, which is above the middle of the body.)
    if (!HEADED.includes(id)) assert.ok(Math.abs(body.eyes.y) < 0.2 && body.eyes.x < 0.3, `${id}: the eyes are off in a corner`);
    else assert.ok(body.eyes.y > 0 && body.eyes.y < 0.5 && body.eyes.x < 0.45, `${id}: the eyes are off the face`);
  });
});

test('the eyes rest on one smooth part of the surface that faces forward, wherever a look slides them', () => {
  const a = { z: 0, nx: 0, ny: 0, nz: 0 }, b = { z: 0, nx: 0, ny: 0, nz: 0 };
  const STEP = 0.02;
  each((id, body) => {
    const e = body.eyes;
    let sharpest = 0;
    for (const [sx, sy] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [0, -1]]) {
      for (const side of [-1, 1]) {
        const cu = side * e.x + sx * e.slideX, cv = e.y + sy * e.slideY;
        if (sx === 0 && sy === 0) {
          assert.ok(surfaceAt(body, cu, cv, a));
          // At rest the middle of each eye is turned no more than about 35 degrees from the viewer.
          assert.ok(a.nz > 0.8, `${id}: the eye rests on a slope (${a.nz})`);
        }
        for (let u = cu - e.w / 2; u <= cu + e.w / 2 + 1e-9; u += STEP) {
          for (let v = cv - e.h / 2; v <= cv + e.h / 2 + 1e-9; v += STEP) {
            // The corners of an eye are round: only its own disc-ended bar is looked at.
            const r = e.w / 2, dv = Math.max(0, Math.abs(v - cv) - (e.h / 2 - r));
            if ((u - cu) ** 2 + dv ** 2 > r * r) continue;
            assert.ok(surfaceAt(body, u, v, a), `${id}: looking ${sx}, ${sy}, the eye is off the body at ${u}, ${v}`);
            for (const [du, dvv] of [[STEP, 0], [0, STEP]]) {
              if (!surfaceAt(body, u + du, v + dvv, b)) continue;
              const bend = (Math.acos(Math.min(1, a.nx * b.nx + a.ny * b.ny + a.nz * b.nz)) * 180) / Math.PI;
              sharpest = Math.max(sharpest, bend);
            }
          }
        }
      }
    }
    // A crease between two parts of a body bends the surface by tens of degrees in one step. A ball of the
    // smallest radius a face sits on (about 0.6) bends by under 10 this near its edge.
    // (Not held for the heart: looking far up and to one side, the corner of an eye reaches the fold between
    // its two halves, about 20 degrees. That body is not built here.)
    if (id !== 'heart') assert.ok(sharpest < 12, `${id}: the surface under an eye bends ${sharpest} degrees in one step: a crease`);
  });
});

test('turned 30 degrees, the near eye is at least as big as the far eye; both ways', () => {
  each((id, body) => {
    // Positive yaw turns the face to the viewer's right: the left eye is the near one.
    const [near, far] = eyes(body, 30);
    assert.ok(near > 0 && far > 0, `${id}: both eyes still show at 30 degrees (${near}, ${far})`);
    assert.ok(near >= far, `${id}: near ${near}, far ${far}`);
    const [farLeft, nearRight] = eyes(body, -30);
    assert.ok(nearRight >= farLeft && nearRight > 0, `${id}: the other way, near ${nearRight}, far ${farLeft}`);
  });
  // On the bodies with a face that swells forward, the difference is plain to see. (A third bigger, no more:
  // a face steep enough for one and a half left the far eye a hairline at the full look. See the next test.)
  for (const id of ['blob', 'cloud', 'square', 'sparkle', 'clover', 'flower', 'teardrop', 'house', 'star', 'hex', 'pebble', 'pentagon']) {
    const [near, far] = eyes(BODIES[id], 30);
    assert.ok(near > far * 1.3, `${id}: near ${near}, far ${far}`);
  }
});

test('held anywhere in a look, the far eye is an eye or is leaving at the rim: never a line with body beyond it', () => {
  // A look turns the body up to LOOK_YAW and LOOK_PITCH with the eyes slid all the way over, and holds it
  // there for as long as the pointer stays. A waiting Bot rocks 7 degrees further on top of that. In every
  // such pose the far eye, if it is drawn, is at least two fifths as wide as the near one (a slit that reads
  // as an eye), or has no more than a rim's width of body beyond it (it is going round the edge, as on a
  // ball). What it must not be is a hairline with body on both sides: that reads as a crack in the face.
  // (Held for the bodies built here; the heart, the tablet and the wedge are another hand's.)
  const yawMost = (LOOK_YAW * 180) / Math.PI, pitchMost = (LOOK_PITCH * 180) / Math.PI;
  let drawn = 0;
  each((id, body) => {
    if (['heart', 'tablet', 'wedge'].includes(id)) return;
    for (let x = -1; x <= 1.001; x += 0.05) {
      if (Math.abs(x) < 0.2) continue;
      for (const y of [-1, -0.5, 0, 0.5, 1]) {
        for (const rock of [0, 7]) {
          const away = Math.sign(x), state = still(x * yawMost + away * rock, y * pitchMost, 0, x, y);
          const rim = silhouette(body, rotation(state.pose), 72);
          for (const px of [180, 96]) {
            const shapes = eyeShapes(body, state, px), far = away > 0 ? shapes[1] : shapes[0], near = away > 0 ? shapes[0] : shapes[1];
            assert.ok(near.length > 0, `${id} looking ${x}, ${y}: the near eye is gone`);
            if (!far.length) continue;
            drawn++;
            // Body beyond the eye, at the eye's own height: on a body that narrows upward the widest part is elsewhere.
            const [x0, y0, x1, y1] = bounds(far), beyond = reach(rim, (y0 + y1) / 2, away) - away * (away > 0 ? x1 : x0);
            // (The near eye as it would be unopened: it is drawn wider the further round the body is.)
            const opened = 1 + NEAR_WIDE * Math.min(1, Math.abs(Math.sin(state.pose.yaw)) / Math.sin(LOOK_YAW)) ** 2;
            const wide = Math.min(...far.map((p) => barWidth(p))), nearWide = Math.max(...near.map((p) => barWidth(p))) / opened;
            assert.ok(wide >= 0.4 * nearWide || beyond <= 0.08, `${id} looking ${x.toFixed(2)}, ${y}${rock ? ', rocking' : ''} at ${px} px: the far eye is ${(wide * px / 2).toFixed(1)} px wide beside a near eye of ${(nearWide * px / 2).toFixed(1)}, with ${(beyond * px / 2).toFixed(1)} px of body beyond it`);
          }
        }
      }
    }
    // On a body whose face is not its outline, both eyes are still there, whole, at the full look.
    if (['square', 'house', 'hex', 'pentagon', 'star', 'sparkle', 'flower', 'clover', 'cloud'].includes(id)) {
      for (const way of [1, -1]) {
        const shapes = eyeShapes(body, still(way * yawMost, 0, 0, way, 0), 110);
        assert.ok(shapes[0].length === 1 && shapes[1].length === 1, `${id}: an eye is cut or gone at the full look`);
      }
    }
  });
  assert.ok(drawn > 2000, `${drawn} far eyes looked at`);
});

test('the far eye thins as the body turns, never jumps, and is gone by side on', () => {
  each((id, body) => {
    const first = eyes(body, 0)[1];
    let last = first, gone = null;
    // Up to side on: past that the face is drawn on the side that has come round.
    for (let yaw = 2.5; yaw < 90; yaw += 2.5) {
      const now = eyes(body, yaw)[1];
      if (gone !== null) { assert.equal(now, 0, `${id}: the far eye came back at ${yaw}`); continue; }
      assert.ok(now < last + first * 0.002, `${id}: at ${yaw} the far eye is ${now}, was ${last}`);
      // It slides round: no step takes more than a slice of it. It never pops off.
      assert.ok(last - now < first * 0.2, `${id}: at ${yaw} the far eye jumped from ${last} to ${now}`);
      if (now === 0) gone = yaw;
      last = now;
    }
    assert.ok(gone !== null && gone <= 85, `${id}: the far eye is gone at ${gone}`);
    // And the near eye is still there when the far one has just gone.
    assert.ok(eyes(body, gone)[0] > first * 0.15, `${id}: at ${gone} the near eye is ${eyes(body, gone)[0]} of ${first}`);
  });
});

test('every point of every eye is drawn on the body, clear of its outline', () => {
  let points = 0;
  each((id, body) => {
    for (let yaw = -100; yaw <= 100; yaw += 12.5) {
      for (const pitch of [-25, -10, 0, 10, 25]) {
        for (const [ex, ey, roll] of [[0, 0, 0], [1, 0.6, 8], [-1, -1, -5]]) {
          for (const px of [180, 24]) {
            const state = still(yaw, pitch, roll, ex, ey);
            const body2d = silhouette(body, rotation(state.pose), px >= 96 ? 72 : 28);
            for (const eye of eyeShapes(body, state, px)) {
              for (const poly of eye) {
                for (let i = 0; i < poly.length; i += 2) {
                  points++;
                  const x = poly[i], y = poly[i + 1];
                  const ok = body2d.some((p) => inside(p, x, y) && toEdge(p, x, y) > EYE_RIM - 1e-6);
                  assert.ok(ok, `${id} yaw ${yaw} pitch ${pitch} look ${ex},${ey} at ${px}px: an eye point at ${x}, ${y} is off the body, or on its rim`);
                }
              }
            }
          }
        }
      }
    }
  });
  assert.ok(points > 200_000, `${points} points checked`);
});

test('an eye is never drawn as a hairline, on any body', () => {
  each((id, body) => {
    for (let yaw = -90; yaw <= 90; yaw += 3) {
      for (const pitch of [-20, 0, 12, 25]) {
        for (const eye of eyeShapes(body, still(yaw, pitch), 180)) {
          // 1 body unit is half the drawn size: 90 px.
          for (const poly of eye) assert.ok(barWidth(poly) * 90 >= THIN_PX, `${id} yaw ${yaw} pitch ${pitch}: a piece of an eye ${barWidth(poly) * 90} px wide`);
        }
      }
    }
  });
});

test('from the front the eyes can be read at 16 px', () => {
  each((id, body) => {
    const [left, right] = eyeShapes(body, still(), 16);
    assert.ok(left.length === 1 && right.length === 1, `${id}: both eyes are whole at 16 px`);
    // 1 body unit is 8 px.
    const l = size(left), r = size(right);
    for (const e of [l, r]) assert.ok(e.w * 8 >= 2 && e.h * 8 >= 3.5, `${id}: an eye is ${e.w * 8} by ${e.h * 8} px`);
    assert.ok((r.cx - r.w / 2 - (l.cx + l.w / 2)) * 8 >= 1.4, `${id}: the eyes are ${(r.cx - r.w / 2 - (l.cx + l.w / 2)) * 8} px apart`);
  });
});

test('the star, the sparkle, the flower, the clover and the cloud are still themselves when turned', () => {
  for (const id of ['star', 'sparkle', 'flower', 'clover', 'cloud']) {
    const body = BODIES[id];
    // The face's roof is the last piece. Its four corners lie inside the slab; its ridge (the spheres pushed
    // forward, and their mirror images) is all of it that stands proud. Turned, the points (or petals, or
    // leaves) stand out well past the ridge on both sides, and the roof adds nothing to the width: the
    // body's own outline shows, not a lump in its middle with the far side wrapped out of sight.
    const roof = body.pieces[body.pieces.length - 1];
    const ridge = { ...body, pieces: [roof.filter((s) => s[2] !== 0)] }, bare = { ...body, pieces: body.pieces.slice(0, -1) };
    assert.equal(ridge.pieces[0].length, 4, `${id}: a ridge of two spheres in front and two behind`);
    for (const [yaw, clear] of [[40, 0.25], [-40, 0.25], [60, 0.1], [-60, 0.1]]) {
      const all = bounds(outline(body, yaw)), face = bounds(outline(ridge, yaw)), slab = bounds(outline(bare, yaw));
      assert.ok(face[0] - all[0] >= clear && all[2] - face[2] >= clear, `${id} at ${yaw}: the face reaches the outline (${face[0] - all[0]} left, ${all[2] - face[2]} right)`);
      assert.ok(Math.abs(all[0] - slab[0]) < 1e-9 && Math.abs(all[2] - slab[2]) < 1e-9, `${id} at ${yaw}: the roof widens the outline`);
    }
    // And it narrows as a flat thing does, and stays as tall (the near side is drawn a little bigger).
    const front = size(outline(body)), turned = size(outline(body, 60));
    assert.ok(turned.w / front.w < 0.75 && Math.abs(turned.h / front.h - 1) < 0.07, `${id}: turned 60 degrees it is ${turned.w / front.w} as wide, ${turned.h / front.h} as tall`);
    // It is a slab with a low roof: even at the roof's ridge, under three fifths as deep as it is wide. (With
    // a ball for a face these were 1.6 deep: nearly as deep as wide.)
    const deep = Math.max(...body.pieces.flat().map((s) => s[2] + s[3]));
    assert.ok(deep * 2 < front.w * 0.6, `${id} is ${deep * 2} deep and ${front.w} wide`);
  }
});

test('turned 60 degrees a block shows its own outline: the ridge on its face stays inside it', () => {
  for (const id of ['square', 'house', 'hex', 'pentagon']) {
    const body = BODIES[id];
    // The ridge is the spheres on the middle line that stand furthest forward (and back); the block is the rest.
    const deep = Math.max(...body.pieces[0].map((s) => s[2]));
    const block = { ...body, pieces: body.pieces.map((piece) => piece.filter((s) => !(s[0] === 0 && Math.abs(s[2]) === deep))) };
    assert.equal(block.pieces[0].length, body.pieces[0].length - 4, `${id}: a ridge of two spheres in front and two behind`);
    for (const yaw of [-60, -40, 40, 60]) {
      const a = bounds(outline(body, yaw)), b = bounds(outline(block, yaw));
      assert.ok(Math.abs(b[0] - a[0]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9, `${id} at ${yaw}: the ridge stands ${Math.max(b[0] - a[0], a[2] - b[2])} past the block`);
    }
    // Each corner of the front view is three spheres deep (front, middle, back), so it stays one round corner as the block starts to turn.
    const corners = block.pieces[0].filter((s) => s[2] === 0);
    assert.equal(corners.length * 3, block.pieces[0].length, `${id}: every corner has a sphere half way back`);
  }
});

/** The convex hull of some points [x, y], as a flat polygon. */
function hullOf(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => { const out = []; for (const q of list) { while (out.length >= 2 && turn(out.at(-2), out.at(-1), q) <= 0) out.pop(); out.push(q); } out.pop(); return out; };
  return [...half(pts), ...half(pts.reverse())].flat();
}
/**
 * How scalloped an outline is: the share of its convex hull that is not body (the bays between the puffs).
 * A ball, or a ball behind a ball, has next to none.
 */
function bays(polys) {
  const hull = hullOf(polys.flatMap((p) => Array.from({ length: p.length / 2 }, (_, i) => [p[i * 2], p[i * 2 + 1]])));
  const [x0, y0, x1, y1] = bounds(polys), N = 160;
  let inHull = 0, inBody = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = x0 + ((i + 0.5) / N) * (x1 - x0), y = y0 + ((j + 0.5) / N) * (y1 - y0);
    if (!inside(hull, x, y)) continue;
    inHull++;
    if (polys.some((q) => inside(q, x, y))) inBody++;
  }
  return 1 - inBody / inHull;
}
/** The cloud's five circles from the front: the flat cloud's puffs. */
const PUFFS = [[-0.19, 0.173, 0.673], [0.282, 0.275, 0.475], [0.441, -0.145, 0.555], [-0.034, -0.208, 0.637], [-0.482, -0.228, 0.512]];

test('from the front the cloud is exactly its five puffs: nothing outside them, and no gap between its pieces', () => {
  const polys = outline(BODIES.cloud);
  // (Half a pixel of slack at 120 px: a sphere's edge as the camera sees it is a hair in front of its middle, and so drawn a hair further out.)
  const inPuffs = (x, y, slack) => PUFFS.some(([px, py, r]) => Math.hypot(x - px, -y - py) <= r + slack);
  for (const p of polys) for (let i = 0; i < p.length; i += 2) assert.ok(inPuffs(p[i], p[i + 1], 0.008), `a piece reaches outside the puffs at ${p[i]}, ${p[i + 1]}`);
  // Every point of the five circles is on some piece (a rim of spheres 18 degrees apart is under 0.006 short of round).
  let gaps = 0, worst = 0;
  for (let x = -1.05; x <= 1.05; x += 0.01) for (let y = -0.9; y <= 0.9; y += 0.01) {
    if (!inPuffs(x, y, -0.008) || onBody(polys, x, y)) continue;
    gaps++; worst = Math.max(worst, Math.min(...PUFFS.map(([px, py, r]) => Math.abs(Math.hypot(x - px, -y - py) - r))));
  }
  assert.equal(gaps, 0, `${gaps} points of the puffs are on no piece (up to ${worst} inside the outline)`);
  // Six pieces, none with more spheres than a clover's leaf has (the work to draw a piece grows fast with them).
  assert.equal(BODIES.cloud.pieces.length, 6);
  assert.ok(Math.max(...BODIES.cloud.pieces.map((piece) => piece.length)) <= 11, `${BODIES.cloud.pieces.map((piece) => piece.length)}`);
});

test('turned as far as a look turns it, the cloud keeps its scallops: it is not a ball with a ball behind it', () => {
  const front = bays(outline(BODIES.cloud));
  assert.ok(front > 0.01 && front < 0.02, `from the front ${front} of the cloud's hull is bay`);
  for (const yaw of [36, 40, 44, 48, -36, -40, -44, -48]) {
    const turned = bays(outline(BODIES.cloud, yaw));
    // (The clover, which reads as a clover at 48 degrees, keeps 72% of its own.)
    assert.ok(turned > 0.7 * front, `at ${yaw} degrees ${turned} of the hull is bay, against ${front} from the front`);
  }
  // The cloud this one replaced: five balls round a ball, and a ball pushed out of the middle for the face.
  // From the front it was the same outline; turned, the balls slid in behind one another and the bays closed.
  const balls = { id: 'cloud', pieces: [...sprout([0, 0, 0, 0.72], PUFFS.map(([x, y, r]) => [x, y, 0, r])), muzzle(0.24, 0.66, 0.03)], eyes: BODIES.cloud.eyes };
  assert.ok(Math.abs(bays(outline(balls)) - front) < 0.005, 'the same cloud from the front');
  for (const yaw of [44, 48, -44, -48]) assert.ok(bays(outline(balls, yaw)) < 0.45 * front, `the cloud of balls at ${yaw}: ${bays(outline(balls, yaw))}`);
  // It narrows as a slab does, and both eyes are on it at the full look, the near one the bigger.
  for (const way of [1, -1]) {
    const [left, right] = eyes(BODIES.cloud, way * 48, 0, 0, way, 0), near = way > 0 ? left : right, far = way > 0 ? right : left;
    assert.ok(near > far * 1.5 && far > 0.25 * eyes(BODIES.cloud)[0], `looking ${way}: near ${near}, far ${far}`);
  }
});

test('the blob is a circle from every side, through a spin too: its nose carries the eyes and is not part of the outline', () => {
  const blob = BODIES.blob, nosed = { ...blob, outline: undefined };
  /** How far an outline is from a circle about the middle of the picture: its furthest point less its nearest, in body units. */
  const offRound = (polys) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of polys) for (let i = 0; i < p.length; i += 2) { const r = Math.hypot(p[i], p[i + 1]); lo = Math.min(lo, r); hi = Math.max(hi, r); }
    return hi - lo;
  };
  // Half a pixel on a 200 px avatar (1 body unit is 100 px there).
  const HALF_PX = 0.005;
  for (let yaw = 0; yaw < 360; yaw += 3) for (const pitch of [0, 14, -30, 30]) for (const roll of [0, 20]) {
    const polys = outline(blob, yaw, pitch, roll);
    assert.equal(polys.length, 1);
    assert.ok(offRound(polys) < HALF_PX, `turned ${yaw}, ${pitch}, ${roll} the blob is ${offRound(polys) * 100} px off round at 200 px`);
  }
  // And as it is drawn, frame by frame through a real spin, from the front and from a held look.
  for (const look of [null, [1, 0], [-0.7, 0.7]]) {
    const rig = new Rig({ seed: 1, idle: false, blinks: false, body: blob });
    if (look) { rig.look(...look); for (let t = 0; t < 3000; t += 16) rig.step(16); }
    rig.poke('spin');
    let frames = 0, furthest = 0;
    for (let t = 0; t < 640; t += 4) {
      rig.step(4); frames++;
      furthest = Math.max(furthest, Math.abs(Math.sin(rig.state.pose.yaw)));
      const off = offRound(bodyShapes(blob, rig.state, 200));
      assert.ok(off < HALF_PX, `frame ${frames} of a spin from ${look}, turned ${(rig.state.pose.yaw * 180) / Math.PI}: ${off * 100} px off round`);
    }
    assert.ok(furthest > 0.99, 'the spin went through side on');
  }
  // With the nose in the outline it was not: a bulge of 4 px on each side, half way through a spin.
  assert.ok(offRound(outline(nosed, 80)) > 0.035 && offRound(outline(nosed, 100)) > 0.035, `${offRound(outline(nosed, 80))}`);
  // Leaving the nose out changes no picture a look can hold. A look holds the blob 38 degrees round at most,
  // and a nod on top of looking up or down tips it 30. That far, and a little further, the nose is inside the
  // ball's outline: the two outlines are the same points. Straight round it stays inside up to 52 degrees (in
  // a spin the eyes are shrinking away by then, and they are kept inside the outline like any eye).
  assert.ok(blob.look * LOOK_YAW < deg(39) && LOOK_PITCH + deg(16) <= deg(30) + 1e-9);
  for (let yaw = -42; yaw <= 42; yaw += 3) for (const pitch of [-30, -14, 0, 14, 30]) {
    assert.deepEqual(outline(nosed, yaw, pitch), outline(blob, yaw, pitch), `turned ${yaw}, ${pitch}`);
  }
  for (const yaw of [-52, 48, 52]) assert.deepEqual(outline(nosed, yaw), outline(blob, yaw), `turned ${yaw}`);
  // And the eyes are on the nose, not on the ball: the face stands 0.04 proud of it in the middle, and the far
  // eye of a full look is the slit it was (on the bare ball it is a fifth bigger, and the near one a tenth narrower).
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  assert.ok(surfaceAt(blob, 0, 0, hit) && Math.abs(hit.z - 0.96) < 1e-3, `the face is ${hit.z} deep in the middle`);
  const bare = { ...blob, pieces: blob.outline.pieces, outline: undefined };
  const [near, far] = heldEyes(blob, 1, 0, 200), [bareNear, bareFar] = heldEyes(bare, 1, 0, 200);
  assert.ok(far < 0.35 && far < 0.88 * bareFar && near > 1.04 * bareNear, `with the nose ${near}, ${far}; on the bare ball ${bareNear}, ${bareFar}`);
});

test('the pebble has no shoulders in a spin: the ball on its face carries the eyes and is not part of the outline', () => {
  const pebble = BODIES.pebble, nosed = { ...pebble, outline: undefined };
  // Side on, the bar is as deep as one corner sphere (1.6, drawn a little bigger for being near), and the ball stood out of
  // it on both sides.
  for (const yaw of [70, 80, 90, 100, 110]) {
    const bar = size(outline(pebble, yaw)).w, was = size(outline(nosed, yaw)).w;
    assert.ok(was - bar > 0.06, `turned ${yaw}: ${was} wide with the ball, ${bar} without`);
  }
  assert.ok(Math.abs(size(outline(pebble, 90)).w - 1.6) < 0.06, `side on it is ${size(outline(pebble, 90)).w} wide`);
  // In every pose a look can hold (38 degrees round, tipped up to 30) and a little further, the outline is
  // the same points with the ball or without it; and the eyes are on the ball.
  assert.ok(pebble.look * LOOK_YAW < deg(39));
  for (let yaw = -42; yaw <= 42; yaw += 3) for (const pitch of [-30, -14, 0, 14, 30]) {
    assert.deepEqual(outline(nosed, yaw, pitch), outline(pebble, yaw, pitch), `turned ${yaw}, ${pitch}`);
  }
  const hit = { z: 0, nx: 0, ny: 0, nz: 0 };
  assert.ok(surfaceAt(pebble, 0, 0, hit) && Math.abs(hit.z - 0.9) < 1e-3, `the face is ${hit.z} deep in the middle`);
});

/** A body's two eyes, [near, far] as shares of their size from the front, once the real rig has settled into a look. */
function heldEyes(body, x, y, px) {
  const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
  const front = eyeShapes(body, rig.state, px).map(eyeArea);
  rig.look(x, y);
  for (let t = 0; t < 3000; t += 16) rig.step(16);
  const [left, right] = eyeShapes(body, rig.state, px).map(eyeArea);
  return x > 0 ? [left / front[0], right / front[1]] : [right / front[1], left / front[0]];
}

test('at its own full look a ball still shows two eyes: the near one nearly whole, the far one a slit at the rim', () => {
  const ROUND = ['blob', 'teardrop', 'pebble'];
  for (const id of ROUND) {
    const body = BODIES[id];
    assert.ok(body.look > 0.7 && body.look < 0.9, `${id} is held at ${body.look} of a look`);
    // Everywhere the pointer can hold it: a full look across, and up or down with it (a look is no longer than
    // 1 whichever way it points, so the further up it is the less far across); large and at the sizes the app
    // turns. Straight across the far eye is a slit; with the look going up or down the body is turned less and
    // the far eye is more of an eye. (A look past the circle, the old corner, is cut back to it.)
    for (const px of [120, 72, 64]) for (const x of [1, -1]) for (const [up, most] of [[0, 0.45], [15, 0.45], [-15, 0.45], [30, 0.55], [-30, 0.55], [50, 0.7], [-50, 0.7], ['corner', 0.65], ['low corner', 0.65]]) {
      const a = (up * Math.PI) / 180, [lx, ly] = up === 'corner' ? [x, 1] : up === 'low corner' ? [x, -1] : [x * Math.cos(a), Math.sin(a)];
      const [near, far] = heldEyes(body, lx, ly, px);
      assert.ok(near >= 0.6, `${id} looking ${lx}, ${ly} at ${px} px: the near eye is ${near} of its front size`);
      assert.ok(far >= 0.15 && far <= most, `${id} looking ${lx}, ${ly} at ${px} px: the far eye is ${far} of its front size`);
    }
    // Without its limit the same ball, looking straight across, is down to one eye.
    const [near, far] = heldEyes({ ...body, look: undefined }, 1, 0, 120);
    assert.ok(far === 0 && near > 0, `${id} turned all the way: near ${near}, far ${far}`);
  }
  // No other body is held short, and each of them keeps both eyes at the full look straight across.
  each((id, body) => {
    if (ROUND.includes(id)) return;
    assert.equal(body.look, undefined, `${id} turns all the way`);
    for (const x of [1, -1]) { const [near, far] = heldEyes(body, x, 0, 72); assert.ok(near >= 0.5 && far >= 0.2, `${id} looking ${x}: near ${near}, far ${far}`); }
  });
});

test('held in any look, with the face of anything a Bot does, every body shows two eyes at 64 and 72 px', async () => {
  // A look is 1 long at most, whichever way it points: the rig cuts a longer one back, so the corners (across
  // all the way and up all the way at once) are not looks any more. In the corners the wedge was one-eyed with
  // the pointer up and to the side, the heart at 64 px with it down and to the side, and a ball that waits
  // lost its far eye in half its frames.
  const { ACTIVITY_FACES } = await import('../faces.ts');
  const faces = { neutral: FACES.neutral, ...ACTIVITY_FACES };
  assert.deepEqual(Object.keys(faces).sort(), ['neutral', 'speaking', 'thinking', 'waiting', 'working']);
  const looks = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0.8], [-1, 0.8], [0.8, 1], [1, -0.8], [-1, -0.8]];
  for (let a = 0; a < 360; a += 20) looks.push([Math.cos(deg(a)), Math.sin(deg(a))]);
  let looked = 0;
  each((id, body) => {
    for (const [x, y] of looks) {
      const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
      rig.look(x, y);
      for (let t = 0; t < 2500; t += 16) rig.step(16);
      assert.ok(Math.hypot(rig.state.eye.x / (body.look ?? 1), rig.state.eye.y) < 1 + 1e-9, `${id} looking ${x}, ${y}: the look is ${JSON.stringify(rig.state.eye)}`);
      for (const [name, face] of Object.entries(faces)) for (const px of [64, 72]) {
        const [left, right] = eyeShapes(body, { ...rig.state, face }, px);
        looked++;
        assert.ok(left.length && right.length, `${id} looking ${x.toFixed(2)}, ${y.toFixed(2)} with the ${name} face at ${px} px: an eye is gone`);
      }
    }
  });
  assert.ok(looked > 3500, `${looked} faces looked at`);
});

test('looking across, the near eye is drawn bigger than it is from the front, and the far one much smaller', () => {
  // A turn alone narrows both eyes (the near one to about 0.6 to 0.8 of its front size at a full look). The
  // near eye opens as the body turns, so it grows all the way: bigger than from the front at half a look,
  // and at least as big as that at the full one, on every body and at the sizes the app turns.
  each((id, body) => {
    for (const px of [200, 72, 64]) for (const x of [1, -1]) {
      const [nearHalf, farHalf] = heldEyes(body, x * 0.5, 0, px), [near, far] = heldEyes(body, x, 0, px);
      assert.ok(nearHalf > 1.05 && farHalf < 0.9, `${id} half way ${x} at ${px} px: near ${nearHalf}, far ${farHalf}`);
      assert.ok(near > 1 && far < 0.45, `${id} looking ${x} at ${px} px: near ${near}, far ${far}`);
      assert.ok(near > 2.4 * far, `${id} looking ${x} at ${px} px: near ${near} beside far ${far}`);
    }
  });
  // The wedge, which the turn was built on: the near eye a quarter bigger, the far one a slit.
  const [near, far] = heldEyes(BODIES.wedge, 1, 0, 72);
  assert.ok(near > 1.25 && far > 0.1 && far < 0.35, `the wedge: near ${near}, far ${far}`);
  // Facing front nothing is opened: the two eyes are the same size.
  const [left, right] = eyes(BODIES.wedge);
  assert.ok(Math.abs(left - right) < 1e-9);
});

test('seen from behind, the eye that is opened is still the near one', () => {
  // The back of a body is its front mirrored, so a body turned 150 degrees shows what one turned 30 the other
  // way shows: the same eye is the big one in both.
  for (const body of [BODIES.wedge, BODIES.square, BODIES.tablet]) {
    const front = eyes(body, -30), behind = eyes(body, 150);
    assert.ok(front[1] > front[0] * 1.15, `${body.id} from the front: ${front}`);
    assert.ok(behind[1] > behind[0] * 1.15, `${body.id} from behind: ${behind}`);
  }
});

test('the opened near eye grows outward only: with a wide face it still does not run into the far eye', async () => {
  // The waiting face (what a Bot wears while a card is up) draws its eyes a third wider than the neutral one,
  // and the widest lab face wider still. The near eye keeps its inner edge where the face put it, so the gap
  // between the two eyes at a full look is what it is without the opening: over 1 px at the sizes the app turns.
  const { ACTIVITY_FACES } = await import('../faces.ts');
  const gap = (a, b) => {
    let best = Infinity;
    for (const p of a) for (const q of b) for (let i = 0; i < p.length; i += 2) for (let j = 0; j < q.length; j += 2) best = Math.min(best, Math.hypot(p[i] - q[j], p[i + 1] - q[j + 1]));
    return best;
  };
  let looked = 0;
  each((id, body) => {
    for (const [x, y] of [[1, 0], [-1, 0], [1, 0.5], [-1, 0.5], [1, -0.5], [-1, -0.5]]) {
      const rig = new Rig({ seed: 1, idle: false, blinks: false, body });
      rig.look(x, y);
      for (let t = 0; t < 3000; t += 16) rig.step(16);
      for (const [face, px, least] of [[FACES.neutral, 64, 2], [ACTIVITY_FACES.waiting, 64, 1], [ACTIVITY_FACES.waiting, 72, 1], [FACES.excited, 200, 1]]) {
        const [left, right] = eyeShapes(body, { ...rig.state, face }, px);
        if (!left.length || !right.length) continue;
        looked++;
        const px2 = (gap(left, right) * px) / 2;
        assert.ok(px2 >= least, `${id} looking ${x}, ${y} at ${px} px: the eyes are ${px2.toFixed(2)} px apart`);
      }
    }
  });
  assert.ok(looked > 250, `${looked} pairs of eyes looked at`);
});
