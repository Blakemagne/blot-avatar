# @blot/avatar

The avatar of blot's Bots, as a package anyone can use. The demo page in `site/` is three views, one at a time: a studio (pick one, colour it, set it to work, or have a model design one), every move on one stage, and how to use it: `npm run site:dev`, or [blakemagne.github.io/blot-avatar](https://blakemagne.github.io/blot-avatar/) once GitHub Pages is on.

A body is a real 3D shape made of a few rounded solids. The eyes are patches of its surface, so they lean, thin and go round the edge with it. The package turns a body, a pose and a face into three SVG path strings: the body and two eyes. Beside them it draws effects (a mark, a "!", sleep's Zs, sparks, rings that pass behind the body, a hop's shadow) as more paths, behind the body or in front.

It is pure TypeScript with no dependency. The engine has no DOM and runs the same in node and in a browser. React is an optional peer, needed only for `@blot/avatar/react`. There is no build step: the package is source, and whoever uses it compiles it (Vite, esbuild, tsx). A project that type-checks it needs `lib` ES2022 or later and `moduleResolution: "bundler"`, as in this package's own `tsconfig.json`; your compiler flags apply to it too.

```
npm install github:Blakemagne/blot-avatar
```

```
src/engine/       the engine: bodies, eyes, faces and their manners, the rig, the clips, the effects (no DOM)
src/engine/moves.ts  writing a move in plain words (@blot/avatar/moves); the moves themselves are in clips.ts
src/engine/bodies one file per body, and the list of them
src/ticker.ts     the one frame loop every live avatar shares
src/live.ts       createLive: one live avatar, no framework
src/react.ts      useLiveAvatar: the same, as a React hook
src/mount.ts      mount: the same, on any page
src/still.ts      the still pictures and the svg box
src/paint.ts      painting the effects into an svg (mount and the React hook)
src/ultra.ts      ultracode's finish: the rainbow skin over the body, its paints, the eyes' ink (mount and the hook)
src/coat/         the fluffy coat: its WebGL2 renderer and shaders, the eyes' mask, the canvas an avatar shows it on
src/engine/outline/  avatars from definitions: the path parser, the rules, and the body made from an outline
src/gallery.ts    23 ready-made avatars as definitions
golden/           frozen hashes of every frame the rig draws
site/             the demo page (built into _site/ for GitHub Pages); site/prompt.md is the design prompt for models
scripts/          the demo page's build, and contact sheets: the coat's (coat-sheet.mjs), ultracode's (ultra-sheet.mjs), the loading figures' (forms-sheet.mjs) and changes of shape (morph-sheet.mjs)
```

## Prove a change

| Command | What it proves |
|---|---|
| `npm run typecheck` | the package and the demo page compile |
| `npm test` | the engine, the clips, the ticker, live and mount |
| `npm run golden` | the rig draws every existing behaviour exactly as before, bit for bit (about 80 s, so not part of `npm test`) |
| `npm run site:dev` | the demo page on http://localhost:5300, rebuilt as you edit: judge a move or a shape by eye |
| `npm run site` | the demo page built into `_site/`, a static folder GitHub Pages serves as it is |
| `node scripts/coat-sheet.mjs [dir]` | the fluffy coat beside the flat body in headless Edge: contact sheets of bodies, sizes, colours and states, mount()'s DOM with a coat, a lost WebGL context, and the coat's timings (needs playwright-core: install it, or set `PLAYWRIGHT_CORE`) |
| `node scripts/ultra-sheet.mjs [dir] [what]` | ultracode on mount()'s own avatars in headless Edge, on a clock of the page's own, so every sheet is the same on every run: the pickup a frame every 80 ms, powered and idle, power down, bodies, sizes and reduced motion, flat and fluffy, orange and black, on a light and a dark page; the DOM a powered avatar has; and the frame loop's time with 1 and 6 avatars, powered and not (`what`: a comma list of sheets, `facts`, `frames`; needs playwright-core, as above) |
| `node scripts/forms-sheet.mjs [dir] [what]` | the loading figures on mount()'s own avatars in headless Edge, on the page's own clock: each figure at frames of its motion at 240, 96 and 36 px, the way in and the way out, the progress ring at 0, 0.3, 0.7 and 1, the flat figure's outline stroked in cyan over its fur, pale, blue and powered; flat and fluffy, orange and black, on a light and a dark page; a lost context during a figure; one long frame across each figure's flat middle, both ways, before its mesh is made (no old fur may stay over the flat drawing); the frame loop's time with 1 and 6 avatars per figure; and when each figure's mesh is made (`what`: a comma list of sheets, `facts`, `frames`, `warm`; needs playwright-core, as above) |
| `node scripts/morph-sheet.mjs [dir] [what]` | changes of shape on mount()'s own avatars in headless Edge, on the page's own clock: blob to star, star to heart, heart to cloud, blob to house, mug to lightbulb (gallery) and a powered blob to house, every 32 ms across the change, at 240 px (fluffy) and 96 px (flat, fluffy, fluffy black), and powered fur close up at 640 px, on a light and a dark page (`what`: a comma list of sheets; needs playwright-core, as above) |

Node 22 or later.

The golden check drives the rig through every behaviour, frame by frame, and hashes two things: every drawn path, and every number the rig's change test reads, at full precision. Both hashes are frozen in `golden/frames.sha256` (first on the engine before it became this package; again on 18 November 2026, when faces gained their manners, the blink and the idle life changed, and runs for the new moves, sleep, the mark, a visit and personality were added). Run it after any change to `rig.ts`, `clips.ts` or a curve the rig uses. A new cue does not change it, because a cue that is not playing does no arithmetic. If you mean to change an existing move, the hashes change too: freeze the new ones in the same change and say why.

Tests and the eye judge different things. A test says a move starts and ends at nothing, or never hides an eye. Only looking says it reads as a shake at 22 px. Do both.

## Add an animation

A move is written in plain words, with `@blot/avatar/moves`: a list of lines, each a part of the avatar, a verb, how far in units people think in, and the shape it takes over the move. No radians, no formulas, no channels.

```ts
import { cue, head, eyes, body, toward, beats, hold } from '@blot/avatar/moves';

// A wink: one eye shuts quickly and holds, and opens; the head leans a little that way and comes up.
const leaning = hold({ by: 20, till: 60 });

export const wink = cue(900, { amountUpTo: 1 }, [
  eyes.wink(toward).along(hold({ by: 14, till: 55, goneBy: 80 })),
  head.lean(toward, 6).along(leaning),
  body.rise(0.02).along(leaning),
  eyes.up(0.08).along(leaning),
  eyes.glance(toward, 0.06).along(leaning),
]);
```

