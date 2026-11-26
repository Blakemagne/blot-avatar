// A highlight high on the left and a shaded rim, in the body's own bounding box.
let serial = 0;
export function glossyFill(path: SVGPathElement, colour: string): { fill: string; remove(): void } {
  const svg = path.ownerSVGElement!;
  const doc = path.ownerDocument,
    ns = 'http://www.w3.org/2000/svg';
  const gradient = doc.createElementNS(ns, 'radialGradient');
  gradient.id = 'blot-gloss-' + ++serial;
  gradient.setAttribute('cx', '33%');
  gradient.setAttribute('cy', '26%');
  gradient.setAttribute('r', '82%');
  for (const [offset, value] of [
    ['0%', `color-mix(in srgb, ${colour} 62%, white)`],
    ['36%', colour],
    ['80%', `color-mix(in srgb, ${colour} 89%, black)`],
    ['100%', `color-mix(in srgb, ${colour} 70%, black)`],
  ]) {
    const stop = doc.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', value);
    gradient.appendChild(stop);
  }
  svg.appendChild(gradient);
  return { fill: `url(#${gradient.id})`, remove: () => gradient.remove() };
}
