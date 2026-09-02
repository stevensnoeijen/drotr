import type { UnitType } from '~/game/data/units';
import type {
  AggroRange,
  AttackCooldown,
  AttackRange,
  Damage,
  Health,
  Hoverable,
  MovePath,
  MoveSpeed,
  MoveTarget,
  Renderable,
  Selectable,
  Selected,
  Target,
  Team,
  Transform,
  Velocity,
} from '~/game/ecs/components';

/**
 * The single entity contract for the whole game. Every component is optional;
 * an entity is defined by which components it happens to have, and archetype
 * queries in {@link file://./world.ts} narrow this type to the components they
 * require.
 */
export interface Entity {
  /** Unique identifier for this entity (for debugging/serialization). */
  id?: number;
  transform?: Transform;
  velocity?: Velocity;
  moveSpeed?: MoveSpeed;
  health?: Health;
  renderable?: Renderable;
  selectable?: Selectable;
  selected?: Selected;
  hoverable?: Hoverable;
  team?: Team;
  unitType?: UnitType;
  attackRange?: AttackRange;
  aggroRange?: AggroRange;
  damage?: Damage;
  attackCooldown?: AttackCooldown;
  target?: Target;
  moveTarget?: MoveTarget;
  movePath?: MovePath;
}
