import { bodyOf, type Shape } from './still';
import { dotRendering } from './dot-rendering';
import { enableDotRenderer } from './engine/dot-renderer-registry';
import { matteCatalog } from './dot-catalog-data';
import type { Body } from './engine/body';
import { outlineBody } from './engine/outline/inflate';
import { DOT_EXTRAS, type DotStyle } from './engine/dot-parts';
import { DOT_CLIPS } from './engine/dot-motion';
import { DOT_SHAPES } from './dot-shapes';
import type { MountOptions } from './mount';

export interface DotAppearance extends Partial<Omit<DotStyle, 'depthScale' | 'originalEyes' | 'portraitDye' | 'replaceEyes' | 'replaceGlasses' | 'replaceExtra'>> {
  /** Builder depth from 0 to 1, with a neutral setting of 0.5. Fixed furry portraits retain their depth. */
  depth?: number;
  /** A DOT_SHAPES definition id, e.g. 'dot-rounded-triangle'. */
  shape: string;
  /** CSS body colour, including any DOT_COLOURS swatch. */
  colour?: string;
  texture?: 'Glossy' | 'Fur';
  /** Individual wardrobe changes on top of a named portrait. */
  parts?: AvatarParts;
}

/** The two eared bodies share mounting positions for the headphones and bow tie. */
export function dotExtras(shape: string): readonly DotStyle['extra'][] {
  return shape === 'dot-circle-with-two-ears' || shape === 'dot-rounded-head-with-two-ears'
    ? ['None', 'Headphones', 'Bow tie'] : DOT_EXTRAS;
}

const wardrobeSources = new WeakMap<Body, Body>();
const cache = new WeakMap<Body, Map<string, Body>>();

function styledBody(source: Body, style: DotStyle, wardrobeHost?: Body): Body {
  let styles = cache.get(source);
  if (!styles) {
    styles = new Map();
    cache.set(source, styles);
  }
  const key = JSON.stringify(style);
  let body = styles.get(key);
  if (!body) {
    body = { ...source, dotStyle: style, ...(wardrobeHost ? { wardrobeHost } : {}) };
    if (styles.size >= 32) styles.delete(styles.keys().next().value!);
    styles.set(key, body);
    wardrobeSources.set(body, source);
  }
  return body;
}

export type AvatarParts = Partial<Pick<DotStyle, 'eyes' | 'glasses' | 'extra' | 'extraColour'>>;

/** Fit the builder wardrobe to a built-in body, gallery outline, or imported shape. */
export function avatarParts(wearer: Shape | Body, parts: AvatarParts = {}) {
  enableDotRenderer(dotRendering);
  const custom = typeof wearer === 'object' && 'pieces' in wearer;
  const shape = custom ? wearer.id : wearer;
  const prior = custom ? wearer.dotStyle : undefined;
  const source = custom ? wardrobeSources.get(wearer) ?? wearer.wardrobeHost ?? wearer : bodyOf(shape);
  const eyes = parts.eyes ?? (prior?.originalEyes ? undefined : prior?.eyes);
  const extra = parts.extra ?? prior?.extra;
  if (custom && prior && Object.entries(parts).every(([key, value]) =>
    value === undefined || value === prior[key as keyof AvatarParts] && !(key === 'eyes' && prior.originalEyes))) {
    return { shape, body: wearer };
  }
  const portrait = prior?.character ? DOT_PORTRAITS[prior.character] : prior?.catalogId ? matteRecipes.get(prior.catalogId) : undefined;
  if (portrait && prior) {
    const body = dotAvatar({
      ...portrait, catalogGloss: prior.catalogGloss, tintExtra: prior.tintExtra,
      depth: prior.depthScale === undefined ? undefined : (prior.depthScale - .6) / .8,
      parts: {
        eyes: parts.eyes ?? prior.eyes, glasses: parts.glasses ?? prior.glasses,
        extra: parts.extra ?? prior.extra, extraColour: parts.extraColour ?? prior.extraColour,
      },
    }).body!;
    return { shape, body };
  }
  const definition = DOT_SHAPES.find(item => item.id === source.id);
  const native = definition && bodyOf(definition) === source;
  const style: DotStyle = {
    ...(!native && !eyes ? { originalEyes: true } : {}),
    eyes: native && source.id === 'dot-rounded-head-with-two-ears' ? 'Oval' : eyes ?? 'Oval',
    glasses: parts.glasses ?? prior?.glasses ?? 'None',
    extra: extra && (!native || dotExtras(source.id).includes(extra)) ? extra : 'None',
    extraColour: parts.extraColour ?? prior?.extraColour ?? '#1F1F1F',
  };
  return { shape, body: styledBody(source, style, native ? undefined : source) };
}

