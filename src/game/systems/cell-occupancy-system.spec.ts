import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { NO_CELL, NO_OCCUPANT, OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { CELL_SIZE } from '~/lib/grid';
import { BLOCKED_GIVE_UP_SECONDS, createCellOccupancySystem } from './cell-occupancy-system';
import { createMoveVelocitySystem } from './move-velocity-system';

/** A collision grid in the exact shape a loaded map exposes. */
const gridFrom = (art: string) => {
  const rows = art
    .trim()
    .split('\n')
    .map((line) => [...line.trim()]);
  const width = rows[0].length;
  const collision = new Uint8Array(width * rows.length);
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      collision[y * width + x] = cell === '#' ? 1 : 0;
    })
  );

  return { width, height: rows.length, collision };
};

const DT = 0.1;
/** A quarter of a cell per tick, so a crossing takes several ticks to watch. */
const STEP = CELL_SIZE / 4;
const SPEED = STEP / DT;

const OPEN = `
  .....
  .....
  .....
  .....
  .....
`;

function setup(art: string = OPEN) {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const grid = new OccupancyGrid(gridFrom(art));
  const occupancy = createCellOccupancySystem(queries, grid);
  const integrate = createMoveVelocitySystem(queries);

  /**
   * Per-entity velocity, re-applied at the top of every tick. Stands in for
   * `SeekSystem`/`MoveTargetSystem`, which likewise re-derive velocity from
   * the standing order each tick — so a unit the occupancy system stopped
   * tries again next tick rather than staying stopped for good.
   */
  const drives = new Map<Entity, { x: number; y: number }>();

  const addUnit = (col: number, row: number, extra: Partial<Entity> = {}) => {
    const centre = grid.centreOf(grid.indexOf(col, row));
    const entity = world.add({
      transform: { position: { ...centre }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: SPEED },
      ...extra,
    });
    drives.set(entity, { x: 0, y: 0 });
    return entity;
  };

  const drive = (entity: Entity, x: number, y: number) => {
    drives.set(entity, { x, y });
  };

  const tick = () => {
    for (const [entity, velocity] of drives) {
      if (entity.velocity) {
        entity.velocity.x = velocity.x;
        entity.velocity.y = velocity.y;
      }
    }
    occupancy(world, DT);
    integrate(world, DT);
  };

  const cellOf = (entity: Entity) =>
    grid.indexAt(entity.transform!.position);

  return { world, grid, addUnit, drive, tick, cellOf };
}

