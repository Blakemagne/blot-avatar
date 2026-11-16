// @blot/avatar/react: a live avatar in a React component. No JSX, so the package needs no build step; react
// is an optional peer, needed only by whoever imports this file.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createLive, type Live, type LiveProps } from './live';
import { bodyOf } from './still';
import { onMotion, reducedMotion } from './ticker';

// The return type is inferred, not written: React 18's types give useRef<T>(null) a RefObject<T> and React 19's a
// RefObject<T | null>, and each version's `ref` takes only its own. Inferred, the refs fit whichever is installed.
/**
 * One live avatar for the life of the component. Put `host` on the element it sits in and `paths` on its
 * body path and its two eye paths, with `first` as their first `d`: after that the frame loop writes the
 * paths in place, with no render per frame. `reduced` is the person's reduced-motion setting, read live.
 */
export function useLiveAvatar(p: LiveProps) {
  const host = useRef<HTMLSpanElement>(null);
  const body = useRef<SVGPathElement>(null);
  const left = useRef<SVGPathElement>(null);
  const right = useRef<SVGPathElement>(null);
  /** Read live, so turning it on stops an avatar that is already on the page. */
  const reduced = useSyncExternalStore(onMotion, reducedMotion, reducedMotion);
  const r = useRef<Live | null>(null);
  if (!r.current) r.current = createLive(p);
  const live = r.current;
  live.want(p);
  const shape = bodyOf(p.shape);

  // In the order live.ts expects (attach first, then motion, follow, shape, face, doing), which React keeps.
  useEffect(() => (host.current ? live.attach(host.current, (d) => {
    body.current?.setAttribute('d', d.body);
    left.current?.setAttribute('d', d.eyes[0]);
    right.current?.setAttribute('d', d.eyes[1]);
  }) : undefined), []);
  useEffect(() => live.motion(), [reduced]);
  useEffect(() => live.follow(p.follow), [p.follow]);
  useEffect(() => live.shape(), [shape, p.size]);
  useEffect(() => live.face(p.face), [p.face]);
  useEffect(() => live.doing(), [p.activity, p.form, p.rests, p.shape, p.size]);

  return { host, paths: [body, left, right] as const, first: live.first, reduced, live };
}
