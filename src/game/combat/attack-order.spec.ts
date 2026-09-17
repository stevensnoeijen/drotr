import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { cancelAttackOrder, issueAttackOrder } from './attack-order';

const unit = (): Entity => ({
  id: 7,
  transform: { position: { x: 0, y: 0 }, rotation: 0 },
  velocity: { x: 5, y: -5 },
  team: 'blue',
});

describe('issueAttackOrder', () => {
  it('records the target as manual, so PerceptionSystem leaves it alone', () => {
    const entity = unit();

    issueAttackOrder(entity, 42);

    expect(entity.target).toEqual({ entityId: 42, manual: true });
  });

  it('drops every move order the unit was carrying', () => {
    const entity: Entity = {
      ...unit(),
      moveTarget: { position: { x: 1, y: 1 } },
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
      pendingMoveOrder: { destination: { x: 2, y: 2 } },
    };

    issueAttackOrder(entity, 42);

    expect(entity.moveTarget).toBeUndefined();
    expect(entity.movePath).toBeUndefined();
    expect(entity.pendingMoveOrder).toBeUndefined();
  });

  it('drops a pursuit of some previous target, so the new one is routed afresh', () => {
    const entity: Entity = {
      ...unit(),
      target: { entityId: 3 },
      pursuit: { entityId: 3, plannedPosition: { x: 9, y: 9 }, sinceReplan: 0.25 },
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
    };

    issueAttackOrder(entity, 42);

    expect(entity.pursuit).toBeUndefined();
    expect(entity.movePath).toBeUndefined();
    expect(entity.target).toEqual({ entityId: 42, manual: true });
  });

  it('brings the unit to rest, leaving SeekSystem to re-aim it', () => {
    const entity = unit();

    issueAttackOrder(entity, 42);

    expect(entity.velocity).toEqual({ x: 0, y: 0 });
  });

  it('tolerates a unit with no velocity at all', () => {
    const entity: Entity = { id: 7, team: 'blue' };

    expect(() => issueAttackOrder(entity, 42)).not.toThrow();
    expect(entity.target).toEqual({ entityId: 42, manual: true });
  });
});

describe('cancelAttackOrder', () => {
  it('demotes a manual target to an auto-acquired one rather than dropping it', () => {
    const entity: Entity = { ...unit(), target: { entityId: 42, manual: true } };

    cancelAttackOrder(entity);

    expect(entity.target).toEqual({ entityId: 42 });
  });

  it('drops any pursuit of that target', () => {
    const entity: Entity = {
      ...unit(),
      target: { entityId: 42, manual: true },
      pursuit: { entityId: 42, plannedPosition: { x: 9, y: 9 }, sinceReplan: 0 },
    };

    cancelAttackOrder(entity);

    expect(entity.pursuit).toBeUndefined();
  });

  it('leaves the route itself for the caller to replace', () => {
    const entity: Entity = {
      ...unit(),
      target: { entityId: 42, manual: true },
      movePath: { waypoints: [{ x: 9, y: 9 }], index: 0 },
      moveTarget: { position: { x: 9, y: 9 } },
    };

    cancelAttackOrder(entity);

    expect(entity.movePath).toEqual({ waypoints: [{ x: 9, y: 9 }], index: 0 });
    expect(entity.moveTarget).toEqual({ position: { x: 9, y: 9 } });
  });

  it('leaves an auto-acquired target exactly as it was', () => {
    const entity: Entity = { ...unit(), target: { entityId: 42 } };

    cancelAttackOrder(entity);

    expect(entity.target).toEqual({ entityId: 42 });
  });

  it('is a no-op for a unit with no target at all', () => {
    const entity = unit();

    cancelAttackOrder(entity);

    expect(entity.target).toBeUndefined();
    expect(entity.pursuit).toBeUndefined();
  });
});