describe('createCellOccupancySystem', () => {
  describe('claiming the cell a unit stands in', () => {
    it('claims a unit\'s cell the first time it is seen', () => {
      const { grid, addUnit, tick } = setup();
      const unit = addUnit(1, 1);

      tick();

      expect(unit.cellOccupancy?.cell).toBe(grid.indexOf(1, 1));
      expect(unit.cellOccupancy?.reserved).toBe(NO_CELL);
      expect(grid.occupantAt(grid.indexOf(1, 1))).toBe(unit.cellOccupancy?.occupantId);
    });

    it('gives every unit its own occupant id', () => {
      const { addUnit, tick } = setup();
      const a = addUnit(0, 0);
      const b = addUnit(2, 2);

      tick();

      expect(a.cellOccupancy?.occupantId).not.toBe(b.cellOccupancy?.occupantId);
      expect(a.cellOccupancy?.occupantId).not.toBe(NO_OCCUPANT);
    });

    it('re-claims from scratch when a unit is repositioned outside movement', () => {
      const { grid, addUnit, tick } = setup();
      const unit = addUnit(0, 0);
      tick();

      const teleported = grid.centreOf(grid.indexOf(4, 4));
      unit.transform.position.x = teleported.x;
      unit.transform.position.y = teleported.y;
      tick();

      expect(grid.occupantAt(grid.indexOf(0, 0))).toBe(NO_OCCUPANT);
      expect(grid.occupantAt(grid.indexOf(4, 4))).toBe(unit.cellOccupancy?.occupantId);
    });

    it('tracks a unit that spawned on top of another without evicting it', () => {
      const { grid, addUnit, tick } = setup();
      const first = addUnit(2, 2);
      const second = addUnit(2, 2);

      tick();
      tick();

      expect(grid.occupantAt(grid.indexOf(2, 2))).toBe(first.cellOccupancy?.occupantId);
      expect(second.cellOccupancy?.cell).toBe(grid.indexOf(2, 2));
    });
  });

  describe('transit', () => {
    it('reserves and holds both origin and destination while crossing', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup();
      const unit = addUnit(0, 0);
      const origin = grid.indexOf(0, 0);
      const destination = grid.indexOf(1, 0);
      drive(unit, SPEED, 0);

      tick();
      expect(unit.cellOccupancy?.reserved).toBe(NO_CELL);

      // The step after this one crosses into the next cell, so the
      // reservation is taken now — before the move, not after it.
      tick();
      expect(unit.cellOccupancy?.reserved).toBe(destination);
      expect(unit.cellOccupancy?.cell).toBe(origin);
      expect(grid.occupantAt(origin)).toBe(unit.cellOccupancy?.occupantId);
      expect(grid.occupantAt(destination)).toBe(unit.cellOccupancy?.occupantId);
      expect(cellOf(unit)).toBe(destination);
    });

    it('locks both cells against every other unit mid-transit', () => {
      const { grid, addUnit, drive, tick } = setup();
      const mover = addUnit(0, 0);
      drive(mover, SPEED, 0);
      tick();
      tick();

      const id = mover.cellOccupancy!.occupantId;
      expect(grid.isAvailableFor(grid.indexOf(0, 0), id + 1000)).toBe(false);
      expect(grid.isAvailableFor(grid.indexOf(1, 0), id + 1000)).toBe(false);
    });

    it('releases the origin cell on arrival, leaving exactly one cell held', () => {
      const { grid, addUnit, drive, tick } = setup();
      const unit = addUnit(0, 0);
      drive(unit, SPEED, 0);

      for (let i = 0; i < 4; i++) {
        tick();
      }

      expect(grid.occupantAt(grid.indexOf(0, 0))).toBe(NO_OCCUPANT);
      expect(grid.occupantAt(grid.indexOf(1, 0))).toBe(unit.cellOccupancy?.occupantId);
      expect(unit.cellOccupancy?.cell).toBe(grid.indexOf(1, 0));
      expect(unit.cellOccupancy?.reserved).toBe(NO_CELL);
    });

    it('leaves no cell claimed behind a unit that walks the whole map', () => {
      const { grid, addUnit, drive, tick } = setup();
      const unit = addUnit(0, 0);
      drive(unit, SPEED, 0);

      for (let i = 0; i < 16; i++) {
        tick();
      }
      drive(unit, 0, 0);
      tick();

      const id = unit.cellOccupancy!.occupantId;
      const held: number[] = [];
      for (let cell = 0; cell < grid.width * grid.height; cell++) {
        if (grid.occupantAt(cell) === id) {
          held.push(cell);
        }
      }

      expect(held).toEqual([unit.cellOccupancy!.cell]);
    });

    it('hands back a reservation the unit stops short of', () => {
      const { grid, addUnit, drive, tick } = setup();
      const unit = addUnit(0, 0);
      drive(unit, SPEED, 0);
      tick();
      tick();
      // Reserved the cell ahead but not yet standing in it...
      unit.transform.position.x = grid.centreOf(grid.indexOf(0, 0)).x;
      expect(unit.cellOccupancy?.reserved).toBe(grid.indexOf(1, 0));

      drive(unit, 0, 0);
      tick();

      expect(unit.cellOccupancy?.reserved).toBe(NO_CELL);
      expect(grid.occupantAt(grid.indexOf(1, 0))).toBe(NO_OCCUPANT);
    });

    it('hands back the old reservation when a unit is redirected mid-step', () => {
      const { grid, addUnit, drive, tick } = setup();
      const unit = addUnit(1, 1);
      drive(unit, SPEED, 0);
      tick();
      tick();
      expect(unit.cellOccupancy?.reserved).toBe(grid.indexOf(2, 1));

      unit.transform.position.x = grid.centreOf(grid.indexOf(1, 1)).x;
      drive(unit, 0, -SPEED);
      tick();
      expect(grid.occupantAt(grid.indexOf(2, 1))).toBe(NO_OCCUPANT);

      // ...and once it nears the boundary it reserves the cell it is now
      // actually heading into.
      tick();
      tick();

      expect(grid.occupantAt(grid.indexOf(2, 1))).toBe(NO_OCCUPANT);
      expect(unit.cellOccupancy?.reserved).toBe(grid.indexOf(1, 0));
    });
  });

  describe('blocking', () => {
    it('holds a unit at the boundary rather than clipping into an occupied cell', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup();
      const blocker = addUnit(1, 0);
      const mover = addUnit(0, 0);
      drive(mover, SPEED, 0);

      for (let i = 0; i < 10; i++) {
        tick();
        expect(cellOf(mover)).toBe(grid.indexOf(0, 0));
      }

      expect(mover.velocity).toEqual({ x: 0, y: 0 });
      expect(grid.occupantAt(grid.indexOf(1, 0))).toBe(blocker.cellOccupancy?.occupantId);
      expect(mover.cellOccupancy?.reserved).toBe(NO_CELL);
    });

    it('sets off again the moment the cell ahead clears', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup();
      const blocker = addUnit(1, 0);
      const mover = addUnit(0, 0);
      drive(mover, SPEED, 0);

      for (let i = 0; i < 4; i++) {
        tick();
      }
      expect(cellOf(mover)).toBe(grid.indexOf(0, 0));

      // The blocker walks off downward, freeing the cell.
      drive(blocker, 0, SPEED);
      for (let i = 0; i < 12; i++) {
        tick();
      }

      expect(cellOf(mover)).not.toBe(grid.indexOf(0, 0));
      expect(mover.cellOccupancy?.blockedFor).toBe(0);
    });

    it('gives up on an order it has been blocked on for too long', () => {
      const { addUnit, drive, tick } = setup();
      addUnit(1, 0);
      const mover = addUnit(0, 0, {
        moveTarget: { position: { x: CELL_SIZE * 4, y: CELL_SIZE / 2 } },
        movePath: { waypoints: [{ x: CELL_SIZE * 4, y: CELL_SIZE / 2 }], index: 1 },
      });
      drive(mover, SPEED, 0);

      const ticksToGiveUp = Math.ceil(BLOCKED_GIVE_UP_SECONDS / DT);
      for (let i = 0; i < ticksToGiveUp + 2; i++) {
        tick();
      }

      expect(mover.moveTarget).toBeUndefined();
      expect(mover.movePath).toBeUndefined();
      expect(mover.velocity).toEqual({ x: 0, y: 0 });
    });

    it('keeps waiting right up until the give-up threshold', () => {
      const { addUnit, drive, tick } = setup();
      addUnit(1, 0);
      const mover = addUnit(0, 0, {
        moveTarget: { position: { x: CELL_SIZE * 4, y: CELL_SIZE / 2 } },
      });
      drive(mover, SPEED, 0);

      for (let i = 0; i < Math.floor(BLOCKED_GIVE_UP_SECONDS / DT) - 1; i++) {
        tick();
      }

      expect(mover.moveTarget).toBeDefined();
      expect(mover.cellOccupancy?.blockedFor).toBeGreaterThan(0);
    });

    it('lets exactly one of two units racing for the same cell have it', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup();
      const left = addUnit(0, 1);
      const right = addUnit(2, 1);
      drive(left, SPEED, 0);
      drive(right, -SPEED, 0);

      for (let i = 0; i < 8; i++) {
        tick();
      }

      const contested = grid.indexOf(1, 1);
      expect(cellOf(left) === contested).not.toBe(cellOf(right) === contested);
      expect(cellOf(left)).not.toBe(cellOf(right));
    });

    it('never lets any two units share a cell over a long crowded run', () => {
      const { addUnit, drive, tick, cellOf } = setup();
      const units = [
        addUnit(0, 0),
        addUnit(0, 1),
        addUnit(0, 2),
        addUnit(1, 0),
        addUnit(1, 2),
      ];
      // Everyone converges on the middle of the map at once.
      for (const unit of units) {
        drive(unit, SPEED, 0);
      }

      for (let i = 0; i < 60; i++) {
        tick();
        const cells = units.map(cellOf);
        expect(new Set(cells).size).toBe(cells.length);
      }
    });
  });

  describe('terrain', () => {
    const WALLED = `
      .#.
      ...
      ...
    `;

    it('never walks a unit into a terrain-blocked cell, occupied or not', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup(WALLED);
      const wall = grid.indexOf(1, 0);
      const unit = addUnit(0, 0);
      drive(unit, SPEED, 0);

      for (let i = 0; i < 20; i++) {
        tick();
        expect(cellOf(unit)).not.toBe(wall);
      }

      expect(grid.occupantAt(wall)).toBe(NO_OCCUPANT);
      expect(unit.cellOccupancy?.cell).toBe(grid.indexOf(0, 0));
    });

    it('holds a unit inside the map rather than walking it off the edge', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup(WALLED);
      const unit = addUnit(2, 2);
      drive(unit, SPEED, 0);

      for (let i = 0; i < 20; i++) {
        tick();
      }

      expect(cellOf(unit)).toBe(grid.indexOf(2, 2));
    });
  });

  describe('cleanup', () => {
    it('vacates the cells of a unit that died, so no cell stays claimed', () => {
      const { grid, addUnit, drive, tick } = setup();
      const unit = addUnit(0, 0, { health: { current: 10, max: 10 } });
      drive(unit, SPEED, 0);
      tick();
      tick();
      expect(grid.occupantAt(grid.indexOf(0, 0))).not.toBe(NO_OCCUPANT);

      unit.health!.current = 0;
      tick();

      expect(grid.occupantAt(grid.indexOf(0, 0))).toBe(NO_OCCUPANT);
      expect(grid.occupantAt(grid.indexOf(1, 0))).toBe(NO_OCCUPANT);
      expect(unit.cellOccupancy).toBeUndefined();
    });

    it('lets another unit walk over where a corpse lies', () => {
      const { grid, addUnit, drive, tick, cellOf } = setup();
      const corpse = addUnit(1, 0, { health: { current: 10, max: 10 } });
      const mover = addUnit(0, 0);
      tick();
      corpse.health!.current = 0;
      drive(mover, SPEED, 0);

      for (let i = 0; i < 4; i++) {
        tick();
      }

      expect(cellOf(mover)).toBe(grid.indexOf(1, 0));
    });
  });
});
