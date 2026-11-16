// Easing for the avatar's moves. Pure functions of a position u in 0..1; nothing here keeps time.

export const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);

/** Starts and stops gently (smoothstep). */
export const smooth = (u: number): number => { u = clamp01(u); return u * u * (3 - 2 * u); };

/** Starts and stops gently, quicker through the middle (cubic in and out). */
export const inOut = (u: number): number => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };

/**
 * In and out with a wind-up and an overshoot: it backs off a little before it goes and runs a little past
 * before it settles. `back` sets how much (1.2 is about 2.6% of the way each side).
 */
export function inOutBack(u: number, back: number): number {
  u = clamp01(u);
  if (u < 0.5) { const t = 2 * u; return (t * t * ((back + 1) * t - back)) / 2; }
  const t = 2 * u - 2;
  return (t * t * ((back + 1) * t + back) + 2) / 2;
}

/**
 * A track of keys, flat [u0, v0, u1, v1, ...] with u rising: the value at u, eased in and out between
 * neighbouring keys, so the move comes to rest at each key and never jumps.
 */
export function track(keys: readonly number[], u: number): number {
  const last = keys.length - 2;
  if (u <= keys[0]) return keys[1];
  if (u >= keys[last]) return keys[last + 1];
  let i = 0;
  while (keys[i + 2] < u) i += 2;
  return keys[i + 1] + (keys[i + 3] - keys[i + 1]) * smooth((u - keys[i]) / (keys[i + 2] - keys[i]));
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
