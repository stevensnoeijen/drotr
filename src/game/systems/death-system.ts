import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';

/**
 * Gametime, in seconds, a dead unit's corpse stays in the world before
 * {@link createDeathSystem} removes it — the "units vanish 5 minutes after
 * they died" visual milestone.
 */
export const DEATH_REMOVAL_DELAY_SECONDS = 5 * 60;

/**
 * Two-phase death: reaching 0 HP marks an entity `dead` rather than removing
 * it outright, and only the delayed sweep below actually calls
 * `world.remove`. A corpse needs to keep existing in the world for
 * {@link DEATH_REMOVAL_DELAY_SECONDS} — `RenderSystem` still draws it (dead
 * z-order, death mark) and the battle isn't "over" from a spectator's
 * perspective the instant the last blow lands — so this can't be a single
 * `health.current <= 0` -> `world.remove` step.
 *
 * `queries.living` (not `queries.dead`) is what's scanned to *mark* deaths.
 * That keeps the marking pass reading the same "still alive?" predicate
 * every other combat system reads (`health.current <= 0`), while the
 * `dead.elapsed` countdown is only ever ticked for entities already marked —
 * an entity is marked exactly once, on the tick its HP first reaches 0,
 * never re-marked or reset by later damage (there is none: `CombatSystem`
 * skips a dead unit's own swings, and a would-be attacker drops a dead
 * target's `Target` on the same tick — see `combat-system.ts`).
 *
 * Removal (`world.remove`) is deliberately this system's *only* job past
 * marking: every other required cleanup — the Pixi container
 * (`RenderSystem`), dangling `Target` references (`DeathCleanupSystem`), and
 * the unit's own spatial-hash claim (already released the instant it dies,
 * in `CellOccupancySystem`) — reacts to that removal (or, for the occupancy
 * grid, to the death itself) via its own hook rather than being called out
 * to from here.
 */
export function createDeathSystem(queries: Queries): System {
  return (world: World<Entity>, dt: number) => {
    for (const entity of queries.living) {
      if (entity.health.current <= 0 && !entity.dead) {
        // `world.addComponent`, not a direct `entity.dead = ...` assignment:
        // `queries.dead` requires `dead`, and only going through the world
        // (rather than mutating the entity object in place) reindexes it
        // into that query so the loop below sees it this same tick.
        world.addComponent(entity, 'dead', { elapsed: 0 });
        // A dying unit is dropped from `queries.selected` (rather than left
        // there for the whole removal delay) so nothing downstream — a
        // subsequent move order, most notably — can still act on a corpse
        // as if it were the live unit the player selected. Selection is
        // only ever meant to land on a living unit.
        if (entity.selected) {
          world.removeComponent(entity, 'selected');
        }
      }
    }

    // Snapshotted: `world.remove` reindexes `queries.dead` (an entity that
    // was in it stops matching), which would otherwise mutate the query
    // out from under a live iteration over it.
    for (const entity of [...queries.dead]) {
      entity.dead.elapsed += dt;
      if (entity.dead.elapsed >= DEATH_REMOVAL_DELAY_SECONDS) {
        world.remove(entity);
      }
    }
  };
}
