import { avatarParts, dotAvatar, dotStageLayout, mount, DOT_CHARACTERS, DOT_CATALOG, type DotAppearance, type Material } from '../src/index';
import type { Mounted } from '../src/mount';

type Spec = Partial<DotAppearance> & { editable?: boolean; stageColour?: string; material?: Material; catalog?: string; preset?: keyof typeof DOT_CHARACTERS; turn?: [number, number, number] };
let avatar: Mounted | undefined;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function recipe(spec: Spec): DotAppearance {
  const config = spec.catalog ? DOT_CATALOG.find(p => p.id === spec.catalog)!.appearance : spec.preset ? DOT_CHARACTERS[spec.preset]
    : { shape: 'dot-rounded-triangle', extraColour: '#FFCC38', ...spec };
  return { ...config, ...(spec.parts && { parts: spec.parts }), depth: spec.depth };
}

/** Paint just the two floor layers for an independent alpha comparison against their live passes. */
export function ground(spec: Spec, pixels = 512): void {
  const main = document.querySelector<HTMLElement>('main')!;
  document.body.style.margin = '0';
  Object.assign(main.style, { width: pixels+'px', height: pixels+'px', margin: '0',
    backgroundImage: dotStageLayout(recipe(spec),pixels).background });
}

/** Exercise the public mount and capture its material canvas in a registered orthographic frame. */
export async function capture(spec: Spec, pixels = 512): Promise<string> {
  avatar?.destroy();
  const host = document.querySelector<HTMLElement>('main')!;
  const size = pixels * 296 / 512;
  host.style.width = host.style.height = size + 'px';
  const look = recipe(spec);
  avatar = mount(host, { ...dotAvatar(look), ...(spec.editable && avatarParts(look.shape, look)), ...(spec.stageColour && { color:spec.stageColour }), ...(spec.material && {material:spec.material}), size, follow: false });
  const rig = avatar.live.rig;
  const [yaw, pitch, roll] = spec.turn ?? [0, 0, 0];
  Object.assign(rig.state.pose, { yaw, pitch, roll });
  rig.step = () => true;
  avatar.live.motion();
  const deadline = performance.now() + 15000;
  do { await frame(); } while (!host.querySelector('canvas')?.getClientRects().length && performance.now() < deadline);
  const material = host.querySelector('canvas');
  if (!material?.getClientRects().length) throw Error('Material canvas did not paint');
  const image = document.createElement('canvas');
  image.width = image.height = pixels;
  const ctx = image.getContext('2d')!;
  const bounds = material.getBoundingClientRect(), box = host.getBoundingClientRect();
  ctx.drawImage(material, (pixels-size)/2 + bounds.left-box.left, (pixels-size)/2 + bounds.top-box.top, bounds.width, bounds.height);
  return image.toDataURL().split(',')[1];
}
