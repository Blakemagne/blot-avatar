// A still avatar: the body for a shape id and the pose it holds, for a picture that never moves (and for the
// first picture of one that will).

import { BODIES, bodyFor } from './engine/bodies/index';
import { portraitFor } from './engine/bodies/portraits';
import type { Body } from './engine/body';
import { VIEW, VIEW_BOX } from './engine/draw';
import { FACES } from './engine/faces';
import type { RigState } from './engine/rig';

/** The engine's body for a shape. A shape id the engine does not know is drawn as the blob. */
export const bodyOf = (shape: string): Body => bodyFor(shape) ?? BODIES.blob;

/** Below this size a still faces front: a turned face is a smear that small. */
export const PORTRAIT_FROM = 28;

/** The pose a still avatar holds: front-facing when tiny, the shape's portrait pose above that. */
export function stillState(shape: string, size: number): RigState {
  const pose = size < PORTRAIT_FROM ? { yaw: 0, pitch: 0, roll: 0 } : portraitFor(shape);
  return { pose, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };
}

/** The drawing overflows its slot by this much, so a body that turns or leans is not clipped. */
export const OVERDRAW = VIEW / 36;

/**
 * The SVG box a drawing sits in, for a slot of `size` px: placed absolutely, `left` and `top` px from the slot's
 * corner. Give the svg `overflow: visible`: a "!" and sleep's Zs go above even this box. (A host that clips its
 * overflow clips them too.)
 */
export function svgBox(size: number): { width: number; height: number; viewBox: string; left: number; top: number } {
  const draw = size * OVERDRAW, off = (draw - size) / 2;
  return { width: draw, height: draw, viewBox: VIEW_BOX, left: -off, top: -off };
}