`cue(ms, lines)` is a move anyone plays by name (`play('wink', { dir, amount })`); `poke(ms, lines)` is one a click plays. Every move in the package (`src/engine/clips.ts`) is written this way, and comes out the same as the hand-written arithmetic it replaced, to within rounding.

**Times** inside a move are percent of the way through it. **Sizes** are degrees for the head, body units for the body (1 is about the body's radius), percent for stretching and for the eyes' size and opening, and shares of a full look for where the eyes look.

### The words

The parts and what they do:

| line | what it does |
|---|---|
| `head.turn(side, degrees)` | turns its face toward a side (never further than the room a look has left) |
| `head.lean(side, degrees)` · `head.sway(degrees)` | leans toward a side · leans to its right whichever way it was played |
| `head.dip(degrees)` · `head.raise(degrees)` | nods down · tips its face up |
| `body.rise(units)` · `body.jump(units)` | up off the ground · the same as a jump: a heavy body goes less high |
| `body.slide(side, units)` | moves toward a side |
| `body.stretch(%)` · `body.squash(%)` | taller · shorter (a body that gives more goes further) |
| `body.swell(%)` · `body.shrink(%)` | bigger · smaller all over |
| `body.glow(n)` · `body.flares(n)` | glows · glows only if the body is one that flares |
| `body.ringsOutAfter(%)` | a wobbly body rings on after it lands |
| `body.rock(side, degrees, { below })` | rocks about a point below its middle, like a toy that will not fall over |
| `eyes.glance(side, look)` · `eyes.up(look)` · `eyes.down(look)` | where the eyes look |
| `eyes.widen(%)` · `eyes.narrow(%)` · `eyes.grow(%)` | taller · a squint (100 is shut) · bigger |
| `eyes.smile(n)` · `eyes.wink(side)` | happy arches · the eye on that side shuts |
| `eyes.circle(across, up, { everyMs })` | the eyes go round |
| `antennas.spread(degrees)` | antennas out (in, below 0), on a body that has them |

`side` is `toward` (the side it was played toward) or `away`. Never a sign.

The shapes. Each starts at 0; the ones that only die away (`wobble`, `surge`, `snapBack`) need a `.fadeOut(%)` to end at 0, and a move that does not is refused:

| shape | what it is |
|---|---|
| `beats('1 by 14%, hold till 55%, 0 by 80%')` | where it is, by when. Eased in and out at each beat, or `fast` (off at once and slowing into it) or `steady`. It starts at 0 and must end at 0. |
| `hold({ by, till, goneBy })` | up by `by`%, held till `till`%, gone by `goneBy`% (the end, if not given) |
| `peak(at, wide)` | a soft peak at `at`%, `wide`% either side |
| `flight(from, to)` | in the air from `from`% to `to`%, like a thrown ball |
| `hump()` | up and back down once over the move |
| `wave(times, { ahead })` | swings back and forth, `times` whole swings over the move |
| `wobble(perSecond, { dies })` | a swing that dies away, in real time (end it with `.fadeOut`) |
| `surge(by, { dies })` · `snapBack(by)` | up and dying away · pulled sharply and springing back (end each with `.fadeOut`) |

A shape can be changed: `.fadeIn(%)`, `.fadeOut(%)`, `.dwindling()`, `.times(another)`, `.byWobble()` (bigger the wobblier the body) and `.size()` (how big, whichever way).

A line can be changed too:
- `.and.squash(4).along(...)` adds a second part on the same channel, summed into one factor. Each part keeps its own verb's feel (a `.and.rise` after a jump is the same on every body).
- `.ignoringFeel()` makes it the same on every body.
- `.ignoringRoom()` takes it off the room a look has left (for a move that goes round, not to a side).
- `.ignoringAmount()` keeps it as big however hard the move is played.

Effects: `sparks()`, `sparksAllRound()`, `exclamation()`, `pulse()`, `orbits()`, `speedLines()`. Each shows only while the move plays and is as big as it is played. `.during(from, to)` shows it for part of the move and `.doneBy(%)` makes it finish early and hold.

`{ amountUpTo: 1 }` makes a move played harder than 1 move as if played at 1.

### What it keeps for you

Every rule a move must keep is built into the words:
- it only adds to the pose or scales it, never sets it, so moves overlap;
- the plain lines on one channel make one write a frame (factors multiplied, terms added, first), so a move on top of another comes out exactly as the two put together;
- a turn follows the side the move was played to, and is held to the room a look has left, so a ball held at a full look keeps its far eye;
- a squash goes as far as the body gives (`give`), and a jump as high as the body is light (`high`);
- effects show only while the move plays, and only if it is played at all;
- nothing is random.

When a move is defined, every line is tried at the start and the end of the move, at both sides, amounts 1 and 2, and very different feels. A line that is not at rest at both ends is refused with its name and how far off it is. A line that is known to be off says why with `.notAtRest('why')`; two built-in moves do, for a first-frame glow they always had.

Each move is worked out once when it is defined. A frame then works out each shape once and writes each channel once, with nothing made but the effects shown.

### Worked example: a new cue in the package

1. **Write it** at the end of `CLIPS` in `src/engine/clips.ts`, and add its name at the end of the type written on `CLIPS` (`readonly bow: Clip;`). Never in the middle, and never move a key: the pokes play in key order and the golden frames depend on it.

   ```ts
   // A bow: it bends forward slowly, eyes down and smiling, holds, and comes back up a touch past level.
   bow: cue(1800, { amountUpTo: 1 }, [
     head.dip(24).along(beats('1 by 35%, hold till 65%, -0.1 by 85%, 0 by 100%')),
     body.squash(4).along(beats('1 by 35%, hold till 65%, 0 by 100%')),
     eyes.down(0.35).along(hold({ by: 25, till: 70 })),
     eyes.smile(0.8).along(hold({ by: 40, till: 65 })),
   ]),
   ```

2. **It is listed by itself.** `CUES` is every clip in lane 'cue', in key order, so `play('bow')` works and the demo page lists it under Moves and in the studio.

3. **Test it** in `src/engine/clips.test.mjs`: add the name to the pinned order and to `CUES`. The tests that loop over `CUES` check the rules. Add a test of what the move must read as.

4. **Judge it by eye.** Run `npm run site:dev` and play it at 240, 36 and 22 px, on a few bodies. Give it a line in `SAYS` in `site/main.ts`.

5. **Run** `npm test` and `npm run golden`. A new cue at the end does not change the golden frames.

### Add one from outside the package

A page that uses the package brings its own moves without editing it. Every entry point takes `clips`:

```ts
import { Rig, mount } from '@blot/avatar';
import { cue, eyes, head, toward, wave } from '@blot/avatar/moves';

// A waggle: a swing and a half from side to side, dying away, the eyes going with it.
const waggle = cue(900, [
  head.lean(toward, 7).along(wave(1.5).dwindling()),
  eyes.glance(toward, 0.15).along(wave(1.5).dwindling()),
]);

new Rig({ clips: { waggle } }).play('waggle');
mount(el, { shape: 'blob', size: 72, clips: { waggle } }).play('waggle', { dir: -1 });
```

The rig checks extra clips with `checkClips` when it is built. It throws for a name the rig already has, a lane other than 'poke' or 'cue', a time that is not a finite number over 0, or a clip with no `apply`. An extra poke joins the turn of pokes after the rig's own.

### Under the words

A move is a **clip**: `{ lane, ms, apply(o, p, v) }`, called each frame with the frame's `Channels`, the playing move `p` (`p.u` runs from 0 to just under 1; `p.cue` holds `dir`, +1 or -1, and `amount`, 0 to 2) and a `View` (the body's turn, the room a look has left, and its feel). There are two lanes anyone may use. A **poke** is what a click on the avatar plays: one at a time, in turn. A **cue** is a move played by name. Each cue has a slot of its own, so cues overlap, and a cue that is playing plays on when it is played again.

