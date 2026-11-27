import { readyTrack } from './dot-ready';
import type { Clip, Channels, Playing } from './clips';
import { DOT_RADIUS } from './dot-depth';
import { dotTracks } from './dot-tracks';
import { activityFocus, socketCurves, socketTracks } from './dot-socket-tracks';

export interface DotPlayback {
  scale: number[];
  /** Translation in blot body units, after the rotation. */
  offset: number[];
  /** Local insert transforms with three column vectors and one translation in native radius units. */
  eyes: number[][];
  naturalEyes?: number[][];
  /** Clock and intensity for wearers with independently moving sockets and pupils. */
  activity?: { slug: string; ms: number; amount: number; mirror: boolean; gaze: [number, number]; blend?: { from: SocketPose; weight: number } };
}

const keysByTrack = new WeakMap<{ data: string }, number[][]>();

function keysFor(track: { data: string }, channelCount = 34): number[][] {
  const cached = keysByTrack.get(track);
  if (cached) return cached;
  const bytes = atob(track.data);
  const keys: number[][] = [];
  const previous = Array<number>(channelCount).fill(0);
  let cursor = 0;
  while (cursor < bytes.length) {
    keys.push(previous.map((value, channel) => {
      let word = 0, shift = 0, byte: number;
      do {
        byte = bytes.charCodeAt(cursor++);
        word |= (byte & 127) << shift;
        shift += 7;
      } while (byte & 128);
      previous[channel] = value + ((word >>> 1) ^ -(word & 1));
      return previous[channel] / (channel ? 100000 : 10);
    }));
  }
  keysByTrack.set(track, keys);
  return keys;
}

function sampleTrack(track: { data: string }, time: number, channelCount = 34): number[] {
  const keys = keysFor(track, channelCount);
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time < keys[mid][0]) hi = mid;
    else lo = mid;
  }
  const a = keys[lo], b = keys[hi];
  const t = Math.min(1, Math.max(0, (time - a[0]) / (b[0] - a[0] || 1)));
  return a.map((v, i) => v + t * (b[i] - v));
}

/** In Ready the five-second breath continues between occasional weight shifts and eye movements. */
export function readyIdle(out: Channels, ms: number, awake: number, free: number): void {
  const q = sampleTrack(readyTrack, ms % readyTrack.ms);
  const weight = awake * free;
  out.yaw += weight*q[1]; out.pitch += weight*q[2]; out.roll += weight*q[3];
  const eyes = [q.slice(10,22),q.slice(22,34)].map(bone => bone.map((v, i) => {
    const rest = i === 0 || i === 4 || i === 8 ? 1 : 0;
    return rest + weight*(v-rest);
  }));
  out.dotPlayback = {
    scale: q.slice(4,7).map(v => 1 + awake*(v-1)),
    offset: [q[7]*weight,q[8]*awake,q[9]*weight].map(v => v*DOT_RADIUS),
    eyes,
    activity: { slug: 'ready', ms: ms % readyTrack.ms, amount: weight, mirror: false, gaze: focusAt('ready', ms % readyTrack.ms, weight, false) },
  };
}

/** The names used with mount().play(), their durations, and which reference motions repeat. */
export const DOT_MOTIONS = Object.entries(dotTracks).map(([slug, track]) => ({
  id: 'dot-' + slug, name: track.name, category: track.category, durationMs: track.ms, loops: track.loops,
}));

/** Interpolate a local affine eye transform from rest. Above full strength,
 * compose the extra fraction with the full pose to keep the blink pivot fixed. */
function eyeAtStrength(bone: number[], amount: number, mirror: boolean) {
  if (mirror) {
    for (const i of [1,2,3,6,9]) bone[i] = -bone[i];
  }
  if (amount === 1) return bone;
  const fraction = amount > 1 ? amount-1 : amount;
  const part = bone.map((v,i) => {
    const rest = i === 0 || i === 4 || i === 8 ? 1 : 0;
    return rest + fraction*(v-rest);
  });
  if (amount <= 1) return part;
  return part.map((_,i) => {
    const col = i-i%3, row = i%3;
    return bone[row]*part[col] + bone[row+3]*part[col+1] + bone[row+6]*part[col+2]
      + (col === 9 ? bone[i] : 0);
  });
}

/** Horizontal and vertical attention observed independently of any lid compression. */
function focusAt(slug: string, ms: number, amount: number, mirror: boolean): [number, number] {
  const curve = socketCurves[activityFocus[slug]];
  if (!curve) return [0, 0];
  const values = sampleTrack(curve, ms, curve.channels.length + 1);
  const weight = Math.min(1, amount);
  const look: [number, number] = [0, 0];
  curve.channels.forEach((channel, i) => {
    if (channel === 9) look[0] = values[i+1] * weight * (mirror ? -1 : 1);
    if (channel === 10) look[1] = values[i+1] * weight;
  });
  return look;
}

