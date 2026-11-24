// The page scripts/coat-sheet.mjs runs in a browser: contact sheets of exact states, flat and fluffy side by
// side, a check of mount()'s DOM with a coat, and the timings. Bundled by that script; not part of the package.

import { BODIES, FACES, GALLERY, Rig, coatMesh, colours, drawAvatar, mount, outlineBody, paintEffects, stillState, svgBox, ticking, writeLayers, type Body, type Mounted, type RigState } from '../src/index';
import { coatLayer, type CoatLayer } from '../src/coat/layer';
import { coatable, renderCoat } from '../src/coat/renderer';
import { coatBox } from '../src/still';

const SVG = 'http://www.w3.org/2000/svg';

// Every frame the shared loop runs, timed: the frame loop calls requestAnimationFrame when it needs a frame.
const frameMs: number[] = [], frameAt: number[] = [];
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (fn) => raf((now) => {
  const t0 = performance.now();
  fn(now);
  frameMs.push(performance.now() - t0);
  frameAt.push(t0);
});

// Every coat painted, counted: each is one picture copied out of the renderer's canvas (which is in no document).
let copies = 0;
const drawImage = CanvasRenderingContext2D.prototype.drawImage as (...a: unknown[]) => void;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
  if (a[0] instanceof HTMLCanvasElement && !a[0].isConnected) copies++;
  return drawImage.apply(this, a);
} as typeof CanvasRenderingContext2D.prototype.drawImage;
// The renderer's context (the one WebGL2 context asked to keep its drawing), to lose and restore it.
let coatGl: WebGL2RenderingContext | null = null;
const getContext = HTMLCanvasElement.prototype.getContext as (...a: unknown[]) => unknown;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: { preserveDrawingBuffer?: boolean }) {
  const ctx = getContext.call(this, kind, options);
  if (kind === 'webgl2' && options?.preserveDrawingBuffer) coatGl = ctx as WebGL2RenderingContext;
  return ctx;
} as typeof HTMLCanvasElement.prototype.getContext;

const deg = (d: number) => (d * Math.PI) / 180;
const gallery = (id: string): Body => outlineBody(GALLERY.find((g) => g.definition.id === id)!.definition);
/** The blob with antennas and a decal round one eye, as parts.test.mjs builds one (its eyes left as they are). */
const ANTENNAS = {
  ...BODIES.blob,
  id: 'sheet-antennas',
  antennas: { pivot: [0.4, 0.6, 0], base: 0.3, whip: 0.6, radii: [0.04, 0.03, 0.02], rest: deg(10), follow: 0.35, paint: 'antenna' },
  decals: [{ id: 'rim-left', at: [0, 0], w: 0.3, h: 0.3, shape: 'circle', paint: 'rim', eye: 'left' }],
  paint: { antenna: '#2A2A2A', rim: '#2A2A2A' },
} as unknown as Body;

const FRONT: RigState = { pose: { yaw: 0, pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };

/** A rig on `body` after `setup` and `steps` steps of 16 ms, without idling or blinking. */
function rigged(body: Body, setup: (r: Rig) => void, steps: number): RigState {
  const r = new Rig({ seed: 3, body, idle: false, blinks: false });
  setup(r);
  for (let i = 0; i < steps; i++) r.step(16);
  return r.state;
}
const look = (body: Body, x: number, y: number) => rigged(body, (r) => r.look(x, y), 90);
/** The step of a hop where `pick` is largest. */
function hopAt(body: Body, pick: (s: RigState) => number): RigState {
  let best = 0, at = 0;
  for (let i = 1; i < 40; i++) {
    const v = pick(rigged(body, (r) => r.poke('hop'), i));
    if (v > best) { best = v; at = i; }
  }
  return rigged(body, (r) => r.poke('hop'), at);
}
/** A morph from `from` to `to`, `k` of the way. */
function morphAt(from: Body, to: Body, k: number): RigState {
  for (let i = 1; i < 200; i++) {
    const s = rigged(from, (r) => r.setBody(to), i);
    if (!s.morph || s.morph.k >= k) return s;
  }
  return rigged(from, (r) => r.setBody(to), 200);
}

const layers: CoatLayer[] = [];
let sheet: HTMLElement;

interface Cell { body: Body; colour: string; state: RigState; size: number; label: string }

/** One avatar of a cell: flat, or fluffy (its coat painted through the shared queue). */
function avatar(c: Cell, fluffy: boolean, outline: boolean): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.style.width = slot.style.height = `${c.size}px`;
  slot.style.margin = `${Math.ceil(c.size * 0.3)}px`;
  const d = drawAvatar(c.body, 'gray', c.state, c.size, fluffy ? { coat: true } : undefined), paint = colours(c.colour);
  const b = svgBox(c.size);
  const svgOf = () => {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('width', String(b.width));
    s.setAttribute('height', String(b.height));
    s.setAttribute('viewBox', b.viewBox);
    Object.assign(s.style, { position: 'absolute', left: `${b.left}px`, top: `${b.top}px`, overflow: 'visible' });
    return s;
  };
  const path = (dd: string, fill: string) => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', dd);
    p.style.fill = fill;
    return p;
  };
  const g = () => document.createElementNS(SVG, 'g');
  const svg = svgOf(), body = path(d.body, paint.fill), eyes = d.eyes.map((e) => path(e, paint.eyeFill));
  const under = g(), over = g(), back = g(), front = g();
  writeLayers(under, over, d, c.body.paint);
  paintEffects(back, front, d, paint);
  if (!fluffy) {
    svg.append(back, under, body, over, ...eyes, front);
    slot.append(svg);
    return slot;
  }
  const below = svgOf(), canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.display = 'none';
  below.append(back, under);
  svg.append(body, over, ...eyes, front);
  slot.append(below, canvas, svg);
  if (outline) { body.style.stroke = '#00C8FF'; body.style.strokeWidth = '0.12'; }
  const layer = coatLayer(body, () => canvas);
  layer.draw(d, c.size, paint.fill);
  layers.push(layer);
  return slot;
}

