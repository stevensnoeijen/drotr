/**
 * Pure helpers for turning a Tiled tile-layer gid into the tile it names.
 * Deliberately free of Pixi so the mapping — firstgid offsets,
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
}

/**
 * The tile id local to `tileset` that a (flag-free) gid names:
 * `gid - tileset.firstgid`. Returns `undefined` for the empty gid `0`, a gid
 * below the tileset's `firstgid`, or one past its last tile, so a caller can
 * draw nothing rather than throw on bad data.
 */
export function resolveGid(gid: number, tileset: TilesetGeometry): number | undefined {
  if (gid <= 0 || !Number.isInteger(gid)) {
    return undefined;
  }
  const localId = gid - tileset.firstgid;
  return localId >= 0 && localId < tileset.tileCount ? localId : undefined;
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
    x: column * tileset.tileWidth,
    y: row * tileset.tileHeight,
    width: tileset.tileWidth,
    height: tileset.tileHeight,
  };
}
