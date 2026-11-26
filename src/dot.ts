import type { Body } from './engine/body';
import { outlineBody } from './engine/outline/inflate';
import type { DotStyle } from './engine/dot-parts';
import { DOT_SHAPES } from './dot-shapes';
import type { MountOptions } from './mount';

export interface DotAppearance extends Partial<DotStyle> {
  /** A DOT_SHAPES definition id, e.g. 'dot-rounded-triangle'. */
  shape: string;
  /** CSS body colour, including any DOT_COLOURS swatch. */
  colour?: string;
  texture?: 'Glossy' | 'Fur';
}

const cache = new WeakMap<Body, Map<string, Body>>();

/** Options for mount or createLive. Repeated colour and material edits keep the same body and rig. */
export function dotAvatar(
  options: DotAppearance,
): Pick<MountOptions, 'shape' | 'body' | 'color' | 'eyeFill' | 'material' | 'followMost'> {
  const shape = DOT_SHAPES.find((d) => d.id === options.shape);
  if (!shape) throw new RangeError(`Unknown Dot shape: ${options.shape}`);
  const source = outlineBody(shape);
  const style: DotStyle = {
    eyes: shape.id === 'dot-rounded-head-with-two-ears' ? 'Oval' : (options.eyes ?? 'Oval'),
    glasses: options.glasses ?? 'None',
    extra: options.extra ?? 'None',
    extraColour: options.extraColour ?? '#1F1F1F',
  };
  let styles = cache.get(source);
  if (!styles) {
    styles = new Map();
    cache.set(source, styles);
  }
  const key = JSON.stringify(style);
  let body = styles.get(key);
  if (!body) {
    body = { ...source, dotStyle: style };
    if (styles.size >= 32) styles.delete(styles.keys().next().value!);
    styles.set(key, body);
  }
  return {
    shape,
    body,
    color: options.colour ?? '#00B1FF',
    eyeFill: '#202024',
    material: options.texture === 'Fur' ? 'fluffy' : 'glossy',
    followMost: 0.12,
  };
}

/** Character recipes observed in the picker. Preset-only tints use the closest visible swatch. */
export const DOT_CHARACTERS = {
  Blossie: { shape: 'dot-blossie', colour: '#FFFFFF', eyes: 'Oval', texture: 'Glossy' },
  Alfred: {
    shape: 'dot-rounded-triangle',
    colour: '#FFCC38',
    eyes: 'Sleepy lids',
    glasses: 'Tall oval frames',
    extra: 'Bow tie',
    texture: 'Fur',
  },
  Jojo: { shape: 'dot-heart', colour: '#DD6ADC', eyes: 'Oval', glasses: 'Round sunglasses', texture: 'Fur' },
  Iris: {
    shape: 'dot-twelve-scalloped-rosette',
    colour: '#FF8066',
    eyes: 'Round highlights',
    glasses: 'Monocle',
    texture: 'Fur',
  },
  Todd: { shape: 'dot-rounded-head-with-two-ears', colour: '#B6D80B', extra: 'Bow tie', texture: 'Fur' },
  Iggy: {
    shape: 'dot-circle-with-two-ears',
    colour: '#FA70AB',
    eyes: 'Swept lids',
    extra: 'Headphones',
    texture: 'Fur',
  },
  Felipe: { shape: 'dot-hexagon', colour: '#4778FF', eyes: 'Oval', extra: 'Beret', texture: 'Fur' },
  Thelma: {
    shape: 'dot-rounded-diamond',
    colour: '#FFCC38',
    eyes: 'Oval',
    glasses: 'Classic sunglasses',
    extra: 'Bulb',
    extraColour: '#FFCC38',
    texture: 'Fur',
  },
} as const satisfies Record<string, DotAppearance>;
