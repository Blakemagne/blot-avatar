// The demo page. Everything on it is the package's public API (@blot/avatar): mount() for each avatar, and the lists the
// engine exports (BODIES, GALLERY, FACE_NAMES, ACTIVITIES, FORMS, POKES, CUES) for every set of buttons, so a new body,
// avatar, face or clip in the package shows up here without touching this file. The waggle is the one move written here.
//
// The page is three views, one at a time (#studio, #moves, #use), and each pages what it holds behind tabs, so
// every option is a click or two away and only one set of them is on screen. The studio is laid out after
// open-bot-avatar's (Dominik Scholz and its contributors, MIT; see THIRD_PARTY_NOTICES.md): a stage with what it is
// doing under it, Export and Copy, and a card of tabs to pick one, play with it, or have a model make a new one.

import {
  avatarParts, dotAvatar, dotStageLayout, DOT_SHAPES, DOT_COLOURS, DOT_EXTRA_COLOURS, DOT_CLIPS, DOT_MOTIONS, DOT_CHARACTERS, DOT_CATALOG, DOT_EYES, DOT_GLASSES, DOT_EXTRAS, type AvatarParts, type DotAppearance,
  ACTIVITIES, BODIES, BOT_COLOURS, CUES, FACE_NAMES, FORMS, GALLERY, PERSONALITY, POKES, bodyOf, coatMesh, coatable, colours, galleryColour,
  mount, onMotion, reducedMotion, svgBox,
  type AvatarDefinition, type Material, type MountOptions, type Mounted, type Personality, type Shape,
} from '@blot/avatar';
import { cue, eyes, head, toward, wave } from '@blot/avatar/moves';
import { colorPicker, contrast } from './picker';
import PROMPT from './prompt.md';
import portraitSheet from './portraits.json';
import {
  AGENTS, designBrief, studioBodyFrame, freeId, isAgent, parseImport, eyePreview, readColour, readMaterial, readShare, repairBrief, reviveYours, shareLink, stillSvg, type Agent,
} from './studio';

/** The move this page adds through the `clips` option: a waggle. The same text is on the page. */
const waggle = cue(900, [
  head.lean(toward, 7).along(wave(1.5).dwindling()),
  eyes.glance(toward, 0.15).along(wave(1.5).dwindling()),
]);
const clips = { ...DOT_CLIPS, waggle };

interface Move { name: string; label?: string; lane: 'poke' | 'cue'; here?: boolean }
const MOVES: Move[] = [
  ...POKES.map((name): Move => ({ name, lane: 'poke' })),
  ...CUES.map((name): Move => ({ name, lane: 'cue' })),
  { name: 'waggle', lane: 'cue', here: true },
  ...DOT_MOTIONS.map((motion): Move => {
    const label = motion.name.toLowerCase();
    const shared = [...POKES, ...CUES].some(name => name === label);
    return { name: motion.id, label: shared ? label + ' (dot)' : label, lane: 'cue' };
  }),
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
const COLOURS = [
  ...DOT_COLOURS,
  ...BOT_COLOURS.map(([hex, name]) => [hex, DOT_COLOURS.some(([, dotName]) => dotName === name) ? 'Blot ' + name : name] as const),
].map(([hex, name]) => [hex, name.toLowerCase(), hex === BLACK ? 'var(--ink)' : undefined] as const);
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
  set(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true; } catch { return false; } },
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
  finish?: Material;
  definition?: AvatarDefinition;
}

const BODY_ENTRIES: Entry[] = SHAPES.map((id, i) => ({ key: `body:${id}`, id, name: id, kind: 'body', shape: id, own: CYCLE[i % CYCLE.length] }));
// Picker looks use the same palette and materials as the stage.
const dotLooks: Record<string, readonly [string, Material]> = {
  'dot-blossie': ['#FA70AB', 'fluffy'],
  'dot-circle': ['#4778FF', 'glossy'],
  'dot-rounded-triangle': ['#00B1FF', 'fluffy'],
  'dot-capsule': ['#A25BFF', 'glossy'],
  'dot-rounded-head-with-two-ears': ['#B6D80B', 'glossy'],
  'dot-heart': ['#FF8066', 'glossy'],
  'dot-four-lobed-butterfly': ['#DD6ADC', 'fluffy'],
  'dot-circle-with-two-ears': ['#FA70AB', 'fluffy'],
  'dot-twelve-scalloped-rosette': ['#FFCC38', 'glossy'],
  'dot-hexagon': ['#04BB9F', 'glossy'],
  'dot-rounded-diamond': ['#4778FF', 'glossy'],
  'dot-six-lobed-flower': ['#A25BFF', 'fluffy'],
};
for (const shape of DOT_SHAPES) {
  const [own, finish] = dotLooks[shape.id];
  BODY_ENTRIES.push({ key: 'body:' + shape.id, id: shape.id, name: shape.name, kind: 'body', shape: shape.id, own, finish, definition: shape });
}
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
const keepYours = (): void => { stored.set(YOURS_KEY, JSON.stringify(yours)); };
// Another tab of this page changed yours: take its list, so a change here does not write over it.
addEventListener('storage', (e) => {
  if (e.key !== YOURS_KEY) return;
  try { yours = reviveYours(JSON.parse(e.newValue ?? '[]')); } catch { yours = []; }
  redrawYours();
  if (pg.key.startsWith('yours:') && !yours.some((d) => `yours:${d.id}` === pg.key)) select('body:blob');
  else if (pg.key.startsWith('yours:')) select(pg.key);
});
const pickerShapes = [...BODY_ENTRIES, ...GALLERY_ENTRIES];
const entries = (): Entry[] => [...pickerShapes, ...yours.map(yoursEntry)];
const entry = (key: string): Entry => entries().find((e) => e.key === key) ?? BODY_ENTRIES[0];

