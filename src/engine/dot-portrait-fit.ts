import type { Body } from './body';
import { catalogParts } from './dot-catalog-parts';
import { featureSections } from './dot-feature-sections';
import { DOT_RADIUS, dotMesh } from './dot-mesh';
import { sockets } from './dot-parts';
import type { CoatMesh } from './coat-surface';

const mounts = new WeakMap<Body, { face: number[]; shell: number[] }>();

// Front sheet at an eye centre. The back shares its footprint, so only consider forward normals.
function front(mesh: CoatMesh, x: number, y: number): number {
  let distance = Infinity, depth = mesh.box[5];
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 6) {
    if (v[i+5] <= 0) continue;
    const d = (v[i]-x)**2 + (v[i+1]-y)**2;
    if (d < distance) { distance = d; depth = v[i+2]; }
  }
  return depth;
}

/** Mount builder pieces in a named portrait's shell and socket coordinates. */
export function portraitMount(body: Body) {
  const saved = mounts.get(body);
  if (saved) return saved;
  const style = body.dotStyle!;
  const source = dotMesh(body.id)!, target = dotMesh(style.character ?? 'catalog-' + body.id)!;
  const a = source.box, b = target.box;
  const scale = [0,1,2].map(i => (b[i+3]-b[i]) / (a[i+3]-a[i]));
  const offset = scale.map((s,i) => b[i] - a[i]*s);
  // transformAxes takes translations in camera radius units.
  const shell = [scale[0],0,0, 0,scale[1],0, 0,0,scale[2], ...offset.map(x => x/DOT_RADIUS)];
  const sections = style.character ? featureSections[style.character] : catalogParts(style.catalogId!)!;
  const anchors = [-1,1].map(side => sections.find(s => s.role === 'eye' && s.side === side)
    ?? sections.find(s => s.role === 'socket' && s.side === side));
  let face = shell;
  if (anchors[0] && anchors[1]) {
    const [left,right] = [anchors[0].origin, anchors[1].origin];
    const [spacing, row] = sockets[body.id];
    const x = (right[0]+left[0])*DOT_RADIUS/2, y = (right[1]+left[1])*DOT_RADIUS/2;
    const sy = (256-row)/148, sx = spacing/148;
    const k = Math.max(.5,Math.min(1.65,(right[0]-left[0])*DOT_RADIUS/(2*sx)));
    const z = front(target, x+(right[0]-left[0])*DOT_RADIUS/2, y) - k*front(source,sx,sy);
    face = [k,0,0, 0,k,0, 0,0,k, x/DOT_RADIUS,(y-k*sy)/DOT_RADIUS,z/DOT_RADIUS];
  }
  const mount = { face, shell };
  mounts.set(body,mount);
  return mount;
}
