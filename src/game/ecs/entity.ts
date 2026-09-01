import type { UnitType } from '~/game/data/units';
import type { AggroRange } from '~/game/ecs/components/aggro-range';
import type { AttackCooldown } from '~/game/ecs/components/attack-cooldown';
import type { AttackRange } from '~/game/ecs/components/attack-range';
import type { Damage } from '~/game/ecs/components/damage';
import type { Health } from '~/game/ecs/components/health';
import type { Hoverable } from '~/game/ecs/components/hoverable';
import type { MovePath } from '~/game/ecs/components/move-path';
import type { MoveSpeed } from '~/game/ecs/components/move-speed';
import type { MoveTarget } from '~/game/ecs/components/move-target';
import type { Renderable } from '~/game/ecs/components/renderable';
import type { Selectable } from '~/game/ecs/components/selectable';
import type { Selected } from '~/game/ecs/components/selected';
import type { Target } from '~/game/ecs/components/target';
import type { Team } from '~/game/ecs/components/team';
import type { Transform } from '~/game/ecs/components/transform';
import type { Velocity } from '~/game/ecs/components/velocity';

export type { AggroRange } from '~/game/ecs/components/aggro-range';
export type { AttackCooldown } from '~/game/ecs/components/attack-cooldown';
export type { AttackRange } from '~/game/ecs/components/attack-range';
export type { Damage } from '~/game/ecs/components/damage';
export type { Health } from '~/game/ecs/components/health';
export type { Hoverable } from '~/game/ecs/components/hoverable';
export type { MovePath } from '~/game/ecs/components/move-path';
export type { MoveSpeed } from '~/game/ecs/components/move-speed';
export type { MoveTarget } from '~/game/ecs/components/move-target';
export type { Renderable } from '~/game/ecs/components/renderable';
export type { Selectable } from '~/game/ecs/components/selectable';
export type { Selected } from '~/game/ecs/components/selected';
export type { Shape } from '~/game/ecs/components/shape';
export type { Target } from '~/game/ecs/components/target';
export type { Team } from '~/game/ecs/components/team';
export type { Transform } from '~/game/ecs/components/transform';
export type { Velocity } from '~/game/ecs/components/velocity';

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
