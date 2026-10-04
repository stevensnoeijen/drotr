import type { World } from 'miniplex';

import { effectDuration } from '~/game/data/effects';
import type { Entity } from '~/game/ecs/entity';
import type { System } from '~/game/ecs/system';
import type { Queries } from '~/game/ecs/world';

/**
 * Ages every `Effect` (`queries.effects`) by `dt` and removes it once its
 * animation has played through (see `effectDuration`). `RenderSystem`
 * destroys the effect's view when it sees the removal.
 */
export function createEffectSystem(queries: Queries): System {
  return (world: World<Entity>, dt: number) => {
    // Snapshotted: removing an entity reindexes the query mid-loop.
    for (const entity of [...queries.effects]) {
      entity.effect.elapsed += dt;
      if (entity.effect.elapsed >= effectDuration(entity.effect.type)) {
        world.remove(entity);
      }
    }
  };
}
