# Third-party notices

This package is MIT-licensed (see `LICENSE`). It has no runtime dependency. Its development tools (TypeScript, tsx, esbuild, React and its types) are covered by their own licences, included in their packages.

## bot-hq

This package was written for blot, which began as a fork of bot-hq by Nick Vasilescu (MIT). That copyright notice is kept in `LICENSE`, as the MIT license requires.

Before this engine, blot drew each avatar as one flat SVG silhouette with two eye holes, from the bot-hq design export. The engine replaced them on 14 November 2026 and none of that artwork is in this package. The bodies were sized to the bounding boxes of those silhouettes, so that each shape kept its proportions: the measured boxes are the numbers in `src/engine/bodies/flat.mjs`, which the tests hold each of those bodies to. The pentagon came later and was drawn here as a regular pentagon: it has no flat original and no entry there. Artwork that originated in third-party apps remains the property of its owners; the MIT license does not grant rights to it. Inclusion does not imply affiliation or endorsement.

## Reachy Mini (Pollen Robotics)

The `jacrispy` body (`src/engine/bodies/jacrispy.ts`) is shaped after the Reachy Mini robot by Pollen Robotics. Its proportions (the head's width, height and depth, where the two lenses and the antennas sit, the shape of the body) were measured from the Reachy Mini's published model and then changed into a chibi: a bigger head, shorter antennas. No geometry, mesh, image or other file from that model is in this package; the body is spheres written by hand. Pollen Robotics publishes the Reachy Mini's software under Apache 2.0 and its hardware design files under CC BY-NC-SA 4.0. Reachy and Reachy Mini are names of Pollen Robotics. This package is not affiliated with or endorsed by Pollen Robotics.
