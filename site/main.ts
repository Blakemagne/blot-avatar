// The demo page. Everything on it is the packages' public API (@blot/avatar, and @blot/jacrispy for his section): mount() for each avatar, and the lists the
// engine exports (BODIES, FACE_NAMES, ACTIVITIES, FORMS, POKES, CUES) for every set of buttons, so a new body,
// face or clip in the package shows up here without touching this file. The wave is the one move written here.

import {
  ACTIVITIES, BODIES, CUES, FACE_NAMES, FORMS, PERSONALITY, POKES, colours, deg, mount, onMotion, reducedMotion,
  type Clip, type MountOptions, type Mounted, type Personality,
} from '@blot/avatar';
import {
  ANTENNA_POSES, JACRISPY, JACRISPY_CLIPS, JACRISPY_COLOUR, JACRISPY_EYE, JACRISPY_MOODS, JACRISPY_MOOD_NAMES, jacrispyFace, type JacrispyMood,
} from '@blot/jacrispy';
import { colorPicker, contrast } from './picker';

/** The move this page adds through the `clips` option: a rock from side to side. The same text is on the page. */
const wave: Clip = {
  lane: 'cue',
  ms: 900,
  apply(o, p) {
    o.roll += p.cue.dir * p.cue.amount * 0.12 * Math.sin(3 * Math.PI * p.u) * (1 - p.u);
  },
};
// (Jacrispy's antenna moves too, so that the playground's jacrispy has them.)
const clips = { wave, ...JACRISPY_CLIPS };

interface Move { name: string; lane: 'poke' | 'cue'; here?: boolean }
const MOVES: Move[] = [
  ...POKES.map((name): Move => ({ name, lane: 'poke' })),
  ...CUES.map((name): Move => ({ name, lane: 'cue' })),
  { name: 'wave', lane: 'cue', here: true },
];

/** What each move reads as. A clip added to the package later gets its name and lane only. */
const SAYS: Record<string, string> = {
  spin: 'Half a turn and back. A click plays the pokes in turn, and this is the first.',
  nod: 'A nod: yes.',
  hop: 'A hop off the ground, with a squash as it lands.',
  shake: 'A shake of the head: no.',
  bounce: 'Two quick hops: done!',
  tilt: 'The head leans over and holds: hm?',
  delight: 'Up off the ground with happy eyes, and sparks thrown up.',
  wink: 'One eye shuts and opens again.',
  wide: 'A squint, then the eyes go wide.',
  alert: 'Up sharply, eyes open, and a pulse of its own outline.',
  recoil: 'A jump back away from something on one side.',
  lean: 'A lean to one side, held, and back.',
  tug: 'Pulled one way, then it springs back and rings out.',
  settle: 'A wobble that dies away, as if set down hard.',
  flare: 'A surge of glow that flickers out; the body swells with it.',
  float: 'Up off the ground for two slow bobs.',
  look: 'A glance to one side and up: the eyes first, the head after.',
  exclaim: 'A "!" gathers above its head out of sparks, and falls apart.',
  burst: 'It draws in and lets go: sparks fly off all round.',
  comet: 'A wind-up, a dash with speed lines behind it, and back.',
  rings: 'Rings come round it, passing behind and in front.',
  rock: 'A rock from side to side about a point below it.',
  wave: 'A rock from side to side. Written on this page, not in the package.',
};

/** Who does each move on its card, so every card shows another body. */
const CARD_SHAPE: Record<string, string> = {
  spin: 'star', nod: 'blob', hop: 'cloud', shake: 'wedge', bounce: 'heart', tilt: 'tablet', wave: 'flower',
  delight: 'blob', wink: 'pebble', exclaim: 'heart', rings: 'blob', comet: 'teardrop', rock: 'teardrop', flare: 'star',
};
/** The effects' colour (a mark, sparks, rings, Zs, a glow) on every avatar here. */
const ACCENT = '#7C5CFF';
/** The shapes a visit goes to. */
const VISITS = ['teardrop', 'hex', 'wedge', 'star'];