function row(title: string, cells: Cell[], mode: 'pair' | 'fluffy' | 'outline' = 'pair'): void {
  const r = document.createElement('div');
  r.className = 'row';
  const h = document.createElement('div');
  h.className = 'title';
  h.textContent = title;
  r.append(h);
  for (const c of cells) {
    const box = document.createElement('div');
    box.className = 'cell';
    const two = document.createElement('div');
    two.className = 'two';
    if (mode === 'pair') two.append(avatar(c, false, false));
    two.append(avatar(c, true, mode === 'outline'));
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = c.label;
    box.append(two, label);
    r.append(box);
  }
  sheet.append(r);
}

const ORANGE = '#FD690F', YELLOW = '#F59312', DARK = '#000000', PALE = '#EDE7DA';
const COLOURS: [string, string][] = [[ORANGE, 'orange'], [YELLOW, 'yellow'], [DARK, 'black'], [PALE, 'pale']];

const SHEETS: Record<string, () => void> = {
  sizes() {
    const blob = BODIES.blob;
    for (const [state, name] of [[(s: number) => stillState('blob', s), 'still'], [() => look(blob, -1, 0), 'look left'], [() => look(blob, 0.7, 0.7), 'look up right']] as const) {
      row(name, [22, 48, 64, 128, 200].map((size) => ({ body: blob, colour: ORANGE, state: state(size), size, label: `${size} px` })));
    }
  },
  colours() {
    for (const [colour, name] of COLOURS) {
      row(name, [
        { body: BODIES.blob, colour, state: stillState('blob', 128), size: 128, label: 'still' },
        { body: BODIES.blob, colour, state: look(BODIES.blob, 0.8, 0.5), size: 128, label: 'look up right' },
        { body: BODIES.blob, colour, state: stillState('blob', 48), size: 48, label: '48 px' },
        { body: BODIES.blob, colour, state: FRONT, size: 22, label: '22 px' },
      ]);
    }
  },
  bodies() {
    const bodies: [Body, string, string][] = [
      [BODIES.blob, 'blob', ORANGE], [BODIES.heart, 'heart', '#FB2B3E'], [BODIES.star, 'star', YELLOW], [BODIES.cloud, 'cloud', '#1E86FC'],
      [gallery('controller'), 'controller (gallery)', ORANGE], [gallery('mug'), 'mug (gallery)', PALE], [ANTENNAS, 'antennas, decal', '#14C16F'],
    ];
    row('still', bodies.map(([body, label, colour]) => ({ body, colour, state: stillState(body.id ?? 'blob', 128), size: 128, label })));
    row('look right', bodies.map(([body, label, colour]) => ({ body, colour, state: look(body, 1, 0.2), size: 128, label })));
  },
  states() {
    for (const [body, name] of [[BODIES.blob, 'blob'], [ANTENNAS, 'antennas']] as const) {
      row(name, [
        { body, colour: ORANGE, state: FRONT, size: 128, label: 'front' },
        { body, colour: ORANGE, state: look(body, -1, 0), size: 128, label: 'look left' },
        { body, colour: ORANGE, state: look(body, 1, 0), size: 128, label: 'look right' },
        { body, colour: ORANGE, state: look(body, 0, 1), size: 128, label: 'look up' },
        { body, colour: ORANGE, state: { ...FRONT, lid: 0.12 }, size: 128, label: 'blink' },
        { body, colour: ORANGE, state: { ...FRONT, face: FACES.happy }, size: 128, label: 'happy' },
        { body, colour: ORANGE, state: hopAt(body, (s) => 1 - (s.stretch ?? 1)), size: 128, label: 'hop: squash' },
        { body, colour: ORANGE, state: hopAt(body, (s) => s.lift ?? 0), size: 128, label: 'hop: in the air' },
      ]);
    }
    row('morph', [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map((k) => ({ body: BODIES.heart, colour: ORANGE, state: morphAt(BODIES.blob, BODIES.heart, k), size: 128, label: `blob to heart ${k}` })));
  },
  outline() {
    const bodies: [Body, string][] = [[BODIES.blob, 'blob'], [BODIES.heart, 'heart'], [BODIES.star, 'star'], [gallery('controller'), 'controller'], [ANTENNAS, 'antennas']];
    row('still', bodies.map(([body, label]) => ({ body, colour: ORANGE, state: stillState(body.id ?? 'blob', 128), size: 128, label })), 'outline');
    row('look left', bodies.map(([body, label]) => ({ body, colour: ORANGE, state: look(body, -1, 0.3), size: 128, label })), 'outline');
    row('squash', bodies.map(([body, label]) => ({ body, colour: ORANGE, state: hopAt(body, (s) => 1 - (s.stretch ?? 1)), size: 128, label })), 'outline');
  },
  small() {
    for (const [colour, name] of COLOURS) {
      row(name, [22, 32, 48, 64].flatMap((size) => [
        { body: BODIES.blob, colour, state: stillState('blob', size), size, label: `${size} px` },
        { body: BODIES.blob, colour, state: look(BODIES.blob, -1, 0.3), size, label: `${size} px, look` },
      ]));
    }
  },
};

const w = window as unknown as Record<string, unknown>;

/** Draw one sheet into #sheet, on a light or a dark page. */
w.sheet = (name: string, dark: boolean) => {
  for (const l of layers.splice(0)) l.stop();
  sheet = document.getElementById('sheet')!;
  sheet.replaceChildren();
  document.body.className = dark ? 'dark' : 'light';
  SHEETS[name]();
};
/** Every coat on the sheet painted (or given up on). */
w.settled = () => layers.every((l) => !l.pending);
/** How many coats show. */
w.showing = () => layers.filter((l) => l.showing).length;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function until(ok: () => boolean, ms = 5000): Promise<boolean> {
  const end = performance.now() + ms;
  while (!ok()) {
    if (performance.now() > end) return false;
    await wait(20);
  }
  return true;
}

/** What WebGL2 is here. */
w.info = () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { coatable: coatable(), renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio };
};

