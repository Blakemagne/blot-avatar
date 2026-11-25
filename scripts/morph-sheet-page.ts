// The page scripts/morph-sheet.mjs runs in a browser: changes of shape on mount()'s own avatars, flat and fluffy,
// frame by frame on a clock of the page's own, and a powered fluffy avatar close up. Bundled by that script; not
// part of the package.

import { GALLERY, drawAvatar, mount, type MountOptions, type Mounted, type Shape } from '../src/index';

// The page's clock: a frame comes only when pump() asks for one, 16 ms after the last, so each picture is the same
// on every run. Everything counts as on screen, below the fold too.
let now = 1000;
const due = new Map<number, FrameRequestCallback>();
let ids = 0;
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
function pump(ms: number): void {
  for (let i = 0; i < Math.round(ms / 16); i++) {
    now += 16;
    const fns = [...due.values()];
    due.clear();
    for (const fn of fns) fn(now);
  }
}

const ORANGE = '#FD690F', BLACK = '#000000';
type Material = 'flat' | 'fluffy';
const gallery = (id: string): Shape => GALLERY.find((g) => g.definition.id === id)!.definition;
const nameOf = (s: Shape) => (typeof s === 'string' ? s : s.id);

/** The changes of shape drawn: from, to, powered. */
const PAIRS: [Shape, Shape, boolean][] = [
  ['blob', 'star', false], ['star', 'heart', false], ['heart', 'cloud', false], ['blob', 'house', false],
  [gallery('mug'), gallery('lightbulb'), false], [gallery('bunny'), gallery('sprout'), false], [gallery('barbell'), 'blob', false], ['blob', 'house', true],
];
/** How far into the change each cell is, ms on the page's clock (the change takes MORPH_MS, 400). */
const INTO = Array.from({ length: 14 }, (_, i) => i * 32);
/** When the change starts for the cell furthest into it: late enough for a powered avatar to be all the way powered. */
const END = 1600;

interface Cell { label: string; o: MountOptions; at?: [number, Partial<MountOptions>][] }
interface Row { title: string; cells: Cell[] }

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

async function draw(rows: Row[], end: number): Promise<Record<string, unknown>> {
  for (const m of mounted.splice(0)) m.destroy();
  sheet.replaceChildren();
  const hosts: { host: HTMLElement; cell: Cell; m: Mounted; label: HTMLElement }[] = [];
  for (const row of rows) {
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
      host.style.margin = `${Math.ceil(cell.o.size * 0.12) + 4}px`;
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
  if (end > at) pump(end - at);
  // A new body's mesh, and the other body's coat in a cross-over, are made and painted through the queue after the clock.
  const inTime = await until(() => fluffy.every((h) => coatShown(h.host)), 15000);
  await wait(400);
  const cells = hosts.map((h) => {
    const s = h.m.live.rig.state, k = s.morph?.k;
    if (k !== undefined) h.label.textContent = `${h.cell.label} k ${k.toFixed(2)}`;
    const c = s.body ? drawAvatar(s.body, 'gray', s, h.cell.o.size, { coat: true }).coat : undefined;
    const canvas = h.host.querySelector('canvas'), body = h.host.querySelector('svg:last-of-type > path') as SVGPathElement | null;
    return {
      label: `${h.cell.o.material} ${h.cell.o.size} ${h.cell.label}`, k: k ?? null, coat: c ? { body: c.body.id, opacity: c.opacity, also: c.also ? { body: c.also.body.id, share: +c.also.share.toFixed(3) } : null } : null,
      shown: h.cell.o.material === 'fluffy' ? coatShown(h.host) : null, canvasOpacity: canvas?.style.opacity ?? null, bodyFill: body?.style.fillOpacity ?? null,
    };
  });
  return { avatars: hosts.length, coatsInTime: coats, coatsAfterClock: inTime, notShown: cells.filter((c) => c.shown === false).map((c) => c.label), cells };
}

const avatar = (shape: Shape, size: number, material: Material, ultra: boolean, color = ORANGE): MountOptions => ({ shape, size, material, color, seed: 3, ultra });
function morphRow(from: Shape, to: Shape, ultra: boolean, size: number, material: Material, color = ORANGE): Row {
  return {
    title: `${nameOf(from)} > ${nameOf(to)}${ultra ? ', powered' : ''} ${material}${color === BLACK ? ', black' : ''} ${size}`,
    cells: INTO.map((ms): Cell => ({ label: `${ms} ms`, o: avatar(from, size, material, ultra, color), at: [[END - ms, { shape: to }]] })),
  };
}

const SHEETS: Record<string, () => { rows: Row[]; end: number }> = {
  'morph-240': () => ({ rows: PAIRS.map(([a, b, u]) => morphRow(a, b, u, 240, 'fluffy')), end: END }),
  'morph-96': () => ({ rows: PAIRS.flatMap(([a, b, u]) => [morphRow(a, b, u, 96, 'flat'), morphRow(a, b, u, 96, 'fluffy'), morphRow(a, b, u, 96, 'fluffy', BLACK)]), end: END }),
  // Powered fluffy, close up, at rest: there must be no pale ring inside the coat where the body path ends.
  'powered-close': () => ({
    rows: [{ title: 'powered fluffy 640', cells: [
      { label: 'blob', o: avatar('blob', 640, 'fluffy', true) },
      { label: 'heart, black', o: avatar('heart', 640, 'fluffy', true, BLACK) },
    ] }],
    end: END,
  }),
};

const w = window as unknown as Record<string, unknown>;
w.sheets = () => Object.keys(SHEETS);
w.sheet = async (which: string, dark: boolean) => {
  sheet = document.getElementById('sheet')!;
  document.body.className = dark ? 'dark' : 'light';
  const s = SHEETS[which]();
  return draw(s.rows, s.end);
};
