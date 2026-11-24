// The demo page. Everything on it is the package's public API (@blot/avatar): mount() for each avatar, and the lists the
// engine exports (BODIES, GALLERY, FACE_NAMES, ACTIVITIES, FORMS, POKES, CUES) for every set of buttons, so a new body,
// avatar, face or clip in the package shows up here without touching this file. The waggle is the one move written here.
//
// The page is three views, one at a time (#studio, #moves, #use), and each pages what it holds behind tabs, so
// every option is a click or two away and only one set of them is on screen. The studio is laid out after
// open-bot-avatar's (Dominik Scholz and its contributors, MIT; see THIRD_PARTY_NOTICES.md): a stage with what it is
// doing under it, Export and Copy, and a card of tabs to pick one, play with it, or have a model make a new one.

import {
  ACTIVITIES, BODIES, BOT_COLOURS, CUES, FACE_NAMES, FORMS, GALLERY, PERSONALITY, POKES, bodyOf, coatMesh, coatable, colours, drawAvatar, galleryColour,
  mount, onMotion, reducedMotion, stillState, svgBox,
  type AvatarDefinition, type Material, type MountOptions, type Mounted, type Personality, type Shape,
} from '@blot/avatar';
import { cue, eyes, head, toward, wave } from '@blot/avatar/moves';
import { colorPicker, contrast } from './picker';
import PROMPT from './prompt.md';
import {
  AGENTS, designBrief, freeId, isAgent, parseImport, readMaterial, readShare, repairBrief, reviveYours, shareLink, stillSvg, type Agent,
} from './studio';

/** The move this page adds through the `clips` option: a waggle. The same text is on the page. */
const waggle = cue(900, [
  head.lean(toward, 7).along(wave(1.5).dwindling()),
  eyes.glance(toward, 0.15).along(wave(1.5).dwindling()),
]);
const clips = { waggle };

interface Move { name: string; lane: 'poke' | 'cue'; here?: boolean }
const MOVES: Move[] = [
  ...POKES.map((name): Move => ({ name, lane: 'poke' })),
  ...CUES.map((name): Move => ({ name, lane: 'cue' })),
  { name: 'waggle', lane: 'cue', here: true },
];

/** What each move reads as. A clip added to the package later gets its name and lane only. */
const SAYS: Record<string, string> = {
  spin: 'half a turn and back. a click plays the pokes in turn, and this is the first.',
  nod: 'a nod: yes.',
  hop: 'a hop off the ground, with a squash as it lands.',
  shake: 'a shake of the head: no.',
  bounce: 'two quick hops: done!',
  tilt: 'the head leans over and holds: hm?',
  delight: 'up off the ground with happy eyes, and sparks thrown up.',
  wink: 'one eye shuts and opens again.',
  wide: 'a squint, then the eyes go wide.',
  alert: 'up sharply, eyes open, and a pulse of its own outline.',
  recoil: 'a jump back away from something on one side.',
  lean: 'a lean to one side, held, and back.',
  tug: 'pulled one way, then it springs back and rings out.',
  settle: 'a wobble that dies away, as if set down hard.',
  flare: 'a surge of glow that flickers out; the body swells with it.',
  float: 'up off the ground for two slow bobs.',
  look: 'a glance to one side and up: the eyes first, the head after.',
  exclaim: 'a "!" gathers above its head out of sparks, and falls apart.',
  burst: 'it draws in and lets go: sparks fly off all round.',
  comet: 'a wind-up, a dash with speed lines behind it, and back.',
  rings: 'rings come round it, passing behind and in front.',
  rock: 'a rock from side to side about a point below it.',
  waggle: 'a swing and a half from side to side, the eyes going with it. written on this page, in three lines.',
};

/** The effects' colour (a mark, sparks, rings, Zs, a glow) on every avatar here. */
const ACCENT = '#7C5CFF';
/** The shapes a visit goes to. */
const VISITS = ['teardrop', 'hex', 'wedge', 'star'];

/** blot's Bot colours, named in lowercase as the page writes. Black is drawn as blot draws it: in the page's ink, light on the dark theme. */
const BLACK = '#000000';
const COLOURS = BOT_COLOURS.map(([hex, name]) => [hex, name.toLowerCase(), hex === BLACK ? 'var(--ink)' : undefined] as const);
const DEFAULT_COLOUR = '#FD690F';
/** The colours the galleries go through: blot's, from orange on, and no black. */
const CYCLE = [...BOT_COLOURS.slice(3), ...BOT_COLOURS.slice(1, 3)].map(([hex]) => hex);
/** The body's colours for a colour picked: black in the page's ink, its eyes the other way round (unless picked). */
const inked = (color: string, eyes?: string): Pick<MountOptions, 'color' | 'fill' | 'eyeFill'> =>
  color === BLACK ? { color, fill: 'var(--ink)', eyeFill: eyes ?? 'var(--bg)' } : { color, fill: undefined, eyeFill: eyes };
/** Eye colours to start from. With none picked the eyes are automatic: white, or dark on a pale body. */
const EYES: [string, string][] = [
  ['#FFFFFF', 'white'], ['#1C1C1C', 'ink'], ['#FFD23F', 'gold'], ['#7FE3FF', 'ice'], ['#FF5C8A', 'pink'], ['#3DDC84', 'mint'],
];
/** Below this contrast with the body, the eyes are hard to make out. */
const FAINT = 1.6;
const SHAPES = Object.keys(BODIES);
/** Forms are what the body turns into while it thinks or works; they mean nothing otherwise. */
const BUSY = new Set(['thinking', 'working']);
/** Where the page lives, for a prompt's link when it is opened from disk. */
const PAGES = 'https://blakemagne.github.io/blot-avatar/';
/** The longest link to an agent app this page opens: browsers and the system may not hand a longer one on. */
const LINK_MOST = 2000;

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`demo: nothing matches ${sel}`);
  return el;
};
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
};
/** localStorage, which a private window or a blocked site may refuse: then nothing is kept, and the page works the same. */
const stored = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* kept for this visit only */ } },
};

/** Every move button on the page, turned off together under reduced motion (a move would do nothing). */
const moveButtons: HTMLButtonElement[] = [];
const still = (): void => {
  const off = reducedMotion();
  for (const b of moveButtons) b.disabled = off;
  $('[data-motion-note]').hidden = !off;
};

function play(bot: Mounted, m: Move, cue?: { dir?: number; amount?: number }): void {
  if (m.lane === 'poke') bot.poke(m.name);
  else bot.play(m.name, cue);
}

