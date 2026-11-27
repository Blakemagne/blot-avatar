import { readyTrack } from './dot-ready';
import type { Clip, Channels } from './clips';
import { DOT_RADIUS } from './dot-depth';
import { dotTracks, type DotTrack } from './dot-tracks';

export interface DotPlayback {
  scale: number[];
  /** Translation in blot body units, after the rotation. */
  offset: number[];
  /** Local insert transforms with three column vectors and one translation in native radius units. */
  eyes: number[][];
}

const keysByTrack = new WeakMap<DotTrack, number[][]>();

function keysFor(track: DotTrack): number[][] {
  const cached = keysByTrack.get(track);
  if (cached) return cached;
  const bytes = atob(track.data);
  const keys: number[][] = [];
  const previous = Array<number>(34).fill(0);
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

function sampleTrack(track: DotTrack, time: number): number[] {
  const keys = keysFor(track);
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

export const DOT_CLIPS: Readonly<Record<string, Clip>> = Object.fromEntries(
  Object.entries(dotTracks).map(([slug, track]) => {
    const clip: Clip = {
      lane: 'cue', ms: track.ms,
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
        out.yaw += dir*angle(1); out.pitch += angle(2); out.roll += dir*angle(3);
        const eyes = [sample.slice(10,22),sample.slice(22,34)];
        if (mirror) eyes.reverse();
        out.dotPlayback = {
          scale: sample.slice(4,7).map(v => amount === 1 ? v : v**amount),
          offset: sample.slice(7,10).map((v,i) => v*DOT_RADIUS*amount*(i === 0 ? dir : 1)),
          eyes: eyes.map(bone => eyeAtStrength(bone, amount, mirror)),
        };
      },
    };
    return ['dot-' + slug, clip];
  }),
);
