// Contact sheets of the fluffy coat beside the flat body, drawn by headless Edge: bodies, sizes, colours and
// states, on a light and a dark page, at 1x and 2x. Also checks mount()'s DOM with a coat, collects the console
// (where WebGL reports its errors), and times the coat: each body's mesh, the first coat, and the frame loop with
// 1 and 6 live avatars of 96 px following a moving pointer.
//   node scripts/coat-sheet.mjs [out-dir]        (default: coat-sheets in the system's temp folder)
// Needs Microsoft Edge, and playwright-core, which is not a dependency of this package: install it, or point
// PLAYWRIGHT_CORE at a copy (its folder). The page is scripts/coat-sheet-page.ts.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'coat-sheets'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HTML = `<!doctype html><meta charset="utf-8"><title>coat sheet</title>
<style>
body { margin: 0; font: 12px/1.3 system-ui, sans-serif; }
body.light { background: #F4F2EE; color: #555; }
body.dark { background: #141414; color: #999; }
#sheet { display: inline-block; padding: 12px 16px; }
.row { display: flex; align-items: flex-end; gap: 4px; margin: 2px 0; }
.title { width: 92px; flex: none; align-self: center; }
.cell { display: flex; flex-direction: column; align-items: center; }
.two { display: flex; align-items: center; }
.slot { position: relative; flex: none; }
.label { font-size: 11px; margin-top: -6px; white-space: nowrap; }
#live { display: flex; flex-wrap: wrap; gap: 48px; padding: 48px; }
.live, #mount { position: relative; }
</style>
<div id="sheet"></div><div id="mount"></div><div id="live"></div>
<script src="coat-sheet.js"></script>
`;

/** The sheets to draw: name, dark page, device pixel ratio. */
const SHEETS = [
  ['sizes', false, 1], ['colours', false, 1], ['colours', true, 1], ['bodies', false, 1], ['bodies', true, 1],
  ['states', false, 1], ['outline', false, 1], ['small', false, 1], ['small', true, 1],
  ['small', false, 2], ['small', true, 2], ['bodies', true, 2], ['states', false, 2],
];

await mkdir(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'scripts', 'coat-sheet-page.ts')],
  outfile: path.join(out, 'coat-sheet.js'),
  bundle: true, format: 'iife', target: 'es2022', logLevel: 'warning',
});
const page = path.join(out, 'coat-sheet.html');
await writeFile(page, HTML);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const consoleLines = [];
async function open(dpr, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: dpr, reducedMotion });
  const p = await context.newPage();
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await p.goto(pathToFileURL(page).href);
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
  for (const dpr of [1, 2]) {
    const { context, p } = await open(dpr);
    summary[`info@${dpr}x`] = await p.evaluate(() => window.info());
    for (const [name, dark, at] of SHEETS) {
      if (at !== dpr) continue;
      const t0 = Date.now();
      await p.evaluate(([n, d]) => window.sheet(n, d), [name, dark]);
      await p.waitForFunction(() => window.settled(), null, { timeout: 180000, polling: 100 });
      const file = path.join(out, `${name}-${dark ? 'dark' : 'light'}${dpr === 2 ? '@2x' : ''}.png`);
      await p.locator('#sheet').screenshot({ path: file });
      const entry = { file, coatsShowing: await p.evaluate(() => window.showing()), ms: Date.now() - t0 };
      if (name === 'small' && dpr === 1) entry.magnified = await magnify(context, file, 3);
      summary.sheets.push(entry);
    }
    if (dpr === 1) {
      summary.mount = await p.evaluate(() => window.mountCheck());
      summary.atRest = await p.evaluate(() => window.stillCheck());
      summary.contextLoss = await p.evaluate(() => window.loseCheck());
    }
    await context.close();
  }
  {
    const { context, p } = await open(1, 'reduce');
    summary.reducedMotion = await p.evaluate(() => window.stillCheck());
    await context.close();
  }
  // Timings on a fresh page: nothing built or drawn before them.
  const { context, p } = await open(1);
  summary.builds = await p.evaluate(() => window.builds());
  summary.frames = [];
  for (const [n, material, moving] of [[1, 'flat', true], [1, 'fluffy', true], [6, 'flat', true], [6, 'fluffy', true], [6, 'flat', false], [6, 'fluffy', false]]) {
    summary.frames.push(await p.evaluate(([k, m, v]) => window.frames(k, m, 4000, v), [n, material, moving]));
  }
  await context.close();
} finally {
  await browser.close();
}
await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
