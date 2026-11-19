// @blot/avatar/moves: write a move in plain words. A move is a list of lines, each a part of the avatar, a verb,
// how far, and the shape it takes over the move; `cue` and `poke` turn the list into a clip for `clips`.
//
//   import { cue, head, eyes, toward, wave } from '@blot/avatar/moves';
//
//   const waggle = cue(900, [
//     head.lean(toward, 7).along(wave(1.5).dwindling()),
//     eyes.glance(toward, 0.15).along(wave(1.5).dwindling()),
//   ]);
//
//   mount(el, { shape: 'heart', size: 96, clips: { waggle } }).play('waggle');

export {
  Line, Shape, antennas, away, beats, body, byHand, cue, exclamation, eyes, flight, head, hold, hump, orbits, peak, poke,
  pulse, snapBack, sparks, sparksAllRound, speedLines, surge, toward, wave, wobble,
  type MoveOptions, type Side,
} from './engine/moves';
