import type { Entity } from '~/game/ecs/entity';
import {
  animationKey,
  DIRECTIONS,
  type AnimationKey,
  type Direction,
  type UnitAction,
} from './animation-key';

const SECTOR = Math.PI / 4;

/**
 * The 8-way facing for a `transform.rotation` (radians, 0 = north, clockwise).
 * Rotation is the single source of truth for facing. Any angle is accepted —
 * negative or beyond a full turn — and is rounded to the nearest 45° sector,
 * so float error around a compass angle cannot flip the result.
 */
export function directionOf(rotation: number): Direction {
  const sector = Math.round(rotation / SECTOR);
  return DIRECTIONS[((sector % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length];
}

/**
 * What an entity is doing, in priority order: dead, mid-swing (`attackSwing`,
 * set by the combat system when a swing is taken), moving (non-zero
 * velocity), else idle.
 */
export function unitActionOf(
  entity: Pick<Entity, 'dead' | 'attackSwing' | 'velocity'>
): UnitAction {
  if (entity.dead) return 'dead';
  if (entity.attackSwing) return 'attack';
  const velocity = entity.velocity;
  if (velocity && (velocity.x !== 0 || velocity.y !== 0)) return 'move';
  return 'idle';
}

/**
 * The animation an entity should be showing, derived purely from its ECS
 * state. `undefined` for an entity that has no `unitType` or `transform`
 * (it has no unit sprite). An entity without a team uses the `neutral` set.
 */
export function animationKeyOf(
  entity: Pick<Entity, 'unitType' | 'team' | 'transform' | 'dead' | 'attackSwing' | 'velocity'>
): AnimationKey | undefined {
  const { unitType, transform } = entity;
  if (!unitType || !transform) return undefined;
  return animationKey(
    unitType,
    entity.team ?? 'neutral',
    unitActionOf(entity),
    directionOf(transform.rotation)
  );
}
