/**
 * A selectable map: terrain and named, team-agnostic spawn points. Chosen
 * independently of a scenario (see `~/game/scenarios`) via `?map=`; the
 * scenario decides what — if anything — to spawn at each of its spawn
 * points.
 */
export interface MapDefinition {
  id: string;
  title: string;
  description: string;
  /**
   * Path to a `.tmj` Tiled map to load and render via
   * `~/game/map/loadTiledMap`. Omitted for a blank canvas with no terrain
   * or spawn points.
   */
  mapSource?: string;
}
