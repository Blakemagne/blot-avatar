// A live avatar without a framework: one rig, drawn from the shared frame loop into whatever `out` writes to.
// React's useLiveAvatar (react.ts) and mount() (mount.ts) are both this, wired to a page in their own way.

import type { Body } from './engine/body';
import { PERSONALITY, type Clip, type Personality } from './engine/clips';
import { drawAvatar, type Drawing } from './engine/draw';
import { ACTIVITY_FACES, FACES, faceFor } from './engine/faces';
import { Rig, type RigState } from './engine/rig';
import { bodyOf, stillState, type Shape } from './still';
import { onFrame, onSeen, pointer, reducedMotion, watchPointer } from './ticker';

export interface LiveProps {
  /**
   * The shape: a built-in one's id, or an avatar definition (see Shape). Changed on an attached avatar, the body
   * morphs into the new one. A definition is told apart by its contents, so a copy of the same one is no change.
   */
  shape: Shape;
  /**
   * A body of your own, drawn in place of `shape`'s (which still names it for a still picture), such as
   * a shape with antennas added. Changed on an attached avatar, it morphs as a new shape does. Pass the same
   * object again to keep it: a new object is a new body.
   */
  body?: Body;
  /** Slot size in px. */
  size: number;
  /** Seed for the blink and idle timing, so two avatars side by side do not move in step (default 1). */
  seed?: number;
  /** Look at the pointer: the eyes go first and the body turns after them. */
  follow?: boolean;
  /**
   * With `follow`: follow the pointer only while it is inside this element (a card, a panel), and take its edges
   * as a full look. Outside it, the avatar looks ahead again as it does when the pointer leaves the page.
   */
  followIn?: Element | null;
  /**
   * With `follow`: how many px off the pointer is when the look is full (unset: NEAR for one of LARGE px and up,
   * half the window for a smaller one). Shorter is keener: it turns sooner. Not used with `followIn`, whose
   * edges are the reach.
   */
  followReach?: number;
  /**
   * With `follow`: how far it turns at most, 0..1 of a full look (unset: 1 from LARGE px up, SMALL_LOOK under it,
   * where a full look is a profile that a small avatar loses its face in).
   */
  followMost?: number;
  /** What it is doing (the engine's ACTIVITIES); none is idle. */
  activity?: string;
  /** A loading figure the body turns into while it thinks or works (the engine's FORMS); none, and it is a body. */
  form?: string | null;
  /**
   * How far along the work is, 0..1 (unset is 0), for the progress figure (`form: 'progress'`): its arc grows
   * from the top, clockwise, easing to each new amount. Change it as the work goes; nothing restarts. Under reduced
   * motion no loading figure is shown, so neither is the amount: show it some other way there too.
   */
  progress?: number;
  /** A face by name (the engine's FACES), worn when idle. */
  face?: string;
  /** While idle it is at rest in the still's pose and does not tick (blot uses it for still avatars that come alive only while busy). */
  rests?: boolean;
  /** The voice right now, 0..1, read on every frame while it speaks (never through a render). */
  level?: () => number;
  /** Extra clips, passed to the rig (see RigOptions.clips). Read once, when the rig is built. */
  clips?: Readonly<Record<string, Clip>>;
  /** A mark on its outline that it glances at: something is waiting for whoever is watching (Rig.setMark). */
  mark?: boolean;
  /**
   * Ultracode, a star's power, on until it is turned off (Rig.setUltra): a star drops in, and the body turns to
   * rainbow glass (fur goes rainbow), floats, glows and twinkles. It never rests while powered. Under reduced
   * motion its still is powered, with no star and no float.
   */
  ultra?: boolean;
  /** What it is like to move (the engine's Personality, each 0..1); left out, the engine's own feel. */
  personality?: Partial<Personality>;
  /**
   * The body's finish: 'flat' (the default), or 'fluffy', a coat of fur drawn with WebGL2 round the eyes. Where
   * WebGL2 is missing or fails, and on a server, the body is flat. Changed on an attached avatar, it changes at once.
   */
  material?: Material;
}

/** A body's finish: flat paint, or a coat of fur. */
export type Material = 'flat' | 'fluffy' | 'glossy';

