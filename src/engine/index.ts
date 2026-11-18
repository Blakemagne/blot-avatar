// The Bot's avatar engine: a real 3D body with eyes on its surface, turned into SVG path strings.
// Pure TypeScript: no React, no DOM. It runs the same in a node test and in the browser.

export { D, area, bounds, deg, inside, rotation, type Mat3, type Pose } from './math';
export type { Antennas, Body, Decal, DecalShape, EyeSpec, Piece, Solid, Sphere } from './body';
export { antennaPieces, decalOutline } from './decals';
export { silhouette, toPath } from './silhouette';
export { surfaceAt } from './field';
export { barWidth, eyePolys, type Trim } from './eyes';
export { BLINK_HEIGHT, FACES, eyeOutline, type Face, type FaceName } from './faces';
export { BLINK_MS, LOOK_PITCH, LOOK_YAW, Rig, random, type RigOptions, type RigState } from './rig';
export { EYE_RIM, THIN_PX, VIEW, VIEW_BOX, colours, detail, drawAvatar, effectShapes, eyeShapes, layerShapes, type Drawing, type DrawnFx, type Layer } from './draw';
export { BODIES, bodyFor } from './bodies/index';
