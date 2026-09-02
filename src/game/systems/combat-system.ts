import type { With, World } from 'miniplex';

import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { Cooldown } from '~/lib/Cooldown';
import { GameTime } from '~/lib/GameTime';
import { CELL_SIZE } from '~/lib/grid';

/** An entity that can schedule and land attacks — see `queries.attackers`. */
export type AttackerEntity = With<
  Entity,
  'transform' | 'team' | 'health' | 'attackRange' | 'damage' | 'attackCooldown'
>;

/**
 * Slack, in world units, added to an attacker's reach when deciding whether
 * its target is close enough to hit.
 *
 * `SeekSystem` deliberately stops a unit *exactly* at `attackRange * CELL_SIZE`
 * by clamping its final approach step to close the remaining gap precisely.
 * "Precisely" is floating-point precise, though: that last step can leave the
 * unit a few ulps beyond the boundary, where a strict `distance <= rangeWorld`
 * test fails — and, since the unit has already stopped, would keep failing
 * forever, leaving two units standing nose to nose refusing to fight. A
 * hundredth of a world unit (~0.03% of a 32px cell) is far below anything the
 * player could perceive as extra reach, and far above the rounding error it
 * absorbs.
 */
export const ATTACK_RANGE_EPSILON = 0.01;

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
 */
function attack(queries: Queries, self: AttackerEntity): void {
  const { target } = self;
  if (!target) {
    return;
  }

  const other = findEntityById(queries.combatants, target.entityId);
  if (!other || other.health.current <= 0) {
    delete self.target;
    return;
  }

  const dx = other.transform.position.x - self.transform.position.x;
  const dy = other.transform.position.y - self.transform.position.y;
  const distSq = dx * dx + dy * dy;
  const rangeWorld = self.attackRange.value * CELL_SIZE + ATTACK_RANGE_EPSILON;
  if (distSq > rangeWorld * rangeWorld) {
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

  return (_world: World<Entity>, dt: number) => {
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
        cooldown = new Cooldown(self.attackCooldown.duration, () => attack(queries, self));
        cooldowns.set(self, cooldown);
      }
      cooldown.update();
    }
  };
}
