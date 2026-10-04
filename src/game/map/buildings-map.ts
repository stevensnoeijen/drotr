import { loadTiledMap, type ParsedMap } from './load-tiled-map';

let cached: Promise<ParsedMap> | undefined;

/**
 * The parsed `buildings.tmj`, the source of the prefabs drawn onto county
 * construction sites. Fetched once and shared; a failed load isn't cached,
 * so a later call retries.
 */
export function loadBuildingsMap(): Promise<ParsedMap> {
  if (!cached) {
    const pending = loadTiledMap(`${import.meta.env.BASE_URL}maps/buildings.tmj`);
    pending.catch(() => {
      if (cached === pending) {
        cached = undefined;
      }
    });
    cached = pending;
  }
  return cached;
}
