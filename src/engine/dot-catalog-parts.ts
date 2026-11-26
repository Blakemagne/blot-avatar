import { catalogRigs, catalogSurfaces } from './dot-catalog-surfaces';
import type { FeatureSection } from './dot-feature-sections';

const roles = ['eye', 'catch', 'glass', 'socket', 'extra'] as const;
const cache = new Map<string, readonly FeatureSection[]>();

/** Read the local contours and depth controls only for the selected character. */
export function catalogParts(id: string): readonly FeatureSection[] | undefined {
  const rig = catalogRigs[id];
  if (!rig) return;
  const known = cache.get(id);
  if (known) return known;
  const parts = rig.parts.map(([index, role, material]) => {
    const bytes = Uint8Array.from(atob(catalogSurfaces[index]), c => c.charCodeAt(0));
    const data = new DataView(bytes.buffer);
    const origin = [0, 4, 8, 12].map(at => data.getFloat32(at, true));
    const grid = data.getUint8(16), loops = data.getUint8(17);
    let offset = 18;
    function controls(length: number) {
      const result: number[] = [];
      for (let i = 0; i < length; i++, offset += 2) result.push(data.getInt16(offset, true));
      return result;
    }
    const outline: number[][] = [];
    for (let i = 0; i < loops; i++) {
      const vertices = data.getUint16(offset, true);
      offset += 2;
      outline.push(controls(2 * vertices));
    }
    return { origin, grid, outline, material, catalogSection: index, role: roles[role], side: Math.sign(origin[0]),
      light: role === 1 || role === 3, thickness: controls(grid * grid), centre: controls(grid * grid) };
  });
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(id, parts);
  return parts;
}