const COLOURS: [string, string][] = [
  ['#FD690F', 'Orange'], ['#2F6BFF', 'Blue'], ['#14A05A', 'Green'], ['#8B5CF6', 'Violet'],
  ['#F2B61C', 'Yellow'], ['#E2416B', 'Pink'], ['#24242A', 'Ink'], ['#F1EEE8', 'Paper'],
];
const DEFAULT_COLOUR = '#FD690F';
/** Eye colours to start from. With none picked the eyes are automatic: white, or dark on a pale body. */
const EYES: [string, string][] = [
  ['#FFFFFF', 'White'], ['#1C1C1C', 'Ink'], ['#FFD23F', 'Gold'], ['#7FE3FF', 'Ice'], ['#FF5C8A', 'Pink'], ['#3DDC84', 'Mint'],
];
/** Below this contrast with the body, the eyes are hard to make out. */
const FAINT = 1.6;
const SHAPES = Object.keys(BODIES);
/** Forms are what the body turns into while it thinks or works; they mean nothing otherwise. */
const BUSY = new Set(['thinking', 'working']);

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

// ---- The logo: a live one in the header. It watches the pointer, opens its eyes wide when the pointer comes to
// it, and each poke is a move and a flourish (it is a button; Enter and Space poke it too).

const LOGO_SIZE = 30;
/** What each poke adds to the spin, nod or hop, in turn. */
const FLOURISH = ['delight', 'wink', 'exclaim', 'burst', 'rings', 'recoil'];
{
  const host = $('[data-avatar="logo"]');
  const logo = mount(host, {
    shape: 'blob', size: LOGO_SIZE, color: DEFAULT_COLOUR, follow: true, pokeable: true, label: 'the blot avatar logo', seed: 5, accent: ACCENT,
  });
  let next = 0;
  const flourish = () => { if (logo.play(FLOURISH[next])) next = (next + 1) % FLOURISH.length; };
  host.addEventListener('click', flourish);
  host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) flourish(); });
  host.addEventListener('pointerenter', () => { logo.play('wide'); });
}

// ---- The hero.

const heroSize = (): number => (matchMedia('(max-width: 720px)').matches ? 150 : 220);
const hero = mount($('[data-avatar="hero"]'), {
  shape: 'blob', size: heroSize(), color: DEFAULT_COLOUR, follow: true, pokeable: true, label: 'the avatar', seed: 3, clips,
});
matchMedia('(max-width: 720px)').addEventListener('change', () => hero.update({ size: heroSize() }));

// ---- The playground.

const pg = {
  shape: 'heart', color: DEFAULT_COLOUR, eyes: null as string | null, face: 'neutral', activity: 'idle', form: null as string | null,
  size: 180, follow: true, dir: 1, amount: 1, last: null as Move | null, mark: false, feel: { ...PERSONALITY } as Personality,
};
const options = (): MountOptions => ({
  shape: pg.shape, size: pg.size, color: pg.color, eyeFill: pg.eyes ?? undefined, face: pg.face, activity: pg.activity,
  form: BUSY.has(pg.activity) ? pg.form : null, follow: pg.follow, mark: pg.mark, personality: pg.feel, accent: ACCENT,
});
const bot = mount($('[data-avatar="play"]'), { ...options(), pokeable: true, label: 'the playground avatar', seed: 7, clips });

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

const syncShape = chips($('[data-choice="shape"]'), SHAPES, () => pg.shape, (v) => { pg.shape = v ?? 'blob'; changed(); });
chips($('[data-choice="face"]'), FACE_NAMES, () => pg.face, (v) => { pg.face = v ?? 'neutral'; changed(); });
const formRow = $('[data-form-row]');
// A face is worn when idle: busy, the activity has its own. So the face chips wait until it is idle again,
// and the avatar never shows a face the code beside it would not give.
const faces = (): void => {
  const busy = pg.activity !== 'idle';
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-choice="face"] .chip')) b.disabled = busy;
  $('[data-face-note]').hidden = !busy;
};
chips($('[data-choice="activity"]'), ACTIVITIES, () => pg.activity, (v) => {
  pg.activity = v ?? 'idle';
  formRow.hidden = !BUSY.has(pg.activity);
  faces();
  changed();
});
chips($('[data-choice="form"]'), [null, ...FORMS], () => pg.form, (v) => { pg.form = v; changed(); });