export interface Live {
  /** The rig. Under reduced motion a new shape builds a new one. */
  readonly rig: Rig;
  /** The first picture, drawn when it was made, before anything is attached. */
  readonly first: Drawing;
  /** Take the latest props. The frame loop reads them; nothing restarts. */
  want(p: LiveProps): void;
  /** Start drawing into `out` while `host` is on screen. Returns the way to stop. */
  attach(host: Element, out: (d: Drawing) => void): () => void;
  /** Reduced motion was turned on or off: draw the still picture, or carry on. */
  motion(): void;
  /** Follow the pointer from now on (the pointer listeners are once per page). */
  follow(on: boolean | undefined): void;
  /** The shape or size changed: morph (or, under reduced motion, simply be the new shape) and draw. */
  shape(): void;
  /** The face changed. */
  face(name: string | undefined): void;
  /** The activity, the form, the progress, `rests`, the shape, the size, the mark, the power or the personality changed. */
  doing(): void;
  /** A poke: a spin, a nod, a hop, in turn. Nothing under reduced motion. */
  poke(kind?: string): void;
  /** Play a clip by name (see Rig.play). False under reduced motion. */
  play(name: string, cue?: { dir?: number; amount?: number }): boolean;
  /** Go to another shape for a moment and come back (Rig.visit). Nothing under reduced motion. */
  visit(shape: Shape, stay?: number): void;
}

/** Below this size an avatar is drawn at most 30 times a second. */
export const SMALL = 48;
/**
 * From this size up an avatar turns its head properly (in blot: 64 to 96 px, a hero, a details panel, a picker's
 * preview). It turns all the way for a pointer NEAR px off, so moving the pointer across the page takes it from
 * one full look to the other. On the way it turns quickly at first and then
 * more slowly (`eased`): a hand's width away it is plainly turning, and it is in profile only for a pointer
 * that really is far off, not for most places a pointer rests.
 */
export const LARGE = 64;
const NEAR = 420;
/** 0..1 to 0..1 (and 1 beyond), steep at the start and flat at the end. */
const eased = (v: number): number => 1 - (1 - Math.min(1, v)) ** 1.7;
/** A small avatar turns at most this share of a full look: a full one is a profile, which that small loses the face. */
export const SMALL_LOOK = 0.6;
const unit = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Where an avatar of `size` px looks (x right, y up, each -1..1, as the rig takes them) for a pointer (dx, dy)
 * px from its middle, dy upward, in a window `span` px on its longer side. A large one looks the way the
 * pointer is, as far as the pointer is off (NEAR px and beyond: a full look), so its looks lie inside the unit
 * circle. A small one sits at the edge of the page with the pointer nearly always far from it, so a full look
 * takes half the window (it watches the pointer cross the page instead of sitting turned away), and it only
 * ever turns part of the way.
 */
export function lookFor(size: number, dx: number, dy: number, span: number, feel: Feel = {}): { x: number; y: number } {
  const most = most01(feel.most, size);
  if (size >= LARGE || feel.reach !== undefined) {
    // The distance is eased and the direction kept: a pointer far off up and to the right is a full look up
    // and to the right, not a look into the corner. (Each axis eased by itself sent every far pointer there.)
    // (`|| 0`: the pointer on its very middle has no direction, and a zero is never a negative one.)
    const d = Math.hypot(dx, dy), e = eased(d / Math.max(1, feel.reach ?? NEAR)) * most;
    return { x: (dx / d) * e || 0, y: (dy / d) * e || 0 };
  }
  const far = Math.max(400, span / 2);
  return { x: unit(dx / far) * most, y: unit(dy / far) * most };
}

/** How a follow feels (LiveProps.followReach and followMost): how far off is a full look, and how far it turns at most. */
export interface Feel { reach?: number; most?: number }

/** How far an avatar of `size` px turns at most: `most` when it is a number (kept to 0..1), else its size's own. */
const most01 = (most: number | undefined, size: number): number =>
  typeof most === 'number' && most === most ? Math.max(0, Math.min(1, most)) : size >= LARGE ? 1 : SMALL_LOOK;

/** How far an avatar is from each edge of the area it follows the pointer in, in px. */
export interface Reach { left: number; right: number; up: number; down: number }

/**
 * Where an avatar of `size` px looks for a pointer (dx, dy) px from its middle, dy upward, when it follows the
 * pointer only inside an area that reaches `reach` px from its middle each way: an edge of the area is a full
 * look that way (the share a small avatar takes, SMALL_LOOK, for one under LARGE). As in lookFor, the distance is
 * eased and the direction kept, so its looks lie inside the unit circle.
 */
export function lookWithin(size: number, dx: number, dy: number, reach: Reach, feel: Feel = {}): { x: number; y: number } {
  // (An edge on the avatar's own middle, or past it, is 1 px away: a look toward it is a full one at once.)
  const nx = dx / Math.max(1, dx >= 0 ? reach.right : reach.left), ny = dy / Math.max(1, dy >= 0 ? reach.up : reach.down);
  const d = Math.hypot(nx, ny), e = eased(d) * most01(feel.most, size);
  return { x: (nx / d) * e || 0, y: (ny / d) * e || 0 };
}

