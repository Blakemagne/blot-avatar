// The portrait pose: the slightly tilted, three-quarter view a shape takes in a picker and in
// still avatars. Each shape has its own, so a row of them does not look stamped; every one keeps both eyes
// clearly readable. The turn is small on purpose: a still avatar is often 24 px, and there a far eye that
// has started round the edge is one pale pixel on the rim.

import { deg, type Pose } from '../math';
import { bodyId } from './index';

const pose = (yaw: number, pitch: number, roll: number): Pose => ({ yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) });

const DEFAULT: Pose = pose(24, 8, -6);

/** By the id of the body: degrees of yaw (positive turns the face to the viewer's right), pitch (up) and roll. */
const PORTRAITS: Record<string, Pose> = {
  blob: pose(16, 10, -5),
  cloud: pose(-15, 6, 4),
  square: pose(20, 10, -8),
  sparkle: pose(-18, 5, 10),
  clover: pose(16, 4, 6),
  heart: pose(-24, 8, 7),
  flower: pose(18, 12, -10),
  teardrop: pose(-16, 6, 5),
  tablet: pose(28, 6, -4),
  wedge: pose(-20, 3, 9),
  house: pose(17, 8, -5),
  star: pose(-16, 8, 9),
  hex: pose(16, 10, 7),
  pebble: pose(-18, 8, -7),
};

/** The portrait pose for a shape id. A fresh object each call: the caller may change it. */
export function portraitFor(shape: string): Pose {
  const id = bodyId(shape);
  const p = Object.hasOwn(PORTRAITS, id) ? PORTRAITS[id] : DEFAULT;
  return { yaw: p.yaw, pitch: p.pitch, roll: p.roll };
}
