// The demo page's colour picker: a row of swatches, and a panel for any colour at all (a saturation and
// brightness square, a hue slider and a hex field). No dependency and no native <input type="color">, so it looks
// and works the same in every browser. Every part is a real control: the square is a slider for the keyboard
// (left and right for saturation, up and down for brightness, Shift for big steps), the hue is a range input,
// and the hex field takes '#abc', '#aabbcc' or the same without '#'.

export interface PickerOptions {
  /** What it picks, for labels: 'body colour'. */
  label: string;
  /** '#RRGGBB', or null for the automatic choice when `auto` is given. */
  value: string | null;
  /** The swatches: a colour, its name, and (if it is drawn some other way, such as in the theme's ink) how its swatch is painted. */
  presets: readonly (readonly [hex: string, name: string, show?: string])[];
  /** The automatic choice's chip text, e.g. 'auto'. Without it there is always a colour. */
  auto?: string;
  /** What any colour starts from when the value is the automatic one. */
  start?: string;
  /** Every change, as '#RRGGBB' or null (the automatic choice). */
  onInput(value: string | null): void;
}

export interface Picker {
  /** Show a value without calling onInput. */
  set(value: string | null): void;
  /** The panel's slot for a preview, beside the hex field. */
  readonly preview: HTMLElement;
}

interface Hsv { h: number; s: number; v: number }

const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
const hex2 = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0').toUpperCase();

/** '#abc', '#aabbcc', 'abc' or 'aabbcc' as '#AABBCC'; anything else is null. */
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${[...t].map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t}`.toUpperCase();
  return null;
}

export function rgbOf(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${hex2(f(5) * 255)}${hex2(f(3) * 255)}${hex2(f(1) * 255)}`;
}

