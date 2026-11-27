// Run after npm run site. Measure the painted avatar in CSS pixels on the actual studio stage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { launchOptions } from './review-browser.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const browser = await chromium.launch(launchOptions);
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await page.goto(new URL('../_site/index.html?material=glossy', import.meta.url).href);
    await page.waitForFunction(() => document.querySelector('[data-avatar=play] canvas')?.getClientRects().length);
    const results = await page.evaluate(async () => {
      const stage = document.querySelector('[data-stage]'), host = stage.querySelector('[data-avatar=play]');
      const frame = () => new Promise(requestAnimationFrame);
      async function measure() {
        await frame();
        await frame();
        const until = performance.now() + 12000;
        while (!host.querySelector('canvas')?.getClientRects().length && performance.now() < until) await frame();
        const canvas = host.querySelector('canvas');
        if (!canvas?.getClientRects().length) throw Error('missing studio material');
        const w = canvas.width, h = canvas.height;
        const { data } = canvas.getContext('2d').getImageData(0,0,w,h);
        let left = w, right = -1, top = h, bottom = -1;
        for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
          if (data[4*(y*w+x)+3] < 128) continue;
          left = Math.min(left,x); right = Math.max(right,x);
          top = Math.min(top,y); bottom = Math.max(bottom,y);
        }
        if (right < left) throw Error('blank studio material');
        const c = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
        const sx = c.width/w, sy = c.height/h;
        return {
          span: Math.max((right-left+1)*sx,(bottom-top+1)*sy),
          margin: Math.min(c.left+left*sx-s.left, s.right-c.left-(right+1)*sx,
            c.top+top*sy-s.top, s.bottom-c.top-(bottom+1)*sy),
        };
      }
      const size = document.querySelector('[data-size]');
      const bare = [], worn = [], shapes = document.querySelectorAll('[data-shapes] button');
      const portraits = document.querySelectorAll('[data-portrait]');
      for (const shape of shapes) { shape.click(); bare.push([shape.title,await measure()]); }
      for (const tile of portraits) {
        tile.closest('button').click();
        for (const part of ['glasses','extra']) document.querySelector('[data-parts="'+part+'"] button').click();
        document.querySelector('[data-material-is=glossy]').click();
        bare.push([tile.dataset.portrait,await measure()]);
      }
      size.value = size.max;
      size.dispatchEvent(new Event('input'));
      for (const shape of shapes) {
        shape.click();
        for (const extra of document.querySelectorAll('[data-parts=extra] button:enabled')) {
          extra.click();
          worn.push([shape.title+' '+extra.textContent,await measure()]);
        }
      }
      for (const tile of portraits) { tile.closest('button').click(); worn.push([tile.dataset.portrait,await measure()]); }
      return {bare,worn};
    });
    const expected = width > 720 ? 180 : 150;
    for (const [name,{span}] of results.bare) assert.ok(Math.abs(span-expected)<1.1, width+' '+name+' spans '+span);
    for (const [name,{margin}] of results.worn) assert.ok(margin>=0, width+' '+name+' clips by '+(-margin));
    assert.deepEqual(errors,[]);
    console.log(width+'px viewport, '+results.bare.length+' bare body sizes and '+results.worn.length+' dressed bounds passed');
    await page.close();
  }
} finally { await browser.close(); }
