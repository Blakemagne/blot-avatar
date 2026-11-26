// Run with node --import tsx. PLAYWRIGHT_CORE and CHROMIUM can point to local installations.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { catalog, cases, floors, turns } from './dot-cases.mjs';

const [directory, ...names] = process.argv.slice(2);
if (!directory) throw Error('Usage: dot-capture.mjs OUTPUT [case ...]. Use DOT_TURNS=1 for held-out rotations.');
const bundle = await build({ entryPoints: ['scripts/dot-capture-page.ts'], globalName: 'dotReview', format: 'iife', bundle: true, minify: true, write: false });
if (process.env.DOT_BUNDLE) await writeFile(process.env.DOT_BUNDLE, bundle.outputFiles[0].contents);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await page.setContent('<style>main{position:relative;margin:128px auto}</style><main></main>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await mkdir(directory, {recursive:true});
  const suite = process.env.DOT_GROUND ? floors : process.env.DOT_CATALOG ? { base: {}, ...catalog } : process.env.DOT_TURNS ? { base: {}, ...turns } : cases;
  for (const [name, spec] of Object.entries(suite)) {
    if (names.length && !names.includes(name)) continue;
    if (process.env.DOT_GROUND) {
      await page.evaluate(spec => dotReview.ground(spec), spec);
      await page.screenshot({ path: path.join(directory,name+'.png'), omitBackground: true });
      continue;
    }
    const png = await page.evaluate(([spec,pixels]) => window.dotReview.capture(spec,pixels), [spec,process.env.DOT_TURNS ? 384 : 512]);
    await writeFile(path.join(directory,name+'.png'), Buffer.from(png,'base64'));
  }
} finally { await browser.close(); }
