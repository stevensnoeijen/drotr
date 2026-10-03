import type { World } from 'miniplex';

import type { Footprint } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import type { Queries } from '~/game/ecs/world';
import type { System } from '~/game/ecs/system';
import { anchorCellAt, footprintOf } from '~/game/navigation/footprint';
import { NO_CELL, type OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { planMovePath } from '~/game/navigation/plan-move-path';

/**
 * How long, in seconds, a unit will stand and wait for the cell ahead of it
 * to clear before abandoning its order.
 *
 * Waiting is the right first response — a unit held up by a neighbour
 * walking the same corridor gets going again as soon as that neighbour moves
 * on, and resetting `blockedFor` on every successful step means only
 * *sustained* blockage counts toward this. But a unit ordered into a cell
 * that a stationary unit is standing in would otherwise shuffle against it
 * forever, so the wait is bounded: give up, stop where you are, and leave
 * the player to issue a better order.
 */
export const BLOCKED_GIVE_UP_SECONDS = 2;

/**
 * How long, in seconds, a routed unit waits before trying to route *around*
 * whoever is blocking it, rather than just standing there — well short of
 * {@link BLOCKED_GIVE_UP_SECONDS} so a corridor that clears on its own is
 * still preferred (no wasted search) but a unit stuck behind something that
 * isn't moving gets a real second chance before giving up outright.
 *
 * Deliberately not attempted on the very first blocked tick: another unit
 * crossing the same corridor a moment ahead is the common case, and it is
 * usually gone before this threshold is even reached — routing around it
 * would just be a search spent on a jam that was about to clear by itself.
 */
export const REROUTE_AFTER_SECONDS = 0.5;

/**
 * Clearance, in world units, kept between a unit's footprint and the edge
 * of the cell it occupies. Leaves a unit enough slack to finish a step onto
 * its cell's centre without the lookahead spilling into the next cell.
 */
const FOOTPRINT_CLEARANCE = 3;

/**
 * The largest half-extent the lookahead of a 1x1 unit honours: half a cell,
 * less {@link FOOTPRINT_CLEARANCE}, however big the unit is drawn. A
 * multi-cell unit (a 2x2 knight) looks ahead from its own block's edges
 * instead — see `leadingBlockAt` inside {@link createCellOccupancySystem} —
 * since its drawn size already matches the cells it actually holds.
 */
export function footprintMargin(cellSize: number): number {
  return cellSize / 2 - FOOTPRINT_CLEARANCE;
}

/**
 * How far inside its block's edge, in world units, a multi-cell unit's
 * leading-edge lookahead sits: enough to absorb floating-point noise in a
 * step that lands exactly on a block centre (`MoveTargetSystem` clamps the
 * final step to do just that), and far smaller than any step a unit takes.
 */
const BLOCK_LEAD_EPSILON = 0.5;

/**
 * Unit-to-unit collision, enforced as cell occupancy over the map's terrain
 * collision grid (see {@link OccupancyGrid}).
 *
 * Runs **after** every system that writes `Velocity` (`SeekSystem`,
 * `MoveTargetSystem`) and **before** `MoveVelocitySystem` integrates it.
 * That single seam is what makes this the one place unit collision is
 * decided: whatever aimed a unit somewhere, the step that would carry it
 * into an occupied cell is vetoed here, before it ever happens — units never
 * overlap and then get pushed apart.
 *
 * Per unit, per tick:
 *
 * 1. Reconcile the claim with where the unit actually stands. Arriving in
 *    the cell it reserved releases the origin cell it was straddling; being
 *    somewhere else entirely (a fresh unit, or a position set by something
 *    other than movement) re-claims from scratch.
 * 2. A unit at rest holds exactly one cell, so a stale reservation ahead of
 *    a stopped unit is released rather than left pinned.
 * 3. A unit under way looks one integration step ahead, extended by its own
 *    rendered half-extent (see `margin` below) so a cell is refused before
 *    the unit's edge — not just its centre — would reach it. Staying inside
 *    a cell it already holds needs no permission. Crossing into a new one
 *    reserves it first — and if that cell is held by another unit, blocked
 *    by terrain, or off the map, the step is refused: velocity is zeroed for
 *    the tick, so `MoveVelocitySystem` integrates nothing and the unit holds
 *    position — with a safety margin still intact, never mid-clip — instead
 *    of clipping through or visibly encroaching on it.
 *
 * Order of operations matters and is deliberate: release-on-arrival happens
 * before any new reservation, so a unit never briefly holds three cells; and
 * the reservation is taken *before* the move rather than validated after it,
 * so two units stepping toward the same cell on the same tick resolve
 * deterministically — the first one the iteration reaches gets the cell, the
 * second sees it taken and waits. No tick ever ends with two units in one
 * cell.
 *
 * Dead units vacate their cells: a corpse is not an obstacle, and releasing
 * here means no cell can be left permanently claimed by something that will
 * never move again.
 *
 * A routed unit (one with a `MovePath` — a player order, or an attacker
 * routing around a wall to reach its target, on a map with collision data)
 * that stays blocked past {@link REROUTE_AFTER_SECONDS}
 * gets one attempt to route *around* the obstruction: a fresh, one-off A*
 * search from where it now stands to its original destination, over a
 * snapshot grid that layers current unit occupancy on top of terrain (see
 * {@link OccupancyGrid.asBlockedGridExcluding}) — for a multi-cell unit, a
 * grid over its anchor cells in which an anchor is blocked by any terrain or
 * other unit under its whole block, so it reroutes around a gap between two
 * units it cannot fit through. This is deliberately
 * reactive rather than baked into the order at dispatch time — planning
 * around every unit on the map up front is wasted work for a search whose
 * result is stale the moment anyone else moves, whereas re-planning only
 * when a unit is actually, sustainedly stuck stays cheap regardless of unit
 * count and only pays the search cost where a real conflict exists. It is
 * also tried at most once per unbroken stretch of being blocked (see
 * `CellOccupancy.rerouted`), so a corridor that stays jammed doesn't turn
 * into a cascade of re-searches — the unit just waits out the rest of
 * {@link BLOCKED_GIVE_UP_SECONDS} and gives up like any other stuck order.
 *
 * An attacker steering straight at a target in sight (no `MovePath`) is left
 * alone: it has nothing to route around, since it re-aims at its live target
 * every tick regardless. Giving up on a *pursuit* route is not the end of
 * that pursuit either — `SeekSystem` still holds the `Pursuit`, and plans
 * another route once its own replan throttle allows, which is what gets an
 * attacker jammed in a corridor moving again rather than stranding it.
 */
export function createCellOccupancySystem(queries: Queries, grid: OccupancyGrid): System {
  /**
   * Anchor of the `size`-cell block a unit resting (or about to rest) at
   * world position (`x`, `y`) holds — the same anchor `footprintOf`'s
   * geometry (`anchorCellAt`) resolves it to. Reduces to `grid.indexAtWorld`
   * for a 1x1 unit, since a single cell has no shift to apply.
   */
  const anchorIndexAt = (x: number, y: number, size: Footprint): number => {
    const anchor = anchorCellAt(x, y, size, grid.cellSize);
    return grid.indexOf(anchor.x, anchor.y);
  };

  /**
   * Anchor of the block a `size`-cell unit needs to hold once it has moved
   * to (`x`, `y`) heading along (`vx`, `vy`) — the leading-edge lookahead a
   * multi-cell unit checks before each step: the two cells its block moves
   * into for a straight step, three for a diagonal one. On each axis the
   * unit is actually moving along, this is the block whose leading edge
   * contains the unit's own leading edge (`half` a block-width/height ahead
   * of its own centre, less {@link BLOCK_LEAD_EPSILON}); an axis it isn't
   * moving along keeps the block it's already resting on.
   */
  const leadingBlockAt = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: Footprint
  ): number => {
    const halfX = (size.width * grid.cellSize) / 2 - BLOCK_LEAD_EPSILON;
    const halfY = (size.height * grid.cellSize) / 2 - BLOCK_LEAD_EPSILON;
    const resting = anchorCellAt(x, y, size, grid.cellSize);
    const axis = (coordinate: number, velocity: number, rest: number, half: number, span: number) => {
      if (velocity > 0) {
        return Math.floor((coordinate + half) / grid.cellSize) - (span - 1);
      }
      if (velocity < 0) {
        return Math.floor((coordinate - half) / grid.cellSize);
      }
      return rest;
    };
    return grid.indexOf(
      axis(x, vx, resting.x, halfX, size.width),
      axis(y, vy, resting.y, halfY, size.height)
    );
  };

  return (_world: World<Entity>, dt: number) => {
    // `queries.movable`, not the broader `queries.moving`: this system's
    // whole job is grid-cell collision between navigable units, and
    // `moving` also matches anything else with a `transform` and
    // `velocity` — a fired `Projectile`, most notably, which has
    // neither a `moveSpeed` nor any business being claimed into a unit's
    // occupancy grid. A projectile crossing a cell boundary at its own
    // (much higher) speed would otherwise have its step "refused" here
    // like a blocked unit and its velocity zeroed for the tick — and,
    // since nothing ever un-blocks a projectile the way a cleared corridor
    // un-blocks a unit, that zeroing is permanent: the projectile freezes
    // mid-flight, `ProjectileSystem` never sees it travel far enough to
    // hit or expire, and it leaks for the rest of the match.
    for (const self of queries.movable) {
      const { transform, velocity } = self;
      // Cells per side of this unit's block. `cell` and `reserved` below are
      // the block's anchor (top-left) cells, and every claim, release and
      // availability check below covers the whole block at once — which
      // reduces exactly to the single-cell behaviour this system always had
      // when `size` is 1x1 (every unit but the knight).
      const size = footprintOf(self);
      const isSingleCell = size.width === 1 && size.height === 1;

      if (self.health && self.health.current <= 0) {
        const dead = self.cellOccupancy;
        if (dead) {
          grid.releaseBlock(dead.cell, size, dead.occupantId);
          grid.releaseBlock(dead.reserved, size, dead.occupantId);
          delete self.cellOccupancy;
        }
        continue;
      }

      const current = anchorIndexAt(transform.position.x, transform.position.y, size);

      let occupancy = self.cellOccupancy;
      if (!occupancy) {
        occupancy = {
          occupantId: grid.claimOccupantId(),
          cell: NO_CELL,
          reserved: NO_CELL,
          blockedFor: 0,
          rerouted: false,
        };
        self.cellOccupancy = occupancy;
      }

      if (occupancy.cell !== current) {
        if (current === occupancy.reserved) {
          // Arrived: the destination was already reserved on the way in, so
          // all that's left is to stop straddling the origin block — keeping
          // any cells the two blocks share rather than releasing and
          // immediately re-granting them.
          grid.releaseBlock(occupancy.cell, size, occupancy.occupantId, current);
          occupancy.cell = current;
          occupancy.reserved = NO_CELL;
        } else {
          // Somewhere unexpected — a unit seen for the first time, or one
          // repositioned by something other than integration. Drop whatever
          // it held and claim where it actually is. The claim can be refused
          // (two units spawned onto overlapping footprints); the unit is
          // still tracked, it just doesn't own the cells it shares, and
          // `releaseBlock` will never let it evict whoever does.
          grid.releaseBlock(occupancy.cell, size, occupancy.occupantId);
          grid.releaseBlock(occupancy.reserved, size, occupancy.occupantId);
          occupancy.reserved = NO_CELL;
          occupancy.cell = current;
          grid.reserveBlock(current, size, occupancy.occupantId);
        }
      }

      const speed = Math.hypot(velocity.x, velocity.y);
      const moving = speed > 0;

      // How far past this tick's own step to keep looking, in world units —
      // this unit's own rendered half-extent, so blocking is decided by
      // whether its rendered edge (not just its centre point) would reach
      // occupied ground, not only whether the centre itself would. Without
      // this, a unit could ease its centre right up to a shared boundary
      // over many perfectly legal single-tick steps — each one still inside
      // its own cell by a point-based check — and only be refused on the
      // step that would finally cross it, by which point its rendered width
      // is already overlapping the neighbour's cell. Checked this way
      // instead, the cell the unit is denied is the one it would need to
      // start visibly encroaching on, so it simply never gets that close:
      // no approach-and-bounce, because there is nothing to correct.
      //
      // Capped at half a cell ({@link footprintMargin}): a 1x1 unit drawn
      // wider than its cell would otherwise look past the cell it is
      // walking into and be refused by whatever stands in the cell beyond
      // it — never reaching, and so never settling on, a cell right next to
      // an occupied one. Only applies to a 1x1 unit: a multi-cell unit's
      // drawn size already matches the cells it holds (see the Rendering
      // section of the ticket that introduced multi-cell footprints), so its
      // lookahead is its own block's leading edge instead (`leadingBlockAt`).
      const margin = Math.min(self.renderable?.size ?? 0, footprintMargin(grid.cellSize));

      // Where this tick's step would put the unit's leading edge — its own
      // block when it isn't going anywhere. A 1x1 unit looks ahead by a
      // single point, extended by `margin`; a multi-cell unit looks ahead
      // from its own block's edges (`leadingBlockAt`), which checks exactly
      // the leading cells its block would newly cover: two for a straight
      // step, three for a diagonal one.
      const next = !moving
        ? occupancy.cell
        : isSingleCell
          ? grid.indexAtWorld(
              transform.position.x + (velocity.x / speed) * (speed * dt + margin),
              transform.position.y + (velocity.y / speed) * (speed * dt + margin)
            )
          : leadingBlockAt(
              transform.position.x + velocity.x * dt,
              transform.position.y + velocity.y * dt,
              velocity.x,
              velocity.y,
              size
            );

      // A unit standing in `cell` occupies exactly that one block; the
      // second claim is only legitimate while it is actually committed to
      // crossing. So a unit that stopped, turned back, or was redirected
      // hands its reservation straight back rather than pinning a block it
      // will never enter — keeping any cells still shared with the block it
      // currently stands in.
      if (next !== occupancy.reserved && occupancy.reserved !== NO_CELL) {
        grid.releaseBlock(occupancy.reserved, size, occupancy.occupantId, occupancy.cell);
        occupancy.reserved = NO_CELL;
      }

      if (!moving) {
        occupancy.blockedFor = 0;
        occupancy.rerouted = false;
        continue;
      }

      // `NO_CELL` is checked explicitly rather than left to the comparisons
      // below: it doubles as `reserved`'s "nothing reserved" sentinel, so a
      // step off the edge of the map would otherwise compare equal to it and
      // read as ground the unit already holds.
      const entersNewCell =
        next === NO_CELL || (next !== occupancy.cell && next !== occupancy.reserved);

      if (!entersNewCell) {
        // Still inside ground this unit already holds.
        occupancy.blockedFor = 0;
        occupancy.rerouted = false;
        continue;
      }

      // For a multi-cell block the cells it already holds pass trivially
      // (`isAvailableFor`/`isBlockAvailableFor` both treat a cell the same
      // occupant already holds as free), so this reserves exactly the
      // leading edge the block would newly need.
      if (grid.reserveBlock(next, size, occupancy.occupantId)) {
        occupancy.reserved = next;
        occupancy.blockedFor = 0;
        occupancy.rerouted = false;
        continue;
      }

      // Blocked. Hold position for this tick; whatever set the velocity will
      // set it again next tick, and the unit gets going the moment the cell
      // clears.
      velocity.x = 0;
      velocity.y = 0;
      occupancy.blockedFor += dt;

      if (
        !occupancy.rerouted &&
        occupancy.blockedFor >= REROUTE_AFTER_SECONDS &&
        self.movePath
      ) {
        occupancy.rerouted = true;
        const { waypoints } = self.movePath;
        const destination = waypoints[waypoints.length - 1];
        if (destination) {
          const blockedGrid = grid.asBlockedGridExcluding(occupancy.occupantId, size);
          const planned = planMovePath(
            blockedGrid,
            transform.position,
            destination,
            grid.cellSize,
            size
          );
          if (planned.status === 'found' && planned.waypoints.length > 0) {
            self.movePath = { waypoints: planned.waypoints, index: 0 };
            // MovePathSystem only hands over a waypoint when there's no
            // current `moveTarget` — clearing it here is what lets the
            // new route's first leg take over next tick instead of the
            // stale one this unit was just blocked on.
            delete self.moveTarget;
          }
        }
      }

      if (occupancy.blockedFor >= BLOCKED_GIVE_UP_SECONDS) {
        delete self.moveTarget;
        delete self.movePath;
        occupancy.blockedFor = 0;
        occupancy.rerouted = false;
      }
    }
  };
}
