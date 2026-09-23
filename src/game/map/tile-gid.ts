/**
 * Pure helpers for turning a Tiled tile-layer gid into "which tileset, which
 * tile". Deliberately free of Pixi so the mapping — firstgid offsets,
 * empty/unknown gids — is unit-testable on its own.
 *
 * @see https://doc.mapeditor.org/en/stable/reference/global-tile-ids/
 */

/**
 * The top four bits of a raw gid: Tiled's horizontal, vertical and
 * diagonal flip flags plus the hexagonal 120° rotation flag.
 */
const GID_FLAG_MASK = 0xf0000000;

/**
 * The tile a raw layer gid names, with every flip/rotation flag bit
 * cleared; `0` means "no tile". Flips aren't rendered, so a flipped gid is
 * drawn as its unflipped tile. Unsigned arithmetic, so a gid with the
 * horizontal-flip bit set — negative as a signed 32-bit int — decodes too.
 */
export function decodeGid(raw: number): number {
  return (raw & ~GID_FLAG_MASK) >>> 0;
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
