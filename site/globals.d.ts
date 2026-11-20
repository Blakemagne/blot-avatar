// What the build gives the page (scripts/build-site.mjs).

/** The design prompt, as text. */
declare module '*.md' {
  const text: string;
  export default text;
}

/** Each gallery avatar's still, drawn at the build: its body and its two eyes, by id. */
declare const __THUMBS__: Record<string, [string, string, string]>;
/** The size the thumbnails were drawn for. */
declare const __THUMB__: number;
