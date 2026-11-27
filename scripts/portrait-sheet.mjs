// Generate the studio picker thumbnails from the public avatar renderer.
// PLAYWRIGHT_CORE and CHROMIUM can point at local browser installations.
import { launchOptions } from './review-browser.mjs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const check = process.argv.includes('--check');
const imageFile = new URL('../site/portraits.webp', import.meta.url);
const manifestFile = new URL('../site/portraits.json', import.meta.url);
const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'iife', globalName: 'avatar', write: false });
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.setContent('<main></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const { webp, keys, columns, rows } = await page.evaluate(async () => {
    const { DOT_CATALOG, DOT_CHARACTERS, DOT_GLASSES, DOT_EXTRAS, dotAvatar, mount } = avatar;
    const recipes = [...Object.entries(DOT_CHARACTERS), ...DOT_CATALOG.map(item => ['catalog/' + item.id, item.appearance])];
    const wardrobe = { glasses: DOT_GLASSES, extra: DOT_EXTRAS };
    for (const [part, values] of Object.entries(wardrobe)) {
      for (const value of values.filter(value => value !== 'None')) {
        recipes.push([part + '/' + value, {
          shape: 'dot-circle', colour: '#08B8AE', texture: 'Glossy',
          extraColour: '#DF9E68', [part]: value,
        }]);
      }
    }
    const side = 96, columns = 12, rows = Math.ceil(recipes.length / columns);
    const sheet = document.createElement('canvas');
    sheet.width = columns * side;
    sheet.height = rows * side;
    const ctx = sheet.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const host = document.querySelector('main');
    for (const [index, [key, recipe]] of recipes.entries()) {
      const bot = mount(host, { ...dotAvatar(recipe), size: 128, follow: false, seed: 1 });
      try {
        let canvas;
        for (let i = 0; i < 90; i++) {
          await new Promise(requestAnimationFrame);
          canvas = host.querySelector('canvas');
          if (canvas?.width && canvas.getClientRects().length) break;
        }
        if (!canvas?.getClientRects().length) throw new Error('missing portrait: ' + key);
        const { width, height } = canvas;
        const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        let x0 = width, y0 = height, x1 = 0, y1 = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (pixels[(y*width+x)*4+3] < 8) continue;
          x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
        }
        if (x1 <= x0 || y1 <= y0) throw new Error('empty portrait: ' + key);
        // Keep the rims readable at picker size. Extras keep the entire wearer.
        if (key.startsWith('glasses/')) {
          const w = x1 - x0, h = y1 - y0;
          const crop = w * .85;
          const cx = (x0+x1)/2, cy = y0 + h*.46;
          x0 = Math.round(cx-crop/2); x1 = Math.round(cx+crop/2);
          y0 = Math.round(cy-crop/2); y1 = Math.round(cy+crop/2);
        }
        const w = x1-x0+1, h = y1-y0+1, scale = (side-4)/Math.max(w,h);
        const x = (index%columns)*side+(side-w*scale)/2, y = Math.floor(index/columns)*side+(side-h*scale)/2;
        ctx.drawImage(canvas,x0,y0,w,h,x,y,w*scale,h*scale);
      } finally { bot.destroy(); }
    }
    return { webp: sheet.toDataURL('image/webp', .96).split(',')[1], keys: recipes.map(([key]) => key), columns, rows };
  });
  if (check) {
    assert.deepEqual(JSON.parse(await readFile(manifestFile, 'utf8')), { columns, rows, keys });
    const stored = (await readFile(imageFile)).toString('base64');
    const stale = await page.evaluate(async ({ stored, webp, keys, columns, rows }) => {
      // Average small blocks so WebP rounding and fine GPU grain do not mask a displaced fitting.
      async function samples(encoded) {
        const img = new Image();
        img.src = 'data:image/webp;base64,' + encoded;
        await img.decode();
        if (img.width !== 96 * columns || img.height !== 96 * rows) throw Error('invalid portrait sheet dimensions');
        const canvas = document.createElement('canvas');
        canvas.width = columns * 12;
        canvas.height = rows * 12;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const [a, b] = await Promise.all([samples(stored), samples(webp)]);
      return keys.filter((_, index) => {
        const x = index % columns * 12, y = Math.floor(index / columns) * 12;
        let sum = 0, worst = 0;
        for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
          const k = 4 * ((y + j) * columns * 12 + x + i);
          let error = Math.abs(a[k+3] - b[k+3]);
          for (let c = 0; c < 3; c++) error += Math.abs(a[k+c]*a[k+3] - b[k+c]*b[k+3]) / 255;
          sum += error / 4;
          worst = Math.max(worst, error / 4);
        }
        return sum / 144 > 1.5 || worst > 10;
      });
    }, { stored, webp, keys, columns, rows });
    assert.deepEqual(stale, [], 'stale picker tiles: ' + stale.join(', '));
    console.log(keys.length + ' picker tiles match the renderer');
  } else {
    await writeFile(imageFile, Buffer.from(webp, 'base64'));
    await writeFile(manifestFile, JSON.stringify({columns,rows,keys},null,2)+'\n');
  }
} finally { await browser.close(); }
