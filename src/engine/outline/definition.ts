// An avatar definition: one SVG path in a 0 0 100 100 box and where the eyes sit. Geometry only; the engine
// adds the volume, the colour, the face and the motion. The format and its rules are open-bot-avatar's
// (Dominik Scholz, MIT; see THIRD_PARTY_NOTICES.md), so a definition made for it is one for this engine too.

import { bounds, filledArea, flattenPath, isInside, parsePath, PathError, serializePath, type Point } from './path';

export interface AvatarEyes {
  /** The middle of the pair, box units (y down). */
  x: number;
  y: number;
  /** Middle to middle. */
  spacing: number;
  /** 1: each eye is about 4 units wide and 11 tall. */
  scale: number;
}

export interface AvatarDefinition {
  version: 1;
  /** A lowercase slug, such as "watering-can". */
  id: string;
  /** A short name to show. */
  name: string;
  /** One filled path, nonzero fill; a hole winds the other way round from the outline it cuts. */
  body: { path: string };
  eyes: AvatarEyes;
}

export type ValidationResult = { ok: true; value: AvatarDefinition } | { ok: false; errors: string[] };

/** One eye at scale 1, box units. */
export const EYE_W = 4, EYE_H = 11;
/** Where a body may reach; the rules ask for 8..92 and refuse past these. */
export const BODY_MIN = 6, BODY_MAX = 94;
const EYE_MARGIN = 1.2;
const TOP_KEYS = ['version', 'id', 'name', 'body', 'eyes'];
const EYE_KEYS = ['x', 'y', 'spacing', 'scale'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Points round one eye's pill grown by `margin`, and its middle. */
function pill(cx: number, cy: number, scale: number, margin: number): Point[] {
  const hw = (EYE_W * scale) / 2 + margin, hh = (EYE_H * scale) / 2 + margin, straight = Math.max(0, hh - hw);
  const pts: Point[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * hw, cy + Math.sin(a) * hw + Math.sign(Math.sin(a)) * straight]);
  }
  for (const f of [-0.5, 0, 0.5]) pts.push([cx - hw, cy + f * straight], [cx + hw, cy + f * straight]);
  pts.push([cx, cy]);
  return pts;
}

/** The two eyes' middles. */
export const eyeCentres = (e: AvatarEyes): [Point, Point] => [[e.x - e.spacing / 2, e.y], [e.x + e.spacing / 2, e.y]];

/** The first point of either eye (grown by `margin`, moved by dx, dy) that is off the body, or null when both are on it. */
export function eyesOff(polys: Point[][], eyes: AvatarEyes, margin: number, dx = 0, dy = 0): Point | null {
  for (const [cx, cy] of eyeCentres(eyes)) for (const p of pill(cx + dx, cy + dy, eyes.scale, margin)) if (!isInside(polys, p[0], p[1])) return p;
  return null;
}

/**
 * Check a definition you did not write before drawing it: `{ ok: true, value }` with the path re-written from
 * its numbers, or `{ ok: false, errors }`, each error a sentence a person or a model can act on.
 */
export function validateAvatar(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['definition must be a JSON object'] };
  for (const k of Object.keys(input)) if (!TOP_KEYS.includes(k)) errors.push(`unknown field "${k}" (allowed: ${TOP_KEYS.join(', ')})`);
  if (input.version !== 1) errors.push('version must be 1');
  const id = input.id;
  if (typeof id !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(id)) errors.push('id must be a lowercase slug of 1-40 chars [a-z0-9-]');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  // (U+2028 and U+2029 end a line in JavaScript, so a name in a comment of the code a page shows could become code.)
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/.test(name)) errors.push('name must be 1-40 printable characters without < or >');

  let path: string | null = null;
  if (!isRecord(input.body)) errors.push('body must be an object { "path": "..." }');
  else {
    for (const k of Object.keys(input.body)) if (k !== 'path') errors.push(`unknown field "body.${k}" (only "path" is allowed)`);
    if (typeof input.body.path !== 'string') errors.push('body.path must be a string');
    else path = input.body.path;
  }

  let eyes: AvatarEyes | null = null;
  if (!isRecord(input.eyes)) errors.push('eyes must be an object { x, y, spacing, scale }');
  else {
    const e = input.eyes;
    for (const k of Object.keys(e)) if (!EYE_KEYS.includes(k)) errors.push(`unknown field "eyes.${k}" (allowed: ${EYE_KEYS.join(', ')})`);
    const bad = EYE_KEYS.filter((k) => !num(e[k]));
    if (bad.length) errors.push(`eyes.${bad.join(', eyes.')} must be finite numbers`);
    else {
      eyes = { x: e.x as number, y: e.y as number, spacing: e.spacing as number, scale: e.scale as number };
      if (eyes.scale < 0.6 || eyes.scale > 1.8) errors.push(`eyes.scale ${eyes.scale} out of range 0.6..1.8`);
      const least = EYE_W * eyes.scale * 1.75;
      if (eyes.spacing < least || eyes.spacing > 40) errors.push(`eyes.spacing ${eyes.spacing} out of range ${r1(least)}..40 for scale ${eyes.scale}`);
    }
  }

  let normalized = '', polys: Point[][] | null = null;
  if (path !== null) {
    try {
      normalized = serializePath(parsePath(path));
      polys = flattenPath(parsePath(normalized));
      if (!polys.length) errors.push('body.path: it encloses nothing');
    } catch (err) {
      if (err instanceof PathError) errors.push(`body.path: ${err.message}`);
      else throw err;
    }
  }

  if (polys?.length) {
    const b = bounds(polys), out: string[] = [];
    if (b.minX < BODY_MIN) out.push(`left edge x=${r1(b.minX)}`);
    if (b.minY < BODY_MIN) out.push(`top edge y=${r1(b.minY)}`);
    if (b.maxX > BODY_MAX) out.push(`right edge x=${r1(b.maxX)}`);
    if (b.maxY > BODY_MAX) out.push(`bottom edge y=${r1(b.maxY)}`);
    if (out.length) errors.push(`body.path leaves the safe area (${out.join(', ')}); keep geometry within 8..92`);
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    if (Math.max(w, h) < 40 || Math.min(w, h) < 14) errors.push(`body is too small (${r1(w)}x${r1(h)}); use at least 40 units on the long side and 14 on the short side`);
    const area = filledArea(polys, b);
    if (area < 600) errors.push(`body fill area ${area} is too thin to carry eyes; must be at least 600 units²`);
    if (eyes) {
      const miss = eyesOff(polys, eyes, EYE_MARGIN);
      if (miss) errors.push(`eyes must sit inside the body with ${EYE_MARGIN} units margin; point (${r1(miss[0])}, ${r1(miss[1])}) is outside or in a hole. Move eyes.x/y toward the widest solid area, reduce spacing or scale.`);
    }
  }

  if (errors.length || !eyes) return { ok: false, errors };
  return { ok: true, value: { version: 1, id: id as string, name, body: { path: normalized }, eyes: { ...eyes } } };
}
