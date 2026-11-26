// What the build gives the page (scripts/build-site.mjs).

/** The design prompt, as text. */
declare module '*.md' {
  const text: string;
  export default text;
}

/** Prebuilt gallery and Dot thumbnails, keyed by collection and shape id. */
declare const __THUMBS__: Record<string, [string, string, string]>;
/** The size the thumbnails were drawn for. */
declare const __THUMB__: number;