/** The hue is kept as `h` when the colour has none (a grey), so the square does not jump to red. */
export function hexToHsv(hex: string, h = 0): Hsv {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d > 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** WCAG contrast ratio of two '#RRGGBB' colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = rgbOf(hex).map((c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

let made = 0;

export function colorPicker(box: HTMLElement, o: PickerOptions): Picker {
  const id = `cp${++made}`;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };
  let value = o.value;
  let hsv = hexToHsv(value ?? o.start ?? o.presets[0]?.[0] ?? '#FD690F');

  // ---- The row: auto, the presets, and the button that opens the panel.
  const row = el('div', 'swatches');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', o.label);
  const autoChip = o.auto ? el('button', 'chip') : null;
  if (autoChip) {
    autoChip.type = 'button';
    autoChip.textContent = o.auto!;
    autoChip.setAttribute('aria-label', `${o.label}: ${o.auto}`);
    autoChip.addEventListener('click', () => choose(null));
    row.append(autoChip);
  }
  const swatches = o.presets.map(([hex, name, show]) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.title = name;
    b.setAttribute('aria-label', name);
    b.style.setProperty('--swatch', show ?? hex);
    b.addEventListener('click', () => choose(hex));
    row.append(b);
    return b;
  });
  const open = el('button', 'swatch any');
  open.type = 'button';
  open.title = 'any colour';
  open.setAttribute('aria-label', `any ${o.label.toLowerCase()}`);
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-controls', id);
  row.append(open);

  // ---- The panel.
  const panel = el('div', 'cp-panel');
  panel.id = id;
  panel.hidden = true;
  const square = el('div', 'cp-square');
  square.tabIndex = 0;
  square.setAttribute('role', 'slider');
  square.setAttribute('aria-label', `${o.label}: saturation and brightness`);
  square.setAttribute('aria-valuemin', '0');
  square.setAttribute('aria-valuemax', '100');
  const thumb = el('span', 'cp-thumb');
  square.append(thumb);
  const hue = el('input', 'cp-hue');
  hue.type = 'range';
  hue.min = '0';
  hue.max = '359';
  hue.step = '1';
  hue.setAttribute('aria-label', `${o.label}: hue`);
  const foot = el('div', 'cp-foot');
  const preview = el('div', 'cp-preview');
  const hexLabel = el('label', 'cp-hex');
  const hexText = el('span', '');
  hexText.textContent = 'hex';
  const field = el('input', '');
  field.type = 'text';
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.setAttribute('autocapitalize', 'characters');
  hexLabel.append(hexText, field);
  foot.append(preview, hexLabel);
  panel.append(square, hue, foot);
  box.append(row, panel);

  // ---- Showing the value.
  const draw = (): void => {
    const hex = hsvToHex(hsv);
    const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    square.style.setProperty('--hue', pure);
    hue.style.setProperty('--hue', pure);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    thumb.style.background = hex;
    square.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
    square.setAttribute('aria-valuetext', `saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%, ${hex}`);
    hue.value = String(Math.round(hsv.h) % 360);
    if (document.activeElement !== field) field.value = value ?? '';
    // 'auto' shows in the empty field only while it is true.
    field.placeholder = value === null && o.auto ? o.auto : '';
    for (const [i, b] of swatches.entries()) b.setAttribute('aria-pressed', String(o.presets[i][0] === value));
    autoChip?.setAttribute('aria-pressed', String(value === null));
    const custom = value !== null && !o.presets.some(([p]) => p === value);
    // A disclosure, not a toggle: what it holds is said in its name, not as a pressed state.
    open.setAttribute('aria-label', custom ? `any ${o.label.toLowerCase()}, now ${value}` : `any ${o.label.toLowerCase()}`);
    open.classList.toggle('on', custom);
    open.style.setProperty('--swatch', custom ? value! : 'transparent');
  };

  /** A swatch or auto: the panel follows it, but stays as it was otherwise. */
  function choose(next: string | null): void {
    value = next;
    if (next) hsv = hexToHsv(next, hsv.h);
    draw();
    o.onInput(value);
  }
  /** The square, the hue or the field: always a colour. */
  const pick = (next: Hsv, from?: string): void => {
    hsv = next;
    value = from ?? hsvToHex(hsv);
    draw();
    o.onInput(value);
  };

  open.addEventListener('click', () => {
    const show = panel.hidden;
    panel.hidden = !show;
    open.setAttribute('aria-expanded', String(show));
  });

  // The square, by pointer: a press anywhere sets it, and a drag carries on outside it.
  const at = (e: PointerEvent): void => {
    const r = square.getBoundingClientRect();
    pick({ h: hsv.h, s: clamp((e.clientX - r.left) / r.width), v: clamp(1 - (e.clientY - r.top) / r.height) });
  };
  square.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    square.focus({ preventScroll: true });
    square.setPointerCapture(e.pointerId);
    at(e);
  });
  square.addEventListener('pointermove', (e) => { if (square.hasPointerCapture(e.pointerId)) at(e); });
  // ...and by key.
  square.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    let next: Hsv | null = null;
    if (move[e.key]) next = { h: hsv.h, s: clamp(hsv.s + move[e.key][0]), v: clamp(hsv.v + move[e.key][1]) };
    else if (e.key === 'Home') next = { h: hsv.h, s: 0, v: hsv.v };
    else if (e.key === 'End') next = { h: hsv.h, s: 1, v: hsv.v };
    else if (e.key === 'PageUp') next = { h: hsv.h, s: hsv.s, v: 1 };
    else if (e.key === 'PageDown') next = { h: hsv.h, s: hsv.s, v: 0 };
    if (!next) return;
    e.preventDefault();
    pick(next);
  });

  hue.addEventListener('input', () => pick({ h: Number(hue.value), s: hsv.s, v: hsv.v }));

  // The field. Six digits are taken as they are typed; three only on Enter or on leaving, since they are also the
  // start of six. It is marked wrong only once it cannot become a colour, never halfway through typing one.
  const typed = (): string | null => parseHex(field.value);
  const tidy = (): void => {
    const hex = typed();
    if (hex && hex !== value) pick(hexToHsv(hex, hsv.h), hex);
    field.removeAttribute('aria-invalid');
    field.value = value ?? '';
  };
  field.addEventListener('input', () => {
    const t = field.value.trim().replace(/^#/, '');
    field.setAttribute('aria-invalid', String(!/^[0-9a-f]{0,6}$/i.test(t)));
    if (t.length === 6 && typed()) pick(hexToHsv(typed()!, hsv.h), typed()!);
  });
  field.addEventListener('blur', tidy);
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tidy(); } });

  draw();
  return {
    set(next) {
      value = next;
      if (next) hsv = hexToHsv(next, hsv.h);
      draw();
    },
    preview,
  };
}
