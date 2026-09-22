/**
 * Pure helpers for turning a Tiled tile-layer gid into "which tileset, which
 * tile, drawn how". Deliberately free of Pixi so the mapping — firstgid
 * offsets, flip flags, empty/unknown gids — is unit-testable on its own.
 *
 * @see https://doc.mapeditor.org/en/stable/reference/global-tile-ids/
 */

/** Top bits Tiled packs into a gid to flip/rotate the tile it names. */
export const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
export const FLIPPED_VERTICALLY_FLAG = 0x40000000;
export const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
/** Only meaningful on hexagonal maps; stripped and otherwise ignored here. */
export const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

const FLAG_MASK =
  FLIPPED_HORIZONTALLY_FLAG |
  FLIPPED_VERTICALLY_FLAG |
  FLIPPED_DIAGONALLY_FLAG |
  ROTATED_HEXAGONAL_120_FLAG;

/** A raw layer gid split into the tile it names and how to flip it. */
export interface DecodedGid {
  /** Global tile id with every flag bit cleared; `0` means "no tile". */
  gid: number;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
}

/**
 * Splits a raw gid (as stored in a tile layer's `data`) into its tile id and
 * flip flags. Uses unsigned arithmetic so a gid with the horizontal-flip bit
 * set — which is negative as a signed 32-bit int — decodes correctly.
 */
export function decodeGid(raw: number): DecodedGid {
  const unsigned = raw >>> 0;
  return {
    gid: (unsigned & ~FLAG_MASK) >>> 0,
    flippedHorizontally: (unsigned & FLIPPED_HORIZONTALLY_FLAG) !== 0,
    flippedVertically: (unsigned & FLIPPED_VERTICALLY_FLAG) !== 0,
    flippedDiagonally: (unsigned & FLIPPED_DIAGONALLY_FLAG) !== 0,
  };
}

/**
 * The parts of a tileset needed to locate a tile's pixels in its image —
 * the gid-resolution subset of the loader's full tileset description.
 */
export interface TilesetGeometry {
  /** The first gid this tileset covers, from the map's tileset reference. */
  firstgid: number;
  tileWidth: number;
  tileHeight: number;
  /** Number of tiles in the tileset; local ids run `0..tileCount - 1`. */
  tileCount: number;
  columns: number;
  /** Pixels around the tile grid's outer edge. */
  margin: number;
  /** Pixels between adjacent tiles. */
  spacing: number;
}

export interface ResolvedTile<T extends TilesetGeometry> {
  tileset: T;
  /** Tile id local to {@link tileset}: `gid - tileset.firstgid`. */
  localId: number;
}

/**
 * Finds the tileset a (flag-free) gid belongs to: the one with the highest
 * `firstgid` not above it, as Tiled defines it. Returns `undefined` for
 * the empty gid `0`, for a gid below every tileset, and for one past the end
 * of the tileset it lands in, so a caller can draw nothing rather than
 * throw on bad data.
 *
 * `tilesets` needn't be sorted.
 */
export function resolveGid<T extends TilesetGeometry>(
  gid: number,
  tilesets: readonly T[]
): ResolvedTile<T> | undefined {
  if (gid <= 0 || !Number.isInteger(gid)) {
    return undefined;
  }

  let owner: T | undefined;
  for (const tileset of tilesets) {
    if (tileset.firstgid <= gid && (!owner || tileset.firstgid > owner.firstgid)) {
      owner = tileset;
    }
  }
  if (!owner) {
    return undefined;
  }

  const localId = gid - owner.firstgid;
  if (localId >= owner.tileCount) {
    return undefined;
  }
  return { tileset: owner, localId };
}

export interface TileFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixel rectangle of a tileset-local tile id within the tileset's image. */
export function tileFrame(tileset: TilesetGeometry, localId: number): TileFrame {
  const column = localId % tileset.columns;
  const row = Math.floor(localId / tileset.columns);
  return {
    x: tileset.margin + column * (tileset.tileWidth + tileset.spacing),
    y: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
    width: tileset.tileWidth,
    height: tileset.tileHeight,
  };
}

/**
 * A tile's flip flags expressed as a rotation followed by a per-axis sign,
 * which is how a Pixi display object composes its own local transform
 * (`rotate(rotation) · scale(scaleX, scaleY)`), applied about the tile's
 * centre.
 */
export interface TileOrientation {
  rotation: number;
  scaleX: 1 | -1;
  scaleY: 1 | -1;
}

/**
 * Converts Tiled's flip flags into a {@link TileOrientation}. Tiled applies
 * the diagonal flip (swap x/y) first, then the horizontal flip, then the
 * vertical one; composing those gives a signed permutation matrix, which
 * this re-expresses as rotation-then-scale.
 */
export function tileOrientation(
  flags: Pick<DecodedGid, 'flippedHorizontally' | 'flippedVertically' | 'flippedDiagonally'>
): TileOrientation {
  const h = flags.flippedHorizontally ? -1 : 1;
  const v = flags.flippedVertically ? -1 : 1;

  if (!flags.flippedDiagonally) {
    return { rotation: 0, scaleX: h, scaleY: v };
  }

  // Diagonal swap then flips: (x, y) -> (h * y, v * x), i.e. the matrix
  // [[0, h], [v, 0]]. A 90° rotation R = [[0, -1], [1, 0]] times
  // diag(sx, sy) is [[0, -sy], [sx, 0]], so sx = v and sy = -h.
  return {
    rotation: Math.PI / 2,
    scaleX: v as 1 | -1,
    scaleY: -h as 1 | -1,
  };
}
