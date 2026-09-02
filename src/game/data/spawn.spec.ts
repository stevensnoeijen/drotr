import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { spawnUnit } from './spawn';

describe('spawnUnit', () => {
  it('adds a renderable unit to the world, centered in its grid cell', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'knight',
      team: 'red',
      // Falls inside the [0, 32) cell on both axes, which centers on (16, 16).
      position: { x: 10, y: 20 },
    });

    expect(unit.transform?.position).toEqual({ x: 16, y: 16 });
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

  it('sets attackRange from the unit definition\'s range, in grid cells', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(unit.attackRange).toEqual({ value: 1 });
  });

  it('leaves attackRange unset for a unit type with no range stat', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'knight',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(unit.attackRange).toBeUndefined();
  });

  it('sets aggroRange from the unit definition\'s aggroRange, in grid cells', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(unit.aggroRange).toEqual({ value: 5 });
  });

  it('leaves aggroRange unset for a unit type with no aggroRange stat', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'knight',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(unit.aggroRange).toBeUndefined();
  });

  it('sets damage and attackCooldown from the unit definition\'s combat stats', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(unit.damage).toEqual({ value: 3 });
    expect(unit.attackCooldown).toEqual({ duration: 1 });
  });

  it('leaves a unit type with no combat stats out of the attackers query', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const knight = spawnUnit(world, { type: 'knight', team: 'blue', position: { x: 0, y: 0 } });
    const swordsmen = spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: { x: 64, y: 0 },
    });

    expect(knight.damage).toBeUndefined();
    expect(knight.attackCooldown).toBeUndefined();
    expect([...queries.attackers]).toEqual([swordsmen]);
    // Still a valid victim, though.
    expect(queries.combatants.size).toBe(2);
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'knight', team: 'blue', position });
    position.x = 999;

    expect(unit.transform?.position.x).toBe(16);
  });
});
