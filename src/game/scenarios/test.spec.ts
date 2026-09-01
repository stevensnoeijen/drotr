import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { testScenario } from './test';

describe('testScenario', () => {
  it('seeds both teams and every unit is renderable', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    testScenario.setup(world);

    expect(world.size).toBeGreaterThan(0);
    expect(queries.renderable.size).toBe(world.size);
    expect([...world].some((e) => e.team === 'blue')).toBe(true);
    expect([...world].some((e) => e.team === 'red')).toBe(true);
  });
});
