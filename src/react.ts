// @blot/avatar/react: a live avatar in a React component. No JSX, so the package needs no build step; react
// is an optional peer, needed only by whoever imports this file.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { writeLayers, type Paint } from './layers';
import { createLive, type Live, type LiveProps } from './live';
import type { Drawing } from './engine/draw';
import { glowFilter, paintEffects, type FxPaint } from './paint';
import { bodyOf } from './still';
import { onMotion, reducedMotion } from './ticker';

// The return type is inferred, not written: React 18's types give useRef<T>(null) a RefObject<T> and React 19's a
// RefObject<T | null>, and each version's `ref` takes only its own. Inferred, the refs fit whichever is installed.
/**
 * One live avatar for the life of the component. Put `host` on the element it sits in and `paths` on its
 * body path and its two eye paths, with `first` as their first `d`: after that the frame loop writes the
 * paths in place, with no render per frame. `reduced` is the person's reduced-motion setting, read live.
 * For a body with antennas or decals, put `layers[0]` on an empty <g> before the body path and
 * `layers[1]` on one after it (before the eyes); the frame loop fills them, in `paint`'s colours where given.
 * For the effects (a mark, sparks, rings, Zs), put `fx[0]` on an empty <g> before everything (`layers[0]` too)
 * and `fx[1]` on one after the eyes, and pass `fxPaint`; leave them off and the effects are not drawn.
 */
export function useLiveAvatar(p: LiveProps & { paint?: Paint; fxPaint?: FxPaint }) {
  const host = useRef<HTMLSpanElement>(null);
  const body = useRef<SVGPathElement>(null);
  const left = useRef<SVGPathElement>(null);
  const right = useRef<SVGPathElement>(null);
  const under = useRef<SVGGElement>(null);
  const over = useRef<SVGGElement>(null);
  const paint = useRef(p.paint);
  paint.current = p.paint;
  const back = useRef<SVGGElement>(null);
  const front = useRef<SVGGElement>(null);
  /** The colours, for the effects: read on every frame, never through a render. */
  const fxPaint = useRef<FxPaint | undefined>(p.fxPaint);
  fxPaint.current = p.fxPaint;
  /** The size, read by the frame callback (which was made on the first render). */
  const size = useRef(p.size);
  size.current = p.size;
  /** The last drawing, to repaint its effects when the colours change. */
  const last = useRef<Drawing | null>(null);
  /** Read live, so turning it on stops an avatar that is already on the page. */
  const reduced = useSyncExternalStore(onMotion, reducedMotion, reducedMotion);
  const r = useRef<Live | null>(null);
  if (!r.current) r.current = createLive(p);
  const live = r.current;
  live.want(p);
  const shape = bodyOf(p.shape);

  // In the order live.ts expects (attach first, then motion, follow, shape, face, doing), which React keeps.
  useEffect(() => (host.current ? live.attach(host.current, (d) => {
    last.current = d;
    body.current?.setAttribute('d', d.body);
    left.current?.setAttribute('d', d.eyes[0]);
    right.current?.setAttribute('d', d.eyes[1]);
    writeLayers(under.current, over.current, d, paint.current);
    const c = fxPaint.current;
    if (c) {
      paintEffects(back.current, front.current, d, c);
      const svg = body.current?.ownerSVGElement;
      if (svg) svg.style.filter = glowFilter(d, size.current, c);
    }
  }) : undefined), []);
  useEffect(() => live.motion(), [reduced]);
  useEffect(() => live.follow(p.follow), [p.follow]);
  useEffect(() => live.shape(), [shape, p.body, p.size]);
  useEffect(() => live.face(p.face), [p.face]);
  // (The body stands for the shape: a definition written inline is a new object every render, its body is not.)
  useEffect(() => live.doing(), [p.activity, p.form, p.rests, shape, p.body, p.size, p.mark, JSON.stringify(p.personality ?? null)]);
  // New colours repaint the effects already drawn (a still avatar may not draw again for a long time).
  useEffect(() => {
    const d = last.current, c = fxPaint.current;
    if (!d || !c) return;
    paintEffects(back.current, front.current, d, c);
    const svg = body.current?.ownerSVGElement;
    if (svg) svg.style.filter = glowFilter(d, size.current, c);
  }, [p.fxPaint?.fill, p.fxPaint?.eyeFill, p.fxPaint?.accent]);
  // ... and the antennas' and decals' (as mount() does).
  useEffect(() => {
    const d = last.current;
    if (d) writeLayers(under.current, over.current, d, paint.current);
  }, [JSON.stringify(p.paint ?? null)]);

  return { host, paths: [body, left, right] as const, layers: [under, over] as const, fx: [back, front] as const, first: live.first, reduced, live };
}
