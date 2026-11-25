// The page scripts/forms-sheet.mjs runs in a browser: the loading figures on mount()'s own avatars, flat and fluffy,
// frame by frame on a clock of the page's own; the way in and out; the progress ring at set amounts; the flat
// figure's outline stroked over its fur; and, on the browser's own frames, what the frame loop costs and when a
// figure's mesh is made. Bundled by that script; not part of the package.

import { FORMS, mount, ticking, type Form, type MountOptions, type Mounted } from '../src/index';

/** Timing uses the browser's own frames; everything else, the page's clock. */
const timing = location.hash === '#time';

// The page's clock: a frame comes only when pump() asks for one, 16 ms after the last, so each picture is the same
// on every run. Everything counts as on screen, below the fold too.
let now = 1000;
const due = new Map<number, FrameRequestCallback>();
let ids = 0;
if (!timing) {
  window.requestAnimationFrame = (fn) => { due.set(++ids, fn); return ids; };
  window.cancelAnimationFrame = (id) => { due.delete(id); };
  class Seen {
    constructor(private readonly told: IntersectionObserverCallback) {}
    observe(el: Element) { queueMicrotask(() => this.told([{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Seen;
}
function pump(ms: number): void {
  for (let i = 0; i < Math.round(ms / 16); i++) {
    now += 16;
    const fns = [...due.values()];
    due.clear();
    for (const fn of fns) fn(now);
  }
}

// Every coat painted, counted: each is one picture copied out of the renderer's canvas (which is in no document).
let copies = 0;
const drawImage = CanvasRenderingContext2D.prototype.drawImage as (...a: unknown[]) => void;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
  if (a[0] instanceof HTMLCanvasElement && !a[0].isConnected) copies++;
  return drawImage.apply(this, a);
} as typeof CanvasRenderingContext2D.prototype.drawImage;
// The renderer's context, to lose and restore it.
let coatGl: WebGL2RenderingContext | null = null;
const getContext = HTMLCanvasElement.prototype.getContext as (...a: unknown[]) => unknown;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: { preserveDrawingBuffer?: boolean }) {
  const ctx = getContext.call(this, kind, options);
  if (kind === 'webgl2' && options?.preserveDrawingBuffer) coatGl = ctx as WebGL2RenderingContext;
  return ctx;
} as typeof HTMLCanvasElement.prototype.getContext;

// Timing: every frame the shared loop runs, timed, whether it painted a coat, and where the first avatar's figure was.
const frameMs: number[] = [], frameAt: number[] = [], framePainted: boolean[] = [], frameK: number[] = [];
let watched: Mounted | null = null;
if (timing) {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => raf((t) => {
    const t0 = performance.now(), before = copies;
    fn(t);
    frameMs.push(performance.now() - t0);
    frameAt.push(t0);
    framePainted.push(copies > before);
    frameK.push(watched?.live.rig.state.figure?.k ?? 0);
  });
}

const ORANGE = '#FD690F', BLACK = '#000000', PALE = '#F3E9D2';
type Material = 'flat' | 'fluffy';
/** On the page clock: the figure is up 350 ms into the activity and all the way in 420 ms later. */
const UP = 352 + 432;
/** The most one cell of a turn is started ahead of the others, ms; and the end of such a sheet. */
const LEAD = 1904, MOVING_END = LEAD + UP + 160;
/** Each figure's own period, ms (the rig's SPIN), to show frames across one turn. */
const PERIOD: Record<Form, number> = { ring: 1000, orbit: 1400, radar: 1900, progress: 1, dots: 1500 };

interface Cell {
  label: string;
  o: MountOptions;
  /** What changes, and when: ms on the page's clock from the start (multiples of 16). */
  at?: [number, Partial<MountOptions>][];
  /** Stroke the flat body path in cyan over the fur. */
  outline?: boolean;
}
interface Row { title: string; cells: Cell[] }
interface Sheet { rows: Row[]; end: number }

const mounted: Mounted[] = [];
let sheet: HTMLElement;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function until(ok: () => boolean, ms = 30000): Promise<boolean> {
  const end = performance.now() + ms;
  while (!ok()) {
    if (performance.now() > end) return false;
    await wait(20);
  }
  return true;
}
const coatShown = (host: Element) => { const c = host.querySelector('canvas'); return !!c && c.style.display !== 'none'; };
const smooth = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
/** Should a fluffy avatar show fur now: its body's coat before a quarter of the way into a figure, the figure's after three quarters. */
const furWanted = (m: Mounted) => {
  const k = m.live.rig.state.figure?.k ?? 0;
  return k <= 0 || 1 - smooth(k / 0.25) > 0.004 || smooth((k - 0.75) / 0.25) > 0.004;
};

async function draw(s: Sheet): Promise<Record<string, unknown>> {
  for (const m of mounted.splice(0)) m.destroy();
  sheet.replaceChildren();
  const hosts: { host: HTMLElement; cell: Cell; m: Mounted; label: HTMLElement }[] = [];
  for (const row of s.rows) {
    const r = document.createElement('div');
    r.className = 'row';
    const h = document.createElement('div');
    h.className = 'title';
    h.textContent = row.title;
    r.append(h);
    sheet.append(r);
    for (const cell of row.cells) {
      const box = document.createElement('div'), host = document.createElement('div'), label = document.createElement('div');
      box.className = 'cell';
      host.style.margin = `${Math.ceil(cell.o.size * 0.1) + 4}px`;
      if (cell.outline) host.className = 'outline';
      label.className = 'label';
      label.textContent = cell.label;
      box.append(host, label);
      r.append(box);
      const m = mount(host, cell.o);
      mounted.push(m);
      hosts.push({ host, cell, m, label });
    }
  }
  const fluffy = hosts.filter((h) => h.cell.o.material === 'fluffy');
  const coats = await until(() => fluffy.every((h) => coatShown(h.host)));
  const changes = hosts.flatMap(({ cell, m }) => (cell.at ?? []).map(([t, next]) => ({ t, m, next }))).sort((a, b) => a.t - b.t);
  let at = 0;
  for (const c of changes) {
    if (c.t > at) { pump(c.t - at); at = c.t; }
    c.m.update(c.next);
  }
  if (s.end > at) pump(s.end - at);
  // A figure's mesh, and a coat whose mesh was not made yet, are painted through the queue after the clock: let them come.
  const wanted = fluffy.filter((h) => furWanted(h.m));
  const inTime = await until(() => wanted.every((h) => coatShown(h.host)), 8000);
  await wait(80);
  // Each label says how far into its figure the cell is, and its progress.
  for (const h of hosts) {
    const f = h.m.live.rig.state.figure;
    if (f && !/^p /.test(h.cell.label)) h.label.textContent = `${h.cell.label} k ${f.k.toFixed(2)}`;
  }
  return {
    avatars: hosts.length, coatsWanted: wanted.length, coatsShown: fluffy.filter((h) => coatShown(h.host)).length, coatsInTime: coats, figureCoatsInTime: inTime,
    // A fluffy cell that shows fur where none is wanted, or none where it is.
    wrong: fluffy.filter((h) => coatShown(h.host) !== furWanted(h.m)).map((h) => h.cell.label),
  };
}

const avatar = (size: number, material: Material, color = ORANGE): MountOptions => ({ shape: 'blob', size, material, color, seed: 3 });
const name = (material: Material, color: string) => `${material}${color === BLACK ? ', black' : color === PALE ? ', pale' : ''}`;
const busy = (form: Form, progress?: number): Partial<MountOptions> => ({ activity: 'working', form, ...(progress === undefined ? {} : { progress }) });

/** A figure all the way in, at `n` frames across one of its turns: each cell started that much earlier. */
function moving(form: Form, size: number, material: Material, color: string, n: number): Row {
  const turn = PERIOD[form], cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const lead = Math.round((i * turn) / n / 16) * 16;
    cells.push({ label: `${lead} ms`, o: avatar(size, material, color), at: [[LEAD - lead, busy(form, form === 'progress' ? 0.62 : undefined)]] });
  }
  return { title: `${form} ${name(material, color)} ${size}`, cells };
}
/** The way in: each cell's activity began this long before the end, from just before the figure starts to all the way in. */
function wayIn(form: Form, size: number, material: Material, color: string): Row {
  const cells: Cell[] = [];
  for (let ms = 320; ms <= UP + 32; ms += 64) cells.push({ label: `${ms}`, o: avatar(size, material, color), at: [[UP + 32 - ms, busy(form, form === 'progress' ? 0.62 : undefined)]] });
  return { title: `in: ${form} ${name(material, color)}`, cells };
}
/** The way out: up all the way, then idle this long before the end. */
function wayOut(form: Form, size: number, material: Material, color: string): Row {
  const cells: Cell[] = [];
  const end = UP + 160 + 512;
  for (let ms = 0; ms <= 512; ms += 64) cells.push({ label: `${ms}`, o: avatar(size, material, color), at: [[0, busy(form, form === 'progress' ? 0.62 : undefined)], [end - ms, { activity: 'idle', form: null }]] });
  return { title: `out: ${form} ${name(material, color)}`, cells };
}
const ALL = FORMS.filter((f) => f !== 'progress');

const SHEETS: Record<string, () => Sheet> = {
  ...Object.fromEntries(FORMS.map((form) => [`form-${form}-240`, (): Sheet => ({
    rows: ([['flat', ORANGE], ['fluffy', ORANGE], ['flat', BLACK], ['fluffy', BLACK]] as const).map(([m, c]) => form === 'progress'
      ? { title: `progress ${name(m, c)} 240`, cells: [0, 0.3, 0.7, 1].map((p): Cell => ({ label: `p ${p}`, o: { ...avatar(240, m, c), ...busy('progress', p) } })) }
      : moving(form, 240, m, c, 4)),
    end: form === 'progress' ? 2400 : MOVING_END,
  })])),
  'moving-96': () => ({
    rows: ALL.flatMap((form) => ([['flat', ORANGE], ['fluffy', ORANGE], ['fluffy', BLACK]] as const).map(([m, c]) => moving(form, 96, m, c, 6))),
    end: MOVING_END,
  }),
  'moving-36': () => ({
    rows: ALL.flatMap((form) => ([['flat', ORANGE], ['fluffy', ORANGE], ['flat', BLACK], ['fluffy', BLACK]] as const).map(([m, c]) => moving(form, 36, m, c, 6))),
    end: MOVING_END,
  }),
  'way-in': () => ({ rows: FORMS.flatMap((form) => [wayIn(form, 96, 'flat', ORANGE), wayIn(form, 96, 'fluffy', ORANGE), wayIn(form, 96, 'fluffy', BLACK)]), end: UP + 32 }),
  'way-out': () => ({ rows: FORMS.flatMap((form) => [wayOut(form, 96, 'flat', ORANGE), wayOut(form, 96, 'fluffy', ORANGE), wayOut(form, 96, 'fluffy', BLACK)]), end: UP + 160 + 512 }),
  progress: () => ({
    rows: ([[240, 'flat', ORANGE], [240, 'fluffy', ORANGE], [96, 'flat', ORANGE], [96, 'fluffy', ORANGE], [96, 'fluffy', BLACK], [96, 'fluffy', PALE], [36, 'flat', ORANGE], [36, 'fluffy', ORANGE], [36, 'fluffy', BLACK]] as const).map(([size, m, c]) => ({
      title: `${name(m, c)} ${size}`,
      cells: [0, 0.3, 0.7, 1].map((p): Cell => ({ label: `p ${p}`, o: { ...avatar(size, m, c), ...busy('progress', p) } })),
    })),
    end: 2400,
  }),
  // The flat figure's path stroked in cyan over the fur: the fur should keep to it.
  outline: () => ({
    rows: ([240, 96] as const).flatMap((size) => ([ORANGE, BLACK] as const).map((c) => ({
      title: `outline ${name('fluffy', c)} ${size}`,
      cells: FORMS.map((form): Cell => ({ label: form, outline: true, o: avatar(size, 'fluffy', c), at: [[0, busy(form, form === 'progress' ? 0.62 : undefined)]] })),
    }))),
    end: UP + 480,
  }),
  // Other colours, and powered (the rainbow over the figure's fur).
  colours: () => ({
    rows: [
      ...([PALE, '#3B6FE0'] as const).map((c) => ({ title: name('fluffy', c) === 'fluffy' ? 'fluffy, blue' : name('fluffy', c), cells: FORMS.map((form): Cell => ({ label: form, o: avatar(96, 'fluffy', c), at: [[0, busy(form, form === 'progress' ? 0.62 : undefined)]] })) })),
      { title: 'fluffy, powered', cells: FORMS.map((form): Cell => ({ label: form, o: { ...avatar(96, 'fluffy'), ultra: true }, at: [[0, busy(form, form === 'progress' ? 0.62 : undefined)]] })) },
      { title: 'flat, powered', cells: FORMS.map((form): Cell => ({ label: form, o: { ...avatar(96, 'flat'), ultra: true }, at: [[0, busy(form, form === 'progress' ? 0.62 : undefined)]] })) },
    ],
    end: UP + 480,
  }),
};

const w = window as unknown as Record<string, unknown>;
w.sheets = () => Object.keys(SHEETS);
w.sheet = async (which: string, dark: boolean) => {
  sheet = document.getElementById('sheet')!;
  document.body.className = dark ? 'dark' : 'light';
  return draw(SHEETS[which]());
};

/** A lost context during a figure: flat while it is gone, fur again when it is back. On the page clock. */
w.loseCheck = async () => {
  sheet = document.getElementById('sheet')!;
  document.body.className = 'light';
  await draw({ rows: [{ title: 'lose', cells: [{ label: 'ring', o: avatar(96, 'fluffy'), at: [[0, busy('ring')]] }] }], end: UP + 160 });
  const host = sheet.querySelector('.cell > div') as HTMLElement;
  const before = coatShown(host);
  const ext = coatGl?.getExtension('WEBGL_lose_context');
  if (!ext) return { before, note: 'no WEBGL_lose_context' };
  ext.loseContext();
  await wait(50);
  pump(64);
  await wait(300);
  const lost = coatShown(host);
  ext.restoreContext();
  await until(() => coatShown(host), 5000);
  pump(64);
  await until(() => coatShown(host), 5000);
  const back = coatShown(host);
  for (const m of mounted.splice(0)) m.destroy();
  return { before, lost, back };
};

/**
 * One long frame (100 ms, the loop's cap) across a figure's flat middle on a fresh page, where its mesh is not made
 * yet, both ways (the way out under a new body): the canvas must not keep the old body's fur over the flat drawing
 * until the new mesh is painted. On the page clock.
 */
w.longFrameCheck = async (form: Form) => {
  sheet = document.getElementById('sheet')!;
  document.body.className = 'light';
  const host = document.createElement('div');
  sheet.replaceChildren(host);
  const m = mount(host, avatar(96, 'fluffy'));
  await until(() => coatShown(host), 10000);
  const k = () => m.live.rig.state.figure?.k ?? 0;
  /** Frames of 16 ms until the figure is a fifth of the way in (going `up`; or out), then one of 100 ms: it lands past the far fifth. */
  const across = async (up: boolean) => {
    for (let i = 0; i < 200 && !(up ? k() >= 0.2 : k() > 0 && k() <= 0.8); i++) { pump(16); await wait(0); }
    const before = { k: k(), fur: coatShown(host) };
    now += 100;
    const fns = [...due.values()];
    due.clear();
    for (const fn of fns) fn(now);
    // (Before soon() can run: what this frame presents.)
    return { before, after: { k: k(), fur: coatShown(host) } };
  };
  m.update(busy(form, form === 'progress' ? 0.6 : undefined));
  const up = await across(true);
  for (let i = 0; i < 80; i++) { pump(16); await wait(0); }
  m.update({ shape: 'pentagon' });
  pump(800);
  m.update({ activity: 'idle', form: null });
  const down = await across(false);
  m.destroy();
  sheet.replaceChildren();
  // Fur after the long frame only if this body's mesh was made: on a fresh page, not yet.
  return { form, up, down, crossed: up.before.fur && down.before.fur && up.before.k < 0.25 && up.after.k > 0.75 && down.before.k > 0.75 && down.after.k < 0.25, ok: !up.after.fur && !down.after.fur };
};

/**
 * n live avatars of 96 px for `ms`, each doing `form` (none: idle), on the browser's own frames: the shared loop's
 * time per frame while the first one's figure is all the way in (all frames for none). `filling`: the progress
 * moves the whole time.
 */
w.frames = async (n: number, material: Material, form: Form | null, ms: number, filling = false) => {
  const host = document.getElementById('live')!;
  host.replaceChildren();
  const all: Mounted[] = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'live';
    host.append(el);
    all.push(mount(el, { shape: 'blob', size: 96, material, seed: i + 1, ...(form ? busy(form, form === 'progress' ? 0.5 : undefined) : {}) }));
  }
  watched = all[0];
  // Settle: the coats painted, the figure all the way in (and its mesh made), and a little more.
  await until(() => material === 'flat' || [...host.querySelectorAll('canvas')].every((c) => c.style.display !== 'none'), 10000);
  if (form) await until(() => (watched!.live.rig.state.figure?.k ?? 0) >= 1, 10000);
  await wait(200);
  frameMs.length = frameAt.length = framePainted.length = frameK.length = 0;
  const painted = copies;
  let p = 0.5, timer = 0;
  if (filling) timer = window.setInterval(() => { p = p >= 0.95 ? 0.05 : p + 0.05; for (const m of all) m.update({ progress: p }); }, 100);
  await wait(ms);
  clearInterval(timer);
  const coatPaints = copies - painted, tick = ticking();
  watched = null;
  for (const m of all) m.destroy();
  // Only frames with the figure all the way in (a ring, an orbit and the others go back to the body after 3 s).
  const keep = frameMs.map((_, i) => !form || frameK[i] >= 1);
  const v = frameMs.filter((_, i) => keep[i]), sorted = [...v].sort((x, y) => x - y), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = (x: number[]) => x.reduce((s, y) => s + y, 0) / Math.max(1, x.length);
  return {
    avatars: n, material, form: form ?? 'idle', filling, ticking: tick.count, coatPaints, frames: v.length, framesAll: frameMs.length,
    paintedFrames: framePainted.filter((x, i) => x && keep[i]).length,
    meanMs: mean(v), medianMs: at(0.5), p95Ms: at(0.95), maxMs: sorted[sorted.length - 1] ?? 0,
  };
};

/**
 * One fluffy avatar of 96 px on a fresh page, its coat painted, then given a figure: for every frame from then, how
 * far in the figure is and whether fur shows; and the long tasks (a mesh being made is one), in the same time.
 */
w.warmCheck = async (form: Form) => {
  const host = document.getElementById('live')!;
  host.replaceChildren();
  const el = document.createElement('div');
  el.className = 'live';
  host.append(el);
  const m = mount(el, { shape: 'blob', size: 96, material: 'fluffy', seed: 1 });
  await until(() => coatShown(el), 10000);
  await wait(300);
  const long: { at: number; ms: number }[] = [];
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ at: e.startTime, ms: e.duration }); });
  try { po.observe({ type: 'longtask', buffered: false }); } catch { /* not in this browser */ }
  const seen: { at: number; k: number; fur: boolean; opacity: string }[] = [];
  let on = true;
  const raf = window.requestAnimationFrame.bind(window);
  const look = () => {
    if (!on) return;
    const c = el.querySelector('canvas') as HTMLCanvasElement | null;
    seen.push({ at: performance.now(), k: m.live.rig.state.figure?.k ?? 0, fur: coatShown(el), opacity: c?.style.opacity ?? '' });
    raf(look);
  };
  const t0 = performance.now();
  m.update(busy(form, form === 'progress' ? 0.6 : undefined));
  raf(look);
  await until(() => (m.live.rig.state.figure?.k ?? 0) >= 1, 10000);
  await wait(200);
  on = false;
  po.disconnect();
  m.destroy();
  // The first frame where the figure's fur is wanted (k past 0.75 and its opacity over 0.004), and whether it showed.
  const firstWanted = seen.find((s) => smooth((s.k - 0.75) / 0.25) > 0.004);
  const firstFur = seen.find((s) => s.k > 0.75 && s.fur);
  return {
    form,
    longTasks: long.map((l) => ({ atMs: Math.round(l.at - t0), ms: Math.round(l.ms), kThen: seen.filter((s) => s.at <= l.at).at(-1)?.k ?? 0 })),
    firstWanted: firstWanted && { atMs: Math.round(firstWanted.at - t0), k: +firstWanted.k.toFixed(3), fur: firstWanted.fur },
    firstFur: firstFur && { atMs: Math.round(firstFur.at - t0), k: +firstFur.k.toFixed(3) },
    framesWantedWithoutFur: seen.filter((s) => smooth((s.k - 0.75) / 0.25) > 0.004 && !s.fur).length,
  };
};
