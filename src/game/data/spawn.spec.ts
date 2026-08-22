import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { spawnInitialUnits, spawnUnit } from './spawn';

describe('spawnUnit', () => {
  it('adds a renderable, selectable unit to the world, centered in its grid cell', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'knight',
      team: 'red',
      // Falls inside the [0, 64) cell on both axes, which centers on (32, 32).
      position: { x: 10, y: 20 },
    });

    expect(unit.transform?.position).toEqual({ x: 32, y: 32 });
    expect(unit.renderable?.shape).toBe('circle');
    expect(unit.selectable).toBe(true);
    expect(unit.team).toBe('red');
    expect(unit.unitType).toBe('knight');
    expect(unit.health).toEqual({ current: 12, max: 12 });
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'knight', team: 'blue', position });
    position.x = 999;

    expect(unit.transform?.position.x).toBe(32);
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