```ts
interface Channels {
  yaw: number; pitch: number; roll: number;   // radians added to the pose (start 0)
  eyeX: number; eyeY: number;                 // look units added to the eyes (start 0)
  lift: number;                               // body units off the ground (start 0)
  stretch: number; scale: number; open: number; // factors (start 1)
  eyeScale: number; dot: number;              // the rig's; a clip may multiply eyeScale
  x: number;                                  // body units moved to the right (start 0)
  arc: number;                                // added to the eyes' bend: happy arches (start 0)
  winkL: number; winkR: number;               // how far one eye is shut on top of the blink, 0..1 (start 0)
  glow: number;                               // a glow, for a renderer that draws one (start 0)
  antL: number; antR: number;                 // radians added to each antenna's swing, outward (start 0)
  fx: Fx[];                                   // the effects showing this frame (start empty)
}
```

A move whose arithmetic is not a size times a shape writes one line by hand with `byHand((o, p, v) => { ... })`, which is still checked for rest. In the package the spin's half turn, the eyes going to dots, the pop, the blink, the kick and the flare's flickering glow are written that way. A line written by hand keeps the rules itself: only `+=` and `*=`, any yaw times `v.room`, nothing random.

## How a face is worn

A face (`FACES`) says what the eyes look like. Its **manner** (`MANNERS` in `faces.ts`) says how the rest of the avatar carries it:

- a head pose (`yaw`, `pitch`, `roll`) and a `rise`: sad looks down and sinks, proud lifts its chin, shy looks away;
- an `energy`, 0..1: a lively face comes on quicker, blinks and breathes faster; a dull one comes on slowly;
- a `kick`, the jolt as the face comes on: surprised pops up, scared flinches;
- habits while it is worn: `tremble` (scared, angry), `sway` (sad, shy), `scan` (the eyes searching: suspicious, confused), `bounce` (excited, laughing), and `doze` (sleepy nods off and catches itself);
- a `blink` pace: a sleepy blink is slow, a scared one quick.

The posture is thrown a little past where it is going and settles; the eyes ease in over 150 ms as before. The habits play only while the rig is alive (`idle` on), so a still rig with a face is still; the quick ones (tremble, bounce) move every frame, the slow ones on the breath's steps. Every activity is worn plainly: a face set while it does something waits for its manner until the activity ends. To give a face a manner, add a line to `MANNERS`; a face with none moves as faces always did.

## What it is like to move

`new Rig({ personality })`, `rig.setPersonality(p)`, or `personality` on `createLive` and `mount`: five numbers, each 0..1. **The engine's own feel is `PERSONALITY`: weight, squash and wobble at 0.5, flare and float at 0. There every move is exactly as before.** A change eases in (a floater rises, it does not jump).

| | low | high |
|---|---|---|
| `weight` | hops high and hangs | hops low, lands hard |
| `squash` | hardly gives | every stretch goes further |
| `wobble` (over 0.5) | | rings after it lands |
| `flare` (default 0) | no glow | glows as it moves |
| `float` (default 0) | stands | hovers, bobbing, with a shadow under it |

## States, the mark, a visit

- `setActivity('sleeping')`: the lids close slowly, it sinks, the breath slows and deepens, and Zs go up. It wakes quicker than it fell asleep.
- An activity change blinks, so the switch happens behind the blink.
- `setActivity('thinking', 'dots')`: the body becomes the middle of three dots, with a pulse running along them.
- `setActivity('working', 'progress')` with `setProgress(amount)`: a ring with an arc from the top, clockwise, as far as `amount` (0..1, eased to each new amount), which stays up until the activity ends. Only your page knows how far the work is, so until it says, the ring is an empty track: on `mount`, `createLive` and `useLiveAvatar` that is the `progress` option, e.g. `bot.update({ progress: 0.4 })` as the work goes on (unset is 0). Under reduced motion no loading figure is shown, so neither is the amount: show it some other way there too.
- `setMark(true)`: a dot on the outline, up and to the right, with a sonar ring, which the eyes glance at now and then. It means something is waiting for whoever is watching. A resting avatar with a mark keeps ticking.
- `setUltra(true)`: ultracode, a star's power, on until `setUltra(false)`. A star drops in, the body squashes as it lands, then it turns to rainbow glass, floats, glows and twinkles (see "Ultracode" under "Use it on a page"). A powered avatar never rests.
- `visit(body, stay)`: go to another shape for a moment and come back. A `setBody` meanwhile ends the visit.
- Left alone, the eyes wander a little and the head goes with them, on the breath's clock, so an idle avatar is redrawn no more often. Watching the pointer, the wander stops (what it had wandered to is handed to the springs, so nothing jumps) and the body leans toward the pointer, more while it moves.

## Effects

An effect is data: `{ kind, u, t, dir, amount }` (`fx.ts`). The rig and the clips push the ones that show into `Channels.fx`; `drawAvatar` places them against the body's outline for that frame and returns them as `effects: { layer, role, opacity, d }[]`. Paint each part in its role's colour: `body`, `eye`, `accent` (the renderer's accent colour, the body's colour if it has none) or `shadow`; ultracode's parts are `rainbow` (its rainbow; the accent without one), `light` (white) and `halo` (its halo; not drawn without one). `roleColour(role, paint)` gives each. `back` parts go before the body path, `front` parts after the eyes. `paintEffects(back, front, drawing, paint)` does it for an svg; `glowFilter` gives the CSS filter for `drawing.glow`.

