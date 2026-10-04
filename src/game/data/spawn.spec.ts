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
  size: { width: 1, height: 1 },
  shape: 'circle',
  health: 12,
};

describe('spawnUnit', () => {
  it('adds a renderable unit to the world, centered in its grid cell', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      // Falls inside the 16px cell spanning [0, 16) x [16, 32), centred on (8, 24).
      position: { x: 10, y: 20 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.transform?.position).toEqual({ x: 8, y: 24 });
    expect(unit.renderable?.shape).toBe('square');
    expect(unit.team).toBe('red');
    expect(unit.unitType).toBe('swordsmen');
    expect(unit.health).toEqual({ current: 15, max: 15 });
    // A 1x1 unit (every unit but the knight) carries no `Footprint`
    // component at all — `footprintOf` resolves the 1x1 default itself.
    expect(unit.footprint).toBeUndefined();
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

  it('keeps a melee unit\'s range of 1 as one adjacent grid cell', () => {
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

  it('converts the unit definition\'s tile-authored aggroRange to grid cells', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    // 5 tiles, at two cells per tile.
    expect(unit.aggroRange).toEqual({ value: 10 });
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
    expect(knight.aggroRange).toEqual({ value: 16 });
    expect(knight.damage).toEqual({ value: 8 });
    expect(knight.attackCooldown).toEqual({ duration: 1 });
    expect(knight.moveSpeed).toBeDefined();
    expect(knight.ranged).toBeUndefined();
    expect([...queries.attackers]).toEqual([knight]);
  });

  it('converts a ranged unit\'s tile-authored range to grid cells', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'crossbowsoldier',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    // 5 tiles, at two cells per tile.
    expect(unit.attackRange).toEqual({ value: 10 });
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

  it('arms a crossbowsoldier with bolts', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'crossbowsoldier',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.ranged?.projectile).toBe('bolt');
  });

  it('gives a crossbowsoldier the release time from its unit data', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'crossbowsoldier',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.ranged?.releaseTime).toBe(units.crossbowsoldier.attackReleaseTime);
  });

  it('arms a catapult with rocks', () => {
    const world = new World<Entity>();

    const unit = spawnUnit(world, {
      type: 'catapult',
      team: 'blue',
      position: { x: 0, y: 0 },
    }, DEFAULT_CELL_SIZE);

    expect(unit.ranged?.projectile).toBe('rock');
  });

  it('refuses to spawn a rock, which only exists once fired, and adds nothing', () => {
    const world = new World<Entity>();

    expect(() =>
      spawnUnit(world, { type: 'rock', team: 'blue', position: { x: 0, y: 0 } }, DEFAULT_CELL_SIZE)
    ).toThrow('Cannot spawn "rock" as a unit: it is a projectile, which only exists once fired');
    expect(world.entities).toHaveLength(0);
  });

  it('refuses to spawn a bolt, which only exists once fired, and adds nothing', () => {
    const world = new World<Entity>();

    expect(() =>
      spawnUnit(world, { type: 'bolt', team: 'blue', position: { x: 0, y: 0 } }, DEFAULT_CELL_SIZE)
    ).toThrow('Cannot spawn "bolt" as a unit: it is a projectile, which only exists once fired');
    expect(world.entities).toHaveLength(0);
  });

  it('is unaffected by later mutation of the caller-supplied position', () => {
    const world = new World<Entity>();
    const position = { x: 1, y: 2 };

    const unit = spawnUnit(world, { type: 'swordsmen', team: 'blue', position }, DEFAULT_CELL_SIZE);
    position.x = 999;

    expect(unit.transform?.position.x).toBe(8);
  });

  describe('on a map whose cells are not the default size', () => {
    // A 40px-tile map places units in half-tile, 20px cells, and sizes and
    // speeds them from its 40px tiles.
    const tileSize = 40;
    const cellSize = tileSize / 2;

    it('snaps to the centre of a cell of that size', () => {
      const world = new World<Entity>();

      const unit = spawnUnit(
        world,
        // Inside the [40, 60) x [20, 40) cell, centred on (50, 30).
        { type: 'swordsmen', team: 'blue', position: { x: 41, y: 39 } },
        cellSize
      );

      expect(unit.transform?.position).toEqual({ x: 50, y: 30 });
    });

    it('converts tile-based movement and projectile speeds to world units at that tile size', () => {
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

      expect(knight.moveSpeed).toEqual({ value: units.knight.movementSpeed! * tileSize });
      expect(crossbow.ranged!.projectileSpeed / cellSize).toBe(
        defaultCrossbow.ranged!.projectileSpeed / DEFAULT_CELL_SIZE
      );
    });

    it.each([
      ['swordsmen', 20],
      ['crossbowsoldier', 20],
      ['knight', 40],
    ] as const)('sizes a %s from its unit-type size in tiles: %ipx across', (type, pixels) => {
      const world = new World<Entity>();

      const unit = spawnUnit(world, { type, team: 'blue', position: { x: 0, y: 0 } }, cellSize);

      // Overlays span the full unit-type box; the shape sits inside it with
      // a small margin so neighbours stay distinct.
      expect(unit.renderable!.extent).toBe(pixels / 2);
      expect(unit.renderable!.size).toBeLessThan(pixels / 2);
      expect(unit.renderable!.size).toBeGreaterThan(pixels / 2 - 4);
    });

    it('scales unit sizes with the tile size, on a 32px-tile map as on a 40px one', () => {
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

      expect(small.renderable!.extent).toBe(16);
      expect(large.renderable!.extent).toBe(20);
      expect(large.renderable!.size - small.renderable!.size).toBe(4);
    });

    it('draws a knight two cells wide, matching the 2x2 block of cells it occupies', () => {
      const world = new World<Entity>();

      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        cellSize
      );

      expect(knight.renderable!.extent! * 2).toBe(2 * cellSize);
      expect(knight.footprint).toEqual({ width: 2, height: 2 });
    });
  });

  describe('for a knight, which occupies a 2x2 block of cells', () => {
    it('gets a 2x2 footprint component', () => {
      const world = new World<Entity>();

      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 0, y: 0 } },
        20
      );

      expect(knight.footprint).toEqual({ width: 2, height: 2 });
    });

    it('rests on the centre of its block — a cell corner, not a cell centre', () => {
      const world = new World<Entity>();
      // (41, 39) is nearest the corner shared by cells (1..2, 1..2) on a
      // 20px grid: the knight's block covers those four.
      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 41, y: 39 } },
        20
      );

      expect(knight.transform?.position).toEqual({ x: 40, y: 40 });
    });

    it('covers a whole 40px tile when spawned at the tile centre', () => {
      const world = new World<Entity>();
      const knight = spawnUnit(
        world,
        { type: 'knight', team: 'blue', position: { x: 60, y: 20 } },
        20
      );

      expect(knight.transform?.position).toEqual({ x: 60, y: 20 });
    });
  });

  describe('for a 1x1 unit', () => {
    it('gets no footprint component at all', () => {
      const world = new World<Entity>();

      const swordsmen = spawnUnit(
        world,
        { type: 'swordsmen', team: 'blue', position: { x: 0, y: 0 } },
        DEFAULT_CELL_SIZE
      );

      expect(swordsmen.footprint).toBeUndefined();
    });
  });
});