// ---- The studio's avatar.

const narrow = matchMedia('(max-width: 720px)');
/** The finish picked last, kept in this browser. */
const MATERIAL_KEY = 'blot-avatar:material';
const pg = {
  key: 'body:blob', color: DEFAULT_COLOUR, eyes: null as string | null, face: 'neutral', activity: 'idle', form: null as string | null, progress: 0,
  size: narrow.matches ? 150 : 180, follow: true, dir: 1, amount: 1, last: null as Move | null, mark: false, ultra: false, feel: { ...PERSONALITY } as Personality,
  material: readMaterial(stored.get(MATERIAL_KEY)) ?? 'flat' as Material,
};
const initialQuery = location.search || stored.get('blot-avatar:saved-look') || '';
const appearanceQuery = new URLSearchParams(initialQuery);
pg.eyes = readColour(appearanceQuery.get('eyeFill')) ?? null;
pg.ultra = appearanceQuery.get('ultra') === '1';
const wardrobe: AvatarParts = {};
for (const [key, values] of Object.entries({ eyes: DOT_EYES, glasses: DOT_GLASSES, extra: DOT_EXTRAS })) {
  const v = appearanceQuery.get(key);
  if (v && (values as readonly string[]).includes(v)) Object.assign(wardrobe, { [key]: v });
}
const savedMount = appearanceQuery.get('extraMount');
if (savedMount && /^[a-z0-9][a-z0-9-]{0,39}$/.test(savedMount)) wardrobe.extraMount = savedMount;
const extraColour = readColour(appearanceQuery.get('extraColour'));
if (extraColour) wardrobe.extraColour = extraColour;
const recipes: Record<string, DotAppearance> = {
  ...DOT_CHARACTERS,
  ...Object.fromEntries(DOT_CATALOG.map(item => ['catalog/' + item.id, item.appearance])),
};
let preset = appearanceQuery.get('preset') ?? '';
if (!Object.hasOwn(recipes, preset)) preset = '';
let catalogGloss = appearanceQuery.get('catalogFinish') === 'glossy';
let tintExtra = appearanceQuery.get('tintExtra') === '1';
function recipeParts(recipe: DotAppearance): AvatarParts {
  return { eyes: recipe.eyes ?? 'Oval', glasses: recipe.glasses ?? 'None',
    extra: recipe.extra ?? 'None', extraColour: recipe.extraColour ?? '#1F1F1F' };
}
function currentRecipe() {
  const recipe = recipes[preset];
  if (!recipe) return;
  const changedParts = wardrobe.eyes && wardrobe.eyes !== (recipe.eyes ?? 'Oval')
    || wardrobe.glasses && wardrobe.glasses !== (recipe.glasses ?? 'None')
    || wardrobe.extra && wardrobe.extra !== (recipe.extra ?? 'None') || wardrobe.extraMount;
  return { ...recipe, ...(changedParts ? { parts: { ...wardrobe } } : {}), ...(recipe.catalogId && catalogGloss ? { catalogGloss: true } : {}),
    ...(tintExtra ? { tintExtra: true, extraColour: wardrobe.extraColour } : {}) };
}
function outfit() {
  const shape = entry(pg.key).shape;
  const recipe = currentRecipe();
  if (recipe && recipe.shape === shape) return dotAvatar(recipe);
  const customParts = wardrobe.eyes || (wardrobe.extra && wardrobe.extra !== 'None') || (wardrobe.glasses && wardrobe.glasses !== 'None');
  if (customParts || typeof shape === 'string' && shape.startsWith('dot-')) return avatarParts(shape, wardrobe);
  return { shape, body: bodyOf(shape) };
}
function studioEyeFill(): string | undefined {
  const style = outfit().body?.dotStyle;
  return style && !style.originalEyes ? '#202024' : pg.eyes ?? undefined;
}
const avatarOptions = (): MountOptions => ({
  ...outfit(), clips, size: pg.size, ...inked(pg.color, studioEyeFill()), face: pg.face, activity: pg.activity,
  form: BUSY.has(pg.activity) ? pg.form : null, progress: pg.progress, follow: pg.follow, mark: pg.mark, ultra: pg.ultra, personality: pg.feel, accent: ACCENT, material: pg.material,
});

// A link's query picks the avatar, its colour and what it is doing, once, as the page opens; then it is cleared,
// so a reload starts afresh. A definition in it is checked like an import and added to yours (under another id
// when one of yours already has its id, so a link never takes the place of one of yours).
const shared = readShare(initialQuery, ACTIVITIES);
let chosenTexture = !!shared.material || !!readMaterial(stored.get(MATERIAL_KEY));
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
  } else if (preset) pg.key = 'body:' + recipes[preset].shape;
  if (recipes[preset]?.shape !== entry(pg.key).shape) preset = '';
  const portrait = recipes[preset];
  if (portrait) Object.assign(wardrobe, { ...recipeParts(portrait), ...wardrobe });
  // Older saved dot looks omitted white because every dot used to start white.
  const oldWhite = shared.avatar && entry(pg.key).finish && shared.material ? '#FFFFFF' : undefined;
  pg.color = shared.colour ?? portrait?.colour ?? oldWhite ?? entry(pg.key).own;
  if (shared.doing) pg.activity = shared.doing;
  if (shared.material) pg.material = shared.material;
  else if (portrait) pg.material = portrait.texture === 'Fur' ? 'fluffy' : 'glossy';
  else if (!chosenTexture) pg.material = entry(pg.key).finish ?? 'glossy';
  if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
}

