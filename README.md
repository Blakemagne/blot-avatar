# @blot/avatar

The avatar of blot's Bots, as a package anyone can use. The demo page in `site/` shows every body, every move and a playground: `npm run site:dev`, or [blakemagne.github.io/blot-avatar](https://blakemagne.github.io/blot-avatar/) once GitHub Pages is on.

A body is a real 3D shape made of a few rounded solids. The eyes are patches of its surface, so they lean, thin and go round the edge with it. The package turns a body, a pose and a face into three SVG path strings: the body and two eyes. Beside them it draws effects (a mark, a "!", sleep's Zs, sparks, rings that pass behind the body, a hop's shadow) as more paths, behind the body or in front.

It is pure TypeScript with no dependency. The engine has no DOM and runs the same in node and in a browser. React is an optional peer, needed only for `@blot/avatar/react`. There is no build step: the package is source, and whoever uses it compiles it (Vite, esbuild, tsx). A project that type-checks it needs `lib` ES2022 or later and `moduleResolution: "bundler"`, as in this package's own `tsconfig.json`; your compiler flags apply to it too.

```
npm install github:Blakemagne/blot-avatar
```

```
src/engine/       the engine: bodies, eyes, faces and their manners, the rig, the clips, the effects (no DOM)
src/engine/bodies one file per body, and the list of them
src/ticker.ts     the one frame loop every live avatar shares
src/live.ts       createLive: one live avatar, no framework
src/react.ts      useLiveAvatar: the same, as a React hook
src/mount.ts      mount: the same, on any page
src/still.ts      the still pictures and the svg box
src/paint.ts      painting the effects into an svg (mount and the React hook)
golden/           frozen hashes of every frame the rig draws
site/             the demo page (built into _site/ for GitHub Pages)
scripts/          the demo page's build
```

## Prove a change

| Command | What it proves |
|---|---|
| `npm run typecheck` | the package and the demo page compile |
| `npm test` | the engine, the clips, the ticker, live and mount |
| `npm run golden` | the rig draws every existing behaviour exactly as before, bit for bit (about 80 s, so not part of `npm test`) |
| `npm run site:dev` | the demo page on http://localhost:5300, rebuilt as you edit: judge a move or a shape by eye |
| `npm run site` | the demo page built into `_site/`, a static folder GitHub Pages serves as it is |

Node 22 or later.

The golden check drives the rig through every behaviour, frame by frame, and hashes two things: every drawn path, and every number the rig's change test reads, at full precision. Both hashes are frozen in `golden/frames.sha256` (first on the engine before it became this package; again on 18 November 2026, when faces gained their manners, the blink and the idle life changed, and runs for the new moves, sleep, the mark, a visit and personality were added). Run it after any change to `rig.ts`, `clips.ts` or a curve the rig uses. A new cue does not change it, because a cue that is not playing does no arithmetic. If you mean to change an existing move, the hashes change too: freeze the new ones in the same change and say why.

Tests and the eye judge different things. A test says a move starts and ends at nothing, or never hides an eye. Only looking says it reads as a shake at 22 px. Do both.

## Add an animation

