// The page scripts/ultra-sheet.mjs runs in a browser: ultracode on mount()'s own avatars, flat and fluffy, frame
// by frame on a clock of the page's own, a look at the DOM it makes, and the frame loop's cost with powered
// avatars. Bundled by that script; not part of the package.

import { BODIES, GALLERY, mount, outlineBody, ticking, type Body, type MountOptions, type Mounted } from '../src/index';

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
/** Run the frames for `ms` (a multiple of 16) of the page's clock. */
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
// Timing: every frame the shared loop runs, timed (the loop asks for a frame when it needs one), and whether it
// painted a coat.
const frameMs: number[] = [], frameAt: number[] = [], framePainted: boolean[] = [];
if (timing) {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => raf((t) => {
    const t0 = performance.now(), before = copies;
    fn(t);
    frameMs.push(performance.now() - t0);
    frameAt.push(t0);
    framePainted.push(copies > before);
  });
}
const drawImage = CanvasRenderingContext2D.prototype.drawImage as (...a: unknown[]) => void;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
  if (a[0] instanceof HTMLCanvasElement && !a[0].isConnected) copies++;
  return drawImage.apply(this, a);
} as typeof CanvasRenderingContext2D.prototype.drawImage;

const deg = (d: number) => (d * Math.PI) / 180;
const gallery = (id: string): Body => outlineBody(GALLERY.find((g) => g.definition.id === id)!.definition);
/** The blob with antennas and a decal round one eye, as the coat sheet builds one. */
const ANTENNAS = {
  ...BODIES.blob,
  id: 'sheet-antennas',
  antennas: { pivot: [0.4, 0.6, 0], base: 0.3, whip: 0.6, radii: [0.04, 0.03, 0.02], rest: deg(10), follow: 0.35, paint: 'antenna' },
  decals: [{ id: 'rim-left', at: [0, 0], w: 0.3, h: 0.3, shape: 'circle', paint: 'rim', eye: 'left' }],
  paint: { antenna: '#2A2A2A', rim: '#2A2A2A' },
} as unknown as Body;

const ORANGE = '#FD690F', BLACK = '#000000';
type Material = 'flat' | 'fluffy';

interface Cell {
  label: string;
  o: MountOptions;
  /** What changes, and when: ms on the page's clock from the start (multiples of 16). */
  at?: [number, Partial<MountOptions>][];
}
interface Row { title: string; cells: Cell[] }
interface Sheet { rows: Row[]; /** How long the clock runs, ms (a multiple of 16). */ end: number }

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

/** Lay the rows out, mount every cell, wait for the coats, then run the clock with each cell's changes. */
async function draw(s: Sheet): Promise<Record<string, unknown>> {
  for (const m of mounted.splice(0)) m.destroy();
  sheet.replaceChildren();
  const hosts: { host: HTMLElement; cell: Cell; m: Mounted }[] = [];
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
      host.style.margin = `${Math.ceil(cell.o.size * 0.34)}px`;
      label.className = 'label';
      label.textContent = cell.label;
      box.append(host, label);
      r.append(box);
      const m = mount(host, cell.o);
      mounted.push(m);
      hosts.push({ host, cell, m });
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
  // Under reduced motion a change is drawn at once, and a coat through the queue: let it come.
  await until(() => fluffy.every((h) => coatShown(h.host)), 5000);
  await wait(50);
  return { avatars: hosts.length, coatsWanted: fluffy.length, coatsShown: fluffy.filter((h) => coatShown(h.host)).length, coatsInTime: coats };
}

const avatar = (size: number, material: Material, color = ORANGE, shape: MountOptions['shape'] = 'blob', body?: Body): MountOptions =>
  ({ shape, body, size, material, color, seed: 3 });
const name = (material: Material, color: string) => `${material}${color === BLACK ? ', black' : ''}`;

/** The pickup, a cell every 80 ms for a second: each was powered that long before the end. */
function pickup(size: number, material: Material, color = ORANGE): Row {
  const LEAD = 400, cells: Cell[] = [];
  for (let ms = 0; ms <= 960; ms += 80) cells.push({ label: `${ms} ms`, o: avatar(size, material, color), at: [[LEAD + 960 - ms, { ultra: true }]] });
  return { title: `${name(material, color)} ${size}`, cells };
}
/** Power down, a cell every 80 ms for a second: each powered at the start and turned off that long before the end. */
function powerDown(size: number, material: Material, color = ORANGE): Row {
  const cells: Cell[] = [];
  for (let ms = 0; ms <= 960; ms += 80) cells.push({ label: `${ms} ms`, o: avatar(size, material, color), at: [[0, { ultra: true }], [1504 + 960 - ms, { ultra: false }]] });
  return { title: `${name(material, color)} ${size}`, cells };
}
/** Powered and idle: a cell every 240 ms, the first powered 1 s before the end. */
function idle(size: number, material: Material, color = ORANGE): Row {
  const cells: Cell[] = [];
  for (let i = 0; i < 8; i++) cells.push({ label: `${1008 + 240 * i} ms`, o: avatar(size, material, color), at: [[240 * (7 - i), { ultra: true }]] });
  return { title: `${name(material, color)} ${size}`, cells };
}
/** Powered from the start, 1504 ms of it at the end. */
const powered = (label: string, o: MountOptions): Cell => ({ label, o, at: [[0, { ultra: true }]] });
const IDLE_END = 1504;

