import { World } from 'miniplex';

import type { Entity } from './entity';

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
    /**
     * Anything that can acquire a target: has a position, a team, an aggro
     * (detection) range, and can be alive or dead. {@link PerceptionSystem}
     * iterates this as the "self" side of its nearest-enemy scan.
     */
    targeting: world.with('transform', 'team', 'aggroRange', 'health'),
    /**
     * Anything that can be perceived and targeted — the candidate pool on
     * the other side of {@link PerceptionSystem}'s scan (and any other
     * combat system that needs "every unit with a team, alive or dead").
     */
    combatants: world.with('transform', 'team', 'health'),
    /**
     * Anything that can actually land an attack: a combatant that also knows
     * how far it can reach (`attackRange`), how hard it hits (`damage`) and
     * how often (`attackCooldown`). {@link CombatSystem} iterates this as the
     * attacker side of its swing scheduling. A unit missing any of the three
     * (a legacy inline definition with no combat stats) is deliberately
     * excluded rather than defaulted — it can still be targeted and killed
     * via `combatants`, it just never swings back.
     */
    attackers: world.with(
      'transform',
      'team',
      'health',
      'attackRange',
      'damage',
      'attackCooldown'
    ),
  } as const;
}

export type Queries = ReturnType<typeof createQueries>;

/**
 * Finds the entity in `entities` whose {@link Entity.id} matches `id`, or
 * `undefined` if none does. A plain linear scan — fine at this unit-count
 * scale — used wherever a component stores another entity's id (e.g.
 * {@link Target.entityId}) and needs resolving back to the entity itself.
 *
 * Generic in the element type so searching an archetype query hands back that
 * archetype, not a bare {@link Entity}: resolving a target against
 * `queries.combatants` yields something already known to have `transform`,
 * `team` and `health`, which is exactly what a caller then wants to read off
 * it.
 */
export function findEntityById<T extends Entity>(entities: Iterable<T>, id: number): T | undefined {
  for (const entity of entities) {
    if (entity.id === id) {
      return entity;
    }
  }
  return undefined;
}

/** The single, shared game world. */
export const world = new World<Entity>();

/** Archetype queries over the shared {@link world}. */
export const queries = createQueries(world);