/** mount() with a coat: its DOM while the coat shows, after switching to flat and back, and after destroy(). */
w.mountCheck = async () => {
  const host = document.getElementById('mount')!;
  host.replaceChildren();
  host.style.cssText = '';
  const kids = () => [...host.children].map((c) => `${c.tagName.toLowerCase()}${c instanceof HTMLCanvasElement ? `(${c.style.display || 'shown'})` : `[${[...c.children].map((g) => g.tagName.toLowerCase()).join(',')}]`}`).join(' ');
  const body = () => host.querySelectorAll('path')[0] as SVGPathElement;
  const out: Record<string, unknown> = {};
  const m: Mounted = mount(host, { shape: 'blob', size: 96, material: 'fluffy' });
  out.atMount = kids();
  out.coatShown = await until(() => !!host.querySelector('canvas') && host.querySelector('canvas')!.style.display !== 'none');
  out.withCoat = kids();
  out.bodyFillOpacity = getComputedStyle(body()).fillOpacity;
  m.update({ material: 'flat' });
  out.flat = kids();
  out.flatFillOpacity = getComputedStyle(body()).fillOpacity;
  m.update({ material: 'fluffy' });
  out.againShown = await until(() => !!host.querySelector('canvas') && host.querySelector('canvas')!.style.display !== 'none');
  out.again = kids();
  m.destroy();
  out.destroyed = { children: host.children.length, style: host.getAttribute('style') };
  return out;
};

