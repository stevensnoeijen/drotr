import type { TiledLayerTilelayer, TiledMap } from 'tiled-types';

/**
 * Merges the blocked cells of a previous version of a map's `collision`
 * layer into a freshly built one, so a rerun of a converter keeps the
 * blocked cells that were added by hand in Tiled.
 *
 * The result is the union of blocked (non-zero) cells: a cell blocked in
 * either layer is blocked, taking the freshly built gid where both are
 * blocked. Blocks the converter derives from the source data therefore
 * still win, while a hand-added block can't be removed by the converter.
 * Hand-cleared cells are not preserved.
 *
 * Every other layer is left exactly as freshly built. Returns `map`
 * unchanged if either map has no `collision` layer, or if the two layers'
 * data differ in size.
 */
export function withPreviousCollision(
  map: TiledMap,
  previous: TiledMap | undefined
): TiledMap {
  const previousLayer = previous?.layers.find(isCollisionLayer);
  const builtLayer = map.layers.find(isCollisionLayer);
  if (
    !previousLayer ||
    !builtLayer ||
    previousLayer.data.length !== builtLayer.data.length
  ) {
    return map;
  }

  const previousData = previousLayer.data;
  const data = builtLayer.data.map((gid, index) =>
    gid === 0 ? previousData[index] : gid
  );
  if (data.every((gid, index) => gid === builtLayer.data[index])) {
    return map;
  }

  return {
    ...map,
    layers: map.layers.map((layer) =>
      layer === builtLayer ? { ...builtLayer, data } : layer
    ),
  };
}

function isCollisionLayer(layer: {
  name: string;
  type: string;
}): layer is TiledLayerTilelayer & { data: number[] } {
  return (
    layer.name === 'collision' &&
    layer.type === 'tilelayer' &&
    Array.isArray((layer as TiledLayerTilelayer).data)
  );
}
