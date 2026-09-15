import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { applyMoveOrder, planMoveOrder } from './move-order';

const baseEntity = (): Entity => ({
  transform: { position: { x: 0, y: 0 }, rotation: 0 },
  velocity: { x: 5, y: 5 },
});

/** A fully open 5x5 collision grid. */
const openGrid: CollisionGrid = { width: 5, height: 5, collision: new Uint8Array(25) };

describe('planMoveOrder', () => {
  it('plans a straight-line "target" when no grid is given', () => {
    const result = planMoveOrder(undefined, { x: 0, y: 0 }, { x: 16, y: 16 });

    expect(result).toEqual({
      kind: 'target',
      moveTarget: { position: { x: 16, y: 16 } },
    });
  });

  it('plans a routed "path" through a grid', () => {
    const result = planMoveOrder(openGrid, { x: 16, y: 16 }, { x: 144, y: 144 });

    expect(result.kind).toBe('path');
  });

  it('plans a "stop" when the destination is the cell "from" is already in', () => {
    const result = planMoveOrder(openGrid, { x: 16, y: 16 }, { x: 16, y: 16 });

    expect(result).toEqual({ kind: 'stop' });
  });

  it('plans "none" for an unreachable destination', () => {
    const result = planMoveOrder(openGrid, { x: 16, y: 16 }, { x: 1600, y: 1600 });

    expect(result).toEqual({ kind: 'none' });
  });

  it('plans a route that starts from "from", not some other position', () => {
    const result = planMoveOrder(openGrid, { x: 16, y: 144 }, { x: 144, y: 80 });

    expect(result.kind).toBe('path');
    if (result.kind === 'path') {
      // (16, 144) to (144, 80) is off any straight or 45° line, so the
      // route must bend — proving it was actually planned from (16, 144)
      // rather than some other position.
      expect(result.movePath.waypoints).toEqual([
        { x: 80, y: 80 },
        { x: 144, y: 80 },
      ]);
    }
  });
});

describe('applyMoveOrder', () => {
  it('does nothing for a "none" result', () => {
    const entity = {
      ...baseEntity(),
      moveTarget: { position: { x: 1, y: 1 } },
    };

    applyMoveOrder(entity, { kind: 'none' });

    expect(entity.moveTarget).toEqual({ position: { x: 1, y: 1 } });
  });

  it('sets a straight-line MoveTarget and drops any existing route', () => {
    const entity = {
      ...baseEntity(),
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
    };

    applyMoveOrder(entity, {
      kind: 'target',
      moveTarget: { position: { x: 16, y: 16 } },
    });

    expect(entity.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(entity.movePath).toBeUndefined();
  });

  it('sets a MovePath and drops any existing MoveTarget', () => {
    const entity = {
      ...baseEntity(),
      moveTarget: { position: { x: 1, y: 1 } },
    };

    applyMoveOrder(entity, {
      kind: 'path',
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
    });

    expect(entity.movePath).toEqual({ waypoints: [{ x: 9, y: 9 }], index: 0 });
    expect(entity.moveTarget).toBeUndefined();
  });

  it('zeroes velocity and clears both route components for a "stop" result', () => {
    const entity = {
      ...baseEntity(),
      moveTarget: { position: { x: 1, y: 1 } },
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
    };

    applyMoveOrder(entity, { kind: 'stop' });

    expect(entity.velocity).toEqual({ x: 0, y: 0 });
    expect(entity.moveTarget).toBeUndefined();
    expect(entity.movePath).toBeUndefined();
  });
});