const stage = $('[data-stage]'), stageHost = $('[data-avatar="play"]'), ground = $('[data-ground]');
// The backdrop belongs to the preview. Avatar exports use the wearer's own colours.
const backdrop = $<HTMLInputElement>('[data-backdrop="background"]');
const stageDots = $<HTMLInputElement>('[data-backdrop="dots"]');
function syncBackdrop(): void {
  const theme = getComputedStyle(stage);
  const surface = theme.getPropertyValue('--surface').trim(), ink = theme.getPropertyValue('--ink').trim();
  backdrop.value = stage.style.getPropertyValue('--stage-background') || surface;
  const blended = [1, 3, 5].map(i => {
    const bg = parseInt(backdrop.value.slice(i, i+2), 16), fg = parseInt(ink.slice(i, i+2), 16);
    return Math.round(.91*bg + .09*fg).toString(16).padStart(2, '0');
  }).join('');
  stageDots.value = stage.style.getPropertyValue('--stage-dots') || '#' + blended;
}
backdrop.addEventListener('input', () => {
  stage.style.setProperty('--stage-background', backdrop.value);
  stage.style.setProperty('--stage-glow', 'transparent');
  stage.style.setProperty('--stage-hint', contrast(backdrop.value, '#1B1B1F') >= 4.5 ? '#1B1B1F' : '#FFFFFF');
  syncBackdrop();
});
stageDots.addEventListener('input', () => stage.style.setProperty('--stage-dots', stageDots.value));
$('[data-reset-backdrop]').addEventListener('click', () => {
  for (const token of ['--stage-background', '--stage-dots', '--stage-glow', '--stage-hint']) stage.style.removeProperty(token);
  syncBackdrop();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncBackdrop);
syncBackdrop();

let stageSize = pg.size;
let stageWidth=0, stageHeight=0;
let stageLayout: ReturnType<typeof dotStageLayout> | undefined;
function stageOptions(): MountOptions {
  const options = avatarOptions();
  const { body } = options;
  stageWidth=stage.clientWidth; stageHeight=stage.clientHeight;
  const width = stageWidth || Infinity, height = stageHeight || Infinity;
  const frame = studioBodyFrame(body!);
  // The slider sets the resting body's longest visible dimension. Reserve the
  // same headroom for every wearer so changing a hat cannot shrink its body.
  const span = Math.min(pg.size, width / 1.5, height / 1.65);
  options.size = span / frame.span;
  const extra = body?.dotStyle?.extra;
  const lift = extra === 'Bow tie' ? -.05 : extra && extra !== 'None' ? .07 : 0;
  const x = -frame.x * options.size, y = -frame.y * options.size + lift * span;
  stageHost.style.translate = `${x}px ${y}px`;
  if (body?.dotStyle && !body.wardrobeHost) {
    const appearance = currentRecipe() ?? { shape: body.id, ...body.dotStyle };
    const side = options.size / dotStageLayout(appearance, 1).size;
    stageLayout = dotStageLayout(appearance, side);
    Object.assign(ground.style, {
      width: side + 'px', height: side + 'px', margin: -side/2 + 'px', backgroundImage: stageLayout.background,
      translate: `${x-stageLayout.x}px ${y-stageLayout.y}px`,
      transformOrigin: stageLayout.groundOrigin, transform: '',
    });
  } else stageLayout = undefined;
  stageSize = options.size;
  ground.hidden = !stageLayout;
  return options;
}
const bot = mount(stageHost, {
  ...stageOptions(), followIn: stage, pokeable: true, label: "the studio's avatar", seed: 7,
  onDraw: drawing => {
    if (stageLayout) ground.style.transform = stageLayout.groundTransform(drawing.coat?.dotFace?.playback);
  },
});

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

function changed(resetPose = false): void {
  bot.update(stageOptions());
  if (resetPose) {
    pg.last = null;
    bot.live.resetPose();
  }
  writeCode();
}
function syncStageSize(): void {
  if (stage.clientWidth && (stage.clientWidth !== stageWidth || stage.clientHeight !== stageHeight)) changed();
}
new ResizeObserver(syncStageSize).observe(stage);

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
  climb(false);
  changed();
};
// How far, for the progress figure: while it shows, the page fills it on a loop (up over 4 s, full for 1.8 s, empty
// for 0.6 s) so the ring is seen to move, as a page would move it with its work. Dragging the slider takes over;
// picking the progress chip again starts the loop over. Under reduced motion no figure shows, so neither does the
// slider. (Its readout is not read out as it changes: the loop changes it five times a second.)
const progressRow = $('[data-progress-row]'), progressInput = $<HTMLInputElement>('[data-progress]'), progressOut = $('[data-progress-out]');
/** Steps of 200 ms: from empty (step 0) up to full, then full, then empty again before step 0 comes round. */
const CLIMB = 20, HOLD = 8, EMPTY = 2;
let climbing = 0, climbAt = 0, takenOver = false;
const showProgress = (v: number): void => {
  pg.progress = v;
  progressInput.value = String(v);
  progressOut.textContent = String(v);
};
const climbStep = (): void => {
  const n = climbAt;
  climbAt = (climbAt + 1) % (CLIMB + 1 + HOLD + EMPTY);
  showProgress(n <= CLIMB ? Math.round((n / CLIMB) * 100) / 100 : n <= CLIMB + HOLD ? 1 : 0);
  changed();
};
/** Whether the page should be filling it now. */
const climbs = (): boolean => BUSY.has(pg.activity) && pg.form === 'progress' && !takenOver && !document.hidden && !reducedMotion();
const runClimb = (): void => {
  const on = climbs();
  if (on && !climbing) climbing = window.setInterval(climbStep, 200);
  else if (!on && climbing) { clearInterval(climbing); climbing = 0; }
};
/** The progress figure was picked, or what it is doing changed: show the slider, and (`again`) fill from empty. */
function climb(again: boolean): void {
  const shown = BUSY.has(pg.activity) && pg.form === 'progress';
  progressRow.hidden = !shown || reducedMotion();
  if (again || !shown) {
    // (Empty now, so the loop's next step is the first one up.)
    takenOver = false; climbAt = 1;
    if (climbing) { clearInterval(climbing); climbing = 0; }
    showProgress(0);
  }
  runClimb();
}
progressInput.addEventListener('input', () => {
  takenOver = true;
  runClimb();
  showProgress(Number(progressInput.value));
  changed();
});
document.addEventListener('visibilitychange', runClimb);
onMotion(() => climb(false));
const syncDoing = chips($('[data-choice="activity"]'), ACTIVITIES, () => pg.activity, (v) => doing(v ?? 'idle'));
formRow.hidden = !BUSY.has(pg.activity);
climb(false);
$('.stage-col').addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (e.ctrlKey || e.metaKey || e.altKey || !Number.isInteger(n) || n < 1 || n > ACTIVITIES.length) return;
  if ((e.target as HTMLElement).closest('input, textarea, select')) return;
  e.preventDefault();
  doing(ACTIVITIES[n - 1]);
  syncDoing();
  said(ACTIVITIES[n - 1]);
});
chips($('[data-choice="form"]'), [null, ...FORMS], () => pg.form, (v) => { pg.form = v; climb(v === 'progress'); changed(); });
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
const showCard = tabs('card', () => marked());
const showMode = tabs('appearance-mode', () => {
  if ($('#tab-bot').getAttribute('aria-selected') !== 'true') showCard('tab-bot');
});
const showSource = tabs('preset-source');
showMode(preset ? 'mode-preset' : 'mode-custom');
showSource(preset && !preset.startsWith('catalog/') ? 'source-starters' : 'source-catalog');
tabs('appearance', (id) => { if (id === 'choose-Shape') marked(); });
tabs('play');
const showStep = tabs('new');
tabs('lanes');
tabs('use');

