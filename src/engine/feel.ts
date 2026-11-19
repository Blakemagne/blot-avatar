// What the avatar is like to move, and the little bits of arithmetic every move shares: how much further a body
// that gives squashes, how high a light one goes, how a wobbly one rings after it lands. The moves (moves.ts,
// clips.ts) read these; nothing here keeps time.

import { smooth } from './ease';
import type { Personality } from './clips';

export const TAU = 2 * Math.PI;

/**
 * The engine's own feel: weight, squash and wobble at 0.5, flare and float at 0. Every move is exactly as it
 * always was at this feel.
 */
export const PERSONALITY: Readonly<Personality> = { weight: 0.5, squash: 0.5, wobble: 0.5, flare: 0, float: 0 };

/** How much further every squash and stretch goes: 1 at the engine's own feel, 0.4 for a body that hardly gives, 1.6 for one that is all give. */
export const give = (f: Readonly<Personality>): number => 0.4 + 1.2 * f.squash;
/** How high it goes: 1 at the engine's own feel, 1.5 for the lightest body, 0.5 for the heaviest. */
export const high = (f: Readonly<Personality>): number => 1.5 - f.weight;
/**
 * The ring of a wobbly body after it lands, `ms` after the landing, faded out by `left` (what is left of the
 * move, 0..1): nothing at the engine's own feel or less, a few quick swings that die away above it.
 */
export function ring(f: Readonly<Personality>, ms: number, left: number): number {
  const w = Math.max(0, f.wobble - 0.5) * 2;
  if (w === 0) return 0;
  const t = ms / 1000;
  return 0.07 * w * Math.exp(-(9 - 4 * w) * t) * Math.sin(TAU * (3.2 + 1.5 * (1 - f.weight)) * t) * smooth(left / 0.15);
}
/** A soft bump: 0 away from `at`, 1 at it, over `wide` each side. */
export const bump = (u: number, at: number, wide: number): number => Math.max(0, 1 - ((u - at) / wide) ** 2) ** 2;
