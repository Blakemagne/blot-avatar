export const DOT_GLASSES = [
  'None',
  'Monocle',
  'Tall oval frames',
  'Separate trapezoid lenses',
  'Classic sunglasses',
  'Round sunglasses',
] as const;
export const DOT_EXTRAS = [
  'None',
  'Headphones',
  'Bow tie',
  'Beanie',
  'Hat',
  'Beret',
  'Bulb',
  'Tuft',
  'Crown',
] as const;

type Glasses = typeof DOT_GLASSES[number];
type Extra = typeof DOT_EXTRAS[number];

/** Centre of the headband in shell bounds (percent), width across the shell and roll in degrees. */
export interface HeadwearSeat {
  /** The name shown in the position picker, for example “bristles”. */
  label?: string;
  x: number;
  y: number;
  z: number;
  width: number;
  roll: number;
}
export const headwear = ['Beret', 'Hat', 'Beanie', 'Crown'] as const;
type Headwear = typeof headwear[number];

export interface WardrobeMount {
  id: string;
  extras: Extra[];
  /** Centre of the assembled extra across the bare shell, measured from its left edge (0..100). */
  x: number;
  seat?: Omit<HeadwearSeat, 'x'>;
}
export interface WardrobeDefinition {
  glasses?: Glasses[];
  extras?: Extra[];
  mounts?: WardrobeMount[];
  seats?: Partial<Record<Headwear, HeadwearSeat>>;
}

export function mountShift(x: number, left: number, right: number, extraLeft: number, extraRight: number) {
  return left + (right-left)*x/100 - (extraLeft+extraRight)/2;
}

function names<T extends string>(v: unknown, options: readonly T[], field: string, errors: string[]): T[] | undefined {
  if (!Array.isArray(v) || !v.every(n => options.includes(n)) || new Set(v).size !== v.length) {
    errors.push(field + ' must list unique names from ' + options.join(', '));
    return;
  }
  return [...v];
}

function readSeat(value: unknown, errors: string[]): HeadwearSeat | undefined {
  const ranges = { x:[0,100], y:[0,100], z:[0,100], width:[1,160], roll:[-180,180] };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const input = value as Record<string,unknown>;
    const label = input.label;
    if ((label === undefined || (typeof label === 'string' && label.trim().length > 0 && label.length <= 40))
      && Object.keys(input).every(key => Object.hasOwn(ranges,key) || key === 'label') && Object.entries(ranges).every(([key,[min,max]]) => {
      const n = input[key];
      return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    })) return { ...(typeof label === 'string' && { label:label.trim() }), x: Number(input.x), y: Number(input.y), z: Number(input.z), width: Number(input.width), roll: Number(input.roll) };
  }
  errors.push('a headwear seat accepts an optional 1..40 character label and needs x, y and z in 0..100, width in 1..160 and roll in -180..180');
}
export function readWardrobe(value: unknown, errors: string[]): WardrobeDefinition | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('wardrobe must be an object');
    return;
  }
  const input = value as Record<string,unknown>, result: WardrobeDefinition = {};
  for (const key of Object.keys(input)) if (!['glasses','extras','mounts','seats'].includes(key)) errors.push('unknown wardrobe field '+key);
  if ('glasses' in input) result.glasses = names(input.glasses,DOT_GLASSES,'wardrobe.glasses',errors);
  if ('extras' in input) result.extras = names(input.extras,DOT_EXTRAS,'wardrobe.extras',errors);
  if ('seats' in input) {
    if (!input.seats || typeof input.seats !== 'object' || Array.isArray(input.seats)) errors.push('wardrobe.seats must be an object');
    else {
      result.seats = {};
      for (const [key,value] of Object.entries(input.seats)) {
        const kind = headwear.find(name => name === key);
        if (!kind || (result.extras && !result.extras.includes(kind))) errors.push('invalid headwear seat for '+key);
        else {
          const seat = readSeat(value,errors);
          if (seat) result.seats[kind] = seat;
        }
      }
    }
  }
  if ('mounts' in input) {
    if (!Array.isArray(input.mounts)) errors.push('wardrobe.mounts must be an array of named positions');
    else {
      result.mounts = [];
      for (const m of input.mounts) {
        if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some(k => !['id','extras','x','seat'].includes(k))
          || typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(m.id) || m.id === 'original'
          || result.mounts.some(other => other.id === m.id) || !Number.isFinite(m.x) || m.x < 0 || m.x > 100) {
          errors.push('each mount needs a unique lowercase id and x within 0..100');
          continue;
        }
        const allowed = (result.extras ?? DOT_EXTRAS).filter(extra => extra !== 'None');
        const extras = names(m.extras, allowed, 'mount '+m.id+' extras', errors);
        if (!extras?.length) errors.push('mount '+m.id+' needs at least one wearable extra');
        else {
          let seat: WardrobeMount['seat'];
          if ('seat' in m) {
            if (!m.seat || typeof m.seat !== 'object' || Array.isArray(m.seat) || 'x' in m.seat) errors.push('a named seat uses the x of its mount');
            else {
              const parsed = readSeat({ ...m.seat, x:m.x },errors);
              if (parsed) seat = { ...(parsed.label && {label:parsed.label}), y:parsed.y, z:parsed.z, width:parsed.width, roll:parsed.roll };
            }
            if (extras.some(extra => !headwear.some(h => h === extra))) errors.push('a seated mount accepts headwear extras');
          }
          result.mounts.push({ id: m.id, x: m.x, extras, ...(seat && {seat}) });
        }
      }
    }
  }
  return result;
}
