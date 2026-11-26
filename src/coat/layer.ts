import type { DotSolid } from '../engine/dot-features';
// One avatar's coat: a canvas under its body path, painted by the shared renderer and moved with the drawing.
// mount() and React's useLiveAvatar both use it.
//
// The picture is drawn again only when the body turns, the eyes change, or the colour, size or body does (and
// while ultracode's power comes or goes, which dyes the coat toward lavender; on every frame of a change of shape,
// whose outline moves under it: the coat is stretched onto it, and near half way two coats cross over; and while a
// loading figure's shape moves). A breath, a squash, a hop or a powered float is the drawing's affine, which only
// moves the canvas (a CSS transform) and draws nothing. In a
// frame of the shared loop the coat is painted there and then; outside one (a still picture, reduced motion, a body
// whose mesh is not made yet) it waits its turn in soon(), so that a page of them does not pile into one frame
// (making a body's mesh the first time is still one long task, which does hold up frames).
// Until a coat is painted, and wherever none can be, the body path stays filled as it always was.
// A coat that is faded right out but already names its next body (a loading figure's, in the flat middle of its
// way in or out) has that body's mesh made then, in soon(), so it is ready when its fur comes in. A change of shape
// names its other body (DrawnCoat.also) from the start, and that mesh is made then too. Near half way the two
// coats are painted together, each at its share, once both meshes are made: until then the one that is made shows
// alone, whole, and soon() makes the other and paints the two.

import { dotRenderer } from '../engine/dot-renderer-registry';
import type { Body } from '../engine/body';
import { PILE_REACH, coatMesh, type CoatMesh } from '../engine/coat';
import { VIEW, type CoatWarp, type Drawing, type DrawnCoat } from '../engine/draw';
import type { Rgb } from '../engine/dye';
import { FIGURE_REACH, type FigureShape } from '../engine/figures';
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
const NEUTRAL_ATTACHMENT = [1,0,0, 0,1,0, 0,0,1, 0,0,0] as const;
const attachments = new WeakMap<Body, readonly number[]>();

/** Fit accessories around the face. Handles and off-centre limbs can extend beyond it. */
function bodyAttachment(body: Body, mesh: CoatMesh, source: CoatMesh['box']) {
  const saved = attachments.get(body);
  if (saved) return saved;
  const box = mesh.box, cx = body.eyes.cx ?? 0;
  const half = Math.min(cx - box[0], box[3] - cx);
  const band = Math.max(.18, body.eyes.x * 1.4);
  let top = -Infinity, bottom = Infinity;
  for (let k = 0; k < mesh.vertices.length; k += 6) {
    if (Math.abs(mesh.vertices[k] - cx) > band) continue;
    top = Math.max(top, mesh.vertices[k + 1]);
    bottom = Math.min(bottom, mesh.vertices[k + 1]);
  }
  const target = [cx - half, Number.isFinite(bottom) ? bottom : box[1], box[2],
    cx + half, Number.isFinite(top) ? top : box[4], box[5]];
  const scale = [0, 1, 2].map(i => (target[i+3] - target[i]) / (source[i+3] - source[i]));
  const move = scale.map((s, i) => target[i] - s * source[i]);
  const axes = [scale[0],0,0, 0,scale[1],0, 0,0,scale[2], ...move];
  attachments.set(body, axes);
  return axes;
}

/** A pose and eyes this close to the ones drawn keep their picture: how far the body's edge or an eye has moved, device px. */
const SAME_VIEW = 0.25;
/**
 * Eyes that have only moved, to within this many device px, keep their field, moved with them. The field only
 * parts the pile and shades it a little round the eyes, which are drawn over it, so this need not be exact.
 */
const SAME_EYES = 0.5;
/** How far a coat reaches past its mesh, body units: the pile and the strands' tips. */
const REACH = 1.25 * PILE_REACH;

/**
 * How far from the middle a coat of `mesh` can be drawn, as the radius of a sphere at the middle that covers it
 * (what coatBox takes). Stretched (DrawnCoat.warp, stretched()), a point is moved out by no more than the outline
 * moved at either ray either side of it, so no further than at rest by more than the outline grew anywhere; and it
 * lies past the outline drawn by no more than its pile, CoatWarp.past and how much further one of those rays meets
 * its own outline than the other. The square is the smaller of the two.
 */
export function reachOf(mesh: CoatMesh, warp: CoatWarp | undefined): number {
  const r = mesh.radius + REACH;
  if (!warp) return r;
  const { own, reach } = warp, n = own.length;
  let most = 0, grow = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    most = Math.max(most, Math.max(reach[i], reach[j]) + Math.abs(own[i] - own[j]));
    grow = Math.max(grow, reach[i] - own[i]);
  }
  // (On screen, a sphere of radius r is r D / sqrt(D^2 - r^2) across, and one p across is p D / sqrt(D^2 + p^2) in
  // space. The pile on screen: its length, made larger by the perspective at its nearest and by how far that moves
  // a point already this far out.)
  const rest = (r * D) / Math.sqrt(D * D - r * r), past = most + warp.past + (REACH * (D + most + warp.past)) / (D - r);
  const out = Math.min(past, rest + grow);
  return (out * D) / Math.sqrt(D * D + out * out);
}