// A button that opens a list under it. A click outside, Escape, or a choice from it closes it.
for (const menu of document.querySelectorAll<HTMLElement>('[data-menu]')) {
  const trigger = $<HTMLButtonElement>(':scope > button', menu), list = $(':scope > .menu-list', menu);
  const settings = menu.classList.contains('settings');
  const placeSettings = () => {
    if (!settings || list.hidden) return;
    const anchor = trigger.getBoundingClientRect();
    const above = anchor.top - 14, below = window.innerHeight - anchor.bottom - 14;
    const upwards = below < list.scrollHeight + 2 && above > below;
    list.classList.toggle('above', upwards);
    list.style.maxHeight = Math.max(64, upwards ? above : below) + 'px';
  };
  const open = (on: boolean) => {
    list.hidden = !on;
    if (settings) {
      if (on) {
        placeSettings();
        window.addEventListener('resize', placeSettings);
        window.addEventListener('scroll', placeSettings, { passive: true });
      } else {
        window.removeEventListener('resize', placeSettings);
        window.removeEventListener('scroll', placeSettings);
      }
    }
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

// Mount still portraits as they enter the picker, so closed lists do not build coat meshes.
const tiles = new WeakMap<Element, { entry: Entry; avatar?: Mounted }>();
const visibleTiles = new IntersectionObserver(rows => {
  for (const row of rows) {
    const tile = tiles.get(row.target);
    if (!tile || !row.isIntersecting) continue;
    const e = tile.entry;
    const config = e.finish ? avatarParts(e.shape) : { shape: e.shape };
    tile.avatar = mount(row.target as HTMLElement, {
      ...config, size: 56, rests: true, ...inked(pg.key === e.key ? pg.color : e.own),
      material: pg.key === e.key ? pg.material : e.finish ?? 'glossy',
    });
    visibleTiles.unobserve(row.target);
  }
});
function paintThumb(cell: HTMLElement, colour: string, material = pg.material): void {
  const slot = cell.querySelector('.bot-thumb');
  if (slot) tiles.get(slot)?.avatar?.update({ ...inked(colour), material });
}
const cells = new Map<string, HTMLButtonElement>();
const pickNote = $('[data-pick-note]');
function cellFor(e: Entry): HTMLLIElement {
  let label = named(e);
  if (SHAPES.includes(label)) {
    if (e.kind === 'gallery') label += ' (outline)';
    else if (e.id.startsWith('dot-')) label += ' (dot)';
  }
  const b = make('button', { type: 'button', className: 'bot-cell', title: label });
  b.setAttribute('aria-label', label);
  const slot = make('span', { className: 'bot-thumb' });
  slot.style.width = slot.style.height = '56px';
  slot.setAttribute('aria-hidden', 'true');
  tiles.set(slot, { entry: e });
  visibleTiles.observe(slot);
  b.append(slot);
  b.addEventListener('click', () => {
    const leavingPreset = !!preset;
    preset = '';
    select(e.key, leavingPreset);
  });
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
$('[data-shapes]').append(...pickerShapes.map(cellFor));
const importedList = $('[data-imported-shapes]');
function redrawYours(): void {
  const focused = [...cells].find(([, b]) => b === document.activeElement)?.[0];
  for (const k of [...cells.keys()]) if (k.startsWith('yours:')) {
    const slot = cells.get(k)?.querySelector('.bot-thumb');
    if (slot) { visibleTiles.unobserve(slot); tiles.get(slot)?.avatar?.destroy(); }
    cells.delete(k);
  }
  importedList.replaceChildren(...yours.map(d => cellFor(yoursEntry(d))));
  $('[data-imported]').hidden = yours.length === 0;
  marked();
  if (focused?.startsWith('yours:')) cells.get(focused)?.focus({ preventScroll: true });
}
const KIND_SAYS: Record<Entry['kind'], string> = { body: 'one of blot\'s bodies', gallery: 'drawn from an outline', yours: 'yours, kept in this browser' };
/** The pressed cell is the one on the stage, scrolled into the list's view (the list only, never the page). */
function marked(): void {
  for (const [k, b] of cells) b.setAttribute('aria-pressed', String(k === pg.key));
  const e = entry(pg.key);
  pickNote.textContent = `on the stage: ${named(e)}, ${KIND_SAYS[e.kind]}.`;
  const cell = cells.get(pg.key);
  const botsBox = cell?.closest<HTMLElement>('.bots-box');
  if (!cell || !botsBox?.offsetParent) return;
  const box = botsBox.getBoundingClientRect(), c = cell.getBoundingClientRect();
  if (c.top < box.top || c.bottom > box.bottom) botsBox.scrollTop += c.top - box.top - (box.height - c.height) / 2;
}

const resetColour = $<HTMLButtonElement>('[data-reset-colour]');
/** The colour now shown, on its thumbnail and the reset button. */
function coloured(): void {
  const own = recipes[preset]?.colour ?? entry(pg.key).own;
  resetColour.hidden = pg.color.toUpperCase() === own.toUpperCase();
  const name = COLOURS.find(([h]) => h === own)?.[1] ?? own;
  resetColour.textContent = `back to its own colour, ${name.toLowerCase()}`;
}

// Colours: the body's and the eyes', each a row of swatches and a panel for any colour at all. Each panel has a
// little avatar in the colours so far, for a phone where the stage is off screen.
const previews: Mounted[] = [];
const faint = $('[data-eye-note]');
function paint(freshStage = false): void {
  const tile = cells.get(pg.key);
  if (tile) paintThumb(tile, pg.color);
  for (const p of previews) p.update({ ...outfit(), ...inked(pg.color, studioEyeFill()), material: pg.material });
  // The eyes as drawn: the picked colour, or the automatic one.
  // (Black is drawn in the page's ink, light on the dark theme: the eyes picked are judged against both.)
  const eyeOn = (body: string) => contrast(body, studioEyeFill() ?? colours(body).eyeFill);
  faint.hidden = (pg.color === BLACK && pg.eyes ? Math.min(eyeOn('#1B1B1F'), eyeOn('#EEEDEA')) : eyeOn(pg.color)) >= FAINT;
  changed(freshStage);
}
const bodyPicker = colorPicker($('[data-picker="body"]'), {
  label: 'body colour', value: pg.color, presets: COLOURS,
  onInput: (v) => { pg.color = v ?? recipes[preset]?.colour ?? entry(pg.key).own; coloured(); paint(); },
});
{
  const eyePicker = colorPicker($('[data-picker="eyes"]'), {
    label: 'eye colour', value: pg.eyes, presets: EYES, auto: 'auto', start: '#FFFFFF',
    onInput: (v) => { pg.eyes = v; paint(); },
  });
  for (const [i, p] of [bodyPicker, eyePicker].entries()) {
    previews.push(mount(p.preview, { ...outfit(), size: 40, ...inked(pg.color, studioEyeFill()), material: pg.material, seed: 300 + i }));
  }
  resetColour.addEventListener('click', () => {
    select(pg.key);
    // The button is hidden now: focus goes to the colour it went back to.
    $('[data-picker="body"]').querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  });
}

// The chosen finish follows the avatar across the stage, picker, exports and share link.
const materialNote = $('[data-material-note]');
const materialButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-material-is]')];
function syncTexture(): void {
  const catalog = !!recipes[preset]?.catalogId;
  const matte = catalog && pg.material === 'glossy' && !catalogGloss;
  $('[data-matte]').hidden = !catalog;
  $('[data-matte]').setAttribute('aria-pressed', String(matte));
  for (const button of materialButtons) {
    button.setAttribute('aria-pressed', String(!matte && button.dataset.materialIs === pg.material));
  }
}
function finished(): void {
  // Where no coat can be drawn (no WebGL2, or it fails) the body stays flat, the switch says so and there is no PNG.
  // (Asked only once fur is: it sets up WebGL2.)
  const usesSurface = pg.material !== 'flat' || !!outfit().body?.dotStyle;
  const noGl = usesSurface && !coatable();
  syncTexture();
  materialNote.hidden = !noGl;
  doButton('png').hidden = noGl || !usesSurface;
  $('[data-svg-says]').textContent = pg.material !== 'flat' ? 'SVG still, flat' : 'SVG still, this colour';
  writeUse();
}
$('[data-matte]').addEventListener('click', () => {
  catalogGloss = false;
  pg.material = 'glossy';
  chosenTexture = true;
  finished();
  paint();
});
for (const b of materialButtons) {
  b.addEventListener('click', () => {
    const m = readMaterial(b.dataset.materialIs);
    if (!m) return;
    chosenTexture = true;
    stored.set(MATERIAL_KEY, m);
    if (m === pg.material && !recipes[preset]?.catalogId) return;
    // A starter's glasses, eyes and ornaments belong to its rig in every finish.
    if (recipes[preset]?.catalogId) catalogGloss = m === 'glossy';
    pg.material = m;
    syncWardrobe();
    finished();
    paint();
  });
}

/** Put an avatar on the stage, in the colour picked for it, or its own. */
function select(key: string, freshWearer = false): void {
  const freshStage = freshWearer || (key !== pg.key && pg.last !== null);
  const previous = cells.get(pg.key);
  if (previous && key !== pg.key) {
    const outgoing = entry(pg.key);
    paintThumb(previous, outgoing.own, outgoing.finish ?? 'glossy');
  }
  pg.key = key;
  if (recipes[preset]?.shape !== entry(key).shape) preset = '';
  syncWardrobe();
  pg.color = recipes[preset]?.colour ?? entry(key).own;
  bodyPicker.set(pg.color);
  marked();
  finished();
  coloured();
  actions();
  paint(freshStage);
  // Another tab can change yours while Moves is open: its avatar is the studio's, so it changes too.
  if (view === 'moves') moversTurn();
}

const portraitButtons = new Map<string, HTMLButtonElement>();
const portraitIndices = new Map(portraitSheet.keys.map((key, index) => [key, index]));
function thumbnail(slot: HTMLElement, key: string): void {
  slot.classList.add('rendered-thumb');
  const index = portraitIndices.get(key)!;
  const { columns, rows } = portraitSheet;
  slot.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  slot.style.backgroundPosition = `${100 * (index % columns) / (columns - 1)}% ${100 * Math.floor(index / columns) / (rows - 1)}%`;
}
function portraitCell(key: string, name: string): HTMLLIElement {
  const slot = make('span', { className: 'portrait-thumb' });
  slot.dataset.portrait = key;
  slot.setAttribute('aria-hidden', 'true');
  const button = make('button', { type: 'button', className: 'bot-cell portrait-cell' },
    slot, make('span', { textContent: name.toLowerCase() }));
  portraitButtons.set(key, button);
  thumbnail(slot, key);
  button.addEventListener('click', () => applyPreset(key));
  return make('li', {}, button);
}
$('[data-starters]').append(...Object.keys(DOT_CHARACTERS).map(name => portraitCell(name, name)));
$('[data-catalog]').append(...DOT_CATALOG.map(item => portraitCell('catalog/' + item.id, item.name)));

function applyPreset(key: string): void {
  preset = key;
  tintExtra = false;
  catalogGloss = false;
  const recipe = recipes[key];
  delete wardrobe.extraMount;
  Object.assign(wardrobe, recipeParts(recipe));
  chosenTexture = true;
  pg.material = recipe.texture === 'Fur' ? 'fluffy' : 'glossy';
  const shapeKey = 'body:' + recipe.shape;
  select(shapeKey, true);
}
type PartKey = 'eyes' | 'glasses' | 'extra';
const choices = {
  eyes: ['Original', ...DOT_EYES],
  glasses: DOT_GLASSES,
  extra: DOT_EXTRAS,
};
const partButtons = new Map<HTMLButtonElement, { key: PartKey; value: string }>();
for (const key of Object.keys(choices) as PartKey[]) {
  const box = $(`[data-parts="${key}"]`);
  for (const value of choices[key]) {
    const button = make('button', { type: 'button', className: 'part-tile' });
    const original = value === 'Original';
    const preview = make('span', { className: 'part-sample' });
    preview.setAttribute('aria-hidden', 'true');
    if (value === 'None') preview.textContent = '∅';
    else if (key === 'eyes') preview.innerHTML = eyePreview(DOT_EYES.find(style => style === value));
    else thumbnail(preview, key + '/' + value);
    button.append(preview, make('span', { textContent: value.toLowerCase() }));
    box.append(button);
    partButtons.set(button, { key, value });
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      if (key === 'extra') delete wardrobe.extraMount;
      if (original) delete wardrobe.eyes;
      else Object.assign(wardrobe, { [key]: value });
      syncWardrobe();
      paint();
    });
  }
}
const extraPalette = $('[data-extra-palette]');
for (const [hex, name] of DOT_EXTRA_COLOURS) {
  const label = name.toLowerCase();
  const button = make('button', { type: 'button', title: label });
  button.setAttribute('aria-label', label);
  button.dataset.hex = hex;
  button.style.backgroundColor = hex;
  extraPalette.append(button);
  button.addEventListener('click', () => {
    tintExtra = !!preset;
    wardrobe.extraColour = hex;
    syncWardrobe();
    paint();
  });
}
function syncWardrobe() {
  const body = outfit().body;
  const id = body?.id ?? '';
  const style = body?.dotStyle;
  const native = !!style && !body?.wardrobeHost;
  if (!chosenTexture && !preset) {
    const finish = entry(pg.key).finish ?? 'glossy';
    if (pg.material !== finish) { pg.material = finish; finished(); }
  }
  $('[data-eye-colours]').hidden = !!style && !style.originalEyes;
  for (const [key, button] of portraitButtons) button.setAttribute('aria-pressed', String(key === preset));
  syncTexture();
  const fixedEye = native && id === 'dot-rounded-head-with-two-ears';
  $('[data-fixed-eye]').hidden = !fixedEye;
  const selected = {
    eyes: style && !style.originalEyes ? style.eyes : 'Original',
    glasses: style?.glasses ?? 'None',
    extra: style?.extra ?? 'None',
  };
  for (const [button, { key, value }] of partButtons) {
    const allowed = key === 'extra' ? body?.wardrobe?.extras : key === 'glasses' ? body?.wardrobe?.glasses : undefined;
    button.hidden = key === 'eyes' && (fixedEye || native && value === 'Original');
    button.disabled = !!allowed && value !== 'None' && !allowed.some(name => name === value);
    button.setAttribute('aria-pressed', String(value === selected[key]));
  }
  const positions = $('[data-extra-mounts]');
  const mounts = body?.wardrobe?.mounts?.filter(m => style && m.extras.includes(style.extra)) ?? [];
  if (!mounts.some(m => m.id === wardrobe.extraMount)) delete wardrobe.extraMount;
  const primary = Object.entries(body?.wardrobe?.seats ?? {}).find(([name]) => name === style?.extra)?.[1];
  const options = mounts.length ? [
    { id:'original',label:primary?.label ?? 'original' },
    ...mounts.map(m => ({ id:m.id,label:m.seat?.label ?? m.id.replaceAll('-',' ') })),
  ] : [];
  const optionKey = JSON.stringify(options);
  if (positions.dataset.options !== optionKey) {
    positions.replaceChildren();
    for (const {id,label} of options) {
      const button = make('button', { type:'button', className:'chip', textContent:label.toLowerCase() });
      button.dataset.mount = id;
      button.addEventListener('click', () => {
        if (id === 'original') delete wardrobe.extraMount;
        else wardrobe.extraMount = id;
        syncWardrobe();
        paint();
      });
      positions.append(button);
    }
    positions.dataset.options = optionKey;
  }
  positions.hidden = !options.length;
  for (const button of positions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.mount === (style?.extraMount ?? 'original')));
  extraPalette.hidden = !style || style.extra === 'None';
  for (const button of extraPalette.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.hex === style?.extraColour));
  }
}
syncWardrobe();

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
  doButton('remove').setAttribute('aria-label', `remove ${named(e)} from imported shapes`);
}
const json = (d: AvatarDefinition) => `${JSON.stringify(d, null, 2)}\n`;
async function copy(text: string, failed: string): Promise<void> {
  if (await copyText(text)) said('copied');
  else said(failed, true);
}
doButton('svg').addEventListener('click', () => { const e = entry(pg.key); download(`${e.id}.svg`, 'image/svg+xml', stillSvg(e.shape, pg.color, 512, outfit().body, studioEyeFill(), pg.ultra)); });
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
  // The viewport may have changed before its resize observer has delivered.
  syncStageSize();
  const host = $('[data-avatar="play"]'), box = svgBox(stageSize);
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
  // Capture every layer in the same browser turn. An animation can advance
  // while SVG images decode, so retain the coat pixels and transforms now.
  const layers = [...host.children].map(async layer => {
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
      const filter = glowOf(layer);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return () => {
          ctx.filter = filter;
          ctx.drawImage(img, 0, 0, side, side);
          ctx.filter = 'none';
        };
      } finally { URL.revokeObjectURL(url); }
    } else if (layer === coat) {
      // Where the coat sits, and the breath, squash or hop it is moved by (a CSS transform about its corner).
      const cs = getComputedStyle(coat), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform), w = parseFloat(cs.width);
      const snapshot = make('canvas',{width:coat.width,height:coat.height});
      snapshot.getContext('2d')!.drawImage(coat,0,0);
      const filter=glowOf(coat), alpha=Number(cs.opacity);
      const x=parseFloat(cs.left)-box.left+room, y=parseFloat(cs.top)-box.top+room;
      return () => {
        ctx.save();
        ctx.filter = filter;
        ctx.scale(scale,scale);
        ctx.translate(x,y);
        ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);
        ctx.globalAlpha = alpha;
        ctx.drawImage(snapshot,0,0,w,w);
        ctx.restore();
      };
    }
  });
  for (const paint of await Promise.all(layers)) paint?.();
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
function appearanceLink() {
  const e = entry(pg.key);
  const url = new URL(shareLink(location.href.split(/[?#]/)[0], e, pg.color, e.own, pg.activity, pg.material));
  for (const [key,v] of Object.entries(wardrobe)) url.searchParams.set(key,v);
  if (e.finish) url.searchParams.set('color', pg.color);
  if (pg.eyes && studioEyeFill() === pg.eyes) url.searchParams.set('eyeFill', pg.eyes);
  if (pg.ultra) url.searchParams.set('ultra','1');
  if (preset) url.searchParams.set('preset',preset);
  if (preset && tintExtra) url.searchParams.set('tintExtra', '1');
  if (currentRecipe()?.catalogGloss) url.searchParams.set('catalogFinish', 'glossy');
  url.searchParams.set('material',pg.material);
  return url;
}
doButton('link').addEventListener('click', () => {
  const url = appearanceLink().href;
  void copy(url,'copy this link: '+url);
});
$('[data-save-look]').addEventListener('click', () => {
  const saved = stored.set('blot-avatar:saved-look', appearanceLink().search);
  said(saved ? 'avatar saved in this browser.' : 'browser storage is unavailable. use copy link to keep this avatar.');
});
doButton('remove').addEventListener('click', () => {
  const e = entry(pg.key);
  if (e.kind !== 'yours') return;
  yours = yours.filter((d) => d.id !== e.id);
  keepYours();
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
  redrawYours();
  select(`yours:${r.values[r.values.length - 1].id}`);
  const replaced = r.values.filter((d) => had.has(d.id)).map((d) => d.name.toLowerCase());
  const lines = [`added ${r.values.map((d) => d.name.toLowerCase()).join(', ')}: on the stage now, and saved in this browser under new → imported shapes.`, ...r.notes];
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
  ultra.checked = pg.ultra;
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
    const b = make('button', { type: 'button', className: m.here ? 'chip move here' : 'chip move', textContent: m.label ?? m.name });
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
const waggleSource = ((t) => t.slice(t.indexOf('// a waggle'), t.indexOf('\n]);', t.indexOf('const waggle')) + 4))($('#wave-code').textContent ?? '');

/** Use it's code for any page and for React, as written there, and with the finish picked when it is fluffy. */
const useCode = { page: $('#mount-code'), react: $('#react-code') };
const useFlat = { page: useCode.page.textContent ?? '', react: useCode.react.textContent ?? '' };
function writeUse(): void {
  const coated = pg.material !== 'flat';
  useCode.page.textContent = coated ? useFlat.page.replace("label: 'ada',", `label: 'ada', material: '${pg.material}',`) : useFlat.page;
  useCode.react.textContent = !coated ? useFlat.react : useFlat.react
    .replace("const { host, paths, first } = useLiveAvatar({ shape: 'star', size, follow: true });",
      "const { host, paths, coat, first } = useLiveAvatar({\n    shape: 'star', size, follow: true, material: 'fluffy',\n  });")
    // The coat's canvas goes under the svg, hidden until a coat shows it (without WebGL2 the body stays flat).
    .replace("material: 'fluffy'", `material: '${pg.material}'`)
    .replace(/(\n\s*)<svg /, "$1<canvas ref={coat} aria-hidden style={{ position: 'absolute', display: 'none' }} />$1<svg ");
}

/** The code for the studio's avatar as it is now. */
function writeCode(): void {
  const e = entry(pg.key);
  const shapeOption = e.kind === 'body' ? `shape: '${e.id}'` : e.kind === 'gallery' ? `shape: galleryAvatar('${e.id}').definition` : 'shape';
  const styled = outfit().body?.dotStyle;
  const recipe = currentRecipe();
  const initial = recipe ? `...dotAvatar(${JSON.stringify(recipe)})` : styled ? `...avatarParts(${shapeOption.replace(/^shape: /,'')}, ${JSON.stringify(wardrobe)})` : shapeOption;
  const o: string[] = [initial, `size: ${Number((stageSize).toFixed(3))}`];
  if (pg.color !== (recipe?.colour ?? DEFAULT_COLOUR)) o.push(`color: '${pg.color}'`);
  if (pg.eyes && studioEyeFill() === pg.eyes) o.push(`eyeFill: '${pg.eyes}'`);
  if (pg.face !== 'neutral') o.push(`face: '${pg.face}'`);
  if (pg.activity !== 'idle') o.push(`activity: '${pg.activity}'`);
  if (BUSY.has(pg.activity) && pg.form) o.push(`form: '${pg.form}'`);
  if (BUSY.has(pg.activity) && pg.form === 'progress') o.push(`progress: ${pg.progress}`);
  if (pg.follow) o.push('follow: true');
  if (pg.mark) o.push('mark: true');
  if (pg.ultra) o.push('ultra: true');
  if (pg.material !== 'flat' || recipe) o.push(`material: '${pg.material}'`);
  const feel = (Object.keys(PERSONALITY) as (keyof Personality)[]).filter((k) => pg.feel[k] !== PERSONALITY[k]).map((k) => `${k}: ${pg.feel[k]}`);
  if (feel.length) o.push(`personality: { ${feel.join(', ')} }`);
  o.push(`accent: '${ACCENT}'`);
  o.push('pokeable: true');
  const dotClip = pg.last && Object.hasOwn(DOT_CLIPS, pg.last.name);
  if (pg.last?.here) o.push('clips: { waggle }');
  else if (dotClip && !recipe) o.push('clips: DOT_CLIPS');
  const lines: string[] = [];
  for (let i = 0; i < o.length; i += 3) lines.push(`  ${o.slice(i, i + 3).join(', ')},`);
  let text = `import { ${dotClip && !recipe ? 'DOT_CLIPS, ' : ''}${recipe ? 'dotAvatar, ' : styled ? 'avatarParts, ' : ''}${e.kind === 'gallery' ? 'galleryAvatar, mount' : 'mount'} } from '@blot/avatar';\n`;
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
  ...outfit(), size: narrow.matches ? 120 : 150, ...inked(pg.color, studioEyeFill()), follow: true, followIn: moveStage,
  pokeable: true, label: 'the avatar that shows each move', seed: 9, clips, accent: ACCENT, material: pg.material,
});
/** The moves are shown on the avatar in the studio, as it is now. */
const moversTurn = (): void => mover.update({ ...outfit(), clips, ...inked(pg.color, studioEyeFill()), personality: pg.feel, material: pg.material });
function moveRow(m: Move): HTMLLIElement {
  const b = make('button', { type: 'button', className: 'move-row' }, make('code', { textContent: m.label ?? m.name }), make('span', { textContent: SAYS[m.name] ?? `a ${m.lane}.` }));
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

redrawYours();
finished();
route();
coloured();
actions();
faces();
paint();
still();
onMotion(still);
if (shared.problem) said(calm(shared.problem), true);
