// The studio's plain parts, apart from the page so they can be tested: the prompts sent to a model, the agent
// apps a prompt opens in, reading what a model sends back, share links, and a still picture to download.
// The flow (describe it, send the prompt, import the JSON, share a link) is open-bot-avatar's site's, by Dominik
// Scholz and its contributors (MIT; see THIRD_PARTY_NOTICES.md).

import {
  avatarParts, BOT_COLOURS, bodyOf, bounds, coatMesh, drawAvatar, rotation, silhouette, type AvatarParts, type Body, stillState, validateAvatar, type AvatarDefinition, type Material, type Shape,
} from '@blot/avatar';

const front = rotation({ yaw: 0, pitch: 0, roll: 0 });
interface BodyFrame { x: number; y: number; span: number }
const bodyFrames = new WeakMap<Body, BodyFrame>();

/** Centre and longest axis of the bare, front-facing shell at a one-pixel mount size. */
export function studioBodyFrame(wearer: Body): BodyFrame {
  const body = wearer.wardrobeHost ?? wearer;
  const cached = bodyFrames.get(body);
  if (cached) return cached;
  let x0: number, y0: number, x1: number, y1: number;
  if (body.dotStyle) {
    const mesh = coatMesh(body);
    // Portraits have their own resting head rotation, also used by the material pass.
    const state = stillState(body.id, 100);
    const r = drawAvatar(body, '#fff', state, 100, { coat: true }).coat!.rotation;
    const v = mesh.vertices;
    x0 = y0 = Infinity;
    x1 = y1 = -Infinity;
    for (let i = 0; i < v.length; i += 6) {
      const x = r[0]*v[i] + r[1]*v[i+1] + r[2]*v[i+2];
      const y = -(r[3]*v[i] + r[4]*v[i+1] + r[5]*v[i+2]);
      x0 = Math.min(x0,x); x1 = Math.max(x1,x);
      y0 = Math.min(y0,y); y1 = Math.max(y1,y);
    }
  } else {
    [x0,y0,x1,y1] = bounds(silhouette(body, front, 64));
  }
  const frame = { x: (x0+x1)/4, y: (y0+y1)/4, span: Math.max(x1-x0,y1-y0)/2 };
  bodyFrames.set(body,frame);
  return frame;
}

// ---- Prompts

/** A prompt in two forms: `full` carries the whole design prompt, for any chat; `linked` points at the hosted copy, short enough for an app's link. */
export interface Brief { full: string; linked: string }

function brief(prompt: string, url: string, task: string[]): Brief {
  return {
    full: [prompt.trim(), '', '---', '', ...task].join('\n'),
    linked: [`Fetch the blot avatar design prompt at ${url} and follow it exactly: it sets the JSON format, the rules and the proportions.`, '', ...task].join('\n'),
  };
}

/** Ask for one avatar from a description, in the person's own words. */
export const designBrief = (prompt: string, url: string, description: string): Brief =>
  brief(prompt, url, ['Make one avatar definition from this description:', '', description.trim(), '', 'Reply with only the JSON definition.']);

/** Ask for a definition that was refused to be put right. */
export const repairBrief = (prompt: string, url: string, source: string, errors: string[]): Brief =>
  brief(prompt, url, [
    'This avatar definition was refused. Put it right and keep the same character.', '',
    'What was wrong:', ...errors.map((e) => `- ${e}`), '',
    'The definition:', source.trim(), '',
    'Reply with only the corrected JSON definition.',
  ]);

// ---- Agent apps