/** Put text on the clipboard; false where there is none (a plain-http page, or a browser that says no). */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function download(name: string, type: string, text: BlobPart): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = make('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- The logo: a live one in the header. It watches the pointer keenly, all over the page (a short reach and a
// big turn), opens its eyes wide when the pointer comes to it, and each poke is a move and a flourish (it is a
// button; Enter and Space poke it too).

const LOGO_SIZE = 30;
/** The logo's look is full this many px off, and turns this far at most. */
const LOGO_REACH = 160, LOGO_MOST = 0.9;
/** What each poke adds to the spin, nod or hop, in turn. */
const FLOURISH = ['delight', 'wink', 'exclaim', 'burst', 'rings', 'recoil'];
{
  const host = $('[data-avatar="logo"]');
  const logo = mount(host, {
    shape: 'blob', size: LOGO_SIZE, color: DEFAULT_COLOUR, follow: true, followReach: LOGO_REACH, followMost: LOGO_MOST, pokeable: true, label: 'the blot avatar logo', seed: 5, accent: ACCENT,
  });
  let next = 0;
  const flourish = () => { if (logo.play(FLOURISH[next])) next = (next + 1) % FLOURISH.length; };
  host.addEventListener('click', flourish);
  host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) flourish(); });
  host.addEventListener('pointerenter', () => { logo.play('wide'); });
}

// ---- What the studio can show: blot's bodies, the gallery's avatars, and yours (kept in this browser).

interface Entry {
  /** 'body:heart', 'gallery:cat', 'yours:teapot'. */
  key: string;
  id: string;
  name: string;
  kind: 'body' | 'gallery' | 'yours';
  shape: Shape;
  /** Its own colour, which it shows until another is picked for it. */
  own: string;
  definition?: AvatarDefinition;
}

const BODY_ENTRIES: Entry[] = SHAPES.map((id, i) => ({ key: `body:${id}`, id, name: id, kind: 'body', shape: id, own: CYCLE[i % CYCLE.length] }));
/** The gallery by its colours in blot's order, then by name. */
const GALLERY_ENTRIES: Entry[] = GALLERY.map((g): Entry => ({
  key: `gallery:${g.definition.id}`, id: g.definition.id, name: g.definition.name, kind: 'gallery', shape: g.definition, own: galleryColour(g), definition: g.definition,
})).sort((a, b) => BOT_COLOURS.findIndex(([h]) => h === a.own) - BOT_COLOURS.findIndex(([h]) => h === b.own) || a.name.localeCompare(b.name));
/** An avatar's name as the page writes it, in lowercase (the gallery's and yours have capitals in their definitions). */
const named = (e: Entry): string => e.name.toLowerCase();
/**
 * Text from elsewhere (the engine's checks, the browser's JSON errors) as the page writes it: a capital that starts
 * a sentence goes lowercase. A word in capitals (JSON), a path command (M, Z) and anything in double quotes (the
 * person's own text, quoted back by the browser) stay as they are.
 */
const calm = (t: string): string => t.split(/("[^"]*")/).map((s, i) => (i % 2 ? s : s.replace(/(^|[.!?:;]\s+)([A-Z])(?=[a-z])/g, (_, before: string, c: string) => before + c.toLowerCase()))).join('');
const yoursEntry = (d: AvatarDefinition): Entry => ({ key: `yours:${d.id}`, id: d.id, name: d.name, kind: 'yours', shape: d, own: DEFAULT_COLOUR, definition: d });

const YOURS_KEY = 'blot-avatar:yours';
let yours: AvatarDefinition[] = (() => { try { return reviveYours(JSON.parse(stored.get(YOURS_KEY) ?? '[]')); } catch { return []; } })();
const keepYours = (): void => stored.set(YOURS_KEY, JSON.stringify(yours));
// Another tab of this page changed yours: take its list, so a change here does not write over it.
addEventListener('storage', (e) => {
  if (e.key !== YOURS_KEY) return;
  try { yours = reviveYours(JSON.parse(e.newValue ?? '[]')); } catch { yours = []; }
  redrawYours();
  if (pg.key.startsWith('yours:') && !yours.some((d) => `yours:${d.id}` === pg.key)) select('body:blob');
  else if (pg.key.startsWith('yours:')) select(pg.key);
});
const entries = (): Entry[] => [...BODY_ENTRIES, ...GALLERY_ENTRIES, ...yours.map(yoursEntry)];
const entry = (key: string): Entry => entries().find((e) => e.key === key) ?? BODY_ENTRIES[0];

// ---- The studio's avatar.

const narrow = matchMedia('(max-width: 720px)');
/** The finish picked last, kept in this browser. */
const MATERIAL_KEY = 'blot-avatar:material';
const pg = {
  key: 'body:blob', color: DEFAULT_COLOUR, eyes: null as string | null, face: 'neutral', activity: 'idle', form: null as string | null,
  size: narrow.matches ? 150 : 180, follow: true, dir: 1, amount: 1, last: null as Move | null, mark: false, ultra: false, feel: { ...PERSONALITY } as Personality,
  material: readMaterial(stored.get(MATERIAL_KEY)) ?? 'flat' as Material,
};
/** The colour picked for each avatar this visit; one with none shows its own. */
const picked = new Map<string, string>();
const options = (): MountOptions => ({
  shape: entry(pg.key).shape, size: pg.size, ...inked(pg.color, pg.eyes ?? undefined), face: pg.face, activity: pg.activity,
  form: BUSY.has(pg.activity) ? pg.form : null, follow: pg.follow, mark: pg.mark, ultra: pg.ultra, personality: pg.feel, accent: ACCENT, material: pg.material,
});

// A link's query picks the avatar, its colour and what it is doing, once, as the page opens; then it is cleared,
// so a reload starts afresh. A definition in it is checked like an import and added to yours (under another id
// when one of yours already has its id, so a link never takes the place of one of yours).
const shared = readShare(location.search, ACTIVITIES);
{
  if (shared.definition) {
    const d = freeId(yours, shared.definition);
    if (!yours.some((y) => y.id === d.id)) { yours = [...yours, d]; keepYours(); }
    pg.key = `yours:${d.id}`;
  } else if (shared.gallery) {
    if (GALLERY_ENTRIES.some((e) => e.id === shared.gallery)) pg.key = `gallery:${shared.gallery}`;
  } else if (shared.avatar) {
    // A body first, then one of yours, then (for a link written by hand) the gallery.
    const found = [...BODY_ENTRIES, ...yours.map(yoursEntry), ...GALLERY_ENTRIES].find((e) => e.id === shared.avatar);
    if (found) pg.key = found.key;
  }
  if (shared.colour) picked.set(pg.key, shared.colour);
  if (shared.doing) pg.activity = shared.doing;
  if (shared.material) pg.material = shared.material;
  pg.color = picked.get(pg.key) ?? entry(pg.key).own;
  if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
}

const bot = mount($('[data-avatar="play"]'), { ...options(), followIn: $('[data-stage]'), pokeable: true, label: 'the studio\'s avatar', seed: 7, clips });

/** A row of buttons, one pressed. */
function chips(box: HTMLElement, values: readonly (string | null)[], now: () => string | null, pick: (v: string | null) => void, name = (v: string | null) => v ?? 'none'): () => void {
  const buttons = values.map((v) => {
    const b = make('button', { type: 'button', className: 'chip', textContent: name(v) });
    b.addEventListener('click', () => { pick(v); sync(); });
    box.append(b);
    return b;
  });
  const sync = (): void => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(values[i] === now())));
  sync();
  return sync;
}

