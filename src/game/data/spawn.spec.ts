import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { spawnInitialUnits, spawnUnit } from './spawn';

describe('spawnUnit', () => {
  it('adds a renderable, selectable, positioned unit to the world', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'soldier',
      team: 'red',
      position: { x: 10, y: 20 },
    });

    expect(unit.transform?.position).toEqual({ x: 10, y: 20 });
    expect(unit.renderable?.shape).toBe('circle');
    expect(unit.selectable).toBe(true);
    expect(unit.team).toBe('red');
  });

  it('copies the position so callers cannot mutate it through the entity', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'soldier', team: 'blue', position });
    position.x = 999;

    expect(unit.transform?.position.x).toBe(1);
  });
});

describe('spawnInitialUnits', () => {
  it('seeds both teams and every unit is renderable', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    spawnInitialUnits(world);

    expect(world.size).toBeGreaterThan(0);
    expect(queries.renderable.size).toBe(world.size);
    expect([...world].some((e) => e.team === 'blue')).toBe(true);
    expect([...world].some((e) => e.team === 'red')).toBe(true);
  });
});
