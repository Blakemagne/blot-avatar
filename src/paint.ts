// Painting a drawing's effects into an SVG: the parts behind the body into one group, the parts in front into
// another. Shared by mount() and the React hook. The paths are reused from frame to frame: an effect that
// shows for a second is a few attribute writes a frame, not new elements.

import type { Drawing, DrawnFx } from './engine/draw';
import type { FxRole } from './engine/fx';

/**
 * The colours a drawing is painted in. `accent` paints the effects; without one they are the body's colour.
 * Ultracode's effects take `rainbow` (its twinkles; the accent without one) and `halo` (not drawn without one), any
 * CSS paint: a powered avatar's skin gives both (skinPaint in ultra.ts).
 */
export interface FxPaint { fill: string; eyeFill: string; accent?: string; rainbow?: string; halo?: string }

const SVG = 'http://www.w3.org/2000/svg';

/** The colour of a role. */
export function roleColour(role: FxRole, paint: FxPaint): string {
  switch (role) {
    case 'body': return paint.fill;
    case 'eye': return paint.eyeFill;
    case 'accent': return paint.accent ?? paint.fill;
    case 'rainbow': return paint.rainbow ?? paint.accent ?? paint.fill;
    case 'light': return '#FFFFFF';
    case 'halo': return paint.halo ?? 'none';
    default: return '#000';
  }
}

function fill(group: SVGGElement, parts: DrawnFx[], paint: FxPaint): void {
  const kids = group.children;
  for (let i = 0; i < parts.length; i++) {
    let path = kids[i] as SVGPathElement | undefined;
    if (!path) { path = group.ownerDocument.createElementNS(SVG, 'path') as SVGPathElement; group.appendChild(path); }
    const p = parts[i];
    path.setAttribute('d', p.d);
    path.style.fill = roleColour(p.role, paint);
    path.style.opacity = String(p.opacity);
  }
  // (Counted down by index, not "while there are too many": not every DOM's children is a live list.)
  for (let i = kids.length - 1; i >= parts.length; i--) kids[i].remove();
}

/** FxPaint a drawing's effects into its two groups (either may be missing, and then that layer is not drawn). */
export function paintEffects(back: SVGGElement | null | undefined, front: SVGGElement | null | undefined, d: Drawing, paint: FxPaint): void {
  const all = d.effects ?? [];
  if (back) fill(back, all.filter((p) => p.layer === 'back'), paint);
  if (front) fill(front, all.filter((p) => p.layer === 'front'), paint);
}

/** A CSS filter for a drawing's glow on an avatar of `size` px: none when it does not glow. */
export function glowFilter(d: Drawing, size: number, paint: FxPaint): string {
  const g = d.glow ?? 0;
  return g > 0.01 ? `drop-shadow(0 0 ${Math.round(size * 0.14 * g * 10) / 10}px ${paint.accent ?? paint.fill})` : '';
}
