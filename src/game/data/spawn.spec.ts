import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { spawnUnit } from './spawn';

describe('spawnUnit', () => {
  it('adds a renderable unit to the world, centered in its grid cell', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'knight',
      team: 'red',
      // Falls inside the [0, 64) cell on both axes, which centers on (32, 32).
      position: { x: 10, y: 20 },
    });

    expect(unit.transform?.position).toEqual({ x: 32, y: 32 });
    expect(unit.renderable?.shape).toBe('circle');
    expect(unit.team).toBe('red');
    expect(unit.unitType).toBe('knight');
    expect(unit.health).toEqual({ current: 12, max: 12 });
  });

  it('makes a blue unit selectable but not a red one', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const blue = spawnUnit(world, { type: 'knight', team: 'blue', position: { x: 0, y: 0 } });
    const red = spawnUnit(world, { type: 'knight', team: 'red', position: { x: 64, y: 0 } });

    expect(blue.selectable).toBe(true);
    expect(red.selectable).toBeUndefined();
    expect([...queries.selectable]).toEqual([blue]);
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'knight', team: 'blue', position });
    position.x = 999;

    expect(unit.transform?.position.x).toBe(32);
  });
});
