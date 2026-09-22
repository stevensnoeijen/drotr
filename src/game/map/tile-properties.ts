/**
 * Custom Tiled tile properties the engine reads. Shared with the tileset
 * exporter in `scripts/terrain-tileset`, which writes them.
 */

/**
 * Boolean property set to `true` on every tile a unit can't stand on. It's
 * left off walkable tiles entirely: Tiled reads a missing bool property as
 * `false`, so a tileset only has to mark the tiles that block.
 */
export const BLOCKED_TILE_PROPERTY = 'blocked';