| kind | what | played by |
|---|---|---|
| `mark` | a dot on the outline and its sonar ring | `setMark` |
| `bang` | a "!" that gathers from sparks above the head and falls apart | the `exclaim` cue |
| `spray` | sparks thrown up from the head | `delight` |
| `burst` | sparks flying off all round, half behind | `burst` |
| `pulse` | the outline going out and fading | `alert`, `burst` |
| `rings` | tilted rings, the far half behind the body, each with a light going round | `rings` |
| `streaks` | speed lines off the trailing edge | `comet` |
| `zzz` | Zs rising | sleeping |
| `ultra` | a halo behind the body, and five twinkles round it, each with a white core, flashing in turn | `setUltra` |
| `star` | a star dropping in from up and to the right onto the head | the pickup, as the power comes on |

A body off the ground also gets a `shadow` part under it. Effects never touch the body or eye paths.

## Add a shape

1. **Write a body** in `src/engine/bodies/<name>.ts`. A body is a list of pieces. A piece is the convex hull of a few spheres `[x, y, z, r]`: one is a ball, two a tapered capsule, eight a rounded box. The body's box is about 2 units across. Build it as its own mirror image front to back (`bothSides` in `parts.ts`), because the face is drawn on whichever side faces the viewer.

   ```ts
   import type { Body, Sphere } from '../body';
   import { ROUND_LOOK, bothSides } from './parts';

   const BALL: Sphere = [0, 0, 0, 0.92];

   export const blob: Body = {
     id: 'blob',
     pieces: [[BALL, ...bothSides([[0, 0, 0.36, 0.6]])]],
     outline: { pieces: [[BALL]] },
     eyes: { x: 0.23, y: 0.12, w: 0.24, h: 0.46, slideX: 0.15, slideY: 0.1 },
     look: ROUND_LOOK,
   };
   ```

   - `eyes` says where the eyes rest on the face, how big they are, and how far a look slides them.
   - `look` (optional) is how much of a full look the body turns. A ball needs `ROUND_LOOK`, or its far eye is gone at a full look.
   - `outline` (optional) is what is drawn when that is not all of `pieces`. The eyes always ride on `pieces`. Whatever is left out must stay inside the outline in every pose a look can hold.

2. **Add a line** to `BODIES` in `src/engine/bodies/index.ts`, at the end. The golden state stream names a body by its place in that list, so a body added in the middle changes the hash. If another shape id should be drawn as this body, add it to `SAME_BODY`.

3. **Give it a portrait pose** in `src/engine/bodies/portraits.ts`, the three-quarter view of still avatars. Keep both eyes readable at 24 px.

4. **Run the tests.** `src/engine/bodies/bodies.test.mjs` runs every body: mirror image front to back, eyes whole and on the surface, never a hairline, readable at 16 px, the far eye thinning without a jump.

5. **Look at it.** `npm run site:dev`: it is under Studio, Bot, Bodies by itself; pick it to see it live. Turn it with the pointer all the way round, poke it, and watch the far eye.

### Antennas, two-size eyes and decals

A body may also carry (all optional, and a body without them draws exactly as before):

- `eyes.sizes: [left, right]`: each eye's size as a multiple of `w` and `h`, for a face whose two eyes differ.
- `antennas`: two stalks, drawn as their own paths in their own colour and swung by the rig. Each is a stiff base and a whip that bends further (`follow`), so a swing has a follow-through. They sway a little when idle, lift and drop while thinking, draw in while working and flick when it speaks. Hold a pose with `rig.setAntennas(left, right, ms?)` (radians outward, eased over `ms` if given); a clip moves them through `o.antL` and `o.antR`.
- `eyes.fixed`: eyes that are fixed lenses, as a camera's are. They keep their shape whatever the face, never blink and do not slide to look.
- `decals`: flat marks on the surface, such as a lens's rim. Each is lifted onto the body as an eye is, so it leans and goes round the edge as the body turns. One with `eye: 'left' | 'right'` sits behind that eye and moves with it; one with `eye: 'both'` sits halfway between the eyes, and with `span: true` reaches from one to the other (a bar between two lenses).
- An antenna may have a `coil` (a spring wound round part of the stalk) and a `cap` at its tip.
- `paint`: the colours of the antennas and decals, by key. A page may paint any key over (`mount(..., { paint: { antenna: '#111' } })`).

Such a body's drawing has `layers`: paths to paint under the body (`front: false`) and over it, under the eyes.

To draw a body of your own with `mount()` or `useLiveAvatar`, pass it as `body`.

## Make one from an outline

A shape need not be written as spheres. An **avatar definition** is one SVG path in a `0 0 100 100` box and where the eyes go:

```json
{"version":1,"id":"ghost","name":"Ghost","body":{"path":"M24 50C24 28 35 12 50 12C65 12 76 28 76 50L77 80C77 85 73 88 68 88C63 88 61 84 59 81C57 84 54 88 50 88C46 88 43 84 41 81C39 84 37 88 32 88C27 88 23 85 23 80Z"},"eyes":{"x":50,"y":42,"spacing":16,"scale":1.15}}
```

Pass it anywhere a shape goes: `mount(el, { shape: definition })`, `useLiveAvatar({ shape: definition })`, `bodyOf(definition)`, `stillState(definition, size)`, `visit(definition)`. The engine fills the outline with spheres, so every part comes out round, about as thick as it is wide; a hole (a subpath wound the other way) stays open from every side. The eyes ride the piece round them, and the body turns only as far as keeps both eyes in view (its `look`).

