import {
  DOT_CHARACTERS,
  DOT_COLOURS,
  DOT_EYES,
  DOT_EXTRAS,
  DOT_EXTRA_COLOURS,
  DOT_GLASSES,
  DOT_SHAPES,
  dotAvatar,
  mount,
  type DotAppearance,
} from '@blot/avatar';

export function dotPicker(host: HTMLElement, controls: HTMLElement): void {
  const appearance: DotAppearance = {
    shape: 'dot-rounded-triangle',
    colour: '#00B1FF',
    eyes: 'Sleepy lids',
    glasses: 'None',
    extra: 'Crown',
    extraColour: '#FFCC38',
    texture: 'Fur',
  };
  const avatar = mount(host, {
    ...dotAvatar(appearance),
    size: 144,
    follow: true,
    followIn: host.parentElement,
  });
  const character = document.createElement('select'),
    characterLabel = document.createElement('label');
  character.setAttribute('aria-label', 'Character');
  character.add(new Option('Custom', ''));
  for (const name of Object.keys(DOT_CHARACTERS)) character.add(new Option(name, name));
  characterLabel.append('Character', character);
  controls.appendChild(characterLabel);
  const fields = new Map<keyof DotAppearance, HTMLSelectElement>();
  function choice<K extends keyof DotAppearance>(
    label: string,
    key: K,
    values: readonly (readonly [NonNullable<DotAppearance[K]>, string])[],
  ) {
    const field = document.createElement('label'),
      select = document.createElement('select');
    field.append(label, select);
    select.setAttribute('aria-label', label);
    for (const [value, name] of values) select.add(new Option(name, value));
    fields.set(key, select);
    select.value = appearance[key]!;
    select.addEventListener('change', () => {
      appearance[key] = values[select.selectedIndex][0];
      character.value = '';
      sync();
    });
    controls.appendChild(field);
    return select;
  }
  const names = <T extends string>(items: readonly T[]) => items.map((item) => [item, item] as const);
  choice(
    'Shape',
    'shape',
    DOT_SHAPES.map((d) => [d.id, d.name]),
  );
  choice('Body colour', 'colour', DOT_COLOURS);
  choice('Texture', 'texture', names(['Glossy', 'Fur'] as const));
  choice('Eyes', 'eyes', names(DOT_EYES));
  choice('Glasses', 'glasses', names(DOT_GLASSES));
  choice('Extra', 'extra', names(DOT_EXTRAS));
  const colour = choice('Extra colour', 'extraColour', DOT_EXTRA_COLOURS);
  function sync() {
    for (const [key, field] of fields) field.value = appearance[key]!;
    fields.get('eyes')!.parentElement!.hidden = appearance.shape === 'dot-rounded-head-with-two-ears';
    colour.parentElement!.hidden = appearance.extra === 'None';
    avatar.update(dotAvatar(appearance));
  }
  character.addEventListener('change', () => {
    const preset = DOT_CHARACTERS[character.value as keyof typeof DOT_CHARACTERS];
    if (!preset) return;
    Object.assign(
      appearance,
      { eyes: 'Oval', glasses: 'None', extra: 'None', extraColour: '#1F1F1F' },
      preset,
    );
    sync();
  });
}

dotPicker(document.querySelector('#dot')!, document.querySelector('#dot-controls')!);
