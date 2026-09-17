import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { planMovePath } from '~/game/navigation/plan-move-path';
import { cellPositionToVector } from '~/lib/grid';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { createPendingMoveOrderSystem } from './pending-move-order-system';

function setup(entity: Partial<Entity> = {}, grid?: CollisionGrid) {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const system = createPendingMoveOrderSystem(queries, grid);

  const self = world.add({
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    moveSpeed: { value: 100 },
    ...entity,
  });

  return { world, self, tick: () => system(world, 1 / 60) };
}

/** A fully open 10x10 collision grid. */
const openGrid: CollisionGrid = { width: 10, height: 10, collision: new Uint8Array(100) };

describe('createPendingMoveOrderSystem', () => {
  it('leaves a staged order untouched while the unit is still mid-transition (#178)', () => {
    const { self, tick } = setup({
      moveTarget: { position: { x: 50, y: 50 } },
      pendingMoveOrder: { destination: { x: 16, y: 16 } },
    });

    tick();

    // MoveTarget (the in-flight cell-to-cell step) is untouched — no
    // direction change mid-step — and the order is still waiting.
    expect(self.moveTarget).toEqual({ position: { x: 50, y: 50 } });
    expect(self.pendingMoveOrder).toEqual({ destination: { x: 16, y: 16 } });
  });

  it('applies a staged straight-line order (no grid) once MoveTarget clears', () => {
    const { self, tick } = setup({
      pendingMoveOrder: { destination: { x: 16, y: 16 } },
    });

    tick();

    expect(self.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it('plans and applies a staged routed order using the grid, handing over a movePath', () => {
    const from = cellPositionToVector(0, 0);
    const destination = cellPositionToVector(4, 4);
    const { self, tick } = setup(
      {
        transform: { position: { x: from.x, y: from.y }, rotation: 0 },
        pendingMoveOrder: { destination: { x: destination.x, y: destination.y } },
      },
      openGrid
    );

    tick();

    const expected = planMovePath(openGrid, { x: from.x, y: from.y }, {
      x: destination.x,
      y: destination.y,
    });
    expect(expected.status).toBe('found');
    expect(self.movePath).toEqual({ waypoints: expected.waypoints, index: 0 });
    expect(self.moveTarget).toBeUndefined();
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it("applies a staged stop order when the destination is the unit's own cell, zeroing velocity and clearing any leftover route", () => {
    const here = cellPositionToVector(2, 2);
    const { self, tick } = setup(
      {
        transform: { position: { x: here.x, y: here.y }, rotation: 0 },
        velocity: { x: 5, y: 5 },
        movePath: { waypoints: [{ x: 30, y: 40 }], index: 1 },
        pendingMoveOrder: { destination: { x: here.x, y: here.y } },
      },
      openGrid
    );

    tick();

    expect(self.velocity).toEqual({ x: 0, y: 0 });
    expect(self.movePath).toBeUndefined();
    expect(self.moveTarget).toBeUndefined();
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it('does nothing for an entity with no staged order', () => {
    const { self, tick } = setup({
      moveTarget: { position: { x: 1, y: 1 } },
    });

    tick();

    expect(self.moveTarget).toEqual({ position: { x: 1, y: 1 } });
  });

  it('the full lifecycle: a mid-transition order only takes effect after the unit arrives (#178)', () => {
    const { self, tick } = setup({
      moveTarget: { position: { x: 32, y: 0 } },
    });

    // A new order arrives mid-transition and is staged (mirrors what
    // moveSelectedTo does in `~/game/systems/input-system`).
    self.pendingMoveOrder = { destination: { x: 999, y: 999 } };

    // While still mid-transition, the staged order has no effect.
    tick();
    expect(self.moveTarget).toEqual({ position: { x: 32, y: 0 } });
    expect(self.pendingMoveOrder).toBeDefined();

    // The unit completes its current cell-to-cell transition (simulated —
    // MoveTargetSystem is what actually clears MoveTarget on arrival).
    delete self.moveTarget;

    // Only now does the staged order take effect.
    tick();
    expect(self.moveTarget).toEqual({ position: { x: 999, y: 999 } });
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it("plans from the unit's position when the order is applied, not its position when it was staged (#178)", () => {
    // The unit is staged for a route while sitting at cell (0, 0) — this
    // mirrors a unit mid-transition, whose transform.position at staging
    // time is somewhere between two cells and must not be baked into the
    // eventual route.
    const staleFrom = cellPositionToVector(0, 0);
    const arrivalCell = cellPositionToVector(4, 4);
    // Off the diagonal from both candidate start cells, so the two produce
    // genuinely different routes rather than both collapsing to the same
    // single-segment diagonal.
    const destination = cellPositionToVector(9, 3);

    const { self, tick } = setup(
      {
        transform: { position: { x: staleFrom.x, y: staleFrom.y }, rotation: 0 },
        moveTarget: { position: { x: 500, y: 500 } }, // still mid-transition
        pendingMoveOrder: { destination: { x: destination.x, y: destination.y } },
      },
      openGrid
    );

    // Still mid-transition: nothing applied yet.
    tick();
    expect(self.pendingMoveOrder).toBeDefined();

    // The in-flight transition actually finishes somewhere else entirely —
    // (4, 4), not the (0, 0) the unit was standing at when the order was
    // staged.
    self.transform.position = { x: arrivalCell.x, y: arrivalCell.y };
    delete self.moveTarget;

    tick();

    const fromArrival = planMovePath(
      openGrid,
      { x: arrivalCell.x, y: arrivalCell.y },
      { x: destination.x, y: destination.y }
    );
    const fromStaleStart = planMovePath(
      openGrid,
      { x: staleFrom.x, y: staleFrom.y },
      { x: destination.x, y: destination.y }
    );

    expect(self.movePath).toEqual({ waypoints: fromArrival.waypoints, index: 0 });
    // Sanity check that this is actually a meaningful assertion: planning
    // from the stale click-time position would have produced a different
    // route.
    expect(fromArrival.waypoints).not.toEqual(fromStaleStart.waypoints);
  });
});
