// Ultracode's finish (Rig.setUltra), painted: the rainbow, its sheen and its glass rim over the body path, and the
// colours its halo, its twinkles and the eyes take. The engine says only how much power there is and where the
// rainbow's bands are (Drawing.ultra); this is how a page paints that. skinMarkup gives the skin as SVG markup,
// with no DOM (for a still); paintSkin writes the same skin into an svg group, frame by frame (mount() and React's
// useLiveAvatar). Both are made from one description of it, so a still and a live avatar cannot drift apart.
// (The look is the motion study's, MIT, Nick Vasilescu and Blakemagne.)

import { PILE_REACH } from './engine/coat';
import { VIEW_UNIT, type Drawing } from './engine/draw';
import type { Rgb } from './engine/dye';

/** The rainbow's colours, in order round its cycle: the motion study's Prism. */
export const ULTRA_PALETTE: readonly string[] = ['#ff609d', '#ffab70', '#fff18a', '#63f5bd', '#53baff', '#8d75ff', '#fa72e9'];
/** The eyes' colour while powered: a dark ink, which shows on every band (white eyes would go on the yellow one). */
export const ULTRA_INK = '#181024';
/** Fur is dyed toward this while powered: light enough for the rainbow's hue to show on a dark Bot's fur. */
export const ULTRA_LAVENDER = '#a58bfa';
/**
 * The rainbow's line across the drawing box, in drawing units (x1, y1, x2, y2): lower left to upper right, the
 * palette once round along it and repeating past its ends. The bands slide back along it, once round as
 * Drawing.ultra.phase goes from 0 to 1.
 */
export const RAINBOW_LINE: readonly number[] = [7, 35, 51, 15];
/**
 * The glass rim, stroked under the rainbow's fill: only its outer half shows, round the whole shape, with no seams.
 * Nearly white and thin, as in the study (about 2 px of it shows at 240 px): a wider or greyer one reads as an
 * outline.
 */
export const RIM = 'rgba(255,255,255,.9)';
/** The rim's width: RIM_WIDTH drawing units, and never under RIM_PX px, so a small avatar keeps a thin line of it. */
export const RIM_WIDTH = 0.6, RIM_PX = 2.3;
/**
 * The sheen, a radial gradient on the body's own box (so it sits the same on every body): a white glare up and to
 * the left, clearing, a faint dark band inside the edge, and a bright edge. Its stops are [offset, colour, opacity].
 */
export const SHEEN = { cx: 0.36, cy: 0.36, r: 0.79, fx: 0.27, fy: 0.15 } as const;
export const SHEEN_STOPS: readonly (readonly [number, string, number])[] = [
  [0, '#ffffff', 0.86], [0.35, '#ffffff', 0.13], [0.63, '#220e50', 0.08], [0.8, '#251356', 0.24], [0.95, '#ffffff', 0.52],
];
/** Over a coat of fur the sheen is this much fainter: the fur has its own light. */
export const SHEEN_ON_FUR = 0.6;
/**
 * The sheen over fur: only its glare, gone well inside the edge. The glass's dark band and bright edge end at the
 * body path, but the pile stands out past it, so over fur they drew a pale ring inside the coat, where the path
 * ends and the fur goes on.
 */
export const FUR_SHEEN_STOPS: readonly (readonly [number, string, number])[] = [[0, '#ffffff', 0.86], [0.35, '#ffffff', 0.13], [0.6, '#ffffff', 0]];
/**
 * Over fur the blended rainbow is stroked this wide too (drawing units: the pile's reach, PILE_REACH, so half of it
 * out past the outline), so the pile standing out there takes the rainbow as well as the fur inside it. The blend
 * tints the page in the gaps between the hairs too: twice as wide, that showed as a bright band past the tips on a
 * light page. The few longest hairs' tips, past it, stay lavender.
 */
