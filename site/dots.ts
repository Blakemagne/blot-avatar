import {
  DOT_CHARACTERS,
  DOT_CATALOG,
  DOT_COLOURS,
  DOT_EYES,
  DOT_EXTRAS,
  DOT_EXTRA_COLOURS,
  DOT_GLASSES,
  DOT_MOTIONS,
  dotExtras,
  DOT_SHAPES,
  dotAvatar,
  dotStageLayout,
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
  const camera = host.parentElement!;
  const ground = camera.querySelector<HTMLElement>('.dot-ground')!;
  let layout: ReturnType<typeof dotStageLayout>;
  function frameAppearance() {
    layout = dotStageLayout(appearance, camera.getBoundingClientRect().width || 288);
    ground.style.backgroundImage = layout.background;
    ground.style.transformOrigin = layout.groundOrigin;
    host.style.transform = `translate(${layout.x}px, ${layout.y}px)`;
    return { ...dotAvatar(appearance), size: layout.size };
  }
  const avatar = mount(host, {
    ...frameAppearance(),
    follow: true,
    followIn: camera.parentElement,
    onDraw: drawing => { ground.style.transform = layout.groundTransform(drawing.coat?.dotFace?.playback); },
  });
  new ResizeObserver(() => avatar.update(frameAppearance())).observe(camera);
  const character = document.createElement('select'),
    characterLabel = document.createElement('label');
  character.setAttribute('aria-label', 'Character');
  character.add(new Option('Custom', ''));
  for (const name of Object.keys(DOT_CHARACTERS)) character.add(new Option(name, name));
  const catalog = document.createElement('optgroup');
  catalog.label = 'Renderer catalog';
  for (const item of DOT_CATALOG) catalog.append(new Option(item.name, 'catalog/' + item.id));
  character.append(catalog);
  characterLabel.append('Character', character);
  controls.appendChild(characterLabel);
  type ChoiceKey = 'shape' | 'colour' | 'texture' | 'eyes' | 'glasses' | 'extra' | 'extraColour';
  const fields = new Map<ChoiceKey, HTMLSelectElement>();
  function choice<K extends ChoiceKey>(
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
      appearance[key] = select.value as NonNullable<DotAppearance[K]>;
      delete appearance.character;
      delete appearance.catalogId;
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
    const extras = dotExtras(appearance.shape);
    if (appearance.extra && !extras.includes(appearance.extra)) appearance.extra = 'None';
    for (const option of Array.from(fields.get('extra')!.options)) {
      option.disabled = !extras.includes(option.value as typeof extras[number]);
    }
    for (const [key, field] of fields) {
      field.querySelector('option[data-preset]')?.remove();
      const value = appearance[key]!;
      if (key === 'texture' && appearance.catalogId) {
        const current = new Option('Matte (catalog)', 'catalog-matte');
        current.dataset.preset = 'true'; current.disabled = true;
        field.add(current); field.value = current.value;
        continue;
      }
      if ((key === 'colour' || key === 'extraColour') && value && !Array.from(field.options).some(o => o.value === value)) {
        const option = new Option('Light yellow', value);
        option.dataset.preset = 'true'; field.add(option);
      }
      field.value = value;
    }
    fields.get('eyes')!.parentElement!.hidden = appearance.shape === 'dot-rounded-head-with-two-ears';
    colour.parentElement!.hidden = appearance.extra === 'None';
    avatar.update(frameAppearance());
  }
  const motionLabel = document.createElement('label'), motion = document.createElement('select');
  motionLabel.textContent = 'Motion';
  motion.setAttribute('aria-label', 'Motion');
  for (const category of ['idle', 'thinking'] as const) {
    const group = document.createElement('optgroup');
    group.label = category === 'idle' ? 'Idle' : 'Thinking';
    for (const item of DOT_MOTIONS) if (item.category === category) group.append(new Option(item.name, item.id));
    motion.append(group);
  }
  const play = document.createElement('button');
  play.type = 'button'; play.textContent = 'Play motion';
  play.addEventListener('click', () => avatar.play(motion.value));
  motionLabel.appendChild(motion); controls.append(motionLabel, play);
  character.addEventListener('change', () => {
    const preset = character.value.startsWith('catalog/')
      ? DOT_CATALOG.find(item => item.id === character.value.slice(8))?.appearance
      : DOT_CHARACTERS[character.value as keyof typeof DOT_CHARACTERS];
    delete appearance.catalogId;
    delete appearance.character;
    if (!preset) { sync(); return; }
    Object.assign(
      appearance,
      { eyes: 'Oval', glasses: 'None', extra: 'None', extraColour: '#1F1F1F' },
      preset,
    );
    sync();
  });
}

dotPicker(document.querySelector('#dot')!, document.querySelector('#dot-controls')!);