- **Check one you did not write** with `validateAvatar(input)`: `{ ok: true, value }` (the path rewritten from its numbers) or `{ ok: false, errors }`, each error a sentence a person or a model can act on. The rules are the format's: the path within 8..92, at least 40 by 14 units and 600 units² of fill, eyes on solid fill with room, a slug for an id.
- **The body** is `outlineBody(definition)`, kept for the same definition (by its id, path and eyes), the last 64. Making one takes about 40 to 270 ms, so a page that shows many should draw them when they are needed, or draw the stills once ahead of time (the demo page draws its gallery's at the build).
- **Ready-made ones**: `GALLERY` is 23 of them, each with the name of its colour among `BOT_COLOURS`; `galleryAvatar(id)` finds one and `galleryColour(g)` gives its hex.
- **Design one with a model.** `site/prompt.md` is a prompt that tells any model the format and how this engine makes a body, and asks for one line of JSON. The demo page's New tab adds your description to it and copies it, or opens it in Claude Code, Codex, Cursor or T3 Code; then it checks what comes back, says what to change, and copies a repair prompt when it is refused. Yours are kept in that browser, and a link carries one whole (`?def=`).

The format is open-bot-avatar's, so a definition made for it works here too, and the other way round. Its volume is not: there each part is a slab or turned like a vase; here every part is round.

`src/engine/outline/outline.test.mjs` holds every gallery avatar to this: from the front it covers its outline, holes stay open, the eyes rest where the definition puts them on one smooth surface, and in every look and face both eyes show at 64 px and can be read at 16 px.

## The public API

From `@blot/avatar`:

- **Drawing.** `drawAvatar(body, colour, state, size)` gives `{ body, eyes: [left, right], effects?, glow?, ultra? }`: three path strings in the box `VIEW_BOX`, the effects as more, and while powered how much power there is and where the rainbow's bands are. `effectShapes`, `paintEffects`, `glowFilter`, `FX_KINDS`. `BODIES`, `bodyFor(shape)`, `bodyOf(shape)` (the blob for an unknown id), `FACES`, `FACE_NAMES`, `colours(c)`, `portraitFor(shape)`, `stillState(shape, size)` and `svgBox(size)`. `drawAvatar(..., { coat: true })` adds `coat`, what a fluffy coat is drawn from (during a loading figure, `coat.shape`, the `FigureShape` its mesh is moved into); its parts are `coatMesh`, `coatDetail` and `dyeRamp`; `coatable()` says whether this page can draw one (it sets up WebGL2 the first time).
- **The rig.** `new Rig({ seed, body, pose, rest, clips, personality })` moves a state. Call `step(dtMs)` each frame; it returns true when the picture changed. `look(x, y)`, `stop()`, `poke(kind?)`, `play(name, { dir, amount })`, `blink()`, `emphasis(amount)`, `setFace`, `setBody` (it morphs), `visit(body, stay)`, `setActivity(activity, form)`, `setMark`, `setUltra` (with `ULTRA_WAIT`, `ULTRA_IN`, `ULTRA_OUT`, `ULTRA_CYCLE`), `setPersonality`, `setLevel`, `setProgress`, `rest(pose)`, `mirror`, `pause`. `MANNERS`, `mannerFor`, `PERSONALITY`, `ACTIVITY_FACES`. `state` is what `drawAvatar` draws; `still` and `resting` say whether it needs a frame.
- **Clips.** `CLIPS`, `POKES`, `CUES`, `PICKUP_MS`, `start`, `advance`, `checkClips`, `track`, `smooth`, `deg`, and the types `Clip`, `Channels`, `View`, `Cue`, `Playing`, `Lane`.
- **The frame loop.** `onFrame(tick)`, `onSeen(el, cb)`, `onMotion(cb)`, `reducedMotion()`, `pointer`, `watchPointer()`, `ticking()`.
- **A live avatar.** `createLive(props)` gives a `Live`: one rig, drawn from the shared loop into whatever you write it to. `lookFor`, `lookWithin`, `SMALL`, `LARGE`, `SMALL_LOOK`.
- **Any page.** `mount(host, options)` gives a `Mounted`: `update`, `poke`, `play`, `visit`, `destroy`. Options add `progress` (0..1, how far the progress figure is filled; also on `createLive` and `useLiveAvatar`), `mark`, `ultra`, `personality`, `accent` (the effects' colour) and `material` (`'flat'` or `'fluffy'`, the `Material` type).
- **Ultracode.** `skinMarkup(drawing, id, size, fur?)`, the skin as SVG markup with no DOM; `paintSkin(group, drawing, size, fur, id)`, the same written into an svg group frame by frame, `fur` being `furShown(showing, drawing)`, how much of a coat of fur shows (0 for none); `skinPaint(id)`, the effects' `rainbow` and `halo` paints; `ultraId()`; `eyeInk(eyeFill, k)`; `ULTRA_PALETTE`, `ULTRA_INK`, `ULTRA_LAVENDER`.
- **Definitions.** A `Shape` is a body's id or an `AvatarDefinition`. `validateAvatar`, `outlineBody`, `GALLERY`, `galleryAvatar`, `galleryColour`, `parsePath`, `flattenPath`, `serializePath`, `PathError`, `EYE_W`, `EYE_H`, `BOX_SCALE`. A body's `eyes.cx` moves the pair off the middle of the face.

From `@blot/avatar/moves`: everything for writing a move in plain words (see "Add an animation"): `cue`, `poke`, `head`, `body`, `eyes`, `antennas`, `toward`, `away`, the shapes (`beats`, `hold`, `peak`, `flight`, `hump`, `wave`, `wobble`, `surge`, `snapBack`), the effects (`sparks`, `sparksAllRound`, `exclamation`, `pulse`, `orbits`, `speedLines`), `byHand`, and the types `Shape`, `Line`, `Side`, `MoveOptions`.

From `@blot/avatar/react`: `useLiveAvatar(props)` gives `{ host, paths, layers, fx, coat, skin, first, reduced, live }`. Put `host` on a span and the three `paths` on the svg's paths. For a body with antennas or decals, put `layers[0]` on an empty `<g>` before the body path and `layers[1]` on one after it. For the effects, put `fx[0]` on an empty `<g>` before everything and `fx[1]` on one after the eyes, and pass `fxPaint: { fill, eyeFill, accent }`. Give the svg `overflow: visible` (as `mount` does): a "!" and sleep's Zs reach above the drawing box. For `material: 'fluffy'`, draw two svgs of the same box with `<canvas ref={coat} aria-hidden style={{ position: 'absolute', display: 'none' }} />` between them (hidden from the first paint, so it never takes room; the coat shows it when it paints): the first svg holds `fx[0]` and `layers[0]`, the second the body path, `layers[1]`, the eyes and `fx[1]`. Render the canvas whenever the material is fluffy. Without it, or without WebGL2, the body is flat. For `ultra`, put `skin` on an empty `<g>` right after the body path (before `layers[1]` and the eyes) and pass `fxPaint`: the hook paints the rainbow there, the halo and the twinkles in `fx`, and an inline fill on the eye paths while powered. Over a coat, put no filter, no opacity under 1 and no transform on the second svg: the rainbow blends with the fur through it.

### The frame loop's rules

- There is one frame loop for the page (`ticker.ts`). Nothing else in the package calls `requestAnimationFrame`. Do not give an avatar its own.
- An avatar is drawn only while it is on screen and the tab is showing.
- Under reduced motion nothing ticks. An avatar shows its still picture, wearing what it is doing (a thinking face, shut eyes asleep) or the face it was given, with its mark if it has one; `poke`, `play` and `visit` do nothing.
- An avatar at rest unsubscribes and costs nothing until something wakes it.
- A powered avatar (ultracode) never rests: it is drawn on every frame while it is on screen and the tab shows, as a moving one is, because its bands, its float and its twinkles never stop. Under reduced motion it is a powered still, and ticks no more than any other.
- One under 48 px (`SMALL`) is drawn at most 30 times a second.
- Only one of 64 px (`LARGE`) and up takes a full look. A small one turns at most `SMALL_LOOK` of the way. `mount()` leaves whether it can be poked to you (`pokeable`); blot makes only avatars of 64 px and up pokeable.
- A fluffy coat adds no frames. It is painted in the frame its avatar is drawn in, and only when the pose, the eyes, the colour or the size changed: a breath, a squash or a hop moves the picture it has. A coat drawn outside a frame (a still picture, reduced motion, the first coat of a body, whose mesh took from about 25 to 150 ms to make in Edge on a desktop PC, and holds up the frames for that long) waits in one queue, `soon`, which runs one a task, under reduced motion too.
- A loading figure's fur is painted on every frame while the figure moves (the spinner, the orbit, the dots while their pulse runs, a progress ring while its amount eases), and not at all while it is still (the radar, whose sweep and marks are drawn over the fur, and a progress ring that is not moving). Each figure's mesh is made once a page, in `soon`, while the coat is faded out in the flat middle of the way in, so the fur is ready when it comes in.

## Use it on a page

The package is TypeScript source, so the page needs a bundler that compiles it. With Vite, a plain HTML page is enough:

```html
<div id="bot"></div>
<script type="module">
  import { mount } from '@blot/avatar';

  const bot = mount(document.getElementById('bot'), {
    shape: 'heart', size: 96, follow: true, pokeable: true, label: 'Ada', color: 'tomato',
  });
  bot.play('bounce');
  // later: bot.update({ activity: 'thinking' }); bot.destroy();
</script>
```

`follow: true` watches the pointer anywhere on the page. To keep it to a card or a panel, also pass `followIn: card`: the avatar then follows the pointer only while it is inside that element, its edges are a full look, and outside it the avatar looks ahead again. `followReach` is how many px off the pointer is when the look is full (shorter turns sooner), and `followMost` how far it turns at most, 0..1 of a full look; a small avatar keeps to 0.6 unless told otherwise, because a full look at that size is a profile that loses the face.

`mount` makes the host a box of `size` px (and `position: relative` if it was static) and puts an svg in it that the drawing overflows. `destroy()` takes it all out again and puts the host's style back, and its own `role`, `tabindex` and `aria-label` if a pokeable avatar covered them. Mount into an element that is already in the document (its position is read from the page's CSS), and one avatar per element: a second `mount` on the same one throws until the first is destroyed.

Colours:
- `color` is `#rrggbb` or any CSS colour; the default is `#FD690F`. For a hex colour the eyes are dark on a light body and white on a dark one. For any other CSS colour they are white.
- `eyeFill` is the eyes' colour, any CSS colour, such as `'#FFD23F'`. Unset, the eyes are the white or dark one above. Mind the contrast: eyes close to the body's colour disappear.
- `fill` overrides the body's colour with any CSS value, such as `var(--ink)`.
- `BOT_COLOURS` is blot's own palette, `[hex, name]` in the order its Create New Bot picker shows them: black, brown, red, orange, yellow, green, cyan, blue, violet, magenta and gray. blot paints a black Bot in the theme's ink; on a page, pass `fill: 'var(--ink)'` and an `eyeFill` the other way round to do the same.

In React, use `useLiveAvatar` from `@blot/avatar/react`. The demo page has the whole component (put `host` on a span, `paths` on the three paths, and `first` as their first `d`).

### A coat of fur

`material: 'fluffy'` (on `mount` or `useLiveAvatar`) gives the body a coat of fur, drawn with WebGL2 and set round the eyes: the pile parts under them and darkens a little where it meets them. The eyes, the face, the antennas, the decals and the effects stay SVG over it. `update({ material })` switches at once, either way. Where there is no WebGL2 (a server, a test, an old browser), or it fails, the avatar is exactly the flat one. While it changes shape the coat stays on: the body it leaves, then the one it becomes, each stretched onto the blended outline, crossing over near half way. A loading figure wears the same fur: the body's coat fades out over the first quarter of the way in, the flat body opens into the figure, and the figure's own coat fades in over the last quarter (and back the same way). The figure's coat is a ball (radar), two balls (orbit), three balls that pulse (dots), or a tube whose thickness follows the spinner's comet or the progress ring's track and arc, drawn from the same numbers as the flat figure, so it keeps to its outline. Each is a mesh made once a page and moved every frame, never made again. The radar's marks and the eye dots are drawn over the fur, which does not part under them. A change of shape while a figure is up goes on under it: the figure's coat stays as it is, and a figure that ends on the way to a new body comes out onto that change of shape, the coat stretched onto it as ever.

```ts
const bot = mount(el, { shape: 'heart', size: 96, material: 'fluffy' });
bot.update({ material: 'flat' });
```

Where it is fur, and where it is flat:

| Where | Finish |
|---|---|
| `mount()` and `useLiveAvatar` in a browser with WebGL2, moving or still (reduced motion paints the still once, through `soon`) | fur |
| Anything that is only `drawAvatar`'s paths: a server render (`renderToString`), a still you draw with `stillState`, the demo page's SVG export | flat: the coat is pixels and these are paths |
| No WebGL2, a context that fails to start, a context lost (the coat comes back when it is restored) | flat |
| A change of shape | the coat stays on: the old body's, then the new one's, each stretched onto the outline drawn along rays from the middle (`DrawnCoat.warp`: inside its own outline in proportion, the pile past it only moved as far as the outline moved, and a thin ear or leaf that one ray meets and the next misses moved with the ray that meets it, so none of it is flung out past the outline), the two crossing over either side of half way (`DrawnCoat.also`), each at its share where both have fur and whole where one has (no fur seen through), the same picture on both sides of the swap; a change caught there fades the coat laid over out instead of dropping it |
| A loading figure (thinking, working) | the body's coat fades out over the first quarter, the flat shape opens into the figure, and the figure's fur fades in over the last quarter (and back the same way); a change of shape under a figure leaves the figure's fur as it is |
| `useLiveAvatar` without a `<canvas ref={coat}>` | flat, with no WebGL2 set up for it |

Every avatar on the page shares one WebGL2 context, which draws one coat at a time; each avatar keeps its own picture on a canvas under its body path (whose fill is turned down while the coat shows, so it still outlines and takes the pointer). The coat's colour is read from the body's: a hex colour as given, anything else (a name, a `var()`) as the page paints the body when the coat is drawn, so a theme change shows on the next picture, not before.

The level of detail is open-bot-avatar's ladder (`coatDetail`), in this engine's units: a small avatar draws fewer layers of pile and fewer, wider strands, so it covers the same and costs less. A coat is drawn at every size; there is no size below which it is left out. At a device pixel ratio of 1 (twice the size in px does the same at 2):

| Size | Layers of pile | Strand passes (of 8) | Strand width |
|---|---|---|---|
| 22 px | 2 | 3 | 2.67 |
| 32 to 48 px | 2 | 4 | 2 |
| 64 px | 2 | 5 | 1.6 |
| 96 px | 3 | 6 | 1.33 |
| 128 px | 3 | 7 | 1.14 |
| 180 px and up | 5 | 8 | 1 |

What it costs, measured in headless Edge on one desktop PC (an NVIDIA GTX 1060), main-thread time only:

- **A body's first coat** makes its mesh, once per body and kept: from about 25 ms (the lightbulb) to about 150 ms (the cloud). It runs through `soon`, outside the frame loop, but it is one task: the page's frames wait for it. In a change of shape the new body's mesh is started as the change sets off (the coat names it from the start, `DrawnCoat.also`), so the stutter comes there rather than half way, where the coat goes over to it; if it is still not made by then, the coat that is made shows alone, whole, until it is (read in the code; not timed for a change of shape). The demo page makes it earlier still, while the pointer rests on a shape.
- **A loading figure's first coat on a page** makes that figure's mesh the same way (the spinner and the progress ring share one): the tube was one task of 72 to 75 ms in Edge, made at about a third of the way in, and the first frame that wanted the figure's fur had it, for all five figures (`forms-sheet.mjs warm`). The balls (radar, orbit, dots) took under 50 ms each in Edge (no long task was reported); in Node the radar's took 58 ms, the orbit's 37 ms and the dots' 4 ms, and the tube 108 ms.
- **The first coat on a page** sets up WebGL2: about 20 ms.
- **Moving**, at 96 px: about 0.8 to 0.9 ms a frame for one avatar (about 0.5 ms flat), 3.3 to 4.2 ms for six (1.3 to 1.4 ms flat), main-thread time measured in headless Edge on one PC; it swings with load. A coat is painted again only when the pose, the eyes, the colour or the size changed; a breath, a squash or a hop moves the picture it has.
- **At rest**, nothing is painted and nothing ticks.
- **A loading figure**, at 96 px, all the way in: main-thread time a frame (mean, two runs of 2.5 s each, `forms-sheet.mjs frames`), beside a fluffy avatar idling (0.49 to 0.55 ms for one, 1.38 to 2.08 ms for six). Coat paints are from the first run.

| Figure | one flat | one fluffy | six flat | six fluffy | fluffy coat paints, one avatar |
|---|---|---|---|---|---|
| ring | 0.37 to 0.47 ms | 0.76 to 0.79 ms | 1.04 to 1.23 ms | 1.99 to 2.02 ms | every frame |
| orbit | 0.68 to 0.70 ms | 0.85 to 1.16 ms | 1.70 to 1.95 ms | 3.22 to 3.48 ms | every frame |
| dots | 0.36 to 0.46 ms | 0.45 to 0.53 ms | 1.06 to 1.12 ms | 1.39 to 2.45 ms | about one frame in three |
| radar | 0.61 to 0.79 ms | 0.56 to 0.76 ms | 2.10 to 2.98 ms | 1.90 to 2.19 ms | none |
| progress, still | 0.31 to 0.39 ms | 0.38 to 0.53 ms | 0.75 to 0.97 ms | 1.08 to 1.09 ms | none |
| progress, filling | 0.37 to 0.46 ms | 0.68 to 0.86 ms | 0.84 to 1.17 ms | 1.86 to 2.42 ms | nearly every frame |

The GPU's time and the browser's compositing are not in those numbers. The demo page keeps its thumbnails flat: a coat for each of its 38 avatars would make 38 meshes, about 3 s of work in all (measured in Node on the same PC).

### Ultracode

`ultra: true` (on `mount` or `useLiveAvatar`; `Rig.setUltra` underneath) is a star's power, on until it is turned off; `update({ ultra })` switches it. A star drops in from up and to the right and the body squashes as it lands; then the body turns to rainbow glass, floats, glows and twinkles. Its shape, its face and its idle life stay its own. Turned off, it fades back to its own colour and comes down: a quiet fade, no flourish. (The look is the motion study's, MIT, Nick Vasilescu and Blakemagne.)

