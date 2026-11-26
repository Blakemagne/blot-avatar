import type { Clip } from './clips';
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

/** The names used with mount().play(), their durations, and which reference motions repeat. */
export const DOT_MOTIONS = Object.entries(dotTracks).map(([slug, track]) => ({
  id: 'dot-' + slug, name: track.name, category: track.category, durationMs: track.ms, loops: track.loops,
}));

export const DOT_CLIPS: Readonly<Record<string, Clip>> = Object.fromEntries(
  Object.entries(dotTracks).map(([slug, track]) => {
    const clip: Clip = {
      lane: 'cue', ms: track.ms,
      apply(out, playing) {
        const time = playing.u * track.ms, keys = keysFor(track);
        let lo = 0, hi = keys.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (time < keys[mid][0]) hi = mid;
          else lo = mid;
        }
        const a = keys[lo], b = keys[hi];
        const t = Math.min(1, Math.max(0, (time - a[0]) / (b[0] - a[0] || 1)));
        const sample = a.map((v, i) => v + t * (b[i] - v));
        out.yaw += sample[1]; out.pitch += sample[2]; out.roll += sample[3];
        out.dotPlayback = {
          scale: sample.slice(4, 7), offset: sample.slice(7, 10).map(v => v * DOT_RADIUS),
          eyes: [sample.slice(10, 22), sample.slice(22, 34)],
        };
      },
    };
    return ['dot-' + slug, clip];
  }),
);