/** encodeURIComponent, not URLSearchParams: some apps read `+` as a plus sign. */
export const deepLink = (base: string, params: Record<string, string>): string =>
  `${base}?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;

/** Desktop agent apps a prompt opens in. A link fills the prompt in and sends nothing: it is read there first. */
export const AGENTS = {
  claude: { label: 'claude code', link: (p: string) => deepLink('claude://code/new', { q: p }) },
  codex: { label: 'codex', link: (p: string) => deepLink('codex://threads/new', { prompt: p }) },
  cursor: { label: 'cursor', link: (p: string) => deepLink('cursor://anysphere.cursor-deeplink/prompt', { text: p }) },
  t3code: { label: 't3 code', link: (p: string) => deepLink('t3code://new', { prompt: p }) },
} as const;
export type Agent = keyof typeof AGENTS;
export const isAgent = (v: unknown): v is Agent => typeof v === 'string' && Object.hasOwn(AGENTS, v);

// ---- Import

export type Imported =
  | { ok: true; values: AvatarDefinition[]; notes: string[] }
  | { ok: false; errors: string[]; hints: string[]; notes: string[]; /** The text that was read as JSON, for a repair prompt; empty when there was none. */ source: string };

/** From the bracket at `i`, where the bracket that closes it is (brackets inside strings left alone), or the end of the text when none does. */
function spanEnd(t: string, i: number): number {
  let depth = 0, inString = false, escaped = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return k + 1;
  }
  return t.length;
}

const parses = (s: string): boolean => { try { JSON.parse(s); return true; } catch { return false; } };

/**
 * The JSON in a model's reply. Every code fence that holds JSON is read (two or more make one list). Without one,
 * it is the first bracketed stretch that is JSON, whatever brackets the words round it have; and when none is,
 * the longest bracketed stretch, so what is wrong with it can be said (cut off, a stray comma).
 */
export function extractJson(text: string): { json: string; notes: string[] } {
  const t = text.trim().replace(/^﻿/, '');
  const fences = [...t.matchAll(/```[\w-]*[^\S\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim()).filter((f) => /^[[{]/.test(f));
  if (fences.length) {
    const outside = t.replace(/```[\s\S]*?```/g, '').trim() !== '';
    const notes = outside ? ['read the JSON inside the code fence.'] : [];
    if (fences.length === 1) return { json: fences[0], notes };
    // One fence that is not JSON is the one to say what is wrong with.
    const bad = fences.find((f) => !parses(f));
    if (bad) return { json: bad, notes };
    return { json: JSON.stringify(fences.flatMap((f) => [JSON.parse(f)].flat())), notes: [`read the JSON in ${fences.length} code fences.`] };
  }
  let longest = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{' && t[i] !== '[') continue;
    const end = spanEnd(t, i), span = t.slice(i, end);
    if (parses(span)) return { json: span, notes: span === t ? [] : ['left out the words round the JSON.'] };
    if (span.length > longest.length) longest = span;
    // Not inside it: a definition that is cut off or has a stray comma holds a body that is JSON by itself.
    i = end - 1;
  }
  return { json: longest || t, notes: longest && longest !== t ? ['left out the words round the JSON.'] : [] };
}

function syntaxHints(json: string): string[] {
  const hints: string[] = [];
  if (/,\s*[}\]]/.test(json)) hints.push('take out the comma before a } or ].');
  if (/'[^']*'\s*:/.test(json)) hints.push('JSON wants double quotes round keys and strings.');
  if (/\/\/|\/\*/.test(json)) hints.push('JSON has no comments: take them out.');
  if (!/[}\]]$/.test(json.trim())) hints.push('the reply looks cut off: ask for the whole definition again.');
  return hints.length ? hints : ['paste the reply just as the model sent it.'];
}

/** What was pasted or dropped: one definition or a list of them, each checked by validateAvatar. */
export function parseImport(text: string): Imported {
  if (!text.trim()) return { ok: false, errors: ['nothing to add yet.'], hints: ['paste the JSON the model sent back, or drop a .json file here.'], notes: [], source: '' };
  const { json, notes } = extractJson(text);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    return { ok: false, errors: [`that is not JSON: ${err instanceof Error ? err.message : String(err)}`], hints: syntaxHints(json), notes, source: json };
  }
  const items = Array.isArray(data) ? data : [data];
  if (!items.length) return { ok: false, errors: ['the list is empty.'], hints: ['paste one definition, or a list of them.'], notes, source: json };
  const values: AvatarDefinition[] = [], errors: string[] = [];
  items.forEach((item, i) => {
    const r = validateAvatar(item);
    if (r.ok) values.push(r.value);
    else errors.push(...r.errors.map((e) => (items.length > 1 ? `item ${i + 1}: ${e}` : e)));
  });
  if (errors.length) {
    return {
      ok: false, errors, notes, source: json,
      hints: ['copy the repair prompt and send it to the same chat: it carries these errors.', 'include one body path, the eyes and any wardrobe rules. choose colour and motion in the studio.'],
    };
  }
  const kept = once(values);
  if (kept.length < values.length) notes.push('two of them had the same id: the later one is kept.');
  if (kept.length > 1) notes.push(`added ${kept.length} definitions.`);
  return { ok: true, values: kept, notes };
}

