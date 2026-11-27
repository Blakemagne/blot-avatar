import { fittedBeret, onMount, seatedBeret } from './beret-fit';
import { eyewearDepth, seatWardrobe } from './wardrobe-contact';
import { bodyAttachment, fitHeadband, headphoneMount, rigidAttachment, scalpSeat } from './wardrobe-fit';
import { headwear, mountShift } from '../engine/wardrobe';
import { dotRenderer } from '../engine/dot-renderer-registry';
import type { Body } from '../engine/body';
import { coatMesh, type CoatMesh } from '../engine/coat';
import type { DotFaceMotion, DotSolid } from '../engine/dot-features';
import type { Rgb } from '../engine/dye';

const NEUTRAL_ATTACHMENT = [1,0,0, 0,1,0, 0,0,1, 0,0,0] as const;
const headwearAxes = new WeakMap<Body, readonly number[]>();
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
  const useSeat = style.extra === 'Beret' && !!body.wardrobeHost;
  const model = !useSeat && body.wardrobeHost && style.extra !== 'None' && dotRenderer.dotMesh('dot-rounded-triangle');
  const transferred = model && body.wardrobeHost ? bodyAttachment(body.wardrobeHost, mesh, model.box) : undefined;
  const ornamentMesh = extra && fit && !useSeat ? dotRenderer.fittedMesh(extra, fit) : extra;
  const ornament: DotSolid | undefined = ornamentMesh ? {
    mesh: ornamentMesh, tint, contact: style.extra === 'Bow tie' ? 'bow' : undefined,
    axes: transferred && model && body.wardrobeHost ? rigidAttachment(body.wardrobeHost, transferred, model.box, ornamentMesh, style.extra) : (fit ? NEUTRAL_ATTACHMENT : dotRenderer.dotAttachments[body.id]?.[style.extra] ?? NEUTRAL_ATTACHMENT), metal: style.extra === 'Crown',
  } : undefined;
  if (ornament && style.replaceExtra) {
    ornament.axes = dotRenderer.transformAxes(dotRenderer.portraitMount(body).shell, ornament.axes);
  }
  const solids = dotRenderer.dotFeatures(body,motion,tint);
  if (body.wardrobeHost && style.glasses !== 'None') {
    const dz = eyewearDepth(body);
    for (const solid of solids) if (solid.eyewear) {
      const axes = [...solid.axes];
      axes[11] += dz;
      solid.axes = axes;
    }
  }
  if (transferred && body.wardrobeHost && style.extra === 'Headphones') {
    const [band, ...pads] = solids.filter(solid => !solid.finish);
    const axes = headphoneMount(body.wardrobeHost,mesh,band.mesh,pads.map(pad => pad.mesh),transferred);
    band.mesh = fitHeadband(body.wardrobeHost, band.mesh, axes, transferred[11]);
    band.axes = axes;
    for (const pad of pads) {
      const [x0, y0, z0, x1, y1, z1] = pad.mesh.box, scale = transferred[0];
      pad.axes = [scale,0,0, 0,scale,0, 0,0,scale, axes[9] + (axes[0]-scale)*(x0+x1)/2,
        axes[10] + (axes[4]-scale)*(y0+y1)/2,
        transferred[11] + (axes[8]-scale)*(z0+z1)/2];
    }
  }
  if (ornament) solids.push(ornament);
  const mount = body.wardrobe?.mounts?.find(m => m.id === style.extraMount);
  const kind = headwear.find(kind => kind === style.extra);
  const seat = mount?.seat ? { ...mount.seat,x:mount.x } : (kind && body.wardrobe?.seats?.[kind]);
  if (style.extra === 'Beret' && (style.portableBeret || style.replaceExtra || seat)) {
    const gear = solids.filter(s => !s.finish);
    if (gear.length === 1) {
      const source = gear[0];
      const sections = dotRenderer.beretSections();
      let axes = headwearAxes.get(body);
      if (!axes) {
        const placed = seat ?? (body.wardrobeHost && scalpSeat(body.wardrobeHost,mesh.box));
        axes = placed ? seatedBeret(mesh.box,placed) : onMount(source.axes,fittedBeret(source.mesh,sections));
        headwearAxes.set(body,axes);
      }
      solids.splice(solids.indexOf(source),1,...sections.map(mesh => ({...source,mesh,axes,beret:true})));
    }
  } else if (seat && kind) {
    // Place the lower fifth of a cap at its prescribed seat. Apply one
    // transform to all its pieces so a crown's band and points stay together.
    const gear = solids.filter(s => !s.finish);
    let placement = headwearAxes.get(body);
    const bounds = !placement && solidBounds(gear);
    if (bounds) {
      const scale = .01*seat.width*(mesh.box[3]-mesh.box[0])/(bounds[3]-bounds[0]);
      const angle = seat.roll*Math.PI/180, c = scale*Math.cos(angle), s = scale*Math.sin(angle);
      const x=(bounds[0]+bounds[3])/2, y=bounds[1]+.2*(bounds[4]-bounds[1]), z=(bounds[2]+bounds[5])/2;
      placement=[c,s,0,-s,c,0,0,0,scale,
        mesh.box[0]+.01*seat.x*(mesh.box[3]-mesh.box[0])-c*x+s*y,
        mesh.box[1]+.01*seat.y*(mesh.box[4]-mesh.box[1])-s*x-c*y,
        mesh.box[2]+.01*seat.z*(mesh.box[5]-mesh.box[2])-scale*z];
      headwearAxes.set(body,placement);
    }
    if (placement) for (const solid of gear) solid.axes = onMount(placement,solid.axes);
  }
  if (mount && !mount.seat) {
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
  seatWardrobe(body,mesh,solids);
  return solids;
}

/** The occupied bounds after the complete outfit and any left/right mount have been applied. */
export function headwearBounds(body: Body, roll = 0): number[] | undefined {
  const solids = wardrobeSolids(body,coatMesh(body));
  if (!roll) return solidBounds(solids);
  const c=Math.cos(roll), s=Math.sin(roll);
  const level=[c,-s,0,s,c,0,0,0,1,0,0,0];
  return solidBounds(solids.filter(part=>!part.finish).map(part=>({...part,axes:onMount(level,part.axes)})));
}

function solidBounds(solids: DotSolid[]) {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const { mesh, axes, finish } of solids) {
    if (finish) continue;
    const v = mesh.vertices;
    for (let i=0; i<v.length; i+=6) for (let k=0; k<3; k++) {
      const p = axes[k]*v[i] + axes[k+3]*v[i+1] + axes[k+6]*v[i+2] + axes[k+9];
      box[k] = Math.min(box[k], p);
      box[k+3] = Math.max(box[k+3], p);
    }
  }
  return Number.isFinite(box[0]) ? box : undefined;
}
