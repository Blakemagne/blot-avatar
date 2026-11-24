// Contact sheets of ultracode on mount()'s own avatars, drawn by headless Edge: the pickup a frame every 80 ms,
// powered and idle, power down, bodies, sizes, a change of shape and reduced motion, flat and fluffy, orange and
// black, on a light and a dark page. The page runs its own clock, so every sheet is the same on every run. Also
// reads the DOM a powered avatar has, collects the console, and times the frame loop with 1 and 6 avatars of 96 px,
// powered and not.
//   node scripts/ultra-sheet.mjs [out-dir] [what]   (out-dir: ultra-sheets in the system's temp folder; what: a
//   comma list of sheet names, 'facts' and 'frames', to draw only those; unset, all of them)
// Needs Microsoft Edge, and playwright-core, which is not a dependency of this package: install it, or point
// PLAYWRIGHT_CORE at a copy (its folder). The page is scripts/ultra-sheet-page.ts.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'ultra-sheets'));
const only = process.argv[3]?.split(',');
const wanted = (name) => !only || only.includes(name);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HTML = `<!doctype html><meta charset="utf-8"><title>ultra sheet</title>
<style>
body { margin: 0; font: 12px/1.3 system-ui, sans-serif; }
body.light { background: #F4F2EE; color: #555; }
body.dark { background: #141414; color: #999; }
#sheet { display: inline-block; padding: 12px 16px; }
.row { display: flex; align-items: flex-end; margin: 0 0 6px; }
.title { width: 104px; flex: none; align-self: center; }
.cell { display: flex; flex-direction: column; align-items: center; }
.label { font-size: 11px; margin-top: -4px; white-space: nowrap; }
#live { display: flex; flex-wrap: wrap; gap: 48px; padding: 48px; }
.live { position: relative; }
</style>
<div id="sheet"></div><div id="live"></div>
<script src="ultra-sheet.js"></script>
`;

/** The sheets to draw: name, dark page, device pixel ratio, reduced motion. */
const SHEETS = [
  ['pickup', true, 1], ['pickup', false, 1], ['pickup-large', true, 1], ['pickup-large', false, 1],
  ['idle', true, 1], ['idle', false, 1], ['down', true, 1], ['down', false, 1],
  ['bodies', true, 1], ['bodies', false, 1], ['large', true, 1], ['large', false, 1],
  ['sizes', true, 1], ['sizes', false, 1], ['sizes', true, 2], ['sizes', false, 2],
  ['morph', true, 1], ['morph', false, 1],
  ['reduced', true, 1, true], ['reduced', false, 1, true],
];

await mkdir(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'scripts', 'ultra-sheet-page.ts')],
  outfile: path.join(out, 'ultra-sheet.js'),
  bundle: true, format: 'iife', target: 'es2022', logLevel: 'warning',
});
const page = path.join(out, 'ultra-sheet.html');
await writeFile(page, HTML);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const consoleLines = [];
async function open(dpr, reduced = false, hash = '') {
  const context = await browser.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await context.newPage();
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await p.goto(pathToFileURL(page).href + hash);
  return { context, p };
}

/** A copy of a PNG `factor` times as big, its pixels kept square, beside it. */
async function magnify(context, file, factor) {
  const p = await context.newPage();
  const data = (await readFile(file)).toString('base64');
  await p.setContent(`<body style="margin:0"><img id="i" src="data:image/png;base64,${data}" style="image-rendering:pixelated;display:block">`);
  await p.waitForFunction(() => document.getElementById('i').complete);
  await p.evaluate((f) => { const i = document.getElementById('i'); i.style.width = `${i.naturalWidth * f}px`; }, factor);
  const to = file.replace(/\.png$/, `-x${factor}.png`);
  await p.locator('#i').screenshot({ path: to });
  await p.close();
  return to;
}

const summary = { out, sheets: [], console: consoleLines };
try {
  for (const [name, dark, dpr, reduced] of SHEETS) {
    if (!wanted(name)) continue;
    const { context, p } = await open(dpr, reduced);
    const t0 = Date.now();
    const drawn = await p.evaluate(([n, d]) => window.sheet(n, d), [name, dark]);
    const file = path.join(out, `${name}-${dark ? 'dark' : 'light'}${dpr === 2 ? '@2x' : ''}.png`);
    await p.locator('#sheet').screenshot({ path: file });
    const entry = { file, ...drawn, ms: Date.now() - t0 };
    if (name === 'sizes' && dpr === 1) entry.magnified = await magnify(context, file, 2);
    summary.sheets.push(entry);
    await context.close();
  }
  if (wanted('facts')) {
    const { context, p } = await open(1);
    summary.facts = await p.evaluate(() => window.facts());
    await context.close();
  }
  // Timings on a fresh page, on the browser's own frames.
  if (wanted('frames')) {
    const { context, p } = await open(1, false, '#time');
    summary.frames = [];
    for (const [n, material, ultra] of [[1, 'flat', false], [1, 'flat', true], [1, 'fluffy', false], [1, 'fluffy', true], [6, 'flat', false], [6, 'flat', true], [6, 'fluffy', false], [6, 'fluffy', true]]) {
      summary.frames.push(await p.evaluate(([k, m, u]) => window.frames(k, m, u, 4000), [n, material, ultra]));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
