import type { CoatMesh } from './coat-surface';
import type { FeatureSection } from './dot-feature-sections';
import { sectionMesh } from './dot-mesh';

const fitted = new WeakMap<FeatureSection, CoatMesh>();

/** Josh's crescent is printed on a continuous pale lens. The two visible
 * colour regions in the optical sections share that support under the pupil. */
export function spectacleMesh(section: FeatureSection): CoatMesh | undefined {
  const saved = fitted.get(section);
  if (saved) return saved;
  const { origin, role, side } = section;
  const [cx, cy, cz, radius] = origin;
  const centreX = side < 0 ? -.339063 : .332812;
  const centreY = .0375, lensRadius = .1919, equatorZ = .576;
  const lensHeight = .05;
  let mesh: CoatMesh;
  if (role === 'glass' && section.outline.length === 2) {
    const minor = .127, major = .864;
    mesh = sectionMesh(origin, radius, 100,
      (x,y) => 1.08**2 * (minor**2 - (Math.hypot(x,y) - major)**2),
      () => -.0024 / radius);
  } else if (role === 'catch') {
    mesh = sectionMesh([centreX, centreY, equatorZ], lensRadius, 72,
      (x,y) => (1-x*x-y*y)*(lensHeight/lensRadius)**2, () => 0);
  } else if (role === 'eye') {
    // The boundary is the intersection of the pupil disk with the outside
    // of its circular cutout, measured separately in each reference socket.
    mesh = sectionMesh(origin, radius, 100, (x,y) => {
      const dx = cx + radius*x - centreX, dy = cy + radius*y - centreY;
      const outer = .1400 - Math.hypot(dx-.0108, dy+.0014);
      const cutout = Math.hypot(dx+.1029, dy-.0049) - .0816;
      return Math.min(outer, cutout) / radius * .00002;
    }, (x,y) => {
      const dx = (cx + radius*x - centreX)/lensRadius, dy = (cy + radius*y - centreY)/lensRadius;
      return (equatorZ + lensHeight*Math.sqrt(Math.max(0,1-dx*dx-dy*dy)) + .0016 - cz)/radius;
    });
  } else return undefined;
  fitted.set(section, mesh);
  return mesh;
}
