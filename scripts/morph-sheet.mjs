// Contact sheets of changes of shape on mount()'s own avatars, drawn by headless Edge: blob to star, star to heart,
// heart to cloud, blob to house, a gallery pair (mug to lightbulb) and a powered blob to house, every 32 ms across
// the change at 240 px (fluffy) and 96 px (flat, fluffy, fluffy black), and a powered fluffy avatar close up at
// 640 px; on a light and a dark page. The page runs its own clock, so every sheet is the same on every run.
//   node scripts/morph-sheet.mjs [out-dir] [what]   (out-dir: morph-sheets in the system's temp folder; what: a
//   comma list of sheet names to do only those; unset, all of them)
// Needs Microsoft Edge, and playwright-core, which is not a dependency of this package: install it, or point
// PLAYWRIGHT_CORE at a copy (its folder). The page is scripts/morph-sheet-page.ts.

import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'morph-sheets'));
const only = process.argv[3]?.split(',');
const wanted = (name) => !only || only.includes(name);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const HTML = `<!doctype html><meta charset="utf-8"><title>morph sheet</title>
<style>
body { margin: 0; font: 12px/1.3 system-ui, sans-serif; }
body.light { background: #F4F2EE; color: #555; }
body.dark { background: #141414; color: #999; }
#sheet { display: inline-block; padding: 12px 16px; }
.row { display: flex; align-items: flex-end; margin: 0 0 4px; }
.title { width: 150px; flex: none; align-self: center; }
.cell { display: flex; flex-direction: column; align-items: center; }
.label { font-size: 11px; white-space: nowrap; }
</style>
<div id="sheet"></div>
<script src="morph-sheet.js"></script>
`;

const SHEETS = ['morph-240', 'morph-96', 'powered-close'];

await mkdir(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'scripts', 'morph-sheet-page.ts')],
  outfile: path.join(out, 'morph-sheet.js'),
  bundle: true, format: 'iife', target: 'es2022', logLevel: 'warning',
});
const page = path.join(out, 'morph-sheet.html');
await writeFile(page, HTML);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const consoleLines = [];
const summary = { out, sheets: [], console: consoleLines };
try {
  for (const name of SHEETS) {
    if (!wanted(name)) continue;
    for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 4400, height: 1200 }, deviceScaleFactor: 1 });
      const p = await context.newPage();
      p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') consoleLines.push(`${m.type()}: ${m.text()}`); });
      p.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
      await p.goto(pathToFileURL(page).href);
      const t0 = Date.now();
      const drawn = await p.evaluate(([n, d]) => window.sheet(n, d), [name, dark]);
      const file = path.join(out, `${name}-${dark ? 'dark' : 'light'}.png`);
      await p.locator('#sheet').screenshot({ path: file });
      summary.sheets.push({ file, ...drawn, ms: Date.now() - t0 });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.sheets.map(({ cells, ...rest }) => rest), null, 2));
console.log(JSON.stringify(consoleLines));
