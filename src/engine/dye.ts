// Ported from open-bot-avatar (MIT): dom/fluffy/dye.ts and the OKLCH maths in color.ts, by Dominik Scholz.
//
// How a coat takes its colour: one row of colours per dye, from the darkest recess to the brightest lit tip.
// The coat's shader works out how much light a fibre catches and looks the colour up in this row, so every dye
// keeps its hue and the same perceived contrast through the same range of shading. Pure maths: no DOM.

/** A colour as sRGB bytes, 0..255 each. */
export type Rgb = readonly [r: number, g: number, b: number];

/** Colours in a ramp. */
export const DYE_RAMP_SIZE = 96;
/** Exposure at the bright end of a ramp; 1 is the dye's own colour. */
export const DYE_RAMP_RANGE = 2.4;

const ramps = new Map<number, Uint8Array>();

const toLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** A colour as OKLCH: lightness 0..1, chroma, hue in degrees (0..360). */
export function toOklch(c: Rgb): [L: number, C: number, h: number] {
  const r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h];
}

/** OKLCH to linear sRGB, unclamped. */
function oklchLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** An OKLCH colour as sRGB (0..255, not rounded), its chroma lowered as far as it takes to fit; lightness and hue are kept. */
export function oklch(L: number, C: number, h: number): [number, number, number] {
  const fits = (c: number) => oklchLinear(L, c, h).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let lo = 0, hi = C;
  if (!fits(hi)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  const [r, g, b] = oklchLinear(L, hi, h);
  return [fromLinear(r), fromLinear(g), fromLinear(b)];
}

/** Keep regular lightness steps through the midtones, rolling off near black and white. */
function shoulder(distance: number, room: number): number {
  const knee = room / 2;
  return distance <= knee ? distance : room - knee * Math.exp((knee - distance) / knee);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * The ramp for a body colour: DYE_RAMP_SIZE texels of RGBA bytes, texel i at exposure (i + 0.5) * DYE_RAMP_RANGE
 * / DYE_RAMP_SIZE (sample it as a 96 x 1 texture with linear filtering at u = exposure / DYE_RAMP_RANGE). RGB is
 * the colour at that exposure. Alpha, the same all along the row, is how far the shader swaps it for its own
 * linear-RGB fibre colour, which yellows need (amber through lemon: 255; every other hue: 0; in between, a blend).
 * Kept for the last 64 colours asked for. Do not change the array you get.
 */
export function dyeRamp(rgb: Rgb): Uint8Array {
  const key = (byte(rgb[0]) << 16) | (byte(rgb[1]) << 8) | byte(rgb[2]);
  const cached = ramps.get(key);
  if (cached) return cached;
  const [lightness, chroma, hue] = toOklch(rgb);
  // Amber through lemon keep separate diffuse and glint colours, fading into the shared ramp for neighbouring
  // hues, pale creams and dark olives.
  const yellow = (1 - smoothstep(22, 32, Math.abs(hue - 90))) * smoothstep(0.025, 0.085, chroma) * smoothstep(0.54, 0.75, lightness);
  // The dye bounds the brightest tip. Where a channel is already full, the other dyed channels lift more than
  // the weakest one.
  const value = Math.max(rgb[0], rgb[1], rgb[2]);
  const dye = [0, 1, 2].map((i) => (value ? rgb[i] / value : 1));
  const weakest = Math.min(...dye);
  const peak = dye.map((channel) => 255 * (channel + (1 - channel) * (0.16 + 0.84 * (channel - weakest)))) as unknown as Rgb;
  const [peakLightness] = toOklch(peak);
  // Even black, white and fully saturated primaries need some headroom.
  const mid = Math.max(0.16, Math.min(lightness, peakLightness - 0.025));
  const midChroma = chroma * Math.min(1, mid / Math.max(0.001, lightness));
  const headroom = peakLightness - mid;
  const row = new Uint8Array(DYE_RAMP_SIZE * 4);
  for (let i = 0; i < DYE_RAMP_SIZE; i++) {
    const exposure = ((i + 0.5) * DYE_RAMP_RANGE) / DYE_RAMP_SIZE;
    // At fixed chromaticity, Oklab lightness goes as the cube root of linear light: carry the excursion of a
    // reference dye over to this one.
    const delta = 0.82 * (Math.cbrt(exposure) - 1);
    const L = delta < 0 ? mid - shoulder(-delta, mid) : mid + shoulder(delta, headroom);
    const [r, g, b] = oklch(L, midChroma * Math.min(1, L / mid), hue);
    row[i * 4] = byte(r); row[i * 4 + 1] = byte(g); row[i * 4 + 2] = byte(b); row[i * 4 + 3] = byte(255 * yellow);
  }
  if (ramps.size >= 64) ramps.delete(ramps.keys().next().value as number);
  ramps.set(key, row);
  return row;
}
