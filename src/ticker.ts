// One animation-frame loop, one on-screen watcher and one pointer listener for every live avatar on the page.
// The loop runs only while something is subscribed, the tab is showing and the person has not asked for
// reduced motion, so a page with no live avatar on screen, or a tab in the background, costs nothing. Beside
// it, one queue (soon) for the work the loop does not do, one job a task.

type Tick = (now: number) => void;

const ticks = new Set<Tick>();
let frame = 0;
let listening = false;

const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

let motion: MediaQueryList | null | undefined;
const told = new Set<() => void>();

/** The person's reduced-motion setting, asked for once; null where there is none to ask (a server render). */
function setting(): MediaQueryList | null {
  if (motion === undefined) {
    motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    // Turned on while the app is open, the loop stops there and then, for every avatar; turned off, it carries on.
    motion?.addEventListener('change', () => {
      if (reducedMotion()) halt(); else start();
      for (const changed of [...told]) changed();
    });
  }
  return motion;
}

/** Does the person prefer reduced motion, right now? While they do, nothing ticks. */
export const reducedMotion = (): boolean => !!setting()?.matches;

/** Call `changed` whenever that preference is turned on or off, until the returned function is called. */
export function onMotion(changed: () => void): () => void {
  setting();
  told.add(changed);
  return () => { told.delete(changed); };
}

/** True while the loop is running its ticks. */
let framing = false;

function loop(now: number): void {
  frame = 0;
  framing = true;
  try {
    for (const tick of ticks) tick(now);
  } finally {
    framing = false;
  }
  start();
}

/** Is the frame loop running its ticks right now? (A coat is painted at once in a frame, and through soon() outside one.) */
export const inFrame = (): boolean => framing;

/** Work waiting for its turn, first come first served. */
const jobs: (() => void)[] = [];
let turnAt: ReturnType<typeof setTimeout> | 0 = 0;

/**
 * Run `job` soon, in a task of its own after the ones already waiting: one job a task, so a page of them do not
 * pile into one frame (one long job still holds up the frames while it runs). It is for what the frame loop does not draw (a still picture, the first coat of a body, which
 * needs a mesh made), so it runs under reduced motion too, and in a background tab, only later. Returns the way
 * to drop it before it runs.
 */
export function soon(job: () => void): () => void {
  jobs.push(job);
  queue();
  return () => {
    const at = jobs.indexOf(job);
    if (at >= 0) jobs.splice(at, 1);
  };
}

function queue(): void {
  if (!turnAt && jobs.length) turnAt = setTimeout(turn, 0);
}

function turn(): void {
  turnAt = 0;
  const job = jobs.shift();
  // (One that throws does not stop the ones after it.)
  try {
    job?.();
  } finally {
    queue();
  }
}

function start(): void {
  if (!frame && ticks.size && !hidden() && !reducedMotion()) frame = requestAnimationFrame(loop);
}

function halt(): void {
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
}

/** Call `tick` on every animation frame, while the tab is showing and motion is allowed, until the returned function is called. */
export function onFrame(tick: Tick): () => void {
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    // A hidden tab does not tick at all (a browser already slows its frames; this stops them).
    document.addEventListener('visibilitychange', () => { if (hidden()) halt(); else start(); });
  }
  ticks.add(tick);
  start();
  return () => {
    ticks.delete(tick);
    if (!ticks.size) halt();
  };
}

/** How many things are ticking, and whether the loop is running: for the lab's readout and for tests. */
export const ticking = (): { count: number; running: boolean } => ({ count: ticks.size, running: frame !== 0 });

let watcher: IntersectionObserver | null = null;
const watched = new Map<Element, (on: boolean) => void>();

/**
 * Tell `seen` whenever `el` comes onto the screen or goes off it. One observer for every avatar. Where the
 * browser has no such observer, everything counts as on screen. Returns the way to stop.
 */
export function onSeen(el: Element, seen: (on: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { seen(true); return () => {}; }
  watcher ??= new IntersectionObserver((entries) => { for (const e of entries) watched.get(e.target)?.(e.isIntersecting); });
  watched.set(el, seen);
  watcher.observe(el);
  return () => { watched.delete(el); watcher?.unobserve(el); };
}

/**
 * Where the pointer is, in viewport pixels. `on` is false until it first moves and after it leaves the page.
 * `moves` goes up on every change, and `layout` on every scroll or resize, so a reader can tell when to look again.
 */
export const pointer = { x: 0, y: 0, on: false, moves: 0, layout: 0 };

let watching = false;

/** Start tracking the pointer (once per page; the listeners are passive and stay). */
export function watchPointer(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true; pointer.moves++; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.on = false; pointer.moves++; });
  const moved = () => { pointer.layout++; };
  window.addEventListener('scroll', moved, { passive: true, capture: true });
  window.addEventListener('resize', moved, { passive: true });
}
