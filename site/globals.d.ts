// What the build gives the page (scripts/build-site.mjs).

/** The design prompt, as text. */
declare module '*.md' {
  const text: string;
  export default text;
}
