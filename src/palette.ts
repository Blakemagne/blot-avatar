// blot's Bot colours: the ones blot's Create New Bot picker offers, in its order, as the body colours to start from.

/**
 * blot's Bot colours, `[hex, name]`, in the order blot's picker shows them. Orange is the default (`#FD690F`).
 * Black is `#000000` here; blot itself paints a black Bot in the theme's ink (ink on a light page, light ink on a
 * dark one, the eyes the other way round). On a page, pass `fill` and `eyeFill` as CSS values to do the same.
 */
export const BOT_COLOURS: readonly (readonly [hex: string, name: string])[] = [
  ['#000000', 'Black'],
  ['#A06B39', 'Brown'],
  ['#FB2B3E', 'Red'],
  ['#FD690F', 'Orange'],
  ['#F59312', 'Yellow'],
  ['#14C16F', 'Green'],
  ['#13B7A2', 'Cyan'],
  ['#1E86FC', 'Blue'],
  ['#8F59F9', 'Violet'],
  ['#F93498', 'Magenta'],
  ['#959595', 'Gray'],
];
