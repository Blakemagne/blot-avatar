// @blot/avatar: the Bot's avatar. A 3D body with eyes on its surface, a rig that moves it, and the shared
// frame loop that live avatars run on. Pure TypeScript; nothing here needs React (its hook is @blot/avatar/react).

export * from './engine/index';
export { ACTIVITIES, POKES, type Activity, type PokeKind } from './engine/rig';
export { FACE_NAMES } from './engine/faces';
export { FORMS, type FigureShape, type Form } from './engine/figures';
export { SAME_BODY, bodyId } from './engine/bodies/index';
export { portraitFor } from './engine/bodies/portraits';
export { CLIPS, CUES, PERSONALITY, PICKUP_MS, advance, checkClips, start, type Channels, type Clip, type Cue, type Lane, type Personality, type Playing, type View } from './engine/clips';
export { ACTIVITY_FACES, MANNERS, PLAIN, mannerFor, type Manner } from './engine/faces';
export { FX_KINDS, type Fx, type FxKind, type FxPart, type FxRole } from './engine/fx';
export { glowFilter, paintEffects, roleColour, type FxPaint } from './paint';
export { smooth, track } from './engine/ease';
export { onFrame, onMotion, onSeen, pointer, reducedMotion, ticking, watchPointer } from './ticker';
export { OVERDRAW, PORTRAIT_FROM, bodyOf, stillState, svgBox, type Shape } from './still';
export { LARGE, SMALL, SMALL_LOOK, createLive, lookFor, lookWithin, type Feel, type Live, type LiveProps, type Material, type Reach } from './live';
export { mount, type MountOptions, type Mounted } from './mount';
export { coatable } from './coat/renderer';
export { BOT_COLOURS } from './palette';
export { GALLERY, galleryAvatar, galleryColour, type GalleryAvatar } from './gallery';
export { writeLayers, type Paint } from './layers';
export { ULTRA_INK, ULTRA_LAVENDER, ULTRA_PALETTE, eyeInk, furShown, paintSkin, skinMarkup, skinPaint, ultraId } from './ultra';
