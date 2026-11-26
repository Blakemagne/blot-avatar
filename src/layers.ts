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
