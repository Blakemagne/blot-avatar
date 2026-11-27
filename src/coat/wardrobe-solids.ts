import { bodyAttachment, fitHeadband, headphoneMount, rigidAttachment } from './wardrobe-fit';
import { mountShift } from '../engine/wardrobe';
import { dotRenderer } from '../engine/dot-renderer-registry';
import type { Body } from '../engine/body';
import type { CoatMesh } from '../engine/coat';
import type { DotFaceMotion, DotSolid } from '../engine/dot-features';
import type { Rgb } from '../engine/dye';

const NEUTRAL_ATTACHMENT = [1,0,0, 0,1,0, 0,0,1, 0,0,0] as const;
const mountShifts = new WeakMap<Body, number>();

/** Body-local solids with their complete wardrobe fit, before the head turns. */
export function wardrobeSolids(body: Body, mesh: CoatMesh, motion?: DotFaceMotion, tint: Rgb = [31,31,31]): DotSolid[] {
  const style = body.dotStyle;
  if (!style || !dotRenderer) return [];
  const extra = (style.replaceExtra || !style.character && !style.catalogId) && style.extra !== 'None' && style.extra !== 'Headphones' ? dotRenderer.dotMesh(style.extra) : undefined;
  const mountKey = extra ? (body.wardrobeHost ? 'dot-rounded-triangle' : body.id) + '/' + style.extra : undefined;
  const fit = mountKey
    ? dotRenderer.builderFittings[mountKey + '/' + style.glasses] ?? dotRenderer.builderFittings[mountKey]
    : undefined;
  const model = body.wardrobeHost && style.extra !== 'None' && dotRenderer.dotMesh('dot-rounded-triangle');
  const transferred = model && body.wardrobeHost ? bodyAttachment(body.wardrobeHost, mesh, model.box) : undefined;
  const ornamentMesh = extra && fit ? dotRenderer.fittedMesh(extra, fit) : extra;
  const ornament: DotSolid | undefined = ornamentMesh ? {
    mesh: ornamentMesh, tint,
    axes: transferred && model && body.wardrobeHost ? rigidAttachment(body.wardrobeHost, transferred, model.box, ornamentMesh, style.extra) : (fit ? NEUTRAL_ATTACHMENT : dotRenderer.dotAttachments[body.id]?.[style.extra] ?? NEUTRAL_ATTACHMENT), metal: style.extra === 'Crown',
  } : undefined;
  if (ornament && style.replaceExtra) {
    ornament.axes = dotRenderer.transformAxes(dotRenderer.portraitMount(body).shell, ornament.axes);
  }
  const solids = dotRenderer.dotFeatures(body,motion,tint);
  if (transferred && body.wardrobeHost && style.extra === 'Headphones') {
    const [band, ...pads] = solids.filter(solid => !solid.finish);
    const axes = headphoneMount(body.wardrobeHost,mesh,band.mesh,pads.map(pad => pad.mesh),transferred);
    band.mesh = fitHeadband(body.wardrobeHost, band.mesh, axes, transferred[11]);
    band.axes = axes;
    for (const pad of pads) {
      const [, y0, z0, , y1, z1] = pad.mesh.box, scale = axes[0];
      pad.axes = [scale,0,0, 0,scale,0, 0,0,scale, axes[9],
        axes[10] + (axes[4]-scale)*(y0+y1)/2,
        transferred[11] + (axes[8]-scale)*(z0+z1)/2];
    }
  }
  if (ornament) solids.push(ornament);
  const mount = style.extraMount && body.wardrobe?.mounts?.find(m => m.id === style.extraMount);
  if (mount) {
    const gear = solids.filter(s => !s.finish);
    let dx = mountShifts.get(body);
    if (dx === undefined && gear.length) {
      let left = Infinity, right = -Infinity;
      for (const solid of gear) {
        const a = solid.axes, v = solid.mesh.vertices;
        for (let i = 0; i < v.length; i += 6) {
          const x = a[0]*v[i] + a[3]*v[i+1] + a[6]*v[i+2] + a[9];
          left = Math.min(left,x); right = Math.max(right,x);
        }
      }
      dx = mountShift(mount.x,mesh.box[0],mesh.box[3],left,right);
      mountShifts.set(body, dx);
    }
    for (const solid of gear) {
      const axes = Array.from(solid.axes);
      axes[9] += dx ?? 0;
      solid.axes = axes;
    }
  }
  return solids;
}
