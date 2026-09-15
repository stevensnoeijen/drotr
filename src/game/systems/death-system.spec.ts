import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createDeathSystem, DEATH_REMOVAL_DELAY_SECONDS } from './death-system';

const DT = 1 / 60;

function makeUnit(world: World<Entity>, current: number, id = 1): Entity {
  return world.add({
    id,
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    health: { current, max: 10 },
  });
}

describe('createDeathSystem', () => {
  it('marks an entity whose HP reached 0 as dead, without removing it', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const entity = makeUnit(world, 0);
    system(world, DT);

    expect(entity.dead).toEqual({ elapsed: DT });
    expect(world.entities).toContain(entity);
  });

  it('does not mark a living entity', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const entity = makeUnit(world, 10);
    system(world, DT);

    expect(entity.dead).toBeUndefined();
  });

  it('does not remove a dead entity before the removal delay elapses', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const entity = makeUnit(world, 0);

    // Just short of the delay.
    const ticks = Math.floor((DEATH_REMOVAL_DELAY_SECONDS - DT) / DT);
    for (let i = 0; i < ticks; i++) {
      system(world, DT);
    }

    expect(world.entities).toContain(entity);
    expect(entity.dead!.elapsed).toBeLessThan(DEATH_REMOVAL_DELAY_SECONDS);
  });

  it('removes a dead entity once the removal delay elapses', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const entity = makeUnit(world, 0);

    // Enough ticks to comfortably clear the delay.
    const ticks = Math.ceil(DEATH_REMOVAL_DELAY_SECONDS / DT) + 1;
    for (let i = 0; i < ticks; i++) {
      system(world, DT);
    }

    expect(world.entities).not.toContain(entity);
    expect(world.entities.length).toBe(0);
  });

  it('marks an entity exactly once, so a single large step does not double-count elapsed time', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const entity = makeUnit(world, 0);
    system(world, DT);
    const firstElapsed = entity.dead!.elapsed;
    system(world, DT);

    // Second call ticks the existing countdown by DT; it must not reset
    // `dead` (which would restart the countdown) since the entity was
    // already marked on the first call.
    expect(entity.dead!.elapsed).toBeCloseTo(firstElapsed + DT, 10);
  });

  it('leaves a still-alive entity with a dying neighbor untouched', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createDeathSystem(queries);

    const dying = makeUnit(world, 0, 1);
    const alive = makeUnit(world, 5, 2);

    const ticks = Math.ceil(DEATH_REMOVAL_DELAY_SECONDS / DT) + 1;
    for (let i = 0; i < ticks; i++) {
      system(world, DT);
    }

    expect(world.entities).not.toContain(dying);
    expect(world.entities).toContain(alive);
    expect(alive.dead).toBeUndefined();
  });
});