const BODY_LIST: [string, MountOptions['shape'], Body | undefined][] = [
  ['blob', 'blob', undefined], ['star', 'star', undefined], ['heart', 'heart', undefined], ['cloud', 'cloud', undefined],
  ['flower', 'flower', undefined], ['square', 'square', undefined], ['controller', 'blob', undefined], ['antennas', 'blob', ANTENNAS],
];
const bodyCells = (size: number, material: Material, on: boolean): Cell[] => BODY_LIST.map(([label, shape, body]) => {
  const o = { ...avatar(size, material, ORANGE, shape, label === 'controller' ? gallery('controller') : body) };
  return on ? powered(label, o) : { label, o };
});

const SHEETS: Record<string, () => Sheet> = {
  pickup: () => ({ rows: [pickup(96, 'flat'), pickup(96, 'fluffy'), pickup(96, 'flat', BLACK), pickup(96, 'fluffy', BLACK)], end: 400 + 960 }),
  'pickup-large': () => {
    const at = (ms: number, material: Material): Cell => ({ label: `${ms} ms`, o: avatar(240, material), at: [[400 + 640 - ms, { ultra: true }]] });
    return { rows: (['flat', 'fluffy'] as const).map((m) => ({ title: `${m} 240`, cells: [80, 160, 240, 400, 640].map((ms) => at(ms, m)) })), end: 400 + 640 };
  },
  idle: () => ({ rows: [idle(96, 'flat'), idle(96, 'fluffy'), idle(96, 'flat', BLACK), idle(96, 'fluffy', BLACK)], end: 240 * 7 + 1008 }),
  down: () => ({ rows: [powerDown(96, 'flat'), powerDown(96, 'fluffy'), powerDown(96, 'flat', BLACK), powerDown(96, 'fluffy', BLACK)], end: 1504 + 960 }),
  bodies: () => ({
    rows: [
      { title: 'flat, powered', cells: bodyCells(96, 'flat', true) },
      { title: 'fluffy, powered', cells: bodyCells(96, 'fluffy', true) },
      { title: 'flat, off', cells: bodyCells(96, 'flat', false) },
      { title: 'fluffy, off', cells: bodyCells(96, 'fluffy', false) },
    ],
    end: IDLE_END,
  }),
  large: () => ({
    rows: (['flat', 'fluffy'] as const).map((m) => ({
      title: `${m} 240`,
      cells: (['blob', 'star', 'heart', 'cloud', 'flower'] as const).map((shape) => powered(shape, avatar(240, m, ORANGE, shape))),
    })),
    end: IDLE_END,
  }),
  sizes: () => ({
    rows: ([['flat', ORANGE], ['fluffy', ORANGE], ['flat', BLACK], ['fluffy', BLACK]] as const).map(([m, c]) => ({
      title: name(m, c),
      cells: [...[240, 96, 36, 22].map((size) => powered(`${size} px`, avatar(size, m, c))), { label: '96 px, off', o: avatar(96, m, c) }],
    })),
    end: IDLE_END,
  }),
  // A change of shape while powered, a cell every 32 ms: the coat fades out and back as the body morphs. (The last
  // cell is a heart from the start, so that the heart's coat is made before the clock runs: a frame paints only a
  // coat whose mesh is made.)
  morph: () => ({
    rows: (['flat', 'fluffy'] as const).map((m) => ({
      title: `${m} 96, blob to heart`,
      cells: [
        ...Array.from({ length: 16 }, (_, i): Cell => ({ label: `${32 * i} ms`, o: avatar(96, m), at: [[0, { ultra: true }], [1504 + 32 * (15 - i), { shape: 'heart' }]] })),
        powered('heart', avatar(96, m, ORANGE, 'heart')),
      ],
    })),
    end: 1504 + 32 * 15,
  }),
  // Drawn with the browser asked for reduced motion: each cell is mounted powered and is its still at once.
  reduced: () => ({
    rows: ([['flat', ORANGE], ['fluffy', ORANGE], ['flat', BLACK], ['fluffy', BLACK]] as const).map(([m, c]) => ({
      title: `${name(m, c)}, reduced`,
      cells: [
        ...[240, 96, 36, 22].map((size) => ({ label: `${size} px`, o: { ...avatar(size, m, c), ultra: true } })),
        { label: 'heart 96', o: { ...avatar(96, m, c, 'heart'), ultra: true } },
        { label: 'star 96', o: { ...avatar(96, m, c, 'star'), ultra: true } },
        { label: 'blob 96, off', o: avatar(96, m, c) },
      ],
    })),
    end: 0,
  }),
};

const w = window as unknown as Record<string, unknown>;

