// @blot/avatar/react: a live avatar in a React component. No JSX, so the package needs no build step; react
// is an optional peer, needed only by whoever imports this file.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { coatLayer, type CoatLayer } from './coat/layer';
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
 * For `material: 'fluffy'`, draw it as two svgs of the same box with a <canvas> between them, `coat` on the
 * canvas and `style={{ position: 'absolute', display: 'none' }}` (so it takes no room before the coat shows it):
 * the first svg holds `fx[0]` and `layers[0]`, the second the body path, `layers[1]`, the eyes and `fx[1]`. The
 * canvas is placed and shown when a coat is painted; until then, and where none can be, the body is flat.
 * Without the canvas (render it whenever the material is fluffy) it is flat too.
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
  const coat = useRef<HTMLCanvasElement>(null);
  /** The coat, while the material is fluffy. */
  const layer = useRef<CoatLayer | null>(null);
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

  /** The glow: round the coat and what is under it while a coat shows, round the body's svg while none does. */
  const glowed = (d: Drawing, c: FxPaint) => {
    const glow = glowFilter(d, size.current, c), top = body.current?.ownerSVGElement, low = back.current?.ownerSVGElement;
    if (top) top.style.filter = layer.current?.showing ? '' : glow;
    if (low && low !== top) low.style.filter = glow;
    if (coat.current) coat.current.style.filter = glow;
  };
  // The coat first, so that the first picture is drawn with it.
  useEffect(() => {
    const el = coat.current;
    if (el) { el.style.position = 'absolute'; el.style.display = 'none'; }
    // (motion() draws again at once, as mount() does on a new material; before attach it does nothing.)
    if (p.material !== 'fluffy' || !body.current || !el) { live.motion(); return; }
    const l = coatLayer(body.current, () => coat.current);
    layer.current = l;
    live.motion();
    return () => { l.stop(); layer.current = null; };
  }, [p.material]);
  // In the order live.ts expects (attach first, then motion, follow, shape, face, doing), which React keeps.
  useEffect(() => (host.current ? live.attach(host.current, (d) => {
    last.current = d;
    body.current?.setAttribute('d', d.body);
    left.current?.setAttribute('d', d.eyes[0]);
    right.current?.setAttribute('d', d.eyes[1]);
    writeLayers(under.current, over.current, d, paint.current);
    const c = fxPaint.current;
    layer.current?.draw(d, size.current, c?.fill);
    if (c) {
      paintEffects(back.current, front.current, d, c);
      glowed(d, c);
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
    glowed(d, c);
  }, [p.fxPaint?.fill, p.fxPaint?.eyeFill, p.fxPaint?.accent]);
  // ... and, after every render, the coat is handed the drawing again: a new fill on the body path, or in fxPaint,
  // reaches a still coat. (It paints nothing when nothing it is drawn from changed.)
  useEffect(() => {
    const d = last.current, l = layer.current;
    if (d && l && (l.showing || l.pending)) l.draw(d, size.current, fxPaint.current?.fill);
  });
  // ... and the antennas' and decals' (as mount() does).
  useEffect(() => {
    const d = last.current;
    if (d) writeLayers(under.current, over.current, d, paint.current);
  }, [JSON.stringify(p.paint ?? null)]);

  return { host, paths: [body, left, right] as const, layers: [under, over] as const, fx: [back, front] as const, coat, first: live.first, reduced, live };
}
