import type { Point } from '~/lib/math/types';
import type { UnitType } from '~/game/data/units';

/**
 * The two — and only two — teams in the game.
 *
 * Deliberately a two-member string union rather than an enum or a number:
 * there is no neutral, ally or third faction, so "attack a teammate" must be
 * unrepresentable. Any code that decides friend-or-foe can exhaustively switch
 * on this without a fallthrough case.
 */
export type Team = 'blue' | 'red';

/** How an entity is drawn by the (view-only) renderer. */
export type Shape = 'circle' | 'square' | 'triangle';

/**
 * World-space placement of an entity. Positions live here, in the ECS — never
 * in a Pixi object. The renderer reads this to place its view each frame.
 */
export interface Transform {
  position: Point;
  /** Facing direction in radians. */
  rotation: number;
}

/** Per-second movement vector, integrated into {@link Transform.position}. */
export interface Velocity {
  x: number;
  y: number;
}

/** Maximum movement speed in world units per second. */
export interface MoveSpeed {
  value: number;
}

export interface Health {
  current: number;
  max: number;
}

/** Attack range in grid cells. */
export interface AttackRange {
  value: number;
}

/** Damage dealt per attack. */
export interface Damage {
  value: number;
}

/** Cooldown time in seconds before the next attack. */
export interface AttackCooldown {
  /** Time until the next attack is ready, in seconds. */
  remaining: number;
}

/** Currently targeted entity ID, if any. */
export interface Target {
  entityId: number;
}

/** Data describing how an entity should be drawn. The view is read-only. */
export interface Renderable {
  shape: Shape;
  /** RGB colour, e.g. `0x66ccff`. */
  color: number;
  /** Radius (circle) or half-extent (square) in world units. */
  size: number;
  /**
   * Set by {@link file://../render/render-system.ts} when something about
   * this entity's view is stale (e.g. its health bar no longer matches
   * `health.current`) and needs a redraw on the next `sync()`. Systems never
   * clear it themselves — the renderer does, once it has redrawn.
   */
  dirty?: boolean;
}

/**
 * Tag marking an entity the player is allowed to select. Modelled as `true`
 * (the idiomatic miniplex tag) so it carries no data and archetype queries can
 * key off its mere presence.
 */
export type Selectable = true;

/** Tag marking an entity that is currently selected by the player. */
export type Selected = true;

/**
 * Tag marking an entity that can be hovered/inspected (for debug tooltips).
 * Like {@link Selectable}, modelled as `true` so archetype queries can key off
 * its presence. Includes all units regardless of team, unlike `selectable`.
 */
export type Hoverable = true;

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
  damage?: Damage;
  attackCooldown?: AttackCooldown;
  target?: Target;
}
