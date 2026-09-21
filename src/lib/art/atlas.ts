import type { PcxImage } from './pcx';
import {
  extractRgbaRect,
  TEAL_COLOR_KEY,
  type Rgb,
  type RgbaPixels,
} from './rgba';

/**
 * Geometry of the tile atlas held in `ART/BATTLE.ART`.
 *
 * The sheet is one flat, row-major grid of square tiles; a `.MAP` cell
 * stores a single index into it.
 *
 * The tile size was measured rather than assumed. Summing per-pixel edge
 * energy down every column (and across every row) of the opaque terrain
 * region and scoring each candidate period shows a clear fundamental at 40
 * px on both axes — 80 shows up only as its harmonic, and 64 does not
 * register at all. That is corroborated independently by the map data: a
 * multi-tile object placed in a county `.MAP` steps by +1 between
 * horizontally adjacent cells and by +16 between vertically adjacent ones,
 * which is exactly a 16-column grid, and 640 / 40 = 16.
 */
export const ATLAS_TILE_SIZE = 40;

/** A tile's position in the atlas, in pixels. */
export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How many whole tiles fit across a sheet of the given pixel width. */
export function tileColumns(imageWidth: number): number {
  return Math.floor(imageWidth / ATLAS_TILE_SIZE);
}

/**
 * How many whole tile rows fit in a sheet of the given pixel height.
 *
 * `BATTLE.ART` is 640x9367, which is not an exact multiple of the tile
 * size: the final 7 pixel rows are a partial row carrying no usable tile.
 */
export function tileRows(imageHeight: number): number {
  return Math.floor(imageHeight / ATLAS_TILE_SIZE);
}

/** How many complete tiles a sheet of the given pixel size holds. */
export function tileCount(imageWidth: number, imageHeight: number): number {
  return tileColumns(imageWidth) * tileRows(imageHeight);
}

/**
 * Where tile `index` sits in a sheet of the given pixel width, using the
 * flat row-major numbering the `.MAP` files index by:
 * `index = row * columns + column`.
 *
 * Returns the rect whether or not the sheet is actually tall enough to
 * contain it; callers that care should check against {@link tileCount}.
 */
export function tileRect(index: number, imageWidth: number): TileRect {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(
      `tile index must be a non-negative integer, got ${index}`
    );
  }
  const columns = tileColumns(imageWidth);
  if (columns <= 0) {
    throw new RangeError(
      `an image ${imageWidth}px wide holds no ${ATLAS_TILE_SIZE}px tiles`
    );
  }
  return {
    x: (index % columns) * ATLAS_TILE_SIZE,
    y: Math.floor(index / columns) * ATLAS_TILE_SIZE,
    width: ATLAS_TILE_SIZE,
    height: ATLAS_TILE_SIZE,
  };
}

/**
 * Copies a single atlas tile out as its own RGBA buffer, with the colour
 * key resolved to alpha.
 *
 * @throws {RangeError} if the tile isn't complete in this image.
 */
export function extractTileRgba(
  image: PcxImage,
  index: number,
  colorKey: Rgb | null = TEAL_COLOR_KEY
): RgbaPixels {
  const total = tileCount(image.width, image.height);
  if (index >= total) {
    throw new RangeError(
      `tile ${index} is outside the ${total} complete tiles of a ${image.width}x${image.height} sheet`
    );
  }
  return extractRgbaRect(image, tileRect(index, image.width), colorKey);
}
