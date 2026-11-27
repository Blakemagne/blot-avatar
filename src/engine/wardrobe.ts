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

export interface WardrobeMount {
  id: string;
  extras: Extra[];
  /** Centre of the assembled extra across the bare shell, measured from its left edge (0..100). */
  x: number;
}
export interface WardrobeDefinition {
  glasses?: Glasses[];
  extras?: Extra[];
  mounts?: WardrobeMount[];
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

export function readWardrobe(value: unknown, errors: string[]): WardrobeDefinition | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('wardrobe must be an object');
    return;
  }
  const input = value as Record<string,unknown>, result: WardrobeDefinition = {};
  for (const key of Object.keys(input)) if (!['glasses','extras','mounts'].includes(key)) errors.push('unknown wardrobe field '+key);
  if ('glasses' in input) result.glasses = names(input.glasses,DOT_GLASSES,'wardrobe.glasses',errors);
  if ('extras' in input) result.extras = names(input.extras,DOT_EXTRAS,'wardrobe.extras',errors);
  if ('mounts' in input) {
    if (!Array.isArray(input.mounts)) errors.push('wardrobe.mounts must be an array of named positions');
    else {
      result.mounts = [];
      for (const m of input.mounts) {
        if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some(k => !['id','extras','x'].includes(k))
          || typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(m.id) || m.id === 'original'
          || result.mounts.some(other => other.id === m.id) || !Number.isFinite(m.x) || m.x < 0 || m.x > 100) {
          errors.push('each mount needs a unique lowercase id and x within 0..100');
          continue;
        }
        const allowed = (result.extras ?? DOT_EXTRAS).filter(extra => extra !== 'None');
        const extras = names(m.extras, allowed, 'mount '+m.id+' extras', errors);
        if (!extras?.length) errors.push('mount '+m.id+' needs at least one wearable extra');
        else result.mounts.push({ id: m.id, x: m.x, extras });
      }
    }
  }
  return result;
}
