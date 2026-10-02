import { World } from 'miniplex';
import { beforeEach, describe, expect, it } from 'vitest';

import { findAttackCell } from '~/game/combat/attack-cell';
import { resetEntityIdCounter, spawnUnit } from '~/game/data/spawn';
import type { UnitType } from '~/game/data/units';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { DEFAULT_FIXED_STEP } from '~/game/game-loop';
import { footprintCentre, footprintGap } from '~/game/navigation/footprint';
import { OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { Vector2 } from '~/lib/math/vector2';
import { createCellOccupancySystem } from './cell-occupancy-system';
import { createCombatSystem, isSettled } from './combat-system';
import { moveSelectedTo } from './input-system';
import { createMovePathSystem } from './move-path-system';
import { createMoveTargetSystem } from './move-target-system';
import { createMoveVelocitySystem } from './move-velocity-system';

/** 20px cells: a 40px-tile county map. */
const CELL = 20;
const DT = DEFAULT_FIXED_STEP;

/** The knight's authored footprint: a 2x2 block of cells. */
const KNIGHT = { width: 2, height: 2 };
/** Every other unit type's footprint: a single cell. */
const ONE_CELL = { width: 1, height: 1 };

/**
 * A knight occupies a 2x2 block of cells and rests on the block's centre —
 * a cell corner, never a cell centre. Covered end to end through the same
 * systems `game-canvas.tsx` wires, on a synthetic open grid rather than a
 * real map: a cross-map A* route can pinch narrower than two cells wide
 * (out of scope — see "Wide units and A*" in MOVEMENT.md), which this test
 * sidesteps by only ever walking the knight a cell or two at a time, the
 * same granularity `CellOccupancySystem`'s leading-edge check works at.
 */
describe('knight 2x2 footprint', () => {
  beforeEach(() => {
    resetEntityIdCounter();
  });

  function setup(width = 12, height = 8, blocked: readonly { x: number; y: number }[] = []) {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const terrain = { width, height, collision: new Uint8Array(width * height) };
    for (const { x, y } of blocked) {
      terrain.collision[y * width + x] = 1;
    }
    const grid = new OccupancyGrid(terrain, CELL);
    const systems = [
      createMovePathSystem(queries),
      createMoveTargetSystem(queries),
      createCellOccupancySystem(queries, grid),
      createMoveVelocitySystem(queries),
    ];
    const tick = () => systems.forEach((system) => system(world, DT));
    /** Spawns a unit whose footprint is anchored (top-left) at cell (col, row). */
    const spawnAt = (type: UnitType, team: 'blue' | 'red', col: number, row: number) => {
      const size = type === 'knight' ? KNIGHT : ONE_CELL;
      return spawnUnit(
        world,
        { type, team, position: footprintCentre(col, row, size, CELL) },
        CELL
      );
    };
    const held = (entity: Entity) =>
      Array.from({ length: width * height }, (_, i) => i)
        .filter((i) => grid.occupantAt(i) === entity.cellOccupancy?.occupantId)
        .map((i) => grid.colRowOf(i));
    return { world, queries, grid, terrain, tick, spawnAt, held };
  }

  it('claims all four cells of its block the first time it is seen', () => {
    const { tick, spawnAt, held } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);

    tick();

    expect(held(knight)).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
  });

  it('rests exactly on the centre of its block — a cell corner, never a cell centre', () => {
    const { tick, spawnAt } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);

    tick();

    expect(knight.transform!.position).toEqual(footprintCentre(2, 2, KNIGHT, CELL));
    // Never `(cell + 0.5) * cellSize`, the 1x1 cell-centre formula.
    expect(knight.transform!.position).not.toEqual({
      x: (2 + 0.5) * CELL,
      y: (2 + 0.5) * CELL,
    });
  });

  it('is refused and holds nothing when one cell of its block is terrain-blocked', () => {
    // Blocks the bottom-right cell of the 2x2 block anchored at (2, 2).
    const { tick, spawnAt, held } = setup(12, 8, [{ x: 3, y: 3 }]);
    const knight = spawnAt('knight', 'blue', 2, 2);

    tick();

    expect(held(knight)).toEqual([]);
  });

  it('is refused and holds nothing when one cell of its block is already held by another unit', () => {
    const { tick, spawnAt, held } = setup();
    // Occupies the bottom-right cell of the 2x2 block the knight will try
    // to claim at (2, 2).
    const blocker = spawnAt('swordsmen', 'red', 3, 3);
    const knight = spawnAt('knight', 'blue', 2, 2);

    tick();

    expect(held(knight)).toEqual([]);
    // The claim is atomic — refused outright, never partial — so the
    // blocker keeps the one cell it actually holds.
    expect(held(blocker)).toEqual([{ x: 3, y: 3 }]);
  });

  it('takes the two leading cells when stepping, and holds exactly its new block on arrival', () => {
    const { world, queries, grid, terrain, tick, spawnAt, held } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);
    knight.selected = true;
    world.reindex(knight);
    tick();

    moveSelectedTo(queries, new Vector2(4 * CELL, 3 * CELL), CELL, terrain, grid);
    tick();
    // Mid-step: its block plus the two cells its leading edge moves into.
    expect(held(knight)).toHaveLength(6);
    expect(held(knight)).toContainEqual({ x: 4, y: 2 });
    expect(held(knight)).toContainEqual({ x: 4, y: 3 });

    for (let i = 0; i < 120 && (knight.moveTarget || knight.movePath); i++) {
      tick();
    }

    // At rest on the centre of its new block — a cell corner — holding
    // those four cells and nothing else.
    expect(knight.transform!.position).toEqual(footprintCentre(3, 2, KNIGHT, CELL));
    expect(isSettled(knight, CELL)).toBe(true);
    expect(held(knight)).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
  });

  it('refuses to step while either leading cell is taken, but not for a unit beside that edge', () => {
    const { tick, spawnAt, held } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);
    // Diagonally ahead, outside the block's rows: no obstacle to stepping right.
    spawnAt('swordsmen', 'red', 4, 4);
    tick();
    knight.moveTarget = { position: footprintCentre(3, 2, KNIGHT, CELL) };
    tick();
    expect(held(knight)).toHaveLength(6);

    const { tick: tick2, spawnAt: spawnAt2, held: held2 } = setup();
    const blocked = spawnAt2('knight', 'blue', 2, 2);
    // In the lower of the two leading cells.
    spawnAt2('swordsmen', 'red', 4, 3);
    tick2();
    const start = { ...blocked.transform!.position };
    blocked.moveTarget = { position: footprintCentre(3, 2, KNIGHT, CELL) };
    for (let i = 0; i < 10; i++) {
      tick2();
    }
    expect(blocked.transform!.position).toEqual(start);
    expect(held2(blocked)).toHaveLength(4);
  });

  it('takes the three new cells of a diagonal step', () => {
    const { tick, spawnAt, held } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);
    tick();

    knight.moveTarget = { position: footprintCentre(3, 3, KNIGHT, CELL) };
    tick();

    expect(held(knight)).toHaveLength(7);
    for (const cell of [
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]) {
      expect(held(knight)).toContainEqual(cell);
    }
  });

  it('releases every cell it held when it dies, even mid-step', () => {
    const { grid, tick, spawnAt } = setup();
    const knight = spawnAt('knight', 'blue', 2, 2);
    tick();
    knight.moveTarget = { position: footprintCentre(3, 3, KNIGHT, CELL) };
    tick();

    knight.health!.current = 0;
    tick();

    const anyHeld = Array.from({ length: grid.width * grid.height }, (_, i) => i).some(
      (i) => grid.occupantAt(i) !== 0
    );
    expect(anyHeld).toBe(false);
  });

  describe('melee against 1x1 units, measured between footprints', () => {
    function duel(attacker: 'knight' | 'swordsmen') {
      const { world, queries, tick, spawnAt } = setup();
      // Swordsman touching the knight's block only at its bottom-right corner.
      const knight = spawnAt('knight', attacker === 'knight' ? 'blue' : 'red', 2, 2);
      const swordsman = spawnAt('swordsmen', attacker === 'knight' ? 'red' : 'blue', 4, 4);
      tick();
      const [self, other] = attacker === 'knight' ? [knight, swordsman] : [swordsman, knight];
      self.target = { entityId: other.id! };
      const combat = createCombatSystem(queries, CELL);
      const before = other.health!.current;
      for (let i = 0; i < 90; i++) {
        combat(world, DT);
      }
      return { before, after: other.health!.current };
    }

    it('lets a knight hit a unit diagonally off a corner of its block', () => {
      const { before, after } = duel('knight');
      expect(after).toBeLessThan(before);
    });

    it("lets a unit diagonally off a corner of the knight's block hit the knight", () => {
      const { before, after } = duel('swordsmen');
      expect(after).toBeLessThan(before);
    });

    it("never picks an attack position overlapping the other's footprint", () => {
      const always = () => true;
      // Knight attacking a 1x1 target at (5, 5).
      const forKnight = findAttackCell({ x: 0, y: 0 }, { x: 5, y: 5 }, 1, always, KNIGHT, ONE_CELL)!;
      expect(footprintGap(forKnight, KNIGHT, { x: 5, y: 5 }, ONE_CELL)).toBe(1);
      // A 1x1 unit attacking a knight anchored at (5, 5), from any side.
      for (const from of [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 6, y: 0 },
      ]) {
        const cell = findAttackCell(from, { x: 5, y: 5 }, 1, always, ONE_CELL, KNIGHT)!;
        expect(footprintGap(cell, ONE_CELL, { x: 5, y: 5 }, KNIGHT)).toBe(1);
      }
      // From straight above-left, the nearest spot is the block's corner diagonal.
      expect(findAttackCell({ x: 0, y: 0 }, { x: 5, y: 5 }, 1, always, ONE_CELL, KNIGHT)).toEqual({
        x: 4,
        y: 4,
      });
    });
  });
});
