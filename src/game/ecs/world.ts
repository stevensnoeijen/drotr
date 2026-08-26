import { World } from 'miniplex';

import type { Entity } from './types';

/**
 * Named archetype queries over a world. Each query holds exactly the entities
 * that have all of its required components, and stays up to date automatically
 * as components are added and removed. Systems iterate these instead of
 * scanning every entity.
 *
 * Kept as a factory (rather than only module-level constants) so tests can spin
 * up an isolated world with its own queries.
 */
export function createQueries(world: World<Entity>) {
  return {
    /** Anything that can be integrated by the movement system. */
    movable: world.with('transform', 'velocity', 'moveSpeed'),
    /** Anything with a position and a velocity, regardless of speed cap. */
    moving: world.with('transform', 'velocity'),
    /** Anything the renderer should draw. */
    renderable: world.with('transform', 'renderable'),
    /** Anything the player may click to select. */
    selectable: world.with('transform', 'selectable'),
    /** Anything that can be hovered/inspected (debug tooltips). */
    hoverable: world.with('transform', 'hoverable'),
    /** Anything currently selected. */
    selected: world.with('selected'),
    /** Anything that can take damage or die. */
    living: world.with('health'),
  } as const;
}

export type Queries = ReturnType<typeof createQueries>;

/** The single, shared game world. */
export const world = new World<Entity>();

/** Archetype queries over the shared {@link world}. */
export const queries = createQueries(world);
