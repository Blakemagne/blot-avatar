// The boxes of the flat avatars the bodies replaced, for the tests that hold each body to its old outline.
//
// Before the engine, every avatar in blot was one flat SVG path with two eye holes (see THIRD_PARTY_NOTICES.md
// for where that artwork came from). The artwork was removed from blot on 14 November 2026. These numbers were
// measured from those paths once, on that day, the way blot's tests used to measure them on every run:
//
//   lean     degrees: the slant of the line through the middles of the two eye holes (the flat avatars were
//            drawn leaning, the bodies stand upright);
//   leaning  [width, height] of the outline's box as it was drawn;
//   upright  [width, height] of its box once turned back by `lean`, so that the eyes are level.
//
// Sizes are in body units: 1 is half of the middle 36 of the 55.2 drawing box. Arcs were walked in sixteenths
// (the flat blob was four arcs).
export const FLAT = {
  blob: { lean: 25.1196, leaning: [1.84, 1.84], upright: [1.8381, 1.8381] },
  cloud: { lean: 15.4482, leaning: [1.9378, 1.6773], upright: [1.9899, 1.693] },
  clover: { lean: 15.4636, leaning: [1.89, 1.7896], upright: [1.7336, 1.7002] },
  flower: { lean: 15.4574, leaning: [1.9667, 1.9117], upright: [1.8613, 1.9886] },
  heart: { lean: 15.4845, leaning: [1.9119, 1.7326], upright: [1.9317, 1.689] },
  hex: { lean: 15.4642, leaning: [1.928, 1.8673], upright: [1.8124, 1.9523] },
  house: { lean: 15.4689, leaning: [1.9342, 1.8863], upright: [1.7823, 1.827] },
  sparkle: { lean: 15.4541, leaning: [2.2178, 2.2313], upright: [2.19, 2.2242] },
  square: { lean: 15.4581, leaning: [2.0001, 1.8272], upright: [1.7503, 1.6273] },
  star: { lean: 15.4648, leaning: [2.1864, 2.1073], upright: [2.0371, 2.2189] },
  tablet: { lean: 15.4765, leaning: [2.0235, 1.5763], upright: [2.0467, 1.4061] },
  teardrop: { lean: 15.5539, leaning: [1.7268, 1.9273], upright: [1.7255, 2.0029] },
  wedge: { lean: 15.3233, leaning: [1.9839, 2.0418], upright: [2.0916, 2.0015] },
  pebble: { lean: 15.2392, leaning: [1.8648, 1.7598], upright: [1.8879, 1.7356] },
};

/** The flat drawing of a shape: its lean in radians, and its box as drawn and stood upright. */
export function flat(id) {
  const { lean, leaning, upright } = FLAT[id];
  return { lean: (lean * Math.PI) / 180, leaning: { w: leaning[0], h: leaning[1] }, upright: { w: upright[0], h: upright[1] } };
}
