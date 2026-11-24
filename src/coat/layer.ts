// One avatar's coat: a canvas under its body path, painted by the shared renderer and moved with the drawing.
// mount() and React's useLiveAvatar both use it.
//
// The picture is drawn again only when the body turns, the eyes change, or the colour, size or body does (and
// while ultracode's power comes or goes, which dyes the coat toward lavender, and on every frame of a change of
// shape, whose outline moves under it: the coat is stretched onto it, and near half way two coats cross over). A breath, a squash, a hop or a
// powered float is the drawing's affine, which only moves the canvas (a CSS transform) and draws nothing. In a
// frame of the shared loop the coat is painted there and then; outside one (a still picture, reduced motion, a body
// whose mesh is not made yet) it waits its turn in soon(), so that a page of them does not pile into one frame
// (making a body's mesh the first time is still one long task, which does hold up frames).
// Until a coat is painted, and wherever none can be, the body path stays filled as it always was.

import type { Body } from '../engine/body';
import { PILE_REACH, coatMesh, type CoatMesh } from '../engine/coat';
import { VIEW, type Drawing, type DrawnCoat } from '../engine/draw';
import type { Rgb } from '../engine/dye';
import { D } from '../engine/math';
import { OVERDRAW, coatBox, type CoatBox } from '../still';
import { inFrame, soon } from '../ticker';
import { dyeAt } from '../ultra';
import { eyeField, polygonsOf, type EyeField } from './mask';
import { coatable, mightCoat, onRestored, renderCoat } from './renderer';

export interface CoatLayer {
  /**
   * Show this drawing's coat (Drawing.coat) on an avatar of `size` px whose body is `fill` (any CSS colour; unset,
   * the body path's own). A drawing without one, or one faded out, shows the body path filled.
   */
  draw(d: Drawing, size: number, fill?: string): void;
  /** Stop: the canvas hidden, the body path filled again, nothing left waiting. draw() starts it again. */
  stop(): void;
  /** Is a coat showing (and the body path's fill turned down for it)? */
  readonly showing: boolean;
  /** Is a paint waiting for its turn? */
  readonly pending: boolean;
}

/** A coat fainter than this is not shown. */
const OFF = 0.004;
/** A pose and eyes this close to the ones drawn keep their picture: how far the body's edge or an eye has moved, device px. */
const SAME_VIEW = 0.25;
/**
 * Eyes that have only moved, to within this many device px, keep their field, moved with them. The field only
 * parts the pile and shades it a little round the eyes, which are drawn over it, so this need not be exact.
 */
const SAME_EYES = 0.5;
/** How far a coat reaches past its mesh, body units: the pile and the strands' tips. */
const REACH = 1.25 * PILE_REACH;

/** Bodies whose mesh is made (coatMesh keeps it): only those are painted in a frame. */
const ready = new WeakSet<Body>();

/** A device pixel ratio that can be used. */
const ratio = (): number => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);

let probe: CanvasRenderingContext2D | null | undefined;

/** A CSS colour the page's style does not resolve for us (one in another syntax), as sRGB bytes; null if it is none. */
function painted(colour: string): Rgb | null {
  if (probe === undefined) {
    probe = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probe = c.getContext('2d', { willReadFrequently: true });
    }
  }
  if (!probe) return null;
  // (A colour the canvas does not take leaves the one before.)
  probe.fillStyle = '#010203';
  probe.fillStyle = colour;
  if (probe.fillStyle === '#010203') return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** A hex colour as bytes; null for anything else. */
function hexOf(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) return null;
  const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** The colour the page paints `el` in right now (so a var() follows its theme), or null while it cannot say. */
function seenOn(el: Element): Rgb | null {
  if (typeof getComputedStyle !== 'function' || !el.isConnected) return null;
  const seen = getComputedStyle(el).fill;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(seen);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : seen && seen !== 'none' ? painted(seen) : null;
}

/** The numbers in an eyes path (M and L with x, y pairs). */
const numbersOf = (eyes: string): number[] => polygonsOf(eyes).flat();

/** The furthest any point of the eyes has moved, drawing units; Infinity when they are not the same shape. */
function drift(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return Infinity;
  let most = 0;
  for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i] - b[i]));
  return most;
}

/**
 * How far the eyes at `b` have moved from `a` as a whole, drawing units, when every point moved that way to within
 * `within`; null when they changed shape more than that (a blink, a new face, a turn that has gone on a while).
 */
