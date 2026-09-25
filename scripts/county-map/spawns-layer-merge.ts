import type { TiledLayerObjectgroup, TiledMap } from 'tiled-types';

/**
 * Converters always regenerate the `spawns` layer empty (spawn points are
 * placed by hand in the Tiled editor afterwards, not derived from the
 * source `.MAP` data). To make a rerun of a converter reproduce a
 * previously committed `.tmj` byte-for-byte, this carries the `spawns`
 * object layer already present in a previous version of the map into the
 * freshly built one, leaving every other layer (terrain, collision, etc.)
 * exactly as freshly built.
 *
 * Returns `map` unchanged if `previous` has no `spawns` layer, or if `map`
 * has none to replace.
 */
export function withPreviousSpawns(
  map: TiledMap,
  previous: TiledMap | undefined
): TiledMap {
  const previousSpawns = previous?.layers.find(isSpawnsLayer);
  if (!previousSpawns) {
    return map;
  }

  let replaced = false;
  const layers = map.layers.map((layer) => {
    if (isSpawnsLayer(layer)) {
      replaced = true;
      return previousSpawns;
    }
    return layer;
  });

  return replaced ? { ...map, layers } : map;
}

function isSpawnsLayer(layer: {
  name: string;
}): layer is TiledLayerObjectgroup {
  return layer.name === 'spawns';
}
