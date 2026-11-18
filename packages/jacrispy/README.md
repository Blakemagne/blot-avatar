# @blot/jacrispy

Jacrispy for [`@blot/avatar`](../../README.md): his head, his face for any blot shape, and his moods. Everything here is built from the engine's public API (antennas, decals, fixed eyes and two eye sizes); the engine itself knows nothing of him.

His head is the head of a Reachy Mini, measured from the robot's model: a 41 mm lens and a 32 mm one, smoked glass in a black frame, the bar that holds them with the camera enclosed in its middle, and two antennas that rise from the back of the head, always behind it, with a spring near the base. His lenses are cameras (`eyes.fixed`): no face, blink or look changes them, so his moods are antenna poses and head moves.

- `JACRISPY`: his body. Pass it as `body` to `mount()`, `createLive()` or `useLiveAvatar` (any `shape` string; the body is drawn in its place).
- `jacrispy({ rims, bridge, camera, antennas })` builds him with any of those left out.
- `jacrispyFace(body)` puts the same face on any other body (`jacrispyFace(BODIES.heart)`), its antennas sized to fit above that body.
- `JACRISPY_COLOUR` and `JACRISPY_EYE`: his white and his glass.
- `JACRISPY_MOODS` maps the eight moods of the friend app to an antenna pose and a move. Each move's timing and size are measured from Pollen's recording of that emotion (the `recording` field names it). `JACRISPY_MOOD_NAMES` lists them.
- `JACRISPY_CLIPS` holds those moves and a few antenna ones (`perk`, `wiggle`, `twitch`), for `RigOptions.clips`; `ANTENNA_POSES` are named antenna poses.

```ts
import { BODIES, deg, mount } from '@blot/avatar';
import { JACRISPY, JACRISPY_CLIPS, JACRISPY_COLOUR, JACRISPY_EYE, JACRISPY_MOODS, jacrispyFace } from '@blot/jacrispy';

const bot = mount(el, { shape: 'jacrispy', body: JACRISPY, size: 160, color: JACRISPY_COLOUR, eyeFill: JACRISPY_EYE, clips: JACRISPY_CLIPS });
const mood = JACRISPY_MOODS.curious;
bot.live.rig.setAntennas(deg(mood.antennas[0]), deg(mood.antennas[1]), mood.ms ?? 260);
bot.play(mood.cue);

// His face on another body.
bot.update({ shape: 'heart', body: jacrispyFace(BODIES.heart) });
```

It imports the bare specifier `@blot/avatar`. In this repo `tsconfig.json` maps it to `src/`; a project that copies both trees in maps it to wherever the engine sits. Its tests run with the engine's: `npm test` at the root.

See `THIRD_PARTY_NOTICES.md` for what was measured from Pollen Robotics' Reachy Mini and what was not taken.