```ts
const bot = mount(el, { shape: 'heart', size: 96, ultra: true });
bot.update({ ultra: false });
```

- **Timing.** The star falls for about 480 ms. The power waits 220 ms (`ULTRA_WAIT`) while the star drops, and comes in over 450 ms (`ULTRA_IN`); turned off, it goes over 550 ms (`ULTRA_OUT`); turned on again before it has gone, it comes back from where it is, with no second star. Turned off and on again during the pickup, the pickup plays on while its star still falls, and a new one starts once it has fallen; turned off before a frame of it was drawn (off screen, under reduced motion), nothing of it is left to play. The rainbow's bands go once round in about 4.2 s (`ULTRA_CYCLE`). There is no timer.
- **Flat.** A skin goes over the body path (`src/ultra.ts`): the rainbow (the study's Prism palette, `ULTRA_PALETTE`), a glassy sheen (a white glare up and to the left, a faint dark band inside the edge), and a thin, nearly white rim stroked under the rainbow's fill, so that only the outline of the whole shape shows, with no seams where the body's pieces overlap. The skin cross-fades from the body's own colour, so every colour, black too, powers up the same. The eyes go to a dark ink (`ULTRA_INK`), which shows on every band, and back.
- **Fluffy.** The fur goes rainbow and keeps its pile. The coat is dyed toward lavender (`ULTRA_LAVENDER`) as the power comes on, light enough for a dark Bot's fur to take colour, and the rainbow is laid over it with `mix-blend-mode: color`, with no rim and only a glare, round and gone well inside the edge (`FUR_SHEEN`), at 0.6 (the glass's sheen has a dark band and a bright edge at the body path, and its glare reaches the path at the upper left: over the pile each drew a pale line inside the coat, where the path ends and the fur goes on). The rainbow reaches half the pile's reach past the outline (`PILE_TINT` in `src/ultra.ts`), so the pile there is rainbow too; the tips of the few longest hairs, past that, stay lavender. (A wider reach also tints the page between the hairs, which showed as a bright band on a light page.) Over the spinner's fur it reaches nowhere past the outline: its gap closes to nothing, and the reach would lay a tinted band over the page there, so the edges of the spinner's pile stay lavender. The coat is painted again only while the power comes or goes, never for the bands or the float. Nothing between the skin and the coat's canvas may isolate the blend: `mount` takes the glow's filter off while a coat shows, and in React the second svg takes no filter, no opacity under 1 and no transform. While a coat fades (into a loading figure and out of one), the blended rainbow and the flat skin (glass, rim and sheen) cross-fade as the fur and the flat body do (`furShown`); wherever no coat can be painted, the skin is the flat one.
- **The halo and the twinkles** are the drawing's effects (`ultra` in the table above), painted with the skin's own gradients (`skinPaint`): five twinkles at fixed places round the outline, each in the rainbow's colour where it sits, with a white core. The star and the cores are white, so on a light page they barely show.
- **Reduced motion.** The still is powered: the bands where the study froze them, the sheen, the rim, the halo, and one twinkle lit, up and to the left (at 128 px and up two more show, faintly, at about a sixth). No star, no float, nothing ticks.
- **Small sizes.** No rule of its own. Under 48 px it is drawn at most 30 times a second like any other, the rim keeps a line about 1 px wide, and a twinkle whose rays would be under 1.5 px is not drawn: at 22 px it reads as a rainbow marble with a halo.
- **Stills.** `drawAvatar` on a powered state gives `Drawing.ultra`. `skinMarkup(drawing, id, size)` is the skin as SVG markup with no DOM, to put right after the body path; fill the eyes with `eyeInk(eyeFill, drawing.ultra.amount)` and paint the effects with `skinPaint(id)`. `mount` and the hook write the same skin through `paintSkin`, so a still and a live avatar cannot drift apart. Ids must be unique on the page (`ultraId()`).

