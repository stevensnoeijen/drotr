import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement,
 * attack-range behaviour and real-time combat independent of any map: one
 * pair placed next to each other so they're immediately within attack range
 * and start trading blows on the spot, the other placed five tiles apart so
 * they have to close the distance under `SeekSystem` first, then stop at
 * range and fight. Either way the health bars drain a swing at a time, one
 * `attackCooldown` apart. Prefixed `test`: it exists to test the engine, not
 * to demonstrate a real gameplay setup.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one within attack range fighting, one five tiles apart not fighting.',
  setup: (world) => {
    const adjacentRow = 2;
    const separatedRow = 9;

    // Within attack range: one cell apart.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(2, adjacentRow),
    });
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(3, adjacentRow),
    });

    // Out of attack range: five cells apart. An odd column gap (rather than
    // four) keeps their eventual meeting point off any shared grid line —
    // closing symmetrically at equal speed over an even gap lands the
    // resting boundary exactly on a cell edge, which floating-point noise
    // then resolves to one cell or its neighbour unpredictably from run to
    // run. Nothing to do with collision correctness (cell-occupancy never
    // lets them share a cell either way), but it made this scenario's own
    // resting cell flicker for no reason.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(2, separatedRow),
    });
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(7, separatedRow),
    });

    // Just below (south of) the maze block, lined up with its bottom exit
    // (cols 44-46), for exercising click-to-move into and through the maze
    // corridors. CELL_SIZE matches the map's tile size, so cellPosition's
    // col/row lines up directly with the map's own tile grid.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(45, 50),
    });

    // Knight vs. swordsman, each on its own row, ordered the same distance
    // in parallel: exercises per-unit-type MoveSpeed (#90) — the knight's
    // higher movementSpeed makes it visibly pull ahead. Each targets a
    // point on its own row (not a shared point) so the two straight-line
    // paths run side by side instead of converging onto one destination,
    // where the trailing unit would otherwise look like it's following the
    // leader in single file. Run in the open area above the maze block
    // (which starts at col 16, row 16), so the straight-line paths don't
    // clip its walls.
    const knightRow = 5;
    const swordsmanRow = 6;
    const raceStartCol = 2;
    const raceDistanceCols = 10;

    const knight = spawnUnit(world, {
      type: 'knight',
      team: 'blue',
      position: cellPosition(raceStartCol, knightRow),
    });
    knight.moveTarget = { position: cellPosition(raceStartCol + raceDistanceCols, knightRow) };

    const swordsman = spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(raceStartCol, swordsmanRow),
    });
    swordsman.moveTarget = {
      position: cellPosition(raceStartCol + raceDistanceCols, swordsmanRow),
    };
  },
};