/** Bodies whose mesh is made (coatMesh keeps it): only those are painted in a frame. */
const ready = new WeakSet<Body>();
/** Bodies whose mesh is waiting in soon() to be made, ahead of their coat (see warm). */
const warming = new WeakSet<Body>();

/** Make `body`'s mesh soon, once, while its coat is not showing yet: so a frame can paint it as it comes in. */
function warm(body: Body): void {
  if (ready.has(body) || warming.has(body)) return;
  warming.add(body);
  soon(() => {
    warming.delete(body);
    if (coatable()) { coatMesh(body); ready.add(body); }
  });
}

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

/** The furthest any number has moved (any point of the eyes, any edge of a figure); Infinity when they are not the same shape. */
function drift(a: ArrayLike<number>, b: ArrayLike<number>): number {
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

/** What kind of figure shape (none for a body): pictures of two kinds are never the same. */
const kindOf = (s: FigureShape | undefined): string => (!s ? '' : s.kind === 'band' ? `band ${s.rays}` : 'balls');
/** A figure's shape as numbers, body units: its band's edges, or where its balls are. */
const numbersIn = (s: FigureShape | undefined): Float32Array => (!s ? NONE : s.kind === 'band' ? s.band : s.to);
const NONE = new Float32Array(0);

/**
 * A coat for the avatar whose body path is `body`. `canvasOf` gives the canvas to paint it in, the first time a
 * coat is painted and every time after: mount() makes it and puts it in place then; React's hook hands over the
 * one on its `coat` ref. The canvas is placed absolutely in the slot, as the svg is. `shown` is told whenever the
 * coat starts or stops showing, which can be outside a frame (a powered skin over it is then painted again).
 */
export function coatLayer(body: SVGPathElement, canvasOf: () => HTMLCanvasElement | null, shown?: () => void, glossy = false): CoatLayer {
  let latest: { d: Drawing; size: number; fill?: string } | null = null;
  let drop: (() => void) | null = null;
  let canvas: HTMLCanvasElement | null = null;
  /** Showing: the canvas on and the body path's fill turned down. */
  let on = false;
  /** What the canvas holds. */
  let held: { mesh: CoatMesh; rotation: Float64Array; eyes: string; points: number[]; colour: string; box: CoatBox; shape: string; figure: Float32Array } | null = null;
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
    // In a change of shape near half way, the two bodies' coats: in a frame, each only once its mesh is made. With one
    // of the two made, that one shows alone, whole, and soon() makes the other's mesh and paints both (see draw).
    const crossing = !!c.also && c.also.share > OFF;
    const base = ready.has(c.body) || !inFrame() ? { body: c.body, warp: c.warp } : crossing && ready.has(c.also!.body) ? c.also! : null;
    if (!base) { hide(); return; }
    const mesh = coatMesh(base.body);
    ready.add(base.body);
    const also = crossing && base.body === c.body && (ready.has(c.also!.body) || !inFrame()) ? { ...c.also!, mesh: coatMesh(c.also!.body) } : null;
    if (also) ready.add(also.body);
    // Stretched, a coat reaches as far as its stretch takes it: the square is made big enough for both. (A figure's
    // mesh is moved about: its square is the furthest any figure goes.)
    const style = c.dotFace && !base.warp && !crossing ? base.body.dotStyle : undefined;
    const extra = style && !style.character && !style.catalogId && style.extra !== 'None' && style.extra !== 'Headphones' ? dotRenderer?.dotMesh(style.extra) : undefined;
    const tint = style ? hexOf(style.extraColour) ?? painted(style.extraColour) ?? [31,31,31] as Rgb : undefined;
    const mountKey = extra && style && !base.body.wardrobeHost ? base.body.id + '/' + style.extra : undefined;
    const fit = mountKey && style && dotRenderer
      ? dotRenderer.builderFittings[mountKey + '/' + style.glasses] ?? dotRenderer.builderFittings[mountKey]
      : undefined;
    const model = base.body.wardrobeHost && style && style.extra !== 'None' && dotRenderer?.dotMesh('dot-rounded-triangle');
    const transferred = model && base.body.wardrobeHost ? bodyAttachment(base.body.wardrobeHost, mesh, model.box) : undefined;
    const ornament: DotSolid | undefined = extra && style ? {
      mesh: fit && dotRenderer ? dotRenderer.fittedMesh(extra, fit) : extra, tint: tint!,
      axes: transferred ?? (fit ? NEUTRAL_ATTACHMENT : dotRenderer?.dotAttachments[base.body.id]?.[style.extra] ?? NEUTRAL_ATTACHMENT), metal: style.extra === 'Crown',
    } : undefined;
    const radius = style?.extra !== 'None' && style ? 2.1 : c.shape ? FIGURE_REACH + REACH : Math.max(reachOf(mesh, base.warp), also ? reachOf(also.mesh, also.warp) : 0);
    const dpr = ratio(), box = coatBox(now.size, dpr, radius), pxPerUnit = (now.size * dpr) / 2;
    // Powered, the dye goes toward lavender, so even a dark Bot's fur is light enough to take the rainbow over it.
    const rgb = dyeAt(colourOf(now.fill), now.d.ultra?.amount ?? 0), key = rgb.join() + (style ? [style.originalEyes,style.depthScale,style.character,style.catalogId,style.eyes,style.glasses,style.extra,style.extraColour,c.dotFace?.left,c.dotFace?.right,c.dotFace?.x,c.dotFace?.y].join('/') : '') + (ornament ? '/' + base.body.id + '/' + style!.extra + '/' + style!.extraColour : '');
    // The picture it holds is kept for the same body, colour and square, with the pose and the eyes within SAME_VIEW.
    const points = held && held.eyes === c.eyes ? held.points : numbersOf(c.eyes);
    const same = !c.dotFace?.playback && !base.warp && held && held.mesh === mesh && held.colour === key && held.box.pixels === box.pixels && held.box.half === box.half &&
      held.box.cx === box.cx && apart(held.rotation, c.rotation) * mesh.radius * (D / (D - mesh.radius)) * pxPerUnit < SAME_VIEW &&
      drift(held.points, points) * (box.pixels / (2 * box.half)) < SAME_VIEW &&
      held.shape === kindOf(c.shape) && drift(held.figure, numbersIn(c.shape)) * pxPerUnit < SAME_VIEW;
    if (!same) {
      // The eye field at about the picture's own detail (device px a drawing unit), from 2 to 6 texels a unit.
      const perUnit = box.pixels / (2 * box.half), detail = Math.min(6, Math.max(2, Math.round(perUnit)));
      const field = glossy || style && !style.originalEyes ? null : fieldFor(c.eyes, points, detail, perUnit);
      const solids = style ? dotRenderer?.dotFeatures(base.body,c.dotFace,tint) ?? [] : [];
      if (transferred && style?.extra === 'Headphones') {
        for (const solid of solids) if (!solid.finish) solid.axes = transferred;
      }
      if (ornament) solids.push(ornament);
      const frame = { glossy, solids, depthScale: style?.depthScale, playback: c.dotFace?.playback, dotBody: style ? base.body.wardrobeHost ? 'blot' : base.body.id : undefined, character: style?.character, catalogId: style?.catalogId, orthographic: !!base.body.dotStyle && !base.body.wardrobeHost && !base.warp, shape: c.shape, rotation: c.rotation, cx: box.cx, cy: box.cy, half: box.half, pixels: box.pixels, pxPerUnit, colour: rgb, eyes: field };
      const image = renderCoat({ ...frame, mesh, warp: base.warp });
      if (!image) { held = null; hide(); return; }
      const n = image.size;
      if (el.width !== n || el.height !== n) { el.width = n; el.height = n; } else ctx.clearRect(0, 0, n, n);
      ctx.drawImage(image.canvas, image.x, image.y, n, n, 0, 0, n, n);
      if (also) {
        // The other body's coat with it, on the same outline. Where both have fur, this one at 1 - share and that one
        // at share; where only one has, that one whole (the other's own at twice its share, so whole at half way): the
        // same picture on both sides of half way, where the two swap places, and no fur seen through.
        // (After the first is copied out: the renderer draws every picture on one canvas.)
        const over = renderCoat({ ...frame, mesh: also.mesh, warp: also.warp });
        if (!over) { held = null; hide(); return; }
        ctx.globalAlpha = also.share;
        ctx.globalCompositeOperation = 'source-atop';
        ctx.drawImage(over.canvas, over.x, over.y, n, n, 0, 0, n, n);
        ctx.globalAlpha = Math.min(1, 2 * also.share);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(over.canvas, over.x, over.y, n, n, 0, 0, n, n);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      // (A stretched picture is never kept: the next frame's outline is another.)
      held = base.warp || c.dotFace?.playback ? null : { mesh, rotation: Float64Array.from(c.rotation), eyes: c.eyes, points, colour: key, box, shape: kindOf(c.shape), figure: numbersIn(c.shape).slice() };
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
      if (!c || c.opacity <= OFF || !mightCoat()) {
        if (c && mightCoat()) warm(c.body);
        drop?.(); drop = null; hide(); return;
      }
      // When a lost context comes back the coat is painted again, moving or not.
      restored ??= onRestored(lost);
      const crossing = !!c.also && c.also.share > OFF;
      if (inFrame() && (ready.has(c.body) || (crossing && ready.has(c.also!.body)))) {
        paint();
        // A coat that shows but whose mesh is not made yet waits for soon(), which makes it and paints both. The other
        // body in a change of shape has its mesh made ahead of its coat, as soon as the change names it.
        if (!ready.has(c.body) || (crossing && !ready.has(c.also!.body))) later();
        else { drop?.(); drop = null; if (c.also && !ready.has(c.also.body)) warm(c.also.body); }
        return;
      }
      // A body whose mesh is not made yet (a long frame skipped the faded-out middle where warm() makes it): the
      // picture held is another body's fur, so it goes until soon() paints this one, and the flat drawing shows.
      if (!ready.has(c.body)) hide();
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
