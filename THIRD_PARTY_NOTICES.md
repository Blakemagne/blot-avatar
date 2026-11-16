# Third-party notices

This package is MIT-licensed (see `LICENSE`). It has no runtime dependency. Its development tools (TypeScript, tsx, esbuild, React and its types) are covered by their own licences, included in their packages.

## bot-hq

This package was written for blot, which began as a fork of bot-hq by Nick Vasilescu (MIT). That copyright notice is kept in `LICENSE`, as the MIT license requires.

Before this engine, blot drew each avatar as one flat SVG silhouette with two eye holes, from the bot-hq design export. The engine replaced them on 14 November 2026 and none of that artwork is in this package. The bodies were sized to the bounding boxes of those silhouettes, so that each shape kept its proportions: the measured boxes are the numbers in `src/engine/bodies/flat.mjs`, which the tests hold each body to. Artwork that originated in third-party apps remains the property of its owners; the MIT license does not grant rights to it. Inclusion does not imply affiliation or endorsement.
