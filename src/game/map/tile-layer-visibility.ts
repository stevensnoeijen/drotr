import type { MapTileLayer } from './load-tiled-map';

/**
 * Runtime show/hide state for a map's tile layers, behind the `tile-layers`
 * debug option. Pure, so the rules are testable without Pixi: the renderer
 * just applies whatever {@link effectiveTileLayerVisibility} returns. Layers
 * are addressed by index into `ParsedMap.tileLayers` (names aren't
 * guaranteed unique). Display only: collision never depends on any of it.
 */

/** What the debug menu needs to know about one tile layer. */
export interface TileLayerInfo {
  readonly name: string;
  /** Whether the map shows the layer by default (its Tiled `visible` flag). */
  readonly visible: boolean;
}

/** Each layer's name and default visibility, without its tile data. */
export function tileLayerInfo(layers: readonly MapTileLayer[]): TileLayerInfo[] {
  return layers.map(({ name, visible }) => ({ name, visible }));
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
 * `tile-layers` option is `enabled`, otherwise the map's defaults — so with
 * the option off, the map renders exactly as it would without it. Toggles
 * that don't match `layers` (e.g. left over from another map) are ignored.
 */
export function effectiveTileLayerVisibility(
  layers: readonly TileLayerInfo[],
  visibility: readonly boolean[] | undefined,
  enabled: boolean
): boolean[] {
  if (!enabled || !visibility || visibility.length !== layers.length) {
    return defaultTileLayerVisibility(layers);
  }
  return [...visibility];
}