/** Options for mount or createLive. Repeated colour and material edits keep the same body and rig. */
export function dotAvatar(
  options: DotAppearance,
): Pick<MountOptions, 'shape' | 'body' | 'color' | 'eyeFill' | 'material' | 'followMost' | 'clips'> {
  const shape = DOT_SHAPES.find((d) => d.id === options.shape);
  if (!shape) throw new RangeError(`Unknown Dot shape: ${options.shape}`);
  enableDotRenderer(dotRendering);
  const source = outlineBody(shape);
  const preset: DotAppearance | undefined = options.character ? DOT_PORTRAITS[options.character] : options.catalogId ? matteRecipes.get(options.catalogId) : undefined;
  const matches = preset && options.shape === preset.shape && options.colour === preset.colour
    && (options.texture ?? 'Glossy') === (preset.texture ?? 'Glossy')
    && (options.eyes ?? 'Oval') === (preset.eyes ?? 'Oval')
    && (options.glasses ?? 'None') === (preset.glasses ?? 'None')
    && (options.extra ?? 'None') === (preset.extra ?? 'None')
    && (options.tintExtra || (options.extraColour ?? '#1F1F1F') === (preset.extraColour ?? '#1F1F1F'));
  const fixedDepth = matches && options.character;
  const depth = fixedDepth || !Number.isFinite(options.depth) ? .5 : Math.max(0, Math.min(1, options.depth!));
  const style: DotStyle = {
    ...(depth === .5 ? {} : { depthScale: .6 + .8 * depth }),
    eyes: shape.id === 'dot-rounded-head-with-two-ears' ? 'Oval' : (options.eyes ?? 'Oval'),
    character: matches ? options.character : undefined,
    ...(matches && preset.colour ? { portraitDye: parseInt(preset.colour.slice(1), 16) } : {}),
    ...(matches && options.tintExtra ? { tintExtra: true } : {}),
    ...(matches && options.catalogId && options.catalogGloss ? { catalogGloss: true } : {}),
    catalogId: matches && !options.character ? options.catalogId : undefined,
    glasses: options.glasses ?? 'None',
    extra: options.extra && dotExtras(shape.id).includes(options.extra) ? options.extra : 'None',
    extraColour: options.extraColour ?? '#1F1F1F',
  };
  if (matches && options.parts) {
    const p = options.parts;
    if (p.eyes && p.eyes !== style.eyes && shape.id !== 'dot-rounded-head-with-two-ears') {
      style.eyes = p.eyes;
      style.replaceEyes = true;
    }
    if (p.glasses && p.glasses !== style.glasses) {
      style.glasses = p.glasses;
      style.replaceGlasses = true;
    }
    if (p.extra && p.extra !== style.extra && dotExtras(shape.id).includes(p.extra)) {
      style.extra = p.extra;
      style.replaceExtra = true;
    }
    if (p.extraColour && p.extraColour !== style.extraColour) {
      style.extraColour = p.extraColour;
      style.tintExtra = true;
    }
  }
  const body = styledBody(source, style);
  return {
    shape,
    body,
    color: options.colour ?? '#00B1FF',
    eyeFill: '#202024',
    material: options.texture === 'Fur' ? 'fluffy' : 'glossy',
    followMost: 1,
    clips: DOT_CLIPS,
  };
}