const changed = (): void => { bot.update(options()); writeCode(); };

// ---- What the studio says, for a moment, beside the actions (and to a screen reader).

const saidBox = $('[data-said]');
let saidTimer = 0;
/** `hold`: it stays until the next thing is said, for a line to copy by hand. */
function said(text: string, hold = false): void {
  saidBox.textContent = text;
  clearTimeout(saidTimer);
  if (!hold) saidTimer = window.setTimeout(() => { saidBox.textContent = ''; }, 5000);
}

// What it is doing, under the stage; keys 1 to 6 there pick it too.
const formRow = $('[data-form-row]');
// A face is worn when idle: busy, the activity has its own. So the face chips wait until it is idle again,
// and the avatar never shows a face the code beside it would not give.
const faces = (): void => {
  const busy = pg.activity !== 'idle';
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-choice="face"] .chip')) b.disabled = busy;
  $('[data-face-note]').hidden = !busy;
};
const doing = (v: string): void => {
  pg.activity = v;
  formRow.hidden = !BUSY.has(pg.activity);
  faces();
  changed();
};
const syncDoing = chips($('[data-choice="activity"]'), ACTIVITIES, () => pg.activity, (v) => doing(v ?? 'idle'));
formRow.hidden = !BUSY.has(pg.activity);
$('.stage-col').addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (e.ctrlKey || e.metaKey || e.altKey || !Number.isInteger(n) || n < 1 || n > ACTIVITIES.length) return;
  if ((e.target as HTMLElement).closest('input, textarea, select')) return;
  e.preventDefault();
  doing(ACTIVITIES[n - 1]);
  syncDoing();
  said(ACTIVITIES[n - 1]);
});
chips($('[data-choice="form"]'), [null, ...FORMS], () => pg.form, (v) => { pg.form = v; changed(); });
chips($('[data-choice="face"]'), FACE_NAMES, () => pg.face, (v) => { pg.face = v ?? 'neutral'; changed(); });

// ---- Tabs and menus.

/**
 * A row of tabs (`[data-tabs=name]`): each tab's aria-controls names its panel, and one panel shows at a time. The
 * first tab shows to start with. Returns a function that shows a tab by its id; `shown` runs after each one the
 * person (or the page) shows, not for the first.
 */
function tabs(name: string, shown?: (id: string) => void): (id: string, focus?: boolean) => void {
  const buttons = [...$(`[data-tabs="${name}"]`).querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const set = (id: string, focus: boolean): void => {
    for (const b of buttons) {
      const on = b.id === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      $(`#${b.getAttribute('aria-controls')}`).hidden = !on;
      if (on && focus) b.focus();
    }
  };
  const show = (id: string, focus = false): void => { set(id, focus); shown?.(id); };
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => show(b.id));
    b.addEventListener('keydown', (e) => {
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : null;
      if (to === null) return;
      e.preventDefault();
      show(buttons[(to + buttons.length) % buttons.length].id, true);
    });
  });
  set(buttons[0].id, false);
  return show;
}
const showCard = tabs('card', (id) => { if (id === 'tab-bot') marked(); });
/** Which of the Bot tab's three lists holds each kind. */
const LIST: Record<Entry['kind'], string> = { body: 'seg-bodies', gallery: 'seg-outlines', yours: 'seg-yours' };
const showList = tabs('bots', () => marked());
tabs('play');
const showStep = tabs('new');
tabs('lanes');
tabs('use');

// A button that opens a list under it. A click outside, Escape, or a choice from it closes it.
for (const menu of document.querySelectorAll<HTMLElement>('[data-menu]')) {
  const trigger = $<HTMLButtonElement>(':scope > button', menu), list = $(':scope > .menu-list', menu);
  const open = (on: boolean) => {
    list.hidden = !on;
    trigger.setAttribute('aria-expanded', String(on));
  };
  trigger.addEventListener('click', () => {
    const on = list.hidden !== false;
    open(on);
    if (on) list.querySelector<HTMLElement>('button:not(:disabled):not([hidden]), input')?.focus();
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target as Node)) open(false); });
  menu.addEventListener('focusout', (e) => { if (!menu.contains(e.relatedTarget as Node | null)) open(false); });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !list.hidden) { open(false); trigger.focus(); } });
  // The settings stay open while they are changed; a menu's choice closes it.
  // (Focus goes back to its button, not to the top of the page with the choice that is now hidden.)
  if (!menu.classList.contains('settings')) list.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) { open(false); trigger.focus(); } });
}

// ---- The Bot tab: every avatar as a still, and the colour.

/** A still of an avatar, facing front, as a thumbnail: the gallery's were drawn at the build, the rest here. */
function thumb(e: Entry): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg', box = svgBox(__THUMB__);
  const drawn = (): string[] => {
    const d = drawAvatar(bodyOf(e.shape), BLACK, stillState(e.shape, __THUMB__), __THUMB__);
    return [d.body, d.eyes[0], d.eyes[1]];
  };
  const paths = (e.kind === 'gallery' && __THUMBS__[e.id]) || drawn();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', box.viewBox);
  svg.setAttribute('width', String(box.width));
  svg.setAttribute('height', String(box.height));
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', left: `${box.left}px`, top: `${box.top}px`, overflow: 'visible' });
  paths.forEach((d, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.dataset.part = i ? 'eye' : 'body';
    svg.append(p);
  });
  return svg;
}
const paintThumb = (cell: HTMLElement, colour: string): void => {
  const c = colours(colour), black = colour === BLACK;
  for (const p of cell.querySelectorAll<SVGPathElement>('path')) p.style.fill = p.dataset.part === 'body' ? (black ? 'var(--ink)' : c.fill) : (black ? 'var(--bg)' : c.eyeFill);
};

