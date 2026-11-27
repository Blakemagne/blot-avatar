// Browser side of the wardrobe power regression. Freeze the rig's pose so a
// changed eye or accessory pixel cannot be explained by a blink or a head turn.
import { BODIES, DOT_CLIPS, DOT_CATALOG, DOT_CHARACTERS, DOT_EYES, DOT_EXTRAS, DOT_GLASSES, DOT_SHAPES,
  GALLERY, avatarParts, dotAvatar, dotExtras, mount, type Material } from '../src/index';

import { Rig } from '../src/engine/rig';

const wearers = [...Object.keys(BODIES), ...DOT_SHAPES.map(row => row.id), ...GALLERY.map(row => row.definition),
  { ...GALLERY[0].definition, id: 'review-import' }];
const recipes = [...Object.entries(DOT_CHARACTERS), ...DOT_CATALOG.map(row => [row.id,row.appearance] as const)];
export const count = wearers.length + recipes.length;

async function materialPixels(host: HTMLElement) {
  const deadline = performance.now()+10000;
  do { await new Promise(requestAnimationFrame); }
  while (!host.querySelector('canvas')?.getClientRects().length && performance.now()<deadline);
  const canvas = host.querySelector('canvas');
  if (!canvas?.getClientRects().length) throw new Error('material canvas did not paint');
  return canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
}

function optionsAt(index: number) {
  const shape = wearers[index];
  const named = recipes[index-wearers.length];
  const extras = typeof shape === 'string' && shape.startsWith('dot-') ? dotExtras(shape) : DOT_EXTRAS;
  return shape ? {
    ...avatarParts(shape, { eyes: DOT_EYES[index % DOT_EYES.length], glasses: DOT_GLASSES[index % DOT_GLASSES.length],
      extra: extras[index % extras.length], extraColour: '#FFCC38' }), color: '#FA70AB',
  } : dotAvatar(named[1]);
}

export function checkFallback() {
  const host = document.querySelector<HTMLElement>('main')!;
  const errors: string[] = [];
  for (let i = 0; i < count; i++) {
    const bot = mount(host,{ ...optionsAt(i), size: 72, ultra: true, follow: false });
    try {
      const gradient = host.querySelector('linearGradient[id$="-rainbow"]');
      const overlay = gradient?.parentElement?.parentElement?.querySelector(':scope > path[d]');
      if (!overlay?.getAttribute('d') || host.querySelector('canvas')?.getClientRects().length) errors.push('missing powered SVG '+i);
      bot.update({ultra:false});
      if (host.querySelector('linearGradient[id$="-rainbow"]')) errors.push('stale powered SVG '+i);
    } finally { bot.destroy(); }
  }
  return {count, errors};
}

export async function check(index: number, material: Material) {
  const shape = wearers[index], named = recipes[index-wearers.length];
  const options = optionsAt(index);
  const host = document.querySelector<HTMLElement>('main')!;
  const bot = mount(host,{ ...options, size: 82, material, follow: false });
  try {
    const rig = bot.live.rig;
    rig.step = () => true;
    Object.assign(rig.state.pose, { yaw: index % 2 ? -.64 : .62, pitch: .14, roll: -.02 });
    Object.assign(rig.state.eye, { x: .65, y: -.3 });
    async function picture(amount: number, phase: number) {
      rig.state.ultra = amount ? { amount,phase } : undefined;
      bot.live.motion();
      return materialPixels(host);
    }
    const off = await picture(0,0), entering = await picture(.5,.2), on = await picture(1,.2);
    const moved = await picture(1,.72), restored = await picture(0,0);
    bot.update({ color: '#24AA31' });
    const otherDye = await picture(0,0);
    const equal = (a: ImageData,b: ImageData,i: number) => a.data[i] === b.data[i] &&
      a.data[i+1] === b.data[i+1] && a.data[i+2] === b.data[i+2] && a.data[i+3] === b.data[i+3];
    let occupied = 0, half = 0, cycling = 0, restoreErrors = 0, fittingPixels = 0, recoloured = 0;
    const { width, height } = off;
    const core = new Uint8Array(width*height);
    for (let i = 0; i < core.length; i++) {
      const at = i*4;
      if (off.data[at+3] < 224) continue;
      occupied++;
      if (!equal(off,entering,at) && !equal(entering,on,at)) half++;
      if (!equal(on,moved,at)) cycling++;
      if (!equal(off,restored,at)) restoreErrors++;
      core[i] = Number(equal(off,otherDye,at));
    }
    // A full-pixel neighbourhood unaffected by body dye isolates the interiors
    // of the fittings from the antialiased join with the changing shell.
    for (let y = 1; y < height-1; y++) for (let x = 1; x < width-1; x++) {
      const i = y*width+x;
      if (!(core[i] && core[i-1] && core[i+1] && core[i-width] && core[i+width])) continue;
      fittingPixels++;
      if (!equal(off,on,i*4)) recoloured++;
    }
    return { name: shape ? typeof shape === 'string' ? shape : shape.id : named[0],
      material, occupied, half, cycling, restoreErrors, fittingPixels, recoloured };
  } finally { bot.destroy(); }
}