/** One definition per id, the later one taking the earlier one's place. */
const once = (list: AvatarDefinition[]): AvatarDefinition[] => [...new Map(list.map((d) => [d.id, d])).values()];

/** Definitions kept in this browser, checked again: any that no longer pass are dropped, and one per id is kept. */
export const reviveYours = (raw: unknown): AvatarDefinition[] =>
  Array.isArray(raw) ? once(raw.flatMap((d) => { const r = validateAvatar(d); return r.ok ? [r.value] : []; })) : [];

/** Where a definition goes among yours: its own id, or (when one of yours already has that id and is not the same) the first free `id-2`, `id-3`. */
export function freeId(yours: readonly AvatarDefinition[], d: AvatarDefinition): AvatarDefinition {
  const same = (a: AvatarDefinition) => JSON.stringify(a) === JSON.stringify(d);
  const taken = (id: string) => yours.some((y) => y.id === id && !same({ ...y, id: d.id }));
  if (!taken(d.id)) return d;
  for (let n = 2; ; n++) {
    const id = `${d.id.slice(0, 37).replace(/-+$/, '')}-${n}`;
    const there = yours.find((y) => y.id === id);
    if (!there || same({ ...there, id: d.id })) return { ...d, id };
  }
}

// ---- Share links
//
//   ?avatar=heart         one of blot's bodies, or one of yours, by its id
//   ?gallery=cat          a gallery avatar by its id (the gallery has a cloud and a star, and so do the bodies)
//   &color=blue           one of blot's colours by name, or a hex colour with or without #
//   &doing=working        what it is doing: idle, thinking, working, waiting, speaking or sleeping
//   &def=…                a whole definition as base64url JSON (or JSON as it is): checked like an import, then added to yours
//   &material=fluffy      its finish (flat, glossy or fluffy); a link without one leaves the finish the visitor chose

export interface Shared { avatar?: string; gallery?: string; definition?: AvatarDefinition; colour?: string; doing?: string; material?: Material; problem?: string }

/** A finish named in a link or kept in a browser. Anything else is undefined. */
export function readMaterial(v: string | null | undefined): Material | undefined {
  const t = v?.trim().toLowerCase();
  return t === 'flat' || t === 'glossy' || t === 'fluffy' ? t : undefined;
}

