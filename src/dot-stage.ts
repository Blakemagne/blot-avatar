import { dotAvatar, type DotAppearance } from './dot';
import type { DotPlayback } from './engine/dot-motion';
import { DOT_RADIUS } from './engine/dot-depth';
import { stageFrames, stageEyewear } from './engine/dot-stage-data';

const portraitStage = {
  Blossie: 'starter/blossie', Felipe: 'starter/studio_felipe_hexagon', 'Felipe flower': 'catalog/blue_beret',
  Iris: 'catalog/coral_monocle', Iggy: 'catalog/lime_headphones', Alfred: 'catalog/alfred', Jojo: 'catalog/purple_heart',
  Thelma: 'catalog/gus', Josh: 'catalog/blue_spectacles', Todd: 'catalog/lime_frog',
};

const opacity = [.994,.984,.923,.836,.729,.617,.505,.405,.315,.240,.178,.128,.064,.017,0];

/** Position a public mount in a square Dots stage. Offsets are measured from the stage centre. */
export function dotStageLayout(appearance: DotAppearance, side: number) {
  if (!Number.isFinite(side) || side <= 0) throw new RangeError('Stage size must be positive and finite');
  const { body } = dotAvatar(appearance), style = body!.dotStyle!;
  const key = style.character ? portraitStage[style.character] : style.catalogId ? 'catalog/' + style.catalogId : body!.id + '/' + style.extra;
  const frame = stageFrames[key], glasses = stageEyewear[key + '/' + style.glasses];
  const [, cameraX, , , floorY, radiusX, radiusY] = frame;
  const [zoom, cameraY, floorX] = glasses ?? [frame[0], frame[2], frame[3]];
  const unit = side*zoom/2, x = side*cameraX/2, y = -side*cameraY/2;
  const cx = side/2 + x + unit*floorX, cy = side/2 + y - unit*floorY;
  function plane(width: number, height: number, alpha: number) {
    const stops = opacity.map((gain,i) => `rgb(112 116 122 / ${gain*alpha}) ${i*6.25}%`);
    return `radial-gradient(ellipse ${width*unit}px ${height*unit*1.22245}px at ${cx}px ${cy}px, ${stops.join(', ')})`;
  }
  return {
    size: 2*unit/DOT_RADIUS, x, y,
    groundOrigin: `${cx}px ${cy}px`,
    groundTransform(pose?: Pick<DotPlayback, 'scale' | 'offset'>) {
      return pose ? `translateX(${pose.offset[0]*unit/DOT_RADIUS}px) scale(${pose.scale[0]})` : '';
    },
    background: plane(radiusX*29/54,radiusY*.325,.095) + ', ' + plane(radiusX,radiusY,.115),
  };
}