/** Character recipes observed in the picker. Fixed portraits retain their authored pose and shell finish. */
export const DOT_CHARACTERS = {
  Blossie: { character: 'Blossie', shape: 'dot-blossie', colour: '#FFFFFF', eyes: 'Oval', texture: 'Fur' },
  Alfred: { character: 'Alfred',
    shape: 'dot-rounded-triangle',
    colour: '#FFCC38',
    eyes: 'Sleepy lids',
    glasses: 'Tall oval frames',
    extra: 'Bow tie',
    texture: 'Fur',
  },
  Jojo: { character: 'Jojo', shape: 'dot-heart', colour: '#DD6ADC', eyes: 'Oval', glasses: 'Round sunglasses', texture: 'Fur' },
  Iris: { character: 'Iris',
    shape: 'dot-twelve-scalloped-rosette',
    colour: '#FF8066',
    eyes: 'Round highlights',
    glasses: 'Monocle',
    texture: 'Fur',
  },
  Todd: { character: 'Todd', shape: 'dot-rounded-head-with-two-ears', colour: '#B6D80B', extra: 'Bow tie', texture: 'Fur' },
  Iggy: { character: 'Iggy',
    shape: 'dot-circle-with-two-ears',
    colour: '#FA70AB',
    eyes: 'Swept lids',
    extra: 'Headphones',
    texture: 'Fur',
  },
  Felipe: { character: 'Felipe', shape: 'dot-hexagon', colour: '#4778FF', eyes: 'Oval', extra: 'Beret', texture: 'Fur' },
  Thelma: { character: 'Thelma',
    shape: 'dot-rounded-diamond',
    colour: '#FFDA1B',
    eyes: 'Oval',
    glasses: 'Classic sunglasses',
    extra: 'Bulb',
    extraColour: '#FFDA1B',
    texture: 'Fur',
  },
} as const satisfies Record<string, DotAppearance>;

/** The renderer catalog also has a flower-bodied Felipe and a portrait named Josh. */
export const DOT_PORTRAITS = {
  ...DOT_CHARACTERS,
  'Felipe flower': { ...DOT_CHARACTERS.Felipe, character: 'Felipe flower', shape: 'dot-six-lobed-flower' },
  Josh: { character: 'Josh', shape: 'dot-hexagon', colour: '#00B1FF', eyes: 'Crescent inset',
    glasses: 'Tall oval frames', extra: 'Tuft', texture: 'Fur' },
} as const satisfies Record<string, DotAppearance>;

const matteRecipes = new Map(matteCatalog.map(entry => [entry.id, entry.appearance]));

/** The named renderer collection, in its published order. */
export const DOT_CATALOG: readonly { id: string; name: string; appearance: DotAppearance; surface: 'Fur' | 'Matte' }[] = [
  { id: 'blue_beret', name: 'Felipe', surface: 'Fur', appearance: DOT_PORTRAITS['Felipe flower'] },
  { id: 'alfred', name: 'Alfred', surface: 'Fur', appearance: DOT_PORTRAITS['Alfred'] },
  { id: 'purple_heart', name: 'Jojo', surface: 'Fur', appearance: DOT_PORTRAITS['Jojo'] },
  { id: 'lime_frog', name: 'Todd', surface: 'Fur', appearance: DOT_PORTRAITS['Todd'] },
  { id: 'coral_monocle', name: 'Iris', surface: 'Fur', appearance: DOT_PORTRAITS['Iris'] },
  { id: 'gus', name: 'Thelma', surface: 'Fur', appearance: DOT_PORTRAITS['Thelma'] },
  { id: 'blue_spectacles', name: 'Josh', surface: 'Fur', appearance: DOT_PORTRAITS['Josh'] },
  { id: 'lime_headphones', name: 'Iggy', surface: 'Fur', appearance: DOT_PORTRAITS['Iggy'] },
  ...matteCatalog.map(entry => ({ ...entry, surface: 'Matte' as const })),
];

/** Version of the live studio's curated catalog ordering and seed mapping. */
export const DOT_CURATED_VERSION = 14;

/** Pick the same named Dot as the studio for an unsigned 64-bit seed. */
export function curatedDot(seed: bigint): (typeof DOT_CATALOG)[number] {
  const mask = 0xffffffffffffffffn;
  if (typeof seed !== 'bigint') throw new TypeError('Seed must be a bigint');
  if (seed < 0n || seed > mask) throw new RangeError('Seed must be in [0, 2^64 - 1]');
  // One SplitMix64 output selects an entry in the original catalog order.
  let word = (seed + 0x9e3779b97f4a7c15n) & mask;
  word = ((word ^ (word >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
  word = ((word ^ (word >> 27n)) * 0x94d049bb133111ebn) & mask;
  return DOT_CATALOG[Number((word ^ (word >> 31n)) % BigInt(DOT_CATALOG.length))];
}
