// Build the demo page into _site/: a static folder GitHub Pages can serve as it is, and that also opens from
// disk (one classic script, every path relative, so it works under /blot-avatar/ as well as at a root).
//   npm run site            build once
//   npm run site:dev        build, rebuild on change, and serve on http://localhost:5300
// Run through tsx (the npm scripts do), because the favicon and the studio's gallery thumbnails are drawn by the
// engine itself. site:dev draws them once, at start: restart it to see an engine or gallery change in them.

import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { BODIES, GALLERY, colours, drawAvatar, outlineBody, stillState, VIEW_BOX } from '../src/index.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, 'site');
const out = path.join(root, '_site');
const serve = process.argv.includes('--serve');
const PORT = 5300;

/** How much room the favicon leaves round the body, as a share of its width. */
const ICON_MARGIN = 0.02;

/**
 * The favicon: the blob in its portrait pose, drawn by the engine, as a plain SVG file. Its view is cut to the
 * body (a live avatar's box leaves room for moves and effects; a tab's icon needs none), so the blob fills it.
 */
function icon() {
  const d = drawAvatar(BODIES.blob, '#FD690F', stillState('blob', 64), 64), c = colours('#FD690F');
  const xy = (d.body.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i]); x1 = Math.max(x1, xy[i]); y0 = Math.min(y0, xy[i + 1]); y1 = Math.max(y1, xy[i + 1]);
  }
  // A square round the body's middle, as wide as its longer side and a little more.
  const side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * ICON_MARGIN), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const box = xy.length ? [cx - side / 2, cy - side / 2, side, side].map((v) => Math.round(v * 100) / 100).join(' ') : VIEW_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><path d="${d.body}" fill="${c.fill}"/><path d="${d.eyes[0]}" fill="${c.eyeFill}"/><path d="${d.eyes[1]}" fill="${c.eyeFill}"/></svg>\n`;
}

/**
 * The studio's pictures of the gallery avatars, drawn here once: making a body from an outline takes a tenth of a
 * second or more, too long to do 23 times as the page opens. The page draws the bodies themselves when one is
 * picked (or the pointer comes to it).
 */
function thumbs() {
  const out = {};
  for (const { definition: def } of GALLERY) {
    const d = drawAvatar(outlineBody(def), '#000000', stillState(def, THUMB), THUMB);
    out[def.id] = [d.body, d.eyes[0], d.eyes[1]];
  }
  return out;
}
/** The size the thumbnails are drawn for. */
const THUMB = 56;

const options = {
  entryPoints: [path.join(site, 'main.ts')],
  outfile: path.join(out, 'app.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'warning',
  loader: { '.md': 'text' },
  define: { __THUMBS__: JSON.stringify(thumbs()), __THUMB__: String(THUMB) },
};

async function statics() {
  await mkdir(out, { recursive: true });
  await copyFile(path.join(site, 'index.html'), path.join(out, 'index.html'));
  await copyFile(path.join(site, 'style.css'), path.join(out, 'style.css'));
  // The design prompt, for a short prompt in an agent app's link to point at.
  await copyFile(path.join(site, 'prompt.md'), path.join(out, 'prompt.md'));
  await writeFile(path.join(out, 'icon.svg'), icon());
  // Pages runs Jekyll on a plain folder unless told not to; nothing here needs it.
  await writeFile(path.join(out, '.nojekyll'), '');
}

await rm(out, { recursive: true, force: true });
await statics();

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  watch(site, (_, file) => { if (file && !file.endsWith('.ts')) statics().catch((e) => console.error(e)); });
  const { port } = await ctx.serve({ servedir: out, port: PORT, host: '127.0.0.1' });
  console.log(`demo on http://localhost:${port}`);
} else {
  await esbuild.build(options);
  console.log(`built ${path.relative(root, out)}/`);
}
