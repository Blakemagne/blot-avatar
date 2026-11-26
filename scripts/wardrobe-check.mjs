// Build the studio first. PLAYWRIGHT_CORE and CHROMIUM may point to local installations.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const bundle = await build({ entryPoints: ['scripts/dot-capture-page.ts'], globalName: 'review', format: 'iife', bundle: true, minify: true, write: false });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setContent('<main style="position:relative;margin:128px auto"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const eyeCheck = await page.evaluate(async () => {
    async function eyes(extraColour) {
      const png = await review.capture({ shape: 'dot-rounded-head-with-two-ears', colour: '#B6D80B', texture: 'Fur', extra: 'Headphones', extraColour });
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(155, 162, 202, 55).data;
    }
    const dark = await eyes('#1F1F1F'), pink = await eyes('#FA70AB');
    let white = 0, pupils = 0, changed = 0;
    for (let i = 0; i < dark.length; i += 4) {
      if (dark[i] !== pink[i] || dark[i+1] !== pink[i+1] || dark[i+2] !== pink[i+2]) changed++;
      if (dark[i+3] > 250 && Math.min(dark[i],dark[i+1],dark[i+2]) > 220) white++;
      if (dark[i+3] > 250 && Math.max(dark[i],dark[i+1],dark[i+2]) < 60) pupils++;
    }
    return { white, pupils, changed };
  });
  assert.equal(eyeCheck.changed, 0, 'tinting the headphones repainted the eye region');
  assert.ok(eyeCheck.white > 400 && eyeCheck.pupils > 1200, 'the pale sockets and dark pupils should both be visible');

  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    const studio = new URL('../_site/index.html', import.meta.url);
    studio.search = '?avatar=dot-rounded-head-with-two-ears&extra=Headphones';
    await page.goto(studio.href);
    await page.waitForFunction(() => document.querySelector('[data-avatar=play] canvas')?.getClientRects().length);
    const missing = await page.evaluate(async () => {
      const missed = [], host = document.querySelector('[data-avatar=play]');
      for (const name of ['heart', 'star', 'frog', 'capsule', 'star', 'frog']) {
        document.querySelector(`#bots-bodies button[aria-label="${name}"]`).click();
        for (let frame = 0; frame < 3; frame++) {
          await new Promise(requestAnimationFrame);
          if (!host.querySelector('canvas')?.getClientRects().length || host.querySelector('[data-layer="headband"]')) missed.push({ name, frame });
        }
      }
      return missed;
    });
    assert.deepEqual(missing, [], reducedMotion);
  }
  assert.deepEqual(errors, []);
  console.log('Frog eye pixels and 36 studio transition frames passed.');
} finally {
  await browser.close();
}
