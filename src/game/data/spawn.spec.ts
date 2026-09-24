import { World } from 'miniplex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { units, type UnitDefinition } from './units';
import { spawnUnit } from './spawn';
import { DEFAULT_CELL_SIZE } from '~/lib/grid';

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
    }, DEFAULT_CELL_SIZE);

    expect(unit.transform?.position).toEqual({ x: 16, y: 16 });
    expect(unit.renderable?.shape).toBe('circle');
    expect(unit.team).toBe('red');
    expect(unit.unitType).toBe('knight');
    expect(unit.health).toEqual({ current: 12, max: 12 });
  });

  it('makes a blue unit selectable but not a red one', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const blue = spawnUnit(
      world,
      { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
      DEFAULT_CELL_SIZE
    );
    const red = spawnUnit(
      world,
      { type: 'knight', team: 'red', position: { x: 64, y: 0 } },
      DEFAULT_CELL_SIZE
    );

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
    }, DEFAULT_CELL_SIZE);

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
      }, DEFAULT_CELL_SIZE);

      expect(unit.attackRange).toBeUndefined();
    });

    it('leaves aggroRange unset', () => {
      const world = new World<Entity>();

      const unit = spawnUnit(world, {
        type: 'knight',
        team: 'blue',
        position: { x: 0, y: 0 },
      }, DEFAULT_CELL_SIZE);

      expect(unit.aggroRange).toBeUndefined();
    });

    it('is left out of the attackers query', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);

      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        DEFAULT_CELL_SIZE
      );
      const swordsmen = spawnUnit(world, {
        type: 'swordsmen',
        team: 'red',
        position: { x: 64, y: 0 },
      }, DEFAULT_CELL_SIZE);

      expect(knight.damage).toBeUndefined();
      expect(knight.attackCooldown).toBeUndefined();
      expect([...queries.attackers]).toEqual([swordsmen]);
      // Still a valid victim, though.
      expect(queries.combatants.size).toBe(2);
    });

    it('spawns no `ranged` component', () => {
      const world = new World<Entity>();

      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        DEFAULT_CELL_SIZE
      );

      expect(knight.ranged).toBeUndefined();
    });
  });

  it('sets aggroRange from the unit definition\'s aggroRange, in grid cells', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.aggroRange).toEqual({ value: 5 });
  });

  it('sets damage and attackCooldown from the unit definition\'s combat stats', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.damage).toEqual({ value: 3 });
    expect(unit.attackCooldown).toEqual({ duration: 1 });
  });

  it('spawns a knight with the full attacker component set, and includes it in the attackers query', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const knight = spawnUnit(
      world,
      { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
      DEFAULT_CELL_SIZE
    );

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
    }, DEFAULT_CELL_SIZE);

    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].ranged).toBeDefined();
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'knight', team: 'blue', position }, DEFAULT_CELL_SIZE);
    position.x = 999;

    expect(unit.transform?.position.x).toBe(16);
  });

  describe('on a map whose cells are not the default size', () => {
    // The unit grid is the loaded map's own tile grid, so a 40px-tile map
    // places, sizes and speeds units in 40px cells.
    const cellSize = 40;

    it('snaps to the centre of a cell of that size', () => {
      const world = new World<Entity>();

      const unit = spawnUnit(
        world,
        // Inside the [40, 80) x [0, 40) cell, centred on (60, 20).
        { type: 'knight', team: 'blue', position: { x: 41, y: 39 } },
        cellSize
      );

      expect(unit.transform?.position).toEqual({ x: 60, y: 20 });
    });

    it('converts cell-based movement and projectile speeds to world units at that size', () => {
      const world = new World<Entity>();

      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        cellSize
      );
      const crossbow = spawnUnit(
        world,
        { type: 'crossbowsoldier', team: 'blue', position: { x: 0, y: 0 } },
        cellSize
      );
      const defaultCrossbow = spawnUnit(
        world,
        { type: 'crossbowsoldier', team: 'blue', position: { x: 0, y: 0 } },
        DEFAULT_CELL_SIZE
      );

      expect(knight.moveSpeed).toEqual({ value: units.knight.movementSpeed! * cellSize });
      expect(crossbow.ranged!.projectileSpeed / cellSize).toBe(
        defaultCrossbow.ranged!.projectileSpeed / DEFAULT_CELL_SIZE
      );
    });

    it('sizes the unit shape to fit inside a cell of that size', () => {
      const world = new World<Entity>();

      const small = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        DEFAULT_CELL_SIZE
      );
      const large = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        cellSize
      );

      expect(small.renderable?.size).toBe(13);
      expect(large.renderable?.size).toBe(17);
      expect(large.renderable!.size).toBeLessThan(cellSize / 2);
    });
  });
});
