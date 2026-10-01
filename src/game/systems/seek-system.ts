import type { World } from 'miniplex';

import type { Footprint } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import { findEntityById } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { findAttackCell, type Cell } from '~/game/combat/attack-cell';
import {
  anchorCellAt,
  footprintCentre,
  footprintGap,
  footprintOf,
  isAtFootprintCentre,
} from '~/game/navigation/footprint';
import { planMoveOrder } from '~/game/navigation/move-order';
import { NO_OCCUPANT, type OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { quantizeAngle } from '~/lib/math/angle';
import type { Point } from '~/lib/math/types';
import {
  hasLineOfSight,
  toCollisionGrid,
  type CollisionGrid,
  type GridLike,
} from '~/lib/navigation/astar';

/**
 * Shortest interval, in seconds of simulated time, between two A* searches
 * for the same pursuit. A target being chased around a wall moves every tick,
 * and so does whatever is blocking the chaser, but a route is only ever as
 * good as the instant it was planned — so replanning is throttled rather than
 * run per tick, bounding the search cost of a pursuit regardless of how many
 * units are pursuing.
 *
 * A *target switch* deliberately ignores this throttle: continuing to walk a
 * route toward an enemy the unit is no longer fighting is wrong, not merely
 * stale, so it is replanned on the spot: a target switch should
 * replan/cancel any in-flight route.
 *
 * Only *routed* pursuits are throttled. Picking the cell to attack from is a
 * bounded scan of the cells around the target, not a search, so a unit with a
 * clear line to its target re-picks — and re-aims — every tick, exactly as it
 * used to re-aim at the target's live position.
 */
export const PURSUIT_REPATH_INTERVAL = 0.5;

/**
 * How far, in grid cells, a pursued target may drift from the position its
 * route was planned toward before that route is worth replanning. One cell:
 * below that, the existing route still ends in the target's own cell, and a
 * fresh search would return essentially the same waypoints.
 */
export const PURSUIT_REPATH_DISTANCE = 1;

/**
 * Drops a pursuit and whatever movement it owned, leaving the caller to
 * decide the unit's velocity. `MoveTarget` goes too: `MovePathSystem` only
 * hands over a waypoint when there is no current one, so a leg left behind
 * here would keep steering the unit along the abandoned route.
 */
function clearPursuitRoute(entity: Entity): void {
  delete entity.pursuit;
  delete entity.movePath;
  delete entity.moveTarget;
}

/**
 * Whether a unit's movement is currently owned by a player-issued order
 * rather than by seeking: any move state present without a `Pursuit`
 * alongside it was put there by `moveSelectedTo`/`PendingMoveOrderSystem`,
 * and a staged `PendingMoveOrder` is a player order that has not landed yet.
 *
 * Seeking leaves such a unit entirely alone — it neither steers it nor routes
 * it — which is how a right-click keeps outranking auto-attack movement now
 * that both drive the same `MovePath`/`MoveTarget` pipeline.
 */
function hasPlayerMoveOrder(entity: Entity): boolean {
  return (
    !entity.pursuit &&
    (entity.pendingMoveOrder !== undefined ||
      entity.movePath !== undefined ||
      entity.moveTarget !== undefined)
  );
}

/**
 * Points a unit's current leg at one world-space point, reusing the
 * `MoveTarget` it already has rather than replacing it — this runs per
 * approaching unit per tick, and the component is plain mutable data.
 */
function aimAt(entity: Entity, x: number, y: number): void {
  const current = entity.moveTarget;
  if (!current) {
    entity.moveTarget = { position: { x, y } };
    return;
  }
  current.position.x = x;
  current.position.y = y;
}

/**
 * Brings a unit seeking has just stopped owning — its target died, or was
 * cleared out from under it — to a *proper* stop: not frozen wherever the
 * step it was half-way through left it, but walked the last fraction of a
 * cell onto the centre of the cell it is standing in.
 *
 * Freezing in place is what the old system did, and it leaves units dotted
 * around a finished battlefield part-way across their cells — visibly
 * off-grid, and (since `isSettled` gates being attacked as well as attacking)
 * unhittable where they stand until something moves them again.
 *
 * The move order it issues carries no `Pursuit`, so seeking treats it as a
 * player order and keeps out of the way while `MoveTargetSystem` finishes it.
 * That is the right reading: there is no target left for this unit, nothing
 * to own, and the order cancels itself the moment it completes.
 */
function comeToRest(entity: Entity, cellSize: number): void {
  delete entity.pursuit;
  delete entity.movePath;

  const position = entity.transform!.position;
  const size = footprintOf(entity);
  if (isAtFootprintCentre(position, size, cellSize)) {
    delete entity.moveTarget;
    if (entity.velocity) {
      entity.velocity.x = 0;
      entity.velocity.y = 0;
    }
    return;
  }

  const anchor = anchorCellAt(position.x, position.y, size, cellSize);
  const centre = footprintCentre(anchor.x, anchor.y, size, cellSize);
  aimAt(entity, centre.x, centre.y);
}

/**
 * Records that seeking — not the player — owns this unit's current movement,
 * so `hasPlayerMoveOrder` keeps hands off it and a later tick knows which
 * target the movement was for.
 *
 * `sinceReplan` is set by the caller because it means "how stale is the
 * *route*": a straight-line approach has no route to speak of, so it parks
 * the counter at {@link PURSUIT_REPATH_INTERVAL} — the moment such a unit
 * does need a route (the target steps behind a wall), it gets one on that
 * very tick instead of waiting out a throttle it never used.
 */
function markPursuit(
  entity: Entity,
  entityId: number,
  targetPosition: Point,
  sinceReplan: number
): void {
  const pursuit = entity.pursuit;
  if (pursuit && pursuit.entityId === entityId) {
    pursuit.sinceReplan = sinceReplan;
    return;
  }
  entity.pursuit = {
    entityId,
    plannedPosition: { x: targetPosition.x, y: targetPosition.y },
    sinceReplan,
  };
}

/**
 * Walks every entity with a `Target` into a cell it can attack that target
 * from, and stops it there.
 *
 * The destination is always a **cell**, never a distance. Each pass picks the
 * nearest cell from which the target is within `attackRange` 8-way steps
 * ({@link findAttackCell}) and hands the unit an ordinary move order to that
 * cell's centre — the same `MoveTarget`/`MovePath` pipeline, with the same
 * `ARRIVAL_TOLERANCE` arrival, that a player's click-to-move order uses. That
 * is the point: a unit's resting place has to be a cell centre, and
 * the only way to guarantee one is to name the cell up front and let the
 * movement system land on it. The system this replaced steered at the
 * target's live position and froze the unit the instant a Euclidean distance
 * check ran out, which is a point in open space — units visibly stopped and
 * fought part-way across a cell.
 *
 * Per unit, per tick, in order:
 *
 * - **Already in reach** (the cell it stands in is within `attackRange` of
 *   the target's cell): come to rest *on that cell's centre*. If it is
 *   already there, velocity is zeroed and the unit turns to face its target
 *   ({@link quantizeAngle}, the same 8 compass directions
 *   `MoveVelocitySystem` uses, since that system only turns a unit that is
 *   moving). If it is not — it was mid-approach when the target came into
 *   reach — it gets a one-cell move order to that centre and settles on the
 *   next tick or two. Either way the fight starts from a cell centre; see
 *   `isSettled` in {@link file://./combat-system.ts}, which is what actually
 *   gates the swing.
 * - **Out of reach, with a clear line** to the cell it wants: a straight-line
 *   `MoveTarget` at that cell's centre. Re-picked every tick, so the unit
 *   tracks a moving target as closely as it did when it steered at the target
 *   itself.
 * - **Out of reach, with something in the way**: a `MovePath` planned by the
 *   very same {@link planMoveOrder} A* the player's own move orders use,
 *   walked leg by leg by `MovePathSystem`/`MoveTargetSystem`, and replanned
 *   on the {@link PURSUIT_REPATH_INTERVAL}/{@link PURSUIT_REPATH_DISTANCE}
 *   throttle. Unlike before, the route now ends at the cell the unit
 *   will fight from rather than on top of the target, so a target that stays
 *   out of sight all the way in is still approached correctly.
 *
 * "Clear line" is {@link hasLineOfSight} between the two cells — the same
 * strict, corner-respecting test A* path smoothing uses, so seeking never
 * commits to a straight line the pathfinder itself wouldn't walk. With no
 * `grid` (a map with no terrain at all) everything is in sight.
 *
 * Which cells count as available to stand in comes from the shared
 * {@link OccupancyGrid} when there is one: the destination is a cell no other
 * unit holds, decided by the same claims that already stop two click-to-move
 * orders from putting two units in one cell. Two units converging head-on
 * therefore pick cells that cannot collide, and if they do race for the same
 * one, the loser simply finds the cell taken on its next pass and picks
 * another — no separate avoidance rule to get wrong. Without an occupancy
 * grid only terrain is consulted.
 *
 * A unit with nowhere to stand — every cell in reach of its target taken —
 * settles on its own cell's centre and tries again next tick, rather than
 * shoving at the scrum from part-way across a cell.
 *
 * Which entities this system touches at all:
 *
 * - An entity with no `target`, or whose target no longer resolves to a live
 *   entity, is left alone — `SeekSystem` never touches its velocity, so
 *   anything another system set survives this pass untouched. The exception
 *   is an entity that was *pursuing* that target: seeking owns the movement
 *   of a unit it is steering, so abandoning the pursuit stops the unit —
 *   {@link comeToRest}, on a cell centre — rather than leaving it coasting
 *   toward a corpse or frozen half-way across a cell.
 * - An entity under a player move order is skipped outright; see
 *   {@link hasPlayerMoveOrder}.
 * - `moveSpeed` and `attackRange` are both required: an entity missing either
 *   can't be meaningfully sought toward (no known speed, or no known stopping
 *   distance), so it's skipped rather than guessing a default.
 *
 * Known limitation: a target walled off with no route at all leaves its
 * pursuer standing still, retrying the search every
 * {@link PURSUIT_REPATH_INTERVAL}, even when some other enemy is in range —
 * `runPerceptionScan` picks the nearest enemy by straight-line distance and
 * has no notion of reachability. Preferring a reachable target over an
 * unreachable one is a perception change, not a movement one, and is left to
 * a later ticket.
 *
 * `cellSize` is the world size of the map's grid cells (see `cellSizeOf`) —
 * the cells `grid` and `occupancy` are indexed in.
 */
export function createSeekSystem(
  queries: Queries,
  cellSize: number,
  grid?: GridLike,
  occupancy?: OccupancyGrid
): System {
  // Normalised once: terrain is static for a map's lifetime, and the nested
  // array form test fixtures use would otherwise be rebuilt every tick.
  const collisionGrid: CollisionGrid | undefined = grid ? toCollisionGrid(grid) : undefined;
  // Reused across entities and ticks rather than allocated per unit: this
  // runs for every targeting unit, every tick.
  const selfCell: Cell = { x: 0, y: 0 };
  const targetCell: Cell = { x: 0, y: 0 };

  // Which unit, and how large a block, `isAvailable` is answering for.
  // Hoisted out of the loop so the predicate handed to `findAttackCell` can
  // be a single closure allocated once, instead of one per unit per tick.
  let occupantId = NO_OCCUPANT;
  let selfSize: Footprint = { width: 1, height: 1 };

  /**
   * Whether a unit's whole footprint could stand with its anchor at (`col`,
   * `row`): every cell of its `selfSize`-cell block unoccupied (by anyone
   * but itself) and walkable. Unit claims come from the occupancy grid when
   * there is one; failing that, terrain alone; failing that (no map data at
   * all), anywhere. Reduces to a single-cell check for a 1x1 unit.
   */
  const isAvailable = (col: number, row: number): boolean => {
    if (occupancy) {
      return occupancy.isBlockAvailableFor(occupancy.indexOf(col, row), selfSize, occupantId);
    }
    if (collisionGrid) {
      const { width, height, collision } = collisionGrid;
      for (let dy = 0; dy < selfSize.height; dy++) {
        for (let dx = 0; dx < selfSize.width; dx++) {
          const c = col + dx;
          const r = row + dy;
          if (c < 0 || r < 0 || c >= width || r >= height || collision[r * width + c] !== 0) {
            return false;
          }
        }
      }
      return true;
    }
    return true;
  };

  const isInSight = (from: Cell, to: Cell): boolean => {
    return !collisionGrid || hasLineOfSight(collisionGrid, from, to);
  };

  return (world: World<Entity>, dt: number) => {
    for (const self of queries.movable) {
      const { target, attackRange, pursuit } = self;

      if (pursuit) {
        pursuit.sinceReplan += dt;
      }

      if (!target || !attackRange) {
        if (pursuit) {
          comeToRest(self, cellSize);
        }
        continue;
      }

      const other = findEntityById(world.entities, target.entityId);
      // A target that has died but not yet been removed from the world is
      // treated as gone: `runPerceptionScan` only re-scans every
      // `PERCEPTION_INTERVAL`, and routing across a map toward a corpse in
      // the meantime is worse than simply stopping.
      if (!other?.transform || (other.health && other.health.current <= 0)) {
        if (pursuit) {
          comeToRest(self, cellSize);
        }
        continue;
      }

      if (hasPlayerMoveOrder(self)) {
        continue;
      }

      const position = self.transform.position;
      const targetPosition = other.transform.position;
      const targetSize = footprintOf(other);
      selfSize = footprintOf(self);

      // `selfCell`/`targetCell` are each unit's footprint *anchor* (top-left
      // cell of its block), not just the cell its centre point falls in —
      // for a multi-cell unit those differ, since its position sits on the
      // block's centre (a cell corner for an even footprint), not a single
      // cell's. Reduces to the plain `floor(position / cellSize)` for a 1x1
      // unit, since its anchor shift is zero.
      const selfAnchor = anchorCellAt(position.x, position.y, selfSize, cellSize);
      const targetAnchor = anchorCellAt(targetPosition.x, targetPosition.y, targetSize, cellSize);
      selfCell.x = selfAnchor.x;
      selfCell.y = selfAnchor.y;
      targetCell.x = targetAnchor.x;
      targetCell.y = targetAnchor.y;

      const inReach = footprintGap(selfCell, selfSize, targetCell, targetSize) <= attackRange.value;

      // Where this unit should be standing. Its own anchor when the target is
      // already in reach from it (nothing to close), and otherwise the
      // nearest anchor whose whole footprint does reach — falling back to
      // standing still when every such anchor is taken.
      occupantId = self.cellOccupancy?.occupantId ?? NO_OCCUPANT;
      const destination = inReach
        ? selfCell
        : (findAttackCell(selfCell, targetCell, attackRange.value, isAvailable, selfSize, targetSize) ??
          selfCell);

      if (destination.x === selfCell.x && destination.y === selfCell.y) {
        // Nowhere left to walk. Come to rest on this footprint's *centre* —
        // never wherever the unit happens to stand — so a fight only ever
        // starts from a block a unit is properly standing in.
        delete self.movePath;

        // "Arrived" is the movement pipeline's own verdict — `MoveTarget`
        // gone — not a position test of this system's own. `MoveTargetSystem`
        // drops the leg exactly when it has put the unit on the point it was
        // walking to; stopping the unit here the moment it came *within
        // tolerance* of the centre instead would leave it resting a fraction
        // of a cell off, which is the whole bug. The position test
        // stays as the other half of the condition, for a unit left standing
        // off-centre by something else (an order it gave up on, say).
        if (!self.moveTarget && isAtFootprintCentre(position, selfSize, cellSize)) {
          clearPursuitRoute(self);
          self.velocity.x = 0;
          self.velocity.y = 0;
          if (inReach) {
            // MoveVelocitySystem only turns a unit that is moving, so keep
            // facing the target explicitly while engaged with it — otherwise
            // the unit would stay frozen looking the way it approached from
            // instead of at what it's fighting.
            self.transform.rotation = quantizeAngle(
              Math.atan2(targetPosition.x - position.x, -(targetPosition.y - position.y))
            );
          }
        } else {
          markPursuit(self, target.entityId, targetPosition, PURSUIT_REPATH_INTERVAL);
          const centre = footprintCentre(selfCell.x, selfCell.y, selfSize, cellSize);
          aimAt(self, centre.x, centre.y);
        }
        continue;
      }

      // `destination` is this unit's own anchor, so its centre is this
      // unit's footprint centre — a cell centre for a 1x1 unit, the shared
      // corner of a knight's 2x2 block.
      const { x: destinationX, y: destinationY } = footprintCentre(
        destination.x,
        destination.y,
        selfSize,
        cellSize
      );

      if (isInSight(selfCell, destination)) {
        // Nothing in the way: walk straight at the cell, no search needed.
        delete self.movePath;
        markPursuit(self, target.entityId, targetPosition, PURSUIT_REPATH_INTERVAL);
        aimAt(self, destinationX, destinationY);
        continue;
      }

      // Out of sight: route around whatever is in the way, on the throttle.
      const switchedTarget = pursuit?.entityId !== target.entityId;
      const drifted =
        !pursuit ||
        Math.hypot(
          targetPosition.x - pursuit.plannedPosition.x,
          targetPosition.y - pursuit.plannedPosition.y
        ) >
          PURSUIT_REPATH_DISTANCE * cellSize;
      const throttled = pursuit !== undefined && pursuit.sinceReplan < PURSUIT_REPATH_INTERVAL;

      if (switchedTarget || ((!self.movePath || drifted) && !throttled)) {
        const planned = planMoveOrder(
          collisionGrid,
          position,
          { x: destinationX, y: destinationY },
          cellSize,
          selfSize
        );

        delete self.movePath;
        delete self.moveTarget;
        self.pursuit = {
          entityId: target.entityId,
          plannedPosition: { x: targetPosition.x, y: targetPosition.y },
          sinceReplan: 0,
        };
        if (planned.kind === 'path') {
          self.movePath = planned.movePath;
        } else if (planned.kind === 'target') {
          self.moveTarget = planned.moveTarget;
        }
      }

      if (!self.movePath && !self.moveTarget) {
        // Nothing to walk: the target is walled off outright, or every route
        // to it failed. Hold position — another search follows once the
        // replan throttle allows it.
        self.velocity.x = 0;
        self.velocity.y = 0;
      }
      // Otherwise the route drives the unit: MovePathSystem hands over the
      // next leg and MoveTargetSystem steers toward it, both later in this
      // same fixed step, so a freshly planned pursuit starts moving
      // immediately rather than idling a tick per leg.
    }
  };
}