const blotWearers = [...Object.keys(BODIES), ...GALLERY.map(row => row.definition), { ...GALLERY[0].definition,id:'angle-import' }];
export const blotCount = blotWearers.length;

/** Compare all eight eye styles against the actual undressed material silhouette at the same pose. */
export async function checkTurns(index: number) {
  const wearer = blotWearers[index], host = document.querySelector<HTMLElement>('main')!;
  const bare = avatarParts(wearer), bot = mount(host,{ ...bare, size: 100,color:'#F97510',material:'glossy',follow:false });
  const errors: string[] = [];
  let largestSpill = 0, views = 0;
  try {
    const rig = bot.live.rig;
    rig.step = () => true;
    async function image() {
      bot.live.motion();
      return materialPixels(host);
    }
    for (const yaw of [0,-.65,.85,-1.13,1.3]) {
      bot.update(bare);
      Object.assign(rig.state.pose,{yaw,pitch:yaw*.22,roll:-yaw*.08});
      Object.assign(rig.state.eye,{x: Math.sign(yaw)*.81, y: .42});
      const shell = await image();
      for (const eyes of DOT_EYES) {
        bot.update(avatarParts(wearer,{ eyes }));
        const fitted = await image();
        if (fitted.width !== shell.width) throw new Error('the eye changed the camera framing');
        const {width,height} = shell;
        let outside = 0, eyePixels = 0;
        for (let y = 1; y < height-1; y++) for (let x = 1; x < width-1; x++) {
          const i = 4*(y*width+x);
          if (fitted.data[i+3] < 210) continue;
          if (shell.data[i+3] < 8) {
            let nearSkin = false;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
              if (shell.data[i+4*(dy*width+dx)+3] > 8) nearSkin = true;
            }
            if (!nearSkin) outside++;
          }
          if (shell.data[i+3] > 240 && Math.abs(shell.data[i]-fitted.data[i]) > 32) eyePixels++;
        }
        largestSpill = Math.max(largestSpill,outside);
        if (outside > 1 || (yaw === 0 && eyePixels < 3)) {
          errors.push(`${typeof wearer === 'string' ? wearer : wearer.id} ${eyes} yaw ${yaw}: ${outside} detached pixels, ${eyePixels} eye pixels`);
        }
        views++;
      }
    }
  } finally { bot.destroy(); }
  return { errors,views,largestSpill };
}

/** Count substantial islands of material separated from the body by transparent pixels. */
function detachedPixels({ width, height, data }: ImageData) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = Number(data[4*i+3] >= 128);
  const sizes: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const stack = [i];
    mask[i] = 0;
    let area = 0;
    while (stack.length) {
      const at = stack.pop()!;
      area++;
      const x = at % width, y = Math.floor(at / width);
      for (let v = Math.max(0,y-1); v <= Math.min(height-1,y+1); v++) {
        for (let u = Math.max(0,x-1); u <= Math.min(width-1,x+1); u++) {
          const next = v*width + u;
          if (mask[next]) { mask[next] = 0; stack.push(next); }
        }
      }
    }
    sizes.push(area);
  }
  return sizes.sort((a,b) => b-a)[1] ?? 0;
}

// A custom dye exercises strand depth on every body. The standard lime also
// exercises the native dot pile materials, including the triangle's fibre cards.
const lensCases = [
  ...wearers.map(shape => ({ shape, color: '#80ff12' })),
  ...DOT_SHAPES.map(({id}) => ({ shape: id, color: '#B6D80B' })),
];
export const lensWearerCount = lensCases.length;

