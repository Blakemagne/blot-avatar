// Build the studio first. PLAYWRIGHT_CORE and CHROMIUM may point to local installations.
import assert from 'node:assert/strict';
import { launchOptions } from './review-browser.mjs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const bundle = await build({ entryPoints: ['scripts/dot-capture-page.ts'], globalName: 'review', format: 'iife', bundle: true, minify: true, write: false });
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Opening the full gallery can warm dozens of meshes on software WebGL.
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setContent('<main style="position:relative;margin:128px auto"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const eyeCheck = await page.evaluate(async () => {
    async function snapshot(options) {
      const png = await review.capture(options);
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx;
    }
    async function eyes(extraColour) {
      const ctx = await snapshot({ shape: 'dot-rounded-head-with-two-ears', colour: '#B6D80B', texture: 'Fur', extra: 'Headphones', extraColour });
      return ctx.getImageData(155, 162, 202, 55).data;
    }
    // A pale region fully enclosed by a dark pupil is a socket poking through.
    let socketLeaks = 0;
    for (const yaw of [0,.6,1.1,-.8]) {
      const ctx = await snapshot({ preset: 'Todd', turn: [yaw,yaw*.22,0] });
      const {data,width,height} = ctx.getImageData(0,0,512,288);
      const state = new Uint8Array(width*height), queue = [];
      for (let i = 0; i < state.length; i++) {
        const brightness = Math.max(data[4*i],data[4*i+1],data[4*i+2]);
        if (data[4*i+3]>200 && brightness<80) state[i]=1;
        else if (i<width || i>=state.length-width || i%width===0 || i%width===width-1) { state[i]=2; queue.push(i); }
      }
      for (let at = 0; at < queue.length; at++) {
        const i = queue[at];
        for (const j of [i-1,i+1,i-width,i+width]) {
          if (state[j]===0) { state[j]=2; queue.push(j); }
        }
      }
      for (let i = 0; i < state.length; i++) {
        if (!state[i] && Math.max(data[4*i],data[4*i+1],data[4*i+2])>100) socketLeaks++;
      }
    }
    const dark = await eyes('#1F1F1F'), pink = await eyes('#FA70AB');
    let white = 0, pupils = 0, changed = 0;
    for (let i = 0; i < dark.length; i += 4) {
      if (dark[i] !== pink[i] || dark[i+1] !== pink[i+1] || dark[i+2] !== pink[i+2]) changed++;
      if (dark[i+3] > 250 && Math.min(dark[i],dark[i+1],dark[i+2]) > 220) white++;
      if (dark[i+3] > 250 && Math.max(dark[i],dark[i+1],dark[i+2]) < 60) pupils++;
    }
    return { white, pupils, changed, socketLeaks };
  });
  assert.equal(eyeCheck.socketLeaks, 0, 'raised sockets should not show through the portrait pupils');
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
        document.querySelector(`[data-shapes] button[aria-label="${name}"]`).click();
        for (let frame = 0; frame < 3; frame++) {
          await new Promise(requestAnimationFrame);
          if (!host.querySelector('canvas')?.getClientRects().length || host.querySelector('[data-layer="headband"]')) missed.push({ name, frame });
        }
      }
      return missed;
    });
    assert.deepEqual(missing, [], reducedMotion);
  }
  for (const preference of ['no-preference','reduce']) {
    await page.emulateMedia({ reducedMotion: preference });
    const moves = page.locator('[data-moves] button').filter({ hasText: 'backflip' });
    assert.equal(await moves.count(),1);
    await page.waitForFunction(disabled => {
      const pills = [...document.querySelectorAll('[data-moves] button')].filter(b => b.title.startsWith("play('dot-"));
      return pills.length === 54 && pills.every(b => b.disabled === disabled);
    }, preference === 'reduce');
    if (preference === 'no-preference') {
      await moves.evaluate(b => b.click());
      assert.match(await page.locator('[data-code]').textContent(), /bot.play\('dot-backflip'/);
    }
  }
  const dyeReset = await page.evaluate(() => {
    const shape = name => document.querySelector('[data-shapes] button[aria-label="'+name+'"]').click();
    const hex = () => document.querySelector('[data-picker=body] input[type=text]').value;
    shape('heart'); const heart = hex();
    shape('frog'); const frog = hex();
    document.querySelector('[data-picker=body] button[title="pink"]').click();
    const edited = hex();
    shape('heart'); const pickedHeart = hex(); shape('frog');
    return { heart, frog, edited, pickedHeart, pickedFrog:hex() };
  });
  assert.notEqual(dyeReset.edited,dyeReset.frog);
  assert.equal(dyeReset.pickedHeart,dyeReset.heart);
  assert.equal(dyeReset.pickedFrog,dyeReset.frog);
  await page.locator('#mode-custom').click();
  await page.locator('#choose-Shape').click();
  const frog = page.locator('[data-shapes] button[aria-label="frog"]');
  await frog.click();
  async function frogPixels(pink) {
    await frog.scrollIntoViewIfNeeded();
    await page.waitForFunction(expectPink => {
      const c = document.querySelector('[data-shapes] button[aria-label="frog"] canvas');
      if (!c?.getClientRects().length) return false;
      const [r,g,b,a] = c.getContext('2d').getImageData(c.width/2,c.height*.63,1,1).data;
      return a > 230 && (expectPink ? r > g*1.2 && b > g : g > r && g > b*1.3);
    }, pink);
    return frog.locator('canvas').evaluate(canvas => canvas.toDataURL());
  }
  const frogDefault = await frogPixels(false);
  await page.locator('[data-picker=body] button[title="pink"]').click();
  await frogPixels(true);
  await page.locator('[data-shapes] button[aria-label="capsule"]').click();
  assert.ok(await frogPixels(false) === frogDefault,'leaving a dyed shape must restore its thumbnail');
  await page.locator('[data-portrait="catalog/sunny"]').evaluate(b => b.closest('button').click());
  await page.locator('[data-mount="left"]').evaluate(b => b.click());
  await page.locator('[data-save-look]').click();
  await page.reload();
  assert.equal(await page.locator('[data-mount="left"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('[data-code]').textContent(), /"extraMount":"left"/);
  // Exercise real editor selections so a material or dye change cannot silently
  // replace a catalog or starter rig with its generic builder approximation.
  for (const key of ['catalog/blue_spectacles', 'catalog/matisse', 'Iris']) {
    const tile = page.locator(`button:has([data-portrait="${key}"])`);
    await page.locator('#mode-preset').click();
    await page.locator(key.startsWith('catalog/') ? '#source-catalog' : '#source-starters').click();
    await tile.click();
    await page.locator('#mode-custom').click();
    await page.locator('#choose-Extras').click();
    if (key === 'Iris') {
      await page.locator('[data-parts="extra"]').getByRole('button', { name: 'headphones' }).click();
    }
    await page.locator('[data-extra-palette] button').last().click();
    await page.locator('#choose-Eyes').click();
    await page.locator('[data-parts="eyes"]').getByRole('button', { name: 'sparkle capsules' }).click();
    await page.locator('#choose-Textures').click();
    for (const material of ['flat', 'fluffy', 'glossy']) {
      const finish = page.locator(`[data-material-is="${material}"]`);
      await finish.click();
      assert.equal(await finish.getAttribute('aria-pressed'), 'true', material);
      assert.equal(await tile.getAttribute('aria-pressed'), 'true', key);
      await page.waitForFunction(() => document.querySelector('[data-avatar=play] canvas')?.getClientRects().length);
    }
    await page.locator('[data-save-look]').click();
    await page.reload();
    assert.equal(await tile.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-code]').textContent(), /"parts":\{[^}]*"eyes":"Sparkle capsules"/);
    assert.match(await page.locator('[data-code]').textContent(), /"tintExtra":true/);
    if (key === 'catalog/matisse') {
      assert.match(await page.locator('[data-code]').textContent(), /"catalogGloss":true/);
      await page.locator('#mode-custom').click();
      await page.locator('#choose-Textures').click();
      await page.locator('[data-matte]').click();
      assert.equal(await page.locator('[data-matte]').getAttribute('aria-pressed'), 'true');
      assert.equal(await tile.getAttribute('aria-pressed'), 'true');
    }
  }
  const play = page.locator('[data-avatar=play]');
  for (const reducedMotion of ['reduce','no-preference']) {
    await page.emulateMedia({ reducedMotion });
    await page.locator('#tab-play').click();
    await page.locator('#seg-face').click();
    const toggle = page.locator('[data-ultra]');
    await toggle.check();
    const gradient = play.locator('linearGradient[id$="-rainbow"]');
    await gradient.waitFor({ state:'attached' });
    if (reducedMotion === 'no-preference') {
      const initial = await gradient.getAttribute('gradientTransform');
      await page.waitForFunction(start => document.querySelector('[data-avatar=play] linearGradient[id$="-rainbow"]')
        ?.getAttribute('gradientTransform') !== start, initial);
    }
    // The SVG carries the first powered frame while the material is queued.
    // Once the canvas has drawn the rainbow, the overlay must stay empty.
    await page.waitForFunction(() => {
      const stage = document.querySelector('[data-avatar=play]');
      const group = stage.querySelector('linearGradient[id$="-rainbow"]')?.parentElement?.parentElement;
      return stage.querySelector('canvas')?.getClientRects().length && group && !group.querySelector(':scope > path[d]');
    });
    const overpainted = await gradient.evaluate(async g => {
      for (let i = 0; i < 5; i++) {
        await new Promise(requestAnimationFrame);
        if (g.parentElement.parentElement.querySelector(':scope > path[d]')) return true;
      }
      return false;
    });
    assert.equal(overpainted,false);
    if (reducedMotion === 'reduce') {
      await page.locator('[data-save-look]').click();
      await page.reload();
      assert.equal(await toggle.isChecked(),true);
      await gradient.waitFor({state:'attached'});
      await page.locator('#tab-play').click();
      await page.locator('#seg-face').click();
    }
    await toggle.uncheck();
    await gradient.waitFor({ state:'detached' });
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  async function exportPng() {
    await page.locator('[data-menu="export"] > button').click();
    const download = page.waitForEvent('download');
    await page.locator('[data-do="png"]').click();
    return readFile(await (await download).path());
  }
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('#tab-play').click();
    await page.locator('#mode-preset').click();
    assert.equal(await page.locator('#tab-bot').getAttribute('aria-selected'), 'true');
    await page.locator('#mode-preset').press('ArrowRight');
    assert.equal(await page.locator('#mode-custom').getAttribute('aria-selected'), 'true');
    const trigger = page.getByRole('button',{name:'stage palette'});
    const before = await page.locator('[data-code]').textContent();
    const stagePaint = () => page.locator('[data-stage]').evaluate(el => {
      const css = getComputedStyle(el);
      return [css.backgroundColor, css.backgroundImage];
    });
    const defaultPaint = await stagePaint();
    const originalPng = width === 390 ? await exportPng() : null;
    await trigger.click();
    const panel = page.getByRole('dialog',{name:'stage palette'});
    const inside = await panel.evaluate(el => {
      const a=el.getBoundingClientRect(), b=el.closest('.stage').getBoundingClientRect();
      return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
    });
    assert.ok(inside, 'palette should fit the stage at '+width);
    await panel.getByLabel('background').fill('#adcdef');
    await panel.getByLabel('dots').fill('#25163f');
    const backdrop = await stagePaint();
    assert.equal(backdrop[0], 'rgb(173, 205, 239)');
    assert.match(backdrop[1], /rgb\(37, 22, 63\)/);
    assert.equal(await page.locator('[data-code]').textContent(),before);
    if (originalPng) {
      assert.ok(originalPng.equals(await exportPng()),'stage backdrop changed the exported PNG');
      await trigger.click();
    }
    await panel.getByRole('button',{name:'restore default'}).click();
    assert.deepEqual(await stagePaint(),defaultPaint);
    await panel.getByLabel('dots').press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    assert.equal(await trigger.evaluate(el => el === document.activeElement),true);
    const position = await page.evaluate(() => {
      const rect = q => document.querySelector(q).getBoundingClientRect();
      const heading = rect('#studio-title'), modes = rect('[data-tabs=appearance-mode]'), stage = rect('[data-stage]');
      return { space: modes.left-heading.right, edge: Math.abs(modes.right-stage.right),
        centres: Math.abs(modes.top+modes.height/2-heading.top-heading.height/2) };
    });
    assert.ok(position.space >= 0 && position.edge < 2 && position.centres < 2, JSON.stringify({width,position}));
  }
  assert.deepEqual(errors, []);
  console.log('frog eye pixels, 36 transition frames, preset transfers, powered mode, motion pills, shape dyes, saved mounts and responsive palette checks passed.');
} finally {
  await browser.close();
}