/** The coat's costs before anything else is drawn: each body's mesh, and the renderer's first coat. */
w.builds = () => {
  const out: Record<string, number> = {};
  const bodies: [string, Body][] = [['blob', BODIES.blob], ['heart', BODIES.heart], ['star', BODIES.star], ['cloud', BODIES.cloud], ['flower', BODIES.flower], ['house', BODIES.house]];
  for (const id of ['controller', 'mug', 'lightbulb']) {
    const t0 = performance.now();
    bodies.push([`${id} (gallery)`, gallery(id)]);
    out[`outlineBody ${id}`] = performance.now() - t0;
  }
  for (const [name, body] of bodies) {
    const t0 = performance.now();
    coatMesh(body);
    out[`coatMesh ${name}`] = performance.now() - t0;
  }
  const mesh = coatMesh(BODIES.blob), box = coatBox(96, devicePixelRatio, mesh.radius + 0.12);
  const frame = { mesh, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], cx: box.cx, cy: box.cy, half: box.half, pixels: box.pixels, pxPerUnit: 48 * devicePixelRatio, colour: [253, 105, 15] as const, eyes: null };
  let t0 = performance.now();
  renderCoat(frame);
  out['first coat (makes the renderer: shaders, textures, the mesh on the GPU)'] = performance.now() - t0;
  t0 = performance.now();
  renderCoat(frame);
  out['second coat, same mesh (96 px)'] = performance.now() - t0;
  return out;
};

/**
 * n live avatars of 96 px for `ms`, following a pointer that keeps moving (so every frame turns them) or idle (a
 * breath, a blink, a glance now and then): the frame loop's time per frame, and how many coats were painted.
 */
w.frames = async (n: number, material: 'flat' | 'fluffy', ms: number, moving = true) => {
  const host = document.getElementById('live')!;
  host.replaceChildren();
  const mounted: Mounted[] = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'live';
    host.append(el);
    mounted.push(mount(el, { shape: 'blob', size: 96, follow: moving, material, seed: i + 1 }));
  }
  let a = 0;
  const move = () => {
    a += 0.08;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700 + 600 * Math.cos(a), clientY: 450 + 400 * Math.sin(a) }));
  };
  const timer = moving ? setInterval(move, 16) : 0;
  // Settle first: the first coats are painted through the queue.
  await wait(1500);
  frameMs.length = 0;
  frameAt.length = 0;
  const painted = copies;
  await wait(ms);
  clearInterval(timer);
  const coatPaints = copies - painted;
  const shown = [...host.querySelectorAll('canvas')].filter((c) => c.style.display !== 'none').length;
  for (const m of mounted) m.destroy();
  const sorted = [...frameMs].sort((x, y) => x - y), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const span = frameAt.length > 1 ? frameAt[frameAt.length - 1] - frameAt[0] : 0;
  return {
    avatars: n, material, moving, coatsShowing: shown, coatPaints, frames: frameMs.length, fps: span ? ((frameAt.length - 1) * 1000) / span : 0,
    meanMs: frameMs.reduce((s, v) => s + v, 0) / Math.max(1, frameMs.length), medianMs: at(0.5), p95Ms: at(0.95), maxMs: sorted[sorted.length - 1] ?? 0,
  };
};

const shownIn = (host: Element) => () => { const c = host.querySelector('canvas'); return !!c && c.style.display !== 'none'; };

/** An avatar at rest (and under reduced motion, when the browser is asked for it): painted once, then nothing ticks. */
w.stillCheck = async () => {
  const host = document.getElementById('mount')!;
  host.replaceChildren();
  const m = mount(host, { shape: 'blob', size: 96, material: 'fluffy', rests: true });
  const out: Record<string, unknown> = { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  out.shown = await until(shownIn(host));
  await wait(200);
  const before = copies;
  await wait(1000);
  out.ticking = ticking();
  out.paintsInASecond = copies - before;
  m.destroy();
  return out;
};

/** A lost WebGL context: a coat drawn meanwhile is flat, and when the context comes back the coat does too. */
w.loseCheck = async () => {
  const host = document.getElementById('mount')!;
  host.replaceChildren();
  const m = mount(host, { shape: 'blob', size: 96, material: 'fluffy', rests: true });
  const shown = shownIn(host), out: Record<string, unknown> = { shown: await until(shown) };
  const ext = coatGl?.getExtension('WEBGL_lose_context');
  if (!ext) { m.destroy(); return { ...out, error: 'no WEBGL_lose_context' }; }
  ext.loseContext();
  await wait(100);
  // Drawn again while it is lost (a new colour): flat.
  m.update({ color: '#14C16F' });
  await wait(200);
  out.whileLost = { shown: shown(), bodyFillOpacity: getComputedStyle(host.querySelectorAll('path')[0]).fillOpacity };
  ext.restoreContext();
  out.backAfterRestore = await until(shown, 3000);
  // At rest, its picture held: a GPU reset can take the canvas's own pixels with the context (blanked here by
  // hand). When the context comes back the picture is drawn again, though nothing moved.
  await wait(300);
  const canvas = host.querySelector('canvas')!;
  canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  const before = copies;
  ext.loseContext();
  await wait(100);
  ext.restoreContext();
  out.paintedAgainAtRest = await until(() => copies > before, 3000);
  m.destroy();
  return out;
};
