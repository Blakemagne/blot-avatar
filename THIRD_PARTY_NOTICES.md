# Third-party notices

This package is MIT-licensed (see `LICENSE`). It has no runtime dependency. Its development tools (TypeScript, tsx, esbuild, React and its types) are covered by their own licences, included in their packages.

## bot-hq

This package was written for blot, which began as a fork of bot-hq by Nick Vasilescu (MIT). That copyright notice is kept in `LICENSE`, as the MIT license requires.

Before this engine, blot drew each avatar as one flat SVG silhouette with two eye holes, from the bot-hq design export. The engine replaced them on 14 November 2026 and none of that artwork is in this package. The bodies were sized to the bounding boxes of those silhouettes, so that each shape kept its proportions: the measured boxes are the numbers in `src/engine/bodies/flat.mjs`, which the tests hold each of those bodies to. The pentagon came later and was drawn here as a regular pentagon: it has no flat original and no entry there. Artwork that originated in third-party apps remains the property of its owners; the MIT license does not grant rights to it. Inclusion does not imply affiliation or endorsement.

## open-bot-avatar

Avatar definitions (one SVG path in a 0 0 100 100 box and where the eyes sit), their rules, and the editor's way of making one (describe it, have a model write it, paste it in) come from open-bot-avatar by Dominik Scholz (https://github.com/DominikScholz/open-bot-avatar), MIT licensed:

> MIT License
>
> Copyright (c) 2026 Dominik Scholz
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

What is taken from it: the path parser and flattener (`src/engine/outline/path.ts`), the definition format and its validation rules (`src/engine/outline/definition.ts`), the 23 starter and gallery avatars (`src/gallery.ts`, their colours mapped onto blot's), the design prompt the studio copies (`site/prompt.md`, rewritten for this engine), and the studio's layout and flow on the demo page (`site/main.ts`, `site/studio.ts`: the stage with Export and Copy, the Bot tab, and making a new one by describing it and bringing back the reply, agent-app links, reading a model's reply, share links), written again without React. The volume is not taken: this engine makes a body of spheres from the outline (`src/engine/outline/inflate.ts`), where open-bot-avatar stacks cross-sections.