/** Locate opaque lens interiors on smooth skin, then check the same pixels for green pile. */
export async function checkLenses(index: number) {
  const { shape, color } = lensCases[index];
  const host = document.querySelector<HTMLElement>('main')!;
  const errors: string[] = [];
  let views = 0, interiorPixels = 0;
  for (const glasses of ['Classic sunglasses', 'Round sunglasses', 'Separate trapezoid lenses'] as const) {
    const bot = mount(host, { ...avatarParts(shape, { glasses }), color, size: 200, follow: false });
    try {
      const rig = bot.live.rig;
      rig.step = () => true;
      for (const yaw of [0, -.75, .9, -1.2, 1.35]) {
        Object.assign(rig.state.pose, { yaw, pitch: .18*yaw, roll: -.08*yaw });
        async function capture(material: Material) {
          bot.update({ material });
          bot.live.motion();
          return materialPixels(host);
        }
        const smooth = await capture('glossy'), furry = await capture('fluffy');
        const { width, height, data } = smooth;
        if (width !== furry.width || height !== furry.height) throw new Error('lens framing changed');
        const dark = (i: number) => data[i+3] === 255 && Math.max(data[i],data[i+1],data[i+2]) < 90
          && Math.abs(data[i+1]-data[i]) < 12 && Math.abs(data[i+1]-data[i+2]) < 12;
        let interior = 0, exposed = 0;
        for (let y = 1; y < height-1; y++) for (let x = 1; x < width-1; x++) {
          const i = 4*(y*width+x);
          if (!(dark(i) && dark(i-4) && dark(i+4) && dark(i-4*width) && dark(i+4*width))) continue;
          interior++;
          if (furry.data[i+1] > 16 + Math.max(furry.data[i],furry.data[i+2])) exposed++;
        }
        if (exposed || (!yaw && interior < 50)) {
          errors.push(`${typeof shape === 'string' ? shape : shape.id} ${color} ${glasses} yaw ${yaw}: ${exposed} fur pixels in ${interior} lens pixels`);
        }
        views++;
        interiorPixels += interior;
      }
    } finally { bot.destroy(); }
  }
  return { errors, views, interiorPixels };
}

const capWearers = wearers.filter(shape => dotExtras(shape).includes('Beret'));
export const beretCount = capWearers.length;

/** Isolate the dyed cap at either profile. It must remain connected to
 * the wearer when moving between an authored seat and the default one. */
export async function checkBerets(index: number) {
  const shape = capWearers[index], id = typeof shape === 'string' ? shape : shape.id;
  const host = document.querySelector<HTMLElement>('main')!;
  const options = avatarParts(shape,{ extra:'Beret' });
  const mounts = options.body.wardrobe?.mounts?.filter(m => m.extras.includes('Beret')).map(m => m.id) ?? [];
  const bot = mount(host,{ ...options, size:128,material:'glossy',color:'#00B1FF',follow:false });
  const errors: string[] = [];
  let views=0;
  try {
    const rig = bot.live.rig;
    rig.step = () => true;
    for (const extraMount of [undefined,...mounts]) {
      bot.update(avatarParts(shape,{extra:'Beret',extraMount,extraColour:'#FA70AB'}));
      for (const yaw of [0,.65,-.65,1.24,-1.24,2.2,-2.2,Math.PI]) {
        Object.assign(rig.state.pose,{yaw,pitch:-.16,roll:.12});
        bot.live.motion();
        const pixels=await materialPixels(host);
        let dyed=0;
        for (let k=0;k<pixels.data.length;k+=4) {
          if (pixels.data[k+3]>190 && pixels.data[k]>pixels.data[k+1]+48 && pixels.data[k]>pixels.data[k+2]+26) dyed++;
        }
        const detached=detachedPixels(pixels);
        if (detached>6 || !dyed) errors.push(id+' '+(extraMount??'original')+' yaw '+yaw+' detached '+detached+' dyed '+dyed);
        views++;
      }
    }
  } finally { bot.destroy(); }
  return {views,errors};
}

/** A wink removes the pale support under a pupil. Check both sides in profile
 * and the turned-away face, where a stroke at the old depth can float free. */
