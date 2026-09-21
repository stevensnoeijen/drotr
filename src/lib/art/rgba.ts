import type { PcxImage } from './pcx';

/** An 8-bit-per-channel RGB colour. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The colour the original art uses to mark transparent pixels. The `.ART`
 * files have no alpha channel of their own: sprite and object tiles sit on
 * a flat field of this teal, which the game treats as "draw nothing".
 *
 * In `BATTLE.ART` it occupies exactly one palette slot (index 37), so the
 * key is unambiguous — no other entry shares the value, and no genuine art
 * pixel can accidentally collide with it.
 */
export const TEAL_COLOR_KEY: Rgb = { r: 0, g: 251, b: 192 };

/** Number of bytes per pixel in the RGBA output. */
const RGBA_CHANNELS = 4;

/**
 * Builds a 256-entry RGBA lookup table from a palette, mapping every entry
 * that matches `colorKey` to fully transparent and everything else to fully
 * opaque.
 *
 * Resolving transparency per palette entry rather than per pixel matters:
 * the atlas is ~6M pixels, and roughly 45% of them are the colour key.
 */
function buildLookup(palette: Uint8Array, colorKey: Rgb | null): Uint8Array {
  const lookup = new Uint8Array(256 * RGBA_CHANNELS);
  for (let i = 0; i < 256; i++) {
    const r = palette[i * 3];
    const g = palette[i * 3 + 1];
    const b = palette[i * 3 + 2];
    const transparent =
      colorKey !== null &&
      r === colorKey.r &&
      g === colorKey.g &&
      b === colorKey.b;
    const o = i * RGBA_CHANNELS;
    if (transparent) {
      // Zero the colour too, not just alpha: a premultiplying or
      // interpolating consumer would otherwise bleed teal into the edges of
      // every sprite.
      lookup[o] = 0;
      lookup[o + 1] = 0;
      lookup[o + 2] = 0;
      lookup[o + 3] = 0;
    } else {
      lookup[o] = r;
      lookup[o + 1] = g;
      lookup[o + 2] = b;
      lookup[o + 3] = 255;
    }
  }
  return lookup;
}

/**
 * Straight (non-premultiplied) RGBA pixels, four bytes per pixel.
 *
 * Backed by a plain `ArrayBuffer` rather than the wider `ArrayBufferLike`,
 * which is what `ImageData` — and so any canvas consumer — requires.
 */
export type RgbaPixels = Uint8ClampedArray<ArrayBuffer>;

/**
 * Converts a decoded `.ART` image to straight (non-premultiplied) RGBA,
 * turning the colour key into real alpha.
 *
 * Pass `null` as `colorKey` to keep every pixel opaque.
 */
export function toRgba(
  image: PcxImage,
  colorKey: Rgb | null = TEAL_COLOR_KEY
): RgbaPixels {
  const { width, height, indices, palette } = image;
  const lookup = buildLookup(palette, colorKey);
  const rgba = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i] * RGBA_CHANNELS;
    const dst = i * RGBA_CHANNELS;
    rgba[dst] = lookup[src];
    rgba[dst + 1] = lookup[src + 1];
    rgba[dst + 2] = lookup[src + 2];
    rgba[dst + 3] = lookup[src + 3];
  }
  return rgba;
}

/**
 * Copies one axis-aligned rectangle out of a decoded image as its own
 * tightly packed RGBA buffer, applying the same colour key as
 * {@link toRgba}.
 *
 * @throws {RangeError} if the rectangle falls outside the image.
 */
export function extractRgbaRect(
  image: PcxImage,
  rect: { x: number; y: number; width: number; height: number },
  colorKey: Rgb | null = TEAL_COLOR_KEY
): RgbaPixels {
  const { x, y, width, height } = rect;
  if (
    x < 0 ||
    y < 0 ||
    width < 0 ||
    height < 0 ||
    x + width > image.width ||
    y + height > image.height
  ) {
    throw new RangeError(
      `rect ${x},${y} ${width}x${height} falls outside a ${image.width}x${image.height} image`
    );
  }

  const lookup = buildLookup(image.palette, colorKey);
  const rgba = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  for (let row = 0; row < height; row++) {
    const srcRow = (y + row) * image.width + x;
    for (let col = 0; col < width; col++) {
      const src = image.indices[srcRow + col] * RGBA_CHANNELS;
      const dst = (row * width + col) * RGBA_CHANNELS;
      rgba[dst] = lookup[src];
      rgba[dst + 1] = lookup[src + 1];
      rgba[dst + 2] = lookup[src + 2];
      rgba[dst + 3] = lookup[src + 3];
    }
  }
  return rgba;
}
