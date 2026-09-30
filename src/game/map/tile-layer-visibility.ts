import type { MapObjectLayer, MapTileLayer } from './load-tiled-map';

/**
 * Runtime show/hide state for a map's layers, behind the `tile-layers`
 * debug option. Pure, so the rules are testable without Pixi: the renderer
 * just applies whatever {@link effectiveTileLayerVisibility} returns. Layers
 * are addressed by index into the list {@link mapLayerInfo} builds: the
 * tile layers (`ParsedMap.tileLayers`), then the object layers
 * (`ParsedMap.objectLayers`). Names aren't guaranteed unique. Display only:
 * collision never depends on any of it.
 */

/** What the debug menu needs to know about one map layer. */
export interface TileLayerInfo {
  readonly name: string;
  /**
   * Whether the layer is shown by default (its Tiled `visible` flag). An
   * object layer is only ever drawn while the debug option is on.
   */
  readonly visible: boolean;
  /** A tile layer, or an object layer (spawns, constructions, ...). */
  readonly kind: 'tile' | 'object';
}

/** Each tile layer's name and default visibility, without its tile data. */
export function tileLayerInfo(layers: readonly MapTileLayer[]): TileLayerInfo[] {
  return layers.map(({ name, visible }) => ({ name, visible, kind: 'tile' }));
}

/** Every layer of a map, tile layers first, then object layers. */
export function mapLayerInfo(map: {
  readonly tileLayers: readonly MapTileLayer[];
  readonly objectLayers: readonly MapObjectLayer[];
}): TileLayerInfo[] {
  return [
    ...tileLayerInfo(map.tileLayers),
    ...map.objectLayers.map(({ name, visible }) => ({ name, visible, kind: 'object' as const })),
  ];
}

/** Every layer's visibility as the map itself sets it. */
export function defaultTileLayerVisibility(layers: readonly TileLayerInfo[]): boolean[] {
  return layers.map((layer) => layer.visible);
}

/**
 * Flips one layer in `visibility` (the layers' current state, or `undefined`
 * for "still the map's defaults"), returning a new array. An out-of-range
 * index changes nothing.
 */
export function toggleTileLayer(
  layers: readonly TileLayerInfo[],
  visibility: readonly boolean[] | undefined,
  index: number
): boolean[] {
  const current = visibility && visibility.length === layers.length ? [...visibility] : defaultTileLayerVisibility(layers);
  if (index >= 0 && index < current.length) {
    current[index] = !current[index];
  }
  return current;
}

/**
 * What each layer should actually show: the toggled state while the
 * `tile-layers` option is `enabled` (or the map's defaults, before any
 * toggle). With the option off, tile layers show as the map sets them and
 * object layers don't show at all, so the map renders exactly as it would
 * without the option. Toggles that don't match `layers` (e.g. left over
 * from another map) are ignored.
 */
export function effectiveTileLayerVisibility(
  layers: readonly TileLayerInfo[],
  visibility: readonly boolean[] | undefined,
  enabled: boolean
): boolean[] {
  if (!enabled) {
    return layers.map((layer) => layer.kind === 'tile' && layer.visible);
  }
  if (!visibility || visibility.length !== layers.length) {
    return defaultTileLayerVisibility(layers);
  }
  return [...visibility];
}
