import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import { createPerceptionSystem, runPerceptionScan } from './perception-system';

/** Auto-incrementing ids, so `target.entityId` always resolves to one entity. */
let nextId = 1;

/** A minimal combatant entity, positioned in world units. */
function makeUnit(world: World<Entity>, team: Entity['team'], x: number, aggroRangeCells = 3): Entity {
  return world.add({
    id: nextId++,
    transform: { position: { x, y: 0 }, rotation: 0 },
    team,
    aggroRange: { value: aggroRangeCells },
    health: { current: 10, max: 10 },
  });
}

describe('runPerceptionScan', () => {
  it('targets the nearest enemy when several are in range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    const far = makeUnit(world, 'red', 5 * DEFAULT_CELL_SIZE);
    const near = makeUnit(world, 'red', 2 * DEFAULT_CELL_SIZE);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

    expect(self.target).toEqual({ entityId: near.id });
    expect(far).toBeDefined();
  });

  it('never targets a same-team entity, even when it is the closest', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'blue', 1 * DEFAULT_CELL_SIZE); // closest, but same team
    const enemy = makeUnit(world, 'red', 3 * DEFAULT_CELL_SIZE);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

    expect(self.target).toEqual({ entityId: enemy.id });
  });

  it('acquires no target when only teammates are in range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'blue', 1 * DEFAULT_CELL_SIZE);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

    expect(self.target).toBeUndefined();
  });

  it('clears the target once it moves out of range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 3);
    const enemy = makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);
    expect(self.target).toEqual({ entityId: enemy.id });

    enemy.transform!.position.x = 20 * DEFAULT_CELL_SIZE;
    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

    expect(self.target).toBeUndefined();
  });

  it('clears the target once it dies', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);
    expect(self.target).toEqual({ entityId: enemy.id });

    enemy.health!.current = 0;
    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

    expect(self.target).toBeUndefined();
  });

  describe('a manually ordered target', () => {
    it('is never retargeted to a closer enemy', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const self = makeUnit(world, 'blue', 0, 10);
      const ordered = makeUnit(world, 'red', 5 * DEFAULT_CELL_SIZE);
      makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE); // much closer, but not ordered
      self.target = { entityId: ordered.id!, manual: true };

      runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

      expect(self.target).toEqual({ entityId: ordered.id, manual: true });
    });

    it('is kept even when it sits outside aggroRange', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const self = makeUnit(world, 'blue', 0, 3);
      const ordered = makeUnit(world, 'red', 50 * DEFAULT_CELL_SIZE);
      self.target = { entityId: ordered.id!, manual: true };

      runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

      expect(self.target).toEqual({ entityId: ordered.id, manual: true });
    });

    it('is dropped once the ordered unit dies, freeing the unit to auto-target again', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const self = makeUnit(world, 'blue', 0, 10);
      const ordered = makeUnit(world, 'red', 5 * DEFAULT_CELL_SIZE);
      const other = makeUnit(world, 'red', 2 * DEFAULT_CELL_SIZE);
      self.target = { entityId: ordered.id!, manual: true };

      ordered.health!.current = 0;
      runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

      expect(self.target).toEqual({ entityId: other.id });
    });

    it('is dropped once the ordered unit has left the world entirely', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const self = makeUnit(world, 'blue', 0, 10);
      const ordered = makeUnit(world, 'red', 5 * DEFAULT_CELL_SIZE);
      self.target = { entityId: ordered.id!, manual: true };

      world.remove(ordered);
      runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

      expect(self.target).toBeUndefined();
    });

    it('still re-picks freely for a unit whose target was auto-acquired', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const self = makeUnit(world, 'blue', 0, 10);
      const far = makeUnit(world, 'red', 5 * DEFAULT_CELL_SIZE);
      const near = makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);
      self.target = { entityId: far.id! };

      runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);

      expect(self.target).toEqual({ entityId: near.id });
    });
  });
});

describe('createPerceptionSystem', () => {
  it('does not scan before the interval has elapsed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, DEFAULT_CELL_SIZE, 1);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);

    system(world, 0.5);

    expect(self.target).toBeUndefined();
  });

  it('scans once the accumulated time reaches the interval', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, DEFAULT_CELL_SIZE, 1);

    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);

    system(world, 0.6);
    expect(self.target).toBeUndefined();
    system(world, 0.6);

    expect(self.target).toEqual({ entityId: enemy.id });
  });

  it('units already within range at scenario load acquire a target on the immediate scan, without waiting for the periodic tick', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, DEFAULT_CELL_SIZE, 1);

    // Simulates spawning two units already in range of each other.
    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * DEFAULT_CELL_SIZE);

    // The immediate on-load scan a caller runs right after scenario setup —
    // before the periodic system has ever run.
    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);
    expect(self.target).toEqual({ entityId: enemy.id });

    // The periodic system hasn't ticked at all yet; the target set by the
    // immediate scan must still be in place.
    system(world, 0.1);
    expect(self.target).toEqual({ entityId: enemy.id });
  });
});

describe('runPerceptionScan at a cell size other than the default', () => {
  it('measures aggro range in cells of the size it is given', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    // 3 cells of aggro range: 96px at 32px cells, 120px at 40px cells. An
    // enemy 110px away is only in range on the larger grid.
    const self = makeUnit(world, 'blue', 0, 3);
    const enemy = makeUnit(world, 'red', 110);

    runPerceptionScan(world, queries, DEFAULT_CELL_SIZE);
    expect(self.target).toBeUndefined();

    runPerceptionScan(world, queries, 40);
    expect(self.target).toEqual({ entityId: enemy.id });
  });
});