/** A definition as compact JSON in base64url, UTF-8 safe, without padding. */
export function encodeDefinition(d: AvatarDefinition): string {
  let bin = '';
  for (const b of new TextEncoder().encode(JSON.stringify(d))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeDefinition(value: string): AvatarDefinition | string {
  let json = value.trim();
  if (!json.startsWith('{')) {
    try {
      json = new TextDecoder().decode(Uint8Array.from(atob(json.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
    } catch {
      return 'the link\'s def is neither base64url nor JSON.';
    }
  }
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return 'the link\'s def is not JSON.'; }
  const r = validateAvatar(raw);
  return r.ok ? r.value : `the link's def is not an avatar: ${r.errors.join('; ')}`;
}

/** A colour named in a link: one of blot's by name, or hex. Anything else is undefined. */
export function readColour(v: string | null): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const named = BOT_COLOURS.find(([, name]) => name.toLowerCase() === t.toLowerCase());
  if (named) return named[0];
  const hex = t.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toUpperCase()}`;
  return undefined;
}

/** What a link's query asks for. Anything missing or wrong is left out (and a bad def is said in `problem`). */
export function readShare(search: string, doings: readonly string[]): Shared {
  const q = new URLSearchParams(search), out: Shared = {};
  const def = q.get('def');
  if (def) {
    const d = decodeDefinition(def);
    if (typeof d === 'string') out.problem = d; else out.definition = d;
  }
  const avatar = q.get('avatar')?.trim(), gallery = q.get('gallery')?.trim();
  if (avatar) out.avatar = avatar;
  if (gallery) out.gallery = gallery;
  const colour = readColour(q.get('color'));
  if (colour) out.colour = colour;
  const doing = q.get('doing')?.trim().toLowerCase();
  if (doing && doings.includes(doing)) out.doing = doing;
  const material = readMaterial(q.get('material'));
  if (material) out.material = material;
  return out;
}

/** A link to this avatar as it is now. A body or a gallery avatar goes by id, one of yours with its definition; its own colour, idle and flat are left out. */
export function shareLink(base: string, pick: { id: string; kind: 'body' | 'gallery' | 'yours'; definition?: AvatarDefinition }, colour: string, own: string, doing: string, material: Material = 'flat'): string {
  const q = new URLSearchParams();
  if (pick.kind === 'yours' && pick.definition) q.set('def', encodeDefinition(pick.definition));
  else q.set(pick.kind === 'gallery' ? 'gallery' : 'avatar', pick.id);
  if (colour.toUpperCase() !== own.toUpperCase()) {
    const named = BOT_COLOURS.find(([hex]) => hex.toUpperCase() === colour.toUpperCase());
    q.set('color', named ? named[1].toLowerCase() : colour.replace(/^#/, '').toUpperCase());
  }
  if (doing !== 'idle') q.set('doing', doing);
  if (material !== 'flat') q.set('material', material);
  return `${base}?${q}`;
}

// ---- A still to download

interface SvgPath { d: string; fill: string }

/** A square view of the visible paths, including a little breathing room around their edges. */
function croppedSvg(paths: SvgPath[], size: number, fallback: string): string {
  const xy = paths.map(p => p.d).join(' ').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i]); x1 = Math.max(x1, xy[i]); y0 = Math.min(y0, xy[i + 1]); y1 = Math.max(y1, xy[i + 1]);
  }
  const side = Math.max(x1 - x0, y1 - y0) * 1.12, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const box = xy.length ? [cx - side / 2, cy - side / 2, side, side].map(v => Math.round(v * 100) / 100).join(' ') : fallback;
  const content = paths.filter(p => p.d).map(p => `<path d="${p.d}" fill="${p.fill}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${box}">${content}</svg>\n`;
}

/** The avatar as a standalone SVG still, including its selected wardrobe. */
export function stillSvg(shape: Shape, colour: string, size = 512, body = bodyOf(shape), eyeFill?: string): string {
  const d = drawAvatar(body, colour, stillState(shape, size), size);
  const layers = d.layers ?? [];
  return croppedSvg([
    ...layers.filter(l => !l.front), { d: d.body, fill: d.fill }, ...layers.filter(l => l.front && !l.overEyes),
    ...d.eyes.map(path => ({ d: path, fill: eyeFill ?? d.eyeFill })), ...layers.filter(l => l.overEyes),
  ], size, d.viewBox);
}

/** Front-facing eye geometry on a common swatch, including the inserts and catchlights. */
export function eyePreview(eyes?: AvatarParts['eyes']): string {
  const shape = eyes ? 'dot-circle' : 'blob';
  const body = eyes ? avatarParts(shape, { eyes }).body : bodyOf(shape);
  const d = drawAvatar(body, '#ffffff', stillState(shape, 16), 128);
  const layers = (d.layers ?? []).filter(layer => /^(left|right)(-|$)/.test(layer.id));
  return croppedSvg([...layers, ...d.eyes.map(path => ({ d: path, fill: '#202024' }))], 54, d.viewBox);
}
