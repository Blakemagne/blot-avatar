// @blot/avatar: the Bot's avatar. A 3D body with eyes on its surface, a rig that moves it, and the shared
// frame loop that live avatars run on. Pure TypeScript; nothing here needs React (its hook is @blot/avatar/react).

export * from './engine/index';
export { ACTIVITIES, POKES, type Activity, type PokeKind } from './engine/rig';
export { FACE_NAMES } from './engine/faces';
export { FORMS, type Form } from './engine/figures';
export { SAME_BODY, bodyId } from './engine/bodies/index';
export { portraitFor } from './engine/bodies/portraits';
export { CLIPS, CUES, advance, checkClips, start, type Channels, type Clip, type Cue, type Lane, type Playing, type View } from './engine/clips';
export { smooth, track } from './engine/ease';
export { onFrame, onMotion, onSeen, pointer, reducedMotion, ticking, watchPointer } from './ticker';
export { OVERDRAW, PORTRAIT_FROM, bodyOf, stillState, svgBox } from './still';
export { LARGE, SMALL, SMALL_LOOK, createLive, lookFor, type Live, type LiveProps } from './live';
export { mount, type MountOptions, type Mounted } from './mount';
