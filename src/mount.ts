// A live avatar on any page, no framework: mount(host, { shape, size }) puts one in `host` and keeps it alive
// until destroy(). It is the same controller React's useLiveAvatar runs, called in the same order.

import { coatLayer, type CoatLayer } from './coat/layer';
import { VIEW_BOX, colours } from './engine/draw';
import { writeLayers, type Paint } from './layers';
import { createLive, type Live, type LiveProps } from './live';
import { glowFilter, paintEffects, type FxPaint } from './paint';
import { svgBox, type Shape } from './still';
import { onMotion, reducedMotion } from './ticker';

export interface MountOptions extends LiveProps {
  /** '#rrggbb' or any CSS colour (default '#FD690F'). The eyes are drawn in a colour that stands out on it. */
  color?: string;
  /** The body's fill as any CSS value, over `color`, e.g. 'var(--ink)'. */
  fill?: string;
  /** The eyes' colour, any CSS value. Unset, they are dark on a pale '#rrggbb' `color` and white on anything else. */
  eyeFill?: string;
  /** For a body with antennas or decals: their colours by key, over the body's own, e.g. { antenna: '#111' }. */
  paint?: Paint;
  /** The effects' colour (a mark, sparks, rings, Zs, a glow), any CSS value. Unset, the body's. */
  accent?: string;
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
  /** Go to another shape for a moment and come back. */
  visit(shape: Shape, stay?: number): void;
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
  // Antennas and decals, for a body that has them: one group under the body, one over it, put in the first
  // time a drawing has any (so an avatar whose body has none stays one svg with three paths).
  const under = host.ownerDocument.createElementNS(SVG, 'g'), over = host.ownerDocument.createElementNS(SVG, 'g');
  let latest = live.first, grouped = false;
  const layered = (d: typeof latest) => {
    latest = d;
    if (!grouped && !d.layers?.length) return;
    if (!grouped) {
      if (split) split.below.appendChild(under); else svg.insertBefore(under, paths[0]);
      svg.insertBefore(over, paths[1]);
      grouped = true;
    }
    writeLayers(under, over, d, opts.paint);
  };
  // The effects: what is behind the body, and what is in front of it.
  const back = host.ownerDocument.createElementNS(SVG, 'g') as SVGGElement, front = host.ownerDocument.createElementNS(SVG, 'g') as SVGGElement;
  const boxed = (size: number) => {
    const b = svgBox(size);
    for (const s of split ? [split.below, svg] : [svg]) {
      s.setAttribute('width', String(b.width));
      s.setAttribute('height', String(b.height));
      s.setAttribute('viewBox', VIEW_BOX);
      s.style.position = 'absolute';
      s.style.left = `${b.left}px`;
      s.style.top = `${b.top}px`;
      s.style.overflow = 'visible';
    }
  };

  // The coat, for a fluffy body: a canvas between what is under the body and the body, painted by the shared
  // renderer (coat/layer.ts). It goes in the first time a coat is painted, with a second svg under it for the
  // effects behind and the antennas and decals under the body. Until then, and wherever no coat can be painted,
  // the avatar is the one svg it always was.
  let coat: CoatLayer | null = null, split: { below: SVGSVGElement; canvas: HTMLCanvasElement } | null = null;
  const canvasOf = (): HTMLCanvasElement => {
    if (!split) {
      const doc = host.ownerDocument, below = doc.createElementNS(SVG, 'svg'), canvas = doc.createElement('canvas');
      split = { below, canvas };
      below.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.position = 'absolute';
      canvas.style.display = 'none';
      below.appendChild(back);
      if (grouped) below.appendChild(under);
      host.insertBefore(below, svg);
      host.insertBefore(canvas, svg);
      boxed(opts.size);
    }
    return split.canvas;
  };
  /** Wear the material asked for: a fluffy one gets its coat; a flat one is one svg again. */
  const material = () => {
    if (opts.material === 'fluffy') { coat ??= coatLayer(paths[0], canvasOf); return; }
    coat?.stop();
    coat = null;
    if (!split) return;
    svg.insertBefore(back, paths[0]);
    if (grouped) svg.insertBefore(under, paths[0]);
    split.below.remove();
    split.canvas.remove();
    split = null;
    svg.style.filter = glowFilter(last, opts.size, colour());
  };
  /** The glow: round the coat and what is under it while a coat shows, round the one svg while none does. */
  const glowed = (glow: string) => {
    svg.style.filter = coat?.showing ? '' : glow;
    if (split) split.below.style.filter = split.canvas.style.filter = glow;
  };
  const colour = (): FxPaint => {
    const c = colours(opts.color ?? '#FD690F');
    return { fill: opts.fill ?? c.fill, eyeFill: opts.eyeFill ?? c.eyeFill, accent: opts.accent };
  };
  let last = live.first;
  const paint = () => {
    const c = colour();
    paths[0].style.fill = c.fill;
    paths[1].style.fill = paths[2].style.fill = c.eyeFill;
    paintEffects(back, front, last, c);
    // (A coat at rest is not drawn again by itself: it is told the new colour.)
    coat?.draw(last, opts.size, c.fill);
  };
  boxed(opts.size);
  svg.setAttribute('aria-hidden', 'true');
  paths[0].setAttribute('d', live.first.body);
  paths[1].setAttribute('d', live.first.eyes[0]);
  paths[2].setAttribute('d', live.first.eyes[1]);
  paint();
  svg.appendChild(back);
  for (const p of paths) svg.appendChild(p);
  layered(live.first);
  svg.appendChild(front);
  host.appendChild(svg);
  material();

  // 3. Alive, in React's effect order.
  const detach = live.attach(host, (d) => {
    last = d;
    paths[0].setAttribute('d', d.body);
    paths[1].setAttribute('d', d.eyes[0]);
    paths[2].setAttribute('d', d.eyes[1]);
    layered(d);
    const c = colour();
    coat?.draw(d, opts.size, c.fill);
    paintEffects(back, front, d, c);
    glowed(glowFilter(d, opts.size, c));
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
      if (changed('shape', 'body', 'size')) {
        sized(opts.size);
        boxed(opts.size);
        live.shape();
      }
      if (changed('face')) live.face(opts.face);
      if (changed('activity', 'form', 'rests', 'shape', 'body', 'size', 'mark', 'personality')) live.doing();
      if (changed('color', 'fill', 'eyeFill', 'accent')) paint();
      if (changed('paint')) layered(latest);
      if (changed('pokeable', 'label')) syncPoke();
      if (changed('material')) { material(); live.motion(); }
    },
    poke: (kind) => { if (!gone) live.poke(kind); },
    play: (name, cue) => !gone && live.play(name, cue),
    visit: (shape, stay) => { if (!gone) live.visit(shape, stay); },
    destroy() {
      if (gone) return;
      gone = true;
      detach();
      unheard();
      opts = { ...opts, pokeable: false, material: 'flat' };
      syncPoke();
      material();
      svg.remove();
      host.style.width = was.width;
      host.style.height = was.height;
      host.style.position = was.position;
      taken.delete(host);
    },
  };
}