A move is a **clip**: a curve over a fixed time that adds to the pose (or scales it) and ends where it began. The rig adds up the playing clips into one set of `Channels` each frame.

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
  fx: Fx[];                                   // the effects showing this frame (start empty): push yours
}
interface View { readonly yaw: number; readonly room: number; readonly feel?: Personality }   // the body's turn, the room a look has left, what it is like to move
interface Playing { clip: Clip; at: number; u: number; ms: number; cue: { dir: number; amount: number; from: number } }
interface Clip { lane: 'poke' | 'cue' | ...; ms: number; apply(o: Channels, p: Playing, v: View): void }
```

There are two lanes anyone may use. A **poke** is what a click on the avatar plays: one at a time, in turn. A **cue** is a move played by name with `play(name)`. Each cue has a slot of its own, so cues overlap. A cue that is playing plays on when it is played again: started over, it would jump back to its start.

### Worked example: the tilt

The tilt is a cue: the head leans over ("hm?"), holds, and comes back.

1. **Add its numbers** to `src/engine/clips.ts`, next to the others:

   ```ts
   /** A tilt of the head, "hm?": how long, start to back, and how far it leans. */
   export const TILT_MS = 1100, TILT_ROLL = deg(10);
   ```

2. **Add the clip** at the end of `CLIPS`, and its name at the end of the type written on `CLIPS` (`readonly tilt: Clip;`). Never in the middle, and never move a key: the pokes play in key order and the golden frames depend on it.

   ```ts
   tilt: {
     lane: 'cue', ms: TILT_MS,
     apply(o, p, v) {
       const u = p.u, d = p.cue.dir, a = p.cue.amount;
       const k = a * track([0, 0, 0.2, 1.12, 0.36, 1, 0.7, 1, 1, 0], u);   // the body: lean, settle, hold, back
       const e = a * track([0, 0, 0.14, 1, 0.64, 1, 0.94, 0], u);           // the eyes: a beat ahead both ways
       o.roll += d * TILT_ROLL * k;
       o.eyeY += 0.18 * e;
       o.eyeX += d * 0.12 * v.room * e;
     },
   },
   ```

   `u` runs from 0 to just under 1. `track([u0, v0, u1, v1, ...], u)` eases between the points. `p.cue.dir` is +1 or -1 and `p.cue.amount` is 0 to 2 (1 by default).

3. **Keep the rules.** The tests check each of them for every cue:
   - Write only with `+=` and `*=`. Another move may already be in that channel.
   - Start and end at nothing: identity at u = 0 and as u comes to 1.
   - No randomness. A clip reads only `p` and `v`.
   - Scale any yaw by `v.room`. A ball held at a full look has no turn left, and more would lose its far eye.
   - Move smoothly from frame to frame.
   - Push an effect only while it plays (0 < u < 1) and only at an amount over 0.
   - Read what the avatar is like to move through `v.feel` (`give(f)` for a stretch, `high(f)` for a height): at 0.5 everything is exactly as before.

4. **It is listed by itself.** `CUES` is every clip in lane 'cue', in key order, so the new cue is in `CUES`, `play('tilt')` works, and the demo page gets a button and a card for it.

5. **Test it** in `src/engine/clips.test.mjs`. Add the name to the pinned order and to `CUES`. The tests that loop over `CUES` then check the rules above. Add a test of what the move must read as (the tilt holds near 10 degrees for a third of a second, one way only).

6. **Judge it by eye.** Run `npm run site:dev` and play it in the playground at 240, 36 and 22 px, on a few bodies. Give it a line in `SAYS` in `site/main.ts` so its card says what it reads as.

7. **Run** `npm test` and `npm run golden`. Golden must still pass.

### Add one from outside the package

A page that uses the package can bring its own clips without editing it. Every entry point takes `clips`:

```ts
import { Rig, createLive, mount, type Clip } from '@blot/avatar';

const wave: Clip = {
  lane: 'cue', ms: 900,
  apply(o, p) { o.roll += p.cue.dir * p.cue.amount * 0.12 * Math.sin(3 * Math.PI * p.u) * (1 - p.u); },
};

