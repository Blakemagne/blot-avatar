// The extra paths of a body that has antennas or decals (Drawing.layers), written into two SVG groups: one
// under the body path and one over it (and under the eyes). mount() and React's useLiveAvatar both use it.

import type { Drawing } from './engine/draw';

const SVG = 'http://www.w3.org/2000/svg';

/** Colours to paint over a body's own, by colour key (Body.paint): `{ antenna: '#111' }`. */
export type Paint = Readonly<Record<string, string>>;

/**
 * Write a drawing's layers into `under` and `over`, reusing the path for a layer of the same id. A body with
 * none leaves both groups empty. `paint` overrides a layer's colour by its key.
 */
export function writeLayers(under: SVGGElement | null, over: SVGGElement | null, d: Drawing, paint?: Paint, paintedSolids = false): void {
  const layers = d.layers ?? [];
  for (const [g, front] of [[under, false], [over, true]] as const) {
    if (!g) continue;
    const want = layers.filter((l) => l.front === front && !(l.solid && paintedSolids));
    let at = 0;
    for (const l of want) {
      let p = g.children[at] as SVGPathElement | undefined;
      if (!p) { p = g.ownerDocument.createElementNS(SVG, 'path') as SVGPathElement; g.appendChild(p); }
      if (p.dataset.layer !== l.id) p.dataset.layer = l.id;
      p.setAttribute('d', l.d);
      const fill = paint?.[l.part] ?? l.fill;
      if (p.style.fill !== fill) p.style.fill = fill;
      at++;
    }
    while (g.children.length > at) g.lastChild!.remove();
  }
}

let nextMask = 0;
const frameMasks = new WeakMap<SVGPathElement, { mask: SVGMaskElement; previous: (string | null)[] }>();

/** Leave the original eye ink behind the frames, including when the glasses are in the material canvas. */
export function clipEyes(left: SVGPathElement | null, right: SVGPathElement | null, d: Drawing): void {
  const svg = left?.ownerSVGElement;
  if (!svg || !left || !right) return;
  const frames = d.layers?.filter(layer => layer.overEyes);
  const saved = frameMasks.get(left);
  let mask = saved?.mask;
  if (!frames?.length || !d.eyes.some(Boolean)) {
    if (saved) {
      saved.mask.remove();
      [left,right].forEach((eye, i) => {
        const previous = saved.previous[i];
        if (previous === null) eye.removeAttribute('mask');
        else eye.setAttribute('mask', previous);
      });
      frameMasks.delete(left);
    }
    return;
  }
  const doc = svg.ownerDocument;
  if (!mask) {
    mask = doc.createElementNS(SVG, 'mask');
    mask.id = 'blot-frames-' + ++nextMask;
    const paper = doc.createElementNS(SVG, 'rect');
    for (const attr of ['x','y']) paper.setAttribute(attr, '-100%');
    for (const attr of ['width','height']) paper.setAttribute(attr, '300%');
    paper.setAttribute('fill', 'white');
    mask.appendChild(paper);
    svg.appendChild(mask);
    const previous = [left.getAttribute('mask'), right.getAttribute('mask')];
    for (const eye of [left, right]) eye.setAttribute('mask', `url(#${mask.id})`);
    frameMasks.set(left, { mask, previous });
  }
  frames.forEach((frame, i) => {
    let rim = mask.children[i+1];
    if (!rim) {
      rim = doc.createElementNS(SVG, 'path');
      rim.setAttribute('fill', 'black');
      rim.setAttribute('fill-rule', 'evenodd');
      mask.appendChild(rim);
    }
    rim.setAttribute('d', frame.d);
  });
  while (mask.children.length > frames.length + 1) mask.lastElementChild!.remove();
}