/** Draw one sheet into #sheet, on a light or a dark page. */
w.sheet = async (which: string, dark: boolean) => {
  sheet = document.getElementById('sheet')!;
  document.body.className = dark ? 'dark' : 'light';
  return draw(SHEETS[which]());
};

/** The DOM a powered avatar has, flat and fluffy, in this browser: what mount() put where, what it resolves to. */
w.facts = async () => {
  sheet = document.getElementById('sheet')!;
  document.body.className = 'dark';
  const cells: Cell[] = [
    { label: 'never', o: avatar(96, 'flat') },
    powered('flat', avatar(96, 'flat')),
    powered('fluffy', avatar(96, 'fluffy')),
    powered('antennas', avatar(96, 'flat', ORANGE, 'blob', ANTENNAS)),
  ];
  await draw({ rows: [{ title: 'facts', cells }], end: IDLE_END });
  const hosts = [...sheet.querySelectorAll('.cell > div:first-child')] as HTMLElement[];
  const tree = (el: Element): string => `${el.tagName.toLowerCase()}${el.children.length ? `[${[...el.children].map((c) => (c.tagName === 'path' ? 'path' : tree(c))).join(',')}]` : ''}`;
  const facts = hosts.map((host, i) => {
    const svgs = [...host.querySelectorAll(':scope > svg')], top = svgs.at(-1)!;
    const skin = [...top.children].find((g) => g.tagName === 'g' && g.querySelector('linearGradient')) ?? null;
    // (The skin's paths: the rainbow blended into fur, the flat rainbow, the sheen. The rainbow shown is the one drawn.)
    const paths = skin ? [...skin.children].slice(1) as SVGPathElement[] : [];
    const rainbow = paths.slice(0, 2).find((p) => p.getAttribute('d')), sheen = paths[2];
    const halo = [...host.querySelectorAll('path')].find((p) => /-halo/.test(p.style.fill)) ?? null;
    const id = /#([^")]+)/.exec(halo?.style.fill ?? '')?.[1];
    const eye = top.querySelectorAll(':scope > path')[1] as SVGPathElement;
    return {
      cell: cells[i].label,
      children: [...host.children].map((c) => (c.tagName === 'CANVAS' ? `canvas(${(c as HTMLElement).style.display || 'shown'})` : tree(c))),
      skinAfterBody: skin ? skin.previousElementSibling === top.querySelector(':scope > path') : null,
      groupOpacity: skin?.getAttribute('opacity') ?? null,
      rainbow: rainbow && { fill: rainbow.getAttribute('fill'), blend: getComputedStyle(rainbow).mixBlendMode, opacity: rainbow.getAttribute('opacity'), stroke: rainbow.getAttribute('stroke'), strokeWidth: rainbow.getAttribute('stroke-width'), paintOrder: getComputedStyle(rainbow).paintOrder },
      sheenOpacity: sheen?.getAttribute('opacity') ?? null,
      halo: halo && { fill: halo.style.fill, inBelowSvg: svgs.length > 1 && svgs[0].contains(halo), resolves: !!(id && document.getElementById(id)) },
      eyeFill: getComputedStyle(eye).fill,
      svgFilter: (top as SVGElement).style.filter,
    };
  });
  for (const m of mounted.splice(0)) m.destroy();
  return facts;
};

/**
 * n live avatars of 96 px for `ms`, powered or not, idle (a powered avatar never rests): the shared loop's time per
 * frame, on the browser's own frames.
 */
w.frames = async (n: number, material: Material, ultra: boolean, ms: number) => {
  const host = document.getElementById('live')!;
  host.replaceChildren();
  const all: Mounted[] = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'live';
    host.append(el);
    all.push(mount(el, { shape: 'blob', size: 96, material, seed: i + 1, ultra }));
  }
  // Settle first: the first coats are painted through the queue, and the power comes in.
  await until(() => material === 'flat' || [...host.querySelectorAll('canvas')].every((c) => c.style.display !== 'none'), 10000);
  await wait(1500);
  frameMs.length = 0;
  frameAt.length = 0;
  framePainted.length = 0;
  const painted = copies;
  await wait(ms);
  const coatPaints = copies - painted, tick = ticking();
  for (const m of all) m.destroy();
  const sorted = [...frameMs].sort((x, y) => x - y), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  const span = frameAt.length > 1 ? frameAt[frameAt.length - 1] - frameAt[0] : 0;
  return {
    avatars: n, material, ultra, ticking: tick.count, coatPaints, frames: frameMs.length, fps: span ? ((frameAt.length - 1) * 1000) / span : 0,
    meanMs: mean(frameMs), medianMs: at(0.5), p95Ms: at(0.95), maxMs: sorted[sorted.length - 1] ?? 0,
    // The frames that painted no coat, and those that did.
    quiet: { frames: frameMs.filter((_, i) => !framePainted[i]).length, meanMs: mean(frameMs.filter((_, i) => !framePainted[i])) },
    painting: { frames: frameMs.filter((_, i) => framePainted[i]).length, meanMs: mean(frameMs.filter((_, i) => framePainted[i])) },
  };
};