/** Sample in the wearer's neutral head coordinates. Anatomical gaze reaches its
 * limit at full strength while the body can continue into an exaggerated turn. */
export function socketMotion(wearer: 'frog' | 'todd', activity: NonNullable<DotPlayback['activity']>) {
  const tracks = socketTracks[wearer][activity.slug];
  if (!tracks) return;
  const pose = tracks.map((_, index) => {
    const source = tracks[activity.mirror ? index ^ 2 : index];
    const affine = [1,0,0, 0,1,0, 0,0,1, 0,0,0];
    if (source >= 0) {
      const curve = socketCurves[source];
      const values = sampleTrack(curve, activity.ms, 1 + curve.channels.length);
      curve.channels.forEach((channel, i) => { affine[channel] = values[1+i]; });
    }
    return eyeAtStrength(affine, Math.min(activity.amount, 1), activity.mirror);
  });
  const blend = activity.blend;
  return blend ? pose.map((part,i) => mixValues(blend.from[wearer][i],part,blend.weight)) : pose;
}

type SocketPose = { frog: number[][]; todd: number[][] };
interface ClipPose { angles: number[]; playback: DotPlayback }
const lastPose = new WeakMap<Playing, ClipPose>();
const transitions = new WeakMap<Playing, { pose: ClipPose; sockets: SocketPose }>();

function mixValues(a: number[], b: number[], t: number) {
  return b.map((v,i) => a[i]+(v-a[i])*t);
}

function handoff(previous: Playing, next: Playing) {
  const pose = lastPose.get(previous), activity = pose?.playback.activity;
  if (!pose || !activity) return;
  transitions.set(next,{pose,sockets:{frog:socketMotion('frog',activity)!,todd:socketMotion('todd',activity)!}});
}

export const DOT_CLIPS: Readonly<Record<string, Clip>> = Object.fromEntries(
  Object.entries(dotTracks).map(([slug, track]) => {
    const clip: Clip = {
      lane: 'cue', ms: track.ms, handoff,
      apply(out, playing) {
        const sample = sampleTrack(track, playing.u * track.ms);
        const amount = Math.max(0,Math.min(2,playing.cue.amount));
        const mirror = playing.cue.dir < 0, dir = mirror ? -1 : 1;
        // A full somersault must still land upright at partial strength. Vary
        // its wind-up and speed through the turn without moving its endpoint.
        const keys = keysFor(track), end = keys[keys.length-1];
        const angle = (i: number) => {
          const v = sample[i];
          if (amount === 0) return 0;
          return Math.abs(end[i]) > Math.PI ? v + (amount-1)*Math.sin(v) : v*amount;
        };
        let angles = [dir*angle(1), angle(2), dir*angle(3)];
        const eyes = [sample.slice(10,22),sample.slice(22,34)];
        if (mirror) eyes.reverse();
        const playback: DotPlayback = {
          scale: sample.slice(4,7).map(v => amount === 1 ? v : v**amount),
          offset: sample.slice(7,10).map((v,i) => v*DOT_RADIUS*amount*(i === 0 ? dir : 1)),
          activity: { slug, ms: playing.u * track.ms, amount, mirror, gaze: focusAt(slug, playing.u * track.ms, amount, mirror) },
          ...(amount > 1 ? {naturalEyes: eyes.map(bone => eyeAtStrength(bone.slice(), 1, mirror))} : {}),
          eyes: eyes.map(bone => eyeAtStrength(bone, amount, mirror)),
        };
        const previous = transitions.get(playing);
        if (previous && playing.at < 160) {
          const u = playing.at/160, t = u*u*(3-2*u), old = previous.pose;
          angles = angles.map((v,i) => {
            const delta = v-old.angles[i];
            return old.angles[i] + t*Math.atan2(Math.sin(delta),Math.cos(delta));
          });
          playback.scale = mixValues(old.playback.scale,playback.scale,t);
          playback.offset = mixValues(old.playback.offset,playback.offset,t);
          playback.eyes = playback.eyes.map((m,i) => mixValues(old.playback.eyes[i],m,t));
          if (playback.naturalEyes) playback.naturalEyes = playback.naturalEyes.map((m,i) =>
            mixValues((old.playback.naturalEyes ?? old.playback.eyes)[i],m,t));
          const activity = playback.activity!;
          activity.gaze = mixValues(old.playback.activity!.gaze,activity.gaze,t) as [number, number];
          activity.blend = {from:previous.sockets,weight:t};
        } else if (previous) transitions.delete(playing);
        lastPose.set(playing,{angles,playback});
        out.yaw += angles[0]; out.pitch += angles[1]; out.roll += angles[2];
        out.dotPlayback = playback;
      },
    };
    return ['dot-' + slug, clip];
  }),
);
