import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { NO_OCCUPANT, OccupancyGrid } from '~/game/navigation/occupancy-grid';
import { CELL_SIZE } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import { createCellOccupancySystem } from './cell-occupancy-system';
import { moveSelectedTo } from './input-system';
import { createMovePathSystem } from './move-path-system';
import { createMoveTargetSystem } from './move-target-system';
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

const centre = (col: number, row: number) => ({
  x: col * CELL_SIZE + CELL_SIZE / 2,
  y: row * CELL_SIZE + CELL_SIZE / 2,
});

/**
 * Integration coverage for #158: unit-to-unit collision as cell occupancy,
 * driven through the same systems `game-canvas.tsx` wires, in the same order
 * — path, target, **occupancy**, velocity — with move orders issued exactly
 * as a right-click issues them.
 */
describe('cell occupancy + move order integration', () => {
  function setup(art: string) {
    const dt = 1 / 60;
    const world = new World<Entity>();
    const queries = createQueries(world);
    const map = gridFrom(art);
    const occupancy = new OccupancyGrid(map);

    const path = createMovePathSystem(queries);
    const target = createMoveTargetSystem(queries);
    const collide = createCellOccupancySystem(queries, occupancy);
    const move = createMoveVelocitySystem(queries);

    const tick = () => {
      path(world, dt);
      target(world, dt);
      collide(world, dt);
      move(world, dt);
    };

    const addUnit = (col: number, row: number, speedInCells = 4) =>
      world.add({
        transform: { position: { ...centre(col, row) }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: speedInCells * CELL_SIZE },
        team: 'blue' as const,
        selectable: true,
        selected: true,
      });

    const order = (col: number, row: number) => {
      const to = centre(col, row);
      moveSelectedTo(queries, new Vector2(to.x, to.y), map, occupancy);
    };

    const cellOf = (entity: Entity) => occupancy.indexAt(entity.transform!.position);

    // Selection has to go through miniplex's own add/remove: assigning or
    // deleting the property directly leaves the `selected` archetype index
    // stale, exactly as `selectAt` in `input-system` notes.
    const select = (entity: Entity) => world.addComponent(entity, 'selected', true);
    const deselect = (entity: Entity) => world.removeComponent(entity, 'selected');

    return { world, queries, occupancy, map, tick, addUnit, order, cellOf, select, deselect };
  }

  const OPEN = `
    .........
    .........
    .........
    .........
    .........
    .........
  `;

  describe('group orders', () => {
    it('never assigns two units the same destination cell', () => {
      const { tick, addUnit, order, occupancy } = setup(OPEN);
      const units = [addUnit(0, 0), addUnit(0, 1), addUnit(0, 2), addUnit(0, 3)];
      tick();

      order(6, 2);

      const destinations = units.map((unit) => {
        const last = unit.movePath?.waypoints.at(-1) ?? unit.transform.position;
        return occupancy.indexAt(last);
      });

      expect(new Set(destinations).size).toBe(units.length);
    });

    it('walks a group to a click without any two ever sharing a cell', () => {
      const { tick, addUnit, order, cellOf } = setup(OPEN);
      const units = [addUnit(0, 0), addUnit(0, 1), addUnit(0, 2), addUnit(0, 3)];
      tick();

      order(6, 2);

      for (let i = 0; i < 900; i++) {
        tick();
        const cells = units.map(cellOf);
        expect(new Set(cells).size).toBe(cells.length);
      }
    });

    it('arrives staggered by speed, clustered around the click, and not stacked', () => {
      const { tick, addUnit, order, cellOf, occupancy } = setup(OPEN);
      // The milestone's done bar: a mixed-speed group walks to a right-clicked
      // destination and arrives without stacking.
      const units = [addUnit(0, 0, 4), addUnit(0, 1, 2), addUnit(0, 2, 6)];
      tick();

      order(6, 3);

      for (let i = 0; i < 1800; i++) {
        tick();
      }

      const cells = units.map(cellOf);
      expect(new Set(cells).size).toBe(cells.length);

      for (const cell of cells) {
        const col = cell % occupancy.width;
        const row = Math.floor(cell / occupancy.width);
        expect(Math.max(Math.abs(col - 6), Math.abs(row - 3))).toBeLessThanOrEqual(2);
      }

      // Everyone came to rest holding exactly the cell they stand in.
      for (const unit of units) {
        expect(unit.velocity).toEqual({ x: 0, y: 0 });
        expect(unit.cellOccupancy?.cell).toBe(cellOf(unit));
      }
    });

    it('leaves the grid with one claimed cell per unit once everyone stops', () => {
      const { tick, addUnit, order, occupancy } = setup(OPEN);
      const units = [addUnit(0, 0), addUnit(0, 1), addUnit(0, 2)];
      tick();

      order(6, 2);
      for (let i = 0; i < 1800; i++) {
        tick();
      }

      let claimed = 0;
      for (let cell = 0; cell < occupancy.width * occupancy.height; cell++) {
        if (occupancy.occupantAt(cell) !== NO_OCCUPANT) {
          claimed++;
        }
      }

      expect(claimed).toBe(units.length);
    });
  });

  describe('blocked routes', () => {
    const CORRIDOR = `
      #####
      .....
      #####
    `;

    it('holds a unit behind a parked one instead of clipping through it', () => {
      const { tick, addUnit, order, cellOf, occupancy, deselect } = setup(CORRIDOR);
      const parked = addUnit(2, 1);
      const mover = addUnit(0, 1);
      tick();

      // Order only the mover: the parked unit keeps standing where it is.
      deselect(parked);
      order(4, 1);

      for (let i = 0; i < 600; i++) {
        tick();
        expect(cellOf(mover)).not.toBe(cellOf(parked));
      }

      expect(cellOf(mover)).toBe(occupancy.indexOf(1, 1));
      expect(cellOf(parked)).toBe(occupancy.indexOf(2, 1));
    });

    it('gets going again once the unit in the way walks off', () => {
      const { tick, addUnit, order, cellOf, occupancy, select, deselect } = setup(CORRIDOR);
      const blocker = addUnit(2, 1);
      const mover = addUnit(0, 1);
      tick();

      deselect(blocker);
      order(4, 1);
      for (let i = 0; i < 60; i++) {
        tick();
      }
      expect(cellOf(mover)).toBe(occupancy.indexOf(1, 1));

      // Now order the blocker out of the way, and re-order the mover — its own
      // order was abandoned while it waited out the block.
      deselect(mover);
      select(blocker);
      order(4, 1);
      for (let i = 0; i < 300; i++) {
        tick();
      }
      expect(cellOf(blocker)).toBe(occupancy.indexOf(4, 1));

      deselect(blocker);
      select(mover);
      order(3, 1);
      for (let i = 0; i < 600; i++) {
        tick();
      }

      expect(cellOf(mover)).toBe(occupancy.indexOf(3, 1));
    });

    it('never routes a unit onto terrain, occupied or not', () => {
      const { tick, addUnit, order, occupancy } = setup(CORRIDOR);
      const unit = addUnit(0, 1);
      tick();

      order(2, 0);

      for (let i = 0; i < 600; i++) {
        tick();
        expect(occupancy.isTerrainBlocked(occupancy.indexAt(unit.transform.position))).toBe(
          false
        );
      }
    });
  });
});