const cells = new Map<string, HTMLButtonElement>();
const botsBox = $('[data-bots]'), pickNote = $('[data-pick-note]');
function cellFor(e: Entry): HTMLLIElement {
  const b = make('button', { type: 'button', className: 'bot-cell', title: named(e) });
  b.setAttribute('aria-label', named(e));
  const slot = make('span', { className: 'bot-thumb' });
  slot.style.width = slot.style.height = `${__THUMB__}px`;
  slot.append(thumb(e));
  b.append(slot);
  paintThumb(b, picked.get(e.key) ?? e.own);
  b.addEventListener('click', () => select(e.key));
  // A body made from an outline takes a moment to build, and so does a coat's mesh: start on them before the
  // click, so the change of shape does not stutter as it lands. The body as the pointer comes; the mesh, which
  // holds up the page for up to 150 ms, only once the pointer rests on the cell, so a sweep across the grid
  // makes none. (Both are made once and kept, so a second visit costs nothing.)
  let rest: ReturnType<typeof setTimeout> | undefined;
  b.addEventListener('pointerenter', () => {
    setTimeout(() => bodyOf(e.shape));
    clearTimeout(rest);
    rest = setTimeout(() => { if (pg.material === 'fluffy') coatMesh(bodyOf(e.shape)); }, 250);
  });
  b.addEventListener('pointerleave', () => clearTimeout(rest));
  cells.set(e.key, b);
  return make('li', {}, b);
}
function grid(label: string, list: Entry[], extra?: HTMLElement): HTMLUListElement {
  const ul = make('ul', { className: 'bots' }, ...list.map(cellFor));
  if (extra) ul.append(make('li', {}, extra));
  ul.setAttribute('aria-label', label);
  return ul;
}
const newTile = make('button', { type: 'button', className: 'bot-cell bot-new', title: 'make a new one' }, make('span', { className: 'bot-plus', textContent: '+' }));
newTile.setAttribute('aria-label', 'make a new one');
newTile.addEventListener('click', () => { showCard('tab-new'); showStep('seg-describe'); describe.focus(); });
$('#bots-bodies').append(grid('blot\'s bodies', BODY_ENTRIES));
$('#bots-outlines').append(grid('from outlines', GALLERY_ENTRIES));
const yoursList = $('#bots-yours'), yoursCount = $('[data-yours-count]');
function drawYours(): void {
  const none = yours.length ? [] : [make('p', { className: 'sub-label', textContent: 'none yet. + has a model draw one from a few words.' })];
  yoursList.replaceChildren(grid('yours', yours.map(yoursEntry), newTile), ...none);
  yoursCount.textContent = yours.length ? String(yours.length) : '';
}
drawYours();
function redrawYours(): void {
  // Focus on one of yours (or on +) stays on it through the redraw.
  const had = document.activeElement, focused = [...cells].find(([, b]) => b === had)?.[0];
  for (const k of [...cells.keys()]) if (k.startsWith('yours:')) cells.delete(k);
  drawYours();
  marked();
  if (had === newTile) newTile.focus({ preventScroll: true });
  else if (focused?.startsWith('yours:')) cells.get(focused)?.focus({ preventScroll: true });
}
const KIND_SAYS: Record<Entry['kind'], string> = { body: 'one of blot\'s bodies', gallery: 'drawn from an outline', yours: 'yours, kept in this browser' };
/** The pressed cell is the one on the stage, scrolled into the list's view (the list only, never the page). */
function marked(): void {
  for (const [k, b] of cells) b.setAttribute('aria-pressed', String(k === pg.key));
  const e = entry(pg.key);
  pickNote.textContent = `on the stage: ${named(e)}, ${KIND_SAYS[e.kind]}.`;
  const cell = cells.get(pg.key);
  if (!cell || botsBox.hidden || !botsBox.offsetParent) return;
  const box = botsBox.getBoundingClientRect(), c = cell.getBoundingClientRect();
  if (c.top < box.top || c.bottom > box.bottom) botsBox.scrollTop += c.top - box.top - (box.height - c.height) / 2;
}

const resetColour = $<HTMLButtonElement>('[data-reset-colour]');
/** The colour now shown, on its thumbnail and the reset button. */
function coloured(): void {
  const e = entry(pg.key), cell = cells.get(pg.key);
  if (cell) paintThumb(cell, pg.color);
  resetColour.hidden = pg.color.toUpperCase() === e.own.toUpperCase();
  const name = BOT_COLOURS.find(([h]) => h === e.own)?.[1] ?? e.own;
  resetColour.textContent = `back to its own colour, ${name.toLowerCase()}`;
}

// Colours: the body's and the eyes', each a row of swatches and a panel for any colour at all. Each panel has a
// little avatar in the colours so far, for a phone where the stage is off screen.
const previews: Mounted[] = [];
const faint = $('[data-eye-note]');
function paint(): void {
  for (const p of previews) p.update({ shape: entry(pg.key).shape, ...inked(pg.color, pg.eyes ?? undefined), material: pg.material });
  // The eyes as drawn: the picked colour, or the automatic one.
  // (Black is drawn in the page's ink, light on the dark theme: the eyes picked are judged against both.)
  const eyeOn = (body: string) => contrast(body, pg.eyes ?? colours(body).eyeFill);
  faint.hidden = (pg.color === BLACK && pg.eyes ? Math.min(eyeOn('#1B1B1F'), eyeOn('#EEEDEA')) : eyeOn(pg.color)) >= FAINT;
  changed();
}
const bodyPicker = colorPicker($('[data-picker="body"]'), {
  label: 'body colour', value: pg.color, presets: COLOURS,
  onInput: (v) => { pg.color = v ?? DEFAULT_COLOUR; picked.set(pg.key, pg.color); coloured(); paint(); },
});
{
  const eyePicker = colorPicker($('[data-picker="eyes"]'), {
    label: 'eye colour', value: pg.eyes, presets: EYES, auto: 'auto', start: '#FFFFFF',
    onInput: (v) => { pg.eyes = v; paint(); },
  });
  for (const [i, p] of [bodyPicker, eyePicker].entries()) {
    previews.push(mount(p.preview, { shape: entry(pg.key).shape, size: 40, ...inked(pg.color, pg.eyes ?? undefined), material: pg.material, seed: 300 + i }));
  }
  resetColour.addEventListener('click', () => {
    picked.delete(pg.key);
    select(pg.key);
    // The button is hidden now: focus goes to the colour it went back to.
    $('[data-picker="body"]').querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  });
}

