import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';

/**
 * Integrates `Transform.position` from `Velocity` for every entity in
 * `queries.movable`, at the fixed timestep `dt` handed in by the game loop
 * (see {@link file://../game-loop.ts}). Multiplying by `dt` rather than
 * assuming a per-frame unit step is what makes this framerate-independent:
 * the same accumulated simulated time produces the same final position
 * regardless of how it was chopped into fixed steps.
 *
 * Deliberately dumb: no clamping to `moveSpeed`, no obstacle avoidance, and
 * no collision resolution. Whatever set `Velocity` ({@link SeekSystem},
 * {@link MoveTargetSystem}) is responsible for its magnitude and direction;
 * this system only integrates it.
 *
 * Unit-to-unit collision is handled *upstream* rather than here, by
 * {@link CellOccupancySystem}: a step that would carry a unit into a cell
 * another unit holds has its velocity zeroed before this system ever sees
 * it, so the integration below stays a pure "position += velocity * dt" and
 * never has to undo a move it shouldn't have made.
 *
 * Also turns `Transform.rotation` to face the direction of travel, whenever
 * `Velocity` is non-zero — a stopped unit (zero velocity) keeps whatever
 * facing it last had rather than snapping back to a default.
 */
export function createMoveVelocitySystem(queries: Queries): System {
  return (_world: World<Entity>, dt: number) => {
    for (const entity of queries.movable) {
      const { velocity, transform } = entity;
      transform.position.x += velocity.x * dt;
      transform.position.y += velocity.y * dt;

      if (velocity.x !== 0 || velocity.y !== 0) {
        transform.rotation = Math.atan2(velocity.x, -velocity.y);
      }
    }
  };
}