/** What a fluffy avatar asks drawAvatar for: the coat's part of the drawing too. */
const COAT = { coat: true } as const;

/** Facing front with the neutral face: what an avatar that does not rest shows when nothing may move. */
const FRONT: RigState = { pose: { yaw: 0, pitch: 0, roll: 0 }, eye: { x: 0, y: 0 }, lid: 1, face: FACES.neutral };

/**
 * A powered still: the rainbow's bands where the motion study froze them, and the moment of its twinkles when one
 * of them, up and to the left, is lit by itself.
 */
export const CALM_ULTRA = { phase: 0.3, t: 1253 } as const;

/**
 * The still picture for reduced motion: the still's pose (or the front), wearing what it is doing (a thinking
 * face, shut eyes asleep) or the face it was given, with its mark if it has one, and powered if it is. Nothing
 * moves, but it still says what is going on.
 */
function calmOf(base: RigState, q: LiveProps): RigState {
  const act = q.activity && q.activity !== 'idle' && Object.hasOwn(ACTIVITY_FACES, q.activity) ? q.activity as keyof typeof ACTIVITY_FACES : null;
  const face = act ? ACTIVITY_FACES[act] : q.face ? faceFor(q.face) : base.face;
  const s: RigState = { ...base, face, lid: act === 'sleeping' ? 0.1 : base.lid };
  if (q.mark) s.fx = [{ kind: 'mark', u: 0, t: 0, dir: 1, amount: 1 }];
  if (q.ultra) {
    s.ultra = { amount: 1, phase: CALM_ULTRA.phase };
    s.fx = [...(s.fx ?? []), { kind: 'ultra', u: 0, t: CALM_ULTRA.t, dir: 1, amount: 1 }];
  }
  return s;
}

/**
 * A live avatar: one rig that lasts as long as this does. A new shape morphs, a new activity eases in, and
 * nothing starts over. While the person prefers reduced motion it is one still picture (the still's pose if
 * it rests, facing front if not), whenever that was turned on. It does not tick while it is off screen,
 * while the tab is hidden, or while it is at rest; one under SMALL px is drawn at most 30 times a second.
 */