// The finish, beside the colour: flat, or a coat of fur. It is kept in this browser and goes into the code, the
// link and every avatar that shows the studio's (the stage, the Moves view's, the colour previews). The thumbnails
// stay flat: a coat for each would make 38 meshes as the page opens, about 3 s of work in all (in Node).
const materialNote = $('[data-material-note]');
const materialButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-material-is]')];
function finished(): void {
  // Where no coat can be drawn (no WebGL2, or it fails) the body stays flat, the switch says so and there is no PNG.
  // (Asked only once fur is: it sets up WebGL2.)
  const noGl = pg.material === 'fluffy' && !coatable();
  for (const b of materialButtons) b.setAttribute('aria-pressed', String(b.dataset.materialIs === pg.material));
  materialNote.hidden = !noGl;
  doButton('png').hidden = pg.material !== 'fluffy' || noGl;
  $('[data-svg-says]').textContent = pg.material === 'fluffy' ? 'SVG still, flat: no fur' : 'SVG still, this colour';
  writeUse();
}
for (const b of materialButtons) {
  b.addEventListener('click', () => {
    const m = readMaterial(b.dataset.materialIs);
    if (!m || m === pg.material) return;
    pg.material = m;
    stored.set(MATERIAL_KEY, m);
    finished();
    paint();
  });
}

/** Put an avatar on the stage, in the colour picked for it, or its own. */
function select(key: string): void {
  pg.key = key;
  pg.color = picked.get(key) ?? entry(key).own;
  bodyPicker.set(pg.color);
  // The list that holds it (Bodies, Outlines or Yours) shows, if another one was showing.
  if (cells.get(key)?.closest<HTMLElement>('[data-bots] > [role="tabpanel"]')?.hidden !== false) showList(LIST[entry(key).kind]);
  marked();
  coloured();
  actions();
  paint();
  // Another tab can change yours while Moves is open: its avatar is the studio's, so it changes too.
  if (view === 'moves') moversTurn();
}

// ---- Export, Copy and Remove.

const doButton = (what: string) => $<HTMLButtonElement>(`[data-do="${what}"]`);
/** What the actions can do for the avatar on the stage: a body of blot's has no definition to give. */
function actions(): void {
  const e = entry(pg.key);
  for (const what of ['json', 'json-file']) {
    const b = doButton(what);
    b.disabled = !e.definition;
    b.title = e.definition ? '' : 'blot\'s own bodies are not drawn from an outline, so there is no definition to give';
  }
  doButton('remove').hidden = e.kind !== 'yours';
  doButton('remove').setAttribute('aria-label', `remove ${named(e)} from yours`);
}
const json = (d: AvatarDefinition) => `${JSON.stringify(d, null, 2)}\n`;
async function copy(text: string, failed: string): Promise<void> {
  if (await copyText(text)) said('copied');
  else said(failed, true);
}
doButton('svg').addEventListener('click', () => { const e = entry(pg.key); download(`${e.id}.svg`, 'image/svg+xml', stillSvg(e.shape, pg.color)); });
doButton('png').addEventListener('click', async () => {
  const e = entry(pg.key), png = await stagePng();
  if (png) download(`${e.id}.png`, 'image/png', png);
  else said('no picture: this browser would not draw one.');
});

/**
 * The stage's avatar as it is now, as a PNG: each of its layers in turn (the svg under the coat, the coat's canvas,
 * the svg over it), at the coat's own pixels, each with its glow, cut to what is drawn. The svgs are drawn as
 * images, their colours resolved first, since an image does not see the page's style. Null if it cannot be drawn.
 */