What it costs, measured in headless Edge on one desktop PC (an NVIDIA GTX 1060): main-thread time a frame in the shared loop, at 96 px, idle (not following the pointer), the mean of about 240 frames, lowest and highest of five runs (it swings with load; the frames kept to 57 to 60 a second):

| | one, not powered | one, powered | six, not powered | six, powered |
|---|---|---|---|---|
| flat | 0.3 to 0.5 ms | 0.7 to 1.4 ms | 0.8 to 1.6 ms | 2.2 to 3.9 ms |
| fluffy | 0.5 to 0.7 ms | 0.9 to 1.7 ms | 1.8 to 2.4 ms | 4.2 to 6.9 ms |

A powered avatar is drawn on every frame (an idle one is drawn on about two frames in three), and each drawing has more in it: the halo, the twinkles and the skin's two paths. The coats were painted as often powered as not, about 20 times a second each (for the idle life's glances): with the power all the way on, the bands and the float paint no fur. The GPU's time and the browser's compositing (the blend over the fur among them) are not in these numbers. Each powered avatar adds its own; a page that powers many at once pays for each.

## What stays rig machinery, and why

Only the moves that are a curve over a fixed time are clips: spin, nod and hop (the pokes), pop (`emphasis`), the blink, the waiting nod, the eyes going to dots in a change of shape, and the cues. The rest stays in `rig.ts`:

