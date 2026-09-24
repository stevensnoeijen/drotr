import type { With, World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { cellSteps } from '~/game/combat/attack-cell';
import { fireProjectile } from '~/game/combat/fire-projectile';
import { Cooldown } from '~/lib/cooldown';
import { GameTime } from '~/lib/game-time';
import { CELL_SIZE, isAtCellCentre, toGridPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import type { Point } from '~/lib/math/types';
import { NO_CELL } from '~/game/navigation/occupancy-grid';

/** An entity that can schedule and land attacks — see `queries.attackers`. */
export type AttackerEntity = With<
  Entity,
  'transform' | 'team' | 'health' | 'attackRange' | 'damage' | 'attackCooldown'
>;

/**
 * {@link cellSteps} between the cells two world-space points fall in: how
 * many 8-way cell steps separate them, which is the unit `attackRange` is
 * measured in.
 */
export function cellDistance(a: Point, b: Point): number {
  return cellSteps(
    toGridPosition(new Vector2(a.x, a.y), CELL_SIZE),
    toGridPosition(new Vector2(b.x, b.y), CELL_SIZE)
  );
}

/**
 * True once a unit has *finished* moving into a cell: standing still, on that
 * cell's centre, rather than part-way across it or between two.
 *
 * This is the gate on combat in both directions — a unit may neither
 * swing nor be swung at until it holds, which is what stops two units
 * trading blows while they are still visibly sliding past each other.
 *
 * Three things have to hold:
 *
 * - **Not mid-transit by cell occupancy**: `entity.cellOccupancy.reserved`
 *   is `NO_CELL` (or the entity has no `cellOccupancy` at all — never
 *   claimed a cell, so it can't be mid-transit; stationary test fixtures
 *   and units `CellOccupancySystem` hasn't visited yet fall in here).
 * - **At rest**: `entity.velocity` is exactly zero (or absent).
 * - **On the cell's centre** ({@link isAtCellCentre}). The other two are
 *   proxies that a unit can satisfy anywhere at all: `reserved` clears the
 *   moment a unit stops needing to cross into a *new* cell, and a unit can
 *   be brought to a halt part-way across one (an order it gave up on, a
 *   step vetoed by a neighbour). Only this one is the fact the player can
 *   see. `SeekSystem` walks a unit onto the centre before it will let it
 *   fight, so in practice a unit reaches this state within a tick or two of
 *   arriving; the check is what makes that a guarantee rather than a
 *   convention.
 */
export function isSettled(entity: Entity): boolean {
  const occupancy = entity.cellOccupancy;
  if (occupancy && occupancy.reserved !== NO_CELL) {
    return false;
  }

  const velocity = entity.velocity;
  if (velocity && (velocity.x !== 0 || velocity.y !== 0)) {
    return false;
  }

  const transform = entity.transform;
  return !transform || isAtCellCentre(transform.position, CELL_SIZE);
}

/**
 * Resolves `self`'s current target and, if it is a live entity within reach,
 * takes `damage` off its HP. Called only when a unit's cooldown has just
 * elapsed, so every call here is one swing.
 *
 * A swing at a target that has died since the last perception scan is not
 * taken at all, and the stale `target` is dropped on the spot. Perception
 * only re-scans every `PERCEPTION_INTERVAL` seconds, so a unit that lands a
 * killing blow (or whose target is killed by someone else) would otherwise
 * keep hammering a corpse — driving its HP further below zero and blocking
 * the death path — for up to a full scan interval. Clearing the target here
 * mirrors what {@link file://./perception-system.ts#runPerceptionScan} does
 * with a dead target, just without waiting for it.
 *
 * A live but out-of-range target, by contrast, keeps its `target` intact: the
 * unit is presumably still closing the distance under `SeekSystem`, and the
 * swing is simply not taken.
 *
 * A `Ranged` attacker (currently just the crossbow soldier) does not
 * touch the target's HP here at all: once everything above has confirmed
 * this swing lands (in range, both settled), it fires a travelling
 * `Projectile` instead (`fireProjectile`), and `ProjectileSystem` is what
 * actually damages the target once that projectile arrives. The range gate
 * above is exactly what stops a crossbow soldier from firing at a target
 * beyond its `attackRange` (5 cells) in the first place.
 */
function attack(world: World<Entity>, queries: Queries, self: AttackerEntity): void {
  const { target } = self;
  if (!target) {
    return;
  }

  const other = findEntityById(queries.combatants, target.entityId);
  if (!other || other.health.current <= 0) {
    delete self.target;
    return;
  }

  // Neither combatant may be mid-step between two cells: a swing only lands
  // once both are standing still inside the cell they occupy. The target
  // keeps its `target` here (unlike the dead-target case above) — it's still
  // a live, in-range foe, just not settled yet, and the swing is simply
  // deferred to a later tick.
  if (!isSettled(self) || !isSettled(other)) {
    return;
  }

  // Cell-based (Chebyshev) range, not Euclidean world distance: `other` must
  // be within `attackRange` 8-way cell steps, diagonal steps counting the
  // same as orthogonal ones. A plain Euclidean check would wrongly
  // reject a target one cell diagonally away at `attackRange` 1, since its
  // straight-line distance (`CELL_SIZE * sqrt(2)`) exceeds one cell width.
  if (cellDistance(self.transform.position, other.transform.position) > self.attackRange.value) {
    return;
  }

  if (self.ranged) {
    // Guarded above: `self.ranged` is defined here, satisfying `RangedAttacker`.
    fireProjectile(world, self as typeof self & Required<Pick<Entity, 'ranged'>>, other, target.entityId);
    return;
  }

  // Clamped at zero: HP is the death predicate every other system reads
  // (`health.current <= 0`), and letting it run negative would make a
  // health-bar fraction and any future overkill accounting meaningless.
  other.health.current = Math.max(0, other.health.current - self.damage.value);
}

/**
 * Cooldown-gated melee/ranged combat: every attacker advances one
 * {@link Cooldown}, seeded from its own `attackCooldown.duration`, on the
 * fixed timestep; each time that cooldown elapses the unit takes one swing at
 * whatever `PerceptionSystem` has targeted for it, and the cooldown restarts.
 * Damage lands straight on `health.current`, which the render system's
 * dirty-flag path (`markDirtyOnHealthChange`) turns into a health-bar redraw
 * on the next frame — this system never touches a view.
 *
 * Cooldowns advance unconditionally, whether or not the unit currently has a
 * target in range, rather than being reset on acquiring one. That makes the
 * "no more than one attack per `attackCooldown` seconds" guarantee absolute:
 * a unit cannot shorten its own recovery by dropping and re-acquiring a
 * target, and the schedule stays a pure function of elapsed simulated time.
 * A swing that comes up while the unit has nothing to hit is simply not taken.
 *
 * The `Cooldown` instances live in a `WeakMap` keyed by entity rather than in
 * a component: components in this codebase are plain data, and a class holding
 * a running countdown is not. Keying weakly means an entity removed from the
 * world takes its cooldown with it, with no explicit cleanup path to forget.
 *
 * Ordering: this must run after movement in the fixed step, so a unit that
 * arrives at `attackRange` this tick can swing from where it now stands
 * rather than from where it was.
 */
export function createCombatSystem(queries: Queries): System {
  const cooldowns = new WeakMap<Entity, Cooldown>();

  return (world: World<Entity>, dt: number) => {
    // `Timer` (which `Cooldown` wraps) reads its step from this global rather
    // than taking it as an argument. Setting it from the fixed `dt` is what
    // ties every cooldown below to simulated time instead of frame time.
    GameTime.delta = dt;

    for (const self of queries.attackers) {
      // A dead unit neither swings nor recovers: freezing its cooldown here
      // means nothing can fire on its behalf between death and cleanup.
      if (self.health.current <= 0) {
        continue;
      }

      let cooldown = cooldowns.get(self);
      if (!cooldown) {
        // `Cooldown` fires its action on elapse and restarts itself, carrying
        // any overshoot into the next interval, so attacks land on an exact
        // schedule instead of drifting by up to `dt` per cycle.
        cooldown = new Cooldown(self.attackCooldown.duration, () => attack(world, queries, self));
        cooldowns.set(self, cooldown);
      }
      cooldown.update();
    }
  };
}
