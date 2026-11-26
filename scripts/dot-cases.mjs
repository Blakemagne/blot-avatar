import { DOT_CATALOG, DOT_SHAPES, DOT_COLOURS, DOT_EYES, DOT_GLASSES, DOT_EXTRAS, DOT_EXTRA_COLOURS } from '../src/index.ts';

const key = value => value.toLowerCase().replaceAll(' ', '_');
const names = {
  'Rounded head with two ears': 'rounded_head_two_ears', 'Circle with two ears': 'circle_two_ears',
  Hexagon: 'rounded_cube', 'Round highlights': 'double_highlights', 'Bow tie': 'bow',
  Bulb: 'orb', Tuft: 'three_lobe',
};
const id = value => names[value] ?? key(value);
export const catalog = Object.fromEntries(DOT_CATALOG.map(({ id }) => ['catalog-' + id, { catalog: id }]));
export const cases = { base: {}, fur: { texture: 'Fur' } };
for (const shape of DOT_SHAPES) {
  if (shape.name !== 'Rounded triangle') cases['shape-' + id(shape.name)] = { shape: shape.id };
}
for (const [colour, name] of DOT_COLOURS) {
  if (name !== 'Cyan') cases['color-' + id(name)] = { colour };
}
for (const [category, choices, base] of [['eyes', DOT_EYES, 'Oval'], ['glasses', DOT_GLASSES, 'None'], ['extra', DOT_EXTRAS, 'None']]) {
  for (const value of choices) if (value !== base) cases[category + '-' + id(value)] = { [category]: value };
}
for (const [id, extra] of [['orb', 'Bulb'], ['crown', 'Crown']]) {
  for (const [extraColour, label] of DOT_EXTRA_COLOURS) cases['tint-' + id + '-' + key(label)] = { extra, extraColour };
}
for (const [name, preset] of Object.entries({blossie: 'Blossie', studio_felipe_hexagon: 'Felipe', alfred: 'Alfred', gus: 'Thelma', lime_frog: 'Todd', lime_headphones: 'Iggy', purple_heart: 'Jojo', coral_monocle: 'Iris'})) {
  cases['preset-' + name] = { preset };
}
cases['linked-character'] = { texture: 'Fur', eyes: 'Sleepy lids', extra: 'Crown', extraColour: '#FFCC38' };
export const turns = {
  'depth-flat': { turn: [1.05, .16, 0], depth: 0 },
  'depth-deep': { turn: [1.05, .16, 0], depth: 1 },
  'depth-mount': { turn: [-.67, .19, .04], depth: .2, extra: 'Crown', eyes: 'Sleepy lids' },
  'depth-fur': { turn: [.56, -.25, 0], depth: .8, texture: 'Fur' },
  'depth-matte': { turn: [-.86, .1, .07], depth: .15, catalog: 'matisse' },
  'depth-portrait': { turn: [-.68, .11, 0], depth: 0, preset: 'Iris' },
  'turn-catalog-matisse': { catalog: 'matisse', turn: [.37, -.14, .06] },
  'turn-catalog-zadie': { catalog: 'zadie', turn: [-.43, .11, 0] },
  'turn-catalog-blue_spectacles': { catalog: 'blue_spectacles', turn: [.31, -.16, 0] },
  "turn-base": {
    "turn": [
      0.46,
      0.12,
      -0.06
    ]
  },
  "turn-heart": {
    "shape": "dot-heart",
    "turn": [
      -0.42,
      -0.18,
      0.16
    ]
  },
  "turn-hexagon": {
    "shape": "dot-hexagon",
    "turn": [
      0.78,
      0.24,
      0
    ]
  },
  "turn-ears": {
    "shape": "dot-circle-with-two-ears",
    "turn": [
      -0.66,
      0.18,
      -0.2
    ]
  },
  "turn-frog": {
    "shape": "dot-rounded-head-with-two-ears",
    "turn": [
      0.44,
      -0.13,
      0
    ]
  },
  "turn-sparkle": {
    "eyes": "Sparkle capsules",
    "turn": [
      0.42,
      -0.19,
      0.09
    ]
  },
  "turn-monocle": {
    "glasses": "Monocle",
    "turn": [
      -0.48,
      0.2,
      0
    ]
  },
  "turn-sunglasses": {
    "glasses": "Classic sunglasses",
    "turn": [
      0.65,
      -0.08,
      0
    ]
  },
  "turn-crown": {
    "extra": "Crown",
    "turn": [
      -0.47,
      0.21,
      0.07
    ]
  },
  "turn-beanie": {
    "extra": "Beanie",
    "turn": [
      0.58,
      -0.3,
      0
    ]
  },
  "turn-headphones": {
    "shape": "dot-circle-with-two-ears",
    "extra": "Headphones",
    "turn": [
      0.53,
      0.16,
      0.1
    ]
  },
  "turn-beret": {
    "extra": "Beret",
    "turn": [
      -0.66,
      -0.18,
      0
    ]
  },
  "turn-fur": {
    "texture": "Fur",
    "turn": [
      0.52,
      -0.12,
      0
    ]
  },
  "turn-iris": {
    "preset": "Iris",
    "turn": [
      0.38,
      -0.17,
      0
    ]
  },
  "turn-iggy": {
    "preset": "Iggy",
    "turn": [
      -0.47,
      0.12,
      0
    ]
  }
};

