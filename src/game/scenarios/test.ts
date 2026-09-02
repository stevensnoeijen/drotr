import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { Scenario } from './types';

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement,
 * attack-range behaviour and real-time combat independent of any map: one
 * pair placed next to each other so they're immediately within attack range
 * and start trading blows on the spot, the other placed four tiles apart so
 * they have to close the distance under `SeekSystem` first, then stop at
 * range and fight. Either way the health bars drain a swing at a time, one
 * `attackCooldown` apart. Prefixed `test`: it exists to test the engine, not
 * to demonstrate a real gameplay setup.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one within attack range fighting, one four tiles apart not fighting.',
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

    // Out of attack range: four cells apart.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(2, separatedRow),
    });
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(6, separatedRow),
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
  },
};
