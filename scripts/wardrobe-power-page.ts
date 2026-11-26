// Browser side of the wardrobe power regression. Freeze the rig's pose so a
// changed eye or accessory pixel cannot be explained by a blink or a head turn.
import { BODIES, DOT_CATALOG, DOT_CHARACTERS, DOT_EYES, DOT_EXTRAS, DOT_GLASSES, DOT_SHAPES,
  GALLERY, avatarParts, dotAvatar, dotExtras, mount, type Material } from '../src/index';

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