// Full profiles expose the back of the head, ear attachments and eye depth.
for (const shape of DOT_SHAPES) {
  for (const [view, turn] of [
    ['side', [Math.PI/2, 0, 0]], ['top', [0, -Math.PI/2, 0]], ['oblique', [.82, -.42, .07]],
  ]) turns['profile-' + id(shape.name) + '-' + view] = { shape: shape.id, turn };
}

export const floors = {
  base: {}, linked: cases['linked-character'], iris: { preset: 'Iris' }, tavi: { catalog: 'matisse' },
  ...Object.fromEntries(DOT_SHAPES.filter(s => s.name !== 'Rounded triangle').map(s => [id(s.name), { shape: s.id }])),
};

// The studio refits these headpieces when the wearer puts on glasses.
for (const [name, shape, extra, glasses, turn] of [
  ['wardrobe-blossie-beanie', 'dot-blossie', 'Beanie', 'Round sunglasses', [-0.28, -0.16, 0]],
  ['wardrobe-six_lobed_flower-hat', 'dot-six-lobed-flower', 'Hat', 'Tall oval frames', [0.327, 0, 0.05]],
  ['wardrobe-circle-beanie', 'dot-circle', 'Beanie', 'Tall oval frames', [-0.374, 0.16, 0]],
  ['wardrobe-twelve_scalloped_rosette-beanie', 'dot-twelve-scalloped-rosette', 'Beanie', 'Tall oval frames', [0.421, -0.16, 0.05]],
  ['wardrobe-heart-hat', 'dot-heart', 'Hat', 'Tall oval frames', [-0.468, 0, 0]],
  ['wardrobe-four_lobed_butterfly-beanie', 'dot-four-lobed-butterfly', 'Beanie', 'Classic sunglasses', [0.515, 0.16, 0.05]],
  ['wardrobe-rounded_triangle-beanie', 'dot-rounded-triangle', 'Beanie', 'Tall oval frames', [-0.28, -0.16, 0]],
  ['wardrobe-rounded_triangle-beret', 'dot-rounded-triangle', 'Beret', 'Classic sunglasses', [0.327, 0, 0.05]],
  ['wardrobe-capsule-beret', 'dot-capsule', 'Beret', 'Monocle', [-0.374, 0.16, 0]],
  ['wardrobe-rounded_diamond-beret', 'dot-rounded-diamond', 'Beret', 'Classic sunglasses', [0.421, -0.16, 0.05]],
  ['wardrobe-six_lobed_flower-beanie', 'dot-six-lobed-flower', 'Beanie', 'Tall oval frames', [-0.468, 0, 0]],
  ['wardrobe-heart-beanie', 'dot-heart', 'Beanie', 'Tall oval frames', [0.515, 0.16, 0.05]],
]) {
  cases[name] = { shape, extra, glasses };
  turns['turn-' + name] = { ...cases[name], turn };
}
