import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/load-tiled-map';

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
 *
 * A scenario is chosen independently of a map (see `~/game/maps`,
 * `?map=<id>`) — it doesn't own a fixed map, it just reacts to whichever one
 * was picked.
 */
export interface Scenario {
  /** Stable id, referenced from the URL as `?scenario=<id>`. */
  id: string;
  title: string;
  description: string;
  /**
   * Seeds the world with whatever this scenario needs to demonstrate. `map`
   * is the loaded map (its parsed spawns included) once it has resolved —
   * `undefined` for the blank map, or if it failed to load.
   */
  setup(world: World<Entity>, map?: ParsedMap): void;
  /** Subset of systems to run this tick. Defaults to all systems. */
  systems?: SystemName[];
  /**
   * Checks whether `map` (the loaded map, or `undefined` for the blank map
   * or a failed load) satisfies whatever this scenario requires of it —
   * e.g. named spawn points `setup` will call `claimSpawn` against. Returns
   * a human-readable reason the combination can't be used, or `undefined`
   * when it's fine. Most scenarios need nothing from the map and can leave
   * this unset; one that does should implement it rather than have `setup`
   * silently spawn nothing (or throw) for a map that doesn't fit.
   */
  validateMap?(map?: ParsedMap): string | undefined;
}
