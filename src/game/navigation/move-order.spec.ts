import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { applyMoveOrder } from './move-order';

const baseEntity = (): Entity => ({
  transform: { position: { x: 0, y: 0 }, rotation: 0 },
  velocity: { x: 5, y: 5 },
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
