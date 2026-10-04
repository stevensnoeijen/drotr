import type { World } from 'miniplex';

import { allocateEntityId } from '~/game/data/spawn';
import type { EffectUnitType, UnitType } from '~/game/data/units';
import type { Renderable } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import type { Point } from '~/lib/math/types';

export interface SpawnEffectOptions {
  type: EffectUnitType;
  position: Point;
  /** Whose sprite scale the effect is drawn at (see `Effect.sourceUnitType`). */
  sourceUnitType: UnitType;
  /** The box the effect is laid out in, normally the cause's own. */
  renderable: Renderable;
}

/**
 * Adds a short-lived `Effect` entity at `position` and returns it. It gets no
 * `unitType`, `team` or `health`, so nothing but the renderer and
 * `EffectSystem` ever sees it.
 */
export function spawnEffect(
  world: World<Entity>,
  { type, position, sourceUnitType, renderable }: SpawnEffectOptions
): Entity {
  return world.add({
    id: allocateEntityId(),
    transform: { position: { ...position }, rotation: 0 },
    renderable: { ...renderable },
    effect: { type, sourceUnitType, elapsed: 0 },
  });
}