export const PILE_TINT = PILE_REACH * VIEW_UNIT;
/** The halo, a radial gradient on its disc's own box: indigo, then violet, fading out to its edge. */
export const HALO_STOPS: readonly (readonly [number, string, number])[] = [[0.28, '#737bff', 0.21], [0.67, '#b25ef1', 0.1], [1, '#b25ef1', 0]];

const SVG = 'http://www.w3.org/2000/svg';
/** Drawing units across a slot (the drawing box is VIEW across, OVERDRAW times the slot). */
const SLOT = 36;

/** An attribute that a frame sets, or takes away (null). 'mix-blend-mode' is written as a style. */
type Frame = Record<string, string | null>;

/** An element of the skin: its tag, its attributes, and what is in it. */
interface Node { tag: string; attrs: Frame; kids?: Node[] }

const num = (v: number): string => String(Math.round(v * 1000) / 1000);
const stops = (list: readonly (readonly [number, string, number])[]): Node[] =>
  list.map(([at, colour, alpha]) => ({ tag: 'stop', attrs: { offset: num(at), 'stop-color': colour, 'stop-opacity': num(alpha) } }));

/** The paint servers a skin brings, by its id: the rainbow (its twinkles use it too), the sheen, the halo. */
const ids = (id: string) => ({ rainbow: `${id}-rainbow`, sheen: `${id}-sheen`, halo: `${id}-halo`, furSheen: `${id}-fur-sheen` });

/**
 * A skin's parts before a frame's own attributes: its paint servers, the rainbow blended into fur, the flat rainbow
 * (and its rim), the glass's sheen, and the fur's.
 */
function skinTree(id: string): Node[] {
  const at = ids(id), [x1, y1, x2, y2] = RAINBOW_LINE;
  // The palette once round, back to where it started, so a repeat has no seam.
  const bands = [...ULTRA_PALETTE, ULTRA_PALETTE[0]].map((colour, i) => ({ tag: 'stop', attrs: { offset: num(i / ULTRA_PALETTE.length), 'stop-color': colour } }));
  return [
    { tag: 'defs', attrs: {}, kids: [
      { tag: 'linearGradient', attrs: { id: at.rainbow, gradientUnits: 'userSpaceOnUse', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), spreadMethod: 'repeat' }, kids: bands },
      { tag: 'radialGradient', attrs: { id: at.sheen, cx: num(SHEEN.cx), cy: num(SHEEN.cy), r: num(SHEEN.r), fx: num(SHEEN.fx), fy: num(SHEEN.fy) }, kids: stops(SHEEN_STOPS) },
      { tag: 'radialGradient', attrs: { id: at.halo }, kids: stops(HALO_STOPS) },
      { tag: 'radialGradient', attrs: { id: at.furSheen, cx: num(SHEEN.cx), cy: num(SHEEN.cy), r: num(SHEEN.r), fx: num(SHEEN.fx), fy: num(SHEEN.fy) }, kids: stops(FUR_SHEEN_STOPS) },
    ] },
    { tag: 'path', attrs: { fill: `url(#${at.rainbow})`, stroke: `url(#${at.rainbow})`, 'stroke-width': num(PILE_TINT), 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { fill: `url(#${at.rainbow})`, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } },
    { tag: 'path', attrs: { fill: `url(#${at.sheen})` } },
    { tag: 'path', attrs: { fill: `url(#${at.furSheen})` } },
  ];
}

/** The rim's width in drawing units on an avatar of `size` px. */
export const rimWidth = (size: number): number => Math.max(RIM_WIDTH, (RIM_PX * SLOT) / Math.max(1, size));

