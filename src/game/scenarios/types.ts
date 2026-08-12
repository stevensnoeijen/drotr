import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/types';

/**
 * Name of a system in a future system registry. No such registry exists yet
 * (systems land starting with movement/pathfinding); kept as a plain string
 * so scenarios can already declare a systems subset once it does.
 */
export type SystemName = string;

/**
 * A single, independently loadable and re-verifiable demo of the engine.
 * Registered in {@link file://./index.ts} and resolved from the URL via
 * `?scenario=<id>`, so every milestone's demo survives later milestones
 * instead of being dismantled by them.
 */
export interface Scenario {
  /** Stable id, referenced from the URL as `?scenario=<id>`. */
  id: string;
  title: string;
  description: string;
  /** Default map name, overridable via `?map=<name>`. */
  map: string;
  /**
   * Path to a `.tmj` Tiled map to load and render via
   * `~/game/map/loadTiledMap`. When set, `GameCanvas` draws the parsed
   * terrain and spawns units from it in addition to running `setup`.
   */
  mapSource?: string;
  /** Seeds the world with whatever this scenario needs to demonstrate. */
  setup(world: World<Entity>): void;
  /** Subset of systems to run this tick. Defaults to all systems. */
  systems?: SystemName[];
}
