import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/types';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';

/**
 * Distance, in world units, within which a unit is considered to have
 * arrived at its `MoveTarget` and the order is cleared. Zero would work in
 * theory, but a fixed-step integration can overshoot a zero-width point by a
 * fraction of a unit and then oscillate trying to correct for it; a small
 * tolerance lets the unit settle exactly once instead.
 */
export const ARRIVAL_TOLERANCE = 1;

/**
 * For every entity with a `MoveTarget`, points `Velocity` straight at the
 * order's destination, scaled to the entity's `MoveSpeed` — the same
 * straight-line seek shape as `SeekSystem`, but toward a fixed point instead
 * of another entity's live position. Once within {@link ARRIVAL_TOLERANCE}
 * of the destination, `Velocity` is zeroed and the `MoveTarget` is removed,
 * so the unit comes to rest exactly at the ordered spot rather than jittering
 * around it forever.
 *
 * The velocity magnitude is clamped, on the final approaching step, to
 * exactly close the remaining gap over `dt` — mirroring `SeekSystem`'s
 * overshoot guard — so arrival is exact rather than eventually corrected.
 *
 * Deliberately straight-line only: no obstacle avoidance, no waypoints.
 * That's #88's job once A* lands; this system's shape (a queue of one
 * point) is intentionally the shape #88 will extend to a path.
 */
export function createMoveTargetSystem(queries: Queries): System {
  return (_world: World<Entity>, dt: number) => {
    for (const self of queries.movable) {
      const { moveTarget } = self;
      if (!moveTarget) {
        continue;
      }

      const { position } = moveTarget;
      const dx = position.x - self.transform.position.x;
      const dy = position.y - self.transform.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= ARRIVAL_TOLERANCE) {
        self.velocity.x = 0;
        self.velocity.y = 0;
        delete self.moveTarget;
        continue;
      }

      const speed = dt > 0 ? Math.min(self.moveSpeed.value, distance / dt) : self.moveSpeed.value;
      self.velocity.x = (dx / distance) * speed;
      self.velocity.y = (dy / distance) * speed;
    }
  };
}
