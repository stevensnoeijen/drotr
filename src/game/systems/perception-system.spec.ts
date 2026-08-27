import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { CELL_SIZE } from '~/lib/grid';
import { createPerceptionSystem, runPerceptionScan } from './perception-system';

/** A minimal combatant entity, positioned in world units. */
function makeUnit(world: World<Entity>, team: Entity['team'], x: number, aggroRangeCells = 3): Entity {
  return world.add({
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
    const far = makeUnit(world, 'red', 5 * CELL_SIZE);
    const near = makeUnit(world, 'red', 2 * CELL_SIZE);

    runPerceptionScan(world, queries);

    expect(self.target).toEqual({ entityId: near.id });
    expect(far).toBeDefined();
  });

  it('never targets a same-team entity, even when it is the closest', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'blue', 1 * CELL_SIZE); // closest, but same team
    const enemy = makeUnit(world, 'red', 3 * CELL_SIZE);

    runPerceptionScan(world, queries);

    expect(self.target).toEqual({ entityId: enemy.id });
  });

  it('acquires no target when only teammates are in range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'blue', 1 * CELL_SIZE);

    runPerceptionScan(world, queries);

    expect(self.target).toBeUndefined();
  });

  it('clears the target once it moves out of range', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 3);
    const enemy = makeUnit(world, 'red', 1 * CELL_SIZE);

    runPerceptionScan(world, queries);
    expect(self.target).toEqual({ entityId: enemy.id });

    enemy.transform!.position.x = 20 * CELL_SIZE;
    runPerceptionScan(world, queries);

    expect(self.target).toBeUndefined();
  });

  it('clears the target once it dies', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * CELL_SIZE);

    runPerceptionScan(world, queries);
    expect(self.target).toEqual({ entityId: enemy.id });

    enemy.health!.current = 0;
    runPerceptionScan(world, queries);

    expect(self.target).toBeUndefined();
  });
});

describe('createPerceptionSystem', () => {
  it('does not scan before the interval has elapsed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, 1);

    const self = makeUnit(world, 'blue', 0, 10);
    makeUnit(world, 'red', 1 * CELL_SIZE);

    system(world, 0.5);

    expect(self.target).toBeUndefined();
  });

  it('scans once the accumulated time reaches the interval', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, 1);

    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * CELL_SIZE);

    system(world, 0.6);
    expect(self.target).toBeUndefined();
    system(world, 0.6);

    expect(self.target).toEqual({ entityId: enemy.id });
  });

  it('units already within range at scenario load acquire a target on the immediate scan, without waiting for the periodic tick', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createPerceptionSystem(queries, 1);

    // Simulates spawning two units already in range of each other.
    const self = makeUnit(world, 'blue', 0, 10);
    const enemy = makeUnit(world, 'red', 1 * CELL_SIZE);

    // The immediate on-load scan a caller runs right after scenario setup —
    // before the periodic system has ever run.
    runPerceptionScan(world, queries);
    expect(self.target).toEqual({ entityId: enemy.id });

    // The periodic system hasn't ticked at all yet; the target set by the
    // immediate scan must still be in place.
    system(world, 0.1);
    expect(self.target).toEqual({ entityId: enemy.id });
  });
});
