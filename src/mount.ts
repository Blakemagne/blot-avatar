// A live avatar on any page, no framework: mount(host, { shape, size }) puts one in `host` and keeps it alive
// until destroy(). It is the same controller React's useLiveAvatar runs, called in the same order.

import { VIEW_BOX, colours } from './engine/draw';
import { writeLayers, type Paint } from './layers';
import { createLive, type Live, type LiveProps } from './live';
import { svgBox } from './still';
import { onMotion, reducedMotion } from './ticker';

export interface MountOptions extends LiveProps {
  /** '#rrggbb' or any CSS colour (default '#FD690F'). The eyes are drawn in a colour that stands out on it. */
  color?: string;
  /** The body's fill as any CSS value, over `color`, e.g. 'var(--ink)'. */
  fill?: string;
  /** The eyes' colour, any CSS value. Unset, they are dark on a pale '#rrggbb' `color` and white on anything else. */
  eyeFill?: string;
  /** For a body with antennas or stickers (jacrispy): their colours by key, over the body's own, e.g. { antenna: '#111' }. */
  paint?: Paint;
  /** A click, a tap, Enter or Space pokes it (not under reduced motion: nothing would happen). */
  pokeable?: boolean;
  /** Its name, for the poke button's label. */
  label?: string;
}

export interface Mounted {
  readonly live: Live;
  /** Change some options. Only what changed is acted on. */
  update(next: Partial<MountOptions>): void;
  poke(kind?: string): void;
  play(name: string, cue?: { dir?: number; amount?: number }): boolean;
  /** Stop, and leave the host as it was found. */
  destroy(): void;
}

const SVG = 'http://www.w3.org/2000/svg';

/** Hosts that have an avatar: one each, since the frame loop watches an element for one avatar. */
const taken = new WeakSet<HTMLElement>();
/** The attributes a pokeable avatar sets on its host, and puts back as they were. */
const BUTTON = ['role', 'tabindex', 'aria-label'] as const;

/**
 * Put a live avatar in `host`: a box of `size` px that the drawing overflows. The host should be in the
 * document: its position is read from the page's CSS (a static one becomes relative), and a host not yet
 * placed cannot say. One avatar per host; a second throws until the first is destroyed.
 */
export function mount(host: HTMLElement, o: MountOptions): Mounted {
  if (taken.has(host)) throw new Error('mount: this element already has an avatar; destroy() it first');
  taken.add(host);
  let opts: MountOptions = { ...o };
  const live = createLive(opts);

  // 1. The host becomes the slot.
  const was = { width: host.style.width, height: host.style.height, position: host.style.position };
  const attrs = BUTTON.map((a) => host.getAttribute(a));
  const sized = (size: number) => { host.style.width = `${size}px`; host.style.height = `${size}px`; };
  sized(opts.size);
  const placed = typeof getComputedStyle === 'function' ? getComputedStyle(host).position : host.style.position;
  if (!placed || placed === 'static') host.style.position = 'relative';

  // 2. The drawing.
  const svg = host.ownerDocument.createElementNS(SVG, 'svg');
  const paths = [0, 1, 2].map(() => host.ownerDocument.createElementNS(SVG, 'path'));
  // Antennas and stickers, for a body that has them: one group under the body, one over it, put in the first
  // time a drawing has any (so an avatar whose body has none stays one svg with three paths).
  const under = host.ownerDocument.createElementNS(SVG, 'g'), over = host.ownerDocument.createElementNS(SVG, 'g');
  let latest = live.first, grouped = false;
  const layered = (d: typeof latest) => {
    latest = d;
    if (!grouped && !d.layers?.length) return;
    if (!grouped) { svg.insertBefore(under, paths[0]); svg.insertBefore(over, paths[1]); grouped = true; }
    writeLayers(under, over, d, opts.paint);
  };
  const boxed = (size: number) => {
    const b = svgBox(size);
    svg.setAttribute('width', String(b.width));
    svg.setAttribute('height', String(b.height));
    svg.setAttribute('viewBox', VIEW_BOX);
    svg.style.position = 'absolute';
    svg.style.left = `${b.left}px`;
    svg.style.top = `${b.top}px`;
    svg.style.overflow = 'visible';
  };
  const paint = () => {
    const c = colours(opts.color ?? '#FD690F');
    paths[0].style.fill = opts.fill ?? c.fill;
    paths[1].style.fill = paths[2].style.fill = opts.eyeFill ?? c.eyeFill;
  };
  boxed(opts.size);
  svg.setAttribute('aria-hidden', 'true');
  paths[0].setAttribute('d', live.first.body);
  paths[1].setAttribute('d', live.first.eyes[0]);
  paths[2].setAttribute('d', live.first.eyes[1]);
  paint();
  for (const p of paths) svg.appendChild(p);
  layered(live.first);
  host.appendChild(svg);

  // 3. Alive, in React's effect order.
  const detach = live.attach(host, (d) => {
    paths[0].setAttribute('d', d.body);
    paths[1].setAttribute('d', d.eyes[0]);
    paths[2].setAttribute('d', d.eyes[1]);
    layered(d);
  });
  live.motion();
  live.follow(opts.follow);
  live.shape();
  live.face(opts.face);
  live.doing();

  // 5. A button while it can be poked.
  const click = () => live.poke();
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) live.poke(); }
  };
  let button = false;
  const syncPoke = () => {
    const want = !!opts.pokeable && !reducedMotion();
    if (want) host.setAttribute('aria-label', opts.label ? `Poke ${opts.label}` : 'Poke the avatar');
    if (want === button) return;
    button = want;
    if (want) {
      host.setAttribute('role', 'button');
      host.setAttribute('tabindex', '0');
      host.addEventListener('click', click);
      host.addEventListener('keydown', key);
    } else {
      // (Back as the host had them before it was a button.)
      BUTTON.forEach((a, i) => { const v = attrs[i]; if (v === null) host.removeAttribute(a); else host.setAttribute(a, v); });
      host.removeEventListener('click', click);
      host.removeEventListener('keydown', key);
    }
  };

  // 4. Reduced motion turned on or off.
  const unheard = onMotion(() => { live.motion(); syncPoke(); });
  syncPoke();

  let gone = false;
  return {
    live,
    update(next) {
      if (gone) return;
      const before = opts;
      opts = { ...opts, ...next };
      live.want(opts);
      const changed = (...keys: (keyof MountOptions)[]) => keys.some((k) => k in next && next[k] !== before[k]);
      if (changed('follow')) live.follow(opts.follow);
      if (changed('shape', 'size')) {
        sized(opts.size);
        boxed(opts.size);
        live.shape();
      }
      if (changed('face')) live.face(opts.face);
      if (changed('activity', 'form', 'rests', 'shape', 'size')) live.doing();
      if (changed('color', 'fill', 'eyeFill')) paint();
      if (changed('paint')) layered(latest);
      if (changed('pokeable', 'label')) syncPoke();
    },
    poke: (kind) => { if (!gone) live.poke(kind); },
    play: (name, cue) => !gone && live.play(name, cue),
    destroy() {
      if (gone) return;
      gone = true;
      detach();
      unheard();
      opts = { ...opts, pokeable: false };
      syncPoke();
      svg.remove();
      host.style.width = was.width;
      host.style.height = was.height;
      host.style.position = was.position;
      taken.delete(host);
    },
  };
}
