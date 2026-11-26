import type { Clip } from './clips';
import { dotTracks } from './dot-tracks';

/** The names used with mount().play(), their durations, and which reference motions repeat. */
export const DOT_MOTIONS = Object.entries(dotTracks).map(([slug, track]) => ({
  id: 'dot-' + slug, name: track.name, category: track.category, durationMs: track.ms, loops: track.loops,
}));

export const DOT_CLIPS: Readonly<Record<string, Clip>> = Object.fromEntries(
  Object.entries(dotTracks).map(([slug, track]) => {
    const clip: Clip = {
      lane: 'cue', ms: track.ms,
      apply(out, playing) {
        const time = playing.u * track.ms;
        const keys = track.keys;
        let lo = 0, hi = keys.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (time < keys[mid][0]) hi = mid;
          else lo = mid;
        }
        const a = keys[lo], b = keys[hi];
        const t = Math.min(1, Math.max(0, (time - a[0]) / (b[0] - a[0] || 1)));
        const value = (i: number) => a[i] + (b[i] - a[i]) * t;
        out.yaw += value(1); out.pitch += value(2); out.roll += value(3);
        out.x += value(4); out.lift += value(5);
        out.stretch *= value(6); out.scale *= value(7);
        out.eyeX += value(8); out.eyeY += value(9);
        out.winkL = Math.max(out.winkL, (1 - value(10)) / .94);
        out.winkR = Math.max(out.winkR, (1 - value(11)) / .94);
      },
    };
    return ['dot-' + slug, clip];
  }),
);