async function stagePng(): Promise<Blob | null> {
  try { return await drawStage(); } catch { return null; }
}
async function drawStage(): Promise<Blob | null> {
  const host = $('[data-avatar="play"]'), box = svgBox(pg.size);
  const coat = [...host.children].find((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.style.display !== 'none' && c.width > 0);
  const scale = coat ? coat.width / parseFloat(getComputedStyle(coat).width) : Math.max(2, devicePixelRatio || 1);
  // Room round the drawing box, half of it each way, for what reaches past it: a "!", the Zs, the glow.
  const room = box.width / 2, side = Math.ceil(2 * box.width * scale), out = make('canvas', { width: side, height: side }), ctx = out.getContext('2d');
  if (!ctx) return null;
  // A layer's glow (a CSS drop-shadow) at the export's pixels: a canvas's filter is not scaled with its drawing.
  const glowOf = (el: Element): string => {
    const f = getComputedStyle(el).filter;
    return !f || f === 'none' ? 'none' : f.replace(/(-?[\d.]+)px/g, (_, n: string) => `${Number(n) * scale}px`);
  };
  for (const layer of host.children) {
    if (layer instanceof SVGSVGElement) {
      const copy = layer.cloneNode(true) as SVGSVGElement, from = layer.querySelectorAll('*'), to = copy.querySelectorAll<SVGElement>('*');
      from.forEach((el, i) => {
        const cs = getComputedStyle(el);
        for (const k of ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'opacity'] as const) to[i].style.setProperty(k, cs.getPropertyValue(k));
      });
      copy.removeAttribute('style');
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', String(side));
      copy.setAttribute('height', String(side));
      const [vx, vy, vw, vh] = (copy.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
      copy.setAttribute('viewBox', `${vx - vw / 2} ${vy - vh / 2} ${2 * vw} ${2 * vh}`);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        ctx.filter = glowOf(layer);
        ctx.drawImage(img, 0, 0, side, side);
        ctx.filter = 'none';
      } finally { URL.revokeObjectURL(url); }
    } else if (layer === coat) {
      // Where the coat sits, and the breath, squash or hop it is moved by (a CSS transform about its corner).
      const cs = getComputedStyle(coat), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform), w = parseFloat(cs.width);
      ctx.save();
      ctx.filter = glowOf(coat);
      ctx.scale(scale, scale);
      ctx.translate(parseFloat(cs.left) - box.left + room, parseFloat(cs.top) - box.top + room);
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.globalAlpha = Number(cs.opacity);
      ctx.drawImage(coat, 0, 0, w, w);
      ctx.restore();
    }
  }
  // Cut to what is drawn, square, with a little room.
  const px = ctx.getImageData(0, 0, side, side).data;
  let x0 = side, y0 = side, x1 = -1, y1 = -1;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    if (px[(y * side + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const cut = Math.ceil(Math.max(x1 - x0, y1 - y0) * 1.08) + 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const fit = make('canvas', { width: cut, height: cut });
  fit.getContext('2d')?.drawImage(out, Math.round(cut / 2 - cx), Math.round(cut / 2 - cy));
  return new Promise((done) => fit.toBlob(done, 'image/png'));
}
doButton('json-file').addEventListener('click', () => { const e = entry(pg.key); if (e.definition) download(`${e.id}.json`, 'application/json', json(e.definition)); });
const codeToggle = $<HTMLButtonElement>('[data-show-code]'), codeBox = $('#code-box');
const showCode = (on: boolean): void => {
  codeBox.hidden = !on;
  codeToggle.setAttribute('aria-expanded', String(on));
  codeToggle.textContent = on ? 'hide code' : 'show code';
};
codeToggle.addEventListener('click', () => showCode(codeBox.hidden !== false));
doButton('code').addEventListener('click', async () => {
  if (await copyText($('[data-code]').textContent ?? '')) { said('copied'); return; }
  showCode(true);
  said('no clipboard here: the code is open under the actions, to copy by hand.', true);
});
doButton('json').addEventListener('click', () => { const e = entry(pg.key); if (e.definition) void copy(json(e.definition), 'no clipboard here: use export instead.'); });
doButton('link').addEventListener('click', () => {
  const e = entry(pg.key);
  const link = shareLink(`${location.origin}${location.pathname}`, { id: e.id, kind: e.kind, definition: e.definition }, pg.color, e.own, pg.activity, pg.material);
  void copy(link, `no clipboard here. the link: ${link}`);
});
doButton('remove').addEventListener('click', () => {
  const e = entry(pg.key);
  if (e.kind !== 'yours') return;
  yours = yours.filter((d) => d.id !== e.id);
  keepYours();
  picked.delete(e.key);
  redrawYours();
  select('body:blob');
  // The Remove button is hidden now: focus goes to the Export button beside where it was.
  $<HTMLButtonElement>('[data-menu="export"] > button').focus();
  said(`removed ${named(e)}`);
});

// ---- Generate: a prompt for any model, or an agent app.

const AGENT_KEY = 'blot-avatar:agent';
let agent: Agent = ((v) => (isAgent(v) ? v : 'claude'))(stored.get(AGENT_KEY));
const agentSelect = $<HTMLSelectElement>('[data-agent]'), openAgent = $<HTMLButtonElement>('[data-open-agent]');
for (const [id, a] of Object.entries(AGENTS)) agentSelect.append(make('option', { value: id, textContent: a.label }));
const syncAgent = () => { agentSelect.value = agent; openAgent.textContent = `open in ${AGENTS[agent].label}`; };
agentSelect.addEventListener('change', () => { if (isAgent(agentSelect.value)) { agent = agentSelect.value; stored.set(AGENT_KEY, agent); syncAgent(); } });
syncAgent();
/** Where this page serves the design prompt, for the short form of a prompt. Opened from disk, it is the published page's. */
const promptUrl = (): string => new URL('prompt.md', /^https?:$/.test(location.protocol) ? location.href : PAGES).href;
const describe = $<HTMLTextAreaElement>('[data-describe]'), generateSaid = $('[data-generate-said]');
const importText = $<HTMLTextAreaElement>('[data-import-text]'), importOut = $('[data-import-out]');
const described = (): string | null => {
  const text = describe.value.trim();
  if (!text) { generateSaid.textContent = 'describe it first: a few words is enough.'; describe.focus(); return null; }
  return text;
};
/** Sent: on to Import, for what comes back. */
const sent = (note: string): void => {
  generateSaid.textContent = '';
  showStep('seg-import');
  importOut.replaceChildren(make('p', { className: 'sub-label', textContent: note }));
  importText.focus();
};
$('[data-copy-prompt]').addEventListener('click', async () => {
  const text = described();
  if (!text) return;
  if (await copyText(designBrief(PROMPT, promptUrl(), text).full)) sent('copied the prompt. paste it into any chat model, then paste its reply here.');
  else generateSaid.textContent = 'no clipboard here. open it in an app instead, or read the prompt and write to a model yourself.';
});
openAgent.addEventListener('click', () => {
  const text = described();
  if (!text) return;
  // An app's link has a length limit and the whole prompt is long: the link carries the short form, which points at
  // the prompt here. A long description still makes a link a browser may not open, so past LINK_MOST it is not tried.
  const link = AGENTS[agent].link(designBrief(PROMPT, promptUrl(), text).linked);
  if (link.length > LINK_MOST) { generateSaid.textContent = `that description is too long for a link to ${AGENTS[agent].label}. copy the prompt instead, or say it in fewer words.`; return; }
  location.href = link;
  sent(`opening ${AGENTS[agent].label}. read the prompt there and send it, then paste its reply here.`);
});

// ---- Import: what a model sends back.

function add(text: string): void {
  const r = parseImport(text);
  if (!r.ok) {
    const out: Node[] = [make('p', { className: 'import-bad', textContent: 'not added.' }), make('ul', { className: 'import-errors' }, ...r.errors.map((e) => make('li', { textContent: calm(e) })))];
    for (const n of [...r.notes, ...r.hints]) out.push(make('p', { className: 'sub-label', textContent: calm(n) }));
    if (r.source) {
      const repair = make('button', { type: 'button', className: 'button small', textContent: 'copy repair prompt' });
      repair.addEventListener('click', async () => {
        repair.textContent = await copyText(repairBrief(PROMPT, promptUrl(), r.source, r.errors).full) ? 'copied' : 'no clipboard here';
        setTimeout(() => { repair.textContent = 'copy repair prompt'; }, 1600);
      });
      out.push(repair);
    }
    importOut.replaceChildren(...out);
    return;
  }
  const had = new Set(yours.map((d) => d.id));
  const incoming = new Map(r.values.map((d) => [d.id, d]));
  yours = [...yours.map((d) => incoming.get(d.id) ?? d), ...r.values.filter((d) => !had.has(d.id))];
  keepYours();
  for (const d of r.values) picked.delete(`yours:${d.id}`);
  redrawYours();
  select(`yours:${r.values[r.values.length - 1].id}`);
  const replaced = r.values.filter((d) => had.has(d.id)).map((d) => d.name.toLowerCase());
  const lines = [`added ${r.values.map((d) => d.name.toLowerCase()).join(', ')}: on the stage now, and kept under bot, yours, in this browser.`, ...r.notes];
  if (replaced.length) lines.push(`it took the place of the one you had with the same id: ${replaced.join(', ')}.`);
  importOut.replaceChildren(...lines.map((t) => make('p', { className: 'sub-label', textContent: calm(t) })));
  importText.value = '';
}
$('[data-import]').addEventListener('click', () => add(importText.value));
const fileInput = $<HTMLInputElement>('[data-import-file]');
const readFile = async (file: File | undefined) => {
  if (!file) return;
  importText.value = await file.text();
  add(importText.value);
};
fileInput.addEventListener('change', () => { void readFile(fileInput.files?.[0]); fileInput.value = ''; });
$('[data-open-file]').addEventListener('click', () => fileInput.click());
const importPanel = $('#new-import');
importPanel.addEventListener('dragover', (e) => { e.preventDefault(); importPanel.classList.add('dropping'); });
importPanel.addEventListener('dragleave', (e) => { if (!importPanel.contains(e.relatedTarget as Node | null)) importPanel.classList.remove('dropping'); });
importPanel.addEventListener('drop', (e) => { e.preventDefault(); importPanel.classList.remove('dropping'); void readFile(e.dataTransfer?.files[0]); });

// ---- The Play tab: the mark, a visit, what it is like to move, and moves.

{
  const mark = $<HTMLInputElement>('[data-mark]');
  mark.addEventListener('change', () => { pg.mark = mark.checked; changed(); });
  const ultra = $<HTMLInputElement>('[data-ultra]');
  ultra.addEventListener('change', () => { pg.ultra = ultra.checked; changed(); });
  const visits = $('[data-visit]');
  for (const shape of VISITS) {
    const b = make('button', { type: 'button', className: 'chip', textContent: shape });
    b.addEventListener('click', () => { if (pg.key !== `body:${shape}`) bot.visit(shape); pg.last = null; writeCode(); });
    visits.append(b);
    moveButtons.push(b);
  }
  const feel = $('[data-feel]');
  for (const k of ['weight', 'squash', 'wobble', 'flare', 'float'] as const) {
    const input = make('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(pg.feel[k]) });
    input.setAttribute('aria-label', k);
    const out = make('output', { textContent: pg.feel[k].toFixed(2) });
    input.addEventListener('input', () => { pg.feel = { ...pg.feel, [k]: Number(input.value) }; out.textContent = pg.feel[k].toFixed(2); changed(); });
    feel.append(make('span', { textContent: k }), input, out);
  }
  const box = $('[data-moves]');
  for (const m of MOVES) {
    const b = make('button', { type: 'button', className: m.here ? 'chip move here' : 'chip move', textContent: m.name });
    b.title = m.lane === 'poke' ? `poke('${m.name}')` : `play('${m.name}')`;
    b.addEventListener('click', () => { play(bot, m, { dir: pg.dir, amount: pg.amount }); pg.last = m; writeCode(); });
    moveButtons.push(b);
    box.append(b);
  }
  const dir = $<HTMLInputElement>('[data-dir]');
  dir.addEventListener('change', () => { pg.dir = dir.checked ? -1 : 1; writeCode(); });
  const amount = $<HTMLInputElement>('[data-amount]'), out = $('[data-amount-out]');
  amount.addEventListener('input', () => { pg.amount = Number(amount.value); out.textContent = String(pg.amount); writeCode(); });
}

// Settings: size and pointer.
{
  const size = $<HTMLInputElement>('[data-size]'), out = $('[data-size-out]');
  size.value = String(pg.size);
  out.textContent = `${pg.size} px`;
  size.addEventListener('input', () => { pg.size = Number(size.value); out.textContent = `${pg.size} px`; changed(); });
  const follow = $<HTMLInputElement>('[data-follow]');
  follow.addEventListener('change', () => { pg.follow = follow.checked; changed(); });
}

/** The waggle's definition as the page shows it under "Moves are data", for code that plays the waggle. */
const waggleSource = ((t) => t.slice(t.indexOf('// A waggle'), t.indexOf('\n]);', t.indexOf('const waggle')) + 4))($('#wave-code').textContent ?? '');

/** Use it's code for any page and for React, as written there, and with the finish picked when it is fluffy. */
const useCode = { page: $('#mount-code'), react: $('#react-code') };
const useFlat = { page: useCode.page.textContent ?? '', react: useCode.react.textContent ?? '' };
function writeUse(): void {
  const fluffy = pg.material === 'fluffy';
  useCode.page.textContent = fluffy ? useFlat.page.replace("label: 'Ada',", "label: 'Ada', material: 'fluffy',") : useFlat.page;
  useCode.react.textContent = !fluffy ? useFlat.react : useFlat.react
    .replace("const { host, paths, first } = useLiveAvatar({ shape: 'star', size, follow: true });",
      "const { host, paths, coat, first } = useLiveAvatar({\n    shape: 'star', size, follow: true, material: 'fluffy',\n  });")
    // The coat's canvas goes under the svg, hidden until a coat shows it (without WebGL2 the body stays flat).
    .replace(/(\n\s*)<svg /, "$1<canvas ref={coat} aria-hidden style={{ position: 'absolute', display: 'none' }} />$1<svg ");
}

/** The code for the studio's avatar as it is now. */
function writeCode(): void {
  const e = entry(pg.key);
  const shapeOption = e.kind === 'body' ? `shape: '${e.id}'` : e.kind === 'gallery' ? `shape: galleryAvatar('${e.id}').definition` : 'shape';
  const o: string[] = [shapeOption, `size: ${pg.size}`];
  if (pg.color !== DEFAULT_COLOUR) o.push(`color: '${pg.color}'`);
  if (pg.eyes) o.push(`eyeFill: '${pg.eyes}'`);
  if (pg.face !== 'neutral') o.push(`face: '${pg.face}'`);
  if (pg.activity !== 'idle') o.push(`activity: '${pg.activity}'`);
  if (BUSY.has(pg.activity) && pg.form) o.push(`form: '${pg.form}'`);
  if (pg.follow) o.push('follow: true');
  if (pg.mark) o.push('mark: true');
  if (pg.ultra) o.push('ultra: true');
  if (pg.material !== 'flat') o.push(`material: '${pg.material}'`);
  const feel = (Object.keys(PERSONALITY) as (keyof Personality)[]).filter((k) => pg.feel[k] !== PERSONALITY[k]).map((k) => `${k}: ${pg.feel[k]}`);
  if (feel.length) o.push(`personality: { ${feel.join(', ')} }`);
  o.push(`accent: '${ACCENT}'`);
  o.push('pokeable: true');
  if (pg.last?.here) o.push('clips: { waggle }');
  const lines: string[] = [];
  for (let i = 0; i < o.length; i += 3) lines.push(`  ${o.slice(i, i + 3).join(', ')},`);
  let text = `import { ${e.kind === 'gallery' ? 'galleryAvatar, mount' : 'mount'} } from '@blot/avatar';\n`;
  if (pg.last?.here) text += `import { cue, eyes, head, toward, wave } from '@blot/avatar/moves';\n\n${waggleSource}\n`;
  // One of yours is its definition, written out.
  if (e.kind === 'yours' && e.definition) text += `\n// ${e.name}: an outline and its eyes.\nconst shape = ${JSON.stringify(e.definition)};\n`;
  text += `\nconst bot = mount(document.getElementById('bot'), {\n${lines.join('\n')}\n});\n`;
  const m = pg.last;
  if (m) {
    const cue: string[] = [];
    if (pg.dir !== 1) cue.push('dir: -1');
    if (pg.amount !== 1) cue.push(`amount: ${pg.amount}`);
    text += m.lane === 'poke'
      ? `\nbot.poke('${m.name}');\n`
      : `\nbot.play('${m.name}'${cue.length ? `, { ${cue.join(', ')} }` : ''});\n`;
  }
  $('[data-code]').textContent = text;
}

// ---- Moves: one avatar, the studio's, and every move a row; the cues a page at a time.

const moveStage = $('[data-move-stage]'), moveSaid = $('[data-move-said]');
const mover = mount($('[data-avatar="moves"]'), {
  shape: entry(pg.key).shape, size: narrow.matches ? 120 : 150, ...inked(pg.color, pg.eyes ?? undefined), follow: true, followIn: moveStage,
  pokeable: true, label: 'the avatar that shows each move', seed: 9, clips, accent: ACCENT, material: pg.material,
});
/** The moves are shown on the avatar in the studio, as it is now. */
const moversTurn = (): void => mover.update({ shape: entry(pg.key).shape, ...inked(pg.color, pg.eyes ?? undefined), personality: pg.feel, material: pg.material });
function moveRow(m: Move): HTMLLIElement {
  const b = make('button', { type: 'button', className: 'move-row' }, make('code', { textContent: m.name }), make('span', { textContent: SAYS[m.name] ?? `a ${m.lane}.` }));
  b.addEventListener('click', () => {
    play(mover, m);
    moveSaid.textContent = m.lane === 'poke' ? `bot.poke('${m.name}')` : `bot.play('${m.name}')`;
  });
  moveButtons.push(b);
  return make('li', {}, b);
}
$('[data-lane="poke"]').append(...MOVES.filter((m) => m.lane === 'poke').map(moveRow));
$('[data-lane="own"]').append(...MOVES.filter((m) => m.here).map(moveRow));
{
  const PER_PAGE = 8;
  const list = $('[data-lane="cue"]'), pager = $('[data-cue-pager]');
  const rows = MOVES.filter((m) => m.lane === 'cue' && !m.here).map(moveRow);
  const count = Math.ceil(rows.length / PER_PAGE);
  pager.setAttribute('role', 'group');
  pager.setAttribute('aria-label', 'pages of cues');
  const pages = Array.from({ length: count }, (_, i) => {
    const b = make('button', { type: 'button', className: 'chip', textContent: String(i + 1) });
    b.setAttribute('aria-label', `page ${i + 1} of ${count}`);
    b.addEventListener('click', () => page(i));
    return b;
  });
  const page = (n: number): void => {
    list.replaceChildren(...rows.slice(n * PER_PAGE, (n + 1) * PER_PAGE));
    pages.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n)));
  };
  pager.append(...pages);
  pager.hidden = count < 2;
  page(0);
}

