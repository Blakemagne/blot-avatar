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
      const ctx = await snapshot({ editable:true, shape: 'dot-rounded-head-with-two-ears', colour: '#B6D80B', texture: 'Fur', extra: 'Headphones', extraColour });
      return ctx.getImageData(155, 162, 202, 55).data;
    }
    // A pale region fully enclosed by a dark pupil is a socket poking through.
    let socketLeaks = 0;
    for (const recipe of [{preset:'Todd'}, ...['Glossy','Fur'].map(texture =>
      ({editable:true,shape:'dot-rounded-head-with-two-ears',colour:'#B6D80B',texture}))]) for (const yaw of [0,.6,1.1,-.8]) {
      const ctx = await snapshot({ ...recipe, turn: [yaw,yaw*.22,0] });
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
    let exposed = 0;
    for (const material of ['flat','glossy','fluffy']) for (const stageColour of ['#4778FF','#FB8070']) {
      const flower = await snapshot({catalog:'blue_beret',turn:[1.62,.24,.07],material,stageColour});
      const profile = flower.getImageData(333,193,28,40).data;
      for (let i=0;i<profile.length;i+=4) {
        if (profile[i+3]>160 && Math.max(profile[i],profile[i+1],profile[i+2])<62) exposed++;
      }
    }
    return { white, pupils, changed, socketLeaks, exposed };
  });
  assert.equal(eyeCheck.exposed, 0, 'the far eye must stay behind felipe’s cheek at profile');
  assert.equal(eyeCheck.socketLeaks, 0, 'raised sockets should not show through the portrait pupils');
  assert.equal(eyeCheck.changed, 0, 'tinting the headphones repainted the eye region');
  assert.ok(eyeCheck.white > 400 && eyeCheck.pupils > 1200, 'the pale sockets and dark pupils should both be visible');

  // Both pale shells show contact beneath the rims and the brim. Each body mask
  // excludes the fittings, so dark pixels on a lens cannot stand in for its shadow.
  for (const id of ['margot','watt','purple_heart']) {
    const fixture = async group => (await readFile(new URL(
      '../golden/dots/' + group + '/catalog/catalog-' + id + '.png', import.meta.url))).toString('base64');
    const [reference,sections] = await Promise.all([fixture('reference'),fixture('sections')]);
    const error = await page.evaluate(async ({id,reference,sections}) => {
      async function pixels(png) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + png;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        return ctx.getImageData(0,0,img.width,img.height).data;
      }
      const [actual,native,mask] = await Promise.all([
        review.capture({catalog:id}).then(pixels), pixels(reference), pixels(sections),
      ]);
      const diff = [0,0], count = [0,0];
      for (let k=0; k<actual.length; k+=4) {
        if (native[k+3] !== 255 || actual[k+3] !== 255) continue;
        const surface = mask[k];
        const lens = id === 'purple_heart';
        if (lens ? surface !== 2 && surface !== 6 : surface < 1 || surface > 3) continue;
        const group = surface === (lens ? 2 : 1) ? 0 : 1;
        for (let c=0; c<3; c++) diff[group]+=Math.abs(native[k+c]-actual[k+c]);
        count[group]++;
      }
      if (id === 'margot') {
        // Removing the frames must lift the shadow on the same exposed cheek,
        // including after recolouring with a catalog swatch or a custom dye.
        for (const stageColour of ['#FF8066','#936842']) {
          const recipe = {catalog:id,stageColour};
          const dressed = await pixels(await review.capture(recipe));
          const bare = await pixels(await review.capture({...recipe,parts:{glasses:'None'}}));
          let shadow = 0;
          for (let k=0; k<dressed.length; k+=4) {
            if (mask[k] !== 1 || dressed[k+3] < 255 || bare[k+3] < 255) continue;
            if (dressed[k] > 65 && bare[k]-dressed[k] > 4) shadow++;
          }
          if (shadow < 100) throw Error('missing frame shadow after recolouring ' + stageColour);
        }
      }
      return {count, mean:diff.map((sum,i) => sum/(3*count[i]))};
    }, {id,reference,sections});
    if (id === 'purple_heart') {
      assert.ok(error.count.every(n => n>3000) && error.mean.every(n => n<1.65),'jojo lens error '+JSON.stringify(error));
    } else {
      assert.ok(error.count[0]>20000 && error.mean[0]<2.1,id+' matte shell channel error '+error.mean[0]);
      if (id === 'margot') assert.ok(error.count[1]>1000 && error.mean[1]<1.9,'banded oval eye error '+error.mean[1]);
    }
  }

  const catalogue = key => page.locator(`[data-portrait="catalog/${key}"]`).evaluate(el => el.parentElement.click());
  await page.goto(new URL('../_site/index.html', import.meta.url).href);
  await catalogue('cleo');
  const auger = page.locator('[data-moves] button').filter({hasText:'auger walk'});
  await auger.evaluate(el => el.click());
  await page.waitForFunction(() => document.querySelector('[data-code]').textContent.includes("bot.play('dot-busy-auger-walk'"));
  await catalogue('cosmo');
  assert.doesNotMatch(await page.locator('[data-code]').textContent(), /bot\.play\('dot-busy-auger-walk'/);
  const stage = page.locator('[data-avatar=play]');
  const still = () => stage.evaluate(host => {
    const canvas = host.querySelector('canvas');
    if (!canvas?.getClientRects().length) return;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0;
    for (let k=0; k<pixels.length; k+=4) {
      const y=Math.floor(k/4/canvas.width)/canvas.height;
      if (y>.46 && y<.55 && pixels[k+3]>240 && Math.max(pixels[k],pixels[k+1],pixels[k+2])<48) ink++;
    }
    return ink;
  });
  await page.waitForFunction(() => document.querySelector('[data-avatar=play] canvas')?.getClientRects().length);
  assert.ok(await still() > 20, 'cosmo must face forward with visible eyes when interrupting a turn');
  await auger.evaluate(el => el.click());
  await catalogue('cosmo');
  assert.doesNotMatch(await page.locator('[data-code]').textContent(), /bot\.play\('dot-busy-auger-walk'/);
  await catalogue('cleo');
  await auger.evaluate(el => el.click());
  await page.locator('[data-shapes] button[aria-label="heart (dot)"]').evaluate(b => b.click());
  assert.doesNotMatch(await page.locator('[data-code]').textContent(), /bot\.play\('dot-busy-auger-walk'|catalogId/);
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
  // Check the actual picker tile as well as the selected stage render. A stale
  // sheet once showed Cleo with a crown pulled down over both eyes and her chin.
  const sheet = await readFile(new URL('../_site/portraits.webp', import.meta.url));
  await stage.scrollIntoViewIfNeeded();
  const crowns = await page.evaluate(async webp => {
    const sheet = new Image();
    sheet.src = 'data:image/webp;base64,' + webp;
    await sheet.decode();
    const result = [];
    for (const id of ['cleo','estelle','cosmo']) {
      const tile = document.querySelector(`[data-portrait="catalog/${id}"]`);
      tile.closest('button').click();
      const deadline = performance.now() + 10000;
      let surface;
      do {
        await new Promise(requestAnimationFrame);
        surface = document.querySelector('[data-avatar=play] canvas');
      } while (!surface?.getClientRects().length && performance.now() < deadline);
      if (!surface?.getClientRects().length) throw Error('missing stage render for ' + id);
      const percent = tile.style.backgroundPosition.split(' ').map(parseFloat);
      const size = tile.style.backgroundSize.split(' ').map(parseFloat);
      const width = Math.round(sheet.width*100/size[0]), height = Math.round(sheet.height*100/size[1]);
      const thumb = document.createElement('canvas');
      thumb.width = width; thumb.height = height;
      thumb.getContext('2d').drawImage(sheet, Math.round(percent[0]*(sheet.width-width)/100),
        Math.round(percent[1]*(sheet.height-height)/100),width,height,0,0,width,height);
      for (const [view,canvas] of [['tile',thumb],['stage',surface]]) {
        const {width,height} = canvas, data = canvas.getContext('2d').getImageData(0,0,width,height).data;
        let top=height, bottom=0, count=0;
        for (let k=0; k<data.length; k+=4) {
          if (data[k+3] < 224 || data[k] < 120 || data[k] < data[k+1]*1.35) continue;
          const y = Math.floor(k/4/width);
          top=Math.min(top,y); bottom=Math.max(bottom,y); count++;
        }
        let above=0, below=0;
        for (let k=0; k<data.length; k+=4) {
          if (data[k+3]<224 || Math.max(data[k],data[k+1],data[k+2])>115) continue;
          const y=Math.floor(k/4/width);
          if (y < top+.13*(bottom-top)) above++;
          if (y > top+.66*(bottom-top)) below++;
        }
        result.push({id,view,count,above,below});
      }
    }
    return result;
  }, sheet.toString('base64'));
  for (const r of crowns) {
    assert.ok(r.count > 100 && r.above > r.count*.012 && r.below < r.count*.002, JSON.stringify(r));
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
  await page.locator('[data-shapes] button[aria-label="paint brush"]').click();
  await page.locator('#choose-Eyes').click();
  await page.locator('[data-parts="eyes"]').getByRole('button',{name:'original',exact:true}).click();
  await page.locator('#choose-Extras').click();
  await page.locator('[data-parts="extra"]').getByRole('button',{name:'beret',exact:true}).click();
  assert.equal(await page.locator('[data-mount="original"]').textContent(),'bristles');
  // Compare the centre of the dark felt with the green bristles on the painted stage.
  // Each placement must survive saving, including switching back to the default.
  for (const mount of ['handle-tip','original']) {
    await page.locator('#mode-custom').click();
    await page.locator('#choose-Extras').click();
    await page.locator('[data-mount="'+mount+'"]').click();
    await page.locator('[data-save-look]').click();
    await page.reload();
    assert.equal(await page.locator('[data-mount="'+mount+'"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-stage]').scrollIntoViewIfNeeded();
    await page.waitForFunction(mount => {
      const canvas=document.querySelector('[data-avatar=play] canvas');
      if (!canvas?.getClientRects().length) return false;
      const {width,height}=canvas;
      const {data}=canvas.getContext('2d').getImageData(0,0,width,height);
      let green=0,greenX=0,cap=0,capX=0;
      for (let i=0; i<data.length; i+=4) {
        if (data[i+3]<240) continue;
        const x=(i/4)%width;
        if (data[i+1]>80 && data[i+1]>2*data[i]) { green++; greenX+=x; }
        if (Math.max(data[i],data[i+1],data[i+2])<65) { cap++; capX+=x; }
      }
      if (cap<100 || green<500) return false;
      const dx=(capX/cap-greenX/green)/width;
      return mount==='handle-tip' ? dx>.06 : dx<-.035;
    },mount,{timeout:15000});
  }
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
  // A named extra can have several native colours. Restore its finish after
  // recolouring it while retaining the user's other edits.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#mode-preset').click();
  await page.locator('#source-catalog').click();
  await page.locator('button:has([data-portrait="catalog/blue_spectacles"])').click();
  await page.locator('#mode-custom').click();
  await page.locator('#choose-Glasses').click();
  await page.locator('[data-parts="glasses"]').getByRole('button',{name:'monocle',exact:true}).click();
  await page.locator('#choose-Extras').click();
  const original = page.locator('[data-original-extra]');
  const activeDyes = page.locator('[data-extra-palette] button[aria-pressed=true]');
  const canvasImage = () => stage.evaluate(async host => {
    await new Promise(requestAnimationFrame);
    return host.querySelector('canvas').toDataURL();
  });
  assert.equal(await original.getAttribute('aria-pressed'),'true');
  assert.equal(await activeDyes.count(),1);
  const untouched = await canvasImage();
  await page.locator('[data-extra-palette] [data-hex="#FA70AB"]').click();
  assert.ok(await canvasImage() !== untouched,'the extra dye should change the pixels');
  assert.equal(await activeDyes.count(),1);
  await original.click();
  assert.ok(await canvasImage() === untouched,'restoring the original extra should restore its pixels');
  assert.equal(await activeDyes.count(),1);
  assert.doesNotMatch(await page.locator('[data-code]').textContent(),/"tintExtra":true/);
  assert.match(await page.locator('[data-code]').textContent(),/"glasses":"Monocle"/);
  await page.locator('[data-parts="extra"]').getByRole('button',{name:'bow tie',exact:true}).click();
  assert.equal(await original.isVisible(),false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#tab-play').click();
  await page.locator('#seg-face').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('#seg-activity').getAttribute('aria-selected'),'true');
  const activities = page.locator('[data-choice="activity"]');
  await activities.getByRole('button',{name:'working',exact:true}).click();
  await page.locator('[data-choice="form"]').getByRole('button',{name:'progress',exact:true}).click();
  assert.ok(await page.locator('[data-progress]').isVisible());
  await page.locator('#seg-moves').click();
  assert.ok(await activities.isHidden());
  const settings = page.getByRole('button',{name:'settings',exact:true});
  await settings.click();
  const weight = page.getByRole('slider',{name:'weight',exact:true});
  const originalWeight = await weight.inputValue();
  await weight.focus();
  await weight.press('End');
  assert.match(await page.locator('[data-code]').textContent(),/weight: 1/);
  await weight.fill(originalWeight);
  await weight.press('Escape');
  assert.ok(await weight.isHidden());
  await page.locator('#seg-activity').click();
  assert.ok(await page.locator('[data-progress]').isVisible());
  await activities.getByRole('button',{name:'idle',exact:true}).click();
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
  // Start the export in the same task as the resize, before a resize observer
  // or the material queue can update a stale desktop-sized coat.
  const resizedDownload=page.waitForEvent('download');
  await page.evaluate(() => {
    const stage=document.querySelector('[data-stage]');
    stage.style.height=stage.style.minHeight='170px';
    document.querySelector('[data-do="png"]').click();
  });
  const resizedFrame=await readFile(await (await resizedDownload).path());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok(resizedFrame.equals(await exportPng()),'the first export after resizing used a stale coat size');
  // Hold image decoding while the stage changes. The downloaded SVG layers
  // and coat pixels must both belong to the avatar present at the click.
  const clickFrame = await exportPng();
  await page.evaluate(() => {
    const decode=HTMLImageElement.prototype.decode;
    const held=new Promise(resolve => { window.releaseExportImages = resolve; });
    HTMLImageElement.prototype.decode = async function () {
      const pending=decode.call(this);
      if (this.src.startsWith('blob:')) { window.exportWaiting=true; await held; }
      await pending;
    };
  });
  const inFlight=exportPng();
  await page.waitForFunction(()=>window.exportWaiting);
  await catalogue('cleo');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.releaseExportImages());
  assert.ok(clickFrame.equals(await inFlight),'a pending PNG export mixed two wearers');
  assert.deepEqual(errors, []);
  console.log('frog eye pixels, 36 transition frames, preset motion resets, crown tiles and stage fits, matte contact shadows, preset transfers, powered mode, motion pills, shape dyes, saved mounts and responsive palette checks passed.');
} finally {
  await browser.close();
}
