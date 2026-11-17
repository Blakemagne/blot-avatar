// Every body the engine can draw, by blot's shape id. To add one: a file here that exports a Body, and a line below.

import type { Body } from '../body';
import { blob } from './blob';
import { capsule } from './capsule';
import { cloud } from './cloud';
import { clover } from './clover';
import { flower } from './flower';
import { heart } from './heart';
import { hex } from './hex';
import { house } from './house';
import { pebble } from './pebble';
import { pentagon } from './pentagon';
import { sparkle } from './sparkle';
import { square } from './square';
import { star } from './star';
import { teardrop } from './teardrop';
import { wedge } from './wedge';

export const BODIES: Record<string, Body> = {
  blob, cloud, square, sparkle, clover, heart, flower, teardrop,
  tablet: capsule,
  wedge, house, star, hex, pebble, pentagon,
};

/**
 * Shape ids that have no body of their own and are drawn as the nearest one. These are the pairings the flat
 * avatars already used; the egg is new here, because its flat drawing was the teardrop's.
 */
export const SAME_BODY: Record<string, string> = {
  egg: 'teardrop', bean: 'teardrop', leaf: 'teardrop',
  squircle: 'square',
  capsule: 'tablet', cylinder: 'tablet',
  gem: 'hex', crystal: 'hex',
  shield: 'house', dome: 'house', arch: 'house',
};

/** The id of the body a shape is drawn with: its own, or the one it shares. */
export const bodyId = (shape: string): string => (Object.hasOwn(SAME_BODY, shape) ? SAME_BODY[shape] : shape);

/** The body for a shape id. Every id in BODIES and SAME_BODY (26 in all) has one; an unknown id has none. */
export function bodyFor(shape: string): Body | undefined {
  const id = bodyId(shape);
  return Object.hasOwn(BODIES, id) ? BODIES[id] : undefined;
}