export async function checkWinks() {
  const errors: string[] = [];
  let views = 0;
  const host = document.querySelector<HTMLElement>('main')!;
  for (const recipe of [
    { shape: 'dot-rounded-head-with-two-ears' }, {shape:'dot-rounded-head-with-two-ears',editable:true}, DOT_CHARACTERS.Todd,
    { shape: 'dot-circle-with-two-ears', eyes: 'Crescent inset' as const },
  ]) {
    const bot = mount(host, { ...dotAvatar(recipe), ...('editable' in recipe && avatarParts(recipe.shape)), size: 210, follow: false });
    try {
      const rig = bot.live.rig;
      rig.step = () => true;
      for (const material of ['flat','fluffy','glossy'] as const) {
        bot.update({ material });
        for (const dir of [-1,1] as const) {
          const track = new Rig({ clips: DOT_CLIPS, idle: false, blinks: false });
          track.play('dot-wink', { dir });
          track.step(.35 * DOT_CLIPS['dot-wink'].ms);
          rig.state.dotPlayback = track.state.dotPlayback;
          if (!rig.state.dotPlayback) throw new Error('wink did not enter playback');
          for (const yaw of [-1.78,-1.54,-1.32,0,1.32,1.54,1.78,Math.PI]) {
            Object.assign(rig.state.pose,{yaw,pitch:-.23,roll:.05});
            Object.assign(rig.state.eye,{x:Math.sign(yaw)*.93,y:-.82});
            rig.state.ultra = dir < 0 ? { amount: 1, phase: .3 } : undefined;
            bot.live.motion();
            const spill = detachedPixels(await materialPixels(host));
            if (spill > 2) errors.push(recipe.shape+' '+material+' wink '+dir+' yaw '+yaw+': '+spill+' isolated pixels');
            views++;
          }
        }
      }
    } finally { bot.destroy(); }
  }
  return { views, errors };
}

const motionWearers = [
  dotAvatar({shape:'dot-rounded-head-with-two-ears'}),
  dotAvatar({shape:'dot-rounded-diamond', depth:1}),
  dotAvatar({shape:'dot-heart', extra:'Hat', extraMount:'left'}),
  dotAvatar(DOT_CHARACTERS.Iris),
  dotAvatar(DOT_CATALOG.find(row => row.id === 'sunny')!.appearance),
  avatarParts('teardrop',{eyes:'Crescent inset'}),
  avatarParts(GALLERY.find(row => row.definition.id === 'egg')!.definition,{extra:'Headphones'}),
  { shape: 'blob' },
  avatarParts('dot-rounded-head-with-two-ears',{glasses:'Tall oval frames',extra:'Bow tie'}),
  avatarParts(GALLERY.find(row => row.definition.id === 'paint-brush')!.definition,{extra:'Beret',glasses:'Monocle'}),
  avatarParts(GALLERY.find(row => row.definition.id === 'paint-brush')!.definition,{extra:'Beret',extraMount:'handle-tip'}),
];
export const motionWearerCount = motionWearers.length;

/** Sample each track's largest horizontal excursion, vertical excursion and stretch.
 * The material must have transparent space on every side, including during a turn. */
export async function checkMotionBounds(index: number) {
  const options = motionWearers[index], host = document.querySelector<HTMLElement>('main')!;
  const bot = mount(host,{...options,clips:DOT_CLIPS,material:index%2?'fluffy':'glossy',size:104,follow:false});
  const failures: string[] = [];
  let views = 0;
  try {
    const rig = bot.live.rig;
    rig.step = () => true;
    for (const [name,clip] of Object.entries(DOT_CLIPS)) {
      for (const dir of [-1,1]) {
        const track = new Rig({clips:DOT_CLIPS,idle:false,blinks:false});
        track.play(name,{dir,amount:dir===1?1:2});
        const peaks = [-Infinity,-Infinity,-Infinity];
        const samples = [0,0,0];
        const frames = [];
        for (let i=0;i<64;i++) {
          track.step(clip.ms/65);
          const {pose,dotPlayback} = track.state;
          if (!dotPlayback) throw new Error('missing track '+name);
          frames.push({pose:{...pose}, playback:dotPlayback});
          const [x,y] = dotPlayback.offset;
          [Math.abs(x),Math.abs(y),Math.max(...dotPlayback.scale)].forEach((value,k) => {
            if (value > peaks[k]) { peaks[k] = value; samples[k] = i; }
          });
        }
        for (const i of new Set(samples)) {
          Object.assign(rig.state.pose,frames[i].pose);
          rig.state.dotPlayback = frames[i].playback;
          rig.state.ultra = dir<0 ? {amount:1,phase:.3} : undefined;
          bot.live.motion();
          const {width,height,data} = await materialPixels(host);
          let edge = 0, occupied = 0;
          for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
            if (data[4*(y*width+x)+3] < 64) continue;
            occupied++;
            if (!x || !y || x===width-1 || y===height-1) edge++;
          }
          if (edge || !occupied) failures.push(name+' direction '+dir+' sample '+i+' border '+edge+' painted '+occupied);
          views++;
        }
      }
    }
  } finally { bot.destroy(); }
  return {views,failures};
}
