import { World } from 'miniplex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { units, type UnitDefinition } from './units';
import { spawnUnit } from './spawn';

/**
 * A fabricated, stats-free unit definition, stood in for a real unit type
 * during a test — every real unit type now ships a full combat kit, but
 * `spawnUnit`'s optional-component branches (for a definition that doesn't)
 * remain part of the contract for future unit types and still need coverage.
 */
const STATS_FREE_DEFINITION: UnitDefinition = {
  type: 'knight',
  shape: 'circle',
  health: 12,
};

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

  describe('for a unit type whose definition carries no combat stats', () => {
    let originalKnight: UnitDefinition;

    beforeEach(() => {
      originalKnight = units.knight;
      units.knight = STATS_FREE_DEFINITION;
    });

    afterEach(() => {
      units.knight = originalKnight;
    });

    it('leaves attackRange unset', () => {
      const world = new World<Entity>();

      const unit = spawnUnit(world, {
        type: 'knight',
        team: 'blue',
        position: { x: 0, y: 0 },
      });

      expect(unit.attackRange).toBeUndefined();
    });

    it('leaves aggroRange unset', () => {
      const world = new World<Entity>();

      const unit = spawnUnit(world, {
        type: 'knight',
        team: 'blue',
        position: { x: 0, y: 0 },
      });

      expect(unit.aggroRange).toBeUndefined();
    });

    it('is left out of the attackers query', () => {
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

    it('spawns no `ranged` component', () => {
      const world = new World<Entity>();

      const knight = spawnUnit(world, { type: 'knight', team: 'blue', position: { x: 0, y: 0 } });

      expect(knight.ranged).toBeUndefined();
    });
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

  it('spawns a knight with the full attacker component set, and includes it in the attackers query', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const knight = spawnUnit(world, { type: 'knight', team: 'blue', position: { x: 0, y: 0 } });

    expect(knight.attackRange).toEqual({ value: 1 });
    expect(knight.aggroRange).toEqual({ value: 8 });
    expect(knight.damage).toEqual({ value: 8 });
    expect(knight.attackCooldown).toEqual({ duration: 1 });
    expect(knight.moveSpeed).toBeDefined();
    expect(knight.ranged).toBeUndefined();
    expect([...queries.attackers]).toEqual([knight]);
  });

  it('marks a crossbowsoldier as a ranged attacker, and spawns no extra entity for it', () => {
    const world = new World<Entity>();

    spawnUnit(world, {
      type: 'crossbowsoldier',
      team: 'blue',
      position: { x: 0, y: 0 },
    });

    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].ranged).toBeDefined();
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'knight', team: 'blue', position });
    position.x = 999;

    expect(unit.transform?.position.x).toBe(16);
  });
});