export function createLive(p: LiveProps): Live {
  let props = p;
  const idleOf = (q: LiveProps): boolean => !q.activity || q.activity === 'idle';
  const wantOf = (q: LiveProps) => ({ body: q.body ?? bodyOf(q.shape), size: q.size, follow: q.follow, within: q.followIn ?? null, feel: { reach: q.followReach, most: q.followMost } as Feel, level: q.level, calm: calmOf(q.rests ? stillState(q.shape, q.size) : FRONT, q), coat: q.material === 'fluffy' ? COAT : undefined });
  // What the frame loop reads. Replaced on every want(), so that a new prop never restarts the loop.
  let want = wantOf(p);

  // A resting avatar starts where the still stands; any other starts facing front.
  const build = (): Rig => new Rig({ seed: props.seed ?? 1, body: want.body, pose: props.rests ? stillState(props.shape, props.size).pose : undefined, rest: props.rests && idleOf(props), clips: props.clips, personality: props.personality });
  let rig = build();
  const first = drawAvatar(want.body, 'gray', rig.state, want.size);

  /** Draw now, and make sure it is ticking if it has anything to do. Set while attached. */
  let live: { draw(): void; wake(): void } | null = null;
  let faced = false;
  /** The body and size the rig was last given. */
  let shown = { body: want.body, size: want.size };
  /**
   * What it is doing, and where it rests when it is doing nothing. (Not while it has a mark or is powered: then it
   * stays awake.)
   */
  const doing = (r: Rig) => {
    r.setActivity(props.activity ?? 'idle', props.form ?? null);
    r.setProgress(props.progress ?? 0);
    r.rest(props.rests && !props.mark && !props.ultra ? stillState(props.shape, props.size).pose : null);
    r.setMark(!!props.mark);
    r.setUltra(!!props.ultra);
    r.setPersonality({ ...PERSONALITY, ...props.personality });
  };

  return {
    get rig() { return rig; },
    first,
    want(q) { props = q; want = wantOf(q); },
    attach(el, out) {
      const draw = () => {
        const w = want;
        // (The colour passed to the engine is not used: the paths are painted by whoever draws them.)
        // With reduced motion the rig is not stepped, and whatever it was in the middle of is not shown.
        out(drawAvatar(w.body, 'gray', reducedMotion() ? w.calm : rig.state, w.size, w.coat));
      };
      let last = 0, moves = -1, layout = -1, cx = 0, cy = 0, measured = -Infinity;
      /** The area it follows the pointer in, when it has one (followIn), as last measured. */
      let area: DOMRect | null = null, areaOf: Element | null = null;
      let stop: (() => void) | null = null, seen = false;

      // Tick only while on screen, with something to do and allowed to move: an avatar at rest is a still picture.
      const wake = () => {
        const on = seen && !reducedMotion() && !rig.resting;
        if (on && !stop) { last = 0; moves = -1; stop = onFrame(tick); }
        else if (!on && stop) { stop(); stop = null; }
      };
      const tick = (now: number) => {
        const w = want, r = rig;
        if (!last) { last = now; return; }
        const dt = now - last;
        if (w.size < SMALL && dt < 32) return;
        last = now;
        if (w.follow && (moves !== pointer.moves || layout !== pointer.layout)) {
          // Where am I? Measured after a scroll or resize, and otherwise at most twice a second.
          if (layout !== pointer.layout || now - measured > 500 || areaOf !== w.within) {
            const box = el.getBoundingClientRect();
            cx = box.left + box.width / 2; cy = box.top + box.height / 2;
            area = w.within ? w.within.getBoundingClientRect() : null; areaOf = w.within;
            measured = now;
          }
          moves = pointer.moves; layout = pointer.layout;
          const a = area;
          if (!pointer.on) r.stop();
          else if (!a) {
            const to = lookFor(w.size, pointer.x - cx, cy - pointer.y, Math.max(window.innerWidth, window.innerHeight), w.feel);
            r.look(to.x, to.y);
          } else if (pointer.x >= a.left && pointer.x <= a.right && pointer.y >= a.top && pointer.y <= a.bottom) {
            const to = lookWithin(w.size, pointer.x - cx, cy - pointer.y, { left: cx - a.left, right: a.right - cx, up: cy - a.top, down: a.bottom - cy }, w.feel);
            r.look(to.x, to.y);
          } else r.stop();
        } else if (!w.follow && moves !== -2) { r.stop(); moves = -2; }
        r.setLevel(w.level ? w.level() : 0);
        // A long gap (a background tab coming back) is one ordinary step, not a jump.
        if (r.step(Math.min(dt, 100))) draw();
        if (r.resting) wake();
      };

      live = { draw, wake };
      const unseen = onSeen(el, (on) => { seen = on; wake(); });
      return () => { unseen(); seen = false; wake(); live = null; };
    },
    // The first picture, and again whenever reduced motion is turned on (the still picture) or off (it carries on).
    motion() { live?.draw(); live?.wake(); },
    follow(on) { if (on) watchPointer(); },
    // A new shape: the body morphs into it (the eyes shrink to dots, the new body lands with a tilt and blinks).
    // A new size is drawn at once. With reduced motion there is no morph: the new shape is simply there.
    shape() {
      const now = live;
      if (!now) return;
      // (Another name for the same body at the same size changes nothing: under reduced motion it would rebuild.)
      if (want.body === shown.body && want.size === shown.size) return;
      shown = { body: want.body, size: want.size };
      if (reducedMotion()) {
        // The new rig wears the face and does what the old one was told, so they are there when motion comes back.
        rig = build();
        if (faced) rig.setFace(props.face ?? 'neutral');
        doing(rig);
      } else rig.setBody(want.body);
      now.draw();
      now.wake();
    },
    // The face it wears when idle. (Called before doing(), so that at first an activity's own face wins.)
    face(name) {
      if (name === undefined && !faced) return;
      faced = name !== undefined;
      rig.setFace(name ?? 'neutral');
      // (Under reduced motion nothing ticks, so the still picture, which wears the face, is drawn again now.)
      if (reducedMotion()) live?.draw();
      live?.wake();
    },
    // What it is doing, and where it rests when it is doing nothing.
    doing() {
      doing(rig);
      if (reducedMotion()) live?.draw();
      live?.wake();
    },
    poke(kind) {
      if (reducedMotion()) return;
      rig.poke(kind);
      live?.wake();
    },
    play(name, cue) {
      if (reducedMotion()) return false;
      const played = rig.play(name, cue);
      live?.wake();
      return played;
    },
    visit(shape, stay) {
      if (reducedMotion()) return;
      rig.visit(bodyOf(shape), stay);
      live?.wake();
    },
  };
}
