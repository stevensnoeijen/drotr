import type { World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';

/**
 * Copies each `AttachedTo` entity's parent's position and rotation onto its
 * own `transform`, every tick — nothing more. This exists so a purely visual
 * attachment (currently just the crossbow unit's static projectile stripe,
 * #161) renders on top of, and moves/turns with, the unit it's attached to,
 * without giving the attachment any velocity or simulation of its own.
 *
 * Deliberately not a `ProjectileSystem`: it never fires, travels
 * independently, targets, or deals damage — that's #97's job, once its
 * projectile entity model (`Transform`, `Velocity`, `Damage`, etc.) lands.
 * An attachment whose parent has already been removed (e.g. the parent died
 * and its removal delay elapsed) is left exactly where it last was; nothing
 * currently removes an orphaned attachment on its own account, since
 * `DeathCleanupSystem` removes it alongside its parent instead.
 */
export function createAttachmentSystem(queries: Queries): System {
  return (world: World<Entity>): void => {
    for (const entity of queries.attached) {
      const parent = findEntityById(world.entities, entity.attachedTo.entityId);
      if (!parent?.transform) {
        continue;
      }
      entity.transform.position.x = parent.transform.position.x;
      entity.transform.position.y = parent.transform.position.y;
      entity.transform.rotation = parent.transform.rotation;
    }
  };
}
