import assert from 'node:assert/strict';
import { launchOptions } from './review-browser.mjs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const bundle = await build({ entryPoints: ['scripts/wardrobe-power-page.ts'], globalName: 'review', bundle: true,
  format: 'iife', minify: true, write: false });
const browser = await chromium.launch(launchOptions);
const selected = process.argv[2];
const run = suite => !selected || selected === '--' + suite + '-only';
try {
  if (run('fallback')) {
    const svg = await browser.newPage({ reducedMotion: 'reduce' });
    await svg.setContent('<main></main>');
    await svg.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind,...args) {
        return kind === 'webgl2' ? null : original.call(this,kind,...args);
      };
    });
    await svg.addScriptTag({content: bundle.outputFiles[0].text});
    const fallback = await svg.evaluate(() => review.checkFallback());
    assert.deepEqual(fallback.errors,[]);
    console.log(`${fallback.count} powered SVG fallbacks`);
    await svg.close();
  }
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const count = await page.evaluate(() => review.count);
  let cases = 0, pixels = 0, changed = 0;
  for (let index = 0; run('power') && index < count; index++) {
    for (const material of ['flat','glossy','fluffy']) {
      const r = await page.evaluate(([i,m]) => review.check(i,m),[index,material]);
      if (r.half < r.occupied*.1 || r.cycling < r.occupied*.1 || r.restoreErrors || r.recoloured > .03*r.fittingPixels+3) {
        errors.push(JSON.stringify(r));
        console.error(r);
      }
      cases++; pixels += r.fittingPixels; changed += r.recoloured;
    }
    if ((index+1)%25 === 0) console.log(`${index+1}/${count} wearers`);
  }
  if (cases) console.log(`${cases} finish combinations, ${pixels} fitting pixels, ${changed} changed at full power`);
  if (run('motion')) {
    const count = await page.evaluate(() => review.motionWearerCount);
    for (let i=0; i<count; i++) {
      const result = await page.evaluate(index => review.checkMotionBounds(index),i);
      errors.push(...result.failures.map(failure => 'wearer '+i+' '+failure));
      console.log('wearer '+i+', '+result.views+' motion frames, '+result.failures.length+' failures', result.failures.slice(0,2));
    }
  }
  if (run('lenses')) {
    const count = await page.evaluate(() => review.lensWearerCount);
    let views = 0, pixels = 0;
    for (let i=0; i<count; i++) {
      const result = await page.evaluate(i => review.checkLenses(i),i);
      errors.push(...result.errors);
      views += result.views;
      pixels += result.interiorPixels;
    }
    console.log(`${views} dark glasses views, ${pixels} interior pixels checked for fur`);
  }
  if (run('berets')) {
    const count = await page.evaluate(() => review.beretCount);
    let views = 0;
    for (let i=0;i<count;i++) {
      const result = await page.evaluate(i => review.checkBerets(i),i);
      errors.push(...result.errors);
      views += result.views;
    }
    console.log(views+' beret seat and profile views');
  }
  if (run('pile')) {
    for (const portraitFirst of [true,false]) {
      const fresh = await browser.newPage();
      await fresh.setContent('<main></main>');
      await fresh.addScriptTag({content:bundle.outputFiles[0].text});
      assert.ok(await fresh.evaluate(first => review.checkSharedPile(first),portraitFirst),'one coat overwrote another coat’s fibres');
      await fresh.close();
    }
    const result = await page.evaluate(() => review.checkOrnamentPile());
    errors.push(...result.errors);
    console.log(result.views+' ornament dye and restoration frames');
  }
  if (run('sleepy')) {
    const result = await page.evaluate(() => review.checkSleepyBrows());
    errors.push(...result.errors);
    console.log(result.views+' sleepy brow frames');
    const ink = await page.evaluate(() => review.checkSleepingInk());
    errors.push(...ink.errors);
    console.log(ink.views+' small sleeping eye pairs');
  }
  if (run('winks')) {
    const result = await page.evaluate(() => review.checkWinks());
    errors.push(...result.errors);
    console.log(`${result.views} powered and unpowered wink views`);
  }
  if (run('turns')) {
    const bodies = await page.evaluate(() => review.blotCount);
    let views = 0, largestSpill = 0;
    for (let i = 0; i < bodies; i++) {
      const result = await page.evaluate(index => review.checkTurns(index),i);
      errors.push(...result.errors);
      views += result.views;
      largestSpill = Math.max(largestSpill,result.largestSpill);
    }
    console.log(`${views} eye views, at most ${largestSpill} detached pixels per view`);
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