// The mark, a visit, and what it is like to move.
{
  const mark = $<HTMLInputElement>('[data-mark]');
  mark.addEventListener('change', () => { pg.mark = mark.checked; changed(); });
  const visits = $('[data-visit]');
  for (const shape of VISITS) {
    const b = make('button', { type: 'button', className: 'chip', textContent: shape });
    b.addEventListener('click', () => { if (pg.shape !== shape) bot.visit(shape); pg.last = null; writeCode(); });
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
}

// Colours: the body's and the eyes', each a row of swatches and a panel for any colour at all. Each panel has a
// little avatar in the colours so far, for a phone where the playground's is off screen.
{
  const previews: Mounted[] = [];
  const faint = $('[data-eye-note]');
  const paint = (): void => {
    for (const p of previews) p.update({ color: pg.color, eyeFill: pg.eyes ?? undefined });
    // The eyes as drawn: the picked colour, or the automatic one.
    faint.hidden = contrast(pg.color, pg.eyes ?? colours(pg.color).eyeFill) >= FAINT;
    changed();
  };
  const body = colorPicker($('[data-picker="body"]'), {
    label: 'Body colour', value: pg.color, presets: COLOURS,
    onInput: (v) => { pg.color = v ?? DEFAULT_COLOUR; paint(); },
  });
  const eyes = colorPicker($('[data-picker="eyes"]'), {
    label: 'Eye colour', value: pg.eyes, presets: EYES, auto: 'Auto', start: '#FFFFFF',
    onInput: (v) => { pg.eyes = v; paint(); },
  });
  for (const [i, p] of [body, eyes].entries()) {
    previews.push(mount(p.preview, { shape: 'blob', size: 40, color: pg.color, seed: 300 + i }));
  }
}

// Moves.
{
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

// Size and pointer.
{
  const size = $<HTMLInputElement>('[data-size]'), out = $('[data-size-out]');
  size.addEventListener('input', () => { pg.size = Number(size.value); out.textContent = `${pg.size} px`; changed(); });
  const follow = $<HTMLInputElement>('[data-follow]');
  follow.addEventListener('change', () => { pg.follow = follow.checked; changed(); });
}

/** The wave's definition as the page shows it under "Moves are data", for code that plays the wave. */
const waveSource = ((t) => t.slice(t.indexOf('const wave'), t.indexOf('\n};', t.indexOf('const wave')) + 3))($('#wave-code').textContent ?? '');

/** The code for the playground's avatar as it is now. */
function writeCode(): void {
  const o: string[] = [`shape: '${pg.shape}'`, `size: ${pg.size}`];
  if (pg.color !== DEFAULT_COLOUR) o.push(`color: '${pg.color}'`);
  if (pg.eyes) o.push(`eyeFill: '${pg.eyes}'`);
  if (pg.face !== 'neutral') o.push(`face: '${pg.face}'`);
  if (pg.activity !== 'idle') o.push(`activity: '${pg.activity}'`);
  if (BUSY.has(pg.activity) && pg.form) o.push(`form: '${pg.form}'`);
  if (pg.follow) o.push('follow: true');
  if (pg.mark) o.push('mark: true');
  const feel = (Object.keys(PERSONALITY) as (keyof Personality)[]).filter((k) => pg.feel[k] !== PERSONALITY[k]).map((k) => `${k}: ${pg.feel[k]}`);
  if (feel.length) o.push(`personality: { ${feel.join(', ')} }`);
  o.push(`accent: '${ACCENT}'`);
  o.push('pokeable: true');
  if (pg.last?.here) o.push('clips: { wave }');
  const lines: string[] = [];
  for (let i = 0; i < o.length; i += 3) lines.push(`  ${o.slice(i, i + 3).join(', ')},`);
  let text = pg.last?.here ? `import { mount, type Clip } from '@blot/avatar';\n\n${waveSource}\n` : `import { mount } from '@blot/avatar';\n`;
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
writeCode();

// ---- One card per move.

{
  const list = $('[data-move-cards]');
  MOVES.forEach((m, i) => {
    const slot = make('div', { className: 'card-avatar' });
    const button = make('button', { type: 'button', className: 'button small', textContent: 'Play' });
    button.setAttribute('aria-label', `Play ${m.name}`);
    const tag = make('span', { className: m.here ? 'tag here' : 'tag', textContent: m.here ? 'this page' : m.lane });
    const card = make('li', { className: m.here ? 'card here' : 'card' },
      slot,
      make('div', { className: 'card-text' }, make('h3', {}, make('code', { textContent: m.name }), tag), make('p', { textContent: SAYS[m.name] ?? `A ${m.lane}.` })),
      button);
    list.append(card);
    const shape = CARD_SHAPE[m.name] ?? SHAPES[i % SHAPES.length];
    const one = mount(slot, { shape, size: 88, color: COLOURS[i % 6][0], seed: 20 + i, clips, accent: ACCENT });
    button.addEventListener('click', () => play(one, m));
    moveButtons.push(button);
  });
}

// ---- Every body, and one at every size.

{
  const list = $('[data-gallery]');
  SHAPES.forEach((shape, i) => {
    const slot = make('div', { className: 'gallery-avatar' });
    const pick = make('button', { type: 'button', className: 'link', textContent: 'Try it' });
    pick.setAttribute('aria-label', `Try ${shape} in the playground`);
    pick.addEventListener('click', () => {
      pg.shape = shape; syncShape(); changed();
      // Focus goes to the chip that now shows the choice, so a keyboard or a screen reader follows the scroll.
      $<HTMLButtonElement>('[data-choice="shape"] [aria-pressed="true"]').focus({ preventScroll: true });
      $('#play').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
    list.append(make('li', { className: 'gallery-item' }, slot, make('span', { className: 'gallery-name', textContent: shape }), pick));
    mount(slot, { shape, size: 72, color: COLOURS[i % 6][0], follow: true, pokeable: true, label: shape, seed: 100 + i });
  });

  const sizes = $('[data-sizes]');
  [22, 32, 48, 64, 96, 128].forEach((size, i) => {
    const slot = make('div', { className: 'size-avatar' });
    sizes.append(make('li', {}, slot, make('span', { textContent: `${size} px` })));
    mount(slot, { shape: 'star', size, color: DEFAULT_COLOUR, follow: true, pokeable: size >= 64, label: `the ${size} px star`, seed: 200 + i });
  });
}

// ---- Jacrispy: his own body or his face on any other, moods, antenna poses and moves.

{
  const jac = mount($('[data-avatar="jacrispy"]'), {
    shape: 'jacrispy', body: JACRISPY, size: 220, color: JACRISPY_COLOUR, eyeFill: JACRISPY_EYE, follow: true, pokeable: true, label: 'jacrispy', seed: 11, clips,
  });
  const now = { mood: 'neutral' as string | null, pose: 'rest' as string | null, body: 'jacrispy' as string | null, doing: 'idle' as string | null };
  const syncs: (() => void)[] = [];
  const hold = ([l, r]: readonly [number, number], ms = 0): void => jac.live.rig.setAntennas(deg(l), deg(r), ms);
  // His own body, or his face (lenses, the bar between them, the camera and the antennas) on any other, in his
  // white. A new body morphs in, as a new shape does in the playground.
  const others = SHAPES;
  const faced = Object.fromEntries(others.map((id) => [id, jacrispyFace(BODIES[id])]));
  syncs.push(chips($('[data-jac="body"]'), ['jacrispy', ...others], () => now.body, (v) => {
    now.body = v;
    const id = v ?? 'jacrispy';
    jac.update(id === 'jacrispy' ? { shape: 'jacrispy', body: JACRISPY } : { shape: id, body: faced[id] });
    syncs.forEach((s) => s());
  }));
  // His lenses are cameras: they never blink or emote. A mood is an antenna pose (sad droops slowly) and a
  // head move measured from Pollen's recording of it. Neutral is his antennas at rest and no move.
  syncs.push(chips($('[data-jac="mood"]'), ['neutral', ...JACRISPY_MOOD_NAMES], () => now.mood, (v) => {
    now.mood = v; now.pose = null;
    if (!v || v === 'neutral') { now.pose = 'rest'; hold(ANTENNA_POSES.rest, 260); }
    else {
      const m = JACRISPY_MOODS[v as JacrispyMood];
      hold(m.antennas, m.ms ?? 260);
      jac.play(m.cue);
    }
    syncs.forEach((s) => s());
  }));
  // What he is doing, as for every blot: idle (breathing, drifting, his antennas swaying), or busy.
  syncs.push(chips($('[data-jac="doing"]'), ACTIVITIES, () => now.doing, (v) => {
    now.doing = v ?? 'idle';
    jac.update({ activity: now.doing as (typeof ACTIVITIES)[number] });
    syncs.forEach((s) => s());
  }));
  syncs.push(chips($('[data-jac="pose"]'), Object.keys(ANTENNA_POSES), () => now.pose, (v) => {
    now.pose = v; hold(ANTENNA_POSES[v ?? 'rest'], 260);
    syncs.forEach((s) => s());
  }));
  const moveBox = $('[data-jac="moves"]');
  for (const name of Object.keys(JACRISPY_CLIPS)) {
    const b = make('button', { type: 'button', className: 'chip move', textContent: name });
    b.addEventListener('click', () => jac.play(name, { dir: name === 'twitch' && Math.random() < 0.5 ? -1 : 1 }));
    moveButtons.push(b);
    moveBox.append(b);
  }

  // His face on every other body, each watching the pointer. A click plays a mood picked in turn.
  const list = $('[data-jac-faces]');
  others.forEach((id, i) => {
    const slot = make('div', { className: 'gallery-avatar' });
    list.append(make('li', { className: 'gallery-item' }, slot, make('span', { className: 'gallery-name', textContent: id })));
    const one = mount(slot, { shape: id, body: faced[id], size: 72, color: JACRISPY_COLOUR, eyeFill: JACRISPY_EYE, follow: true, label: `${id} with jacrispy's face`, seed: 300 + i, clips });
    let next = i;
    slot.addEventListener('click', () => {
      const m = JACRISPY_MOODS[JACRISPY_MOOD_NAMES[next++ % JACRISPY_MOOD_NAMES.length]];
      one.live.rig.setAntennas(deg(m.antennas[0]), deg(m.antennas[1]), m.ms ?? 260);
      one.play(m.cue);
    });
  });
}

// ---- Copy buttons.

/** Where a copy's result is said, for a screen reader. */
const said = make('span', { className: 'vh' });
said.setAttribute('aria-live', 'polite');
document.body.append(said);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  b.addEventListener('click', async () => {
    const code = document.getElementById(b.dataset.copy ?? '');
    if (!code) return;
    said.textContent = '';
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      b.textContent = 'Copied';
      said.textContent = 'Copied';
    } catch {
      // No clipboard (a plain-http page, or a browser that says no): select it, for a copy by hand.
      getSelection()?.selectAllChildren(code);
      b.textContent = 'Press Ctrl+C';
      said.textContent = 'Selected. Press Ctrl+C to copy.';
    }
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  });
}

faces();
still();
onMotion(still);
