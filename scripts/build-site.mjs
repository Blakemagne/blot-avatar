// Build the demo page into _site/: a static folder GitHub Pages can serve as it is, and that also opens from
// disk (one classic script, every path relative, so it works under /blot-avatar/ as well as at a root).
//   npm run site            build once
//   npm run site:dev        build, rebuild on change, and serve on http://localhost:5300
// Run through tsx (the npm scripts do), because the favicon is drawn by the engine itself. site:dev draws it once,
// at start: restart it to see an engine change in the favicon.

import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { BODIES, colours, drawAvatar, stillState, VIEW_BOX } from '../src/index.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, 'site');
const out = path.join(root, '_site');
const serve = process.argv.includes('--serve');
const PORT = 5300;

/** The favicon: the blob in its portrait pose, drawn by the engine, as a plain SVG file. */
function icon() {
  const d = drawAvatar(BODIES.blob, '#FD690F', stillState('blob', 64), 64), c = colours('#FD690F');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}"><path d="${d.body}" fill="${c.fill}"/><path d="${d.eyes[0]}" fill="${c.eyeFill}"/><path d="${d.eyes[1]}" fill="${c.eyeFill}"/></svg>\n`;
}

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
};

async function statics() {
  await mkdir(out, { recursive: true });
  await copyFile(path.join(site, 'index.html'), path.join(out, 'index.html'));
  await copyFile(path.join(site, 'style.css'), path.join(out, 'style.css'));
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
