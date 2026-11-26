import type { dotRendering } from '../dot-rendering';

/** Regular blot avatars can use the shared coat renderer without loading the Dot collection. */
export let dotRenderer: typeof dotRendering | undefined;

export function enableDotRenderer(renderer: typeof dotRendering): void {
  dotRenderer = renderer;
}
