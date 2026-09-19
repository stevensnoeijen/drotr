import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { quantizeAngle } from '~/lib/math/angle';

/**
 * Turns each `AimSource` entity's `transform.rotation` to point at whatever
 * its owning unit is currently attacking — nothing more. This exists so a
 * purely visual, stationary projectile (currently just the crossbow unit's
 * dropped arrow stripe, #161) reads as aimed at the enemy the unit is
 * fighting, without giving the projectile any position of its own or moving
 * it toward the target.
 *
 * Deliberately not a `ProjectileSystem`: it never fires, travels, or deals
 * damage — that's #97's job, once its projectile entity model (`Transform`,
 * `Velocity`, `Damage`, etc.) lands. An owner with no current target (not
 * yet engaged, or its target died) leaves the projectile pointed wherever it
 * last aimed, same as a unit's own facing does when it stops moving.
 */
export function createProjectileAimSystem(queries: Queries): System {
  return (world: World<Entity>): void => {
    for (const entity of queries.aiming) {
      const owner = findEntityById(world.entities, entity.aimSource.unitId);
      const targetId = owner?.target?.entityId;
      if (targetId === undefined) {
        continue;
      }

      const target = findEntityById(world.entities, targetId);
      if (!target?.transform) {
        continue;
      }

      const dx = target.transform.position.x - entity.transform.position.x;
      const dy = target.transform.position.y - entity.transform.position.y;
      entity.transform.rotation = quantizeAngle(Math.atan2(dx, -dy));
    }
  };
}
