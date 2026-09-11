import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createPendingMoveOrderSystem } from './pending-move-order-system';

function setup(entity: Partial<Entity> = {}) {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const system = createPendingMoveOrderSystem(queries);

  const self = world.add({
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    moveSpeed: { value: 100 },
    ...entity,
  });

  return { world, self, tick: () => system(world, 1 / 60) };
}

describe('createPendingMoveOrderSystem', () => {
  it('leaves a staged order untouched while the unit is still mid-transition (#178)', () => {
    const { self, tick } = setup({
      moveTarget: { position: { x: 50, y: 50 } },
      pendingMoveOrder: {
        kind: 'target',
        moveTarget: { position: { x: 16, y: 16 } },
      },
    });

    tick();

    // MoveTarget (the in-flight cell-to-cell step) is untouched — no
    // direction change mid-step — and the order is still waiting.
    expect(self.moveTarget).toEqual({ position: { x: 50, y: 50 } });
    expect(self.pendingMoveOrder).toEqual({
      kind: 'target',
      moveTarget: { position: { x: 16, y: 16 } },
    });
  });

  it('applies a staged straight-line order once MoveTarget clears', () => {
    const { self, tick } = setup({
      pendingMoveOrder: {
        kind: 'target',
        moveTarget: { position: { x: 16, y: 16 } },
      },
    });

    tick();

    expect(self.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it('applies a staged routed order, handing over its movePath rather than a moveTarget directly', () => {
    const { self, tick } = setup({
      pendingMoveOrder: {
        kind: 'path',
        movePath: {
          waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
          index: 0,
        },
      },
    });

    tick();

    expect(self.movePath).toEqual({
      waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      index: 0,
    });
    expect(self.moveTarget).toBeUndefined();
    expect(self.pendingMoveOrder).toBeUndefined();
  });

  it('applies a staged stop order, zeroing velocity and clearing any leftover route', () => {
    const { self, tick } = setup({
      velocity: { x: 5, y: 5 },
      movePath: { waypoints: [{ x: 30, y: 40 }], index: 1 },
      pendingMoveOrder: { kind: 'stop' },
    });

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
    self.pendingMoveOrder = {
      kind: 'target',
      moveTarget: { position: { x: 999, y: 999 } },
    };

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
});
