// A still avatar: the body for a shape id and the pose it holds, for a picture that never moves (and for the
// first picture of one that will).

import { BODIES, bodyFor } from './engine/bodies/index';
import { portraitFor } from './engine/bodies/portraits';
import type { Body } from './engine/body';
import type { AvatarDefinition } from './engine/outline/definition';
import { outlineBody } from './engine/outline/inflate';
import { VIEW, VIEW_BOX, VIEW_UNIT } from './engine/draw';
import { FACES } from './engine/faces';
import { D } from './engine/math';
import type { RigState } from './engine/rig';

/**
 * A shape: the id of one the engine has built in ('blob', 'heart', ...), or an avatar definition (an outline and
 * its eyes, such as one from GALLERY or one a model wrote), which outlineBody makes into a body.
 */
export type Shape = string | AvatarDefinition;

/**
 * The engine's body for a shape. A shape id the engine does not know is drawn as the blob. A definition is not
 * checked here: check one you did not write with validateAvatar first (an outline that cannot be read throws).
 */
export const bodyOf = (shape: Shape): Body => (typeof shape === 'string' ? bodyFor(shape) ?? BODIES.blob : outlineBody(shape));

/** Below this size a still faces front: a turned face is a smear that small. */
export const PORTRAIT_FROM = 28;

/** The pose a still avatar holds: front-facing when tiny, the shape's portrait pose above that. */
export function stillState(shape: Shape, size: number): RigState {
  const pose = size < PORTRAIT_FROM ? { yaw: 0, pitch: 0, roll: 0 } : portraitFor(typeof shape === 'string' ? shape : '');
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

/** Where a coat's picture sits in its slot (coatBox). */
export interface CoatBox {
  /** Its side, device pixels. */
  pixels: number;
  /** Its corner, px from the slot's corner (as svgBox's are), on a device pixel; and its side, px. */
  left: number;
  top: number;
  width: number;
  /** The drawing units it covers: `half` each way from (cx, cy), before the drawing's affine. */
  cx: number;
  cy: number;
  half: number;
}

/**
 * Where a coat's picture sits in a slot of `size` px on a display of `dpr` device pixels a px, for a coat that
 * reaches `reach` body units from the body's middle. However it turns, such a coat stays inside one square round
 * the middle of the drawing (the camera sees a ball of that radius as a disc no wider), so the square holds every
 * pose. The drawing's affine (a hop, a squash) moves the picture afterwards, as it moves the paths.
 */
export function coatBox(size: number, dpr: number, reach: number): CoatBox {
  const ratio = dpr > 0 ? dpr : 1, k = (size * OVERDRAW) / VIEW, off = (size * OVERDRAW - size) / 2, mid = VIEW / 2;
  const half = (VIEW_UNIT * D * reach) / Math.sqrt(D * D - reach * reach);
  // Its corner on a device pixel, so a picture standing still is not blurred by sitting between two.
  const left = Math.floor((-off + k * (mid - half)) * ratio) / ratio, x0 = (left + off) / k;
  const pixels = Math.max(1, Math.ceil((mid + half - x0) * k * ratio)), side = pixels / (k * ratio);
  return { pixels, left, top: left, width: pixels / ratio, cx: x0 + side / 2, cy: x0 + side / 2, half: side / 2 };
}