// ---- One avatar at the size picked, and what that size does. It wears the studio's finish: a coat at every size.

let sizer: Mounted;

{
  const SIZES = [22, 32, 48, 64, 96, 128];
  const note = $('[data-size-note]');
  let size = 64;
  sizer = mount($('[data-avatar="size"]'), {
    shape: 'star', size, color: DEFAULT_COLOUR, follow: true, followIn: $('[data-size-stage]'), pokeable: true, label: 'the star at the size picked', seed: 200, accent: ACCENT,
  });
  const says = (s: number): string => s < 48
    ? `${s} px: drawn at most 30 times a second, and it turns only part of the way.`
    : s < 64 ? `${s} px: drawn every frame; it still turns only part of the way.` : `${s} px: drawn every frame, it turns all the way, and this page lets a click poke it.`;
  const sync = chips($('[data-sizes]'), SIZES.map(String), () => String(size), (v) => {
    size = Number(v);
    sizer.update({ size, pokeable: size >= 64 });
    note.textContent = says(size);
  }, (v) => `${v} px`);
  note.textContent = says(size);
  sync();
}

// ---- The views: one at a time, by the address's #. An old link's # (#play, #shapes, #top) opens the studio; one
// that names no view (#main, from the skip link) leaves the view as it is.

const VIEWS = new Map([['', 'studio'], ['studio', 'studio'], ['moves', 'moves'], ['use', 'use'], ['play', 'studio'], ['shapes', 'studio'], ['top', 'studio']]);
let view = '';
function route(): void {
  const next = VIEWS.get(location.hash.slice(1)) ?? (view || 'studio');
  if (next === view) return;
  const first = !view;
  view = next;
  for (const s of document.querySelectorAll<HTMLElement>('[data-view]')) s.hidden = s.dataset.view !== view;
  for (const a of document.querySelectorAll<HTMLElement>('[data-view-link]')) {
    if (a.dataset.viewLink === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view === 'moves') moversTurn();
  if (view === 'use') sizer.update({ material: pg.material });
  if (view === 'studio') marked();
  if (first) return;
  scrollTo({ top: 0 });
  // Focus goes to the view's heading, so a screen reader says where it is, and focus in the view now hidden is not lost.
  $<HTMLElement>(`#${view}-title`).focus({ preventScroll: true });
}
addEventListener('hashchange', route);
// The skip link goes to the page without changing the address, which names the view.
$('[data-skip]').addEventListener('click', (e) => { e.preventDefault(); $<HTMLElement>('#main').focus(); });

// ---- Copy buttons on the code.

/** Where a copy's result is said, for a screen reader. */
const copied = make('span', { className: 'vh' });
copied.setAttribute('aria-live', 'polite');
document.body.append(copied);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  b.addEventListener('click', async () => {
    const code = document.getElementById(b.dataset.copy ?? '');
    if (!code) return;
    copied.textContent = '';
    if (await copyText(code.textContent ?? '')) {
      b.textContent = 'copied';
      copied.textContent = 'copied';
    } else {
      // No clipboard: select it, for a copy by hand.
      getSelection()?.selectAllChildren(code);
      b.textContent = 'press ctrl+c';
      copied.textContent = 'selected. press ctrl+c to copy.';
    }
    setTimeout(() => { b.textContent = 'copy'; }, 1600);
  });
}

showList(LIST[entry(pg.key).kind]);
finished();
route();
coloured();
actions();
faces();
paint();
still();
onMotion(still);
if (shared.problem) said(calm(shared.problem), true);