| behaviour | why it stays in the rig |
|---|---|
| rest / awake / home | exact-equality pose rules that `resting` relies on |
| tracking look | spring inputs; the length-1 cut along its direction, no per-axis clamp |
| idle drift | a random scheduler that writes aim targets before the springs |
| thinking, working | aims before the springs, random per cycle, the squash knock |
| waiting rock, speaking, breath | gated by springs and clocks the rig owns; speaking's syllables are random |
| shape morph and dots | impulses into lasting wobbles, a captured dot, the blink restart |
| loading figures | a state machine with an aim override and the blink restart |
| face easing, mirror flip | one-way blends written to `state.face` and `state.flip` |
| scheduling of the blink and the waiting nod | random timing (a double blink now and then); only their curves are clips |
| a face's manner and habits | blended with the face, gated by being alive and awake, timed by the face's energy |
| the wander, the lean, a hover | on the breath's clock and gates the rig owns; the wander hands itself to the springs on a look |
| sleep, the mark, a visit | springs, clocks and a body to go back to that the rig owns |

Moving these would need a kind of loop with access to the springs and the random numbers. That is more code and more risk for no new move.

## Deliberate choices

These look like mistakes and are not. Do not undo them.

- **The near eye is drawn wider as the body turns** (`NEAR_WIDE` in `draw.ts`). This is not physics. A turn alone narrows both eyes, because the near one is on a face that is leaning away too. So the near eye is widened, on its outer side only.
- **A look is 1 long at most, whichever way it points.** `Rig.look` cuts a longer one back along its own direction, and `lookFor` eases the pointer's distance, not each axis. So there is no corner look, all the way across and all the way up at once. That is where far eyes were lost. Do not bring a per-axis clamp back.
- **The blob's nose is left out of its outline** (`Body.outline`). The nose carries the eyes and gives them a rounder face to turn on. Only the ball is drawn, so the blob is a circle from every side, spin included. The pebble does the same.

## The demo page and GitHub Pages

`site/` is a static page built with esbuild into `_site/`: `index.html`, `style.css`, one classic script, a favicon the engine draws, and `prompt.md`, the design prompt, which a short prompt in an agent app's link points at. The studio's plain parts (reading a model's reply, share links, prompts, agent links, the still to download) are in `site/studio.ts`, tested by `site/studio.test.mjs`. The studio's Finish switch (Flat, Fluffy) is kept in the browser and carried in a share link as `?material=fluffy`; with fur on, Export offers a PNG of the stage as it is, and the SVG stays flat. Every path in it is relative, so it works at a domain's root, under `/blot-avatar/`, and opened from disk.

`.github/workflows/pages.yml` checks, builds and publishes it on every push to `main`, but only while the repository is public: a Pages site is public even when its repository is private, and on a free account GitHub does not serve Pages from a private repository at all. While the repository is private the workflow skips itself. When it is made public, turn Pages on (Settings, Pages, Source: GitHub Actions) and the next push publishes it.

## Licence

MIT, see `LICENSE`. Where the bodies' proportions came from is in `THIRD_PARTY_NOTICES.md`.

## Dot studio

Build with `npm run site` and open `_site/dots.html` to try the eleven picker shapes, the six-lobed flower, eight starter portraits and the 108 named renderer entries. The studio has independent eye, glasses, extra, colour and finish controls, plus playback for 41 idle and 13 thinking motions. The measured dimensions and customizations are in the [survey](docs/dot-survey.md). The [visual parity report](docs/dot-parity.md) gives per-case scores and reproduction commands.

`DOT_PICKER_SHAPES` follows the editor. `DOT_SHAPES` also contains the flower. Use `dotAvatar(DOT_CATALOG.find(item => item.id === id).appearance)` to select a named character. `curatedDot(42n)` selects Rio using the studio’s version 14 seed mapping. Pass its `appearance` to `dotAvatar` to render the selection. Editing a recipe releases its fixed portrait rig and applies the builder controls. The optional `depth` setting runs from 0 to 1 on builder and matte catalog characters, with a default of 0.5. It changes body thickness, including the depth of mounted eyes and accessories. Fixed fur portraits retain their original depth.

```ts
import { dotAvatar, mount } from '@blot/avatar';

const avatar = mount(host, {
  ...dotAvatar({
    shape: 'dot-rounded-triangle', colour: '#00B1FF', texture: 'Fur',
    eyes: 'Sleepy lids', extra: 'Crown', extraColour: '#FFCC38',
  }),
  size: 144, follow: true,
});
```

The same options supply `shape`, `body` and `material` to the React hook. Attach its layer groups to display the styled face and accessories and pass the chosen body colour in `fxPaint.fill` for glossy or furry finishes. Low-level drawing consumers should paint `Drawing.layers` in order.
