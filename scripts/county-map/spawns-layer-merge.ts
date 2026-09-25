import type { TiledLayerObjectgroup, TiledMap, TiledObject } from 'tiled-types';

import { EDGE_SPAWN_PREFIX } from './county-map-tiled';

/**
 * Merges the hand-placed spawn points of a previous version of a map into
 * a freshly built one, so a rerun of a converter reproduces a previously
 * committed `.tmj` byte-for-byte instead of discarding hand edits.
 *
 * - Generated spawns (named with the reserved {@link EDGE_SPAWN_PREFIX})
 *   always come from the freshly built map; any in `previous` are dropped,
 *   since they are rebuilt from the source `.MAP` data.
 * - Every other spawn in `previous` is hand-placed and kept as-is, after
 *   the generated ones. One whose id clashes with a generated spawn's is
 *   given the next free id instead.
 * - `nextobjectid` ends up past every object id in use, and never below
 *   either map's own `nextobjectid`.
 *
 * Every other layer (terrain, collision, etc.) is left exactly as freshly
 * built. Returns `map` unchanged if `previous` has no `spawns` layer, or if
 * `map` has none to merge into.
 */
export function withPreviousSpawns(
  map: TiledMap,
  previous: TiledMap | undefined
): TiledMap {
  const previousSpawns = previous?.layers.find(isSpawnsLayer);
  const builtSpawns = map.layers.find(isSpawnsLayer);
  if (!previous || !previousSpawns || !builtSpawns) {
    return map;
  }

  const generated = builtSpawns.objects;
  const handPlaced = previousSpawns.objects.filter(
    (object) => !isGeneratedSpawn(object)
  );

  const usedIds = new Set(generated.map((object) => object.id));
  let nextId =
    Math.max(
      0,
      ...generated.map((object) => object.id),
      ...handPlaced.map((object) => object.id)
    ) + 1;
  const kept = handPlaced.map((object) => {
    const id = usedIds.has(object.id) ? nextId++ : object.id;
    usedIds.add(id);
    return id === object.id ? object : { ...object, id };
  });

  const objects = [...generated, ...kept];
  const layers = map.layers.map((layer) =>
    layer === builtSpawns ? { ...builtSpawns, objects } : layer
  );

  return {
    ...map,
    nextobjectid: Math.max(map.nextobjectid, previous.nextobjectid, nextId),
    layers,
  };
}

/** Whether `object` is a spawn generated from the source data. */
export function isGeneratedSpawn(object: Pick<TiledObject, 'name'>): boolean {
  return object.name.startsWith(EDGE_SPAWN_PREFIX);
}

function isSpawnsLayer(layer: {
  name: string;
}): layer is TiledLayerObjectgroup {
  return layer.name === 'spawns';
}
