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
  /**
   * Restricts which scenarios can be launched with this map, by id. When
   * set, only scenarios whose `id` appears here are compatible with this
   * map (checked by `isScenarioCompatibleWithMap` in
   * `~/game/scenarios/compatibility`); when omitted, this map imposes no
   * restriction and works with any scenario the scenario side allows.
   */
  allowedScenarioIds?: readonly string[];
}