new Rig({ clips: { wave } }).play('wave');
createLive({ shape: 'blob', size: 72, clips: { wave } }).play('wave');
mount(el, { shape: 'blob', size: 72, clips: { wave } }).play('wave', { dir: -1 });
```

The rig checks extra clips with `checkClips` when it is built. It throws for a name the rig already has, a lane other than 'poke' or 'cue', a time that is not a finite number over 0, or a clip with no `apply`. An extra poke joins the turn of pokes after the rig's own.

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
- `setMark(true)`: a dot on the outline, up and to the right, with a sonar ring, which the eyes glance at now and then. It means something is waiting for whoever is watching. A resting avatar with a mark keeps ticking.
- `visit(body, stay)`: go to another shape for a moment and come back. A `setBody` meanwhile ends the visit.
- Left alone, the eyes wander a little and the head goes with them, on the breath's clock, so an idle avatar is redrawn no more often. Watching the pointer, the wander stops (what it had wandered to is handed to the springs, so nothing jumps) and the body leans toward the pointer, more while it moves.

## Effects

An effect is data: `{ kind, u, t, dir, amount }` (`fx.ts`). The rig and the clips push the ones that show into `Channels.fx`; `drawAvatar` places them against the body's outline for that frame and returns them as `effects: { layer, role, opacity, d }[]`. Paint each part in its role's colour: `body`, `eye`, `accent` (the renderer's accent colour, the body's colour if it has none) or `shadow`. `back` parts go before the body path, `front` parts after the eyes. `paintEffects(back, front, drawing, paint)` does it for an svg; `glowFilter` gives the CSS filter for `drawing.glow`.

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

5. **Look at it.** `npm run site:dev`: it is in the gallery and the playground's shapes by itself. Turn it with the pointer all the way round, poke it, and watch the far eye.

### Antennas, two-size eyes and decals

A body may also carry (all optional, and a body without them draws exactly as before):

- `eyes.sizes: [left, right]`: each eye's size as a multiple of `w` and `h`, for a face whose two eyes differ.
- `antennas`: two stalks, drawn as their own paths in their own colour and swung by the rig. Each is a stiff base and a whip that bends further (`follow`), so a swing has a follow-through. They sway a little when idle, lift and drop while thinking, draw in while working and flick when it speaks. Hold a pose with `rig.setAntennas(left, right, ms?)` (radians outward, eased over `ms` if given); a clip moves them through `o.antL` and `o.antR`.
- `eyes.fixed`: eyes that are fixed lenses, as a camera's are. They keep their shape whatever the face, never blink and do not slide to look.
- `decals`: flat marks on the surface, such as a lens's rim. Each is lifted onto the body as an eye is, so it leans and goes round the edge as the body turns. One with `eye: 'left' | 'right'` sits behind that eye and moves with it; one with `eye: 'both'` sits halfway between the eyes, and with `span: true` reaches from one to the other (a bar between two lenses).
- An antenna may have a `coil` (a spring wound round part of the stalk) and a `cap` at its tip.
- `paint`: the colours of the antennas and decals, by key. A page may paint any key over (`mount(..., { paint: { antenna: '#111' } })`).

Such a body's drawing has `layers`: paths to paint under the body (`front: false`) and over it, under the eyes.

To draw a body of your own with `mount()` or `useLiveAvatar`, pass it as `body`. `packages/jacrispy` (`@blot/jacrispy`) is a library built on these: one character's head and face for any shape, kept apart from this engine.

## The public API

From `@blot/avatar`:

- **Drawing.** `drawAvatar(body, colour, state, size)` gives `{ body, eyes: [left, right], effects?, glow? }`: three path strings in the box `VIEW_BOX`, and the effects as more. `effectShapes`, `paintEffects`, `glowFilter`, `FX_KINDS`. `BODIES`, `bodyFor(shape)`, `bodyOf(shape)` (the blob for an unknown id), `FACES`, `FACE_NAMES`, `colours(c)`, `portraitFor(shape)`, `stillState(shape, size)` and `svgBox(size)`.
- **The rig.** `new Rig({ seed, body, pose, rest, clips, personality })` moves a state. Call `step(dtMs)` each frame; it returns true when the picture changed. `look(x, y)`, `stop()`, `poke(kind?)`, `play(name, { dir, amount })`, `blink()`, `emphasis(amount)`, `setFace`, `setBody` (it morphs), `visit(body, stay)`, `setActivity(activity, form)`, `setMark`, `setPersonality`, `setLevel`, `setProgress`, `rest(pose)`, `mirror`, `pause`. `MANNERS`, `mannerFor`, `PERSONALITY`, `ACTIVITY_FACES`. `state` is what `drawAvatar` draws; `still` and `resting` say whether it needs a frame.
- **Clips.** `CLIPS`, `POKES`, `CUES`, `start`, `advance`, `checkClips`, `track`, `smooth`, `deg`, and the types `Clip`, `Channels`, `View`, `Cue`, `Playing`, `Lane`.
- **The frame loop.** `onFrame(tick)`, `onSeen(el, cb)`, `onMotion(cb)`, `reducedMotion()`, `pointer`, `watchPointer()`, `ticking()`.
- **A live avatar.** `createLive(props)` gives a `Live`: one rig, drawn from the shared loop into whatever you write it to. `lookFor`, `lookWithin`, `SMALL`, `LARGE`, `SMALL_LOOK`.
- **Any page.** `mount(host, options)` gives a `Mounted`: `update`, `poke`, `play`, `visit`, `destroy`. Options add `mark`, `personality` and `accent` (the effects' colour).

From `@blot/avatar/react`: `useLiveAvatar(props)` gives `{ host, paths, layers, fx, first, reduced, live }`. Put `host` on a span and the three `paths` on the svg's paths. For a body with antennas or decals, put `layers[0]` on an empty `<g>` before the body path and `layers[1]` on one after it. For the effects, put `fx[0]` on an empty `<g>` before everything and `fx[1]` on one after the eyes, and pass `fxPaint: { fill, eyeFill, accent }`. Give the svg `overflow: visible` (as `mount` does): a "!" and sleep's Zs reach above the drawing box.

### The frame loop's rules

- There is one frame loop for the page (`ticker.ts`). Nothing else in the package calls `requestAnimationFrame`. Do not give an avatar its own.
- An avatar is drawn only while it is on screen and the tab is showing.
- Under reduced motion nothing ticks. An avatar shows its still picture, wearing what it is doing (a thinking face, shut eyes asleep) or the face it was given, with its mark if it has one; `poke`, `play` and `visit` do nothing.
- An avatar at rest unsubscribes and costs nothing until something wakes it.
- One under 48 px (`SMALL`) is drawn at most 30 times a second.
- Only one of 64 px (`LARGE`) and up takes a full look. A small one turns at most `SMALL_LOOK` of the way. `mount()` leaves whether it can be poked to you (`pokeable`); blot makes only avatars of 64 px and up pokeable.

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

`follow: true` watches the pointer anywhere on the page. To keep it to a card or a panel, also pass `followIn: card`: the avatar then follows the pointer only while it is inside that element, its edges are a full look, and outside it the avatar looks ahead again.

`mount` makes the host a box of `size` px (and `position: relative` if it was static) and puts an svg in it that the drawing overflows. `destroy()` takes it all out again and puts the host's style back, and its own `role`, `tabindex` and `aria-label` if a pokeable avatar covered them. Mount into an element that is already in the document (its position is read from the page's CSS), and one avatar per element: a second `mount` on the same one throws until the first is destroyed.

Colours:
- `color` is `#rrggbb` or any CSS colour; the default is `#FD690F`. For a hex colour the eyes are dark on a light body and white on a dark one. For any other CSS colour they are white.
- `eyeFill` is the eyes' colour, any CSS colour, such as `'#FFD23F'`. Unset, the eyes are the white or dark one above. Mind the contrast: eyes close to the body's colour disappear.
- `fill` overrides the body's colour with any CSS value, such as `var(--ink)`.
- `BOT_COLOURS` is blot's own palette, `[hex, name]` in the order its Create New Bot picker shows them: black, brown, red, orange, yellow, green, cyan, blue, violet, magenta and gray. blot paints a black Bot in the theme's ink; on a page, pass `fill: 'var(--ink)'` and an `eyeFill` the other way round to do the same.

In React, use `useLiveAvatar` from `@blot/avatar/react`. The demo page has the whole component (put `host` on a span, `paths` on the three paths, and `first` as their first `d`).

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

`site/` is a static page built with esbuild into `_site/`: `index.html`, `style.css`, one classic script and a favicon the engine draws. Every path in it is relative, so it works at a domain's root, under `/blot-avatar/`, and opened from disk.

`.github/workflows/pages.yml` checks, builds and publishes it on every push to `main`, but only while the repository is public: a Pages site is public even when its repository is private, and on a free account GitHub does not serve Pages from a private repository at all. While the repository is private the workflow skips itself. When it is made public, turn Pages on (Settings, Pages, Source: GitHub Actions) and the next push publishes it.

## Licence

MIT, see `LICENSE`. Where the bodies' proportions came from is in `THIRD_PARTY_NOTICES.md`.