/**
 * What a frame writes, element by element: the group, the rainbow's gradient, the blended rainbow's path, the flat
 * rainbow's path, the glass's sheen, the fur's sheen. `fur` is how much of a coat of fur shows through the body path (furShown).
 * Flat (no fur), the group fades as a whole over the body's own colour, and the rim is stroked under the rainbow,
 * faded by the power once more: it comes in with the glass, not as a grey ring round a body that is still mostly its
 * own colour. Over fur, the rainbow tints the fur under it (mix-blend-mode color), stroked out over the pile, and
 * the flat rainbow (glass, with its rim) covers only the share the flat body does, so the two cross-fade as the
 * coat and the flat body do, and so do the glass's sheen and the fur's. Then each path fades by itself: a group that is not opaque would keep the blend from
 * reaching the coat. A path with no share is not drawn (no `d`).
 */
function frameOf(d: Drawing, size: number, fur: number): [Frame, Frame, Frame, Frame, Frame, Frame] {
  const u = d.ultra!, k = Math.min(1, Math.max(0, u.amount)), [x1, y1, x2, y2] = RAINBOW_LINE;
  const f = Math.min(1, Math.max(0, fur)), on = f > 0, glass = on ? 1 - f : 1;
  return [
    { opacity: on ? null : num(k) },
    { gradientTransform: `translate(${num((x1 - x2) * u.phase)} ${num((y1 - y2) * u.phase)})` },
    { d: on ? d.body : null, opacity: on ? num(k * f) : null, 'mix-blend-mode': on ? 'color' : null },
    { d: glass > 0 ? d.body : null, opacity: on ? num(k * glass) : null, stroke: RIM, 'stroke-width': num(rimWidth(size)), 'stroke-opacity': num(k) },
    { d: glass > 0 ? d.body : null, opacity: on ? num(k * glass) : null },
    { d: on ? d.body : null, opacity: on ? num(k * SHEEN_ON_FUR * f) : null },
  ];
}

const escape = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function markup(n: Node): string {
  let attrs = '', style = '';
  for (const [k, v] of Object.entries(n.attrs)) {
    if (v === null) continue;
    if (k === 'mix-blend-mode') style += `${k}:${v};`;
    else attrs += ` ${k}="${escape(v)}"`;
  }
  if (style) attrs += ` style="${style}"`;
  const kids = n.kids?.map(markup).join('') ?? '';
  return kids ? `<${n.tag}${attrs}>${kids}</${n.tag}>` : `<${n.tag}${attrs}/>`;
}

/** A node with a frame's attributes over its own. */
const framed = (n: Node, f: Frame): Node => ({ ...n, attrs: { ...n.attrs, ...f } });

/**
 * A drawing's skin as SVG markup, with no DOM: a <g> to put right after the body path (before anything painted over
 * the body, and the eyes), for an avatar of `size` px. Its paint servers' ids start with `id`, which must be unique
 * on the page. `fur` is how much of a coat of fur under it shows (furShown; 0, none, by default). Empty when the
 * drawing has no power (Drawing.ultra).
 * Its halo and twinkles are the drawing's effects; paint them with skinPaint(id). Fill the eyes with eyeInk.
 */
export function skinMarkup(d: Drawing, id: string, size: number, fur = 0): string {
  if (!d.ultra) return '';
  const [group, bands, ...paths] = frameOf(d, size, fur), [defs, ...nodes] = skinTree(id);
  const [line, ...rest] = defs.kids!;
  return markup({ tag: 'g', attrs: group, kids: [{ ...defs, kids: [framed(line, bands), ...rest] }, ...nodes.map((n, i) => framed(n, paths[i]))] });
}

/** The paints of a skin given `id`, for the effects (FxPaint): its rainbow for the twinkles, and its halo. */
export const skinPaint = (id: string): { rainbow: string; halo: string } => ({ rainbow: `url(#${ids(id).rainbow})`, halo: `url(#${ids(id).halo})` });

let made = 0;
/** A new id for a skin's paint servers, unique on the page. */
export const ultraId = (): string => `blot-ultra-${++made}`;

