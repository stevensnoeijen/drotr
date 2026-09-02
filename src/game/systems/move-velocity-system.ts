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
 * Deliberately dumb: no clamping to `moveSpeed`, no collision, no obstacle
 * avoidance. Whatever set `Velocity` (currently only {@link SeekSystem}) is
 * responsible for its magnitude and direction; this system only integrates
 * it.
 */
export function createMoveVelocitySystem(queries: Queries): System {
  return (_world: World<Entity>, dt: number) => {
    for (const entity of queries.movable) {
      entity.transform.position.x += entity.velocity.x * dt;
      entity.transform.position.y += entity.velocity.y * dt;
    }
  };
}
