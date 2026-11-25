// Contact sheets of the loading figures on mount()'s own avatars, drawn by headless Edge: each figure at frames of
// its motion at 240, 96 and 36 px, the way in and the way out, the progress ring at 0, 0.3, 0.7 and 1, the flat
// figure's outline stroked over its fur, other colours and powered; flat and fluffy, orange and black, on a light
// and a dark page. The page runs its own clock, so every sheet is the same on every run. Also checks a lost
// context during a figure and a long frame across one's flat middle, times the frame loop with 1 and 6 avatars of 96 px (each figure, flat and fluffy, against
// a fluffy idle one), and watches when each figure's mesh is made on a fresh page.
//   node scripts/forms-sheet.mjs [out-dir] [what]   (out-dir: forms-sheets in the system's temp folder; what: a
//   comma list of sheet names, 'facts', 'frames' and 'warm', to do only those; unset, all of them)
// Needs Microsoft Edge, and playwright-core, which is not a dependency of this package: install it, or point
// PLAYWRIGHT_CORE at a copy (its folder). The page is scripts/forms-sheet-page.ts.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'forms-sheets'));
const only = process.argv[3]?.split(',');
const wanted = (name) => !only || only.includes(name);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HTML = `<!doctype html><meta charset="utf-8"><title>forms sheet</title>
<style>
body { margin: 0; font: 12px/1.3 system-ui, sans-serif; }
body.light { background: #F4F2EE; color: #555; }
body.dark { background: #141414; color: #999; }
#sheet { display: inline-block; padding: 12px 16px; }
.row { display: flex; align-items: flex-end; margin: 0 0 4px; }
.title { width: 150px; flex: none; align-self: center; }
.cell { display: flex; flex-direction: column; align-items: center; min-width: 84px; }
.label { font-size: 11px; white-space: nowrap; }
.outline svg:last-of-type > path:first-of-type { stroke: #00E5FF; stroke-width: 1px; vector-effect: non-scaling-stroke; }
#live { display: flex; flex-wrap: wrap; gap: 48px; padding: 48px; }
.live { position: relative; }
</style>
<div id="sheet"></div><div id="live"></div>
<script src="forms-sheet.js"></script>
`;

const FORMS = ['orbit', 'radar', 'progress', 'ring', 'dots'];
/** The sheets to draw, each on a light and a dark page: name, device pixel ratio, magnified copy. */
const SHEETS = [
  ...FORMS.map((f) => [`form-${f}-240`, 1]),
  ['moving-96', 1], ['moving-36', 1, 3], ['way-in', 1], ['way-out', 1], ['progress', 1], ['outline', 1], ['outline', 2], ['colours', 1],
];

await mkdir(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'scripts', 'forms-sheet-page.ts')],
  outfile: path.join(out, 'forms-sheet.js'),
  bundle: true, format: 'iife', target: 'es2022', logLevel: 'warning',
});
const page = path.join(out, 'forms-sheet.html');
await writeFile(page, HTML);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const consoleLines = [];
async function open(dpr, hash = '') {
  const context = await browser.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: dpr });
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
  for (const [name, dpr, factor] of SHEETS) {
    if (!wanted(name)) continue;
    for (const dark of [false, true]) {
      const { context, p } = await open(dpr);
      const t0 = Date.now();
      const drawn = await p.evaluate(([n, d]) => window.sheet(n, d), [name, dark]);
      const file = path.join(out, `${name}-${dark ? 'dark' : 'light'}${dpr === 2 ? '@2x' : ''}.png`);
      await p.locator('#sheet').screenshot({ path: file });
      const entry = { file, ...drawn, ms: Date.now() - t0 };
      if (factor) entry.magnified = await magnify(context, file, factor);
      summary.sheets.push(entry);
      await context.close();
    }
  }
  if (wanted('facts')) {
    const { context, p } = await open(1);
    summary.contextLoss = await p.evaluate(() => window.loseCheck());
    await context.close();
    summary.longFrame = [];
    for (const f of FORMS) {
      const { context: c, p: q } = await open(1);
      summary.longFrame.push(await q.evaluate((ff) => window.longFrameCheck(ff), f));
      await c.close();
    }
  }
  // Timings on a fresh page each, on the browser's own frames.
  if (wanted('frames')) {
    summary.frames = [];
    for (const n of [1, 6]) {
      const { context, p } = await open(1, '#time');
      // Every mesh made first, so that no frame below makes one.
      for (const f of FORMS) await p.evaluate(([k, m, ff]) => window.frames(k, m, ff, 600), [1, 'fluffy', f]);
      const runs = [['fluffy', null], ...FORMS.flatMap((f) => [['flat', f], ['fluffy', f]]), ['flat', 'progress', true], ['fluffy', 'progress', true]];
      for (const [material, form, filling] of runs) summary.frames.push(await p.evaluate(([k, m, f, fill]) => window.frames(k, m, f, 2500, fill), [n, material, form, !!filling]));
      await context.close();
    }
  }
  if (wanted('warm')) {
    summary.warm = [];
    for (const f of FORMS) {
      const { context, p } = await open(1, '#time');
      summary.warm.push(await p.evaluate((ff) => window.warmCheck(ff), f));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