function build(doc: Document, n: Node): Element {
  const el = doc.createElementNS(SVG, n.tag);
  for (const [k, v] of Object.entries(n.attrs)) if (v !== null) el.setAttribute(k, v);
  for (const kid of n.kids ?? []) el.appendChild(build(doc, kid));
  return el;
}

/** Write a frame's attributes into an element: only those that changed. */
function write(el: Element, f: Frame): void {
  for (const [k, v] of Object.entries(f)) {
    if (k === 'mix-blend-mode') {
      const s = (el as SVGElement).style;
      if (s.mixBlendMode !== (v ?? '')) s.mixBlendMode = v ?? '';
    } else if (v === null) {
      if (el.getAttribute(k) !== null) el.removeAttribute(k);
    } else if (el.getAttribute(k) !== v) el.setAttribute(k, v);
  }
}

/**
 * Paint a drawing's skin into `group`, an svg group right after the body path, on an avatar of `size` px: filled
 * the first time a drawing has power (with paint servers whose ids start with `id`), written in place on every
 * frame after, and emptied when the power is gone. `fur` (furShown): how much of a coat of fur shows under the
 * body path, which the rainbow tints. Nothing between the group and the coat's canvas may isolate that blend (a
 * filter, an opacity under 1, a transform on the svg).
 */
export function paintSkin(group: SVGGElement, d: Drawing, size: number, fur: number, id: string): void {
  const kids = group.children;
  if (!d.ultra) {
    // (Counted down by index, not "while there are any": not every DOM's children is a live list.)
    for (let i = kids.length - 1; i >= 0; i--) kids[i].remove();
    if (group.getAttribute('opacity') !== null) group.removeAttribute('opacity');
    return;
  }
  if (!kids.length) for (const n of skinTree(id)) group.appendChild(build(group.ownerDocument, n));
  const f = frameOf(d, size, fur), [defs, ...paths] = group.children;
  write(group, f[0]);
  write(defs.children[0], f[1]);
  paths.forEach((p, i) => write(p, f[i + 2]));
}

/**
 * How much of a coat of fur shows through the body path in this drawing, 0 to 1 (paintSkin's `fur`): none unless a
 * coat shows (`showing`, the coat layer's), all of it while all of the coat does. While a coat fades, for a change of
 * shape or a loading figure, the coat layer fills the flat body over it, from none at full opacity to all of it at
 * half (2 * (1 - opacity)); the rest is fur. A rainbow blended into the flat body would tint the body's own colour,
 * so the skin covers that share as glass, the flat skin, and blends only into the fur's.
 */
export const furShown = (showing: boolean, d: Drawing): number => (showing ? Math.min(1, Math.max(0, 2 * (d.coat?.opacity ?? 0) - 1)) : 0);

/** A hex colour ('#rgb' or '#rrggbb') as bytes; null for anything else. */
function hexBytes(colour: string): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!hex) return null;
  const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const mixBytes = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as unknown as Rgb;
const hexOf = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const INK = hexBytes(ULTRA_INK)!, LAVENDER = hexBytes(ULTRA_LAVENDER)!;

/**
 * The eyes' colour at power k (Drawing.ultra.amount): their own at 0, exactly as given, ULTRA_INK at 1, and mixed
 * between. A hex colour is mixed here; any other CSS colour (a name, a var()) by the browser, with color-mix().
 */
export function eyeInk(eyeFill: string, k: number): string {
  if (!(k > 0)) return eyeFill;
  if (k >= 1) return ULTRA_INK;
  const own = hexBytes(eyeFill);
  return own ? hexOf(mixBytes(own, INK, k)) : `color-mix(in srgb, ${eyeFill}, ${ULTRA_INK} ${num(100 * k)}%)`;
}

/** A coat's dye at power k: its own at 0, exactly, and toward ULTRA_LAVENDER as the power comes on (whole bytes). */
export const dyeAt = (dye: Rgb, k: number): Rgb => (k > 0 ? mixBytes(dye, LAVENDER, Math.min(1, k)) : dye);
