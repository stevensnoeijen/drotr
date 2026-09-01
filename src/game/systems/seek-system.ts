import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { CELL_SIZE } from '~/lib/grid';

/**
 * For every entity with a `Target`, points `Velocity` straight at the
 * target's current position, scaled to the entity's `MoveSpeed`. Once the
 * entity is within `attackRange` (converted from grid cells to world units)
 * of the target, `Velocity` is zeroed instead so the entity comes to rest
 * at that range rather than sliding past it.
 *
 * The velocity magnitude is clamped, on the final approaching step, to
 * exactly close the remaining gap to `attackRange` over `dt` — i.e. capped
 * at `(distance - rangeWorld) / dt` instead of always `moveSpeed`. Without
 * this, `MoveVelocitySystem` would integrate a full-speed step that could
 * carry the entity past the range boundary before the next tick's seek call
 * ever notices — the "no jitter or overshoot" requirement of #131 means the
 * stop has to be exact, not just eventually corrected.
 *
 * Deliberately straight-line only: no A*, no obstacle avoidance, no
 * waypoints. That's #88/#89's job once maps have obstacles between spawns —
 * see ticket #131. An entity with no `target`, or whose target no longer
 * resolves to a live entity, is left alone: `SeekSystem` never touches its
 * velocity, so any velocity set by another system (or a previous seek) is
 * untouched by this pass except where a target is actually present.
 *
 * Requires `moveSpeed` and `attackRange`: an entity missing either can't be
 * meaningfully sought toward (no known speed, or no known stopping
 * distance), so it's skipped rather than guessing a default.
 */
export function createSeekSystem(queries: Queries): System {
  return (world: World<Entity>, dt: number) => {
    for (const self of queries.movable) {
      const { target, attackRange } = self;
      if (!target || !attackRange) {
        continue;
      }

      const other = findEntityById(world.entities, target.entityId);
      if (!other?.transform) {
        continue;
      }

      const dx = other.transform.position.x - self.transform.position.x;
      const dy = other.transform.position.y - self.transform.position.y;
      const distance = Math.hypot(dx, dy);
      const rangeWorld = attackRange.value * CELL_SIZE;
      const remaining = distance - rangeWorld;

      if (remaining <= 0) {
        self.velocity.x = 0;
        self.velocity.y = 0;
        continue;
      }

      // Cap the step so it can't cross the range boundary: on approach's
      // last tick, `remaining / dt` is smaller than `moveSpeed`, and the
      // resulting step lands the entity exactly at `rangeWorld`.
      const speed = dt > 0 ? Math.min(self.moveSpeed.value, remaining / dt) : self.moveSpeed.value;
      self.velocity.x = (dx / distance) * speed;
      self.velocity.y = (dy / distance) * speed;
    }
  };
}