function shiftOf(a: readonly number[], b: readonly number[], within: number): [number, number] | null {
  if (a.length !== b.length || !a.length) return null;
  let dx = 0, dy = 0;
  for (let i = 0; i < a.length; i += 2) { dx += b[i] - a[i]; dy += b[i + 1] - a[i + 1]; }
  dx /= a.length / 2; dy /= a.length / 2;
  for (let i = 0; i < a.length; i += 2) {
    if (Math.abs(b[i] - a[i] - dx) > within || Math.abs(b[i + 1] - a[i + 1] - dy) > within) return null;
  }
  return [dx, dy];
}

/** How far apart two rotations are (the largest a unit vector can move between them is no more). */
function apart(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < 9; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * A coat for the avatar whose body path is `body`. `canvasOf` gives the canvas to paint it in, the first time a
 * coat is painted and every time after: mount() makes it and puts it in place then; React's hook hands over the
 * one on its `coat` ref. The canvas is placed absolutely in the slot, as the svg is. `shown` is told whenever the
 * coat starts or stops showing, which can be outside a frame (a powered skin over it is then painted again).
 */
export function coatLayer(body: SVGPathElement, canvasOf: () => HTMLCanvasElement | null, shown?: () => void): CoatLayer {
  let latest: { d: Drawing; size: number; fill?: string } | null = null;
  let drop: (() => void) | null = null;
  let canvas: HTMLCanvasElement | null = null;
  /** Showing: the canvas on and the body path's fill turned down. */
  let on = false;
  /** What the canvas holds. */
  let held: { mesh: CoatMesh; rotation: Float64Array; eyes: string; points: number[]; colour: string; box: CoatBox } | null = null;
  /** The styles last written, so that only what changed is written again. */
  let placed = '', moved = '', faded = '', filled = '';
  /** The body's colour: the last one that could be read. */
  let colour: Rgb = [253, 105, 15];
  /** The last eye field made, and the eyes it was made for. */
  let made: { field: EyeField; points: number[]; detail: number } | null = null;
  /** The eyes' field for this picture: the last one moved, while the eyes have only moved; else a new one. */
  const fieldFor = (eyes: string, points: number[], detail: number, perUnit: number): EyeField | null => {
    const shift = made && made.detail === detail ? shiftOf(made.points, points, SAME_EYES / perUnit) : null;
    if (made && shift) {
      const [x0, y0, x1, y1] = made.field.box, [dx, dy] = shift;
      return { ...made.field, box: [x0 + dx, y0 + dy, x1 + dx, y1 + dy] };
    }
    const field = eyeField(eyes, detail);
    made = field && { field, points, detail };
    return field;
  };
  /** Listening for a lost context to come back, while a coat is wanted. */
  let restored: (() => void) | null = null;

  const hide = () => {
    if (!on) return;
    on = false;
    if (canvas) canvas.style.display = 'none';
    body.style.fillOpacity = '';
    filled = '';
    shown?.();
  };

  /** The body's colour as bytes: a hex colour as given; anything else (a name, a var()) as the page paints the body. */
  const colourOf = (fill: string | undefined): Rgb => {
    colour = hexOf(fill ?? body.style.fill ?? '') ?? seenOn(body) ?? (fill ? painted(fill) : null) ?? colour;
    return colour;
  };

  /** Place the canvas for this frame: where its square is, the frame's affine, and the cross-fade. */
  const show = (c: DrawnCoat, box: CoatBox, size: number) => {
    const el = canvas!;
    const place = `${box.left}|${box.width}`;
    if (place !== placed) {
      placed = place;
      el.style.position = 'absolute';
      el.style.left = `${box.left}px`;
      el.style.top = `${box.top}px`;
      el.style.width = el.style.height = `${box.width}px`;
      el.style.transformOrigin = '0 0';
    }
    // The affine moves drawing units: X' = a X + e. On the canvas's own px, about its corner (x0 drawing units),
    // that is a times as wide and moved by k ((a - 1) x0 + e) px, k px to a drawing unit.
    const [a, , , d, e, f] = c.affine, k = (size * OVERDRAW) / VIEW, x0 = box.cx - box.half, y0 = box.cy - box.half;
    const move = a === 1 && d === 1 && e === 0 && f === 0 ? '' : `matrix(${round3(a)},0,0,${round3(d)},${round3(k * ((a - 1) * x0 + e))},${round3(k * ((d - 1) * y0 + f))})`;
    if (move !== moved) { moved = move; el.style.transform = move; }
    // Fading in: first the coat over the flat body, then the flat body away, so nothing behind shows through.
    const o = c.opacity, fade = o >= 0.5 ? '' : String(round3(2 * o)), fill = o <= 0.5 ? '' : String(round3(2 * (1 - o)));
    if (fade !== faded) { faded = fade; el.style.opacity = fade; }
    if (fill !== filled) { filled = fill; body.style.fillOpacity = fill; }
    if (!on) { on = true; el.style.display = ''; shown?.(); }
  };

  const paint = () => {
    const now = latest, c = now?.d.coat;
    if (!now || !c || c.opacity <= OFF || !coatable()) { hide(); return; }
    const el = canvasOf();
    if (el !== canvas) {
      hide();
      canvas?.removeEventListener('contextrestored', lost);
      canvas = el;
      // (A GPU reset can blank the canvas's own pixels too.)
      canvas?.addEventListener('contextrestored', lost);
      held = null;
      placed = moved = faded = '';
    }
    const ctx = el?.getContext('2d');
    if (!el || !ctx) { hide(); return; }
    const mesh = coatMesh(c.body);
    ready.add(c.body);
    const also = c.also ? { ...c.also, mesh: coatMesh(c.also.body) } : null;
    if (also) ready.add(also.body);
    // Stretched, a coat reaches as far as its stretch takes it: the square is made big enough for both.
    const most = (w: Float64Array | undefined) => (w ? w.reduce((m, v) => Math.max(m, v), 1) : 1);
    const radius = Math.max(mesh.radius * most(c.warp), also ? also.mesh.radius * most(also.warp) : 0);
    const dpr = ratio(), box = coatBox(now.size, dpr, radius + REACH), pxPerUnit = (now.size * dpr) / 2;
    // Powered, the dye goes toward lavender, so even a dark Bot's fur is light enough to take the rainbow over it.
    const rgb = dyeAt(colourOf(now.fill), now.d.ultra?.amount ?? 0), key = rgb.join();
    // The picture it holds is kept for the same body, colour and square, with the pose and the eyes within SAME_VIEW.
    const points = held && held.eyes === c.eyes ? held.points : numbersOf(c.eyes);
    const same = !c.warp && held && held.mesh === mesh && held.colour === key && held.box.pixels === box.pixels && held.box.half === box.half &&
      held.box.cx === box.cx && apart(held.rotation, c.rotation) * mesh.radius * (D / (D - mesh.radius)) * pxPerUnit < SAME_VIEW &&
      drift(held.points, points) * (box.pixels / (2 * box.half)) < SAME_VIEW;
    if (!same) {
      // The eye field at about the picture's own detail (device px a drawing unit), from 2 to 6 texels a unit.
      const perUnit = box.pixels / (2 * box.half), detail = Math.min(6, Math.max(2, Math.round(perUnit)));
      const field = fieldFor(c.eyes, points, detail, perUnit);
      const frame = { rotation: c.rotation, cx: box.cx, cy: box.cy, half: box.half, pixels: box.pixels, pxPerUnit, colour: rgb, eyes: field };
      const image = renderCoat({ ...frame, mesh, warp: c.warp });
      if (!image) { held = null; hide(); return; }
      const n = image.size;
      if (el.width !== n || el.height !== n) { el.width = n; el.height = n; } else ctx.clearRect(0, 0, n, n);
      ctx.drawImage(image.canvas, image.x, image.y, n, n, 0, 0, n, n);
      if (also) {
        // The other body's coat over it, on the same outline: where both are whole, a blend of the two.
        const over = renderCoat({ ...frame, mesh: also.mesh, warp: also.warp });
        if (over) {
          ctx.globalAlpha = also.share;
          ctx.drawImage(over.canvas, over.x, over.y, n, n, 0, 0, n, n);
          ctx.globalAlpha = 1;
        }
      }
      // (A stretched picture is never kept: the next frame's outline is another.)
      held = c.warp ? null : { mesh, rotation: Float64Array.from(c.rotation), eyes: c.eyes, points, colour: key, box };
    }
    show(c, box, now.size);
  };

  const later = () => { drop ??= soon(() => { drop = null; paint(); }); };
  /** A context came back: the picture held may be gone with it, so it is drawn again. */
  const lost = () => { held = null; later(); };

  return {
    draw(d, size, fill) {
      latest = { d, size, fill };
      const c = d.coat;
      if (!c || c.opacity <= OFF || !mightCoat()) { drop?.(); drop = null; hide(); return; }
      // When a lost context comes back the coat is painted again, moving or not.
      restored ??= onRestored(lost);
      if (inFrame() && ready.has(c.body) && (!c.also || ready.has(c.also.body))) { drop?.(); drop = null; paint(); return; }
      later();
    },
    stop() {
      drop?.();
      drop = null;
      restored?.();
      restored = null;
      latest = null;
      held = null;
      hide();
      canvas?.removeEventListener('contextrestored', lost);
      canvas = null;
    },
    get showing() { return on; },
    get pending() { return drop !== null; },
  };
}
